import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sliders, Trash2, AlertTriangle, FolderOpen, Cpu, Zap, Download, RefreshCw, Github, Sparkles, SlidersHorizontal, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { api } from '../api/client'
import type { Settings, UpdateCheckResponse } from '../types/photo'
import UpdateModal from '../components/UpdateModal'
import FirstPassLoader from '../components/FirstPassLoader'
import {
  CANVAS_BACKDROP_OPTIONS,
  getStoredCanvasBackdrop,
  setStoredCanvasBackdrop,
  CanvasBackdropMode
} from '../theme/themes'
import {
  getAllWorkspaces,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  PRESET_WORKSPACES,
  WorkspaceLayout
} from '../utils/workspaceManager'

function SliderRow({
  label, description, value, min, max, step = 1, unit = '',
  onChange,
}: {
  label: string; description: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void
}) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-sm font-medium text-neutral-200">{label}</label>
        <span className="text-sm text-blue-400 font-mono">{value}{unit}</span>
      </div>
      <p className="text-xs text-neutral-500 mb-2">{description}</p>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full bg-neutral-700 accent-blue-500 cursor-pointer"
      />
    </div>
  )
}

function ToggleRow({
  label, description, enabled, onChange
}: {
  label: string; description: string; enabled: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-neutral-800/80 last:border-b-0">
      <div className="pr-4">
        <div className="text-sm font-medium text-neutral-200">{label}</div>
        <div className="text-xs text-neutral-500 mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={clsx(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
          'outline-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-neutral-900',
          enabled ? 'bg-blue-600' : 'bg-neutral-700'
        )}
      >
        <span
          className={clsx(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
            enabled ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 rounded-xl p-5 mb-4 border border-neutral-800">
      <div className="flex items-center gap-2 mb-5">
        <Icon size={16} className="text-blue-400" />
        <h2 className="text-white font-semibold text-base">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  // Canvas Backdrop & Workspace layout settings
  const [backdrop, setBackdrop] = useState<CanvasBackdropMode>(getStoredCanvasBackdrop)
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(getActiveWorkspaceId)
  const [workspaces, setWorkspaces] = useState<WorkspaceLayout[]>(getAllWorkspaces)

  const [defaultHistogramMode, setDefaultHistogramMode] = useState<string>(() => {
    return localStorage.getItem('photo_culler_histogram_mode') || 'sidebar'
  })
  const [defaultFaceLoupeMode, setDefaultFaceLoupeMode] = useState<string>(() => {
    return localStorage.getItem('photo_culler_faceloupe_mode') || 'bottom'
  })
  const [defaultFilmstripPos, setDefaultFilmstripPos] = useState<string>(() => {
    return localStorage.getItem('photo_culler_filmstrip_position') || 'bottom'
  })

  const handleBackdropChange = (mode: CanvasBackdropMode) => {
    setBackdrop(mode)
    setStoredCanvasBackdrop(mode)
    window.electronAPI?.updateMenuState?.({ canvasBackdrop: mode })
    toast.success(`Canvas backdrop set to ${mode}`, { icon: '🎨' })
  }

  const handleWorkspaceChange = (id: string) => {
    setActiveWorkspaceIdState(id)
    setActiveWorkspaceId(id)
    window.electronAPI?.updateMenuState?.({ activeWorkspace: id })
    toast.success('Default workspace updated', { icon: '📐' })
  }

  const handleHistogramDefaultChange = (mode: string) => {
    setDefaultHistogramMode(mode)
    localStorage.setItem('photo_culler_histogram_mode', mode)
    toast.success(`Histogram default: ${mode}`)
  }

  const handleFaceLoupeDefaultChange = (mode: string) => {
    setDefaultFaceLoupeMode(mode)
    localStorage.setItem('photo_culler_faceloupe_mode', mode)
    toast.success(`Face Loupe default: ${mode}`)
  }

  const handleFilmstripDefaultChange = (pos: string) => {
    setDefaultFilmstripPos(pos)
    localStorage.setItem('photo_culler_filmstrip_position', pos)
    toast.success(`Filmstrip default: ${pos}`)
  }

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => toast.error('Failed to load settings'))
    api.getStats().then(setStats).catch(() => {})
  }, [])

  const updateField = (field: keyof Settings, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null)
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const res = await api.checkForUpdates()
      setUpdateInfo(res)
      if (res.has_update) {
        setShowUpdateModal(true)
      } else {
        toast.success(res.message || `You're on the latest version (v${res.current_version})!`)
      }
    } catch (err: any) {
      toast.error('Failed to check for updates: ' + (err.message || 'Network error'))
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await api.updateSettings(settings)
      toast.success('Settings saved!')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      await api.resetLibrary()
      toast.success('Library cleared!')
      setShowResetConfirm(false)
      navigate('/')
    } catch {
      toast.error('Failed to reset library')
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <FirstPassLoader size="sm" label="Loading preferences..." />
      </div>
    )
  }

  // Normalize weights so they display as percentages
  const totalWeight = settings.weight_blur + settings.weight_exposure +
    settings.weight_aesthetic + settings.weight_composition

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <div className="flex items-center justify-between px-6 py-4 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-blue-400" />
          <h1 className="text-white font-semibold text-lg">Settings</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pb-28 max-w-2xl mx-auto w-full">

        {/* Library stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Total Photos', value: stats.total, color: 'text-white' },
              { label: 'Accepted', value: stats.accepted, color: 'text-green-400' },
              { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 text-center">
                <div className={`text-2xl font-bold ${color}`}>{value?.toLocaleString()}</div>
                <div className="text-neutral-500 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* AI Features & Modules Toggle Switches */}
        <Section title="AI Features & Modules" icon={Sparkles}>
          <p className="text-xs text-neutral-400 mb-4">
            Turn individual AI features on or off at any time to match your shooting style and culling workflow.
          </p>
          <div className="space-y-1">
            <ToggleRow
              label="👁️ Blink & Closed-Eye Detection"
              description="Identifies subjects with closed or blinking eyes and flags them for rejection."
              enabled={settings.enable_blink_detection ?? true}
              onChange={v => updateField('enable_blink_detection', v)}
            />
            <ToggleRow
              label="😊 Smile & Flattering Expression Scoring"
              description="Evaluates facial curvature to ensure flattering smiles and avoid mid-speech grimaces."
              enabled={settings.enable_smile_detection ?? true}
              onChange={v => updateField('enable_smile_detection', v)}
            />
            <ToggleRow
              label="👥 Group Consistency Scoring"
              description="Ensures maximum number of subjects in large groups have open eyes and smiles simultaneously."
              enabled={settings.enable_group_consistency ?? true}
              onChange={v => updateField('enable_group_consistency', v)}
            />
            <ToggleRow
              label="✨ Intentional Bokeh (Shallow DoF) Recognition"
              description="Distinguishes between intentional creamy backgrounds (f/1.4 - f/2.8) and true missed focus."
              enabled={settings.enable_bokeh_detection ?? true}
              onChange={v => updateField('enable_bokeh_detection', v)}
            />
            <ToggleRow
              label="📸 Camera Shake & Slow Shutter Warning"
              description="Detects directional motion blur and warns when shutter speed was too slow for handheld capture."
              enabled={settings.enable_camera_shake ?? true}
              onChange={v => updateField('enable_camera_shake', v)}
            />
            <ToggleRow
              label="👑 Burst Grouping & Best Pick Leader"
              description="Clusters high-speed bursts and crowns the single best leader photo with a 👑 Best Pick badge."
              enabled={settings.enable_burst_grouping ?? true}
              onChange={v => updateField('enable_burst_grouping', v)}
            />
            <ToggleRow
              label="📖 Story Arc & Chronological Chapters"
              description="Segments shoots into chronological storyline chapters (e.g. Chapter 1 · 10:00 AM) based on shooting pauses."
              enabled={settings.enable_scene_chapters ?? true}
              onChange={v => updateField('enable_scene_chapters', v)}
            />
            <ToggleRow
              label="🎬 Genre-Specific Awareness"
              description="Customizes AI culling intelligence for Weddings, Sports/Action, Concerts/Stage, and Flat-Lay details."
              enabled={settings.enable_genre_awareness ?? true}
              onChange={v => updateField('enable_genre_awareness', v)}
            />
            <ToggleRow
              label="💡 Explainable AI & Score Breakdown"
              description="Generates plain-English explanations and transparent scoring factors for every cull decision."
              enabled={settings.enable_explainable_ai ?? true}
              onChange={v => updateField('enable_explainable_ai', v)}
            />
            <ToggleRow
              label="🧠 Adaptive Preference Learning"
              description="Dynamically adapts AI acceptance and sharpness thresholds to your taste as you accept/reject."
              enabled={settings.enable_preference_learning ?? true}
              onChange={v => updateField('enable_preference_learning', v)}
            />

            {/* Shoot Genre Profile Selector */}
            <div className="py-3 border-b border-neutral-800/80">
              <div className="flex justify-between items-baseline mb-1">
                <label className="text-sm font-medium text-neutral-200">Default Shoot Genre</label>
              </div>
              <p className="text-xs text-neutral-500 mb-2">Sets the default shooting genre profile for new image scans.</p>
              <select
                value={settings.active_shoot_genre || 'general'}
                onChange={e => updateField('active_shoot_genre', e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="general">General / Automatic Detection</option>
                <option value="wedding">Wedding & Events (Prioritizes VIP expressions, details, candids)</option>
                <option value="sports">Sports & Action (Preserves peak action, fast motion, jersey clarity)</option>
                <option value="documentary">Documentary & Street (Protects emotional laughter & tears)</option>
                <option value="commercial">Commercial & Product (Micro-texture & geometric symmetry)</option>
              </select>
            </div>
          </div>

          {/* Learned Preferences Reset */}
          {((settings.learned_blur_bias && settings.learned_blur_bias !== 0) ||
            (settings.learned_accept_bias && settings.learned_accept_bias !== 0)) && (
            <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-neutral-400">
                Current style bias: {(settings.learned_accept_bias ?? 0) > 0 ? `+${(settings.learned_accept_bias ?? 0).toFixed(1)}` : (settings.learned_accept_bias ?? 0).toFixed(1)} accept, {(settings.learned_blur_bias ?? 0) > 0 ? `+${(settings.learned_blur_bias ?? 0).toFixed(1)}` : (settings.learned_blur_bias ?? 0).toFixed(1)} blur
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.resetLearning()
                    updateField('learned_blur_bias', 0.0)
                    updateField('learned_accept_bias', 0.0)
                    toast.success('Learned preference biases reset!')
                  } catch {
                    toast.error('Failed to reset learned biases')
                  }
                }}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs border border-neutral-700 transition-colors"
              >
                Reset Learned Preferences
              </button>
            </div>
          )}
        </Section>

        <Section title="Analysis Thresholds" icon={Sliders}>
          <SliderRow
            label="Target Delivery Quota ('Magic Number')"
            description="Default target number of photos to accept when applying automated target delivery."
            value={settings.target_delivery_count ?? 500} min={50} max={2000} step={25}
            onChange={v => updateField('target_delivery_count', v)}
          />
          <SliderRow
            label="Blur Threshold"
            description="Photos with a sharpness score below this will be marked as blurry. Lower = stricter."
            value={settings.blur_threshold} min={5} max={80} step={1}
            onChange={v => updateField('blur_threshold', v)}
          />
          <SliderRow
            label="Auto-Accept Score"
            description="Photos scoring above this are automatically accepted as keepers."
            value={settings.auto_accept_threshold} min={50} max={100} step={1} unit="/100"
            onChange={v => updateField('auto_accept_threshold', v)}
          />
          <SliderRow
            label="Auto-Reject Score"
            description="Photos scoring below this are automatically flagged for rejection."
            value={settings.min_overall_score} min={0} max={50} step={1} unit="/100"
            onChange={v => updateField('min_overall_score', v)}
          />
          <SliderRow
            label="Duplicate Sensitivity"
            description="How similar two photos must be to be grouped as duplicates. Lower = stricter matching."
            value={settings.duplicate_hash_distance} min={1} max={30} step={1}
            onChange={v => updateField('duplicate_hash_distance', v)}
          />
          <SliderRow
            label="Burst Sequence Window"
            description="Photos taken within this timeframe will be grouped into a burst series and evaluated for Best Pick."
            value={settings.burst_time_threshold ?? 2.0} min={0.5} max={10.0} step={0.5} unit="s"
            onChange={v => updateField('burst_time_threshold', v)}
          />
        </Section>

        <Section title="Score Weights" icon={Sliders}>
          <p className="text-xs text-neutral-500 mb-4">
            Adjust how much each factor contributes to the overall quality score.
            {totalWeight > 0 && ` Current total: ${Math.round(totalWeight * 100)}% (will be normalized automatically).`}
          </p>
          <SliderRow
            label="Sharpness (Blur)"
            description="How much blur detection affects the overall score."
            value={Math.round(settings.weight_blur * 100)} min={0} max={100} step={5} unit="%"
            onChange={v => updateField('weight_blur', v / 100)}
          />
          <SliderRow
            label="Exposure"
            description="How much proper exposure (not too dark, not too bright) affects the score."
            value={Math.round(settings.weight_exposure * 100)} min={0} max={100} step={5} unit="%"
            onChange={v => updateField('weight_exposure', v / 100)}
          />
          <SliderRow
            label="Aesthetic Quality"
            description="How much the AI perceptual quality score (BRISQUE) affects the result."
            value={Math.round(settings.weight_aesthetic * 100)} min={0} max={100} step={5} unit="%"
            onChange={v => updateField('weight_aesthetic', v / 100)}
          />
          <SliderRow
            label="Composition"
            description="How much subject placement and horizon straightness affects the score."
            value={Math.round(settings.weight_composition * 100)} min={0} max={100} step={5} unit="%"
            onChange={v => updateField('weight_composition', v / 100)}
          />
        </Section>

        <Section title="Performance" icon={settings.gpu_enabled ? Zap : Cpu}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm font-medium text-neutral-200">GPU Acceleration</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                Uses your graphics card to analyze photos much faster. Requires NVIDIA (Windows) or Apple Silicon (Mac).
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.gpu_enabled}
              onClick={() => updateField('gpu_enabled', !settings.gpu_enabled)}
              className={clsx(
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                'outline-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-neutral-900',
                settings.gpu_enabled ? 'bg-blue-600' : 'bg-neutral-700'
              )}
            >
              <span
                className={clsx(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                  settings.gpu_enabled ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
          <SliderRow
            label="Thumbnail Size"
            description="Size in pixels of the gallery thumbnails. Larger = more detail, uses more memory."
            value={settings.thumbnail_size} min={150} max={600} step={50} unit="px"
            onChange={v => updateField('thumbnail_size', v)}
          />
        </Section>

        {/* GitHub Updates & Releases */}
        <Section title="Software Updates & Releases" icon={Github}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-200 block mb-1">
                GitHub Repository
              </label>
              <p className="text-xs text-neutral-500 mb-2">
                Repository identifier for checking releases and downloading in-place app updates (e.g. owner/repo).
              </p>
              <input
                type="text"
                value={settings.github_repo || ''}
                placeholder="username/firstpass"
                onChange={e => updateField('github_repo', e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-neutral-800">
              <div>
                <div className="text-sm font-medium text-neutral-200">GitHub In-App Auto-Updater</div>
                <div className="text-xs text-neutral-500">
                  Checks for newer versions and allows streaming download with one-click in-place installation.
                </div>
              </div>
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20"
              >
                <RefreshCw size={14} className={checkingUpdate ? 'animate-spin' : ''} />
                {checkingUpdate ? 'Checking...' : 'Check for Updates'}
              </button>
            </div>
          </div>
        </Section>

        {/* Workspace & Canvas Display Settings */}
        <Section title="Workspace & Canvas Display" icon={SlidersHorizontal}>
          {/* Canvas Backdrop Color Swatches */}
          <div className="py-3 border-b border-neutral-800/80">
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-sm font-medium text-neutral-200">Canvas Backdrop Tone</label>
              <span className="text-xs text-neutral-400 capitalize">{backdrop}</span>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              Surround color behind the photograph in Review mode. 18% neutral gray prevents perceived contrast shifts during color evaluation.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CANVAS_BACKDROP_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleBackdropChange(opt.id)}
                  className={clsx(
                    'flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer',
                    backdrop === opt.id
                      ? 'bg-neutral-800 border-blue-500 text-white shadow-md ring-1 ring-blue-500/50'
                      : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200'
                  )}
                >
                  <div
                    className="w-5 h-5 rounded-full border border-neutral-600 shrink-0 shadow-inner flex items-center justify-center"
                    style={{ backgroundColor: opt.color }}
                  >
                    {backdrop === opt.id && <Check size={11} className={opt.id === 'neutral' ? 'text-neutral-900' : 'text-white'} />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{opt.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Active Workspace Layout */}
          <div className="py-3 border-b border-neutral-800/80">
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-sm font-medium text-neutral-200">Default Workspace Layout</label>
            </div>
            <p className="text-xs text-neutral-500 mb-2">
              Choose the default multi-zone layout applied when opening the Studio Review stage.
            </p>
            <select
              value={activeWorkspaceId}
              onChange={e => handleWorkspaceChange(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>
                  {ws.name} {ws.isPreset ? '(Preset)' : '(Custom)'}
                </option>
              ))}
            </select>
          </div>

          {/* Default Panel Placements */}
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Histogram Placement</label>
              <select
                value={defaultHistogramMode}
                onChange={e => handleHistogramDefaultChange(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="sidebar">Inspector Sidebar (Docked)</option>
                <option value="floating">Floating Window (Draggable)</option>
                <option value="hidden">Hidden by Default</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Face Loupe Placement</label>
              <select
                value={defaultFaceLoupeMode}
                onChange={e => handleFaceLoupeDefaultChange(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="bottom">Bottom Stage Bar (Default)</option>
                <option value="sidebar">Inspector Sidebar</option>
                <option value="floating">Floating Window</option>
                <option value="hidden">Hidden by Default</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Filmstrip Position</label>
              <select
                value={defaultFilmstripPos}
                onChange={e => handleFilmstripDefaultChange(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="bottom">Bottom Strip</option>
                <option value="side">Left Side Vertical</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>
          </div>
        </Section>

        {/* Danger zone */}
        <div className="bg-red-950/30 rounded-xl p-5 border border-red-900/50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-400" />
            <h2 className="text-red-300 font-semibold">Danger Zone</h2>
          </div>
          <p className="text-sm text-neutral-400 mb-4">
            Clear all photo records from the library. This does <strong>not</strong> delete your actual photo files.
            Your settings will be preserved.
          </p>

          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/50 hover:bg-red-800/70 text-red-300 text-sm rounded-lg border border-red-700/50 transition-colors"
            >
              <Trash2 size={14} /> Clear Library
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-red-400 text-sm font-medium">Are you sure?</span>
              <button onClick={handleReset}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg">
                Yes, clear it
              </button>
              <button onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded-lg">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="h-8" />
      </div>

      {showUpdateModal && updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  )
}
