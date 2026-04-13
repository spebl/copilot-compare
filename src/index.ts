import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { app, BrowserWindow, dialog, ipcMain } from "electron"
import type { CopilotClient, SessionConfig } from "@github/copilot-sdk";

import {
  SYSTEM_PROMPT_SECTION_IDS,
  type CopilotConfig,
  type CopilotResources,
  IPC_CHANNELS,
  type JsonValue,
  type LastRun,
  type ModelSpec,
  type ReasoningEffort,
  type RunReport,
  type SystemPromptSections,
  type ToolCallResponse,
  type ToolReport,
  type ToolSpec,
} from "./electron-contract";
import type { ConfigurationLastRun } from "./prompt-runs";
import { get_runs_directory, read_run_report, write_run_report } from "./run-storage";
import { open_json_file, read_json_file, save_json_file } from "./json-file-dialogs";
import {
  CONFIGURATION_GROUP_FILE_NAME,
  create_configuration_group_file,
  create_prompt_list_file,
  ensure_configuration_groups_directory,
  ensure_prompt_lists_directory,
  get_prompt_lists_directory,
  parse_configuration_group_file,
  parse_prompt_list_file,
  PROMPT_LIST_FILE_NAME,
} from "./saved-data";
import { normalize_mcp_servers_for_session, parse_mcp_servers_file } from "./mcp-server-config";

type ToolStart = {
  tool_name: string;
  start_time: number;
  parameters: JsonValue | undefined;
}

const preload_path = path.join(__dirname, "../preload/index.js");
const renderer_index_path = path.join(__dirname, "../renderer/index.html");

function load_main_window(win: BrowserWindow, query?: Record<string, string>) {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const window_url = new URL(process.env.ELECTRON_RENDERER_URL);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        window_url.searchParams.set(key, value);
      }
    }

    return win.loadURL(window_url.toString());
  }

  return win.loadFile(renderer_index_path, query ? { query } : undefined);
}

function to_json_value(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalized_item = to_json_value(item);
      return normalized_item === undefined ? [] : [normalized_item];
    });
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nested_value]) => {
        const normalized_value = to_json_value(nested_value);
        return normalized_value === undefined ? [] : [[key, normalized_value] as const];
      })
    );
  }

  return String(value);
}

function normalize_system_prompt_sections(prompt_sections: SystemPromptSections | undefined) {
  if (!prompt_sections) {
    return undefined;
  }

  const normalized_prompt_sections: NonNullable<SystemPromptSections> = {};

  for (const section_id of SYSTEM_PROMPT_SECTION_IDS) {
    const prompt_section = prompt_sections[section_id];
    if (!prompt_section) {
      continue;
    }

    if (prompt_section.action === "remove") {
      normalized_prompt_sections[section_id] = { action: "remove" };
      continue;
    }

    if (prompt_section.action === "replace") {
      normalized_prompt_sections[section_id] = { action: "replace", content: prompt_section.content ?? "" };
      continue;
    }

    if (typeof prompt_section.content !== "string" || prompt_section.content.trim().length === 0) {
      continue;
    }

    normalized_prompt_sections[section_id] = { action: prompt_section.action, content: prompt_section.content };
  }

  return Object.keys(normalized_prompt_sections).length > 0 ? normalized_prompt_sections : undefined;
}

function create_system_message(config: CopilotConfig): SessionConfig["systemMessage"] | undefined {
  const prompt_sections = normalize_system_prompt_sections(config.prompt_sections);
  const prompt_mode = config.prompt_mode ?? (prompt_sections ? "customize" : config.overwrite_default_prompt ? "replace" : "append");
  const custom_prompt = typeof config.custom_prompt === "string" && config.custom_prompt.trim().length > 0
    ? config.custom_prompt
    : undefined;

  if (prompt_mode === "customize") {
    return prompt_sections ? { mode: "customize", sections: prompt_sections } : undefined;
  }

  if (!custom_prompt) {
    return undefined;
  }

  return prompt_mode === "replace"
    ? { mode: "replace", content: custom_prompt }
    : { mode: "append", content: custom_prompt };
}

function get_copilot_cli_command() {
  const cli_loader_path = path.join(app.getAppPath(), "node_modules", "@github", "copilot", "npm-loader.js");
  if (!existsSync(cli_loader_path)) {
    throw new Error(
      "GitHub Copilot CLI is not installed where this app expects it. Run 'npm install' so @github/copilot is available before creating a connection.",
    );
  }

  return {
    cliPath: process.env.npm_node_execpath ?? process.env.NODE ?? "node",
    cliArgs: [cli_loader_path],
  };
}

async function ensure_copilot_authenticated(client: CopilotClient) {
  const auth_status = await client.getAuthStatus();
  if (auth_status.isAuthenticated) {
    return;
  }

  const details = auth_status.statusMessage ? ` ${auth_status.statusMessage}.` : "";
  throw new Error(
    `Copilot CLI is not authenticated.${details} Run 'copilot login' in a terminal, or set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN before connecting.`,
  );
}

