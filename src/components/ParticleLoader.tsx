'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function LoaderTextParticles({ text }: { text: string }) {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate particle positions from offscreen canvas drawing the loader text
  const [positions, initialPositions] = useMemo(() => {
    if (typeof window === 'undefined') {
      return [new Float32Array(0), new Float32Array(0)];
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [new Float32Array(0), new Float32Array(0)];

    // Large offscreen canvas to prevent clipping
    canvas.width = 1000;
    canvas.height = 150;

    ctx.fillStyle = '#ffffff';
    // Dynamically size font based on word length to prevent cropping
    const fontSize = text.length > 10 ? '64px' : '82px';
    ctx.font = `900 ${fontSize} sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 500, 75);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const coords: [number, number, number][] = [];
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];
        if (alpha > 128) {
          const px = (x - 500) * 0.022;
          const py = -(y - 75) * 0.022;
          const pz = (Math.random() - 0.5) * 0.15;
          coords.push([px, py, pz]);
        }
      }
    }

    const pos = new Float32Array(coords.length * 3);
    const initPos = new Float32Array(coords.length * 3);
    for (let i = 0; i < coords.length; i++) {
      pos[i * 3] = coords[i][0];
      pos[i * 3 + 1] = coords[i][1];
      pos[i * 3 + 2] = coords[i][2];

      initPos[i * 3] = coords[i][0];
      initPos[i * 3 + 1] = coords[i][1];
      initPos[i * 3 + 2] = coords[i][2];
    }

    return [pos, initPos];
  }, [text]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(999, 999) },
    uViewportWidth: { value: 10.0 }
  }), []);

  useFrame((state) => {
    const { clock, pointer, viewport } = state;
    if (pointsRef.current) {
      const material = pointsRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = clock.getElapsedTime();
      material.uniforms.uMouse.value.lerp(pointer, 0.1);
      material.uniforms.uViewportWidth.value = viewport.width;
    }
  });

  const vertexShader = `
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uViewportWidth;
    attribute vec3 aInitPosition;
    varying float vAlpha;
    varying vec3 vPosition;

    void main() {
      // Calculate dynamic scale factor to fit viewport width on all devices
      float maxTextWidth = 11.2;
      float textScale = min(1.0, (uViewportWidth - 0.8) / maxTextWidth);
      
      vec3 pos = aInitPosition;
      pos.x *= textScale;
      pos.y *= textScale;

      // Organic drift motion
      float driftX = sin(uTime * 1.4 + aInitPosition.y * 3.0) * 0.08;
      float driftY = cos(uTime * 1.7 + aInitPosition.x * 3.0) * 0.08;
      pos.x += driftX;
      pos.y += driftY;

      // Mouse interactive repulsion (repels particles when cursor is close)
      vec3 target = vec3(uMouse.x * uViewportWidth * 0.5, uMouse.y * (uViewportWidth / 4.0), 0.0);
      float dist = distance(pos, target);
      if (dist < 1.8) {
        vec3 dir = normalize(pos - target);
        float force = (1.8 - dist) * 0.8;
        pos += dir * force;
      }

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Pulse particle sizes dynamically
      gl_PointSize = (14.0 + sin(uTime * 4.0 + aInitPosition.x * 10.0) * 5.0) / -mvPosition.z;

      vAlpha = 1.0;
      vPosition = pos;
    }
  `;

  const fragmentShader = `
    varying float vAlpha;
    varying vec3 vPosition;

    void main() {
      // Circular particles with purple neon glow
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = dot(coord, coord);
      if (dist > 0.25) {
        discard;
      }
      
      float alpha = smoothstep(0.25, 0.02, dist) * vAlpha;
      vec3 color = vec3(0.62, 0.25, 0.98); // Neon purple
      
      // Central hot spot
      if (dist < 0.06) {
        color = mix(color, vec3(1.0, 1.0, 1.0), 0.8);
      }
      
      gl_FragColor = vec4(color, alpha * 0.95);
    }
  `;

  if (positions.length === 0) return null;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-aInitPosition"
          args={[initialPositions, 3]}
        />
      </bufferGeometry>
      <shaderMaterial
        depthWrite={false}
        transparent={true}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface ParticleLoaderProps {
  text?: string;
}

export default function ParticleLoader({ text = 'Uploading' }: ParticleLoaderProps) {
  // Extract just the first word if it has multiple words (e.g. "Uploading/Processing")
  const displayWord = text.split(' ')[0] || 'Uploading';

  return (
    <div className="absolute inset-0 w-full h-full bg-[#070211] flex flex-col items-center justify-center z-50 animate-in fade-in duration-300">
      {/* Deep Purple Glow Decor Elements in Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[20%] left-[20%] w-[50%] h-[50%] rounded-full bg-[#240A4B]/20 blur-[130px] mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[20%] w-[50%] h-[50%] rounded-full bg-[#6B1B8C]/10 blur-[130px] mix-blend-screen" />
      </div>

      <div className="w-full h-48 relative z-10">
        <Canvas camera={{ position: [0, 0, 4.6], fov: 45 }} className="w-full h-full">
          <ambientLight intensity={1.0} />
          <LoaderTextParticles text={displayWord} />
        </Canvas>
      </div>
    </div>
  );
}
