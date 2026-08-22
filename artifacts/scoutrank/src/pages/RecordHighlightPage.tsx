import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CameraCapture, type CaptureMode } from '@/components/CameraCapture';

/**
 * A real separate page (not a modal) for recording a highlight, as
 * opposed to the Feed page's quick-post camera which is a single
 * continuous take. This one supports TikTok-style pause/resume — you can
 * stop mid-recording and pick back up on the same clip.
 */
export default function RecordHighlightPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<CaptureMode | null>(null);
  const [error, setError] = useState('');

  const returnTo = searchParams.get('returnTo') ?? '/dashboard';

  const handleCapture = (url: string) => {
    if (!mode) return;
    const separator = returnTo.includes('?') ? '&' : '?';
    navigate(`${returnTo}${separator}recordedUrl=${encodeURIComponent(url)}&recordedType=${mode}`);
  };

  if (!profile) return null;

  if (mode) {
    return (
      <CameraCapture
        mode={mode}
        profileId={profile.id}
        allowPause
        onCapture={handleCapture}
        onClose={() => setMode(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-sr-bg flex flex-col items-center justify-center p-6">
      <h1 className="text-xl font-bold text-white mb-2">Record a Highlight</h1>
      <p className="text-sm text-sr-text-muted mb-6 text-center max-w-xs">
        You can pause and resume while recording video, just like Reels/TikTok — no rush to get it in one take.
      </p>
      {error && <p className="text-sm text-red-400 mb-4 text-center max-w-xs">{error}</p>}
      <div className="flex gap-3">
        <button onClick={() => setMode('photo')}
          className="px-5 py-3 rounded-xl border border-sr-border text-white hover:border-sr-purple/50 transition-colors text-sm font-medium">
          Take Photo
        </button>
        <button onClick={() => setMode('video')}
          className="px-5 py-3 rounded-xl bg-sr-purple text-white hover:bg-sr-purple/90 transition-colors text-sm font-medium">
          Record Video
        </button>
      </div>
      <button onClick={() => navigate(returnTo)} className="mt-6 text-xs text-sr-text-muted hover:text-white transition-colors">
        Cancel
      </button>
    </div>
  );
}
