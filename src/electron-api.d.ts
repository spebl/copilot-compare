import type { ElectronAPI } from './electron-contract';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};