import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from '@/lib/env';

export type RecorderState = 'idle' | 'ready' | 'recording' | 'paused' | 'stopped';

export interface RecordingOptions {
  screen: boolean;
  audio: boolean;
  camera: boolean;
  cameraPosition?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';
  cameraSize?: number;
}

export interface UseRecorderReturn {
  state: RecorderState;
  options: RecordingOptions;
  stream: MediaStream | null;
  duration: number;
  audioLevel: number;
  error: string | null;
  start: (options: RecordingOptions) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob>;
  discard: () => void;
  availableDevices: MediaDeviceInfo[];
  selectDevice: (deviceId: string, kind: 'audioinput' | 'videoinput') => void;
}

const CHUNK_DURATION_MS = 1000;

const DEFAULT_OPTIONS: RecordingOptions = {
  screen: true,
  audio: true,
  camera: false,
  cameraPosition: 'bottom-right',
  cameraSize: 20,
};

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle');
  const [options, setOptions] = useState<RecordingOptions>(DEFAULT_OPTIONS);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentStateRef = useRef(state);

  useEffect(() => {
    currentStateRef.current = state;
  }, [state]);

  const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;
        
        setAvailableDevices(devices);
        
        const audioInput = devices.find(d => d.kind === 'audioinput');
        const videoInput = devices.find(d => d.kind === 'videoinput');
        if (audioInput) setSelectedAudioInput(audioInput.deviceId);
        if (videoInput) setSelectedVideoInput(videoInput.deviceId);
      } catch (err) {
        console.error('Failed to enumerate devices:', err);
      }
    }
    getDevices();
    
    return () => {
      mounted = false;
    };
  }, []);

  const selectDevice = useCallback((deviceId: string, kind: 'audioinput' | 'videoinput') => {
    if (kind === 'audioinput') {
      setSelectedAudioInput(deviceId);
    } else {
      setSelectedVideoInput(deviceId);
    }
  }, []);

  const getSupportedMimeType = useCallback((): string => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'video/webm';
  }, []);

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const level = Math.min(100, Math.round((average / 128) * 100));
    setAudioLevel(level);
    
    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const composeFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const screenVideo = screenVideoRef.current;
    const cameraVideo = cameraVideoRef.current;
    
    if (!canvas || !screenVideo || !cameraVideo) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = screenVideo.videoWidth || 1920;
    const height = screenVideo.videoHeight || 1080;
    
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    
    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    
    if (options.camera && cameraVideo.videoWidth > 0) {
      const bubbleSize = (canvas.width * (options.cameraSize || 20)) / 100;
      const padding = 20;
      let camX: number, camY: number;
      
      switch (options.cameraPosition) {
        case 'bottom-right':
          camX = canvas.width - bubbleSize - padding;
          camY = canvas.height - bubbleSize - padding;
          break;
        case 'top-right':
          camX = canvas.width - bubbleSize - padding;
          camY = padding;
          break;
        case 'bottom-left':
          camX = padding;
          camY = canvas.height - bubbleSize - padding;
          break;
        case 'top-left':
        default:
          camX = padding;
          camY = padding;
          break;
      }
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(camX + bubbleSize / 2, camY + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(cameraVideo, camX, camY, bubbleSize, bubbleSize);
      ctx.restore();
      
      ctx.beginPath();
      ctx.arc(camX + bubbleSize / 2, camY + bubbleSize / 2, bubbleSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }, [options.camera, options.cameraPosition, options.cameraSize]);

  const renderLoop = useCallback(() => {
    composeFrame();
    if (currentStateRef.current === 'recording') {
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    }
  }, [composeFrame]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const closeAudioContext = useCallback(async () => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    // Clear ref first so concurrent cleanup calls become no-ops.
    audioContextRef.current = null;

    if (audioContext.state === 'closed') return;

    try {
      await audioContext.close();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'InvalidStateError') {
        return;
      }
      console.warn('Failed to close AudioContext:', err);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      cleanup();

      const mimeType = getSupportedMimeType();
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        
        // Validate file size before returning
        if (blob.size > MAX_FILE_SIZE) {
          setError(`Recording too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
          setState('idle');
          stream?.getTracks().forEach(track => track.stop());
          reject(new Error(`Recording too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`));
          return;
        }
        
        setState('stopped');
        
        stream?.getTracks().forEach(track => track.stop());
        
        resolve(blob);
      };

      mediaRecorder.onerror = (err) => {
        reject(err);
      };

      mediaRecorder.stop();
    });
  }, [cleanup, getSupportedMimeType, stream]);

  const start = useCallback(async (opts: RecordingOptions) => {
    setError(null);
    setOptions(opts);
    chunksRef.current = [];

    try {
      await closeAudioContext();

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        } as MediaTrackConstraints,
        audio: opts.audio,
      });

      const tracks: MediaStreamTrack[] = [...screenStream.getVideoTracks(), ...screenStream.getAudioTracks()];

      if (opts.camera) {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedVideoInput },
          audio: false,
        });
        tracks.push(...cameraStream.getVideoTracks());
      }

      if (opts.audio && !screenStream.getAudioTracks().length) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: selectedAudioInput },
          });
          tracks.push(...micStream.getAudioTracks());
        } catch (err) {
          console.warn('Mic not available:', err);
        }
      }

      let finalStream: MediaStream;

      if (opts.camera) {
        const canvas = document.createElement('canvas');
        canvasRef.current = canvas;
        
        screenVideoRef.current = document.createElement('video');
        screenVideoRef.current.srcObject = new MediaStream(screenStream.getVideoTracks());
        screenVideoRef.current.playsInline = true;
        await screenVideoRef.current.play();
        
        cameraVideoRef.current = document.createElement('video');
        const cameraStream = new MediaStream(tracks.filter(t => t.kind === 'video' && !screenStream.getVideoTracks().includes(t)));
        cameraVideoRef.current.srcObject = cameraStream;
        cameraVideoRef.current.playsInline = true;
        await cameraVideoRef.current.play();
        
        composeFrame();
        
        canvasStreamRef.current = canvas.captureStream(30);
        
        const audioTracks = tracks.filter(t => t.kind === 'audio');
        audioTracks.forEach(t => canvasStreamRef.current!.addTrack(t));
        
        finalStream = canvasStreamRef.current;
      } else {
        finalStream = new MediaStream(tracks);
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(finalStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      finalStream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (currentStateRef.current === 'recording') {
            stopRecording();
          }
        });
      });

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(CHUNK_DURATION_MS);
      setStream(finalStream);
      setState('recording');
      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000));
      }, 1000);

      if (opts.camera) {
        renderLoop();
      }

      updateAudioLevel();

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      setError(message);
      setState('idle');
    }
  }, [selectedAudioInput, selectedVideoInput, getSupportedMimeType, composeFrame, renderLoop, updateAudioLevel, stopRecording, closeAudioContext]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setState('paused');
      cleanup();
    }
  }, [cleanup]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setState('recording');
      
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      if (options.camera) {
        renderLoop();
      }
      updateAudioLevel();
    }
  }, [options.camera, renderLoop, updateAudioLevel]);

  const stop = stopRecording;

  const discard = useCallback(() => {
    cleanup();
    
    stream?.getTracks().forEach(track => track.stop());
    void closeAudioContext();
    
    chunksRef.current = [];
    setDuration(0);
    setAudioLevel(0);
    setStream(null);
    setState('idle');
    setError(null);
  }, [cleanup, stream, closeAudioContext]);

  useEffect(() => {
    return () => {
      cleanup();
      stream?.getTracks().forEach(track => track.stop());
      void closeAudioContext();
    };
  }, [cleanup, stream, closeAudioContext]);

  const audioInputs = useMemo(
    () => availableDevices.filter(d => d.kind === 'audioinput'),
    [availableDevices]
  );
  
  const videoInputs = useMemo(
    () => availableDevices.filter(d => d.kind === 'videoinput'),
    [availableDevices]
  );

  return {
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
  };
}
