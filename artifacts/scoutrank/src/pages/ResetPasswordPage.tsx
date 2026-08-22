import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/BrandButton';
import { supabase } from '@/lib/supabase';
import { Loader2, Check, AlertCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(!!data.session);
      setCheckingSession(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!newPassword || !confirmPassword) { setError('Please fill in both fields.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setUpdating(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setUpdating(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/dashboard'), 2000);
  }

  return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <p className="text-sr-text-muted text-sm mt-3">Set a new password</p>
        </div>

        <div className="card-premium p-8">
          {checkingSession ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 mx-auto text-sr-purple animate-spin" /></div>
          ) : !hasRecoverySession ? (
            <div className="text-center py-2">
              <AlertCircle className="h-10 w-10 mx-auto text-red-400 mb-3" />
              <h2 className="text-lg font-semibold text-white mb-2">Link expired or invalid</h2>
              <p className="text-sm text-sr-text-muted mb-4">Password reset links only work once and expire after a while.</p>
              <Link to="/forgot-password" className="text-sr-purple-light hover:text-sr-purple font-medium text-sm">Request a new link →</Link>
            </div>
          ) : done ? (
            <div className="text-center py-2">
              <Check className="h-10 w-10 mx-auto text-sr-success mb-3" />
              <h2 className="text-lg font-semibold text-white mb-2">Password updated</h2>
              <p className="text-sm text-sr-text-muted">Taking you to your dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-sr-silver mb-1.5">New Password</label>
                <input type="password" className="input-dark" placeholder="New password"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-sr-silver mb-1.5">Confirm Password</label>
                <input type="password" className="input-dark" placeholder="Confirm new password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <Button type="submit" variant="brand" className="w-full" disabled={updating}
                icon={updating ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
                {updating ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
