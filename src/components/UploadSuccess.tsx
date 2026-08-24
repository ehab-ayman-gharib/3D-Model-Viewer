/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { CheckCircle2, Copy, ExternalLink, RefreshCw, ArrowLeft, Camera, Compass, AlertTriangle, Loader2, Video, Play, Pause, Film } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { NativeARButtons } from './NativeARButtons';
import { exportTurntableVideo } from '../utils/turntableRecorder';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const R3FViewer = dynamic(
    () => import('./R3FViewer'),
    { ssr: false }
);

interface UploadSuccessProps {
    modelId: string;
    localFileUrl?: string;
    onReset: () => void;
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

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      if (
        typeof window !== 'undefined' &&
        (window as any).DeviceMotionEvent &&
        typeof (window as any).DeviceMotionEvent.requestPermission === 'function'
      ) {
        console.log('Requesting iOS device motion permission...');
        const permissionState = await (window as any).DeviceMotionEvent.requestPermission();
        if (permissionState !== 'granted') {
          setError('Motion and orientation permission is required for WebAR tracking.');
          setIsStarting(false);
          return;
        }
      }

      await startNativeAR();
      setHasStarted(true);
    } catch (err: any) {
      setError(`Failed to start camera: ${err?.message || String(err)}`);
    } finally {
      setIsStarting(false);
    }
  };

  if (!hasStarted) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col justify-between p-6 bg-[#020408]/95 text-white select-none">
        {/* Header */}
        <div className="flex items-center gap-3 text-left">
          <button
            onClick={onExit}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-blue-400" />
          </button>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider text-white">WebAR SLAM Viewer</h1>
            <p className="text-[10px] text-slate-400">8th Wall World Tracking</p>
          </div>
        </div>

        {/* Center / Body */}
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4">
          <div className="w-16 h-16 bg-blue-950/40 rounded-full flex items-center justify-center border border-blue-900/40 shadow-inner">
            <Camera className="w-8 h-8 text-blue-400 animate-pulse" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-white">Camera Permission Required</h2>
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
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 hover:from-blue-500 hover:to-indigo-800 disabled:bg-slate-900 disabled:text-slate-600 font-semibold text-sm rounded-2xl active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2 cursor-pointer"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-300" />
                <span>Starting Camera...</span>
              </>
            ) : (
              <>
                <Compass className="w-4 h-4 text-blue-200" />
                <span>Start WebAR Session</span>
              </>
            )}
          </button>
        </div>
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

      {/* Surface Status */}
      {!placed && (
        <div className="w-full flex justify-center pb-6">
          <div className="bg-[#0A1128]/85 text-white text-[11px] font-semibold tracking-wider uppercase px-5 py-2.5 rounded-full border border-blue-800/40 shadow-lg backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span>Scanning Floor... Align reticle & tap Place Model</span>
          </div>
        </div>
      )}

      {/* Controller (Glassmorphic - Positioned safely above mobile browser bar) */}
      <div className="w-full max-w-sm mx-auto pointer-events-auto flex flex-col items-center text-center pb-6 sm:pb-2">
        {!placed ? (
          <div className="w-full bg-[#0A1128]/85 border border-blue-900/40 rounded-2xl p-5 shadow-2xl backdrop-blur-md text-center space-y-3">
            <p className="text-xs text-slate-300">
              Find a flat surface, align the target ring, and tap place.
            </p>
            <button
              disabled={!isModelReady}
              onClick={() => setPlaced(true)}
              className={`w-full py-4 font-bold text-sm rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
                !isModelReady
                  ? 'bg-slate-800/90 text-slate-400 border border-slate-700/50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)] cursor-pointer'
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
            <p className="text-xs font-semibold text-white">✨ Model Placed Successfully</p>
            <p className="text-[10px] text-slate-300">
              Drag left/right to rotate • Drag screen to slide position
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function UploadSuccess({ modelId, localFileUrl, onReset }: UploadSuccessProps) {
    const [copied, setCopied] = useState(false);
    const [modelUrl, setModelUrl] = useState<string>('');
    const [viewerUrl, setViewerUrl] = useState<string>('');
    const [is8thWallActive, setIs8thWallActive] = useState(false);
    const [arError, setArError] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isModelReady, setIsModelReady] = useState(false);

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

    // 8th Wall Native Object References
    const reticleRef = useRef<THREE.Mesh | null>(null);
    const wrapperRef = useRef<THREE.Group | null>(null);
    const modelRef = useRef<THREE.Group | null>(null);

    // Sync transforms
    useEffect(() => {
      const model = modelRef.current;
      const wrapper = wrapperRef.current;
      if (model) {
        model.rotation.y = (rotation * Math.PI) / 180;
        model.scale.setScalar(scaleMultiplier);
      }
      if (wrapper) {
        wrapper.position.y = -1.0 + heightOffset;
        wrapper.position.x = positionOffset[0];
        wrapper.position.z = -2.5 + positionOffset[1];
      }
    }, [rotation, scaleMultiplier, heightOffset, positionOffset]);

    // Hide/Show elements based on placement state
    useEffect(() => {
      const wrapper = wrapperRef.current;
      const reticle = reticleRef.current;
      if (wrapper) wrapper.visible = placed;
      if (reticle) reticle.visible = !placed;
    }, [placed]);

    useEffect(() => {
        // Detect mobile devices (iOS, Android, etc.)
        if (typeof window !== 'undefined') {
            const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
            const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
                (navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent));
            setIsMobile(isMobileDevice);
        }

        // Use localFileUrl if available to load instantly from memory, otherwise fall back to R2 CDN
        const vUrl = `${window.location.origin}/viewer?modelID=${modelId}`;
        setModelUrl(localFileUrl || `/api/models/${modelId}.glb`);
        setViewerUrl(vUrl);
        
        // Sync browser address bar so 8th Wall's Desktop QR code generator and native browser sharing use the correct link
        window.history.replaceState(null, '', vUrl);
        
        return () => {
            window.history.replaceState(null, '', '/');
        };
    }, [modelId, localFileUrl]);

    // Eagerly preload GLTF ArrayBuffer into RAM as soon as modelUrl is established
    useEffect(() => {
      if (modelUrl) {
        preloadModelBuffer(modelUrl).then(() => {
          setIsModelReady(true);
        }).catch((err) => {
          console.warn('Preload model buffer error:', err);
        });
      }
    }, [modelUrl]);

    const [isExportingTurntable, setIsExportingTurntable] = useState(false);
    const [turntableProgress, setTurntableProgress] = useState(0);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(viewerUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const handleExportTurntable = async () => {
        if (isExportingTurntable) return;
        setIsExportingTurntable(true);
        setTurntableProgress(0);
        try {
            const sourceUrl = localFileUrl || `/api/models/${modelId}.glb`;
            await exportTurntableVideo({
                modelUrl: sourceUrl,
                filename: `model_${modelId}`,
                onProgress: (p) => setTurntableProgress(p),
            });
        } catch (err) {
            console.error('Failed to export turntable video:', err);
            alert('Could not generate turntable video. Please try again.');
        } finally {
            setIsExportingTurntable(false);
            setTurntableProgress(0);
        }
    };

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

            const modules = [
              XR8.GlTextureRenderer.pipelineModule(),
              XR8.Threejs.pipelineModule(),
              XR8.XrController.pipelineModule(),
            ];

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

            modules.push({
              name: 'zplane-webar-init',
              onStart: ({ canvas }: { canvas: HTMLCanvasElement }) => {
                const { scene, camera, renderer } = XR8.Threejs.xrScene();

                renderer.shadowMap.enabled = true;

                const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
                scene.add(ambientLight);

                const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
                dirLight.position.set(5, 10, 7);
                dirLight.castShadow = true;
                scene.add(dirLight);

                const reticle = new THREE.Mesh(
                  new THREE.RingGeometry(0.3, 0.35, 32),
                  new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
                );
                reticle.rotation.x = -Math.PI / 2;
                reticle.position.set(0, -1.0, -2.5);
                scene.add(reticle);
                reticleRef.current = reticle;

                const wrapper = new THREE.Group();
                wrapper.name = 'model-wrapper';
                wrapper.position.set(0, -1.0, -2.5);
                wrapper.visible = false;
                
                wrapper.add(createContactShadow());
                
                scene.add(wrapper);
                wrapperRef.current = wrapper;

                const handleGltfLoaded = (gltf: any) => {
                  const model = gltf.scene;

                  const box = new THREE.Box3().setFromObject(model);
                  const size = new THREE.Vector3();
                  box.getSize(size);
                  const maxDim = Math.max(size.x, size.y, size.z);
                  const scaleFactor = 1.0 / (maxDim || 1);
                  model.scale.setScalar(scaleFactor);

                  const center = new THREE.Vector3();
                  box.getCenter(center);
                  model.position.set(-center.x * scaleFactor, -box.min.y * scaleFactor, -center.z * scaleFactor);

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

                  model.traverse((child: any) => {
                    if (child.isMesh) {
                      child.castShadow = true;
                      child.receiveShadow = true;
                    }
                  });

                  wrapper.add(model);
                  modelRef.current = model;
                  setIsModelReady(true);
                  console.log('[8thwall-native] GLTF Loaded, Grounded & Animated instantly.');
                };

                preloadModelBuffer(modelUrl)
                  .then((buffer) => {
                    const loader = new GLTFLoader();
                    loader.parse(
                      buffer,
                      '',
                      handleGltfLoaded,
                      (err) => {
                        console.warn('Buffer parse fallback to load:', err);
                        loader.load(modelUrl, handleGltfLoaded);
                      }
                    );
                  })
                  .catch(() => {
                    const loader = new GLTFLoader();
                    loader.load(modelUrl, handleGltfLoaded);
                  });

                camera.position.set(0, 2, 2);

                XR8.XrController.updateCameraProjectionMatrix({
                  origin: camera.position,
                  facing: camera.quaternion
                });

                canvas.addEventListener('touchmove', (event) => {
                  event.preventDefault();
                }, { passive: false });

                canvas.addEventListener('touchstart', (e) => {
                  if (e.touches.length === 1) XR8.XrController.recenter();
                }, true);

                resolve();
              },
              onUpdate: () => {
                if (arMixerRef.current && isArPlayingRef.current) {
                  const delta = arClockRef.current.getDelta();
                  arMixerRef.current.update(delta);
                }
              }
            });

            XR8.addCameraPipelineModules(modules);
            XR8.XrController.configure({ disableWorldTracking: false });

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
          window.addEventListener('xrloaded', onXrLoaded);
        }
      });
    };

    // Clean up native 8th Wall session and all injected DOM elements on exit
    const stopNativeAR = () => {
      if (typeof window !== 'undefined') {
        if ((window as any).XR8) {
          const XR8 = (window as any).XR8;
          try {
            XR8.stop();
            XR8.removeCameraPipelineModule('slam-renderer-init');
          } catch (e) {
            console.log('Error cleaning up native 8th Wall:', e);
          }
        }

        // Remove all dynamically injected XRExtras & 8th Wall DOM elements to prevent layout shifts/scroll growth
        const idsToRemove = [
          'xrextras-loading',
          'xrextras-loading-container',
          'xrextras-loading-overlay',
          'xrextras-runtime-error',
          'landing-page',
          'landing-page-container',
          'camerafeed'
        ];
        idsToRemove.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.remove();
        });

        // Query and remove any residual absolute positioning classes/overlays
        const selectors = [
          '.xr-portal',
          '.xrextras-show-portrait',
          '#xrextras-show-portrait',
          'body > div[style*="z-index"]',
        ];
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Reset inline overrides on document body/html applied by XRExtras/8thwall
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.documentElement.style.overflow = '';
      }
    };

    // Ensure we clean up on component unmount
    useEffect(() => {
      return () => {
        stopNativeAR();
      };
    }, []);

    return (
        <div 
            className="relative w-full h-full"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* 8th Wall WebAR Canvas (Only mount when active to prevent layout shifts and scroll bugs) */}
            {is8thWallActive && (
                <div className="fixed inset-0 z-[100] w-screen h-screen opacity-100 pointer-events-auto overflow-hidden select-none bg-black">
                    {arError && (
                        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-slate-950/90 p-6 text-white text-center">
                            <div className="max-w-md w-full p-8 bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl space-y-4">
                                <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
                                <h2 className="text-xl font-bold text-red-400">AR Setup Error</h2>
                                <p className="text-sm text-slate-300">{arError}</p>
                                <button
                                    onClick={() => {
                                        setArError(null);
                                        setIs8thWallActive(false);
                                        stopNativeAR();
                                    }}
                                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
                                >
                                    Go Back
                                </button>
                            </div>
                        </div>
                    )}
                    <canvas id="camerafeed" className="absolute top-0 left-0 w-full h-full object-cover z-0 block" />
                    <ARUIOverlay
                        onExit={() => {
                          setIs8thWallActive(false);
                          stopNativeAR();
                          setPlaced(false);
                          setPositionOffset([0, 0]);
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

            {/* Standard Success Screen (Unmount when AR active to release WebGL preview resources) */}
            {!is8thWallActive && (
                <div className="w-full bg-[#0A1128]/50 backdrop-blur-xl border border-blue-900/30 rounded-[2rem] shadow-[0_0_50px_rgba(2,6,23,0.7)] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex flex-col lg:flex-row">

                        {/* Left Side: 3D Model Viewer */}
                        <div className="w-full lg:w-3/5 bg-[#030712] border-b lg:border-b-0 lg:border-r border-blue-900/30 p-6 flex flex-col min-h-[400px] lg:min-h-[500px] relative group">
                            <div className="absolute top-6 left-6 z-10 flex items-center gap-2 bg-[#0A1128]/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-blue-800/40 shadow-sm text-xs font-semibold text-blue-200">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Live Preview
                            </div>
                            {modelUrl && (
                                <div className="flex-1 w-full min-h-[350px] relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-950 to-slate-900/60 shadow-inner">
                                    <R3FViewer url={modelUrl} />
                                </div>
                            )}
                        </div>

                        {/* Right Side: Info & Actions */}
                        <div className="w-full lg:w-2/5 p-8 lg:p-10 flex flex-col items-center justify-center bg-[#060D1F]/50">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 shadow-sm border border-emerald-500/25">
                                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>

                            <h2 className="text-3xl font-extrabold text-white mb-3 text-center tracking-tight">Upload Complete!</h2>
                            <p className="text-slate-300 text-center mb-8 font-medium text-sm">
                                {isMobile
                                    ? "Your 3D model is ready. Scan the QR code or launch AR directly below."
                                    : "Your 3D model is ready. Scan the QR code with your phone to view in AR."}
                            </p>

                            <div className="bg-white p-5 rounded-2xl mb-8 border border-blue-900/20 shadow-[0_0_30px_rgba(59,130,246,0.1)] transform hover:scale-105 transition-transform duration-300">
                                <QRCodeSVG
                                    value={viewerUrl || "https://dynamic-ar-viewer.app"}
                                    size={180}
                                    bgColor={"#ffffff"}
                                    fgColor={"#020408"}
                                    level={"H"}
                                    includeMargin={false}
                                />
                            </div>

                            <div className="w-full space-y-5">
                                {/* Copy Link Input */}
                                <div className="relative group w-full flex items-center">
                                    <input
                                        type="text"
                                        readOnly
                                        value={viewerUrl}
                                        className="w-full bg-[#0A1128]/80 border border-blue-900/40 text-blue-100 rounded-xl py-3.5 pl-4 pr-24 text-sm font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm group-hover:border-blue-700"
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        <button
                                            onClick={handleCopy}
                                            className="p-1.5 hover:bg-blue-900/40 rounded-lg transition-colors text-blue-400 hover:text-white"
                                            title="Copy to clipboard"
                                        >
                                            <Copy className="w-5 h-5" />
                                        </button>
                                        <a
                                            href={viewerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 hover:bg-blue-900/40 rounded-lg transition-colors text-blue-400 hover:text-white"
                                            title="Open Interactive Viewer"
                                        >
                                            <ExternalLink className="w-5 h-5" />
                                        </a>
                                    </div>
                                </div>

                                {copied && (
                                    <p className="text-emerald-400 text-sm text-center font-bold animate-in fade-in slide-in-from-top-2">
                                        Link copied to clipboard!
                                    </p>
                                )}

                                <div className="flex flex-col gap-3 pt-2">
                                    {/* AR Launchers (Mobile only - irrelevant on desktop) */}
                                    {isMobile && (
                                        <>
                                            {/* Native AR Launchers (Uses local RAM on iOS, fallbacks to Cloudflare R2 on Android) */}
                                            <NativeARButtons glbUrl={`/api/models/${modelId}.glb`} localFileUrl={localFileUrl} title="Z-Plane WebAR" />

                                            {/* Launch WebAR (8th Wall) directly on this page from local RAM! */}
                                            <button
                                                onClick={() => setIs8thWallActive(true)}
                                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-900 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98] border border-blue-500/30 hover:-translate-y-0.5 animate-gradient-button shadow-lg cursor-pointer text-sm"
                                            >
                                                <Compass className="w-5 h-5 text-blue-200" />
                                                Launch WebAR (8th Wall)
                                            </button>
                                        </>
                                    )}

                                    {/* Export 360° Turntable Video */}
                                    <button
                                        onClick={handleExportTurntable}
                                        disabled={isExportingTurntable}
                                        className={`w-full flex items-center justify-center gap-2 font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98] border shadow-lg text-sm ${
                                            isExportingTurntable
                                                ? 'bg-[#0B132B] border-blue-800/40 text-blue-300 cursor-wait'
                                                : 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 hover:from-blue-500 hover:to-indigo-800 text-white border-blue-400/30 hover:-translate-y-0.5 cursor-pointer shadow-[0_0_20px_rgba(37,99,235,0.3)] animate-gradient-button'
                                        }`}
                                    >
                                        {isExportingTurntable ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin text-blue-300" />
                                                <span>Rendering 360° Video ({turntableProgress}%)...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Video className="w-4 h-4 text-blue-200" />
                                                <span>Download 360° Turntable Video</span>
                                            </>
                                        )}
                                    </button>

                                    {/* Upload Another Model */}
                                    <button
                                        onClick={onReset}
                                        className="w-full flex items-center justify-center gap-2 bg-[#0A1128]/60 hover:bg-[#131E3A] border border-blue-900/40 text-slate-200 hover:text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.99] text-sm cursor-pointer"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Upload Another Model
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
