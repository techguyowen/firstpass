import { app, shell, BrowserWindow, ipcMain, dialog, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, chmodSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import crypto from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, ChildProcess } from 'child_process'

app.setName('FirstPass')

let backendProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null

const apiSecret: string = crypto.randomBytes(32).toString('hex')

function persistApiSecret(): void {
  try {
    const dirs = [join(homedir(), '.firstpass')]
    try {
      if (existsSync(join(homedir(), '.photo-culler'))) {
        dirs.push(join(homedir(), '.photo-culler'))
      }
    } catch {
      // ignore
    }
    for (const dir of dirs) {
      try {
        mkdirSync(dir, { recursive: true })
        const tokenPath = join(dir, '.session_token')
        writeFileSync(tokenPath, apiSecret, { mode: 0o600 })
        try {
          chmodSync(tokenPath, 0o600)
        } catch {
          // ignore chmod failures on non-POSIX platforms
        }
      } catch (err) {
        console.error(`Failed to write session token to ${dir}:`, err)
      }
    }
  } catch (err) {
    console.error('Failed to persist API secret:', err)
  }
}

persistApiSecret()

function getAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(process.resourcesPath, 'electron.icns'),
    join(app.getAppPath(), '../resources/icon.png'),
    join(app.getAppPath(), '../resources/icon.icns'),
    join(app.getAppPath(), 'resources/icon.png'),
    join(app.getAppPath(), 'resources/icon.icns'),
    join(app.getAppPath(), 'build/icon.png')
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
  }
  return undefined
}

function getDevPythonPath(): string {
  const projectRoot = join(app.getAppPath(), '..')
  const venvs = [
    join(projectRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    join(projectRoot, '.venv-build', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    join(projectRoot, 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  ]
  for (const venv of venvs) {
    if (existsSync(venv)) return venv
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

function startBackend(): void {
  try {
    if (is.dev) {
      const pythonCmd = getDevPythonPath()
      const scriptPath = join(app.getAppPath(), '../backend/main.py')
      console.log(`Starting backend in dev mode: ${pythonCmd} ${scriptPath}`)
      backendProcess = spawn(pythonCmd, [scriptPath], {
        env: { ...process.env, PYTHONUNBUFFERED: '1', FIRSTPASS_API_KEY: apiSecret },
        stdio: 'inherit'
      })
    } else {
      const primaryBinary = process.platform === 'win32' ? 'firstpass-backend.exe' : 'firstpass-backend'
      const fallbackBinary = process.platform === 'win32' ? 'photo-culler-backend.exe' : 'photo-culler-backend'
      let binaryPath = join(process.resourcesPath, 'python-backend', primaryBinary)
      if (!existsSync(binaryPath)) {
        binaryPath = join(process.resourcesPath, 'python-backend', fallbackBinary)
      }
      console.log(`Starting backend in production mode: ${binaryPath}`)
      if (existsSync(binaryPath)) {
        backendProcess = spawn(binaryPath, [], {
          env: { ...process.env, PYTHONUNBUFFERED: '1', FIRSTPASS_API_KEY: apiSecret },
          stdio: 'inherit'
        })
      } else {
        console.error(`Backend binary not found at: ${binaryPath}`)
      }
    }

    if (backendProcess) {
      backendProcess.on('error', (err) => {
        console.error('Backend process error:', err)
      })
      backendProcess.on('exit', (code, signal) => {
        console.log(`Backend process exited with code ${code}, signal ${signal}`)
        backendProcess = null
      })
    }
  } catch (err) {
    console.error('Failed to spawn backend:', err)
  }
}

function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    console.log('Stopping backend process...')
    try {
      backendProcess.kill('SIGTERM')
    } catch {
      // ignore
    }
    backendProcess = null
  }
}

function createWindow(): void {
  const appIcon = getAppIcon()
  if (process.platform === 'darwin' && app.dock && appIcon) {
    app.dock.setIcon(appIcon)
  }

  mainWindow = new BrowserWindow({
    title: 'FirstPass',
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#090d14',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(details.url)
      } else {
        console.warn(`Blocked window open with disallowed protocol: ${parsed.protocol} (${details.url})`)
      }
    } catch (err) {
      console.warn(`Blocked window open with unparseable URL: ${details.url}`, err)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url)
      const allowedHosts = ['localhost', '127.0.0.1']
      if (parsed.protocol === 'file:') return
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && allowedHosts.includes(parsed.hostname)) return
    } catch {}
    event.preventDefault()
    console.warn(`Blocked navigation to untrusted URL: ${url}`)
  })

  const routeArg = process.argv.find(arg => arg.startsWith('--route='))
  const initialHash = routeArg ? routeArg.replace('--route=', '') : ''

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const devUrl = initialHash ? `${process.env['ELECTRON_RENDERER_URL']}#${initialHash}` : process.env['ELECTRON_RENDERER_URL']
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), initialHash ? { hash: initialHash } : undefined)
  }
}

