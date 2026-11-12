/**
 * Native Bridge API for FirstPass
 * 
 * Provides a unified abstraction layer that seamlessly routes calls
 * to either Tauri v2 (via @tauri-apps/api) or Electron (via window.electronAPI),
 * ensuring cross-platform support across macOS, Windows, and Linux with
 * zero regressions.
 */

export interface NativeBridge {
  platform: string
  openFolderDialog: () => Promise<string | null>
  showSaveDialog: () => Promise<string | null>
  getAppVersion: () => Promise<string>
  getApiSecret: () => Promise<string>
  getApiSecretSync: () => string
  showItemInFolder: (path: string) => Promise<boolean>
  getLogPath: () => Promise<string>
  updateMenuState: (state: Record<string, any>) => void
  onOpenShortcuts: (callback: () => void) => () => void
  onNavigateTo: (callback: (route: string) => void) => () => void
  onMenuAction: (callback: (action: string, payload?: any) => void) => () => void
  onFileDrop?: (callback: (paths: string[]) => void) => () => void
}

// Detect if running inside Tauri v2 webview
export const isTauri = typeof window !== 'undefined' && Boolean(
  (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__
)

// In-memory token cache for environments where synchronous access is required
let cachedApiToken: string = ''

export const nativeBridge: NativeBridge = {
  platform: typeof window !== 'undefined' && window.electronAPI?.platform
    ? window.electronAPI.platform
    : (typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows') ? 'win32' : 'darwin'),

  openFolderDialog: async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Photo Folder'
        })
        return typeof selected === 'string' ? selected : null
      } catch (err) {
        console.warn('Tauri openFolderDialog failed:', err)
        return null
      }
    }
    return window.electronAPI?.openFolderDialog() ?? null
  },

  showSaveDialog: async () => {
    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const path = await save({
          title: 'Select Destination Folder'
        })
        return path ?? null
      } catch (err) {
        console.warn('Tauri showSaveDialog failed:', err)
        return null
      }
    }
    return window.electronAPI?.showSaveDialog() ?? null
  },

  getAppVersion: async () => {
    if (isTauri) {
      try {
        const { getVersion } = await import('@tauri-apps/api/app')
        return await getVersion()
      } catch {
        return '1.0.4'
      }
    }
    return window.electronAPI?.getAppVersion() ?? '1.0.4'
  },

  getApiSecret: async () => {
    if (cachedApiToken) return cachedApiToken

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const secret = await invoke<string>('get_api_secret')
        if (secret) {
          cachedApiToken = secret
          return secret
        }
      } catch (err) {
        console.warn('Tauri getApiSecret failed:', err)
      }
    }

    if (window.electronAPI?.getApiSecret) {
      const secret = await window.electronAPI.getApiSecret()
      if (secret) cachedApiToken = secret
      return secret
    }

    return ''
  },

  getApiSecretSync: () => {
    if (cachedApiToken) return cachedApiToken
    if (typeof window !== 'undefined' && window.electronAPI?.getApiSecretSync) {
      const secret = window.electronAPI.getApiSecretSync()
      if (secret) cachedApiToken = secret
      return secret
    }
    return ''
  },

  showItemInFolder: async (path: string) => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        return await invoke<boolean>('show_item_in_folder', { path })
      } catch (err) {
        console.warn('Tauri showItemInFolder failed:', err)
        return false
      }
    }
    return window.electronAPI?.showItemInFolder?.(path) ?? false
  },

  getLogPath: async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        return await invoke<string>('get_log_path')
      } catch {
        return ''
      }
    }
    return window.electronAPI?.getLogPath?.() ?? ''
  },

  updateMenuState: (state: Record<string, any>) => {
    if (isTauri) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('update_menu_state', { state }).catch(() => {})
      }).catch(() => {})
      return
    }
    window.electronAPI?.updateMenuState?.(state)
  },

  onOpenShortcuts: (callback: () => void) => {
    if (isTauri) {
      let unlisten: (() => void) | undefined
      let cancelled = false
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('open-shortcuts', () => callback()).then((u) => {
          if (cancelled) {
            u()
          } else {
            unlisten = u
          }
        })
      }).catch(() => {})
      return () => { cancelled = true; unlisten?.() }
    }
    return window.electronAPI?.onOpenShortcuts?.(callback) ?? (() => {})
  },

  onNavigateTo: (callback: (route: string) => void) => {
    if (isTauri) {
      let unlisten: (() => void) | undefined
      let cancelled = false
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<string>('navigate-to', (e) => callback(e.payload)).then((u) => {
          if (cancelled) {
            u()
          } else {
            unlisten = u
          }
        })
      }).catch(() => {})
      return () => { cancelled = true; unlisten?.() }
    }
    return window.electronAPI?.onNavigateTo?.(callback) ?? (() => {})
  },

  onMenuAction: (callback: (action: string, payload?: any) => void) => {
    if (isTauri) {
      let unlisten: (() => void) | undefined
      let cancelled = false
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<string | { action: string; payload?: any }>('menu-action', (e) => {
          if (typeof e.payload === 'string') {
            callback(e.payload)
          } else {
            callback(e.payload.action, e.payload.payload)
          }
        }).then((u) => {
          if (cancelled) {
            u()
          } else {
            unlisten = u
          }
        })
      }).catch(() => {})
      return () => { cancelled = true; unlisten?.() }
    }
    return window.electronAPI?.onMenuAction?.(callback) ?? (() => {})
  },

  onFileDrop: (callback: (paths: string[]) => void) => {
    if (isTauri) {
      let unlisten: (() => void) | undefined
      let cancelled = false
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<{ paths: string[] }>('tauri://drag-drop', (e) => {
          callback(e.payload.paths)
        }).then((u) => {
          if (cancelled) {
            u()
          } else {
            unlisten = u
          }
        })
      }).catch(() => {})
      return () => { cancelled = true; unlisten?.() }
    }
    // Electron exposes dropped file paths via DOM `drop` events (File.path),
    // so there is nothing to subscribe to here.
    return () => {}
  }
}
