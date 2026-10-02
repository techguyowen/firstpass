/**
 * Centralized keyboard shortcuts manager for FirstPass.
 *
 * Owns the action registry, built-in presets (FirstPass Default, Lightroom
 * Classic, Photo Mechanic, Capture One), the key-matching engine, persistence
 * in localStorage, and change notifications via
 * `window.dispatchEvent(new CustomEvent('firstpass:shortcuts-changed'))`.
 *
 * Binding string format: modifiers joined with the key by '+', e.g.
 *   'a'                  single key (case-insensitive when matched)
 *   'Space'              space bar (KeyboardEvent.key === ' ')
 *   'ArrowRight'         arrow / special keys (Tab, Escape, Enter, CapsLock, ...)
 *   'CmdOrCtrl+Shift+Z'  modifiers: CmdOrCtrl (Cmd on Mac / Ctrl elsewhere),
 *                        Shift, Alt (Option). Token matching is case-insensitive.
 *   'Plus' / 'Minus'     aliases for the '+' and '-' keys (since '+' is the joiner).
 */

export type ShortcutCategory =
  | 'Culling'
  | 'Navigation'
  | 'View & Zoom'
  | 'Display & HUD'
  | 'Compare Mode'

export type ShortcutActionId =
  | 'rate_accept'
  | 'rate_reject'
  | 'rate_pending'
  | 'nav_next'
  | 'nav_prev'
  | 'jump_next_pending'
  | 'jump_next_flagged'
  | 'toggle_zoom'
  | 'toggle_tag'
  | 'toggle_auto_advance'
  | 'toggle_fullscreen'
  | 'toggle_lights_out'
  | 'toggle_hud'
  | 'toggle_clipping'
  | 'toggle_histogram'
  | 'toggle_sidebar'
  | 'toggle_compare'
  | 'rotate_cw'
  | 'rotate_ccw'
  | 'lock_zoom'
  | 'lock_turn'
  | 'undo'
  | 'redo'
  | 'swap_compare'
  | 'toggle_lock_ref'
  | 'pick_burst_best'
  | 'open_survey'
  | 'toggle_spray'
  | 'toggle_focus_peaking'
  | 'toggle_grid_overlay'

export interface ShortcutActionDef {
  id: ShortcutActionId
  label: string
  category: ShortcutCategory
  /** All default bindings for this action (first entry is the primary one). */
  defaultKeys: string[]
  /** Main display string, e.g. 'A' or 'Space'. */
  primaryKey: string
}

export interface ShortcutPreset {
  id: string
  name: string
  description: string
  bindings: Record<ShortcutActionId, string[]>
}

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  'Culling',
  'Navigation',
  'View & Zoom',
  'Display & HUD',
  'Compare Mode'
]

