import type { ConfigurationLastRun } from './prompt-runs';

export const IPC_CHANNELS = {
  new_copilot_connection: "new-copilot-connection",
  run: "run",
  save_configuration_group: "save-configuration-group",
  load_configuration_group: "load-configuration-group",
  load_mcp_servers: "load-mcp-servers",
  save_prompt_list: "save-prompt-list",
  load_prompt_list: "load-prompt-list",
  open_run_report: "open-run-report",
  open_last_run_window: "open-last-run-window",
  get_last_run_window_data: "get-last-run-window-data",
} as const;

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export type McpServerConfigBase = {
  tools?: string[];
  timeout?: number;
};

export type McpLocalServerConfig = McpServerConfigBase & {
  type?: "local" | "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
};

export type McpRemoteServerConfig = McpServerConfigBase & {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
};

export type McpServerConfig = McpLocalServerConfig | McpRemoteServerConfig;
export type McpServers = Record<string, McpServerConfig>;

export type CopilotConfig = {
  id: string;
  model_id: string;
  reasoning_effort?: ReasoningEffort | undefined;
  tool_names: string[];
  overwrite_default_prompt: boolean;
  custom_prompt?: string | undefined;
  config_dir?: string | undefined;
  working_directory?: string | undefined;
  skill_directories?: string[] | undefined;
  mcp_servers?: McpServers | undefined;
};

export type ModelSpec = {
  id: string;
  billing_mul?: number | undefined;
  supported_reasoning_efforts?: ReasoningEffort[] | undefined;
  default_reasoning_effort?: ReasoningEffort | undefined;
};

export type ToolSpec = {
  name: string;
  namespacedName?: string;
  description: string;
  parameters?: {
    [k: string]: unknown;
  };
  instructions?: string;
};

export type CopilotResources = {
  models: ModelSpec[];
  tools: ToolSpec[];
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type ToolCallResponse = {
  success: boolean;
  result?: JsonValue | undefined;
  error?: {
    message: string;
    code?: string | undefined;
  } | undefined;
};

export type ToolReport = {
  tool_call_id: string;
  tool_name: string;
  start_time: number;
  end_time: number;
  parameters?: JsonValue | undefined;
  response?: ToolCallResponse | undefined;
};

export type RunReport = {
  id: string;
  prompt?: string | undefined;
  config: CopilotConfig;
  tool_calls: ToolReport[];
  response: string;
  tokens_used: number;
  start_time: number;
  end_time: number;
};

export type LastRun = {
  tool_calls: ToolReport[];
  response: string;
  tokens_used: number;
  duration: number;
};

export interface ElectronAPI {
  new_copilot_connection: () => Promise<CopilotResources>;
  run: (prompt: string, config: CopilotConfig) => Promise<LastRun>;
  save_configuration_group: (configurations: CopilotConfig[]) => Promise<string | null>;
  load_configuration_group: () => Promise<CopilotConfig[] | null>;
  load_mcp_servers: () => Promise<McpServers | null>;
  save_prompt_list: (prompts: string[]) => Promise<string | null>;
  load_prompt_list: () => Promise<string[] | null>;
  open_run_report: () => Promise<RunReport | null>;
  open_last_run_window: (last_run: ConfigurationLastRun) => Promise<void>;
  get_last_run_window_data: (window_id: string) => Promise<ConfigurationLastRun | null>;
}