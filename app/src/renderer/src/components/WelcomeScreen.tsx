import React from 'react';
import { Zap, Image as ImageIcon, Layers } from 'lucide-react';
import { usePhotosStore } from '../store/photosStore';
import ProgressModal from './ProgressModal';
import FirstPassLoader from './FirstPassLoader';

export default function WelcomeScreen({ onImport }: { onImport?: () => void }) {
  const { startScan, isScanning } = usePhotosStore();

  const handleImport = async () => {
    if (onImport) { onImport(); return; }
    const folderPath = await window.electronAPI?.openFolderDialog();
    if (folderPath) {
      await startScan(folderPath);
    }
  };


  return (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-background">
      {isScanning && <ProgressModal />}
      <div className="bg-card rounded-2xl p-12 max-w-2xl w-full text-center border border-gray-800 shadow-2xl">
        <FirstPassLoader size={88} className="mb-6" />
        
        <h1 className="text-4xl font-bold mb-4 text-white">Welcome to FirstPass</h1>
        <p className="text-xl text-gray-400 mb-10">
          Your shoot's first pass, done in minutes.
        </p>

        <button 
          onClick={handleImport}
          className="bg-accent hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-xl text-lg flex items-center justify-center gap-3 mx-auto transition-transform active:scale-95"
        >
          <span className="text-2xl">📁</span> Import Photo Folder
        </button>

        <div className="grid grid-cols-3 gap-6 mt-16 text-left">
          <div className="flex flex-col items-center text-center">
            <Zap className="text-yellow-500 mb-3" size={32} />
            <h3 className="font-semibold text-gray-200 mb-1">Blur & Exposure</h3>
            <p className="text-sm text-gray-500">Automatically detects out of focus or poorly exposed images.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <Layers className="text-purple-500 mb-3" size={32} />
            <h3 className="font-semibold text-gray-200 mb-1">Duplicate Grouping</h3>
            <p className="text-sm text-gray-500">Groups similar photos together so you can pick the best one.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <ImageIcon className="text-green-500 mb-3" size={32} />
            <h3 className="font-semibold text-gray-200 mb-1">Smart Scoring</h3>
            <p className="text-sm text-gray-500">Ranks photos by aesthetic and composition quality.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
