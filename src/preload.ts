import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./electron-contract";
import type { CopilotConfig, ElectronAPI } from "./electron-contract";

const electronAPI: ElectronAPI = {
  // Attempt to spawn and connect to a new local background copilot cli session (requires pre auth).
  newCopilotConnection: () => ipcRenderer.invoke(IPC_CHANNELS.newCopilotConnection),
  // Run the current prompt over all configurations.
  run: (prompt: string, config: CopilotConfig) => ipcRenderer.invoke(IPC_CHANNELS.run, prompt, config),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
