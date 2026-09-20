import React from 'react';
import { usePhotosStore } from '../store/photosStore';
import FirstPassLoader from './FirstPassLoader';

interface ProgressModalProps {
  title?: string
  subtitle?: string
  progress?: number
  total?: number
  gpuActive?: boolean
  gpuType?: string
}

export default function ProgressModal(props: ProgressModalProps) {
  const { isScanning, scanProgress, isAnalyzing, analyzeProgress, gpuAvailable } = usePhotosStore();

  const title = props.title ?? (isScanning ? 'Scanning Folder...' : (isAnalyzing ? 'Analyzing Photos with AI...' : 'Processing...'));
  const progress = props.progress ?? (isScanning ? scanProgress : analyzeProgress);
  const total = props.total ?? 100;
  const gpuActive = props.gpuActive ?? gpuAvailable;

  if (!props.title && !isScanning && !isAnalyzing) return null;


  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="bg-card border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
        <FirstPassLoader size="lg" className="mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        
        <div className="w-full bg-gray-800 rounded-full h-3 mb-4 overflow-hidden">
          <div 
            className="bg-accent h-full transition-all duration-300"
            style={{ width: `${Math.max(5, progress)}%` }}
          />
        </div>
        
        <p className="text-gray-400 font-medium mb-6">
          {Math.round(progress)}% Complete
        </p>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800 text-sm font-medium">
          {gpuAvailable ? (
            <><span className="text-green-400">⚡</span> GPU Accelerated</>
          ) : (
            <><span className="text-gray-400">🖥️</span> CPU Mode</>
          )}
        </div>
      </div>
    </div>
  );
}
