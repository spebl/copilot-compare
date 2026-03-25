export const IPC_CHANNELS = {
  newCopilotConnection: "new-copilot-connection",
  run: "run",
} as const;

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type CopilotConfig = {
  id: string;
  model_id: string;
  reasoning_effort?: ReasoningEffort | undefined;
  tool_names: string[];
};

export type ModelSpec = {
  id: string;
  billingMul?: number | undefined;
  supportedReasoningEfforts?: ReasoningEffort[] | undefined;
  defaultReasoningEffort?: ReasoningEffort | undefined;
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

export type ToolReport = {
  tool_call_id: string;
  tool_name: string;
  start_time: number;
  end_time: number;
};

export type RunReport = {
  id: string;
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
  newCopilotConnection: () => Promise<CopilotResources>;
  run: (prompt: string, config: CopilotConfig) => Promise<LastRun>;
}