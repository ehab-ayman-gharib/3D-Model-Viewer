/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, Suspense, useMemo, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stage, OrbitControls, useGLTF } from '@react-three/drei';
import { checkBrowserCompatibility } from '@j1ngzoue/8thwall-react-three-fiber';
import { NativeARButtons } from './NativeARButtons';
import ParticleLoader from './ParticleLoader';
import { 
  Loader2, Camera, Compass, AlertTriangle, ArrowLeft, RefreshCw 
} from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ModelMeshProps {
  url: string;
  position?: [number, number, number];
  scale?: number;
  rotationY?: number;
}

// Model mesh component with automatic scaling, floor-grounding, and custom rotation (used in R3F Preview Canvas)
function ModelMesh({ url, position = [0, 0, 0], scale = 1, rotationY = 0 }: ModelMeshProps) {
  const { scene } = useGLTF(url);
  
  // Clone the scene to avoid cache sharing issues with R3FViewer
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  useEffect(() => {
    if (!clonedScene) return;

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Target a bounding size of 1.0 meter * custom scale factor in the real world
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 1.0 * scale; 
    const scaleFactor = targetSize / (maxDim || 1);

    // Apply scaling
    clonedScene.scale.setScalar(scaleFactor);

    // Align center on XZ and floor bottom on Y (y=0 is the floor plane relative to its group positioning)
    clonedScene.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);

  }, [clonedScene, scale]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

// Inner UI Overlay for 8th Wall that runs inside the EighthwallCanvas context
function ARUIOverlay({
  onExit,
  placed,
  setPlaced,
  startNativeAR
}: {
  onExit: () => void;
  placed: boolean;
  setPlaced: (p: boolean) => void;
  startNativeAR: () => Promise<void>;
}) {
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    setIsStarting(true);
    setError(null);
    try {
      // Start AR immediately to preserve synchronous user gesture context in iOS Safari!
      // If we await DeviceMotionEvent or anything else, iOS Safari blocks the camera request.
      
      // Request motion optionally in background if needed (8th Wall often auto-requests it now)
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

  if (!hasStarted) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col justify-between p-6 bg-slate-950/90 text-white select-none">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-purple-400" />
          </button>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider">WebAR SLAM Viewer</h1>
            <p className="text-[10px] text-slate-400">8th Wall World Tracking</p>
          </div>
        </div>

        {/* Center / Body */}
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 shadow-inner">
            <Camera className="w-8 h-8 text-purple-400" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">Camera Permission Required</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            This AR experience uses 8th Wall SLAM to place the 3D model in your physical room. Please allow camera access when prompted.
          </p>
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/20 text-red-300 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="w-full pb-6">
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="w-full py-4 px-6 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 font-semibold text-sm rounded-2xl active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(147,51,234,0.4)] flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Starting Camera...</span>
              </>
            ) : (
              <>
                <Compass className="w-4 h-4" />
                <span>Start WebAR Session</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-40 flex flex-col justify-between p-4 md:p-6 select-none">
      {/* Top Bar: Exit & Relocate */}
      <div className="flex justify-between items-center pointer-events-auto">
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-4 py-2.5 bg-black/75 hover:bg-black/90 backdrop-blur-md rounded-xl text-white border border-white/10 text-xs font-semibold shadow transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit WebAR
        </button>

        {placed && (
          <button
            onClick={() => setPlaced(false)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 backdrop-blur-md rounded-xl text-white border border-purple-500/30 text-xs font-semibold shadow transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Relocate Model
          </button>
        )}
      </div>

      {/* Surface Tracking HUD */}
      {!placed && (
        <div className="w-full flex justify-center pb-8">
          <div className="bg-black/75 text-white text-[11px] font-semibold tracking-wider uppercase px-5 py-2.5 rounded-full border border-white/10 shadow-lg backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping shrink-0" />
            <span>Scanning Floor... Align reticle & tap Place Model</span>
          </div>
        </div>
      )}

      {/* Control Panel (Glassmorphic) */}
      <div className="w-full max-w-sm mx-auto pointer-events-auto bg-black/75 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-md text-center">
        {!placed ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-300">
              Find a flat surface, align the target ring, and tap place.
            </p>
            <button
              onClick={() => setPlaced(true)}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-650 text-white font-bold text-sm rounded-xl active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] flex items-center justify-center gap-2 cursor-pointer"
            >
              📍 Place Model
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-white">✨ Model Placed Successfully</p>
            <p className="text-[11px] text-slate-400">
              Drag left/right to rotate • Drag screen to slide position
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
  const [scaleMultiplier] = useState(1.0);
  const [heightOffset] = useState(0);
  const [positionOffset, setPositionOffset] = useState<[number, number]>([0, 0]);

  // Touch gesture state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!placed || e.touches.length !== 1) return;
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!placed || !touchStart || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;

    // Rotate model by dragging horizontally
    setRotation(prev => (prev + dx * 0.45) % 360);

    // Move model dynamically along floor plane relative to touch sliding
    setPositionOffset(prev => [
      prev[0] + dx * 0.006,
      prev[1] + dy * 0.006
    ]);

    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
  };

  const glbUrl = `/api/models/${modelId}.glb`;

  // --- NATIVE 8TH WALL SLAM INTEGRATION ---
  const modelRef = useRef<THREE.Group | null>(null);
  const wrapperRef = useRef<THREE.Group | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);

  // Sync React slider adjustments directly with the live Three.js scene instances
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.rotation.y = (rotation * Math.PI) / 180;
      wrapper.scale.setScalar(scaleMultiplier);
      wrapper.position.set(positionOffset[0], -1.0 + heightOffset, -2.5 + positionOffset[1]);
    }
  }, [rotation, scaleMultiplier, heightOffset, positionOffset]);

  // Hide/Show elements based on placement state
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const reticle = reticleRef.current;
    if (wrapper) wrapper.visible = placed;
    if (reticle) reticle.visible = !placed;
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
              const reticle = new THREE.Mesh(
                new THREE.RingGeometry(0.3, 0.35, 32),
                new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
              );
              reticle.rotation.x = -Math.PI / 2;
              reticle.position.set(0, -1.0, -2.5); // Default spot in front of camera
              scene.add(reticle);
              reticleRef.current = reticle;

              // 2. Create Wrapper group for placed model
              const wrapper = new THREE.Group();
              wrapper.name = 'model-wrapper';
              wrapper.position.set(0, -1.0, -2.5);
              wrapper.visible = false;
              scene.add(wrapper);
              wrapperRef.current = wrapper;

              // 3. Load Model using GLTFLoader natively
              const loader = new GLTFLoader();
              loader.load(glbUrl, (gltf) => {
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

                wrapper.add(model);
                modelRef.current = model;
                console.log('[8thwall-native] GLTF Loaded & Grounded successfully.');
              }, undefined, (err) => {
                console.error('[8thwall-native] GLTF Load failed:', err);
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
          <canvas id="camerafeed" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
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
          />
        </div>
      )}

      {/* Standard Interactive View (OrbitControls + Native AR Links) */}
      {!is8thWallActive && (
        <main className="absolute inset-0 w-screen h-screen bg-slate-950 text-white font-sans flex flex-col overflow-hidden z-10 pointer-events-auto">
          {/* Background Decor */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[40%] rounded-full bg-blue-500/10 blur-[130px] mix-blend-screen" />
            <div className="absolute bottom-[-10%] right-[10%] w-[45%] h-[40%] rounded-full bg-fuchsia-500/10 blur-[130px] mix-blend-screen" />
          </div>

          {/* Main Container */}
          <div className="flex-1 flex flex-col lg:flex-row z-10 w-full h-full">
            {/* Left Side: interactive 3D WebGL Canvas */}
            <div className="flex-1 lg:w-3/5 p-4 lg:p-6 flex flex-col relative h-[50vh] lg:h-full">
              <div className="flex-1 relative rounded-[2rem] overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
                <Suspense fallback={<ParticleLoader text="Loading 3D Scene..." />}>
                  <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }} className="w-full h-full">
                    <Stage intensity={0.7} environment="city" adjustCamera>
                      <ModelMesh url={glbUrl} />
                    </Stage>
                    <OrbitControls
                      makeDefault
                      enableZoom={true}
                      minDistance={1.2}
                      maxDistance={12}
                      enableDamping={true}
                      dampingFactor={0.06}
                    />
                  </Canvas>
                </Suspense>
              </div>
            </div>

            {/* Right Side: View Info & AR Launch Buttons */}
            <div className="lg:w-2/5 p-6 lg:p-10 flex flex-col justify-between bg-slate-950/60 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-slate-900 h-[50vh] lg:h-full overflow-y-auto">
              {/* Header */}
              <div className="space-y-2 mt-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">AR Model Viewer</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Interact with the 3D model above using swipe and pinch gestures. Launch native AR features on your mobile device or start an offline 8th Wall SLAM experience.
                </p>
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
                    onClick={() => setIs8thWallActive(true)}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.55)] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Compass className="w-5 h-5" />
                    Launch WebAR (8th Wall Engine)
                  </button>
                </div>
              </div>

              {/* Footer Info */}
              <div className="text-center text-[10px] text-slate-600 py-2">
                <span>Powered by Next.js & React Three Fiber & Niantic 8th Wall</span>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
