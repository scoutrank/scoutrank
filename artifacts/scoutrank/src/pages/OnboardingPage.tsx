import { useState, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/BrandButton';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { uploadMediaBlob } from '@/lib/mediaStorage';
import { SPORT_OPTIONS } from '@/lib/sports';
import { COUNTRIES, getStatesForCountry } from '@/lib/locations';
import { ArrowRight, ArrowLeft, Check, Camera, Upload, Plus, X, Shield, Trophy, Target, Zap, Loader2, AlertCircle } from 'lucide-react';

const AGE_GROUPS = ['U14', 'U16', 'U18', 'U20', 'Open'];
// Coaches/scouts can only select 16+ age groups during normal
// onboarding, for safety/legal reasons — this is a UI-only default,
// deliberately NOT also enforced as a permanent database constraint
// (see SQL #55), since verified junior coaches may legitimately work
// with younger athletes in the future. That exception belongs to the
// verification system (not yet built), not a schema wall here.
const COACH_SCOUT_AGE_GROUPS = ['U16', 'U18', 'U20', 'Open'];

export default function OnboardingPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const isCoachOrScout = profile?.role === 'coach' || profile?.role === 'scout';
  const isParent = profile?.role === 'parent';
  // Club-owner accounts are 'coach'-role under the hood, but their club
  // was already vetted when its application was approved — asking them
  // to also submit personal coach/scout verification is redundant, so
  // they skip this step entirely and get the same "Almost Done" screen
  // athletes see.
  const needsCoachVerification = isCoachOrScout && !profile?.owned_organisation_id;

  // Parents skip onboarding entirely — they have no sport/bio step.
  if (isParent) {
    navigate('/parent', { replace: true });
    return null;
  }
  const onboardingSteps = [
    { id: 'photo', label: 'Photos', icon: Camera },
    { id: 'bio', label: 'Bio', icon: Target },
    { id: 'sport', label: isCoachOrScout ? 'Coverage Areas' : 'Sport Details', icon: Zap },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
    { id: 'verify', label: 'Verify', icon: Shield },
  ];
  const [currentStep, setCurrentStep] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState('');
  const [positions, setPositions] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [dominantFoot, setDominantFoot] = useState('');
  const [competitionLevel, setCompetitionLevel] = useState('');
  const [club, setClub] = useState('');
  const [achievements, setAchievements] = useState([{ title: '', description: '', type: 'award' }]);
  const [completed, setCompleted] = useState(false);

  // Coach/scout coverage areas — collected here rather than on
  // SignupPage because this page only ever renders once a real,
  // authenticated session exists (Signup may have a pending email
  // confirmation with no session yet, which would make a coverage_areas
  // insert fail RLS regardless of how the form is built).
  const [coverageEntries, setCoverageEntries] = useState<{ sport: string; ageGroups: string[]; country: string; state: string; locationDetail: string }[]>([]);
  const [draftSport, setDraftSport] = useState('');
  const [draftAgeGroups, setDraftAgeGroups] = useState<string[]>([]);
  const [draftCountry, setDraftCountry] = useState('');
  const [draftState, setDraftState] = useState('');
  const [draftLocationDetail, setDraftLocationDetail] = useState('');
  const [coverageError, setCoverageError] = useState('');
  const [finishError, setFinishError] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const draftStatesForCountry = draftCountry ? getStatesForCountry(draftCountry) : null;

  function toggleDraftAgeGroup(ag: string) {
    setDraftAgeGroups(prev => prev.includes(ag) ? prev.filter(a => a !== ag) : [...prev, ag]);
  }

  function addCoverageEntry() {
    if (!draftSport || draftAgeGroups.length === 0 || !draftCountry || !draftLocationDetail.trim()) {
      setCoverageError('Please select a sport, at least one age group, a country, and describe where you coach/scout.');
      return;
    }
    setCoverageEntries(prev => [...prev, { sport: draftSport, ageGroups: draftAgeGroups, country: draftCountry, state: draftState, locationDetail: draftLocationDetail.trim() }]);
    setDraftSport(''); setDraftAgeGroups([]); setDraftCountry(''); setDraftState(''); setDraftLocationDetail('');
    setCoverageError('');
  }

  function removeCoverageEntry(i: number) {
    setCoverageEntries(prev => prev.filter((_, idx) => idx !== i));
  }

  // Reuses the same Storage upload path already used for post media —
  // no new bucket needed, same RLS policy (bucket + own-profile-id
  // folder) already permits this.
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setIsUploadingAvatar(true);
    try {
      const url = await uploadMediaBlob(file, profile.id, 'photo');
      setAvatarUrl(url);
    } catch (err) {
      console.error('Failed to upload profile photo:', err);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setIsUploadingBanner(true);
    try {
      const url = await uploadMediaBlob(file, profile.id, 'photo');
      setBannerUrl(url);
    } catch (err) {
      console.error('Failed to upload banner:', err);
    } finally {
      setIsUploadingBanner(false);
    }
  }

  function addAchievement() {
    setAchievements([...achievements, { title: '', description: '', type: 'award' }]);
  }

  function removeAchievement(i: number) {
    setAchievements(achievements.filter((_, idx) => idx !== i));
  }

  function updateAchievement(i: number, field: string, value: string) {
    setAchievements(achievements.map((a, idx) => idx === i ? { ...a, [field]: value } : a));
  }

  async function handleFinish(e: FormEvent) {
    e.preventDefault();
    setCoverageError('');
    setFinishError('');
    if (!profile) { setFinishError('Could not find your account. Please log out and back in, then try again.'); return; }
    setIsFinishing(true);

    // 1. Profile fields — bio always saved; avatar/banner only if the
    // user actually uploaded something this session (null means they
    // skipped, not that they explicitly want to clear the field).
    const profileUpdate: Record<string, string> = { bio };
    if (avatarUrl) profileUpdate.avatar_url = avatarUrl;
    if (bannerUrl) profileUpdate.banner_url = bannerUrl;

    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', profile.id);
    if (profileError) {
      console.error('Failed to save profile:', profileError.message);
      setFinishError('Something went wrong saving your profile. Please try again.');
      setIsFinishing(false);
      return;
    }

    // 2. Athlete sport details — athletes only. Upsert rather than a
    // plain update, since the row may not exist if the signup
    // trigger's athlete_details insert silently failed for this
    // account (it's wrapped in an isolated exception handler).
    if (!isCoachOrScout) {
      // Explicit update-then-insert to avoid PostgREST upsert RLS quirks.
      const detailsPayload = {
        position:           positions,
        height,
        weight,
        dominant_hand_foot: dominantFoot,
        competition_level:  competitionLevel,
        club,
      };

      // 1. Try update first.
      const { count: updateCount, error: updateError } = await supabase
        .from('athlete_details')
        .update(detailsPayload)
        .eq('profile_id', profile.id)
        .select('profile_id', { count: 'exact', head: true });

      if (updateError) {
        console.error('athlete_details update failed:', updateError.message, updateError);
        setFinishError('Something went wrong saving your sport details. Please try again.');
        setIsFinishing(false);
        return;
      }

      // 2. If no row was updated, insert.
      if ((updateCount ?? 0) === 0) {
        const { error: insertError } = await supabase
          .from('athlete_details')
          .insert({ profile_id: profile.id, ...detailsPayload });

        if (insertError) {
          console.error('athlete_details insert failed:', insertError.message, insertError);
          setFinishError('Something went wrong saving your sport details. Please try again.');
          setIsFinishing(false);
          return;
        }
      }
    }

    // 3. Coverage areas — coach/scout only (unchanged from before).
    if (isCoachOrScout && coverageEntries.length > 0) {
      const rows = coverageEntries.flatMap(entry =>
        entry.ageGroups.map(ag => ({
          profile_id: profile.id,
          sport: entry.sport,
          age_group: ag,
          country: entry.country,
          state: entry.state || null,
          location_detail: entry.locationDetail,
        }))
      );
      // Replace, not append — the form's coverageEntries already
      // represents the FULL intended list at submit time, not an
      // incremental addition. Without clearing first, resubmitting
      // (e.g. after fixing an error on a later step) re-inserts the
      // same rows and hits coverage_areas' unique constraint on
      // (profile_id, sport, age_group, country, state).
      const { error: deleteError } = await supabase.from('coverage_areas').delete().eq('profile_id', profile.id);
      if (deleteError) {
        console.error('Failed to clear existing coverage areas:', deleteError.message);
        setCoverageError('Something went wrong saving your coverage areas. Please try again.');
        setIsFinishing(false);
        return;
      }
      const { error: coverageInsertError } = await supabase.from('coverage_areas').insert(rows);
      if (coverageInsertError) {
        console.error('Failed to save coverage areas:', coverageInsertError.message);
        setCoverageError('Something went wrong saving your coverage areas. Please try again.');
        setIsFinishing(false);
        return;
      }
    }

    // 4. Achievements — athletes only. Coaches/scouts don't get ranked, so
    // achievements (which feed the ranking/scoring system) don't apply to
    // them — even if the form state somehow has entries in it.
    const realAchievements = isCoachOrScout ? [] : achievements.filter(a => a.title.trim());
    if (realAchievements.length > 0) {
      const achievementsPayload = realAchievements.map(a => ({
        profile_id: profile.id,
        title: a.title.trim(),
        description: a.description,
        achievement_type: a.type,
      }));
      const { error: achievementsError } = await supabase.from('achievements').insert(achievementsPayload);
      if (achievementsError) {
        console.error('Failed to save achievements:', achievementsError.message);
        setFinishError('Something went wrong saving your achievements. Please try again.');
        setIsFinishing(false);
        return;
      }

    }

    setIsFinishing(false);

    // Mark onboarding as done.
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', profile.id);
    await refreshProfile();
    setCompleted(true);

    // Coach/scout go to the verification form (they saw the "Verify Now / Later"
    // prompt in step 4 and chose "Complete Profile" which implies Verify Now).
    // Club owners and athletes go straight to dashboard.
    setTimeout(() => navigate(needsCoachVerification ? '/verification-status' : '/dashboard'), 1500);
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-20 w-20 mx-auto rounded-full bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center mb-6 animate-pulse-glow">
            <Check className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">You're All Set!</h1>
          <p className="text-sr-text-muted mb-6">Your ScoutRank profile is ready. Let's go.</p>
          <Button variant="brand" onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const step = onboardingSteps[currentStep];
  const StepIcon = step.icon;

  return (
    <div className="min-h-screen bg-sr-bg">
      {/* Header */}
      <div className="border-b border-sr-border bg-sr-bg/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-1">
            {onboardingSteps.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentStep(i)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    i === currentStep
                      ? 'bg-sr-purple/20 text-sr-purple-light border border-sr-purple/30'
                      : i < currentStep
                      ? 'text-green-400'
                      : 'text-sr-text-muted'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-sr-surface">
          <div
            className="h-full bg-gradient-to-r from-sr-purple to-sr-blue transition-all duration-500"
            style={{ width: `${((currentStep + 1) / onboardingSteps.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-sr-purple/20 to-sr-blue/20 flex items-center justify-center mb-4">
            <StepIcon className="h-7 w-7 text-sr-purple-light" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{step.label}</h1>
          <p className="text-sr-text-muted text-sm">Step {currentStep + 1} of {onboardingSteps.length}</p>
        </div>

        <div className="card-premium p-8">
          <form onSubmit={e => {
            e.preventDefault();
            if (isFinishing) return;
            // Coverage is mandatory for coach/scout — block advancing
            // past this step with zero entries, rather than the
            // previous "you can add this later" allowance.
            if (currentStep === 2 && isCoachOrScout && coverageEntries.length === 0) {
              setCoverageError('Please add at least one coverage area before continuing — athletes need this to find you.');
              return;
            }
            setCoverageError('');
            if (currentStep < onboardingSteps.length - 1) setCurrentStep(currentStep + 1); else handleFinish(e);
          }}>
            {currentStep === 0 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Add Your Photos</h2>
                <div className="flex flex-col items-center gap-6">
                  {/* Profile Photo */}
                  <div className="text-center">
                    <p className="text-sm text-sr-silver mb-3">Profile Photo</p>
                    <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={isUploadingAvatar}
                      className="h-32 w-32 mx-auto rounded-2xl bg-sr-surface border-2 border-dashed border-sr-border hover:border-sr-purple/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 overflow-hidden disabled:opacity-60">
                      {isUploadingAvatar ? (
                        <Loader2 className="h-6 w-6 text-sr-text-muted animate-spin" />
                      ) : avatarUrl ? (
                        <img src={avatarUrl} alt="Profile preview" className="h-full w-full object-cover" />
                      ) : (
                        <>
                          <Camera className="h-8 w-8 text-sr-text-muted" />
                          <span className="text-xs text-sr-text-muted">Upload</span>
                        </>
                      )}
                    </button>
                    <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </div>
                  {/* Banner */}
                  <div className="w-full text-center">
                    <p className="text-sm text-sr-silver mb-3">Cover Banner</p>
                    <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={isUploadingBanner}
                      className="h-40 w-full rounded-xl bg-sr-surface border-2 border-dashed border-sr-border hover:border-sr-purple/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 overflow-hidden disabled:opacity-60">
                      {isUploadingBanner ? (
                        <Loader2 className="h-6 w-6 text-sr-text-muted animate-spin" />
                      ) : bannerUrl ? (
                        <img src={bannerUrl} alt="Banner preview" className="h-full w-full object-cover" />
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-sr-text-muted" />
                          <span className="text-sm text-sr-text-muted">Upload banner image</span>
                          <span className="text-xs text-sr-text-muted">Recommended: 1200 x 400</span>
                        </>
                      )}
                    </button>
                    <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Tell Your Story</h2>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Bio / About</label>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    className="input-dark h-32 resize-none"
                    placeholder="Tell the sporting world about yourself. Your journey, your ambitions, what drives you..."
                  />
                  <p className="text-xs text-sr-text-muted mt-1">{bio.length}/500</p>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              isCoachOrScout ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white">Coverage Areas</h2>
                  <p className="text-sm text-sr-text-muted">
                    Tell athletes what you actually coach/scout so they can find you. Add one entry per sport — you can select multiple age groups per sport.
                  </p>
                  {coverageError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{coverageError}</div>
                  )}

                  {coverageEntries.length > 0 && (
                    <div className="space-y-2">
                      {coverageEntries.map((entry, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-sr-surface border border-sr-border">
                          <div>
                            <p className="text-sm text-white font-medium">{SPORT_OPTIONS.find(s => s.value === entry.sport)?.label ?? entry.sport}</p>
                            <p className="text-xs text-sr-text-muted">
                              {entry.ageGroups.join(', ')} · {[entry.country, entry.state, entry.locationDetail].filter(Boolean).join(', ')}
                            </p>
                          </div>
                          <button type="button" onClick={() => removeCoverageEntry(i)} className="text-sr-text-muted hover:text-red-400">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-4 rounded-xl border border-dashed border-sr-border-light bg-sr-surface space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-sr-silver mb-1.5">Sport</label>
                      <SearchableSelect value={draftSport} onChange={setDraftSport} placeholder="Select a sport..." searchPlaceholder="Search sports..." options={SPORT_OPTIONS} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-sr-silver mb-1.5">Age Groups</label>
                      <p className="text-xs text-sr-text-muted mb-1.5">16+ only, for safety reasons.</p>
                      <div className="flex flex-wrap gap-2">
                        {COACH_SCOUT_AGE_GROUPS.map(ag => (
                          <button key={ag} type="button" onClick={() => toggleDraftAgeGroup(ag)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              draftAgeGroups.includes(ag)
                                ? 'border-sr-purple bg-sr-purple/10 text-white'
                                : 'border-sr-border bg-sr-surface text-sr-text-muted hover:border-sr-purple/30'
                            }`}>
                            {ag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-sr-silver mb-1.5">Country</label>
                        <Select value={draftCountry} onChange={setDraftCountry} placeholder="Select country..."
                          options={COUNTRIES.map(c => ({ value: c, label: c }))} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-sr-silver mb-1.5">State/Region</label>
                        <Select value={draftState} onChange={setDraftState} placeholder={draftStatesForCountry ? 'Select state...' : 'N/A'} disabled={!draftStatesForCountry}
                          options={(draftStatesForCountry ?? []).map(s => ({ value: s, label: s }))} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-sr-silver mb-1.5">Where do you coach/scout?</label>
                      <input type="text" value={draftLocationDetail} onChange={e => setDraftLocationDetail(e.target.value)}
                        className="input-dark" placeholder="e.g. Brisbane Northside, Logan PCYC" />
                    </div>
                    <Button type="button" variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addCoverageEntry}>
                      Add Coverage
                    </Button>
                  </div>
                  <p className="text-xs text-sr-text-muted">
                    At least one coverage area is required to continue — athletes need this to find you.
                    Your claimed club/organisation will be confirmed during verification later; you don't need that yet.
                  </p>
                </div>
              ) : (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Sport Details</h2>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Positions</label>
                  <input
                    type="text"
                    value={positions}
                    onChange={e => setPositions(e.target.value)}
                    className="input-dark"
                    placeholder="e.g. Attacking Midfielder, Winger"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-sr-silver mb-1.5">Height (cm)</label>
                    <input type="number" value={height} onChange={e => setHeight(e.target.value)} className="input-dark" placeholder="178" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sr-silver mb-1.5">Weight (kg)</label>
                    <input type="number" value={weight} onChange={e => setWeight(e.target.value)} className="input-dark" placeholder="68" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Dominant Hand / Foot</label>
                  <Select value={dominantFoot} onChange={setDominantFoot} placeholder="Select..." options={[
                    { value: 'right', label: 'Right' },
                    { value: 'left', label: 'Left' },
                    { value: 'both', label: 'Both / Ambidextrous' },
                  ]} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Competition Level</label>
                  <Select value={competitionLevel} onChange={setCompetitionLevel} placeholder="Select level..." options={[
                    { value: 'grassroots', label: 'Grassroots / Local' },
                    { value: 'club', label: 'Club / Regional' },
                    { value: 'academy', label: 'Academy / Development' },
                    { value: 'state', label: 'State / Representative' },
                    { value: 'national', label: 'National' },
                    { value: 'elite', label: 'Elite / Professional' },
                  ]} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sr-silver mb-1.5">Current Club / Team / School</label>
                  <input type="text" value={club} onChange={e => setClub(e.target.value)} className="input-dark" placeholder="e.g. Sydney United Academy" />
                </div>
              </div>
              )
            )}

            {currentStep === 3 && (
              isCoachOrScout ? (
                <div className="space-y-4 text-center py-8">
                  <Trophy className="h-10 w-10 mx-auto text-sr-text-muted opacity-40" />
                  <h2 className="text-lg font-semibold text-white">Achievements aren't part of coach/scout accounts</h2>
                  <p className="text-sm text-sr-text-muted max-w-sm mx-auto">
                    Achievements feed ScoutRank's athlete ranking system, so they're only for athlete accounts.
                    You're all set — hit Next to continue.
                  </p>
                </div>
              ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Achievements & Awards</h2>
                  <Button type="button" variant="outline" size="sm" onClick={addAchievement} icon={<Plus className="h-3 w-3" />}>Add</Button>
                </div>
                {achievements.map((a, i) => (
                  <div key={i} className="p-4 rounded-xl bg-sr-surface border border-sr-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-sr-text-muted">Achievement {i + 1}</span>
                      {achievements.length > 1 && (
                        <button type="button" onClick={() => removeAchievement(i)} className="text-red-400 hover:text-red-300">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={a.title}
                      onChange={e => updateAchievement(i, 'title', e.target.value)}
                      className="input-dark"
                      placeholder="Achievement title"
                    />
                    <input
                      type="text"
                      value={a.description}
                      onChange={e => updateAchievement(i, 'description', e.target.value)}
                      className="input-dark"
                      placeholder="Description"
                    />
                    <Select value={a.type} onChange={(v) => updateAchievement(i, 'type', v)} options={[
                      { value: 'award', label: 'Award' },
                      { value: 'record', label: 'Record' },
                      { value: 'milestone', label: 'Milestone' },
                      { value: 'selection', label: 'Selection' },
                      { value: 'medal', label: 'Medal' },
                      { value: 'personal_best', label: 'Personal Best' },
                    ]} />
                  </div>
                ))}
              </div>
              )
            )}

            {currentStep === 4 && (
              needsCoachVerification ? (
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold text-white">Verify Your Account</h2>
                  <p className="text-sm text-sr-text-muted leading-relaxed">
                    Verification lets athletes and families trust that you are a real, qualified coach or scout.
                    Verified accounts receive a badge, full discoverability, and are visible to users of all ages.
                    Unverified accounts are only discoverable by adults (18+).
                  </p>
                  <div className="grid gap-3">
                    <div className="p-5 rounded-2xl border border-sr-purple/40 bg-sr-purple/5">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center flex-shrink-0">
                          <Shield className="h-4 w-4 text-white" />
                        </div>
                        <p className="text-sm font-semibold text-white flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-400 inline-block"></span>Verify Now</p>
                      </div>
                      <p className="text-xs text-sr-text-muted ml-11">
                        Submit your credentials after completing setup. Recommended — takes around 5 minutes.
                        Your application will be reviewed by the ScoutRank team.
                      </p>
                      <p className="text-xs text-sr-text-muted ml-11 mt-2 italic">
                        Clicking "Complete Profile" will take you to the verification form.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl border border-sr-border bg-sr-surface">
                      <p className="text-sm font-medium text-white mb-1 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sr-border inline-block"></span>Verify Later</p>
                      <p className="text-xs text-sr-text-muted">
                        Your account and coverage areas are saved. You can submit verification at any time from your profile.
                        Until verified, you won't appear in searches by users under 18.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Almost Done!</h2>
                <div className="p-4 rounded-xl bg-sr-surface border border-sr-border space-y-3">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-sr-purple mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-white">Profile Privacy</p>
                      <p className="text-xs text-sr-text-muted mt-1">Your profile will be public so coaches and scouts can discover you. You can change this later in settings.</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-sr-surface border border-sr-border">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded accent-sr-purple" defaultChecked />
                    <span className="text-sm text-sr-silver">I understand my profile helps me get discovered by coaches and scouts</span>
                  </label>
                </div>
              </div>
              )
            )}

            {finishError && (
              <div className="mt-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />{finishError}
              </div>
            )}

            <div className="flex items-center justify-between mt-8 pt-4 border-t border-sr-border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0 || isFinishing}
                icon={<ArrowLeft className="h-4 w-4" />}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="brand"
                size="lg"
                disabled={isFinishing}
                icon={isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : currentStep < onboardingSteps.length - 1 ? <ArrowRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              >
                {isFinishing ? 'Saving...' : currentStep < onboardingSteps.length - 1 ? 'Next' : 'Complete Profile'}
              </Button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-sr-text-muted mt-4">
          You can always edit these details later from your profile settings.
        </p>
      </div>
    </div>
  );
}
