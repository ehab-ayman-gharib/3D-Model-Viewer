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
    <main className="min-h-screen bg-[#020408] text-white font-sans flex flex-col items-center justify-center p-4 selection:bg-blue-600/30 overflow-hidden relative">
      {isUploading && <ParticleLoader text="Uploading" />}
      
      {/* Deep Navy & Obsidian Ambient Glow Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[45%] rounded-full bg-[#0A1128]/40 blur-[140px] mix-blend-screen" />
        <div className="absolute top-[30%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#131E3A]/30 blur-[140px] mix-blend-screen" />
        <div className="absolute bottom-[-15%] left-[20%] w-[50%] h-[45%] rounded-full bg-[#0B132B]/35 blur-[140px] mix-blend-screen" />
      </div>

      <div className="z-10 flex flex-col items-center w-full max-w-5xl">
        <div className="mb-8 text-center relative w-full max-w-xl">
          {/* Interactive Title (Z-PLANE) */}
          <ParticleText onClick={() => {
            if (localFileUrl) {
              URL.revokeObjectURL(localFileUrl);
            }
            setSuccessModelId(null);
            setLocalFileUrl(null);
            setFile(null);
          }} />
          
          {/* Feature Bubbles */}
          <div className="flex flex-wrap gap-3 items-center justify-center -mt-2 animate-in fade-in slide-in-from-top-4 duration-500">
            <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold border border-blue-900/40 bg-[#0A1128]/70 backdrop-blur-md text-blue-200 shadow-[0_0_15px_rgba(30,58,138,0.15)] flex items-center gap-2 hover:border-blue-700/60 hover:bg-[#131E3A] transition-all cursor-default group">
              <Box className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
              View Model
            </span>
            <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold border border-blue-900/40 bg-[#0A1128]/70 backdrop-blur-md text-blue-200 shadow-[0_0_15px_rgba(30,58,138,0.15)] flex items-center gap-2 hover:border-blue-700/60 hover:bg-[#131E3A] transition-all cursor-default group">
              <Smartphone className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
              View in Native AR
            </span>
            <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold border border-blue-900/40 bg-[#0A1128]/70 backdrop-blur-md text-blue-200 shadow-[0_0_15px_rgba(30,58,138,0.15)] flex items-center gap-2 hover:border-blue-700/60 hover:bg-[#131E3A] transition-all cursor-default group">
              <Globe className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
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
          <div className="w-full max-w-2xl bg-[#0A1128]/50 backdrop-blur-xl border border-blue-900/30 rounded-[2rem] p-8 md:p-12 shadow-[0_0_50px_rgba(2,6,23,0.7)] transition-all">

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ease-out flex flex-col items-center justify-center min-h-[300px] group
                ${isHovering
                  ? 'border-blue-500 bg-[#131E3A]/40 shadow-[0_0_30px_rgba(59,130,246,0.2)]'
                  : file
                    ? 'border-emerald-500/40 bg-emerald-950/20'
                    : 'border-blue-900/30 bg-[#060D1F]/50 hover:border-blue-600/40 hover:bg-[#0B152E]/60'
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
                  <p className="text-xs text-blue-400 mt-6 group-hover:underline font-bold uppercase tracking-wider">Click or drag to replace</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-[#0B132B] border border-blue-900/40 flex items-center justify-center mb-6 group-hover:scale-105 group-hover:border-blue-500/40 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] transition-all duration-300">
                    <Upload className="w-10 h-10 text-blue-400" />
                  </div>
                  <p className="text-2xl font-bold text-white mb-3 tracking-tight">
                    Drag & Drop your 3D model
                  </p>
                  <p className="text-sm text-slate-400 font-mono">
                    We exclusively support <strong className="text-white bg-[#131E3A] px-2 py-0.5 rounded border border-blue-800/40">.glb</strong> files
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
                className={`py-3.5 px-8 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 border cursor-pointer
                  ${!file || isUploading
                    ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed hidden'
                    : 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 hover:from-blue-500 hover:to-indigo-800 text-white border-blue-400/30 shadow-[0_0_20px_rgba(37,99,235,0.35)] hover:-translate-y-0.5 animate-gradient-button'
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