export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  { id: 'rate_accept', label: 'Accept (Keep Photo)', category: 'Culling', defaultKeys: ['a', 'A', '1', '`', '~', 'p', 'P'], primaryKey: 'A' },
  { id: 'rate_reject', label: 'Reject Photo', category: 'Culling', defaultKeys: ['r', 'R', '2', 'x', 'X'], primaryKey: 'R' },
  { id: 'rate_pending', label: 'Reset to Pending', category: 'Culling', defaultKeys: ['u', 'U', '0'], primaryKey: 'U' },
  { id: 'toggle_tag', label: 'Tag / Untag Photo', category: 'Culling', defaultKeys: ['\\', 't', 'T'], primaryKey: '\\' },
  { id: 'toggle_auto_advance', label: 'Toggle Auto-Advance', category: 'Culling', defaultKeys: ['CapsLock'], primaryKey: 'Caps Lock' },
  { id: 'undo', label: 'Undo', category: 'Culling', defaultKeys: ['CmdOrCtrl+z'], primaryKey: '⌘/Ctrl+Z' },
  { id: 'redo', label: 'Redo', category: 'Culling', defaultKeys: ['CmdOrCtrl+Shift+Z', 'CmdOrCtrl+y'], primaryKey: '⌘/Ctrl+Shift+Z' },
  { id: 'nav_next', label: 'Next Photo', category: 'Navigation', defaultKeys: ['ArrowRight'], primaryKey: '→' },
  { id: 'nav_prev', label: 'Previous Photo', category: 'Navigation', defaultKeys: ['ArrowLeft'], primaryKey: '←' },
  { id: 'jump_next_pending', label: 'Jump to Next Unreviewed (Pending) Photo', category: 'Navigation', defaultKeys: ['j', 'J'], primaryKey: 'J' },
  { id: 'jump_next_flagged', label: 'Jump to Next Flagged Photo (Blur / Closed Eyes)', category: 'Navigation', defaultKeys: ['Shift+J'], primaryKey: 'Shift+J' },
  { id: 'open_survey', label: 'Open Survey Mode (Rapid Rejection Review)', category: 'Navigation', defaultKeys: ['Shift+S'], primaryKey: 'Shift+S' },
  { id: 'toggle_zoom', label: 'Toggle Sticky Zoom', category: 'View & Zoom', defaultKeys: ['Space', 'z', 'Z'], primaryKey: 'Space' },
  { id: 'rotate_cw', label: 'Rotate 90° Clockwise', category: 'View & Zoom', defaultKeys: [']'], primaryKey: ']' },
  { id: 'rotate_ccw', label: 'Rotate 90° Counter-Clockwise', category: 'View & Zoom', defaultKeys: ['['], primaryKey: '[' },
  { id: 'lock_zoom', label: 'Lock Zoom Between Photos', category: 'View & Zoom', defaultKeys: ['CmdOrCtrl+Shift+L'], primaryKey: '⌘/Ctrl+Shift+L' },
  { id: 'lock_turn', label: 'Lock Rotation Between Photos', category: 'View & Zoom', defaultKeys: ['CmdOrCtrl+Shift+T'], primaryKey: '⌘/Ctrl+Shift+T' },
  { id: 'toggle_fullscreen', label: 'Toggle Fullscreen', category: 'Display & HUD', defaultKeys: ['f', 'F'], primaryKey: 'F' },
  { id: 'toggle_lights_out', label: 'Lights Out Mode', category: 'Display & HUD', defaultKeys: ['l', 'L'], primaryKey: 'L' },
  { id: 'toggle_hud', label: 'Photo Info HUD', category: 'Display & HUD', defaultKeys: ['i', 'I'], primaryKey: 'I' },
  { id: 'toggle_clipping', label: 'Toggle Exposure Clipping', category: 'Display & HUD', defaultKeys: ['e', 'E'], primaryKey: 'E' },
  { id: 'toggle_histogram', label: 'Toggle Histogram', category: 'Display & HUD', defaultKeys: ['h', 'H'], primaryKey: 'H' },
  { id: 'toggle_sidebar', label: 'Toggle Inspector Sidebar', category: 'Display & HUD', defaultKeys: ['Tab'], primaryKey: 'Tab' },
  { id: 'toggle_compare', label: 'Open 2-Up Compare', category: 'Compare Mode', defaultKeys: ['c', 'C'], primaryKey: 'C' },
  { id: 'swap_compare', label: 'Swap Ref & Candidate', category: 'Compare Mode', defaultKeys: ['s', 'S'], primaryKey: 'S' },
  { id: 'toggle_lock_ref', label: 'Toggle Reference Lock', category: 'Compare Mode', defaultKeys: ['l', 'L'], primaryKey: 'L' },
  { id: 'pick_burst_best', label: 'Pick Best Burst Frame & Reject Rest', category: 'Culling', defaultKeys: ['Shift+P'], primaryKey: 'Shift+P' },
  { id: 'toggle_spray', label: 'Toggle Spray Can Tool', category: 'Culling', defaultKeys: ['s', 'S'], primaryKey: 'S' },
  { id: 'toggle_focus_peaking', label: 'Toggle Focus Peaking Edge Detection', category: 'Display & HUD', defaultKeys: ['p', 'P'], primaryKey: 'P' },
  { id: 'toggle_grid_overlay', label: 'Cycle Composition Grid Overlay (Thirds/Golden/Cross)', category: 'Display & HUD', defaultKeys: ['o', 'O'], primaryKey: 'O' }
]

