# Complete Developer Guide: Integrating 8th Wall WebAR & SLAM with Three.js

This guide details how to integrate **8th Wall WebAR** with **SLAM (markerless 6DoF World Tracking)** into a modern web project (Next.js / React / TypeScript / Vite) and load remote **GLB/glTF 3D models from a URL**, based directly on the production architecture in this codebase.

---

## 1. Architecture Overview

```text
+-----------------------------------------------------------------------------------+
| 1. BUILD & ASSET EXTRACTION                                                       |
|   @8thwall/engine-binary (npm)                                                    |
|         │                                                                         |
|         ▼ (npm postinstall: shx cp -R)                                            |
|   /public/external/xr/ (xr.js + xr-slam.js + wasm resources)                      |
+-----------------------------------------┬-----------------------------------------+
                                          │
                                          ▼ (HTML <head> Preload with 'slam' chunk)
+-----------------------------------------------------------------------------------+
| 2. RUNTIME INITIALIZATION (layout.tsx & Next.js)                                  |
|   React Component (Ultimate3DViewer.tsx)                                          |
|         │                                                                         |
|         ▼ (User Tap - Synchronous iOS DeviceMotion Permission Request)            |
|   Mount Fullscreen <canvas id="camerafeed"> (No object-cover distortion)          |
+-----------------------------------------┬-----------------------------------------+
                                          │
                                          ▼ XR8.run({ canvas })
+-----------------------------------------------------------------------------------+
| 3. 8th WALL XR8 PIPELINE EXECUTION                                                |
|                                                                                   |
|   ├── XR8.GlTextureRenderer.pipelineModule() ───► Renders live camera feed        |
|   ├── XR8.Threejs.pipelineModule() ─────────────► Synchronizes Three.js xrScene   |
|   ├── XR8.XrController.pipelineModule() ────────► 6DoF SLAM Tracking Engine       |
|   │                                                                               |
|   └── slam-renderer-init (Custom Module)                                          |
|         ├── XR8.XrController.hitTest() ────────► Real-time Floor Reticle Ring    |
|         ├── Three.js GLTFLoader(url) ───────────► Auto-Scale (1.0m) & Floor Ground|
|         └── Multi-Touch Listeners ──────────────► Slide, Pinch-Scale, Twist-Rotate|
+-----------------------------------------------------------------------------------+
```

---

## 2. Dependencies & Build Configuration

### 1. `package.json` Dependencies
Install Three.js and the official 8th Wall engine distribution packages:

```json
{
  "dependencies": {
    "@8thwall/engine-binary": "^1.0.0",
    "@8thwall/landing-page": "^1.0.0",
    "@8thwall/xrextras": "^1.0.0",
    "three": "^0.185.1",
    "shx": "^0.4.0"
  },
  "devDependencies": {
    "@types/three": "^0.185.1"
  },
  "scripts": {
    "postinstall": "shx mkdir -p public/external/xr && shx cp -R node_modules/@8thwall/engine-binary/dist/* public/external/xr/"
  }
}
```

> [!IMPORTANT]
> **Licensing & SLAM Distribution**:
> - **Open Source Framework (MIT)**: Contains the base framework, Face Effects, Image Targets, and XRExtras. It **does NOT** include the SLAM source code.
> - **Precompiled Engine Binary (`@8thwall/engine-binary`)**: Contains the **SLAM (World Tracking / 6DoF)** engine. It is distributed by Niantic as a precompiled, closed-source binary under a free-to-use XR Engine License without requiring cloud App Keys or API subscriptions.
> - The `postinstall` script extracts these precompiled binaries (`xr.js`, `xr-slam.js`, and wasm resources) directly to `/public/external/xr/`.

---

## 3. Preloading SLAM Chunks in Root Layout

In your root layout (e.g. `src/app/layout.tsx` in Next.js or `index.html` in Vite), preload the core engine and explicitly declare the `slam` chunk:

```tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preload self-hosted 8th Wall XR Engine with SLAM chunk */}
        <Script
          src="/external/xr/xr.js"
          strategy="beforeInteractive"
          {...{ 'data-preload-chunks': 'slam' }}
        />
        
        {/* Optional: XRExtras helpers and default landing page */}
        <Script
          src="https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/@8thwall/landing-page@1/dist/landing-page.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 4. Canvas & Device Compatibility

Create a self-contained helper to verify WebGL and camera permissions prior to launching AR:

```typescript
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
    issues.push('Camera access API (getUserMedia) requires a secure HTTPS context.');
  }

  return {
    compatible: issues.length === 0,
    issues,
  };
}
```

### Canvas Styling Rule
Render a dedicated `<canvas id="camerafeed">`:

```tsx
<div className="fixed inset-0 z-[100] w-screen h-screen">
  {/* IMPORTANT: Do not use object-fit: cover on the canvas, as it skews tracking alignment */}
  <canvas id="camerafeed" className="absolute top-0 left-0 w-full h-full block" />
</div>
```

---

## 5. Full Implementation: SLAM & Dynamic GLB Loading from URL

Below is the complete, modular TypeScript implementation for starting an 8th Wall SLAM session and loading any GLB file from a URL with automatic scale normalization and floor grounding:

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface StartAROptions {
  glbUrl: string; // Dynamic URL to GLB model (e.g. '/api/models/chair.glb' or CDN URL)
  onModelLoaded?: (model: THREE.Group) => void;
  onError?: (err: any) => void;
}

export class WebARSession {
  private reticle: THREE.Group | null = null;
  private modelWrapper: THREE.Group | null = null;
  private loadedModel: THREE.Group | null = null;
  private isPlaced: boolean = false;

  public async start({ glbUrl, onModelLoaded, onError }: StartAROptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject('Window not available');

      const onXrLoaded = () => {
        try {
          (window as any).THREE = THREE;
          const XR8 = (window as any).XR8;
          const XRExtras = (window as any).XRExtras;
          const LandingPage = (window as any).LandingPage;

          if (!XR8) return reject('XR8 engine is not loaded');

          // 1. Configure Camera Pipeline Modules
          const modules: any[] = [
            XR8.GlTextureRenderer.pipelineModule(), // Live camera background
            XR8.Threejs.pipelineModule(),           // Synchronized Three.js scene & camera
            XR8.XrController.pipelineModule(),      // SLAM 6DoF world tracking
          ];

          // 2. Add XRExtras UI helpers if available
          if (LandingPage?.pipelineModule) modules.push(LandingPage.pipelineModule());
          if (XRExtras?.FullWindowCanvas?.pipelineModule) modules.push(XRExtras.FullWindowCanvas.pipelineModule());
          if (XRExtras?.Loading?.pipelineModule) modules.push(XRExtras.Loading.pipelineModule());
          if (XRExtras?.RuntimeError?.pipelineModule) modules.push(XRExtras.RuntimeError.pipelineModule());

          XR8.addCameraPipelineModules(modules);

          // 3. Enable 6DoF World Tracking
          XR8.XrController.configure({ disableWorldTracking: false });

          // 4. Custom SLAM Renderer & Model Loading Module
          XR8.addCameraPipelineModule({
            name: 'slam-renderer-module',

            onStart: ({ canvas }: { canvas: HTMLCanvasElement }) => {
              const { scene, camera } = XR8.Threejs.xrScene();

              // Scene Lighting
              const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
              scene.add(ambientLight);

              const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
              dirLight.position.set(5, 10, 5);
              scene.add(dirLight);

              // 4a. Create Floor Reticle (Target Ring)
              const reticleGroup = new THREE.Group();
              const reticleRing = new THREE.Mesh(
                new THREE.RingGeometry(0.3, 0.35, 32),
                new THREE.MeshBasicMaterial({
                  color: 0xa855f7,
                  side: THREE.DoubleSide,
                  transparent: true,
                  opacity: 0.8,
                })
              );
              reticleRing.rotation.x = -Math.PI / 2; // Lie flat on XZ plane
              reticleGroup.add(reticleRing);
              reticleGroup.position.set(0, -1.0, -2.5); // Default in front of camera
              scene.add(reticleGroup);
              this.reticle = reticleGroup;

              // 4b. Create Placement Wrapper
              const wrapper = new THREE.Group();
              wrapper.name = 'ar-model-wrapper';
              wrapper.position.set(0, -1.0, -2.5);
              wrapper.visible = false;
              scene.add(wrapper);
              this.modelWrapper = wrapper;

              // 4c. Load GLB Model from dynamic URL with Auto-Grounding & Scaling
              const loader = new GLTFLoader();
              loader.load(
                glbUrl,
                (gltf) => {
                  const model = gltf.scene;

                  // Compute Bounding Box
                  const box = new THREE.Box3().setFromObject(model);
                  const size = new THREE.Vector3();
                  box.getSize(size);
                  const center = new THREE.Vector3();
                  box.getCenter(center);

                  // Normalize model size to fit within a 1.0-meter real-world bounding box
                  const maxDim = Math.max(size.x, size.y, size.z);
                  const scaleFactor = 1.0 / (maxDim || 1);
                  model.scale.setScalar(scaleFactor);

                  // Ground the pivot so bottom rests exactly at Y = 0
                  model.position.set(
                    -center.x * scaleFactor,
                    -box.min.y * scaleFactor,
                    -center.z * scaleFactor
                  );

                  wrapper.add(model);
                  this.loadedModel = model;
                  if (onModelLoaded) onModelLoaded(model);
                },
                undefined,
                (err) => {
                  console.error('Error loading GLTF from URL:', err);
                  if (onError) onError(err);
                }
              );

              // 4d. Synchronize camera projection
              camera.position.set(0, 2, 2);
              XR8.XrController.updateCameraProjectionMatrix({
                origin: camera.position,
                facing: camera.quaternion,
              });

              // Prevent default touch gestures on canvas
              canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

              resolve();
            },

            // 4e. Real-time SLAM Hit-Testing every frame
            onUpdate: () => {
              if (!this.reticle || this.isPlaced) return;

              let hitFound = false;

              // Use 8th Wall SLAM hit-testing against detected surfaces
              try {
                if (typeof XR8.XrController.hitTest === 'function') {
                  const hitResults = XR8.XrController.hitTest(
                    0.5,
                    0.5,
                    ['FEATURE_POINT', 'ESTIMATED_SURFACE', 'DETECTED_SURFACE']
                  );

                  if (hitResults && hitResults.length > 0) {
                    const hit = hitResults[0];
                    this.reticle.position.set(hit.position.x, hit.position.y, hit.position.z);
                    this.reticle.quaternion.set(hit.rotation.x, hit.rotation.y, hit.rotation.z, hit.rotation.w);
                    hitFound = true;
                  }
                }
              } catch (e) {
                console.warn('XR8 hitTest error, using raycast fallback');
              }

              // Fallback to geometric ground plane (Y = 0)
              if (!hitFound) {
                const { camera } = XR8.Threejs.xrScene();
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
                const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                const target = new THREE.Vector3();
                raycaster.ray.intersectPlane(groundPlane, target);
                if (target) {
                  this.reticle.position.copy(target);
                  this.reticle.quaternion.identity();
                }
              }

              // Align wrapper position with reticle until placed
              if (this.modelWrapper) {
                this.modelWrapper.position.copy(this.reticle.position);
                this.modelWrapper.quaternion.copy(this.reticle.quaternion);
              }
            },
          });

          // 5. Run session on the canvas element
          const canvasElement = document.getElementById('camerafeed') as HTMLCanvasElement;
          XR8.run({ canvas: canvasElement });

        } catch (err) {
          reject(err);
        }
      };

      if ((window as any).XR8) {
        onXrLoaded();
      } else {
        window.addEventListener('xrloaded', onXrLoaded, { once: true });
      }
    });
  }

  // Place the model at the reticle's current location
  public placeModel(): void {
    if (!this.reticle || !this.modelWrapper) return;
    this.isPlaced = true;
    this.reticle.visible = false;
    this.modelWrapper.visible = true;
  }

  // Relocate the model back to scan mode
  public relocateModel(): void {
    if (!this.reticle || !this.modelWrapper) return;
    this.isPlaced = false;
    this.reticle.visible = true;
    this.modelWrapper.visible = false;
  }

  // Clean up and stop session
  public stop(): void {
    if (typeof window !== 'undefined' && (window as any).XR8) {
      const XR8 = (window as any).XR8;
      try {
        XR8.stop();
        XR8.removeCameraPipelineModule('slam-renderer-module');
      } catch (e) {
        console.error('Error stopping XR8 session:', e);
      }
    }
  }
}
```

