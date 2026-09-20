import React from 'react';

interface FirstPassLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  animating?: boolean;
  speed?: 'slow' | 'normal' | 'fast';
  label?: string;
  className?: string;
}

export default function FirstPassLoader({
  size = 'md',
  animating = true,
  speed = 'slow',
  label,
  className = ''
}: FirstPassLoaderProps) {
  const pixelSize = typeof size === 'number' 
    ? size 
    : size === 'sm' ? 40 : size === 'md' ? 72 : size === 'lg' ? 96 : 128;

  const durationSec = speed === 'slow' ? 3.6 : speed === 'fast' ? 1.4 : 2.4;

  return (
    <div className={`inline-flex flex-col items-center justify-center select-none ${className}`}>
      <div 
        className="relative flex items-center justify-center"
        style={{ width: pixelSize, height: pixelSize }}
      >
        {/* Ambient Pulse Glow */}
        {animating && (
          <div 
            className="absolute inset-0 rounded-full blur-xl pointer-events-none opacity-40 animate-pulse"
            style={{
              background: 'radial-gradient(circle, rgba(16,185,129,0.45) 0%, rgba(16,185,129,0) 70%)',
              animationDuration: `${durationSec}s`
            }}
          />
        )}

        {/* SVG Aperture Iris & Pass Checkmark */}
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full relative z-10 overflow-visible drop-shadow-2xl"
        >
          <defs>
            {/* Matte Titanium Outer Rim Gradients with Crisp Edge */}
            <linearGradient id="fpOuterRim" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="25%" stopColor="#64748b" />
              <stop offset="65%" stopColor="#334155" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            {/* Shutter Blade Metallic Graphite Fill */}
            <linearGradient id="fpBladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b4656" />
              <stop offset="50%" stopColor="#28303d" />
              <stop offset="100%" stopColor="#181d26" />
            </linearGradient>

            {/* High-Definition Blade Outline / Chamfer Highlight */}
            <linearGradient id="fpBladeStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="50%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>

            {/* Subtle Blade Overlap Drop Shadow */}
            <filter id="fpBladeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1" floodColor="#000000" floodOpacity="0.8" />
            </filter>

            {/* Glowing Emerald Checkmark Gradient */}
            <linearGradient id="fpEmeraldCheck" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="35%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>

            {/* Neon Glow Filter */}
            <filter id="fpGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer Housing Rim (Bezel) */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="#10141b"
            stroke="url(#fpOuterRim)"
            strokeWidth="3.2"
          />

          {/* Inner Groove Track */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="#0f172a"
            strokeWidth="1.2"
          />

          {/* Rotating Aperture Iris Assembly */}
          <g
            style={
              animating
                ? {
                    transformOrigin: '50px 50px',
                    animation: `fpApertureBreathe ${durationSec}s ease-in-out infinite`
                  }
                : undefined
            }
          >
            {/* Deep Sensor Recess */}
            <circle cx="50" cy="50" r="18" fill="#07090d" stroke="#334155" strokeWidth="1" />

            {/* 6 High-Definition Aperture Blades with Defined Outlines */}
            {[0, 60, 120, 180, 240, 300].map((angle, i) => (
              <g key={i} transform={`rotate(${angle} 50 50)`} filter="url(#fpBladeShadow)">
                <path
                  d="M 50 10 A 40 40 0 0 1 84.64 30 L 62 48 A 16 16 0 0 0 50 34 Z"
                  fill="url(#fpBladeGrad)"
                  stroke="url(#fpBladeStroke)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </g>
            ))}

            {/* Center Aperture Light Beam */}
            <circle
              cx="50"
              cy="50"
              r="6"
              fill="#10B981"
              opacity={animating ? "0.45" : "0.2"}
              className={animating ? "animate-pulse" : ""}
            />
          </g>

          {/* The Pass Checkmark Blade (Luminous Emerald) */}
          <g filter="url(#fpGlow)">
            {/* Deep Under-Shadow */}
            <path
              d="M 46 64 L 60 78 L 86 44"
              fill="none"
              stroke="#022c22"
              strokeWidth="9.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
            {/* Foreground Glowing Stroke */}
            <path
              d="M 46 64 L 60 78 L 86 44"
              fill="none"
              stroke="url(#fpEmeraldCheck)"
              strokeWidth="6.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={
                animating
                  ? {
                      animation: `fpCheckPulse ${durationSec}s ease-in-out infinite`
                    }
                  : undefined
              }
            />
          </g>
        </svg>
      </div>

      {label && (
        <div className="mt-3 text-sm font-semibold text-neutral-300 tracking-wide flex items-center gap-1.5">
          <span>{label}</span>
          {animating && (
            <span className="flex space-x-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
      )}

      {/* Keyframe Animations */}
      <style>{`
        @keyframes fpApertureBreathe {
          0% {
            transform: rotate(0deg) scale(0.96);
          }
          50% {
            transform: rotate(30deg) scale(1.04);
          }
          100% {
            transform: rotate(0deg) scale(0.96);
          }
        }
        @keyframes fpCheckPulse {
          0%, 100% {
            filter: drop-shadow(0 0 3px #10B981) drop-shadow(0 0 10px rgba(16, 185, 129, 0.5));
            stroke-width: 6.8px;
          }
          50% {
            filter: drop-shadow(0 0 7px #4ade80) drop-shadow(0 0 18px rgba(74, 222, 128, 0.9));
            stroke-width: 7.6px;
          }
        }
      `}</style>
    </div>
  );
}
