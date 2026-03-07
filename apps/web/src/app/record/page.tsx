'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useRecorder, RecordingOptions } from '@/hooks/useRecorder';
import { useUpload } from '@/hooks/useUpload';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const AudioLevelMeter = memo(function AudioLevelMeter({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-2" role="meter" aria-label="Audio level" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}>
      <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden" aria-hidden="true">
        <div
          className={`h-full transition-all duration-75 ${level > 50 ? 'bg-red-500' : 'bg-green-500'}`}
          style={{ width: `${level}%` }}
        />
      </div>
      <span className="text-sm text-slate-400" aria-hidden="true">{level}%</span>
    </div>
  );
});

const Timer = memo(function Timer({ seconds }: { seconds: number }) {
  return (
    <div className="text-3xl font-mono text-white" role="timer" aria-label={`Recording duration: ${formatDuration(seconds)}`}>
      {formatDuration(seconds)}
    </div>
  );
});

const RecordingOption = memo(function RecordingOption({
  id,
  label,
  checked,
  onChange,
  disabled
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-slate-800"
      />
      <label htmlFor={id} className="text-white cursor-pointer">
        {label}
      </label>
    </div>
  );
});

export default function RecordPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    state,
    options,
    stream,
    duration,
    audioLevel,
    error,
    start,
    pause,
    resume,
    stop,
    discard,
    availableDevices,
    selectDevice,
  } = useRecorder();

  const { upload, isUploading, progress } = useUpload();
  
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recordingOptions, setRecordingOptions] = useState<RecordingOptions>({
    screen: true,
    audio: true,
    camera: false,
    cameraPosition: 'bottom-right',
    cameraSize: 20,
  });

  const handleOptionChange = useCallback((key: keyof RecordingOptions, value: boolean | string | number) => {
    setRecordingOptions(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const handleStart = async () => {
    setUploadError(null);
    await start(recordingOptions);
  };

  const handleStop = async () => {
    const blob = await stop();
    setRecordedBlob(blob);
  };

  const handleUpload = async () => {
    if (!recordedBlob) return;

    try {
      setUploadError(null);
      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: `Recording ${new Date().toLocaleDateString()}`,
          duration,
          mimeType: recordedBlob.type,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          throw new Error('Session expired. Please sign in again.');
        }
        throw new Error(payload?.error || 'Failed to create recording');
      }

      if (!payload?.id) {
        throw new Error('Invalid response when creating recording');
      }

      await upload({ recordingId: payload.id, blob: recordedBlob });
      
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        setUploadError('Session expired. Please sign in again.');
        router.push('/login');
        return;
      }
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      console.error('Upload failed:', err);
    }
  };

  const audioInputs = availableDevices.filter(d => d.kind === 'audioinput');
  const videoInputs = availableDevices.filter(d => d.kind === 'videoinput');

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center" role="status" aria-live="polite">
        <div className="text-white">Checking session...</div>
      </div>
    );
  }

  if (state === 'stopped' && recordedBlob) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" role="main">
        <div className="max-w-2xl w-full bg-slate-800 rounded-xl p-6" role="region" aria-label="Recording complete">
          <h2 className="text-2xl font-bold text-white mb-4">Recording Complete</h2>
          
          <video
            src={URL.createObjectURL(recordedBlob)}
            controls
            className="w-full rounded-lg mb-4"
            aria-label="Recorded video preview"
          />
          
          <div className="flex gap-4 justify-end" role="group" aria-label="Recording actions">
            <button
              onClick={() => {
                discard();
                setRecordedBlob(null);
                setUploadError(null);
              }}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label="Discard recording"
            >
              Discard
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label={isUploading ? `Uploading ${progress}%` : 'Save and upload recording'}
            >
              {isUploading ? `Uploading ${progress}%` : 'Save & Upload'}
            </button>
          </div>
          
          {isUploading && (
            <div className="mt-4" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="bg-slate-700 rounded-full h-2" aria-hidden="true">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300" role="alert">
              {uploadError}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state === 'recording' || state === 'paused') {
    return (
      <div className="min-h-screen bg-slate-900 relative" role="application" aria-label="Recording in progress">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
          aria-label="Screen capture preview"
        />
        
        <div className="absolute top-4 right-4 bg-slate-900/80 rounded-lg p-4" role="status" aria-live="polite">
          <Timer seconds={duration} />
          
          <div className="mt-2">
            <AudioLevelMeter level={audioLevel} />
          </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90" role="toolbar" aria-label="Recording controls">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={state === 'paused' ? resume : pause}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              aria-label={state === 'paused' ? 'Resume recording' : 'Pause recording'}
            >
              {state === 'paused' ? 'Resume' : 'Pause'}
            </button>
            
            <button
              onClick={handleStop}
              className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              aria-label="Stop recording"
            >
              Stop
            </button>
            
            <button
              onClick={discard}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              aria-label="Discard recording"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" role="main">
      <div className="max-w-xl w-full bg-slate-800 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-white mb-6">New Recording</h1>
        
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-300" role="alert">
            {error}
          </div>
        )}
        
        <div className="space-y-4" role="group" aria-label="Recording options">
          <RecordingOption
            id="screen"
            label="Record screen"
            checked={recordingOptions.screen}
            onChange={(checked) => handleOptionChange('screen', checked)}
          />
          
          <RecordingOption
            id="audio"
            label="Record microphone"
            checked={recordingOptions.audio}
            onChange={(checked) => handleOptionChange('audio', checked)}
          />
          
          <RecordingOption
            id="camera"
            label="Show camera overlay"
            checked={recordingOptions.camera}
            onChange={(checked) => handleOptionChange('camera', checked)}
          />
          
          {recordingOptions.audio && audioInputs.length > 0 && (
            <div>
              <label htmlFor="audio-input" className="block text-sm text-slate-400 mb-1">
                Microphone
              </label>
              <select
                id="audio-input"
                value={availableDevices.find(d => d.kind === 'audioinput')?.deviceId || ''}
                onChange={(e) => selectDevice(e.target.value, 'audioinput')}
                className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {audioInputs.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {recordingOptions.camera && videoInputs.length > 0 && (
            <div>
              <label htmlFor="video-input" className="block text-sm text-slate-400 mb-1">
                Camera
              </label>
              <select
                id="video-input"
                value={availableDevices.find(d => d.kind === 'videoinput')?.deviceId || ''}
                onChange={(e) => selectDevice(e.target.value, 'videoinput')}
                className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {videoInputs.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {recordingOptions.camera && (
            <div>
              <label htmlFor="camera-position" className="block text-sm text-slate-400 mb-1">
                Camera position
              </label>
              <select
                id="camera-position"
                value={recordingOptions.cameraPosition}
                onChange={(e) => handleOptionChange('cameraPosition', e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-left">Top Left</option>
              </select>
            </div>
          )}
        </div>
        
        <button
          onClick={handleStart}
          className="w-full mt-6 px-6 py-4 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
          aria-label="Start new recording"
        >
          Start Recording
        </button>
      </div>
    </div>
  );
}