const create_window = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1200,
    height: 1000,
    webPreferences: {
      preload: preload_path,
    },
  });

  void load_main_window(win);
  
  return win;
}

app.whenReady().then(async () => {
  const load_copilot_sdk = () => import(/* webpackIgnore: true */ "@github/copilot-sdk");
  const { CopilotClient, approveAll: approve_all } = await load_copilot_sdk();
  let copilot_client: CopilotClient | null = null;
  let copilot_resources: CopilotResources | null = null;
  const last_run_window_data = new Map<string, ConfigurationLastRun>();

  const create_last_run_window = (parent_window: BrowserWindow | null, window_id: string): BrowserWindow => {
    const window_options = {
      width: 1040,
      height: 860,
      minWidth: 760,
      minHeight: 600,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preload_path,
      },
    };

    const win = new BrowserWindow(
      parent_window ? { ...window_options, parent: parent_window } : window_options
    );

    void load_main_window(win, { view: "last-run", windowId: window_id });
    win.on("closed", () => {
      last_run_window_data.delete(window_id);
    });

    return win;
  };

  const load_copilot_resources = async (client: CopilotClient): Promise<CopilotResources> => {
    const tools: ToolSpec[] = (await client.rpc.tools.list({})).tools;
    const models = await client.listModels();
    const model_specs = models.map((model_info): ModelSpec => {
      return {
        id: model_info.id,
        billing_mul: model_info.billing?.multiplier,
        supported_reasoning_efforts: model_info.supportedReasoningEfforts?.map((reasoning_effort) => reasoning_effort.toString() as ReasoningEffort),
        default_reasoning_effort: model_info.defaultReasoningEffort?.toString() as ReasoningEffort | undefined,
      };
    });

    return { models: model_specs, tools };
  };

  app.on("before-quit", () => {
    void copilot_client?.stop();
    copilot_client = null;
    copilot_resources = null;
  });

  ipcMain.handle(IPC_CHANNELS.new_copilot_connection, async (): Promise<CopilotResources> => {
    if (copilot_client) {
      copilot_resources ??= await load_copilot_resources(copilot_client);
      return copilot_resources;
    }

    // In Electron, process.execPath points at Electron itself. Launch the published CLI loader via Node instead.
    const cli_command = get_copilot_cli_command();
    const client = new CopilotClient(cli_command);
    try {
      await client.start();
      await ensure_copilot_authenticated(client);
      const resources = await load_copilot_resources(client);
      copilot_client = client;
      copilot_resources = resources;
      return resources;
    } catch (error) {
      await client.stop();
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.save_configuration_group, async (event, configurations: CopilotConfig[]): Promise<string | null> => {
    const configuration_groups_directory = await ensure_configuration_groups_directory(app.getPath("userData"));

    return save_json_file(event, {
      title: "Save Copilot Configuration Group",
      default_path: path.join(configuration_groups_directory, CONFIGURATION_GROUP_FILE_NAME),
      value: create_configuration_group_file(configurations),
    });
  });

  ipcMain.handle(IPC_CHANNELS.load_configuration_group, async (event): Promise<CopilotConfig[] | null> => {
    const configuration_groups_directory = await ensure_configuration_groups_directory(app.getPath("userData"));
    return open_json_file(event, {
      title: "Load Copilot Configuration Group",
      default_path: configuration_groups_directory,
      load_file: (file_path) => read_json_file(file_path, parse_configuration_group_file),
      error_label: "load configuration group",
    });
  });

  ipcMain.handle(IPC_CHANNELS.load_mcp_servers, async (event) => {
    return open_json_file(event, {
      title: "Load MCP Server Configuration",
      default_path: path.join(app.getPath("home"), ".copilot", "mcp-config.json"),
      load_file: (file_path) => read_json_file(file_path, parse_mcp_servers_file),
      error_label: "load MCP server configuration",
    });
  });

  ipcMain.handle(IPC_CHANNELS.save_prompt_list, async (event, prompts: string[]): Promise<string | null> => {
    if (!Array.isArray(prompts)) {
      throw new Error("Prompt list must be an array.");
    }

    const prompt_lists_directory = await ensure_prompt_lists_directory(app.getPath("userData"));

    return save_json_file(event, {
      title: "Save Prompt List",
      default_path: path.join(prompt_lists_directory, PROMPT_LIST_FILE_NAME),
      value: create_prompt_list_file(prompts),
    });
  });

  ipcMain.handle(IPC_CHANNELS.load_prompt_list, async (event): Promise<string[] | null> => {
    const prompt_lists_directory = await ensure_prompt_lists_directory(app.getPath("userData"));
    return open_json_file(event, {
      title: "Load Prompt List",
      default_path: prompt_lists_directory,
      load_file: (file_path) => read_json_file(file_path, parse_prompt_list_file),
      error_label: "load prompt list",
    });
  });

  ipcMain.handle(IPC_CHANNELS.open_run_report, async (event) => {
    const runs_directory = get_runs_directory(app.getPath("userData"));
    await fs.mkdir(runs_directory, { recursive: true });
    return open_json_file(event, {
      title: "Open Run Report",
      default_path: runs_directory,
      load_file: read_run_report,
      error_label: "open run report",
    });
  });

  ipcMain.handle(IPC_CHANNELS.open_last_run_window, async (event, last_run: ConfigurationLastRun): Promise<void> => {
    if (!last_run || !Array.isArray(last_run.prompt_runs)) {
      throw new Error("Run details are required to open the detached log window.");
    }

    const window_id = crypto.randomUUID();
    last_run_window_data.set(window_id, last_run);

    const parent_window = BrowserWindow.fromWebContents(event.sender);
    create_last_run_window(parent_window, window_id);
  });

  ipcMain.handle(IPC_CHANNELS.get_last_run_window_data, async (_event, window_id: string): Promise<ConfigurationLastRun | null> => {
    if (typeof window_id !== "string" || window_id.length === 0) {
      return null;
    }

    return last_run_window_data.get(window_id) ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.run, async (_event, prompt: string, config: CopilotConfig): Promise<LastRun> => {
    if (!copilot_client) {
      throw new Error("Create a Copilot connection before running a comparison.");
    }

    const run_id = crypto.randomUUID();
    const start_time = Date.now();
    const tool_calls: Map<string, ToolStart> = new Map();
    const tool_reports: ToolReport[] = [];
    const session_config: SessionConfig = { onPermissionRequest: approve_all, model: config.model_id };
    const config_dir = typeof config.config_dir === "string" && config.config_dir.trim().length > 0
      ? config.config_dir.trim()
      : undefined;
    const working_directory = typeof config.working_directory === "string" && config.working_directory.trim().length > 0
      ? config.working_directory.trim()
      : undefined;
    const skill_directories = Array.isArray(config.skill_directories)
      ? Array.from(new Set(config.skill_directories.map((directory) => directory.trim()).filter((directory) => directory.length > 0)))
      : undefined;
    const mcp_servers = normalize_mcp_servers_for_session(config.mcp_servers);
    session_config.availableTools = Array.from(new Set(config.tool_names));
    if (config.reasoning_effort) {
      session_config.reasoningEffort = config.reasoning_effort as ReasoningEffort;
    }
    const system_message = create_system_message(config);
    if (system_message) {
      session_config.systemMessage = system_message;
    }
    if (mcp_servers) {
      session_config.mcpServers = mcp_servers;
    }
    if (config_dir) {
      session_config.configDir = config_dir;
    }
    if (working_directory) {
      session_config.workingDirectory = working_directory;
    }
    if (skill_directories && skill_directories.length > 0) {
      session_config.skillDirectories = skill_directories;
    }

    const session = await copilot_client.createSession(session_config);
    if (session === undefined) {
      throw new Error("Copilot did not create a session for this run.");
    }
    session.on("tool.execution_start", (toolEvent) => {
      const tool_start: ToolStart = {
        tool_name: toolEvent.data.toolName,
        start_time: Date.now(),
        parameters: to_json_value(toolEvent.data.arguments),
      };
      tool_calls.set(toolEvent.data.toolCallId, tool_start);
    });
    session.on("tool.execution_complete", (toolEvent) => {
      const tool_start: ToolStart | undefined = tool_calls.get(toolEvent.data.toolCallId);
      if (tool_start === undefined) return; 

      tool_calls.delete(toolEvent.data.toolCallId);

      const response: ToolCallResponse = {
        success: toolEvent.data.success,
      };

      const result = to_json_value(toolEvent.data.result);
      if (result !== undefined) {
        response.result = result;
      }

      if (toolEvent.data.error) {
        response.error = {
          message: toolEvent.data.error.message,
          code: toolEvent.data.error.code,
        };
      }

      tool_reports.push({
        tool_call_id: toolEvent.data.toolCallId,
        tool_name: tool_start.tool_name,
        start_time: tool_start.start_time,
        end_time: Date.now(),
        parameters: tool_start.parameters,
        response,
      });
    });
    session.on("session.error", (sessionEvent) => {
      console.error(`Session Error: ${sessionEvent.data.message}`);
    });
    try {
      const response = await session.sendAndWait({ prompt: prompt }, 1200000);
      const response_content = response?.data.content.trim() || "";
      const tokens_used = response?.data.outputTokens || 0;
      const run_report: RunReport = { id: run_id, prompt: prompt, config: config, response: response_content, tool_calls: tool_reports, tokens_used: tokens_used, start_time: start_time, end_time: Date.now() };

      await write_run_report(app.getPath("userData"), run_report);

      const last_run: LastRun = {tool_calls: tool_reports, response: response_content, tokens_used: tokens_used, duration: Date.now() - start_time};
      return last_run;
    } finally {
      session.disconnect()
    }
  });

  create_window();
}).catch((error) => {
  const message = error instanceof Error ? error.message : "Unexpected startup error.";
  console.error("Failed to initialize copilot-compare", error);
  dialog.showErrorBox("copilot-compare failed to start", message);
  app.quit();
})