export const SHORTCUT_ACTION_MAP: Record<ShortcutActionId, ShortcutActionDef> =
  Object.fromEntries(SHORTCUT_ACTIONS.map(a => [a.id, a])) as Record<ShortcutActionId, ShortcutActionDef>

type BindingMap = Record<ShortcutActionId, string[]>

function defaultBindings(): BindingMap {
  return Object.fromEntries(
    SHORTCUT_ACTIONS.map(a => [a.id, [...a.defaultKeys]])
  ) as BindingMap
}

function withOverrides(overrides: Partial<BindingMap>): BindingMap {
  return { ...defaultBindings(), ...overrides }
}

export const SHORTCUT_PRESETS: ShortcutPreset[] = [
  {
    id: 'firstpass',
    name: 'FirstPass Default',
    description: 'A / R / U · Space zoom · one-key culling tuned for FirstPass.',
    bindings: defaultBindings()
  },
  {
    id: 'lightroom',
    name: 'Lightroom Classic',
    description: 'P pick · X reject · U unflag · Space loupe, like Lightroom Classic.',
    bindings: withOverrides({
      rate_accept: ['p', 'P'],
      rate_reject: ['x', 'X'],
      rate_pending: ['u', 'U'],
      toggle_zoom: ['Space'],
      toggle_lights_out: ['l', 'L'],
      toggle_compare: ['c', 'C']
    })
  },
  {
    id: 'photomechanic',
    name: 'Photo Mechanic',
    description: 'T tag · 1 accept · 2 reject · 0 clear, like Photo Mechanic.',
    bindings: withOverrides({
      toggle_tag: ['t', 'T'],
      rate_accept: ['1'],
      rate_reject: ['2'],
      rate_pending: ['0'],
      toggle_zoom: ['Space']
    })
  },
  {
    id: 'captureone',
    name: 'Capture One',
    description: 'Number ratings with + / − color-style keys, like Capture One.',
    bindings: withOverrides({
      rate_accept: ['5', 'Plus', '='],
      rate_reject: ['1', 'Minus'],
      rate_pending: ['0'],
      toggle_zoom: ['Space']
    })
  }
]

export function getShortcutPresets(): ShortcutPreset[] {
  return SHORTCUT_PRESETS
}

export function getShortcutPreset(presetId: string): ShortcutPreset | undefined {
  return SHORTCUT_PRESETS.find(p => p.id === presetId)
}

// ---------------------------------------------------------------------------
// Binding parsing / matching
// ---------------------------------------------------------------------------

interface ParsedBinding {
  key: string
  cmdOrCtrl: boolean
  shift: boolean
  alt: boolean
}

function normalizeKeyToken(token: string): string {
  const t = token.trim()
  const lower = t.toLowerCase()
  if (lower === 'space' || t === ' ') return 'space'
  if (lower === 'plus' || t === '+') return 'plus'
  if (lower === 'minus') return 'minus'
  if (lower === 'esc') return 'escape'
  if (lower === 'capslock' || lower === 'caps lock') return 'capslock'
  return lower
}

function normalizeEventKey(key: string): string {
  if (key === ' ') return 'space'
  if (key === '+') return 'plus'
  if (key === '-') return 'minus'
  const lower = key.toLowerCase()
  if (lower === 'esc') return 'escape'
  if (lower === 'caps lock') return 'capslock'
  return lower
}

function parseBinding(binding: string): ParsedBinding {
  const parts = binding.split('+').map(p => p.trim()).filter(p => p.length > 0)
  let cmdOrCtrl = false
  let shift = false
  let alt = false
  let key = ''
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'cmdorctrl' || lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'meta' || lower === 'command') {
      cmdOrCtrl = true
    } else if (lower === 'shift' || lower === '⇧') {
      shift = true
    } else if (lower === 'alt' || lower === 'option') {
      alt = true
    } else {
      key = normalizeKeyToken(part)
    }
  }
  return { key, cmdOrCtrl, shift, alt }
}

