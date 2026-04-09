import type { ToolReport } from './electron-contract';

export type PromptRunSummary = {
  prompt: string;
  response: string;
  tokens_used: number;
  duration: number;
  tool_calls: ToolReport[];
};

export type ConfigurationLastRun = {
  prompt_runs: PromptRunSummary[];
  tokens_used: number;
  duration: number;
  tool_calls: ToolReport[];
};