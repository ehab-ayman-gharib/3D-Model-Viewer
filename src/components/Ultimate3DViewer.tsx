/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, Suspense, useMemo, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import { NativeARButtons } from './NativeARButtons';
import ParticleLoader from './ParticleLoader';
import { 
  Loader2, Camera, Compass, AlertTriangle, ArrowLeft, RefreshCw, Play, Pause, Film 
} from 'lucide-react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function checkBrowserCompatibility(): { compatible: boolean; issues: string[] } {
  const issues: string[] = [];
  if (typeof window === 'undefined') return { compatible: true, issues: [] };

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      issues.push('WebGL is disabled or not supported by your browser.');
    }
  } catch {
    issues.push('Unable to initialize WebGL context.');
  }

  if (typeof navigator !== 'undefined' && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
    issues.push('Camera access API (getUserMedia) is not supported or requires HTTPS.');
  }

  return {
    compatible: issues.length === 0,
    issues,
  };
}

interface ModelMeshProps {
  url: string;
  selectedAnimation: string;
  isPlaying: boolean;
  onAnimationsFound?: (names: string[]) => void;
}

// Model container component with synchronous centering, aspect-aware dynamic camera positioning, and animation playback
function ModelContainer({ url, selectedAnimation, isPlaying, onAnimationsFound }: ModelMeshProps) {
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

    // Calculate aspect-aware dynamic camera distance
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

// Global memory cache for preloaded GLTF ArrayBuffers
const modelBufferCache = new Map<string, ArrayBuffer>();

export async function preloadModelBuffer(url: string): Promise<ArrayBuffer> {
  const cached = modelBufferCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load model: ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  modelBufferCache.set(url, buffer);
  return buffer;
}

// Procedural contact shadow for realistic floor grounding in WebAR
function createContactShadow(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    gradient.addColorStop(0.35, 'rgba(0, 0, 0, 0.45)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }

  const shadowTexture = new THREE.CanvasTexture(canvas);
  const shadowGeo = new THREE.PlaneGeometry(1.3, 1.3);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.002;
  return shadowMesh;
}

// Inner UI Overlay for 8th Wall that runs inside the EighthwallCanvas context
function ARUIOverlay({
  onExit,
  placed,
  setPlaced,
  startNativeAR,
  isModelReady = false,
  arAnimations = [],
  selectedArAnimation = '',
  isArPlaying = true,
  onSelectArAnimation,
  onToggleArPlay,
}: {
  onExit: () => void;
  placed: boolean;
  setPlaced: (p: boolean) => void;
  startNativeAR: () => Promise<void>;
  isModelReady?: boolean;
  arAnimations?: string[];
  selectedArAnimation?: string;
  isArPlaying?: boolean;
  onSelectArAnimation?: (name: string) => void;
  onToggleArPlay?: () => void;
}) {
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    setIsStarting(true);
    setError(null);
    try {
      if (
        typeof window !== 'undefined' &&
        (window as any).DeviceMotionEvent &&
        typeof (window as any).DeviceMotionEvent.requestPermission === 'function'
      ) {
        console.log('Requesting iOS device motion permission in background...');
        (window as any).DeviceMotionEvent.requestPermission().catch(() => {});
      }

      startNativeAR().then(() => {
        setHasStarted(true);
        setIsStarting(false);
      }).catch((err: any) => {
        setError(`Failed to start camera: ${err?.message || String(err)}`);
        setIsStarting(false);
      });
      
    } catch (err: any) {
      setError(`Failed to start camera: ${err?.message || String(err)}`);
      setIsStarting(false);
    }
  };

  useEffect(() => {
    handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasStarted) {
    return (
      <div className="fixed inset-0 h-[100dvh] z-[1000] flex flex-col justify-between p-6 pointer-events-none">
        {/* Header - Back Button */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={onExit}
            className="p-3 bg-black/60 hover:bg-black/80 rounded-full backdrop-blur-md transition-colors cursor-pointer shadow-lg border border-white/10"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4 pointer-events-auto">
            <div className="p-4 bg-red-950/90 backdrop-blur-md border border-red-500/50 text-red-100 text-sm rounded-2xl flex flex-col items-center gap-3 shadow-2xl">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="font-medium">{error}</p>
              <button
                onClick={handleStart}
                className="mt-2 px-6 py-2 bg-red-600 hover:bg-red-500 rounded-xl font-semibold transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-40 flex flex-col justify-between p-4 pb-28 md:p-6 select-none">
      {/* Top Bar: Exit & Relocate + Animation Dropdown */}
      <div className="flex flex-col gap-3 pointer-events-auto">
        <div className="flex justify-between items-center w-full">
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0A1128]/85 hover:bg-[#131E3A] backdrop-blur-md rounded-xl text-white border border-blue-800/40 text-xs font-semibold shadow-lg transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit WebAR
          </button>

          {placed && (
            <button
              onClick={() => setPlaced(false)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 backdrop-blur-md rounded-xl text-white border border-blue-400/30 text-xs font-semibold shadow-lg transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Relocate Model
            </button>
          )}
        </div>

        {/* Animation Dropdown on TOP when placed */}
        {placed && arAnimations.length > 0 && (
          <div className="self-center flex items-center gap-2 bg-[#0A1128]/90 backdrop-blur-md px-4 py-2 rounded-xl border border-blue-800/40 shadow-xl text-xs font-semibold text-blue-200 pointer-events-auto animate-in fade-in slide-in-from-top-3 duration-300">
            <button
              onClick={onToggleArPlay}
              className="p-1 hover:bg-blue-800/40 rounded-lg transition-colors text-blue-300 hover:text-white cursor-pointer"
              title={isArPlaying ? 'Pause Animation' : 'Play Animation'}
            >
              {isArPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <div className="h-4 w-px bg-blue-800/50" />

            <div className="flex items-center gap-1.5">
              <Film className="w-4 h-4 text-blue-400" />
              <select
                value={selectedArAnimation}
                onChange={(e) => onSelectArAnimation?.(e.target.value)}
                className="bg-transparent border-none text-xs text-white font-medium focus:outline-none cursor-pointer pr-1 max-w-[160px] truncate"
              >
                {arAnimations.map((name) => (
                  <option key={name} value={name} className="bg-[#0A1128] text-white">
                    {name || 'Animation'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Surface Tracking HUD */}
      {!placed && (
        <div className="absolute top-20 left-0 w-full flex justify-center pointer-events-none z-0">
          <div className="text-white/90 text-[11px] font-bold tracking-widest uppercase flex items-center gap-2 drop-shadow-md">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0 drop-shadow-md" />
            <span style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>Scanning Floor... Align reticle</span>
          </div>
        </div>
      )}

      {/* Bottom Controls Area (Positioned safely above mobile browser bar) */}
      <div className="w-full max-w-sm mx-auto pointer-events-auto flex flex-col items-center text-center pb-6 sm:pb-2">
        {!placed ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-[11px] font-medium text-white/90 drop-shadow-md" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              Find a flat surface, align the target ring, and tap place.
            </p>
            <button
              disabled={!isModelReady}
              onClick={() => setPlaced(true)}
              className={`px-10 py-3.5 font-bold text-[13px] rounded-full active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex items-center justify-center gap-2 backdrop-blur-md ${
                !isModelReady
                  ? 'bg-slate-800/90 text-slate-400 border border-slate-700/50 cursor-not-allowed'
                  : 'bg-white/95 hover:bg-white text-slate-900 cursor-pointer'
              }`}
            >
              {!isModelReady ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Loading 3D Model...</span>
                </>
              ) : (
                <span>📍 Place Model</span>
              )}
            </button>
          </div>
        ) : (
          <div className="bg-[#0A1128]/85 border border-blue-900/40 rounded-full px-5 py-2.5 backdrop-blur-md shadow-lg flex flex-col items-center gap-1">
            <p className="text-xs font-semibold text-white">✨ Model Placed</p>
            <p className="text-[10px] text-slate-300">
              1-Finger: Slide • 2-Finger: Pinch to Scale / Twist to Rotate
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Ultimate3DViewer() {
  const [modelId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('modelID') || '';
    }
    return '';
  });
  const [is8thWallActive, setIs8thWallActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);

  // Standard 3D Viewer Animation State
  const [animationNames, setAnimationNames] = useState<string[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState<string>('');
  const [isPlayingAnimation, setIsPlayingAnimation] = useState(true);

  // 8th Wall AR Animation State & Refs
  const [arAnimations, setArAnimations] = useState<string[]>([]);
  const [selectedArAnimation, setSelectedArAnimation] = useState<string>('');
  const [isArPlaying, setIsArPlaying] = useState<boolean>(true);
  const isArPlayingRef = useRef<boolean>(true);
  const arMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const arClipsRef = useRef<THREE.AnimationClip[]>([]);
  const arClockRef = useRef<THREE.Clock>(new THREE.Clock());

  const handleSelectArAnimation = (name: string) => {
    setSelectedArAnimation(name);
    if (arMixerRef.current && arClipsRef.current.length > 0) {
      const clip = arClipsRef.current.find((a: any) => a.name === name);
      if (clip) {
        arMixerRef.current.stopAllAction();
        const action = arMixerRef.current.clipAction(clip);
        action.reset().fadeIn(0.2).play();
        setIsArPlaying(true);
        isArPlayingRef.current = true;
      }
    }
  };

  const handleToggleArPlay = () => {
    const nextPlaying = !isArPlaying;
    setIsArPlaying(nextPlaying);
    isArPlayingRef.current = nextPlaying;
    if (arMixerRef.current && nextPlaying) {
      arClockRef.current.getDelta();
    }
  };

  const handleAnimationsFound = useCallback((names: string[]) => {
    setAnimationNames(names);
    if (names.length > 0) {
      setSelectedAnimation((prev) => (prev && names.includes(prev) ? prev : names[0]));
    }
  }, []);

  const glbUrl = useMemo(() => {
    if (!modelId) return '';
    return `/api/models/${modelId}.glb`;
  }, [modelId]);

  // Eagerly preload GLTF ArrayBuffer into RAM as soon as the viewer mounts
  useEffect(() => {
    if (glbUrl) {
      preloadModelBuffer(glbUrl).then(() => {
        setIsModelReady(true);
      }).catch((err) => {
        console.warn('Preload model buffer error:', err);
      });
    }
  }, [glbUrl]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
        (navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent));
      setIsMobile(isMobileDevice);
    }
  }, []);
  const [browserCompat] = useState(() => {
    if (typeof window !== 'undefined') {
      const compat = checkBrowserCompatibility();
      return {
        compatible: compat.compatible,
        issues: compat.issues || []
      };
    }
    return { compatible: true, issues: [] };
  });

  // Model Placement & Control States for SLAM
  const [placed, setPlaced] = useState(false);
  const [rotation, setRotation] = useState(0); // rotation in degrees
  const [scaleMultiplier, setScaleMultiplier] = useState(1.0);
  const [heightOffset] = useState(0);
  const [positionOffset, setPositionOffset] = useState<[number, number]>([0, 0]);

  // Touch gesture state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null);
  const [initialTwistAngle, setInitialTwistAngle] = useState<number | null>(null);
  const [baseScale, setBaseScale] = useState(1.0);
  const [baseRotation, setBaseRotation] = useState(0);

  const getPinchDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTwistAngle = (touches: React.TouchList) => {
    return Math.atan2(
      touches[1].clientY - touches[0].clientY,
      touches[1].clientX - touches[0].clientX
    ) * (180 / Math.PI);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!placed) return;
    if (e.touches.length === 1) {
      setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setInitialPinchDist(null);
      setInitialTwistAngle(null);
    } else if (e.touches.length === 2) {
      setTouchStart(null);
      setInitialPinchDist(getPinchDistance(e.touches));
      setInitialTwistAngle(getTwistAngle(e.touches));
      setBaseScale(scaleMultiplier);
      setBaseRotation(rotation);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!placed) return;
    
    if (e.touches.length === 1 && touchStart) {
      const dx = e.touches[0].clientX - touchStart.x;
      const dy = e.touches[0].clientY - touchStart.y;

      // Single finger: just move the model (slide)
      setPositionOffset(prev => [
        prev[0] + dx * 0.006,
        prev[1] + dy * 0.006
      ]);
      setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } 
    else if (e.touches.length === 2 && initialPinchDist !== null && initialTwistAngle !== null) {
      // Two fingers: Pinch to Scale + Twist to Rotate
      const currentDist = getPinchDistance(e.touches);
      const currentAngle = getTwistAngle(e.touches);

      // Scale
      const scaleFactor = currentDist / initialPinchDist;
      let newScale = baseScale * scaleFactor;
      newScale = Math.max(0.1, Math.min(newScale, 10)); // limit scaling between 0.1x and 10x
      setScaleMultiplier(newScale);

      // Rotate
      const angleDiff = currentAngle - initialTwistAngle;
      setRotation(baseRotation + angleDiff);
    }
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
    setInitialPinchDist(null);
    setInitialTwistAngle(null);
  };

  // --- NATIVE 8TH WALL SLAM INTEGRATION ---
  const modelRef = useRef<THREE.Group | null>(null);
  const wrapperRef = useRef<THREE.Group | null>(null);
  const reticleRef = useRef<THREE.Group | THREE.Mesh | null>(null);
  const basePositionRef = useRef<[number, number, number]>([0, -1.0, -2.5]);

  // Sync React slider adjustments directly with the live Three.js scene instances
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.rotation.y = (rotation * Math.PI) / 180;
      wrapper.scale.setScalar(scaleMultiplier);
      const [bx, by, bz] = basePositionRef.current;
      wrapper.position.set(bx + positionOffset[0], by + heightOffset, bz + positionOffset[1]);
    }
  }, [rotation, scaleMultiplier, heightOffset, positionOffset]);

  // Hide/Show elements based on placement state
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const reticle = reticleRef.current;
    if (wrapper) wrapper.visible = placed;
    if (reticle) {
      // If we just placed it, capture the reticle's exact current physical location
      if (placed && reticle.visible) {
        basePositionRef.current = [reticle.position.x, reticle.position.y, reticle.position.z];
        if (wrapper) {
          wrapper.position.copy(reticle.position);
          wrapper.quaternion.copy(reticle.quaternion);
        }
      }
      reticle.visible = !placed;
    }
  }, [placed]);

  const startNativeAR = async () => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined') return reject('Window undefined');

      const onXrLoaded = () => {
        try {
          (window as any).THREE = THREE;
          const XR8 = (window as any).XR8;
          const XRExtras = (window as any).XRExtras;
          const LandingPage = (window as any).LandingPage;

          if (!XR8) return reject('XR8 not found');

          console.log('[8thwall-native] Configuring SLAM Modules...');

          // Register camera pipeline modules (pure Three.js version)
          const modules = [
            XR8.GlTextureRenderer.pipelineModule(), // Camera feed renderer
            XR8.Threejs.pipelineModule(),           // Natively created Three.js scene
            XR8.XrController.pipelineModule(),      // Gyro/SLAM tracker
          ];

          // Align with official 8th Wall XRExtras helper modules if loaded
          if (LandingPage && LandingPage.pipelineModule) {
            modules.push(LandingPage.pipelineModule());
          }
          if (XRExtras && XRExtras.FullWindowCanvas && XRExtras.FullWindowCanvas.pipelineModule) {
            modules.push(XRExtras.FullWindowCanvas.pipelineModule());
          }
          if (XRExtras && XRExtras.Loading && XRExtras.Loading.pipelineModule) {
            modules.push(XRExtras.Loading.pipelineModule());
          }
          if (XRExtras && XRExtras.RuntimeError && XRExtras.RuntimeError.pipelineModule) {
            modules.push(XRExtras.RuntimeError.pipelineModule());
          }

          XR8.addCameraPipelineModules(modules);

          // Configure XrController to support world tracking
          XR8.XrController.configure({ disableWorldTracking: false });

          // Add our custom content module
          XR8.addCameraPipelineModule({
            name: 'slam-renderer-init',
            onStart: ({ canvas }: { canvas: HTMLCanvasElement }) => {
              const { scene, camera } = XR8.Threejs.xrScene();

              // Lights
              const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
              scene.add(ambientLight);

              const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
              dirLight.position.set(5, 10, 5);
              scene.add(dirLight);

              // 1. Create Placement Reticle (ring)
              const reticleGroup = new THREE.Group();
              const reticleMesh = new THREE.Mesh(
                new THREE.RingGeometry(0.3, 0.35, 32),
                new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
              );
              reticleMesh.rotation.x = -Math.PI / 2; // Flat on floor
              reticleGroup.add(reticleMesh);
              reticleGroup.position.set(0, -1.0, -2.5); // Default spot in front of camera
              scene.add(reticleGroup);
              reticleRef.current = reticleGroup;

              // 2. Create Wrapper group for placed model
              const wrapper = new THREE.Group();
              wrapper.name = 'model-wrapper';
              wrapper.position.set(0, -1.0, -2.5);
              wrapper.visible = false;
              
              // Add procedural contact shadow underneath the placed model
              wrapper.add(createContactShadow());
              
              scene.add(wrapper);
              wrapperRef.current = wrapper;

              // 3. Load Model instantly from memory buffer or GLTFLoader
              const handleGltfLoaded = (gltf: any) => {
                const model = gltf.scene;

                // Scale model to a normalized 1.0m bounding size
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                const scaleFactor = 1.0 / (maxDim || 1);
                model.scale.setScalar(scaleFactor);

                // Ground model flat at y=0 inside its wrapper
                const center = new THREE.Vector3();
                box.getCenter(center);
                model.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);

                // Initialize 8th Wall Animation Mixer if animations exist
                if (gltf.animations && gltf.animations.length > 0) {
                  arClipsRef.current = gltf.animations;
                  const mixer = new THREE.AnimationMixer(model);
                  arMixerRef.current = mixer;
                  const names = gltf.animations.map((a: any) => a.name);
                  setArAnimations(names);
                  setSelectedArAnimation(names[0]);
                  const clip = gltf.animations[0];
                  const action = mixer.clipAction(clip);
                  action.play();
                }

                wrapper.add(model);
                modelRef.current = model;
                setIsModelReady(true);
                console.log('[8thwall-native] GLTF Loaded, Grounded & Animated instantly.');
              };

              preloadModelBuffer(glbUrl)
                .then((buffer) => {
                  const loader = new GLTFLoader();
                  loader.parse(
                    buffer,
                    '',
                    handleGltfLoaded,
                    (err) => {
                      console.warn('Buffer parse fallback to load:', err);
                      loader.load(glbUrl, handleGltfLoaded);
                    }
                  );
                })
                .catch(() => {
                  const loader = new GLTFLoader();
                  loader.load(glbUrl, handleGltfLoaded);
                });

              // Recenter camera/projection Matrix
              camera.position.set(0, 2, 2);
              XR8.XrController.updateCameraProjectionMatrix({
                origin: camera.position,
                facing: camera.quaternion
              });

              // Prevent pinch-zooming / scroll gestures natively on screen
              canvas.addEventListener('touchmove', (event) => {
                event.preventDefault();
              }, { passive: false });

              resolve();
            },
            onUpdate: () => {
              try {
                // Update 8th Wall animation playback
                if (arMixerRef.current && isArPlayingRef.current) {
                  const delta = arClockRef.current.getDelta();
                  arMixerRef.current.update(delta);
                }

                const reticle = reticleRef.current;
                if (!reticle || !reticle.visible) return;

                let hitFound = false;

                // Try 8th Wall native SLAM hitTest first
                try {
                  if (typeof XR8.XrController.hitTest === 'function') {
                    const hitResults = XR8.XrController.hitTest(0.5, 0.5, ['FEATURE_POINT', 'ESTIMATED_SURFACE', 'DETECTED_SURFACE']);
                    if (hitResults && hitResults.length > 0) {
                      const hit = hitResults[0];
                      reticle.position.set(hit.position.x, hit.position.y, hit.position.z);
                      reticle.quaternion.set(hit.rotation.x, hit.rotation.y, hit.rotation.z, hit.rotation.w);
                      hitFound = true;
                    }
                  }
                } catch (err) {
                  console.warn('XR8 hitTest failed, falling back to basic raycast', err);
                }

                // Fallback to standard Three.js raycasting against y=0 plane if hitTest fails or isn't available
                if (!hitFound) {
                  const { camera } = XR8.Threejs.xrScene();
                  const raycaster = new THREE.Raycaster();
                  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
                  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                  const target = new THREE.Vector3();
                  raycaster.ray.intersectPlane(groundPlane, target);
                  if (target) {
                    reticle.position.copy(target);
                    // Group resets its own rotation, the mesh inside is rotated
                    reticle.quaternion.identity();
                  }
                }

                // Align the wrapper to the reticle
                if (wrapperRef.current) {
                  wrapperRef.current.position.copy(reticle.position);
                  wrapperRef.current.quaternion.copy(reticle.quaternion);
                }
              } catch (e) {
                console.error('[8thwall-native] onUpdate error:', e);
              }
            }
          });

          // Run XR session
          const canvasElement = document.getElementById('camerafeed') as HTMLCanvasElement;
          XR8.run({ canvas: canvasElement });

        } catch (e) {
          reject(e);
        }
      };

      if ((window as any).XR8) {
        onXrLoaded();
      } else {
        window.addEventListener('xrloaded', onXrLoaded, { once: true });
      }
    });
  };

  // Clean up native 8th Wall session on exit
  const stopNativeAR = () => {
    if (typeof window !== 'undefined' && (window as any).XR8) {
      const XR8 = (window as any).XR8;
      try {
        XR8.stop();
        XR8.removeCameraPipelineModule('slam-renderer-init');
      } catch (e) {
        console.log('Error cleaning up native 8th Wall:', e);
      }
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full p-8 bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl space-y-4 text-center animate-in fade-in duration-300">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-red-400">AR Setup Error</h2>
          <p className="text-sm text-slate-300 leading-relaxed">{error}</p>
          <div className="mt-4 text-xs text-slate-500 text-left bg-black/40 p-3 rounded">
            <strong>Note:</strong> Ensure you are running this over HTTPS and your device supports WebXR/Camera access.
          </div>
          <button
            onClick={() => {
              setError(null);
              setIs8thWallActive(false);
              stopNativeAR();
            }}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold tracking-wide transition-colors mt-2"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!modelId) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-semibold tracking-wide text-slate-400">Loading model parameters...</p>
      </div>
    );
  }

  if (!browserCompat.compatible) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full p-8 bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl space-y-4 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-red-400">Browser Incompatible</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Your browser does not support the necessary WebGL or Media features required for WebAR:
          </p>
          <ul className="text-xs text-red-300 bg-black/40 p-3 rounded-lg text-left list-disc list-inside space-y-1">
            {browserCompat.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // 8th Wall SLAM rendering flow (Always mount at root, control visibility via container class)
return (
    <div 
      className="relative w-screen h-screen bg-transparent overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 8th Wall WebAR Canvas (Only mount when active to prevent layout shifts and hidden camera feedback) */}
      {is8thWallActive && (
        <div className="fixed inset-0 z-[100] w-screen h-screen opacity-100 pointer-events-auto bg-transparent overflow-hidden select-none">
          {/* We must style the canvas to fill the screen natively, but NEVER use object-cover, as that stretches the WebGL buffer out of sync with the physical tracking space! */}
          <canvas id="camerafeed" className="absolute top-0 left-0 w-full h-full pointer-events-none block" />
          <ARUIOverlay
            onExit={() => {
              setIs8thWallActive(false);
              stopNativeAR();
              setPlaced(false);
              setPositionOffset([0, 0]);
              setRotation(0);
            }}
            placed={placed}
            setPlaced={setPlaced}
            startNativeAR={startNativeAR}
            isModelReady={isModelReady}
            arAnimations={arAnimations}
            selectedArAnimation={selectedArAnimation}
            isArPlaying={isArPlaying}
            onSelectArAnimation={handleSelectArAnimation}
            onToggleArPlay={handleToggleArPlay}
          />
        </div>
      )}

      {/* Standard Interactive View (OrbitControls + Native AR Links) */}
      {!is8thWallActive && (
        <main className="absolute inset-0 w-screen h-screen bg-[#020408] text-white font-sans flex flex-col overflow-hidden z-10 pointer-events-auto">
          {/* Background Decor */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[40%] rounded-full bg-[#0A1128]/40 blur-[130px] mix-blend-screen" />
            <div className="absolute bottom-[-10%] right-[10%] w-[45%] h-[40%] rounded-full bg-[#131E3A]/30 blur-[130px] mix-blend-screen" />
          </div>

          {/* Main Container */}
          <div className="flex-1 flex flex-col lg:flex-row z-10 w-full h-full">
            {/* Interactive 3D WebGL Canvas (Full screen on desktop, top on mobile) */}
            <div className={`flex-1 p-4 lg:p-6 flex flex-col relative ${isMobile ? 'h-[60vh] lg:h-full lg:w-3/5' : 'w-full h-full'}`}>
              <div className="flex-1 relative rounded-[2rem] overflow-hidden bg-[#030712] border border-blue-900/30 shadow-2xl flex items-center justify-center">
                <Suspense fallback={<ParticleLoader text="Loading 3D Scene..." />}>
                  <Canvas camera={{ position: [0, 0, 5], fov: 40 }} className="w-full h-full">
                    {/* Neutral / Ice-Blue Studio Lighting Setup */}
                    <ambientLight intensity={1.2} />
                    <directionalLight position={[5, 8, 5]} intensity={2.0} />
                    <directionalLight position={[-5, 4, -4]} intensity={1.0} color="#93c5fd" />
                    <directionalLight position={[0, 6, -6]} intensity={1.5} color="#bfdbfe" />
                    <hemisphereLight args={['#ffffff', '#0a1128', 0.8]} />
                    <Environment preset="city" environmentIntensity={0.6} />

                    <ModelContainer 
                      url={glbUrl} 
                      selectedAnimation={selectedAnimation}
                      isPlaying={isPlayingAnimation}
                      onAnimationsFound={handleAnimationsFound}
                    />
                  </Canvas>
                </Suspense>

                {/* Glassmorphic Animation Controller (Bottom-Right) */}
                {animationNames.length > 0 && (
                  <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 bg-[#0A1128]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-blue-800/40 shadow-lg text-xs font-semibold text-blue-200 animate-in fade-in zoom-in-95 duration-300">
                    <button
                      onClick={() => setIsPlayingAnimation(!isPlayingAnimation)}
                      className="p-1 hover:bg-blue-800/40 rounded-lg transition-colors text-blue-300 hover:text-white cursor-pointer"
                      title={isPlayingAnimation ? 'Pause Animation' : 'Play Animation'}
                    >
                      {isPlayingAnimation ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>

                    <div className="h-3.5 w-px bg-blue-800/50" />

                    <div className="flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-blue-400" />
                      <select
                        value={selectedAnimation}
                        onChange={(e) => {
                          setSelectedAnimation(e.target.value);
                          setIsPlayingAnimation(true);
                        }}
                        className="bg-transparent border-none text-xs text-white font-medium focus:outline-none cursor-pointer pr-1"
                      >
                        {animationNames.map((name) => (
                          <option key={name} value={name} className="bg-[#0A1128] text-white">
                            {name || 'Animation'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: View Info & AR Launch Buttons (Mobile only) */}
            {isMobile && (
              <div className="lg:w-2/5 p-6 lg:p-10 flex flex-col justify-between bg-[#060D1F]/80 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-blue-950 h-[40vh] lg:h-full overflow-y-auto">
                {/* Header */}
                <div className="space-y-2 mt-2">
                  <h1 className="text-3xl font-extrabold tracking-tight text-white">AR Model Viewer</h1>
                </div>

                {/* Action Center */}
                <div className="space-y-6 my-8">
                  {/* Native OS App QuickLook / SceneViewer */}
                  <NativeARButtons glbUrl={glbUrl} title={`Model ${modelId}`} />

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-800"></div>
                    <span className="flex-shrink mx-4 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">or</span>
                    <div className="flex-grow border-t border-slate-800"></div>
                  </div>

                  {/* 8th Wall WebAR Launcher */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center">
                      In-Browser WebAR
                    </div>
                    <button
                      onClick={() => {
                        // Request device motion permission on iOS synchronously with the user tap
                        if (
                          typeof window !== 'undefined' &&
                          (window as any).DeviceMotionEvent &&
                          typeof (window as any).DeviceMotionEvent.requestPermission === 'function'
                        ) {
                          (window as any).DeviceMotionEvent.requestPermission().catch(() => {});
                        }
                        setIs8thWallActive(true);
                      }}
                      className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.55)] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Compass className="w-5 h-5" />
                      Launch WebAR (8th Wall Engine)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