function bindingMatchesEvent(binding: string, e: KeyboardEvent | React.KeyboardEvent): boolean {
  const parsed = parseBinding(binding)
  if (!parsed.key) return false
  const wantCmd = parsed.cmdOrCtrl
  const gotCmd = Boolean(e.metaKey || e.ctrlKey)
  if (wantCmd !== gotCmd) return false
  if (parsed.shift !== Boolean(e.shiftKey)) return false
  if (parsed.alt !== Boolean(e.altKey)) return false
  return normalizeEventKey(e.key) === parsed.key
}

/** Serialize a live keyboard event to a canonical binding string. */
export function eventToShortcutString(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const k = e.key
  if (k === ' ') parts.push('Space')
  else if (k === '+') parts.push('Plus')
  else if (k === '-') parts.push('Minus')
  else if (k.length === 1) parts.push(k.toLowerCase())
  else parts.push(k)
  return parts.join('+')
}

/** Human-friendly display for a stored binding, e.g. 'CmdOrCtrl+Shift+Z' → '⌘/Ctrl+Shift+Z'. */
export function formatShortcutKey(binding: string): string {
  const arrowGlyphs: Record<string, string> = {
    arrowright: '→',
    arrowleft: '←',
    arrowup: '↑',
    arrowdown: '↓'
  }
  const parts = binding.split('+').map(p => p.trim()).filter(p => p.length > 0)
  return parts.map(part => {
    const lower = part.toLowerCase()
    if (lower === 'cmdorctrl' || lower === 'ctrl' || lower === 'control') return '⌘/Ctrl'
    if (lower === 'cmd' || lower === 'meta' || lower === 'command') return '⌘'
    if (lower === 'space' || part === ' ') return 'Space'
    if (lower === 'plus' || part === '+') return '+'
    if (lower === 'minus') return '−'
    if (lower === 'escape' || lower === 'esc') return 'Esc'
    if (lower === 'capslock' || lower === 'caps lock') return 'Caps Lock'
    if (arrowGlyphs[lower]) return arrowGlyphs[lower]
    if (part.length === 1) return part.toUpperCase()
    return part
  }).join('+')
}

// ---------------------------------------------------------------------------
// Persistence & change events
// ---------------------------------------------------------------------------

export const CUSTOM_SHORTCUTS_KEY = 'firstpass:custom_shortcuts'
export const ACTIVE_PRESET_KEY = 'firstpass:active_shortcut_preset'
export const SHORTCUTS_CHANGED_EVENT = 'firstpass:shortcuts-changed'
export const CUSTOM_PRESET_ID = 'custom'

function isValidBindingMap(value: unknown): value is Partial<BindingMap> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value as Record<string, unknown>).every(
    ([k, v]) => k in SHORTCUT_ACTION_MAP && Array.isArray(v) && (v as unknown[]).every(s => typeof s === 'string')
  )
}

