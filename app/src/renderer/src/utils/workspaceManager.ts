/**
 * Modular Workspace Manager
 * Supports factory preset workspaces and custom user-saved workspace layouts.
 */

import { CanvasBackdropMode } from '../theme/themes'
import { DockMode } from '../components/ScorePanel'
import { HudMode } from '../components/InfoOverlay'

export type FaceLoupePlacement = 'bottom' | 'sidebar' | 'floating' | 'hidden'
export type HistogramPlacement = 'sidebar' | 'bottom' | 'floating' | 'hidden'
export type FilmstripPlacement = 'bottom' | 'side' | 'floating' | 'hidden'

export interface WorkspaceLayout {
  id: string
  name: string
  isPreset?: boolean
  description?: string
  scorePanelDock: DockMode
  scorePanelWidth: number
  faceLoupeMode: FaceLoupePlacement
  histogramMode: HistogramPlacement
  filmstripPosition: FilmstripPlacement
  hudMode: HudMode
  hudPosition: { x: number; y: number }
  modulesOrder: string[]
  /**
   * Legacy canvas backdrop snapshot. Workspaces govern item locations,
   * geometry, and layout ONLY — this field is never applied when switching
   * workspaces and is ignored on save. Themes own all colors. Kept optional
   * so workspaces saved by older versions still parse.
   */
  canvasBackdrop?: CanvasBackdropMode
  modulePlacements?: Record<string, 'sidebar' | 'bottom' | 'floating' | 'hidden'>
}

export const PRESET_WORKSPACES: WorkspaceLayout[] = [
  {
    id: 'default-studio',
    name: 'Default Studio',
    isPreset: true,
    description: 'Balanced studio: Inspector on right, Histogram in sidebar, Face Loupe docked at bottom',
    scorePanelDock: 'right',
    scorePanelWidth: 320,
    faceLoupeMode: 'bottom',
    histogramMode: 'sidebar',
    filmstripPosition: 'bottom',
    hudMode: 1,
    hudPosition: { x: 20, y: 20 },
    modulesOrder: ['histogram', 'overall', 'reasons', 'quality', 'people', 'context', 'camera', 'file'],
  },
  {
    id: 'speed-triage',
    name: 'Speed Triage (Full Viewport)',
    isPreset: true,
    description: 'Maximized photo canvas: Inspector collapsed, minimal HUD, fast keyboard culling',
    scorePanelDock: 'collapsed',
    scorePanelWidth: 320,
    faceLoupeMode: 'bottom',
    histogramMode: 'hidden',
    filmstripPosition: 'bottom',
    hudMode: 1,
    hudPosition: { x: 20, y: 20 },
    modulesOrder: ['overall', 'reasons', 'quality', 'people', 'context', 'camera', 'file'],
  },
  {
    id: 'focus-inspection',
    name: 'Focus & Face Inspection',
    isPreset: true,
    description: 'Face Loupe and expression analysis prioritized, filmstrip at side for rapid portrait comparison',
    scorePanelDock: 'right',
    scorePanelWidth: 340,
    faceLoupeMode: 'bottom',
    histogramMode: 'sidebar',
    filmstripPosition: 'side',
    hudMode: 2,
    hudPosition: { x: 20, y: 20 },
    modulesOrder: ['people', 'histogram', 'quality', 'overall', 'reasons', 'context', 'camera', 'file'],
  },
  {
    id: 'technical-exif',
    name: 'Technical & EXIF Studio',
    isPreset: true,
    description: 'Floating histogram, EXIF camera parameters HUD, Inspector on left with full quality breakdown',
    scorePanelDock: 'left',
    scorePanelWidth: 360,
    faceLoupeMode: 'sidebar',
    histogramMode: 'floating',
    filmstripPosition: 'hidden',
    hudMode: 2,
    hudPosition: { x: 380, y: 20 },
    modulesOrder: ['camera', 'histogram', 'quality', 'file', 'overall', 'reasons', 'people', 'context'],
  }
]

