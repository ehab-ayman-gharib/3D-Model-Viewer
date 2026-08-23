'use client';

import React from 'react';
import Link from 'next/link';

interface ParticleTextProps {
  onClick?: () => void;
}

export default function ParticleText({ onClick }: ParticleTextProps) {
  return (
    <Link 
      href="/" 
      onClick={onClick}
      className="block w-full text-center py-6 select-none animate-in fade-in duration-700 cursor-pointer group focus:outline-none"
      title="Return to Home"
    >
      <h1 className="text-5xl md:text-7xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-blue-300 filter drop-shadow-[0_0_35px_rgba(59,130,246,0.35)] group-hover:drop-shadow-[0_0_45px_rgba(59,130,246,0.6)] group-hover:scale-[1.02] transition-all duration-300">
        Z-PLANE
      </h1>
      <p className="text-[10px] md:text-xs font-mono tracking-[0.25em] text-blue-300/70 group-hover:text-blue-200 uppercase mt-2 transition-colors">
        High-Performance 3D & WebAR Studio
      </p>
    </Link>
  );
}
