export interface ElectronAPI {
  openFolderDialog: () => Promise<string | null>;
  showSaveDialog: () => Promise<string | null>;
  getAppVersion: () => Promise<string>;
  onOpenShortcuts?: (callback: () => void) => () => void;
  onNavigateTo?: (callback: (route: string) => void) => () => void;
  onMenuAction?: (callback: (action: string, payload?: any) => void) => () => void;
  updateMenuState?: (state: Record<string, any>) => void;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
