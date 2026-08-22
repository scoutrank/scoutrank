import { useState, useRef, useEffect } from 'react';
import { Camera, Circle, Square, Pause, Play, X, RotateCcw, Check, Loader2, SlidersHorizontal, Music } from 'lucide-react';
import { uploadMediaBlob } from '@/lib/mediaStorage';
import { supabase } from '@/lib/supabase';

export type CaptureMode = 'photo' | 'video';

/**
 * Real filters, not just a preview overlay — the same CSS filter string
 * gets applied to the canvas context before every frame is drawn (both
 * the single photo capture and the continuous video draw loop), so
 * what's selected is genuinely baked into the saved file, not something
 * that disappears the moment you leave the camera screen.
 */
const FILTERS: { id: string; label: string; css: string }[] = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.5) contrast(1.1)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.35) saturate(1.3) brightness(1.05)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(-10deg) saturate(1.2) brightness(1.02)' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.1)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.5) contrast(0.9) brightness(1.05) saturate(0.8)' },
  { id: 'dramatic', label: 'Dramatic', css: 'contrast(1.35) saturate(1.1) brightness(0.95)' },
];

interface CameraCaptureProps {
  mode: CaptureMode;
  profileId: string;
  /** TikTok-style pause/resume during recording — off means a single
   * continuous take with no pausing (used for Feed's quick post). */
  allowPause?: boolean;
  maxSeconds?: number;
  onCapture: (url: string) => void;
  onClose: () => void;
}

function pickSupportedMimeType(candidates: string[]): string | undefined {
  return candidates.find(type => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  });
}

// Explore displays every post in a 9:16 portrait card (aspect-[9/16],
// object-cover). Requesting that same aspect ratio directly from the
// camera — for both the live preview and what actually gets recorded —
// means what you see while filming is what shows up there later, instead
// of Explore's crop cutting off parts of a differently-shaped video.
const CAMERA_CONSTRAINTS = (mode: CaptureMode): MediaStreamConstraints => ({
  video: { facingMode: 'environment', aspectRatio: { ideal: 9 / 16 } },
  audio: mode === 'video',
});

/** Centered 9:16 crop rectangle for a given source frame size — shared by
 * both photo capture and the video recording canvas, so both produce
 * exactly the same frame Explore displays. */
function cropRectFor916(srcW: number, srcH: number) {
  const targetRatio = 9 / 16;
  const srcRatio = srcW / srcH;
  let cropW = srcW, cropH = srcH, cropX = 0, cropY = 0;
  if (srcRatio > targetRatio) {
    cropW = srcH * targetRatio;
    cropX = (srcW - cropW) / 2;
  } else {
    cropH = srcW / targetRatio;
    cropY = (srcH - cropH) / 2;
  }
  return { cropW, cropH, cropX, cropY };
}

/**
 * Real live camera preview before anything is captured — this is the
 * whole point of this component existing instead of the old
 * instant-capture functions, which grabbed the camera and immediately
 * snapped/started recording with nothing ever shown on screen first.
 *
 * The review step uploads the capture immediately and plays it back from
 * the real hosted URL, rather than a local blob: URL. Blob playback of a
 * freshly-recorded video turned out to be genuinely unreliable in Chrome
 * (a documented duration/seeking bug, worse for a paused-then-resumed
 * recording specifically) — the exact same file plays back completely
 * normally once served over real HTTP, which this now does immediately
 * instead of waiting until after "Use Video" is tapped.
 */