---

## 6. Touch Gestures (Pinch-to-Scale, Twist-to-Rotate, 1-Finger Slide)

When the model is placed in the scene, attach standard React touch listeners to the viewport container to manipulate the wrapper's transforms:

```typescript
// 1-Finger Drag: Translate on ground plane
const handleTouchMove = (e: React.TouchEvent) => {
  if (!placed) return;

  if (e.touches.length === 1 && touchStart) {
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    setPositionOffset(prev => [prev[0] + dx * 0.006, prev[1] + dy * 0.006]);
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  } 
  else if (e.touches.length === 2 && initialPinchDist && initialTwistAngle) {
    // 2-Finger Pinch: Scale
    const currentDist = getPinchDistance(e.touches);
    const scaleFactor = currentDist / initialPinchDist;
    setScaleMultiplier(Math.max(0.1, Math.min(baseScale * scaleFactor, 10)));

    // 2-Finger Twist: Rotate around Y axis
    const currentAngle = getTwistAngle(e.touches);
    setRotation(baseRotation + (currentAngle - initialTwistAngle));
  }
};
```

---

## 7. Critical Gotchas & Best Practices

1. **iOS Safari Permission Context**: Always request `DeviceMotionEvent.requestPermission()` directly inside the user's `onClick` / `onTouchStart` handler. Awaiting any asynchronous network calls before the request will cause iOS Safari to reject device motion.
2. **Canvas Sizing**: Keep the canvas at full viewport size (`100vw`, `100vh`) with `position: fixed; inset: 0;`. Never apply CSS properties that distort the aspect ratio.
3. **Model Grounding (`y = 0`)**: Always calculate `box.min.y` and subtract it from the model's local Y position so models sit directly on real-world floors rather than sinking through the surface.
4. **Session Cleanup**: When unmounting or navigating away, always execute `XR8.stop()` and `XR8.removeCameraPipelineModule()`.

