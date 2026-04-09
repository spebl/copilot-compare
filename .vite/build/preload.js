"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  new_copilot_connection: "new-copilot-connection",
  run: "run",
  save_configuration_group: "save-configuration-group",
  load_configuration_group: "load-configuration-group",
  load_mcp_servers: "load-mcp-servers",
  save_prompt_list: "save-prompt-list",
  load_prompt_list: "load-prompt-list",
  open_run_report: "open-run-report",
  open_last_run_window: "open-last-run-window",
  get_last_run_window_data: "get-last-run-window-data"
};
const electronAPI = {
  // Attempt to spawn and connect to a new local background copilot cli session (requires pre auth).
  new_copilot_connection: () => electron.ipcRenderer.invoke(IPC_CHANNELS.new_copilot_connection),
  // Run the current prompt over all configurations.
  run: (prompt, config) => electron.ipcRenderer.invoke(IPC_CHANNELS.run, prompt, config),
  save_configuration_group: (configurations) => electron.ipcRenderer.invoke(IPC_CHANNELS.save_configuration_group, configurations),
  load_configuration_group: () => electron.ipcRenderer.invoke(IPC_CHANNELS.load_configuration_group),
  load_mcp_servers: () => electron.ipcRenderer.invoke(IPC_CHANNELS.load_mcp_servers),
  save_prompt_list: (prompts) => electron.ipcRenderer.invoke(IPC_CHANNELS.save_prompt_list, prompts),
  load_prompt_list: () => electron.ipcRenderer.invoke(IPC_CHANNELS.load_prompt_list),
  open_run_report: () => electron.ipcRenderer.invoke(IPC_CHANNELS.open_run_report),
  open_last_run_window: (last_run) => electron.ipcRenderer.invoke(IPC_CHANNELS.open_last_run_window, last_run),
  get_last_run_window_data: (window_id) => electron.ipcRenderer.invoke(IPC_CHANNELS.get_last_run_window_data, window_id)
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
//# sourceMappingURL=preload.js.map
