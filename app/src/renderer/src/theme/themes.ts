export interface ThemePreset {
  id: string
  name: string
  tagline: string
  colors: {
    bgPrimary: string     // Main background
    bgSecondary: string   // Sidebars, toolbars
    bgCard: string        // Inspector boxes, cards, modals
    borderColor: string   // Borders and dividers
    accentColor: string   // Primary active accent
    accentHover: string   // Hover state
    canvasBg: string      // Image stage default backdrop
    textPrimary: string   // Main titles & text
    textSecondary: string // Subtitles & labels
    textMuted: string     // Placeholders, disabled
    swatchPreview: string[] // Colors to show on swatch button
  }
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'charcoal',
    name: 'Charcoal Dark (Default)',
    tagline: 'Deep neutral professional darkroom charcoal',
    colors: {
      bgPrimary: '#141414',
      bgSecondary: '#1c1c1c',
      bgCard: '#242424',
      borderColor: '#323232',
      accentColor: '#3b82f6',
      accentHover: '#2563eb',
      canvasBg: '#121212',
      textPrimary: '#f3f4f6',
      textSecondary: '#9ca3af',
      textMuted: '#6b7280',
      swatchPreview: ['#141414', '#1c1c1c', '#242424', '#3b82f6'],
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian Black',
    tagline: 'High-contrast pitch black OLED darkroom',
    colors: {
      bgPrimary: '#080808',
      bgSecondary: '#101010',
      bgCard: '#161616',
      borderColor: '#262626',
      accentColor: '#6366f1',
      accentHover: '#4f46e5',
      canvasBg: '#000000',
      textPrimary: '#ffffff',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      swatchPreview: ['#080808', '#101010', '#161616', '#6366f1'],
    },
  },
  {
    id: 'neutral',
    name: '18% Studio Gray',
    tagline: 'Photography industry standard for color & luminance grading',
    colors: {
      bgPrimary: '#262626',
      bgSecondary: '#2f2f2f',
      bgCard: '#383838',
      borderColor: '#484848',
      accentColor: '#38bdf8',
      accentHover: '#0ea5e9',
      canvasBg: '#2b2b2b',
      textPrimary: '#f5f5f5',
      textSecondary: '#d4d4d4',
      textMuted: '#a3a3a3',
      swatchPreview: ['#262626', '#2f2f2f', '#383838', '#38bdf8'],
    },
  },
  {
    id: 'slate',
    name: 'Midnight Slate',
    tagline: 'Cool deep navy-slate darkroom atmosphere',
    colors: {
      bgPrimary: '#0b0f17',
      bgSecondary: '#111827',
      bgCard: '#1e293b',
      borderColor: '#334155',
      accentColor: '#0ea5e9',
      accentHover: '#0284c7',
      canvasBg: '#070a10',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      swatchPreview: ['#0b0f17', '#111827', '#1e293b', '#0ea5e9'],
    },
  },
  {
    id: 'espresso',
    name: 'Warm Espresso',
    tagline: 'Warm darkroom tone with rich amber accents',
    colors: {
      bgPrimary: '#141210',
      bgSecondary: '#1c1917',
      bgCard: '#292524',
      borderColor: '#44403c',
      accentColor: '#f59e0b',
      accentHover: '#d97706',
      canvasBg: '#0c0a09',
      textPrimary: '#fafaf9',
      textSecondary: '#a8a29e',
      textMuted: '#78716c',
      swatchPreview: ['#141210', '#1c1917', '#292524', '#f59e0b'],
    },
  },
]

export function getStoredThemeId(): string {
  try {
    const saved = localStorage.getItem('firstpass_theme') || localStorage.getItem('photo_culler_theme')
    if (saved && THEME_PRESETS.some((t) => t.id === saved)) {
      return saved
    }
  } catch {}
  return 'charcoal'
}

export function applyTheme(themeId: string) {
  const theme = THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0]
  const root = document.documentElement

  root.style.setProperty('--color-background', theme.colors.bgPrimary)
  root.style.setProperty('--color-panel', theme.colors.bgSecondary)
  root.style.setProperty('--color-card', theme.colors.bgCard)
  root.style.setProperty('--color-border', theme.colors.borderColor)
  root.style.setProperty('--color-accent', theme.colors.accentColor)
  root.style.setProperty('--color-accent-hover', theme.colors.accentHover)
  root.style.setProperty('--color-canvas-default', theme.colors.canvasBg)
  root.style.setProperty('--color-text-primary', theme.colors.textPrimary)
  root.style.setProperty('--color-text-secondary', theme.colors.textSecondary)
  root.style.setProperty('--color-text-muted', theme.colors.textMuted)

  root.setAttribute('data-theme', theme.id)

  try {
    localStorage.setItem('firstpass_theme', theme.id)
    localStorage.setItem('photo_culler_theme', theme.id)
  } catch {}
}

export type CanvasBackdropMode = 'black' | 'dark' | 'neutral' | 'theme'

export const CANVAS_BACKDROP_OPTIONS: { id: CanvasBackdropMode; label: string; color: string }[] = [
  { id: 'black', label: 'Pitch Black', color: '#000000' },
  { id: 'dark', label: 'Dark Gray', color: '#141414' },
  { id: 'neutral', label: '18% Neutral Gray', color: '#2b2b2b' },
  { id: 'theme', label: 'Match Theme', color: 'var(--color-canvas-default)' },
]

export function getStoredCanvasBackdrop(): CanvasBackdropMode {
  try {
    const saved = (localStorage.getItem('firstpass_canvas_backdrop') || localStorage.getItem('photo_culler_canvas_backdrop')) as CanvasBackdropMode
    if (saved && ['black', 'dark', 'neutral', 'theme'].includes(saved)) {
      return saved
    }
  } catch {}
  return 'dark'
}

export function setStoredCanvasBackdrop(mode: CanvasBackdropMode) {
  try {
    localStorage.setItem('firstpass_canvas_backdrop', mode)
    localStorage.setItem('photo_culler_canvas_backdrop', mode)
  } catch {}
}
