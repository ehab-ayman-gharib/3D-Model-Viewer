/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { Suspense, useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import { Play, Pause, Film } from 'lucide-react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import ParticleLoader from './ParticleLoader';

interface ModelContainerProps {
  url: string;
  selectedAnimation: string;
  isPlaying: boolean;
  onAnimationsFound?: (names: string[]) => void;
}

function ModelContainer({ url, selectedAnimation, isPlaying, onAnimationsFound }: ModelContainerProps) {
  const { scene, animations } = useGLTF(url);
  const { camera, size: viewportSize } = useThree();
  const controlsRef = useRef<any>(null);

  // Notify parent component of available animation clip names
  useEffect(() => {
    if (animations && animations.length > 0) {
      onAnimationsFound?.(animations.map((a) => a.name));
    } else {
      onAnimationsFound?.([]);
    }
  }, [animations, onAnimationsFound]);

  const { centeredScene, cameraDist } = useMemo(() => {
    // Use SkeletonUtils to correctly clone skinned meshes, bones, and skeletons
    const clone = SkeletonUtils.clone(scene);
    clone.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Center model at origin
    clone.position.set(-center.x, -center.y, -center.z);

    const group = new THREE.Group();
    group.add(clone);

    // Calculate aspect-aware dynamic camera distance matching turntable exporter
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fovRad = (40 * Math.PI) / 180;
    const aspect = viewportSize.width / (viewportSize.height || 1);

    const fitHeightDist = (size.y / 2) / Math.tan(fovRad / 2);
    const fitWidthDist = (size.x / 2) / (Math.tan(fovRad / 2) * (aspect || 1));
    const dist = Math.max(fitHeightDist, fitWidthDist, (maxDim / 2) / Math.tan(fovRad / 2)) * 1.45;

    return { centeredScene: group, cameraDist: dist };
  }, [scene, viewportSize.width, viewportSize.height]);

  // Three.js Animation Mixer setup
  const mixer = useMemo(() => {
    if (!centeredScene) return null;
    return new THREE.AnimationMixer(centeredScene);
  }, [centeredScene]);

  // Handle active animation clip and playback state
  useEffect(() => {
    if (!mixer || !animations || animations.length === 0) return;

    if (!selectedAnimation) {
      mixer.stopAllAction();
      return;
    }

    const clip = animations.find((a) => a.name === selectedAnimation) || animations[0];
    if (!clip) return;

    const action = mixer.clipAction(clip);
    if (isPlaying) {
      action.reset().fadeIn(0.25).play();
    } else {
      action.paused = true;
    }

    return () => {
      action.fadeOut(0.25);
    };
  }, [mixer, animations, selectedAnimation, isPlaying]);

  // Update mixer on every animation frame
  useFrame((_, delta) => {
    if (mixer && isPlaying) {
      mixer.update(delta);
    }
  });

  // Adjust camera and sync OrbitControls
  useEffect(() => {
    if (camera && cameraDist) {
      camera.position.set(0, 0, cameraDist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
  }, [camera, cameraDist]);

  return (
    <>
      <primitive object={centeredScene} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0, 0]}
        enableZoom={true}
        minDistance={cameraDist * 0.25}
        maxDistance={cameraDist * 4.0}
        enableDamping={true}
        dampingFactor={0.06}
      />
    </>
  );
}

interface R3FViewerProps {
  url: string;
}

export default function R3FViewer({ url }: R3FViewerProps) {
  const [animationNames, setAnimationNames] = useState<string[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(true);

  const handleAnimationsFound = useCallback((names: string[]) => {
    setAnimationNames(names);
    if (names.length > 0) {
      setSelectedAnimation((prev) => (prev && names.includes(prev) ? prev : names[0]));
    }
  }, []);

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 to-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
      <Suspense fallback={<ParticleLoader text="Loading 3D Model..." />}>
        <Canvas 
          camera={{ position: [0, 0, 5], fov: 40 }} 
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          {/* Studio Lighting Setup matching turntable quality */}
          <ambientLight intensity={1.2} />
          <directionalLight position={[5, 8, 5]} intensity={2.0} />
          <directionalLight position={[-5, 4, -4]} intensity={1.0} color="#a5b4fc" />
          <directionalLight position={[0, 6, -6]} intensity={1.5} color="#d8b4fe" />
          <hemisphereLight args={['#e9d5ff', '#1e1035', 0.8]} />
          <Environment preset="city" environmentIntensity={0.6} />

          <ModelContainer 
            url={url} 
            selectedAnimation={selectedAnimation}
            isPlaying={isPlaying}
            onAnimationsFound={handleAnimationsFound}
          />
        </Canvas>
      </Suspense>

      {/* Glassmorphic Animation Controller (Bottom-Right) */}
      {animationNames.length > 0 && (
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 bg-[#1c1236]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-purple-800/40 shadow-lg text-xs font-semibold text-purple-200 animate-in fade-in zoom-in-95 duration-300">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1 hover:bg-purple-800/40 rounded-lg transition-colors text-purple-300 hover:text-white cursor-pointer"
            title={isPlaying ? 'Pause Animation' : 'Play Animation'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <div className="h-3.5 w-px bg-purple-800/50" />

          <div className="flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-purple-400" />
            <select
              value={selectedAnimation}
              onChange={(e) => {
                setSelectedAnimation(e.target.value);
                setIsPlaying(true);
              }}
              className="bg-transparent border-none text-xs text-purple-200 font-medium focus:outline-none cursor-pointer pr-1"
            >
              {animationNames.map((name) => (
                <option key={name} value={name} className="bg-[#1c1236] text-purple-200">
                  {name || 'Animation'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// Pre-load helper to fetch the model asset early if needed
export function preloadModel(url: string) {
  if (typeof window !== 'undefined') {
    useGLTF.preload(url);
  }
}
