/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';

interface NativeARButtonsProps {
  glbUrl: string; // Absolute or relative URL to the GLB model
  localFileUrl?: string; // Optional local browser blob URL for instant loading from RAM
  title?: string;
}

// Memory cleanup utility to release mobile RAM and GPU after conversion
function disposeHierarchy(obj: any) {
  if (!obj) return;
  obj.traverse((child: any) => {
    if (child.isMesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: any) => {
            disposeMaterial(mat);
          });
        } else {
          disposeMaterial(child.material);
        }
      }
    }
  });
}

function disposeMaterial(mat: any) {
  if (!mat) return;
  Object.keys(mat).forEach((prop) => {
    if (mat[prop] && typeof mat[prop].dispose === 'function') {
      mat[prop].dispose();
    }
  });
  mat.dispose();
}

export function NativeARButtons({ glbUrl, localFileUrl, title = '3D Model' }: NativeARButtonsProps) {
  const [isConverting, setIsConverting] = useState(false);
  const [usdzBlobUrl, setUsdzBlobUrl] = useState<string | null>(null);
  const [deviceOS, setDeviceOS] = useState<'ios' | 'android' | 'desktop'>('desktop');

  // Detect Device OS
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
      setDeviceOS('ios');
    } else if (/android/i.test(userAgent)) {
      setDeviceOS('android');
    } else {
      setDeviceOS('desktop');
    }
  }, []);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (usdzBlobUrl) {
        URL.revokeObjectURL(usdzBlobUrl);
      }
    };
  }, [usdzBlobUrl]);

  // Construct absolute URLs since Scene Viewer requires absolute URLs
  const getAbsoluteUrl = (path: string) => {
    if (typeof window === 'undefined') return path;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return path;
    const origin = window.location.origin;
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const absoluteGlbUrl = getAbsoluteUrl(glbUrl);

  // Proactively pre-convert GLB to USDZ on mount / url changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (deviceOS === 'android') return; // Android uses Scene Viewer GLB directly

    const sourceUrl = localFileUrl || absoluteGlbUrl;
    if (!sourceUrl) return;

    let active = true;
    const preConvert = async () => {
      setIsConverting(true);
      try {
        console.log('Pre-converting GLB to USDZ in background:', sourceUrl);
        const loader = new GLTFLoader();
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(sourceUrl, resolve, undefined, (error) => {
            reject(error);
          });
        });

        if (!active) {
          disposeHierarchy(gltf.scene);
          return;
        }

        const exporter = new USDZExporter();
        const arrayBuffer = await exporter.parseAsync(gltf.scene);
        
        // Immediately release textures & mesh buffers from RAM/GPU memory
        disposeHierarchy(gltf.scene);

        const blob = new Blob([arrayBuffer], { type: 'model/vnd.usdz+zip' });
        const blobUrl = URL.createObjectURL(blob);

        if (!active) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        console.log('Pre-conversion successful. Blob URL:', blobUrl);
        setUsdzBlobUrl(blobUrl);
      } catch (err) {
        console.error('Background USDZ pre-conversion failed:', err);
      } finally {
        if (active) {
          setIsConverting(false);
        }
      }
    };

    const timer = setTimeout(preConvert, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [glbUrl, localFileUrl, deviceOS, absoluteGlbUrl]);

  const handleiOSClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (usdzBlobUrl) {
      // If we already have the pre-converted USDZ blob, let the click execute synchronously!
      return;
    }

    // Fallback: if the user clicked before background conversion finished
    e.preventDefault();
    setIsConverting(true);

    try {
      const sourceUrl = localFileUrl || absoluteGlbUrl;
      console.log('Immediate GLB conversion fallback:', sourceUrl);
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.load(sourceUrl, resolve, undefined, (error) => {
          reject(error);
        });
      });

      const exporter = new USDZExporter();
      const arrayBuffer = await exporter.parseAsync(gltf.scene);
      
      // Immediately release textures & mesh buffers from memory
      disposeHierarchy(gltf.scene);

      const blob = new Blob([arrayBuffer], { type: 'model/vnd.usdz+zip' });
      const blobUrl = URL.createObjectURL(blob);

      setUsdzBlobUrl(blobUrl);
      setIsConverting(false);

      setTimeout(() => {
        const link = document.getElementById('ios-ar-link') as HTMLAnchorElement;
        if (link) {
          link.click();
        }
      }, 50);

    } catch (err: any) {
      console.error('Fallback USDZ conversion error:', err);
      alert(`Could not convert model to USDZ: ${err?.message || String(err)}`);
      setIsConverting(false);
    }
  };

  // Android Scene Viewer Intent URL
  const androidLink = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(
    absoluteGlbUrl
  )}&mode=ar_only#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;end;`;

  // Apple Quick Look URL - we append allowsContentScaling=1 or other properties as hash params
  const iosLink = usdzBlobUrl
    ? `${usdzBlobUrl}#allowsContentScaling=1&checkoutTitle=${encodeURIComponent(title)}`
    : '#';

  return (
    <div className="w-full pt-2">
      {deviceOS === 'android' ? (
        /* Android Scene Viewer Button */
        <a
          href={androidLink}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 text-white border border-blue-400/30 hover:-translate-y-0.5 animate-gradient-button font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg cursor-pointer"
        >
          <Zap className="w-4 h-4 text-blue-200 animate-pulse" />
          <span>Launch Native AR (Scene Viewer)</span>
        </a>
      ) : (
        /* iOS / Desktop USDZ Quick Look / Download Button */
        <a
          id="ios-ar-link"
          href={iosLink}
          rel="ar"
          download={deviceOS === 'desktop' ? `${title.replace(/\s+/g, '_')}.usdz` : undefined}
          onClick={handleiOSClick}
          className={`relative w-full flex items-center justify-center gap-2 font-semibold text-sm py-3.5 rounded-xl border transition-all active:scale-[0.98] cursor-pointer ${
            isConverting
              ? 'bg-[#0B132B] border-blue-900/40 text-blue-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 text-white border-blue-400/30 hover:-translate-y-0.5 animate-gradient-button shadow-lg'
          }`}
        >
          {/* iOS Quick Look requires a visible <img> tag as the first child to trigger correctly. */}
          <img
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E"
            alt="AR trigger"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              pointerEvents: 'none',
            }}
          />

          {isConverting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span>Preparing USDZ Scene...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 text-blue-200 animate-pulse" />
              <span>
                {deviceOS === 'desktop' 
                  ? 'Convert & Download USDZ (iOS AR)' 
                  : 'Launch Native AR (Quick Look)'}
              </span>
            </>
          )}
        </a>
      )}
    </div>
  );
}
