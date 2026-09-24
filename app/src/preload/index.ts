import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onOpenShortcuts: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('open-shortcuts', handler)
    return () => {
      ipcRenderer.removeListener('open-shortcuts', handler)
    }
  },
  onNavigateTo: (callback: (route: string) => void) => {
    const handler = (_: unknown, route: string) => callback(route)
    ipcRenderer.on('navigate-to', handler)
    return () => {
      ipcRenderer.removeListener('navigate-to', handler)
    }
  },
  onMenuAction: (callback: (action: string, payload?: any) => void) => {
    const handler = (_: unknown, action: string, payload?: any) => callback(action, payload)
    ipcRenderer.on('menu-action', handler)
    return () => {
      ipcRenderer.removeListener('menu-action', handler)
    }
  },
  updateMenuState: (state: Record<string, any>) => {
    ipcRenderer.send('update-menu-state', state)
  },
  getApiSecret: () => ipcRenderer.invoke('get-api-secret'),
  platform: process.platform
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electronAPI = electronAPI
}