const STORAGE_KEY_WORKSPACES = 'firstpass_custom_workspaces'
const LEGACY_STORAGE_KEY_WORKSPACES = 'photo_culler_custom_workspaces'
const STORAGE_KEY_ACTIVE_ID = 'firstpass_active_workspace_id'
const LEGACY_STORAGE_KEY_ACTIVE_ID = 'photo_culler_active_workspace_id'

function stripBackdrop(layout: WorkspaceLayout): WorkspaceLayout {
  if (!layout || typeof layout !== 'object') return layout
  const { canvasBackdrop: _ignored, ...rest } = layout as WorkspaceLayout & { canvasBackdrop?: unknown }
  void _ignored
  return rest as WorkspaceLayout
}

export function getCustomWorkspaces(): WorkspaceLayout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WORKSPACES) || localStorage.getItem(LEGACY_STORAGE_KEY_WORKSPACES)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Strip any legacy canvasBackdrop snapshots: custom workspaces are
      // layout-only and must never touch theme or canvas backdrop colors.
      if (Array.isArray(parsed)) return parsed.map(stripBackdrop)
    }
  } catch {}
  return []
}

export function getAllWorkspaces(): WorkspaceLayout[] {
  const custom = getCustomWorkspaces()
  return [...PRESET_WORKSPACES, ...custom]
}

export function getActiveWorkspaceId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_ID) || localStorage.getItem(LEGACY_STORAGE_KEY_ACTIVE_ID)
    if (saved && getAllWorkspaces().some(w => w.id === saved)) {
      return saved
    }
  } catch {}
  return 'default-studio'
}

export function setActiveWorkspaceId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id)
    localStorage.setItem(LEGACY_STORAGE_KEY_ACTIVE_ID, id)
  } catch {}
}

export function saveCustomWorkspace(name: string, currentLayout: Omit<WorkspaceLayout, 'id' | 'name' | 'isPreset'>): WorkspaceLayout {
  const id = `workspace-${Date.now()}`
  // Layout-only: never persist theme or canvas backdrop colors with a workspace.
  const { canvasBackdrop: _ignored, ...layoutOnly } = currentLayout as Omit<WorkspaceLayout, 'id' | 'name' | 'isPreset'> & { canvasBackdrop?: unknown }
  void _ignored
  const newWorkspace: WorkspaceLayout = {
    ...layoutOnly,
    id,
    name: name.trim() || 'Custom Workspace',
    isPreset: false,
  }

  const existing = getCustomWorkspaces().filter(w => w.id !== id && w.name !== newWorkspace.name)
  const updated = [...existing, newWorkspace]

  try {
    localStorage.setItem(STORAGE_KEY_WORKSPACES, JSON.stringify(updated))
    localStorage.setItem(LEGACY_STORAGE_KEY_WORKSPACES, JSON.stringify(updated))
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id)
    localStorage.setItem(LEGACY_STORAGE_KEY_ACTIVE_ID, id)
  } catch {}

  return newWorkspace
}

export function deleteCustomWorkspace(id: string): void {
  const existing = getCustomWorkspaces().filter(w => w.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY_WORKSPACES, JSON.stringify(existing))
    localStorage.setItem(LEGACY_STORAGE_KEY_WORKSPACES, JSON.stringify(existing))
    if (getActiveWorkspaceId() === id) {
      setActiveWorkspaceId('default-studio')
    }
  } catch {}
}

export function getWorkspaceById(id: string): WorkspaceLayout {
  const all = getAllWorkspaces()
  return all.find(w => w.id === id) || PRESET_WORKSPACES[0]
}

export function resetWorkspace(id: string): WorkspaceLayout {
  const preset = PRESET_WORKSPACES.find(w => w.id === id)
  if (preset) {
    return preset
  }
  return PRESET_WORKSPACES[0]
}
