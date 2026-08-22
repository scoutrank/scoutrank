import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/BrandButton';
import { supabase } from '@/lib/supabase';
import { Mail, Loader2, Check, AlertCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email) { setError('Please enter your email address.'); return; }
    setSending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <p className="text-sr-text-muted text-sm mt-3">Reset your password</p>
        </div>

        <div className="card-premium p-8">
          {sent ? (
            <div className="text-center py-2">
              <Check className="h-10 w-10 mx-auto text-sr-success mb-3" />
              <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
              <p className="text-sm text-sr-text-muted">
                If an account exists for <span className="text-sr-silver">{email}</span>, a password reset link is on its way.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-sr-silver mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted" />
                  <input type="email" className="input-dark pl-10" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>
              <Button type="submit" variant="brand" className="w-full" disabled={sending}
                icon={sending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
                {sending ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-sr-text-muted mt-6">
          <Link to="/login" className="text-sr-purple-light hover:text-sr-purple font-medium transition-colors">← Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
