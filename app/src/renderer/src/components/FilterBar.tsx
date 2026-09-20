import React, { useEffect } from 'react'
import { usePhotosStore } from '../store/photosStore'
import { Search, X, RotateCcw, Folder, ChevronDown, Maximize2, Minimize2 } from 'lucide-react'
import clsx from 'clsx'

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: '✓ Accepted' },
  { value: 'rejected', label: '✕ Rejected' },
]

const SORT_OPTIONS = [
  { value: 'overall_score_desc', label: 'Best Score First' },
  { value: 'overall_score_asc', label: 'Worst Score First' },
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'filename_asc', label: 'Filename A–Z' },
  { value: 'blur_score_asc', label: 'Blurriest First' },
]

export default function FilterBar() {
  const { filters, setFilters, folders, loadFolders, fitMode, setFitMode } = usePhotosStore()

  useEffect(() => {
    loadFolders()
  }, [])

  // Calculate if any custom filter is active
  const hasActiveFilters = Boolean(
    filters.search ||
    filters.status ||
    filters.folder ||
    filters.is_blurry !== undefined ||
    filters.is_bokeh !== undefined ||
    filters.exposure_type ||
    filters.has_faces !== undefined ||
    filters.min_face_count !== undefined ||
    filters.max_face_count !== undefined ||
    filters.has_closed_eyes !== undefined ||
    filters.is_smiling !== undefined ||
    filters.is_detail_shot !== undefined ||
    filters.is_motion_intentional !== undefined ||
    filters.shoot_genre ||
    filters.duplicate_only ||
    filters.burst_only ||
    filters.is_burst_leader !== undefined ||
    filters.is_raw !== undefined ||
    filters.is_tagged !== undefined ||
    filters.min_score !== undefined
  )

  const handleClearAll = () => {
    setFilters({
      search: undefined,
      status: '',
      folder: undefined,
      min_score: undefined,
      is_blurry: undefined,
      is_bokeh: undefined,
      exposure_type: undefined,
      has_faces: undefined,
      min_face_count: undefined,
      max_face_count: undefined,
      has_closed_eyes: undefined,
      is_smiling: undefined,
      is_detail_shot: undefined,
      is_motion_intentional: undefined,
      shoot_genre: undefined,
      duplicate_only: undefined,
      burst_only: undefined,
      is_burst_leader: undefined,
      is_raw: undefined,
      is_tagged: undefined,
      scene_id: undefined,
    })
  }

  const chip = (active: boolean, label: string, onClick: () => void, title?: string) => (
    <button
      key={label}
      onClick={onClick}
      title={title}
      className={clsx(
        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer flex-shrink-0',
        active
          ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/25'
          : 'bg-neutral-850/80 border-neutral-700/70 text-neutral-300 hover:text-white hover:border-neutral-500 hover:bg-neutral-800'
      )}
    >
      <span>{label}</span>
      {active && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
    </button>
  )

  return (
    <div className="flex flex-col border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md flex-shrink-0">
      {/* Tier 1: Primary Controls (Search, Folders, Genre, Status, Fit, Sort) */}
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-neutral-800/60 overflow-x-auto">
        {/* Instant Search input */}
        <div className="relative flex items-center flex-shrink-0">
          <Search size={13} className="absolute left-2.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={e => setFilters({ search: e.target.value || undefined })}
            placeholder="Search name, camera..."
            className="w-44 bg-neutral-950 border border-neutral-700/80 rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:w-56 transition-all"
          />
          {filters.search && (
            <button
              onClick={() => setFilters({ search: undefined })}
              className="absolute right-2 text-neutral-400 hover:text-white text-xs"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Folder Switcher Dropdown */}
        {folders.length > 0 && (
          <div className="relative flex items-center flex-shrink-0">
            <Folder size={12} className={clsx("absolute left-2.5 pointer-events-none", filters.folder ? "text-blue-400" : "text-neutral-400")} />
            <select
              value={filters.folder || ''}
              onChange={e => setFilters({ folder: e.target.value || undefined })}
              className={clsx(
                "border rounded-lg pl-7 pr-6 py-1 text-xs appearance-none cursor-pointer focus:outline-none transition-all max-w-[180px] truncate",
                filters.folder
                  ? "bg-blue-950/60 border-blue-500 text-blue-200 font-medium"
                  : "bg-neutral-950 border-neutral-700/80 text-neutral-300 hover:border-neutral-500"
              )}
              title={filters.folder ? `Showing folder: ${filters.folder}` : 'Showing all folders'}
            >
              <option value="">📁 All Folders ({folders.reduce((acc, f) => acc + f.count, 0)})</option>
              {folders.map(f => (
                <option key={f.path} value={f.path}>
                  📁 {f.name} ({f.count})
                </option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 text-neutral-400 pointer-events-none" />
          </div>
        )}

        {/* Shoot Genre Profile Selector */}
        <div className="relative flex items-center flex-shrink-0">
          <select
            value={filters.shoot_genre || ''}
            onChange={e => setFilters({ shoot_genre: e.target.value || undefined })}
            className={clsx(
              "border rounded-lg pl-2.5 pr-6 py-1 text-xs appearance-none cursor-pointer focus:outline-none transition-all max-w-[150px] truncate",
              filters.shoot_genre
                ? "bg-purple-950/60 border-purple-500 text-purple-200 font-medium"
                : "bg-neutral-950 border-neutral-700/80 text-neutral-300 hover:border-neutral-500"
            )}
            title="Filter by shoot genre profile"
          >
            <option value="">🎬 All Genres</option>
            <option value="wedding">💒 Wedding & Event</option>
            <option value="sports">🏎️ Sports & Action</option>
            <option value="documentary">📸 Candid & Doc</option>
            <option value="commercial">💍 Commercial / Detail</option>
          </select>
          <ChevronDown size={11} className="absolute right-2 text-neutral-400 pointer-events-none" />
        </div>

        <div className="w-px h-4 bg-neutral-800 mx-1 flex-shrink-0" />

        {/* Status segmented control */}
        <div className="flex items-center bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 flex-shrink-0">
          {STATUS_OPTIONS.map(opt => {
            const isSelected = filters.status === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setFilters({ status: opt.value })}
                className={clsx(
                  'px-2.5 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer',
                  isSelected
                    ? opt.value === 'accepted'
                      ? 'bg-emerald-600 text-white font-semibold shadow'
                      : opt.value === 'rejected'
                      ? 'bg-rose-700 text-white font-semibold shadow'
                      : 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-neutral-200'
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 min-w-4" />

        {/* Fit vs Fill Frame Toggle */}
        <div className="flex items-center bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 flex-shrink-0 text-xs text-neutral-400">
          <button
            onClick={() => setFitMode('contain')}
            className={clsx(
              'flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer',
              fitMode === 'contain' ? 'bg-neutral-800 text-white font-medium' : 'hover:text-neutral-200'
            )}
            title="Fit whole photo (letterboxed, no cropping)"
          >
            <Minimize2 size={11} />
            <span>Fit</span>
          </button>
          <button
            onClick={() => setFitMode('cover')}
            className={clsx(
              'flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer',
              fitMode === 'cover' ? 'bg-neutral-800 text-white font-medium' : 'hover:text-neutral-200'
            )}
            title="Fill grid cell (cropped)"
          >
            <Maximize2 size={11} />
            <span>Fill</span>
          </button>
        </div>

        {/* Sort dropdown */}
        <select
          value={filters.sort_by || 'overall_score_desc'}
          onChange={e => setFilters({ sort_by: e.target.value })}
          className="bg-neutral-950 border border-neutral-700 text-neutral-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500 flex-shrink-0"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Tier 2: Scrollable Feature Filters */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 overflow-x-auto">
        {/* Clear all active filters button */}
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs text-rose-300 hover:text-white px-2.5 py-1 rounded-full border border-rose-800/80 bg-rose-950/60 transition-colors cursor-pointer flex-shrink-0"
            title="Clear all search filters and reset"
          >
            <RotateCcw size={11} />
            <span>Clear Filters</span>
          </button>
        )}

        {chip(filters.is_tagged === true, '🏷️ Tagged', () =>
          setFilters({ is_tagged: filters.is_tagged === true ? undefined : true })
        , 'Show only tagged photos (\\)')}
        {chip(filters.is_burst_leader === true, '👑 Best Picks', () =>
          setFilters({ is_burst_leader: filters.is_burst_leader === true ? undefined : true })
        , 'Show burst sequence leaders')}
        {chip(filters.is_smiling === true, '😊 Smiling', () =>
          setFilters({ is_smiling: filters.is_smiling === true ? undefined : true })
        , 'Show smiling subjects')}
        {chip(filters.is_bokeh === true, '✨ Bokeh (Sharp)', () =>
          setFilters({ is_bokeh: filters.is_bokeh === true ? undefined : true })
        , 'Show photos with intentional shallow depth-of-field')}
        {chip(filters.is_detail_shot === true, '💍 Flat-Lays', () =>
          setFilters({ is_detail_shot: filters.is_detail_shot === true ? undefined : true })
        , 'Show flat-lay and macro detail shots')}
        {chip(filters.is_motion_intentional === true, '🏎️ Action Motion', () =>
          setFilters({ is_motion_intentional: filters.is_motion_intentional === true ? undefined : true })
        , 'Show intentional action motion blur')}
        {chip(filters.has_closed_eyes === true, '🙈 Blinks', () =>
          setFilters({ has_closed_eyes: filters.has_closed_eyes === true ? undefined : true })
        , 'Show subjects with closed or blinking eyes')}
        {chip(filters.is_blurry === true, '🌫 Blurry', () =>
          setFilters({ is_blurry: filters.is_blurry === true ? undefined : true })
        , 'Show blurry photos')}
        {chip(filters.exposure_type === 'underexposed', '🌑 Too Dark', () =>
          setFilters({ exposure_type: filters.exposure_type === 'underexposed' ? undefined : 'underexposed' })
        )}
        {chip(filters.exposure_type === 'overexposed', '☀️ Too Bright', () =>
          setFilters({ exposure_type: filters.exposure_type === 'overexposed' ? undefined : 'overexposed' })
        )}
        {chip(filters.has_faces === true, '👤 People', () =>
          setFilters({ has_faces: filters.has_faces === true ? undefined : true })
        )}
        {chip(
          filters.max_face_count === 1 && filters.min_face_count === 1,
          '🧍 Solo',
          () => {
            const isActive = filters.max_face_count === 1 && filters.min_face_count === 1
            setFilters({ min_face_count: isActive ? undefined : 1, max_face_count: isActive ? undefined : 1 })
          },
          'Show only solo portraits (1 person)'
        )}
        {chip(
          filters.max_face_count === 2 && filters.min_face_count === 2,
          '👫 Pairs',
          () => {
            const isActive = filters.max_face_count === 2 && filters.min_face_count === 2
            setFilters({ min_face_count: isActive ? undefined : 2, max_face_count: isActive ? undefined : 2 })
          },
          'Show only pair portraits (2 people)'
        )}
        {chip(
          filters.min_face_count !== undefined && filters.min_face_count >= 3 && filters.max_face_count === undefined,
          '👨👩👧 Groups',
          () => {
            const isActive = filters.min_face_count !== undefined && filters.min_face_count >= 3
            setFilters({ min_face_count: isActive ? undefined : 3, max_face_count: isActive ? undefined : undefined })
          },
          'Show group photos (3+ people)'
        )}
        {chip(filters.duplicate_only === true, '🔁 Duplicates', () =>
          setFilters({ duplicate_only: filters.duplicate_only === true ? undefined : true })
        )}
        {chip(filters.burst_only === true, '⚡ Bursts', () =>
          setFilters({ burst_only: filters.burst_only === true ? undefined : true })
        )}
        {chip(filters.is_raw === true, 'RAW', () =>
          setFilters({ is_raw: filters.is_raw === true ? undefined : true })
        )}
      </div>
    </div>
  )
}
