import path from "node:path";
import { existsSync } from "node:fs";
import { app, BrowserWindow, ipcMain } from "electron"
import type { CopilotClient, SessionConfig } from "@github/copilot-sdk";

import {
  type CopilotConfig,
  type CopilotResources,
  IPC_CHANNELS,
  type LastRun,
  type ModelSpec,
  type ReasoningEffort,
  type RunReport,
  type ToolReport,
  type ToolSpec,
} from "./electron-contract";
import { writeRunReport } from "./run-storage";

type ToolStart = {
  tool_name: string;
  start_time: number;
}

function getCopilotCliCommand() {
  const cliLoaderPath = path.join(app.getAppPath(), "node_modules", "@github", "copilot", "npm-loader.js");
  if (!existsSync(cliLoaderPath)) {
    throw new Error(
      "GitHub Copilot CLI is not installed where this app expects it. Run 'npm install' so @github/copilot is available before creating a connection.",
    );
  }

  return {
    cliPath: process.env.npm_node_execpath ?? process.env.NODE ?? "node",
    cliArgs: [cliLoaderPath],
  };
}

async function ensureCopilotAuthenticated(client: CopilotClient) {
  const authStatus = await client.getAuthStatus();
  if (authStatus.isAuthenticated) {
    return;
  }

  const details = authStatus.statusMessage ? ` ${authStatus.statusMessage}.` : "";
  throw new Error(
    `Copilot CLI is not authenticated.${details} Run 'copilot login' in a terminal, or set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN before connecting.`,
  );
}

const createWindow = (): BrowserWindow => {
  const indexHtmlPath = path.join(__dirname, "index.html");
  const win = new BrowserWindow({
    width: 900,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(indexHtmlPath);
  
  return win;
}

app.whenReady().then(async () => {
  createWindow();
  const loadCopilotSdk = () => import(/* webpackIgnore: true */ "@github/copilot-sdk");
  const { CopilotClient, approveAll } = await loadCopilotSdk();
  let copilotClient: CopilotClient | null = null;
  let copilotResources: CopilotResources | null = null;

  const loadCopilotResources = async (client: CopilotClient): Promise<CopilotResources> => {
    const tools: ToolSpec[] = (await client.rpc.tools.list({})).tools;
    const models = await client.listModels();
    const modelSpecs = models.map((modelInfo): ModelSpec => {
      return {
        id: modelInfo.id,
        billingMul: modelInfo.billing?.multiplier,
        supportedReasoningEfforts: modelInfo.supportedReasoningEfforts?.map((reasoningEffort) => reasoningEffort.toString() as ReasoningEffort),
        defaultReasoningEffort: modelInfo.defaultReasoningEffort?.toString() as ReasoningEffort | undefined,
      };
    });

    return { models: modelSpecs, tools };
  };

  app.on("before-quit", () => {
    void copilotClient?.stop();
    copilotClient = null;
    copilotResources = null;
  });

  ipcMain.handle(IPC_CHANNELS.newCopilotConnection, async (): Promise<CopilotResources> => {
    if (copilotClient) {
      copilotResources ??= await loadCopilotResources(copilotClient);
      return copilotResources;
    }

    // In Electron, process.execPath points at Electron itself. Launch the published CLI loader via Node instead.
    const cliCommand = getCopilotCliCommand();
    const client = new CopilotClient(cliCommand);
    try {
      await client.start();
      await ensureCopilotAuthenticated(client);
      const resources = await loadCopilotResources(client);
      copilotClient = client;
      copilotResources = resources;
      return resources;
    } catch (error) {
      await client.stop();
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.run, async (_event, prompt: string, config: CopilotConfig): Promise<LastRun> => {
    if (!copilotClient) {
      throw new Error("Create a Copilot connection before running a comparison.");
    }

    const run_id = crypto.randomUUID();
    const start_time = Date.now();
    const tool_calls: Map<string, ToolStart> = new Map();
    const tool_reports: ToolReport[] = [];
    const session_config: SessionConfig = { onPermissionRequest: approveAll, model: config.model_id };
    if (config.reasoning_effort) {
      session_config.reasoningEffort = config.reasoning_effort as ReasoningEffort;
    }
    if (config.tool_names.length > 0) {
      session_config.availableTools = config.tool_names;
    }

    const session = await copilotClient.createSession(session_config);
    if (session === undefined) {
      throw new Error("Copilot did not create a session for this run.");
    }
    session.on("tool.execution_start", async (toolEvent) => {
      // TODO: Check if there's anything else interesting in these tool events we might want to track
      const tool_start: ToolStart = { tool_name: toolEvent.data.toolName, start_time: Date.now() };
      tool_calls.set(toolEvent.data.toolCallId, tool_start);
    });
    session.on("tool.execution_complete", (toolEvent) => {
      const tool_start: ToolStart | undefined = tool_calls.get(toolEvent.data.toolCallId);
      if (tool_start === undefined) return; 
      tool_reports.push({tool_call_id: toolEvent.data.toolCallId, tool_name: tool_start.tool_name, start_time: tool_start.start_time, end_time: Date.now()});
    });
    session.on("session.error", (sessionEvent) => {
      console.error(`Session Error: ${sessionEvent.data.message}`);
    });
    try {
      const response = await session.sendAndWait({ prompt: prompt }, 1200000);
      const response_content = response?.data.content.trim() || "";
      const tokens_used = response?.data.outputTokens || 0;
      const run_report: RunReport = { id: run_id, config: config, response: response_content, tool_calls: tool_reports, tokens_used: tokens_used, start_time: start_time, end_time: Date.now() };

      await writeRunReport(app.getPath("userData"), run_report);

      const last_run: LastRun = {tool_calls: tool_reports, response: response_content, tokens_used: tokens_used, duration: Date.now() - start_time};
      return last_run;
    } finally {
      session.disconnect()
    }
  });
})
