'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function TextParticles() {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate particle positions from offscreen canvas drawing "Z-PLANE"
  const [positions, initialPositions] = useMemo(() => {
    if (typeof window === 'undefined') {
      return [new Float32Array(0), new Float32Array(0)];
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [new Float32Array(0), new Float32Array(0)];

    // Large offscreen canvas to prevent 2D boundary clipping
    canvas.width = 1000;
    canvas.height = 150;

    // Draw bold high-tech text centered
    ctx.fillStyle = '#ffffff';
    ctx.font = '800ok 86px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z-PLANE', 500, 75);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const coords: [number, number, number][] = [];
    // Sample pixels coordinates to create particles
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];
        if (alpha > 128) {
          // Centered and scaled coordinates to fit 3D viewport perfectly
          const px = (x - 500) * 0.022;
          const py = -(y - 75) * 0.022;
          const pz = (Math.random() - 0.5) * 0.15; // slight depth
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
  }, []);

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

      // Move mouse pointer smoothly with interpolation
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
      // Subtracting safety margin so text has padding on screen borders
      float maxTextWidth = 11.2;
      float textScale = min(1.0, (uViewportWidth - 0.8) / maxTextWidth);
      
      vec3 pos = aInitPosition;
      pos.x *= textScale;
      pos.y *= textScale;

      // Small organic drift over time (creates floating particle aesthetic)
      float driftX = sin(uTime * 1.2 + aInitPosition.y * 3.0) * 0.06;
      float driftY = cos(uTime * 1.5 + aInitPosition.x * 3.0) * 0.06;
      pos.x += driftX;
      pos.y += driftY;

      // Mouse interactive repulsion (repels particles when cursor is close)
      // Multiply mouse coordinates by half the viewport width to match Three units
      vec3 target = vec3(uMouse.x * uViewportWidth * 0.5, uMouse.y * (uViewportWidth / 4.0), 0.0);
      float dist = distance(pos, target);
      if (dist < 1.6) {
        vec3 dir = normalize(pos - target);
        float force = (1.6 - dist) * 0.75;
        pos += dir * force;
      }

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Size pulsation based on time & distance (slightly larger for neo-tech look)
      gl_PointSize = (14.0 + sin(uTime * 3.0 + aInitPosition.x * 8.0) * 5.0) / -mvPosition.z;

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
      
      // Neon purple/indigo glow gradient color
      float alpha = smoothstep(0.25, 0.02, dist) * vAlpha;
      vec3 color = vec3(0.62, 0.25, 0.98); // Neon purple
      
      // Add central white hot spot to make them pop
      if (dist < 0.06) {
        color = mix(color, vec3(1.0, 1.0, 1.0), 0.75);
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

export default function ParticleText() {
  return (
    <div className="w-full h-44 relative select-none">
      <Canvas camera={{ position: [0, 0, 4.6], fov: 45 }} className="w-full h-full">
        <ambientLight intensity={1.0} />
        <TextParticles />
      </Canvas>
    </div>
  );
}
