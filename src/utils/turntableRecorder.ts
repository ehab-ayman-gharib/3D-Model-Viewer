/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface TurntableExportOptions {
  modelUrl: string;
  filename?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  onProgress?: (percent: number) => void;
}

export async function exportTurntableVideo({
  modelUrl,
  filename = 'model_turntable',
  width = 1080,
  height = 1080,
  durationSeconds = 5,
  fps = 60,
  onProgress,
}: TurntableExportOptions): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Create off-screen rendering canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = 'fixed';
  canvas.style.top = '-9999px';
  canvas.style.left = '-9999px';
  canvas.style.pointerEvents = 'none';
  canvas.style.opacity = '0';
  document.body.appendChild(canvas);

  // 2. Setup Three.js WebGL Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 3. Scene Setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0518); // Elegant deep purple-black background

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(5, 8, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xa5b4fc, 1.2);
  fillLight.position.set(-5, 4, -4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xd8b4fe, 1.8);
  rimLight.position.set(0, 6, -6);
  scene.add(rimLight);

  const hemiLight = new THREE.HemisphereLight(0xe9d5ff, 0x1e1035, 0.8);
  scene.add(hemiLight);

  // 4. Camera Setup
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);

  // 5. Load GLTF Model
  onProgress?.(5);
  const loader = new GLTFLoader();
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.load(modelUrl, resolve, undefined, (err) => reject(err));
  });

  const model = gltf.scene;

  // Compute model bounding box and center
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Center model at origin inside a pivot group
  model.position.set(-center.x, -center.y, -center.z);
  const pivotGroup = new THREE.Group();
  pivotGroup.add(model);
  scene.add(pivotGroup);

  // Position camera so model fills ~75% of viewport
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fovRad = (camera.fov * Math.PI) / 180;
  const cameraDist = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.45;
  camera.position.set(0, maxDim * 0.15, cameraDist);
  camera.lookAt(0, 0, 0);

  // Initial render
  renderer.render(scene, camera);
  onProgress?.(15);

  // 6. MediaRecorder Stream Configuration
  let mimeType = 'video/webm';
  let fileExt = 'webm';

  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')) {
      mimeType = 'video/mp4;codecs=avc1.42E01E';
      fileExt = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
      fileExt = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
      fileExt = 'webm';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      mimeType = 'video/webm;codecs=vp8';
      fileExt = 'webm';
    }
  }

  const stream = canvas.captureStream(fps);
  const recordedChunks: Blob[] = [];

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000, // 8 Mbps high quality
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  const recordingPromise = new Promise<void>((resolve, reject) => {
    mediaRecorder.onstop = () => {
      try {
        const blob = new Blob(recordedChunks, { type: mimeType });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = `${filename}_360_turntable.${fileExt}`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);
        }, 1000);

        resolve();
      } catch (err) {
        reject(err);
      }
    };
  });

  // 7. Render 360-Degree Turntable Animation Loop
  mediaRecorder.start();

  const totalFrames = durationSeconds * fps;
  const frameIntervalMs = 1000 / fps;

  for (let frame = 0; frame <= totalFrames; frame++) {
    const progressRatio = frame / totalFrames;
    pivotGroup.rotation.y = progressRatio * Math.PI * 2;
    renderer.render(scene, camera);

    const percent = Math.min(99, Math.round(15 + progressRatio * 80));
    onProgress?.(percent);

    // Wait for frame timing to keep video playback at natural speed
    await new Promise((r) => setTimeout(r, frameIntervalMs));
  }

  // Stop recording and wait for final blob
  mediaRecorder.stop();
  await recordingPromise;

  onProgress?.(100);

  // 8. Cleanup WebGL and DOM Resources
  renderer.dispose();
  scene.clear();
  if (canvas.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
}
