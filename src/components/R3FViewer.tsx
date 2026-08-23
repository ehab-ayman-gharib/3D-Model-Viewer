/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { Suspense, useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import ParticleLoader from './ParticleLoader';

interface ModelContainerProps {
  url: string;
}

function ModelContainer({ url }: ModelContainerProps) {
  const { scene } = useGLTF(url);
  const { camera, size: viewportSize } = useThree();
  const controlsRef = useRef<any>(null);

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

          <ModelContainer url={url} />
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
