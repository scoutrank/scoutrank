import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/BrandButton';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

// Only ever redirect to a same-app relative path (e.g. "/post/abc123")
// after login — never to an absolute URL someone could craft via the
// query string (?redirect=https://evil.example.com) to redirect people
// off-site right after they authenticate.
function safeRedirectPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('://')) return null;
  return value;
}

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Holds either an email or a username now — see AuthContext.login.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!identifier || !password) { setError('Please fill in all fields'); return; }
    try {
      await login(identifier, password);
      // A suspended/banned account logs in successfully like anyone else
      // — App-level routing (see App.tsx) redirects them to the dedicated
      // /account-restricted page instead of blocking the login itself.
      //
      // Every account — club-owning ones included — lands on /dashboard
      // after login now. A club's own page is still one click away via
      // "My Club" in the nav; it's just not the forced landing spot
      // anymore (that used to cause its own confusion: different accounts
      // landing on visibly different pages after the exact same action).
      const redirectTo = safeRedirectPath(searchParams.get('redirect'));
      if (redirectTo) {
        navigate(redirectTo);
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Sign-in failed. Check your email and password.');
    }
  }

  return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center p-4 relative">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-sr-purple/8 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-sr-blue/8 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Logo size="lg" className="justify-center mb-3" />
          <p className="text-sr-text-muted text-sm">Welcome back. Log in to your ScoutRank.</p>
        </div>

        {/* Card */}
        <div className="card-glass p-8 sm:p-10 shadow-2xl relative overflow-hidden border-sr-purple/20 before:absolute before:inset-0 before:bg-gradient-to-br before:from-sr-purple/10 before:to-transparent before:opacity-50">
          <div className="relative z-10">
            <h1 className="text-3xl font-display font-bold text-white mb-6 tracking-tight">Log In</h1>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sr-silver mb-1.5">Email or Username</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted" />
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  className="input-dark pl-10"
                  placeholder="alex@email.com or alexj"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-sr-silver">Password</label>
                <Link to="/forgot-password" className="text-xs text-sr-purple-light hover:text-sr-purple transition-colors">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-dark pl-10 pr-10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sr-text-muted hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" variant="brand" className="w-full" size="lg" loading={isLoading}>
              Log In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-sr-text-muted">
            Don't have an account?{' '}
            <Link to="/signup" className="text-sr-purple-light hover:text-sr-purple font-medium transition-colors">
              Sign up
            </Link>
          </div>
          </div>
        </div>

        <p className="text-center text-xs text-sr-text-muted mt-6">
          By logging in, you agree to ScoutRank's{' '}
          <Link to="/terms" className="text-sr-silver hover:text-white">Terms</Link> and{' '}
          <Link to="/privacy" className="text-sr-silver hover:text-white">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
