'use client';

import React from 'react';

export default function ParticleText() {
  return (
    <div className="w-full text-center py-6 select-none animate-in fade-in duration-700">
      <h1 className="text-5xl md:text-7xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-500 to-indigo-500 filter drop-shadow-[0_0_30px_rgba(168,85,247,0.4)]">
        Z-PLANE
      </h1>
      <p className="text-[10px] md:text-xs font-mono tracking-[0.25em] text-purple-300/60 uppercase mt-2">
        High-Performance 3D/AR Pipeline
      </p>
    </div>
  );
}
