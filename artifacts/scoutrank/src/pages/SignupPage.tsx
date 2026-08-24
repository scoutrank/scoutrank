import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/BrandButton';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SPORT_OPTIONS } from '@/lib/sports';
import { COUNTRIES } from '@/lib/locations';
import { useAuth, type SignupData } from '@/contexts/AuthContext';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Check } from 'lucide-react';


export default function SignupPage() {
  const { signup, isLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);

  // Form state
  const [form, setForm] = useState<SignupData>({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    dateOfBirth: '',
    country: '',
    state: '',
    city: '',
    primarySport: '',
    secondarySports: [],
    currentClub: '',
    role: 'athlete',
  });
  const [showPassword, setShowPassword] = useState(false);

  // Declared after form so form.role is in scope
  const roles = [
    { value: 'athlete', label: 'Athlete', desc: 'I want to build my sporting profile' },
    { value: 'coach', label: 'Coach', desc: 'I want to manage athletes and teams' },
    { value: 'scout', label: 'Scout', desc: 'I want to discover and evaluate talent' },
    { value: 'parent', label: 'Parent', desc: 'I want to support my athlete' },
  ];
  const steps = form.role === 'parent' ? ['Account', 'Profile'] : ['Account', 'Profile', 'Sport'];

  // Age validation (must be 16+)
  function checkAge(): { valid: boolean; message?: string; age?: number } {
    if (!form.dateOfBirth) return { valid: true };
    const today = new Date();
    const dob = new Date(form.dateOfBirth);
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < 16) {
      return {
        valid: false,
        age,
        // This check runs for every role (athlete/coach/scout/parent all
        // share this same step-1 form), but the message always said
        // "athletes" regardless of which role the person was signing up
        // as — wrong copy for a coach, scout, or parent hitting this gate.
        message: `ScoutRank requires ${form.role === 'athlete' ? 'athletes' : 'users'} to be at least 16 years old to create their own account. Based on your date of birth, you are currently ${age}. Please ask a parent or guardian to manage your account, or return when you're 16+.`,
      };
    }
    return { valid: true };
  }

  function updateField(field: keyof SignupData, value: string | string[]) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleSecondarySport(sport: string) {
    const current = form.secondarySports;
    if (current.includes(sport)) {
      updateField('secondarySports', current.filter(s => s !== sport));
    } else {
      updateField('secondarySports', [...current, sport]);
    }
  }

  function validateStep(): boolean {
    switch (step) {
      case 0:
        return !!(form.email && form.password && form.password.length >= 6);
      case 1:
        return !!(form.firstName && form.lastName && form.username && form.dateOfBirth && form.country);
      case 2:
        // Parents have no sport step — step 2 is only reached by athlete/coach/scout
        return !!(form.primarySport && form.role);
      default:
        return true;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Age check on step 1 (Profile) - under 16 blocked here
    if (step === 1) {
      const ageResult = checkAge();
      if (!ageResult.valid) {
        setError(ageResult.message || 'You must be at least 16 years old to sign up.');
        return;
      }
    }

    if (!validateStep()) { setError('Please fill in all required fields'); return; }
    if (step < steps.length - 1) { setStep(step + 1); return; }
    try {
      const { needsEmailConfirmation } = await signup(form);
      if (needsEmailConfirmation) {
        setConfirmEmailSent(true);
      } else {
        navigate('/onboarding');
      }
    } catch (err) {
      console.error('Signup failed:', err);
      const rawMessage = err instanceof Error ? err.message : '';
      const isUseless = !rawMessage || rawMessage.trim() === '{}' || rawMessage.trim() === '';
      setError(
        isUseless
          ? 'Something went wrong creating your account. Please try again, and if it keeps happening, check the browser console (F12) for details.'
          : rawMessage
      );
    }
  }

  return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-sr-purple/8 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-sr-blue/8 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="text-center mb-6">
          <Logo size="md" className="justify-center mb-2" />
          <p className="text-sr-text-muted text-sm">Create your ScoutRank. Build your reputation.</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-sr-purple text-white glow-purple' :
                'bg-sr-surface text-sr-text-muted border border-sr-border'
              }`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i <= step ? 'text-sr-silver' : 'text-sr-text-muted'}`}>{s}</span>
              {i < steps.length - 1 && <div className={`w-6 h-px ${i < step ? 'bg-green-500' : 'bg-sr-border'}`} />}
            </div>
          ))}
        </div>

        <div className="card-glass p-8 sm:p-10 shadow-2xl relative overflow-hidden border-sr-purple/20 before:absolute before:inset-0 before:bg-gradient-to-br before:from-sr-purple/10 before:to-transparent before:opacity-50">
          <div className="relative z-10">
          {confirmEmailSent ? (
            <div className="text-center py-4">
              <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
              <p className="text-sr-text-muted text-sm">
                We sent a confirmation link to <span className="text-sr-silver">{form.email}</span>.
                Confirm your email, then log in to finish setting up your profile.
              </p>
            </div>
          ) : (
          <>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 0 && (
              <>
                <h2 className="text-2xl font-display font-bold text-white mb-6 tracking-tight">Create Your Account</h2>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Email *</label>
                  <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} className="input-dark" placeholder="alex@email.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Password *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => updateField('password', e.target.value)} className="input-dark pr-10" placeholder="Min. 6 characters" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sr-text-muted hover:text-white">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">I am a... *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => updateField('role', r.value)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          form.role === r.value
                            ? 'border-sr-purple bg-sr-purple/10 text-white'
                            : 'border-sr-border bg-sr-surface text-sr-text-muted hover:border-sr-purple/30'
                        }`}
                      >
                        <div className="text-sm font-medium">{r.label}</div>
                        <div className="text-xs opacity-70">{r.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-center">
                  <Link to="/signup/club" className="text-xs text-sr-purple-light hover:text-white">
                    Registering a club, school, or academy? →
                  </Link>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="text-2xl font-display font-bold text-white mb-6 tracking-tight">Your Details</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-sr-silver mb-1.5">First Name *</label>
                    <input type="text" value={form.firstName} onChange={e => updateField('firstName', e.target.value)} className="input-dark" placeholder="Alex" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sr-silver mb-1.5">Last Name *</label>
                    <input type="text" value={form.lastName} onChange={e => updateField('lastName', e.target.value)} className="input-dark" placeholder="Morgan" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Username *</label>
                  <input type="text" value={form.username} onChange={e => updateField('username', e.target.value)} className="input-dark" placeholder="alexmorgan" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Date of Birth *</label>
                  <input type="date" value={form.dateOfBirth} onChange={e => updateField('dateOfBirth', e.target.value)} className="input-dark" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Country *</label>
                  <Select value={form.country} onChange={(v) => updateField('country', v)} placeholder="Select country..."
                    options={COUNTRIES.map(c => ({ value: c, label: c }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-sr-silver mb-1.5">State / Region</label>
                    <input type="text" value={form.state} onChange={e => updateField('state', e.target.value)} className="input-dark" placeholder="NSW" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sr-silver mb-1.5">City / Suburb</label>
                    <input type="text" value={form.city} onChange={e => updateField('city', e.target.value)} className="input-dark" placeholder="Sydney" />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-2xl font-display font-bold text-white mb-6 tracking-tight">Your Sport</h2>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Primary Sport *</label>
                  <SearchableSelect value={form.primarySport} onChange={(v) => updateField('primarySport', v)}
                    placeholder="Select your primary sport..." searchPlaceholder="Search sports..."
                    options={SPORT_OPTIONS} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Secondary Sports (optional)</label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1">
                    {SPORT_OPTIONS.filter(s => s.value !== form.primarySport && s.value !== 'other').map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => toggleSecondarySport(s.value)}
                        className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                          form.secondarySports.includes(s.value)
                            ? 'bg-sr-purple/20 border border-sr-purple text-sr-purple-light'
                            : 'bg-sr-surface border border-sr-border text-sr-text-muted hover:border-sr-purple/30'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Current Club / School / Team</label>
                  <input type="text" value={form.currentClub} onChange={e => updateField('currentClub', e.target.value)} className="input-dark" placeholder="e.g. Sydney United Academy" />
                </div>
              </>
            )}

            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)} icon={<ArrowLeft className="h-4 w-4" />}>
                  Back
                </Button>
              )}
              <Button
                type="submit"
                variant="brand"
                className="flex-1"
                size="lg"
                loading={isLoading}
                icon={step < steps.length - 1 ? <ArrowRight className="h-4 w-4" /> : undefined}
              >
                {step < steps.length - 1 ? 'Continue' : 'Create Account'}
              </Button>
            </div>
          </form>
          </>
          )}
          </div>
        </div>

        <p className="text-center text-sm text-sr-text-muted mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-sr-purple-light hover:text-sr-purple font-medium transition-colors">Log in</Link>
        </p>
      </div>
    </div>
  );
}
