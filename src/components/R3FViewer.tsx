'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stage, OrbitControls, useGLTF } from '@react-three/drei';
import ParticleLoader from './ParticleLoader';

interface ModelMeshProps {
  url: string;
}

function ModelMesh({ url }: ModelMeshProps) {
  // useGLTF dynamically loads the GLTF/GLB model
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

interface R3FViewerProps {
  url: string;
}

export default function R3FViewer({ url }: R3FViewerProps) {
  return (
    <div className="w-full h-full relative bg-gradient-to-br from-slate-950 to-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
      <Suspense fallback={<ParticleLoader text="Loading 3D Model..." />}>
        <Canvas camera={{ position: [0, 0, 4], fov: 45 }} className="w-full h-full">
          <Stage intensity={0.6} environment="city" adjustCamera>
            <ModelMesh url={url} />
          </Stage>
          <OrbitControls 
            makeDefault 
            enableZoom={true} 
            minDistance={1} 
            maxDistance={15} 
            enableDamping={true}
            dampingFactor={0.05}
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

// Pre-load helper to fetch the model asset early if needed
export function preloadModel(url: string) {
  if (typeof window !== 'undefined') {
    useGLTF.preload(url);
  }
}
