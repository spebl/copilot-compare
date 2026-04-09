import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./electron-contract";
import type { CopilotConfig, ElectronAPI } from "./electron-contract";
import type { ConfigurationLastRun } from "./prompt-runs";

const electronAPI: ElectronAPI = {
  // Attempt to spawn and connect to a new local background copilot cli session (requires pre auth).
  new_copilot_connection: () => ipcRenderer.invoke(IPC_CHANNELS.new_copilot_connection),
  // Run the current prompt over all configurations.
  run: (prompt: string, config: CopilotConfig) => ipcRenderer.invoke(IPC_CHANNELS.run, prompt, config),
  save_configuration_group: (configurations: CopilotConfig[]) => ipcRenderer.invoke(IPC_CHANNELS.save_configuration_group, configurations),
  load_configuration_group: () => ipcRenderer.invoke(IPC_CHANNELS.load_configuration_group),
  load_mcp_servers: () => ipcRenderer.invoke(IPC_CHANNELS.load_mcp_servers),
  save_prompt_list: (prompts: string[]) => ipcRenderer.invoke(IPC_CHANNELS.save_prompt_list, prompts),
  load_prompt_list: () => ipcRenderer.invoke(IPC_CHANNELS.load_prompt_list),
  open_run_report: () => ipcRenderer.invoke(IPC_CHANNELS.open_run_report),
  open_last_run_window: (last_run: ConfigurationLastRun) => ipcRenderer.invoke(IPC_CHANNELS.open_last_run_window, last_run),
  get_last_run_window_data: (window_id: string) => ipcRenderer.invoke(IPC_CHANNELS.get_last_run_window_data, window_id),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
