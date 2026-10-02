import { DragEvent } from 'react';
import { FolderDown } from 'lucide-react';

interface DragDropOverlayProps {
  isVisible?: boolean;
  isDragging?: boolean;
  onDropPath?: (folderPath: string) => void;
}

export default function DragDropOverlay({ isVisible, isDragging, onDropPath }: DragDropOverlayProps) {
  const visible = isVisible ?? isDragging ?? false;

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedPath = (e.dataTransfer.files[0] as (File & { path?: string }) | undefined)?.path;
    if (droppedPath && onDropPath) {
      onDropPath(droppedPath);
    }
  };

  return (
    <div
      data-testid="drag-drop-overlay"
      aria-hidden={!visible}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`fixed inset-0 z-[100] bg-black/80 backdrop-blur-md transition-all duration-200 ease-out ${
        visible ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      }`}
    >
      {/* Glowing animated neon border */}
      <div className="border-2 border-blue-500/80 shadow-[0_0_60px_rgba(59,130,246,0.35)] rounded-2xl m-4 inset-0 absolute pointer-events-none animate-pulse" />

      {/* Centered glowing card */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-4 px-12 py-10 rounded-3xl bg-gray-900/80 border border-blue-500/30 shadow-[0_0_80px_rgba(59,130,246,0.25)] backdrop-blur-xl">
          {/* Pulsing folder icon with blue/purple gradient glow ring */}
          <div className="relative">
            <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 opacity-60 blur-lg animate-pulse" />
            <div className="relative p-5 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-blue-400/40 animate-pulse">
              <FolderDown size={48} className="text-blue-300" />
            </div>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-white mt-2">
            Drop Folder to Cull
          </h2>
          <p className="text-sm text-neutral-400 tracking-wide">
            RAW (CR3, ARW, NEF, etc.), JPEG, PNG, TIFF directories
          </p>

          <div className="flex flex-col items-center gap-2 mt-2">
            <span className="px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-lg shadow-blue-900/50">
              Import Folder
            </span>
            <span className="text-xs text-neutral-500 italic">
              Release anywhere to start AI scan
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
