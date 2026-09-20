import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { usePhotosStore } from './store/photosStore';
import { Settings as SettingsIcon, LayoutGrid, Columns, Download, HelpCircle, Eye, Palette } from 'lucide-react';
import Gallery from './pages/Gallery';
import Review from './pages/Review';
import Settings from './pages/Settings';
import Compare from './pages/Compare';
import WelcomeScreen from './components/WelcomeScreen';
import UpdateModal from './components/UpdateModal';
import ShortcutsModal from './components/ShortcutsModal';
import ThemePickerModal from './components/ThemePickerModal';
import { applyTheme, getStoredThemeId } from './theme/themes';
import { api } from './api/client';
import toast from 'react-hot-toast';
import type { UpdateCheckResponse } from './types/photo';
import FirstPassLoader from './components/FirstPassLoader';

export default function App() {
  const {
    checkHealth, fetchPhotos, backendReady, totalPhotos, gpuAvailable,
    activePhotoId, lastReviewedPhotoId, photos, startScan, undo, redo,
    autoAdvance, toggleAutoAdvance
  } = usePhotosStore();
  const [retrying, setRetrying] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize selected studio dark theme immediately
  useEffect(() => {
    applyTheme(getStoredThemeId());
  }, []);

  useEffect(() => {
    let retries = 0;
    let cancelled = false;

    const interval = setInterval(async () => {
      await checkHealth();
      const state = usePhotosStore.getState();
      if (state.backendReady) {
        clearInterval(interval);
        try {
          await fetchPhotos();
        } catch {
          // ignore
        }
        if (!cancelled) {
          setRetrying(false);
        }

        // Silent background check for updates
        api.checkForUpdates()
          .then((res) => {
            if (res && res.has_update && !cancelled) {
              setUpdateInfo(res);
            }
          })
          .catch(() => {});
      } else if (retries > 30) {
        clearInterval(interval);
        if (!cancelled) {
          setRetrying(false);
        }
      }
      retries++;
    }, 400);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Global shortcut '?' and IPC event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const cleanShortcuts = window.electronAPI?.onOpenShortcuts?.(() => {
      setShowShortcutsModal(true);
    });
    const cleanNavigate = window.electronAPI?.onNavigateTo?.((route: string) => {
      navigate(route);
    });

    // Native Application Menu Action Listener
    const cleanMenu = window.electronAPI?.onMenuAction?.(async (action: string, payload?: any) => {
      switch (action) {
        case 'navigate-gallery':
          handleGoGallery();
          break;
        case 'navigate-review':
          handleGoReview();
          break;
        case 'navigate-compare':
          handleGoCompare();
          break;
        case 'navigate-settings':
          navigate('/settings');
          break;
        case 'navigate':
          if (payload) navigate(payload);
          break;
        case 'open-shortcuts':
          setShowShortcutsModal(true);
          break;
        case 'check-updates': {
          toast('Checking for updates...', { icon: '🔄', id: 'check-updates' });
          try {
            const res = await api.checkForUpdates();
            if (res && res.has_update) {
              setUpdateInfo(res);
              setShowUpdateModal(true);
            } else {
              toast.success('FirstPass is up to date!');
            }
          } catch {
            toast.error('Could not check for updates');
          }
          break;
        }
        case 'open-theme-modal':
          setShowThemeModal(true);
          break;
        case 'set-theme':
          if (payload) {
            applyTheme(payload);
            window.electronAPI?.updateMenuState?.({ activeTheme: payload });
          }
          break;
        case 'import-folder': {
          const folderPath = await window.electronAPI?.openFolderDialog();
          if (folderPath) {
            try {
              await startScan(folderPath, false);
              navigate('/');
            } catch (err: any) {
              toast.error(err.message || 'Failed to scan folder');
            }
          }
          break;
        }
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'toggle-auto-advance':
          toggleAutoAdvance();
          break;
      }

      // Dispatch to active workspace page for screen-specific actions
      window.dispatchEvent(new CustomEvent('app:menu-action', { detail: { action, payload } }));
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cleanShortcuts?.();
      cleanNavigate?.();
      cleanMenu?.();
    };
  }, [navigate, activePhotoId, lastReviewedPhotoId, photos, undo, redo, toggleAutoAdvance, startScan]);

  // Sync menu state whenever route or autoAdvance changes
  useEffect(() => {
    window.electronAPI?.updateMenuState?.({
      currentRoute: location.pathname,
      activeTheme: getStoredThemeId(),
      autoAdvance
    });
  }, [location.pathname, autoAdvance]);

  if (retrying) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background flex-col gap-6 select-none animate-fadeIn">
        <FirstPassLoader size="lg" speed="slow" />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1">
            First<span className="text-emerald-400 font-extrabold">Pass</span>
          </h1>
          <p className="text-xs text-neutral-400 tracking-wide font-medium flex items-center gap-1.5">
            <span>Connecting to AI Engine</span>
            <span className="inline-flex items-center space-x-1 ml-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (!backendReady) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background flex-col gap-6 select-none p-6">
        <FirstPassLoader size="lg" animating={false} />
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1">
            First<span className="text-emerald-400 font-extrabold">Pass</span>
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Could not connect to the local AI engine. Please verify the backend service is running.
          </p>
          <button
            onClick={() => {
              setRetrying(true);
              checkHealth().then(async () => {
                const state = usePhotosStore.getState();
                if (state.backendReady) {
                  await fetchPhotos();
                }
                setRetrying(false);
              });
            }}
            className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const handleGoGallery = () => {
    navigate('/');
  };

  const handleGoReview = () => {
    const targetId = activePhotoId || lastReviewedPhotoId || photos[0]?.id;
    if (targetId) {
      navigate(`/review/${targetId}`);
    } else {
      navigate('/');
    }
  };

  const handleGoCompare = () => {
    const targetId = activePhotoId || lastReviewedPhotoId || photos[0]?.id;
    if (targetId && photos.length > 1) {
      const idx = photos.findIndex((p) => p.id === targetId);
      const neighborIdx = idx > 0 ? idx - 1 : Math.min(photos.length - 1, idx + 1);
      navigate(`/compare?ids=${photos[neighborIdx]?.id},${targetId}&returnTo=${location.pathname}`);
    } else {
      navigate('/compare');
    }
  };

  return (
    <div className="flex h-screen bg-background text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-16 bg-panel border-r border-gray-800 flex flex-col items-center py-4 gap-4 z-50 shrink-0">
        <button
          onClick={handleGoGallery}
          title="Gallery Grid (G)"
          className={`p-3 rounded-xl transition-all relative cursor-pointer ${
            location.pathname === '/'
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <LayoutGrid size={22} />
        </button>

        <button
          onClick={handleGoReview}
          title="Single Photo Review (Enter)"
          className={`p-3 rounded-xl transition-all relative cursor-pointer ${
            location.pathname.startsWith('/review')
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Eye size={22} />
        </button>

        <button
          onClick={handleGoCompare}
          title="Side-by-Side Compare (C)"
          className={`p-3 rounded-xl transition-all relative cursor-pointer ${
            location.pathname.startsWith('/compare')
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Columns size={22} />
        </button>

        <div className="flex-1" />

        {/* Studio Themes Modal Button */}
        <button
          onClick={() => setShowThemeModal(true)}
          title="Studio Themes & Dark Presets"
          className="p-3 rounded-xl transition-all text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
        >
          <Palette size={22} />
        </button>

        {/* In-app update available badge */}
        {updateInfo?.has_update && (
          <button
            onClick={() => setShowUpdateModal(true)}
            className="relative p-3 rounded-xl bg-accent/20 hover:bg-accent text-accent hover:text-white transition-all group"
            title={`Update Available: v${updateInfo.latest_version} (Click to install)`}
          >
            <Download size={20} className="animate-bounce" />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-panel" />
          </button>
        )}

        {/* GPU status dot */}
        <div className="relative group flex items-center justify-center">
          <div className={`w-3 h-3 rounded-full ${gpuAvailable ? 'bg-green-500' : 'bg-gray-500'}`} />
          <div className="absolute left-12 w-max bg-gray-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {gpuAvailable ? 'GPU Active' : 'CPU Mode'}
          </div>
        </div>

        {/* Keyboard Shortcuts Help Button */}
        <button
          onClick={() => setShowShortcutsModal(true)}
          title="Keyboard Shortcuts (?)"
          className="p-3 rounded-xl transition-all text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
        >
          <HelpCircle size={22} />
        </button>

        <button
          onClick={() => navigate('/settings')}
          title="Settings"
          className={`p-3 rounded-xl transition-all cursor-pointer ${
            location.pathname === '/settings'
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <SettingsIcon size={22} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden">
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/review/:id" element={<Review />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>

      {/* In-App Update Modal */}
      {showUpdateModal && updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          onClose={() => setShowUpdateModal(false)}
        />
      )}

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      <ShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Studio Themes Picker Modal */}
      <ThemePickerModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
      />
    </div>
  );
}