interface MenuState {
  activeTheme: string
  canvasBackdrop: string
  lightsOutLevel: number
  hudMode: number
  autoAdvance: boolean
  currentRoute: string
  filmstripPosition: string
  showClipping: boolean
  showHistogram: boolean
  histogramMode?: string
  faceLoupeMode?: string
  inspectorOpen: boolean
  showCullingBar: boolean
  isBottomCollapsed: boolean
  collapseBursts: boolean
  activeWorkspace?: string
}

let currentMenuState: MenuState = {
  activeTheme: 'charcoal',
  canvasBackdrop: 'theme',
  lightsOutLevel: 0,
  hudMode: 1,
  autoAdvance: false,
  currentRoute: '/',
  filmstripPosition: 'bottom',
  showClipping: false,
  showHistogram: false,
  histogramMode: 'sidebar',
  faceLoupeMode: 'bottom',
  inspectorOpen: true,
  showCullingBar: true,
  isBottomCollapsed: false,
  collapseBursts: true,
  activeWorkspace: 'default-studio'
}

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const send = (action: string, payload?: any) => {
    mainWindow?.webContents.send('menu-action', action, payload)
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              {
                label: 'Check for Updates...',
                click: () => send('check-updates')
              },
              { type: 'separator' as const },
              {
                label: 'Preferences...',
                accelerator: 'CmdOrCtrl+,',
                click: () => send('navigate-settings')
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open / Import Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('import-folder')
        },
        {
          label: 'Rescan Current Folder',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => send('rescan-folder')
        },
        { type: 'separator' as const },
        {
          label: 'Export Culled Photos...',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('open-export')
        },
        {
          label: 'Quick Export (Accepted Only)...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => send('quick-export')
        },
        {
          label: 'Target Delivery Manager...',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => send('open-delivery-target')
        },
        { type: 'separator' as const },
        {
          label: 'Re-analyze Entire Shoot',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => send('analyze-all')
        },
        {
          label: 'Reset / Clear Library Database...',
          click: () => send('reset-database')
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo Rating Change',
          accelerator: 'CmdOrCtrl+Z',
          click: () => send('undo')
        },
        {
          label: 'Redo Rating Change',
          accelerator: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y',
          click: () => send('redo')
        },
        { type: 'separator' as const },
        {
          label: 'Select All Photos',
          accelerator: 'CmdOrCtrl+A',
          click: () => send('select-all')
        },
        {
          label: 'Deselect All',
          accelerator: 'CmdOrCtrl+D',
          click: () => send('deselect-all')
        },
        {
          label: 'Invert Selection',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => send('invert-selection')
        },
        { type: 'separator' as const },
        {
          label: 'Auto-Pick Best Duplicates',
          click: () => send('auto-pick-duplicates')
        },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: 'Preferences...',
                accelerator: 'CmdOrCtrl+,',
                click: () => send('navigate-settings')
              }
            ]
          : [])
      ]
    },
    {
      label: 'Photo',
      submenu: [
        {
          label: 'Accept / Keep Photo (A / ~)',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => send('rate-accept')
        },
        {
          label: 'Reject Photo (R / 2)',
          accelerator: 'CmdOrCtrl+Backspace',
          click: () => send('rate-reject')
        },
        {
          label: 'Reset to Pending (U / 0)',
          accelerator: 'CmdOrCtrl+U',
          click: () => send('rate-pending')
        },
        {
          label: 'Toggle Tag (\\ / T)',
          accelerator: 'CmdOrCtrl+T',
          click: () => send('toggle-tag')
        },
        { type: 'separator' as const },
        {
          label: 'Auto-Advance on Rating',
          type: 'checkbox' as const,
          checked: currentMenuState.autoAdvance,
          click: () => send('toggle-auto-advance')
        },
        { type: 'separator' as const },
        {
          label: 'Previous Photograph',
          accelerator: 'Left',
          click: () => send('prev-photo')
        },
        {
          label: 'Next Photograph',
          accelerator: 'Right',
          click: () => send('next-photo')
        },
        {
          label: 'First Photograph',
          accelerator: 'Home',
          click: () => send('first-photo')
        },
        {
          label: 'Last Photograph',
          accelerator: 'End',
          click: () => send('last-photo')
        },
        { type: 'separator' as const },
        {
          label: 'Re-analyze Active Photo with AI',
          accelerator: 'CmdOrCtrl+R',
          click: () => send('reanalyze-active')
        },
        {
          label: 'Re-analyze Entire Shoot',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => send('analyze-all')
        },
        { type: 'separator' as const },
        {
          label: 'Identify VIP Faces...',
          click: () => send('open-vip-modal')
        },
        {
          label: 'Stack & Collapse Burst Groups',
          type: 'checkbox' as const,
          checked: currentMenuState.collapseBursts,
          click: () => send('toggle-burst-stacking')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Gallery Grid View',
          accelerator: 'CmdOrCtrl+1',
          type: 'radio' as const,
          checked: currentMenuState.currentRoute === '/',
          click: () => send('navigate-gallery')
        },
        {
          label: 'Single Photo Review (Loupe)',
          accelerator: 'CmdOrCtrl+2',
          type: 'radio' as const,
          checked: currentMenuState.currentRoute.startsWith('/review'),
          click: () => send('navigate-review')
        },
        {
          label: 'Side-by-Side 2-Up Compare',
          accelerator: 'CmdOrCtrl+3',
          type: 'radio' as const,
          checked: currentMenuState.currentRoute.startsWith('/compare'),
          click: () => send('navigate-compare')
        },
        {
          label: 'Settings & AI Calibration',
          accelerator: 'CmdOrCtrl+4',
          type: 'radio' as const,
          checked: currentMenuState.currentRoute.startsWith('/settings'),
          click: () => send('navigate-settings')
        },
        { type: 'separator' as const },
        {
          label: 'Fit to Screen',
          accelerator: 'CmdOrCtrl+0',
          click: () => send('zoom-fit')
        },
        {
          label: 'Zoom 100% (1:1 Pixels) (Z)',
          accelerator: 'CmdOrCtrl+Alt+0',
          click: () => send('zoom-100')
        },
        {
          label: 'Zoom 200% (Detail)',
          click: () => send('zoom-200')
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => send('zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => send('zoom-out')
        },
        {
          label: 'Zoom to 100% / 250% (Z)',
          click: () => send('toggle-zoom')
        },
        { type: 'separator' as const },
        {
          label: 'Match Comparison',
          submenu: [
            {
              label: 'Match Zoom',
              accelerator: 'CmdOrCtrl+Shift+Z',
              click: () => send('match-zoom')
            },
            {
              label: 'Match Location',
              click: () => send('match-location')
            },
            {
              label: 'Match Rotation',
              click: () => send('match-rotation')
            },
            { type: 'separator' as const },
            {
              label: 'Match All',
              accelerator: 'CmdOrCtrl+Shift+M',
              click: () => send('match-all')
            }
          ]
        },
        { type: 'separator' as const },
        {
          label: 'Photographic Info HUD',
          submenu: [
            {
              label: 'HUD Off',
              type: 'radio' as const,
              checked: currentMenuState.hudMode === 0,
              click: () => send('set-hud', 0)
            },
            {
              label: 'Triage Summary HUD',
              type: 'radio' as const,
              checked: currentMenuState.hudMode === 1,
              click: () => send('set-hud', 1)
            },
            {
              label: 'Shooting EXIF Parameters HUD',
              type: 'radio' as const,
              checked: currentMenuState.hudMode === 2,
              click: () => send('set-hud', 2)
            },
            { type: 'separator' as const },
            {
              label: 'Cycle Info HUD (I)',
              click: () => send('cycle-hud')
            },
            {
              label: 'Close HUD',
              click: () => send('close-hud')
            }
          ]
        },
        {
          label: 'Highlight & Shadow Clipping Overlay (E)',
          type: 'checkbox' as const,
          checked: currentMenuState.showClipping,
          click: () => send('toggle-clipping')
        },
        {
          label: 'RGB & Luminance Histogram (H)',
          submenu: [
            {
              label: 'Dock to Inspector Sidebar',
              type: 'radio' as const,
              checked: currentMenuState.histogramMode === 'sidebar',
              click: () => send('set-histogram', 'sidebar')
            },
            {
              label: 'Floating Window (Draggable)',
              type: 'radio' as const,
              checked: currentMenuState.histogramMode === 'floating',
              click: () => send('set-histogram', 'floating')
            },
            {
              label: 'Hide Histogram',
              type: 'radio' as const,
              checked: currentMenuState.histogramMode === 'hidden',
              click: () => send('set-histogram', 'hidden')
            },
            { type: 'separator' as const },
            {
              label: 'Cycle Histogram Placement (H)',
              click: () => send('toggle-histogram')
            }
          ]
        },
        {
          label: 'Face Loupe',
          submenu: [
            {
              label: 'Dock to Bottom Stage Bar',
              click: () => send('set-faceloupe', 'bottom')
            },
            {
              label: 'Dock to Inspector Sidebar',
              click: () => send('set-faceloupe', 'sidebar')
            },
            {
              label: 'Floating Window (Draggable)',
              click: () => send('set-faceloupe', 'floating')
            },
            {
              label: 'Hide Face Loupe',
              click: () => send('set-faceloupe', 'hidden')
            }
          ]
        },
        { type: 'separator' as const },
        {
          label: 'Lights Out Mode',
          submenu: [
            {
              label: 'Lights On (Normal)',
              type: 'radio' as const,
              checked: currentMenuState.lightsOutLevel === 0,
              click: () => send('set-lights-out', 0)
            },
            {
              label: '85% Dim (Isolate Photo)',
              type: 'radio' as const,
              checked: currentMenuState.lightsOutLevel === 1,
              click: () => send('set-lights-out', 1)
            },
            {
              label: 'Full Blackout',
              type: 'radio' as const,
              checked: currentMenuState.lightsOutLevel === 2,
              click: () => send('set-lights-out', 2)
            },
            { type: 'separator' as const },
            {
              label: 'Cycle Lights Out (L)',
              click: () => send('cycle-lights-out')
            }
          ]
        },
        {
          label: 'Canvas Backdrop',
          submenu: [
            {
              label: 'Pitch Black (#000000)',
              type: 'radio' as const,
              checked: currentMenuState.canvasBackdrop === 'black',
              click: () => send('set-backdrop', 'black')
            },
            {
              label: 'Dark Gray (#141414)',
              type: 'radio' as const,
              checked: currentMenuState.canvasBackdrop === 'dark',
              click: () => send('set-backdrop', 'dark')
            },
            {
              label: '18% Studio Neutral Gray (Calibrated)',
              type: 'radio' as const,
              checked: currentMenuState.canvasBackdrop === 'neutral',
              click: () => send('set-backdrop', 'neutral')
            },
            {
              label: 'Match Studio Theme',
              type: 'radio' as const,
              checked: currentMenuState.canvasBackdrop === 'theme',
              click: () => send('set-backdrop', 'theme')
            }
          ]
        },
        { type: 'separator' as const },
        {
          label: 'Toggle Fullscreen Review (F)',
          click: () => send('toggle-fullscreen')
        },
        { role: 'togglefullscreen' as const }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        { type: 'separator' as const },
        {
          label: 'Workspaces',
          submenu: [
            {
              label: 'Default Studio',
              type: 'radio' as const,
              checked: currentMenuState.activeWorkspace === 'default-studio',
              click: () => send('set-workspace', 'default-studio')
            },
            {
              label: 'Speed Triage (Full Viewport)',
              type: 'radio' as const,
              checked: currentMenuState.activeWorkspace === 'speed-triage',
              click: () => send('set-workspace', 'speed-triage')
            },
            {
              label: 'Focus & Faces',
              type: 'radio' as const,
              checked: currentMenuState.activeWorkspace === 'focus-inspection',
              click: () => send('set-workspace', 'focus-inspection')
            },
            {
              label: 'Technical & EXIF Studio',
              type: 'radio' as const,
              checked: currentMenuState.activeWorkspace === 'technical-exif',
              click: () => send('set-workspace', 'technical-exif')
            },
            { type: 'separator' as const },
            {
              label: 'Save Current Layout As...',
              click: () => send('save-workspace-dialog')
            },
            {
              label: 'Reset Current Workspace Layout',
              click: () => send('reset-workspace')
            }
          ]
        },
        // Studio Themes are strictly separated from Workspaces: themes govern
        // colors only, workspaces govern item locations/geometry/layout only.
        {
          label: 'Studio Themes',
          submenu: [
            {
              label: 'Charcoal Dark (Default)',
              type: 'radio' as const,
              checked: currentMenuState.activeTheme === 'charcoal',
              click: () => send('set-theme', 'charcoal')
            },
            {
              label: 'Obsidian Black',
              type: 'radio' as const,
              checked: currentMenuState.activeTheme === 'obsidian',
              click: () => send('set-theme', 'obsidian')
            },
            {
              label: '18% Studio Neutral Gray (Calibrated)',
              type: 'radio' as const,
              checked: currentMenuState.activeTheme === 'neutral',
              click: () => send('set-theme', 'neutral')
            },
            {
              label: 'Midnight Slate Blue',
              type: 'radio' as const,
              checked: currentMenuState.activeTheme === 'slate',
              click: () => send('set-theme', 'slate')
            },
            {
              label: 'Warm Espresso Darkroom',
              type: 'radio' as const,
              checked: currentMenuState.activeTheme === 'espresso',
              click: () => send('set-theme', 'espresso')
            },
            { type: 'separator' as const },
            {
              label: 'Open Themes Palette...',
              click: () => send('open-theme-modal')
            }
          ]
        },
        { type: 'separator' as const },
        {
          label: 'Panels & Windows',
          submenu: [
            {
              label: 'Filmstrip',
              type: 'checkbox' as const,
              checked: currentMenuState.filmstripPosition !== 'hidden',
              click: () => send('toggle-filmstrip-visibility')
            },
            {
              label: 'Culling Action Bar',
              type: 'checkbox' as const,
              checked: currentMenuState.showCullingBar,
              click: () => send('toggle-culling-bar')
            },
            {
              label: 'Inspector Sidebar',
              type: 'checkbox' as const,
              checked: currentMenuState.inspectorOpen,
              click: () => send('toggle-inspector')
            },
            {
              label: 'Photographic Info HUD',
              type: 'checkbox' as const,
              checked: currentMenuState.hudMode > 0,
              click: () => send('toggle-hud-visibility')
            },
            {
              label: 'Histogram',
              type: 'checkbox' as const,
              checked: currentMenuState.histogramMode !== 'hidden',
              click: () => send('toggle-histogram-visibility')
            },
            {
              label: 'Face Loupe',
              type: 'checkbox' as const,
              checked: currentMenuState.faceLoupeMode !== 'hidden',
              click: () => send('toggle-faceloupe-visibility')
            },
            {
              label: 'Bottom Dock',
              type: 'checkbox' as const,
              checked: !currentMenuState.isBottomCollapsed,
              click: () => send('toggle-bottom-dock')
            },
            { type: 'separator' as const },
            {
              label: 'Customize Panels...',
              click: () => send('open-panel-selector')
            },
            { type: 'separator' as const },
            {
              label: 'Inspector Sidebar (Tab)',
              type: 'checkbox' as const,
              checked: currentMenuState.inspectorOpen,
              click: () => send('toggle-inspector')
            },
            {
              label: 'Bottom Dock',
              submenu: [
                {
                  label: 'Toggle Bottom Dock',
                  click: () => send('toggle-bottom-dock')
                },
                {
                  label: 'Toggle Side-by-Side Split',
                  click: () => send('toggle-bottom-split')
                },
                {
                  label: 'Reset Splitter to 420px',
                  click: () => send('reset-bottom-split')
                }
              ]
            },
            {
              label: 'Culling Action Bar',
              submenu: [
                {
                  label: 'Dock to Bottom',
                  click: () => send('set-triage', 'bottom')
                },
                {
                  label: 'Floating Island',
                  click: () => send('set-triage', 'floating')
                },
                {
                  label: 'Center on Screen',
                  click: () => send('center-culling-bar')
                }
              ]
            },
            {
              label: 'RGB & Luminance Histogram (H)',
              submenu: [
                {
                  label: 'Dock to Inspector Sidebar',
                  type: 'radio' as const,
                  checked: currentMenuState.histogramMode === 'sidebar',
                  click: () => send('set-histogram', 'sidebar')
                },
                {
                  label: 'Floating Window (Draggable)',
                  type: 'radio' as const,
                  checked: currentMenuState.histogramMode === 'floating',
                  click: () => send('set-histogram', 'floating')
                },
                {
                  label: 'Hide Histogram',
                  type: 'radio' as const,
                  checked: currentMenuState.histogramMode === 'hidden',
                  click: () => send('set-histogram', 'hidden')
                },
                { type: 'separator' as const },
                {
                  label: 'Cycle Histogram Placement (H)',
                  click: () => send('toggle-histogram')
                }
              ]
            },
            {
              label: 'Face Loupe',
              submenu: [
                {
                  label: 'Dock to Bottom Stage Bar',
                  click: () => send('set-faceloupe', 'bottom')
                },
                {
                  label: 'Dock to Inspector Sidebar',
                  click: () => send('set-faceloupe', 'sidebar')
                },
                {
                  label: 'Floating Window (Draggable)',
                  click: () => send('set-faceloupe', 'floating')
                },
                {
                  label: 'Hide Face Loupe',
                  click: () => send('set-faceloupe', 'hidden')
                }
              ]
            },
            {
              label: 'Filmstrip (B)',
              submenu: [
                {
                  label: 'Bottom Filmstrip',
                  type: 'radio' as const,
                  checked: currentMenuState.filmstripPosition === 'bottom',
                  click: () => send('set-filmstrip', 'bottom')
                },
                {
                  label: 'Side Filmstrip',
                  type: 'radio' as const,
                  checked: currentMenuState.filmstripPosition === 'side',
                  click: () => send('set-filmstrip', 'side')
                },
                {
                  label: 'Floating Filmstrip Window',
                  type: 'radio' as const,
                  checked: currentMenuState.filmstripPosition === 'floating',
                  click: () => send('set-filmstrip', 'floating')
                },
                {
                  label: 'Hide Filmstrip',
                  type: 'radio' as const,
                  checked: currentMenuState.filmstripPosition === 'hidden',
                  click: () => send('set-filmstrip', 'hidden')
                },
                { type: 'separator' as const },
                {
                  label: 'Cycle Filmstrip Position (B)',
                  click: () => send('toggle-filmstrip')
                }
              ]
            }
          ]
        },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    },
    {
      role: 'help' as const,
      submenu: [
        {
          label: 'Keyboard Shortcuts Cheatsheet',
          accelerator: 'CmdOrCtrl+/',
          click: () => send('open-shortcuts')
        },
        {
          label: 'Check for Updates...',
          click: () => send('check-updates')
        },
        { type: 'separator' as const },
        {
          label: 'FirstPass on GitHub',
          click: () => {
            shell.openExternal('https://github.com')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.firstpass.app')
  const appIcon = getAppIcon()
  if (process.platform === 'darwin' && app.dock && appIcon) {
    app.dock.setIcon(appIcon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('open-folder-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (canceled) {
      return null
    } else {
      return filePaths[0]
    }
  })

  ipcMain.handle('show-save-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled) {
      return null
    } else {
      return filePaths[0]
    }
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })
  
  ipcMain.handle('get-platform', () => {
    return process.platform
  })

  ipcMain.handle('get-api-secret', () => apiSecret)

  ipcMain.on('get-api-secret-sync', (event) => {
    event.returnValue = apiSecret
  })

  ipcMain.handle('show-item-in-folder', async (_, fullPath: string) => {
    shell.showItemInFolder(fullPath)
    return true
  })
  ipcMain.handle('get-log-path', () => {
    const dataDir = join(homedir(), '.firstpass')
    return join(dataDir, 'firstpass.log')
  })

  ipcMain.on('update-menu-state', (_, state) => {
    if (state && typeof state === 'object') {
      currentMenuState = { ...currentMenuState, ...state }
      setupApplicationMenu()
    }
  })

  startBackend()
  createWindow()
  setupApplicationMenu()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      setupApplicationMenu()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', stopBackend)
app.on('will-quit', stopBackend)
process.on('exit', stopBackend)
process.on('SIGINT', () => {
  stopBackend()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stopBackend()
  process.exit(0)
})