export function CameraCapture({ mode, profileId, allowPause = false, maxSeconds, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [error, setError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const selectedFilterRef = useRef(FILTERS[0]);
  const [showFilterPicker, setShowFilterPicker] = useState(false);

  const chooseFilter = (f: typeof FILTERS[number]) => {
    setSelectedFilter(f);
    selectedFilterRef.current = f;
  };

  // Background music — a real, live search against Jamendo's catalog
  // (hundreds of thousands of tracks, not a small pre-uploaded set),
  // genuinely mixed into the recording's audio via the Web Audio API
  // (mic + track combined into one output stream), not just played
  // alongside separately. Only relevant for video.
  const [musicQuery, setMusicQuery] = useState('');
  const [musicTracks, setMusicTracks] = useState<{ id: string; name: string; artist: string; url: string }[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<{ name: string; url: string } | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedMusicRef = useRef<{ url: string; el: HTMLAudioElement } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const musicDebounceRef = useRef<number | null>(null);

  const runMusicSearch = (q: string) => {
    setMusicLoading(true);
    supabase.functions.invoke('search-music', { body: { q, limit: 25 } })
      .then(({ data, error: invokeErr }) => {
        if (invokeErr) { console.error('[music] Search failed:', invokeErr.message); setMusicTracks([]); return; }
        if (data?.error) { console.error('[music] Search failed:', data.error); setMusicTracks([]); return; }
        setMusicTracks(data?.tracks ?? []);
      })
      .catch(err => console.error('[music] Search failed:', err))
      .finally(() => setMusicLoading(false));
  };

  useEffect(() => {
    if (!showMusicPicker) return;
    if (musicDebounceRef.current) window.clearTimeout(musicDebounceRef.current);
    musicDebounceRef.current = window.setTimeout(() => runMusicSearch(musicQuery), 400);
    return () => { if (musicDebounceRef.current) window.clearTimeout(musicDebounceRef.current); };
  }, [musicQuery, showMusicPicker]);

  const togglePreview = (url: string) => {
    if (previewingUrl === url) {
      previewAudioRef.current?.pause();
      setPreviewingUrl(null);
      return;
    }
    if (previewAudioRef.current) previewAudioRef.current.pause();
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.play().catch(() => {});
    audio.onended = () => setPreviewingUrl(null);
    previewAudioRef.current = audio;
    setPreviewingUrl(url);
  };

  // Start fetching/buffering the track the moment it's picked, not when
  // recording starts — the proxy has to fetch the file from Jamendo on
  // first request, which takes a few real seconds. Doing that while the
  // person is still framing their shot means it's already buffered and
  // ready to play instantly by the time they actually hit record,
  // instead of a few seconds of silence at the start of every take.
  const selectMusic = (track: { name: string; url: string } | null) => {
    if (preloadedMusicRef.current) { preloadedMusicRef.current.el.pause(); preloadedMusicRef.current = null; }
    setSelectedMusic(track);
    if (!track) return;
    const proxyUrl = `https://gmgjpbiiqjaidhtuhkpx.supabase.co/functions/v1/proxy-music?url=${encodeURIComponent(track.url)}`;
    const el = new Audio(proxyUrl);
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.load();
    preloadedMusicRef.current = { url: track.url, el };
  };

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS(mode)).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsReady(true);
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Could not access camera. Check permissions.');
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      previewAudioRef.current?.pause();
      musicAudioRef.current?.pause();
      preloadedMusicRef.current?.el.pause();
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const uploadAndReview = async (blob: Blob, kind: 'photo' | 'video') => {
    setIsUploading(true);
    setError('');
    try {
      const url = await uploadMediaBlob(blob, profileId, kind);
      setReviewUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload this capture. Please try again.');
      setRecordingState('idle');
    } finally {
      setIsUploading(false);
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const { cropW, cropH, cropX, cropY } = cropRectFor916(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.filter = selectedFilter.css;
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    canvas.toBlob(blob => {
      if (!blob) { setError('Could not capture photo.'); return; }
      stopStream();
      uploadAndReview(blob, 'photo');
    }, 'image/jpeg', 0.9);
  };

  const startCanvasDrawLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      if (srcW && srcH) {
        const { cropW, cropH, cropX, cropY } = cropRectFor916(srcW, srcH);
        const w = Math.round(cropW), h = Math.round(cropH);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        ctx.filter = selectedFilterRef.current.css;
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, w, h);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  const stopCanvasDrawLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; setPreviewingUrl(null); }

    // Record from the cropped canvas (guaranteed exact 9:16), not the raw
    // camera stream (whatever aspect ratio the hardware actually gave
    // us) — audio needs to come from somewhere too, since canvas streams
    // are video-only on their own.
    startCanvasDrawLoop();
    const canvasStream = canvas.captureStream(30);

    if (selectedMusic) {
      // Genuinely mix the mic with the chosen track into one real audio
      // stream — mic turned down so it doesn't fight the music, but
      // still there for any ambient sound (crowd noise, a coach
      // shouting, etc.), not muted outright.
      const audioCtx = new AudioContext();
      audioCtx.resume().then(
        () => console.log('[music] AudioContext state after resume:', audioCtx.state),
        err => console.error('[music] Failed to resume AudioContext:', err),
      );
      audioContextRef.current = audioCtx;
      const destination = audioCtx.createMediaStreamDestination();

      const micSource = audioCtx.createMediaStreamSource(stream);
      const micGain = audioCtx.createGain();
      micGain.gain.value = 0.45;
      micSource.connect(micGain).connect(destination);

      const musicUrl = `https://gmgjpbiiqjaidhtuhkpx.supabase.co/functions/v1/proxy-music?url=${encodeURIComponent(selectedMusic.url)}`;
      const musicEl = preloadedMusicRef.current?.url === selectedMusic.url ? preloadedMusicRef.current.el : new Audio(musicUrl);
      console.log('[music] Using', preloadedMusicRef.current?.url === selectedMusic.url ? 'preloaded' : 'freshly-created', 'element, readyState:', musicEl.readyState);
      musicEl.loop = true;
      musicEl.crossOrigin = 'anonymous';
      musicEl.onerror = () => console.error('[music] <audio> element error:', musicEl.error?.code, musicEl.error?.message);
      musicEl.oncanplay = () => console.log('[music] Track is ready to play (canplay fired), duration:', musicEl.duration);
      musicEl.onplay = () => console.log('[music] <audio> element onplay fired');
      musicEl.onplaying = () => console.log('[music] <audio> element onplaying fired (actually producing audio now)');
      musicAudioRef.current = musicEl;
      const musicSource = audioCtx.createMediaElementSource(musicEl);
      const musicGain = audioCtx.createGain();
      musicGain.gain.value = 0.85;
      musicSource.connect(musicGain).connect(destination);
      musicSource.connect(musicGain).connect(audioCtx.destination); // also audible live, for timing movement to the beat while filming
      musicEl.currentTime = 0;
      musicEl.play().then(
        () => console.log('[music] play() promise resolved successfully'),
        err => console.error('[music] Failed to play track for mixing:', err),
      );

      const destTracks = destination.stream.getAudioTracks();
      console.log('[music] Destination stream audio tracks:', destTracks.length, destTracks.map(t => ({ id: t.id, enabled: t.enabled, muted: t.muted, readyState: t.readyState })));
      destTracks.forEach(track => canvasStream.addTrack(track));
      console.log('[music] canvasStream audio tracks after adding:', canvasStream.getAudioTracks().length);
    } else {
      stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    }

    const preferredType = pickSupportedMimeType([
      'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
    ]);
    let recorder: MediaRecorder;
    try {
      recorder = preferredType ? new MediaRecorder(canvasStream, { mimeType: preferredType }) : new MediaRecorder(canvasStream);
    } catch (err) {
      stopCanvasDrawLoop();
      setError(err instanceof Error ? err.message : 'Could not start recording.');
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      stopCanvasDrawLoop();
      if (musicAudioRef.current) { musicAudioRef.current.pause(); musicAudioRef.current = null; }
      if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
      const actualType = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: actualType });
      stopStream();
      uploadAndReview(blob, 'video');
    };
    recorder.start(1000); // timeslice — a chunk every second, so pausing shortly after starting still has data
    recorderRef.current = recorder;
    setRecordingState('recording');
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(s => {
        const next = s + 1;
        if (maxSeconds && next >= maxSeconds) stopRecording();
        return next;
      });
    }, 1000);
  };

  const pauseRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    try {
      recorder.pause();
      musicAudioRef.current?.pause();
      setRecordingState('paused');
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err) {
      setError(`Could not pause: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const resumeRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    try {
      recorder.resume();
      musicAudioRef.current?.play().catch(() => {});
      setRecordingState('recording');
      timerRef.current = setInterval(() => {
        setElapsedSeconds(s => {
          const next = s + 1;
          if (maxSeconds && next >= maxSeconds) stopRecording();
          return next;
        });
      }, 1000);
    } catch (err) {
      setError(`Could not resume: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const retake = () => {
    setReviewUrl(null);
    setRecordingState('idle');
    setElapsedSeconds(0);
    setError('');
    navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS(mode)).then(stream => {
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
    }).catch(err => setError(err instanceof Error ? err.message : 'Could not access camera.'));
  };

  const confirm = () => {
    if (reviewUrl) onCapture(reviewUrl);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-black/40 flex items-center justify-center text-white">
          <X className="h-5 w-5" />
        </button>
        {mode === 'video' && recordingState !== 'idle' && !reviewUrl && !isUploading && (
          <div className="px-3 py-1 rounded-full bg-red-500/90 text-white text-sm font-medium flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full bg-white ${recordingState === 'recording' ? 'animate-pulse' : ''}`} />
            {formatTime(elapsedSeconds)}{maxSeconds ? ` / ${formatTime(maxSeconds)}` : ''}
          </div>
        )}
        {recordingState === 'idle' && !reviewUrl && !isUploading ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilterPicker(s => !s)}
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-medium transition-colors ${
                showFilterPicker || selectedFilter.id !== 'none' ? 'bg-sr-purple text-white' : 'bg-black/40 text-white'
              }`}>
              <SlidersHorizontal className="h-4 w-4" /> {selectedFilter.label}
            </button>
            {mode === 'video' && (
              <button onClick={() => setShowMusicPicker(s => !s)}
                className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  showMusicPicker || selectedMusic ? 'bg-sr-purple text-white' : 'bg-black/40 text-white'
                }`}>
                <Music className="h-4 w-4" /> {selectedMusic ? selectedMusic.name : 'Music'}
              </button>
            )}
          </div>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {showFilterPicker && recordingState === 'idle' && !reviewUrl && !isUploading && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => chooseFilter(f)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedFilter.id === f.id ? 'border-sr-purple bg-sr-purple/20 text-white' : 'border-white/20 text-white/70 hover:border-white/40'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {showMusicPicker && mode === 'video' && recordingState === 'idle' && !reviewUrl && !isUploading && (
        <div className="px-4 pb-2">
          <input
            value={musicQuery}
            onChange={e => setMusicQuery(e.target.value)}
            placeholder="Search tracks..."
            className="w-full mb-2 px-3 py-2 rounded-lg bg-black/40 border border-white/20 text-white text-xs placeholder:text-white/40 focus:outline-none focus:border-sr-purple"
          />
          <div className="max-h-40 overflow-y-auto space-y-1.5 bg-black/40 rounded-xl p-2">
            <button onClick={() => selectMusic(null)}
              className={`w-full text-left text-xs px-3 py-2 rounded-lg flex items-center justify-between ${
                !selectedMusic ? 'bg-sr-purple/30 text-white' : 'text-white/70 hover:bg-white/5'
              }`}>
              No music (original sound)
              {!selectedMusic && <Check className="h-3.5 w-3.5" />}
            </button>
            {musicLoading ? (
              <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 text-white/50 animate-spin" /></div>
            ) : musicTracks.length === 0 ? (
              <p className="text-xs text-white/50 px-3 py-2">No tracks found — try a different search.</p>
            ) : (
              musicTracks.map(t => (
                <div key={t.id}
                  className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${
                    selectedMusic?.url === t.url ? 'bg-sr-purple/30 text-white' : 'text-white/70 hover:bg-white/5'
                  }`}>
                  <button onClick={() => togglePreview(t.url)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                    {previewingUrl === t.url ? <Pause className="h-3.5 w-3.5 flex-shrink-0" /> : <Play className="h-3.5 w-3.5 flex-shrink-0" />}
                    <span className="truncate">{t.name} — {t.artist}</span>
                  </button>
                  <button onClick={() => selectMusic({ name: t.name, url: t.url })} className="flex-shrink-0 ml-2">
                    {selectedMusic?.url === t.url ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px] text-white/40">Select</span>}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
        {/* Locked to the exact 9:16 frame Explore displays posts in — this
            is what you're actually shooting inside, not just a preview
            overlay, so nothing gets cropped differently later. */}
        <div className="relative h-full max-h-full aspect-[9/16] max-w-full bg-black overflow-hidden">
          {error ? (
            <div className="h-full flex items-center justify-center p-6">
              <p className="text-sm text-red-400 text-center">{error}</p>
            </div>
          ) : isUploading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
              <p className="text-sm text-white/70">Uploading...</p>
            </div>
          ) : reviewUrl ? (
            mode === 'photo'
              ? <img src={reviewUrl} alt="" className="h-full w-full object-cover" />
              : <video src={reviewUrl} controls playsInline className="h-full w-full object-cover" />
          ) : (
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" style={{ filter: selectedFilter.css }} />
          )}
          <canvas ref={canvasRef} className="hidden" />
          {!isReady && !error && !reviewUrl && !isUploading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Camera className="h-10 w-10 text-white/40 animate-pulse" />
            </div>
          )}
        </div>
      </div>

      <div className="p-6 pb-8 flex items-center justify-center gap-8">
        {reviewUrl ? (
          <>
            <button onClick={retake} className="flex flex-col items-center gap-1.5 text-white">
              <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center"><RotateCcw className="h-6 w-6" /></div>
              <span className="text-xs">Retake</span>
            </button>
            <button onClick={confirm} className="flex flex-col items-center gap-1.5 text-white">
              <div className="h-16 w-16 rounded-full bg-sr-purple flex items-center justify-center"><Check className="h-7 w-7" /></div>
              <span className="text-xs">Use {mode === 'photo' ? 'Photo' : 'Video'}</span>
            </button>
          </>
        ) : isUploading ? null : mode === 'photo' ? (
          <button onClick={takePhoto} disabled={!isReady} className="h-16 w-16 rounded-full bg-white ring-4 ring-white/30 disabled:opacity-40" />
        ) : recordingState === 'idle' ? (
          <button onClick={startRecording} disabled={!isReady} className="h-16 w-16 rounded-full bg-red-500 ring-4 ring-white/30 disabled:opacity-40 flex items-center justify-center">
            <Circle className="h-7 w-7 text-white fill-white" />
          </button>
        ) : (
          <>
            {allowPause && (
              <button onClick={recordingState === 'recording' ? pauseRecording : resumeRecording}
                className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center text-white">
                {recordingState === 'recording' ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
              </button>
            )}
            <button onClick={stopRecording} className="h-16 w-16 rounded-full bg-white flex items-center justify-center ring-4 ring-red-500/50">
              <Square className="h-6 w-6 text-red-500 fill-red-500" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