---

## 8. Minimal Usage Examples

### A. Minimal React Component Example (`SimpleARViewer.tsx`)

This copy-pasteable component demonstrates how to start AR on button click, handle permissions, place/relocate the model, and clean up on unmount:

```tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { WebARSession } from './WebARSession'; // Import class from Section 5

interface SimpleARViewerProps {
  modelUrl: string; // e.g. "/models/robot.glb" or remote CDN URL
  onClose?: () => void;
}

export default function SimpleARViewer({ modelUrl, onClose }: SimpleARViewerProps) {
  const [isARActive, setIsARActive] = useState(false);
  const [isPlaced, setIsPlaced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const sessionRef = useRef<WebARSession | null>(null);

  // 1. Launch AR Session (preserves iOS Safari user gesture)
  const handleLaunchAR = async () => {
    // Request iOS motion permission synchronously in the click handler
    if (
      typeof window !== 'undefined' &&
      (window as any).DeviceMotionEvent &&
      typeof (window as any).DeviceMotionEvent.requestPermission === 'function'
    ) {
      (window as any).DeviceMotionEvent.requestPermission().catch(() => {});
    }

    setIsARActive(true);
    setIsLoading(true);
    setError(null);

    const session = new WebARSession();
    sessionRef.current = session;

    try {
      await session.start({
        glbUrl: modelUrl,
        onModelLoaded: () => {
          setIsLoading(false);
        },
        onError: (err) => {
          setError('Failed to load 3D model.');
          setIsLoading(false);
        },
      });
    } catch (err: any) {
      setError(`Failed to start AR: ${err?.message || String(err)}`);
      setIsLoading(false);
    }
  };

  // 2. Place model at the target ring
  const handlePlace = () => {
    sessionRef.current?.placeModel();
    setIsPlaced(true);
  };

  // 3. Relocate model (return to scanning)
  const handleRelocate = () => {
    sessionRef.current?.relocateModel();
    setIsPlaced(false);
  };

  // 4. Exit AR and cleanup
  const handleExit = () => {
    sessionRef.current?.stop();
    setIsARActive(false);
    setIsPlaced(false);
    if (onClose) onClose();
  };

  // Ensure camera session stops if component unmounts
  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0f172a' }}>
      {!isARActive ? (
        /* Preview / Launch Screen */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
          <h2 style={{ marginBottom: '1rem' }}>3D Model AR Experience</h2>
          <button
            onClick={handleLaunchAR}
            style={{ padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            🚀 Launch WebAR
          </button>
        </div>
      ) : (
        /* Active AR Viewport */
        <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}>
          {/* 8th Wall Fullscreen Canvas */}
          <canvas id="camerafeed" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'block' }} />

          {/* UI Overlay Controls */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px' }}>
            
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', pointerEvents: 'auto' }}>
              <button onClick={handleExit} style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                ✕ Exit AR
              </button>
              {isPlaced && (
                <button onClick={handleRelocate} style={{ padding: '8px 16px', background: '#9333ea', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  🔄 Relocate
                </button>
              )}
            </div>

            {/* Status / Loading Prompt */}
            {isLoading && (
              <div style={{ textAlign: 'center', color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '8px' }}>
                Loading 3D Model...
              </div>
            )}

            {error && (
              <div style={{ textAlign: 'center', color: '#f87171', background: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '8px' }}>
                {error}
              </div>
            )}

            {/* Bottom Action Button */}
            <div style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'auto' }}>
              {!isPlaced ? (
                <button
                  onClick={handlePlace}
                  disabled={isLoading}
                  style={{ padding: '14px 32px', fontSize: '15px', fontWeight: 'bold', background: '#fff', color: '#0f172a', border: 'none', borderRadius: '999px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                >
                  📍 Tap to Place Model
                </button>
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.7)', color: '#e2e8f0', padding: '8px 16px', borderRadius: '999px', fontSize: '12px' }}>
                  Model Placed on Surface
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
```

---

### B. Minimal Vanilla JavaScript / HTML Example

If you are not using React, you can start AR in standard HTML/JS in just a few lines:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Minimal 8th Wall SLAM</title>
  
  <!-- Preload 8th Wall engine with SLAM -->
  <script src="/external/xr/xr.js" data-preload-chunks="slam"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>

  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
    #camerafeed { width: 100vw; height: 100vh; display: block; }
    #place-btn { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); padding: 14px 28px; font-size: 16px; font-weight: bold; border-radius: 50px; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <canvas id="camerafeed"></canvas>
  <button id="place-btn">📍 Place Model</button>

  <script type="module">
    import { WebARSession } from './WebARSession.js';

    const session = new WebARSession();
    
    // Start AR session with model URL
    session.start({
      glbUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb'
    });

    document.getElementById('place-btn').addEventListener('click', () => {
      session.placeModel();
      document.getElementById('place-btn').style.display = 'none';
    });
  </script>
</body>
</html>
```