function readStoredBindings(): Partial<BindingMap> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(CUSTOM_SHORTCUTS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidBindingMap(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** Effective bindings: stored customizations merged over the registry defaults. */
export function getCustomShortcuts(): BindingMap {
  const stored = readStoredBindings()
  const base = defaultBindings()
  if (!stored) return base
  for (const action of SHORTCUT_ACTIONS) {
    const keys = stored[action.id]
    if (Array.isArray(keys) && keys.length > 0) base[action.id] = [...keys]
  }
  return base
}

export function getActionKeys(actionId: ShortcutActionId): string[] {
  return getCustomShortcuts()[actionId] ?? [...(SHORTCUT_ACTION_MAP[actionId]?.defaultKeys ?? [])]
}

/** Primary (display) key for an action, reflecting user customization. */
export function getPrimaryShortcutKey(actionId: ShortcutActionId): string {
  const keys = getActionKeys(actionId)
  if (keys.length === 0) return SHORTCUT_ACTION_MAP[actionId]?.primaryKey ?? ''
  return formatShortcutKey(keys[0])
}

export function getActivePresetId(): string {
  try {
    if (typeof localStorage === 'undefined') return 'firstpass'
    return localStorage.getItem(ACTIVE_PRESET_KEY) || 'firstpass'
  } catch {
    return 'firstpass'
  }
}

export function getActivePresetName(): string {
  const id = getActivePresetId()
  if (id === CUSTOM_PRESET_ID) return 'Custom'
  return getShortcutPreset(id)?.name ?? 'FirstPass Default'
}

function notifyShortcutsChanged(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SHORTCUTS_CHANGED_EVENT))
    }
  } catch {
    // non-DOM environment (tests): ignore
  }
}

/** Subscribe to shortcut changes; returns an unsubscribe function. */
export function subscribeShortcuts(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(SHORTCUTS_CHANGED_EVENT, listener)
  return () => window.removeEventListener(SHORTCUTS_CHANGED_EVENT, listener)
}

export function saveCustomShortcuts(map: BindingMap): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_SHORTCUTS_KEY, JSON.stringify(map))
      localStorage.setItem(ACTIVE_PRESET_KEY, CUSTOM_PRESET_ID)
    }
  } catch {
    // storage unavailable (private mode quota etc.): still notify in-memory listeners
  }
  notifyShortcutsChanged()
}

export function resetShortcutsToDefault(): void {
  applyShortcutPreset('firstpass')
}

export function applyShortcutPreset(presetId: string): void {
  const preset = getShortcutPreset(presetId)
  if (!preset) return
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_SHORTCUTS_KEY, JSON.stringify(preset.bindings))
      localStorage.setItem(ACTIVE_PRESET_KEY, preset.id)
    }
  } catch {
    // ignore storage errors; still notify
  }
  notifyShortcutsChanged()
}

// ---------------------------------------------------------------------------
// Matching engine
// ---------------------------------------------------------------------------

function isEditableTarget(target: unknown): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  try {
    if (typeof el.closest === 'function') {
      return el.closest('input, textarea, [contenteditable]') != null
    }
  } catch {
    return false
  }
  const tag = (el.tagName || '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean((el as HTMLElement).isContentEditable)
}

export interface MatchesShortcutOptions {
  /** Allow matching when focus is inside an input/textarea/contenteditable. */
  allowInInputs?: boolean
}

/**
 * Check whether a keyboard event matches any assigned key for the action.
 * Modifier flags must match exactly (a plain 'a' binding never fires on
 * Cmd+A, and 'CmdOrCtrl+Z' never fires on a bare 'z'). Events from editable
 * targets are ignored unless `allowInInputs` is set (used while recording).
 */
export function matchesShortcut(
  e: KeyboardEvent | React.KeyboardEvent,
  actionId: ShortcutActionId,
  opts?: MatchesShortcutOptions
): boolean {
  if (!opts?.allowInInputs && isEditableTarget(e.target)) return false
  const keys = getActionKeys(actionId)
  for (const binding of keys) {
    if (bindingMatchesEvent(binding, e)) return true
  }
  return false
}

/** Find another action already using this exact binding (for conflict warnings). */
export function findConflictingAction(binding: string, exceptActionId?: ShortcutActionId): ShortcutActionDef | null {
  const map = getCustomShortcuts()
  const needle = parseBinding(binding)
  for (const action of SHORTCUT_ACTIONS) {
    if (action.id === exceptActionId) continue
    const keys = map[action.id] ?? []
    for (const existing of keys) {
      const parsed = parseBinding(existing)
      if (
        parsed.key === needle.key &&
        parsed.cmdOrCtrl === needle.cmdOrCtrl &&
        parsed.shift === needle.shift &&
        parsed.alt === needle.alt
      ) {
        return action
      }
    }
  }
  return null
}
