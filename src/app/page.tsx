/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Upload, FileBox, FileWarning, Box, Smartphone, Globe } from 'lucide-react';
import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { UploadSuccess } from '@/components/UploadSuccess';
import ParticleLoader from '@/components/ParticleLoader';
import ParticleText from '@/components/ParticleText';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successModelId, setSuccessModelId] = useState<string | null>(null);
  const [localFileUrl, setLocalFileUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsHovering(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsHovering(false);
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    if (!selectedFile.name.toLowerCase().endsWith('.glb')) {
      setError('Only .glb files are allowed.');
      setFile(null);
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be under 50MB.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsHovering(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      const objectUrl = URL.createObjectURL(file);
      setLocalFileUrl(objectUrl);
      setSuccessModelId(data.id);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070211] text-slate-100 font-sans flex flex-col items-center justify-center p-4 selection:bg-purple-500/30 overflow-hidden relative">
      {isUploading && <ParticleLoader text="Uploading" />}
      {/* Deep Purple Glow Decor Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[40%] rounded-full bg-[#240A4B]/20 blur-[130px] mix-blend-screen" />
        <div className="absolute top-[30%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#6B1B8C]/10 blur-[130px] mix-blend-screen" />
        <div className="absolute bottom-[-10%] left-[20%] w-[45%] h-[40%] rounded-full bg-[#0D0B34]/15 blur-[130px] mix-blend-screen" />
      </div>

      <div className="z-10 flex flex-col items-center w-full max-w-5xl">
        <div className="mb-8 text-center relative w-full max-w-xl">
          {/* Interactive Particle Morphing Title (Z-PLANE) */}
          <ParticleText />
          
          {/* Feature Bubbles */}
          <div className="flex flex-wrap gap-3 items-center justify-center -mt-2 animate-in fade-in slide-in-from-top-4 duration-550">
            <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold border border-purple-500/20 bg-[#1a0b36]/60 backdrop-blur-md text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.03)] flex items-center gap-2 hover:border-purple-500/40 hover:bg-purple-900/30 transition-all cursor-default group">
              <Box className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              View Model
            </span>
            <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold border border-purple-500/20 bg-[#1a0b36]/60 backdrop-blur-md text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.03)] flex items-center gap-2 hover:border-purple-500/40 hover:bg-purple-900/30 transition-all cursor-default group">
              <Smartphone className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              View in Native AR
            </span>
            <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold border border-purple-500/20 bg-[#1a0b36]/60 backdrop-blur-md text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.03)] flex items-center gap-2 hover:border-purple-500/40 hover:bg-purple-900/30 transition-all cursor-default group">
              <Globe className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              View in WebAR
            </span>
          </div>
        </div>

        {successModelId ? (
          <UploadSuccess
            modelId={successModelId}
            localFileUrl={localFileUrl || undefined}
            onReset={() => {
              if (localFileUrl) {
                URL.revokeObjectURL(localFileUrl);
              }
              setSuccessModelId(null);
              setLocalFileUrl(null);
              setFile(null);
            }}
          />
        ) : (
          <div className="w-full max-w-2xl bg-[#130B24]/40 backdrop-blur-xl border border-purple-900/30 rounded-[2rem] p-8 md:p-12 shadow-[0_0_50px_rgba(15,5,30,0.5)] transition-all">

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ease-out flex flex-col items-center justify-center min-h-[300px] group
                ${isHovering
                  ? 'border-purple-500 bg-purple-950/20 shadow-[0_0_30px_rgba(168,85,247,0.15)]'
                  : file
                    ? 'border-emerald-500/30 bg-emerald-950/10'
                    : 'border-purple-900/20 bg-purple-950/10 hover:border-purple-500/30 hover:bg-purple-950/20'
                }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInput}
                accept=".glb"
                className="hidden"
              />

              {file ? (
                <div className="animate-in zoom-in-95 duration-200 flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-5 shadow-sm border border-emerald-500/25">
                    <FileBox className="w-10 h-10 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-white mb-2 tracking-tight">{file.name}</p>
                  <p className="text-sm text-slate-400 font-mono">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  <p className="text-xs text-purple-400 mt-6 group-hover:underline font-bold uppercase tracking-wider">Click or drag to replace</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-purple-950 border border-purple-900/30 flex items-center justify-center mb-6 group-hover:scale-105 group-hover:border-purple-500/30 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] transition-all duration-300">
                    <Upload className="w-10 h-10 text-purple-400" />
                  </div>
                  <p className="text-2xl font-bold text-slate-200 mb-3 tracking-tight">
                    Drag & Drop your model
                  </p>
                  <p className="text-sm text-slate-500 font-mono">
                    We exclusively support <strong className="text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-900/40">.glb</strong> files
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-6 p-4 rounded-xl bg-rose-950/30 border border-rose-900/50 flex items-center gap-3 text-rose-300 animate-in slide-in-from-top-2 shadow-sm">
                <FileWarning className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className={`py-3.5 px-8 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 border
                  ${!file || isUploading
                    ? 'bg-slate-800 text-slate-500 border-slate-700/50 cursor-not-allowed hidden'
                    : 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-650 text-white border-purple-500/30 hover:-translate-y-0.5 animate-gradient-button'
                  }`}
              >
                Upload & Generate AR Link
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
