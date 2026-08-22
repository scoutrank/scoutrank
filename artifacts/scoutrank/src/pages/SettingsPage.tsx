import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/BrandButton';
import { Select } from '@/components/ui/Select';
import { SPORT_OPTIONS } from '@/lib/sports';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase';
import { exportMyData } from '@/lib/dataExport';
import { Settings, User, Shield, Bell, Lock, Palette, LogOut, Check, AlertCircle, Loader2, Camera, Image, Watch, RefreshCw, Unlink } from 'lucide-react';
import { LocationPicker } from '@/components/LocationPicker';

type SettingTab = 'profile' | 'privacy' | 'notifications' | 'appearance' | 'security' | 'wearables';

const ALL_SETTING_TABS: { id: SettingTab; label: string; icon: typeof Settings; hideForParent?: boolean }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'privacy', label: 'Privacy', icon: Shield, hideForParent: true },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'wearables', label: 'Wearables', icon: Watch, hideForParent: true },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: Lock },
];

export default function SettingsPage() {
  const { profile, user, logout, logoutAllDevices, refreshProfile } = useAuth();
  const isParent = profile?.role === 'parent';
  const settingTabs = ALL_SETTING_TABS.filter(t => !(isParent && t.hideForParent));
  const [activeTab, setActiveTab] = useState<SettingTab>('profile');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <aside className="w-48 flex-shrink-0 hidden md:block">
          <div className="space-y-1">
            {settingTabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-sr-purple/10 text-sr-purple-light'
                    : 'text-sr-text-muted hover:text-white hover:bg-sr-surface-light'
                }`}>
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
            {/* Club-owner accounts are 'coach'-role under the hood, but
                their club was already vetted on approval — personal
                coach/scout verification doesn't apply to them. */}
            {(profile?.role === 'coach' || profile?.role === 'scout') && !profile?.owned_organisation_id && (
              <Link to="/verification-status"
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-sr-text-muted hover:text-white hover:bg-sr-surface-light transition-all">
                <Shield className="h-4 w-4" />
                Verification
              </Link>
            )}
          </div>
        </aside>

        {/* Mobile tab row */}
        <div className="md:hidden flex gap-1 mb-4 overflow-x-auto">
          {settingTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id ? 'bg-sr-purple text-white' : 'text-sr-text-muted bg-sr-surface border border-sr-border'
              }`}>
              <tab.icon className="h-3.5 w-3.5" />{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="card-premium p-6">
            {activeTab === 'profile' && (
              <ProfileTab profile={profile} refreshProfile={refreshProfile} />
            )}
            {activeTab === 'privacy' && !isParent && <PrivacyTab profile={profile} refreshProfile={refreshProfile} />}
            {activeTab === 'privacy' && isParent && <ProfileTab profile={profile} refreshProfile={refreshProfile} />}
            {activeTab === 'notifications' && <NotificationsTab profile={profile} refreshProfile={refreshProfile} />}
            {activeTab === 'appearance' && <AppearanceTab profile={profile} refreshProfile={refreshProfile} />}
            {activeTab === 'security' && <SecurityTab logout={logout} logoutAllDevices={logoutAllDevices} userEmail={user?.email ?? null} profileId={profile?.id ?? null} />}
            {activeTab === 'wearables' && <WearablesTab profileId={profile?.id ?? null} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ profile, refreshProfile }: { profile: any; refreshProfile: () => Promise<void> }) {
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [sport, setSport] = useState(profile?.sport ?? '');
  const [ageGroup, setAgeGroup] = useState(profile?.age_group ?? '');
  const [state, setState] = useState(profile?.state ?? '');
  const [childrenVisibility, setChildrenVisibility] = useState<'public' | 'followers_only' | 'private'>(profile?.children_visibility ?? 'private');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile?.banner_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const isParent = profile?.role === 'parent';
  const isAthlete = profile?.role === 'athlete';
  const [recruitmentOpen, setRecruitmentOpen] = useState(profile?.recruitment_open ?? false);
  const [recruitmentSeeking, setRecruitmentSeeking] = useState<string[]>(profile?.recruitment_seeking ?? []);
  const [academicInfo, setAcademicInfo] = useState(profile?.academic_info ?? '');
  const [injuryHistory, setInjuryHistory] = useState(profile?.injury_history ?? '');
  const [dnaSelfReported, setDnaSelfReported] = useState<Record<string, number>>(profile?.dna_self_reported ?? {});

  const uploadPhoto = async (
    file: File,
    type: 'avatar' | 'banner',
    setUploading: (v: boolean) => void,
    setUrl: (url: string) => void,
  ) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    setUploading(true);
    setError('');
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.id}/${type}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('post-media').upload(path, file, { upsert: true });
    if (uploadErr) { setError(`Upload failed: ${uploadErr.message}`); setUploading(false); return; }
    const { data } = supabase.storage.from('post-media').getPublicUrl(path);
    const url = data.publicUrl;
    const col = type === 'avatar' ? 'avatar_url' : 'banner_url';
    const { error: updateErr } = await supabase.from('profiles').update({ [col]: url }).eq('id', profile.id);
    if (updateErr) { setError(`Save failed: ${updateErr.message}`); setUploading(false); return; }
    setUrl(url);
    await refreshProfile();
    setUploading(false);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError('');
    const updates: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      city,
      state,
      updated_at: new Date().toISOString(),
    };
    if (!isParent) updates.bio = bio;
    if (isParent) updates.children_visibility = childrenVisibility;
    if (isAthlete) {
      updates.sport = sport;
      updates.age_group = ageGroup;
      updates.recruitment_open = recruitmentOpen;
      updates.recruitment_seeking = recruitmentOpen ? recruitmentSeeking : [];
      updates.academic_info = academicInfo.trim() || null;
      updates.injury_history = injuryHistory.trim() || null;
      updates.dna_self_reported = Object.keys(dnaSelfReported).length > 0 ? dnaSelfReported : null;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">Profile Settings</h2>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
          <Check className="h-4 w-4 flex-shrink-0" />Profile updated successfully!
        </div>
      )}

      {/* Photo uploads */}
      <div className="card-premium p-4 space-y-4">
        <p className="text-sm font-semibold text-white">Photos</p>
        {/* Banner */}
        <div>
          <p className="text-xs text-sr-text-muted mb-2">Banner photo</p>
          <div className="relative h-24 rounded-xl overflow-hidden bg-gradient-to-r from-sr-surface-light to-sr-border">
            {bannerUrl && <img src={bannerUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />}
            <button onClick={() => bannerRef.current?.click()} disabled={uploadingBanner}
              className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 transition-colors">
              {uploadingBanner
                ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                : <><Image className="h-5 w-5 text-white mr-1.5" /><span className="text-white text-sm">Change banner</span></>}
            </button>
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'banner', setUploadingBanner, setBannerUrl); }} />
        </div>
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 flex-shrink-0">
            <div className="h-16 w-16 rounded-xl overflow-hidden bg-gradient-to-br from-sr-purple to-sr-blue">
              {avatarUrl
                ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                : <div className="h-full w-full flex items-center justify-center text-lg font-bold text-white">
                    {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                  </div>}
            </div>
            <button onClick={() => avatarRef.current?.click()} disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-sr-purple flex items-center justify-center shadow-lg hover:bg-sr-purple-light transition-colors">
              {uploadingAvatar ? <Loader2 className="h-3 w-3 text-white animate-spin" /> : <Camera className="h-3 w-3 text-white" />}
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Profile photo</p>
            <button onClick={() => avatarRef.current?.click()} disabled={uploadingAvatar}
              className="text-xs text-sr-purple-light hover:text-white transition-colors mt-0.5">
              {uploadingAvatar ? 'Uploading...' : 'Change photo'}
            </button>
          </div>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, 'avatar', setUploadingAvatar, setAvatarUrl); }} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">First Name</label>
          <input className="input-dark" value={firstName} onChange={e => setFirstName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Last Name</label>
          <input className="input-dark" value={lastName} onChange={e => setLastName(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-sr-silver mb-1.5">Username</label>
        <input className="input-dark opacity-60 cursor-not-allowed" value={profile?.username ?? ''} readOnly
          title="Username cannot be changed" />
        <p className="text-xs text-sr-text-muted mt-1">Username cannot be changed.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-sr-silver mb-1.5">Location</label>
        <LocationPicker city={city} state={state} onChange={(c, s) => { setCity(c); setState(s); }} />
      </div>
      {isAthlete && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Sport</label>
            <Select value={sport} onChange={setSport} placeholder="Select your sport"
              options={SPORT_OPTIONS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Age Group</label>
            <Select value={ageGroup} onChange={setAgeGroup} placeholder="Select your age group"
              options={['U12','U13','U14','U15','U16','U17','U18','Open'].map(g => ({ value: g, label: g }))} />
          </div>
        </div>
      )}
      {/* Bio — athletes/coaches/scouts only */}
      {!isParent && (
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Bio</label>
          <textarea className="input-dark h-24 resize-none" placeholder="Tell your sporting story..."
            value={bio} onChange={e => setBio(e.target.value)} />
          <p className="text-xs text-sr-text-muted mt-1">{bio.length} / 300 characters</p>
        </div>
      )}
      {/* Recruitment Mode — athletes only */}
      {isAthlete && (
        <div className="card-premium p-4">
          <label className="flex items-center justify-between cursor-pointer mb-1">
            <div>
              <span className="text-sm font-medium text-sr-silver">Recruitment Mode</span>
              <p className="text-xs text-sr-text-muted mt-0.5">Show coaches and scouts you're actively open to being recruited.</p>
            </div>
            <input type="checkbox" checked={recruitmentOpen} onChange={e => setRecruitmentOpen(e.target.checked)} className="h-5 w-5 flex-shrink-0" />
          </label>
          {recruitmentOpen && (
            <div className="mt-3 pt-3 border-t border-sr-border">
              <p className="text-xs text-sr-text-muted mb-2">What are you looking for? (select any)</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['scholarships', 'Scholarships'],
                  ['clubs', 'Clubs'],
                  ['academies', 'Academies'],
                  ['recruiters', 'Open to recruiters'],
                ].map(([value, label]) => (
                  <button key={value} type="button"
                    onClick={() => setRecruitmentSeeking(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      recruitmentSeeking.includes(value) ? 'border-sr-purple bg-sr-purple/10 text-white' : 'border-sr-border text-sr-text-muted hover:border-sr-purple/30'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Performance Passport extras — both optional, athlete-controlled */}
      {isAthlete && (
        <>
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Academic Information <span className="text-sr-text-muted font-normal">(optional)</span></label>
            <p className="text-xs text-sr-text-muted mb-2">Shown on your Performance Passport if filled in — GPA, school, academic honors, whatever's relevant.</p>
            <textarea className="input-dark h-20 resize-none" placeholder="e.g. 3.8 GPA, Honor Roll, Lincoln High School"
              value={academicInfo} onChange={e => setAcademicInfo(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-sr-silver mb-1.5">Injury History <span className="text-sr-text-muted font-normal">(optional)</span></label>
            <p className="text-xs text-sr-text-muted mb-2">Only shown on your Performance Passport if you fill this in — visible to anyone who can see your profile, so only include what you're comfortable sharing publicly.</p>
            <textarea className="input-dark h-20 resize-none" placeholder="e.g. ACL recovery 2025, fully cleared"
              value={injuryHistory} onChange={e => setInjuryHistory(e.target.value)} />
          </div>
        </>
      )}
      {/* Athlete DNA self-assessment — only used as a fallback where no
          verified stat data exists to derive a real score from; those
          attributes are always shown as derived instead when available. */}
      {isAthlete && (
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Athlete DNA — Self Assessment</label>
          <p className="text-xs text-sr-text-muted mb-3">
            Rate yourself 0–100 on each. Wherever you have verified stats for a matching event (like a sprint time or vertical jump), that's used instead automatically — this only fills the gaps.
          </p>
          <div className="space-y-3">
            {[
              ['speed', 'Speed'], ['agility', 'Agility'], ['strength', 'Strength'],
              ['endurance', 'Endurance'], ['power', 'Power'], ['coordination', 'Coordination'],
            ].map(([key, label]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-sr-silver">{label}</span>
                  <span className="text-xs text-sr-text-muted">{dnaSelfReported[key] ?? '—'}</span>
                </div>
                <input type="range" min={0} max={100} value={dnaSelfReported[key] ?? 50}
                  onChange={e => setDnaSelfReported(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="w-full accent-sr-purple" />
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Children visibility — parents only */}
      {isParent && (
        <div>
          <label className="block text-sm font-medium text-sr-silver mb-1.5">Children Visibility</label>
          <p className="text-xs text-sr-text-muted mb-2">Controls who can see your linked athletes on your profile.</p>
          <Select value={childrenVisibility} onChange={v => setChildrenVisibility(v as typeof childrenVisibility)} options={[
            { value: 'public', label: 'Public — anyone can see' },
            { value: 'followers_only', label: 'Followers only' },
            { value: 'private', label: 'Private — only me' },
          ]} />
        </div>
      )}
      <Button variant="brand" onClick={handleSave} disabled={saving}
        icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}

function PrivacyTab({ profile, refreshProfile }: { profile: Profile | null | undefined; refreshProfile: () => Promise<void> }) {
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);
  const [showRankings, setShowRankings] = useState(profile?.show_rankings ?? true);
  const [showStats, setShowStats] = useState(profile?.show_stats ?? true);
  const [messagePermission, setMessagePermission] = useState<'everyone' | 'followers' | 'no_one'>(profile?.message_permission ?? 'everyone');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_public: isPublic, show_rankings: showRankings, show_stats: showStats, message_permission: messagePermission })
      .eq('id', profile.id);
    setSaving(false);
    if (updateError) {
      console.error('[privacy save] FULL error object:', JSON.stringify(updateError, null, 2));
      setError(updateError.message);
      return;
    }
    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">Privacy Settings</h2>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}
      {saved && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
          <Check className="h-4 w-4" />Privacy settings saved.
        </div>
      )}

      {[
        { label: 'Public Profile', desc: 'Allow coaches and scouts to discover your profile in Discover', value: isPublic, set: setIsPublic },
        { label: 'Show Rankings', desc: 'Display your rankings on your profile to other visitors', value: showRankings, set: setShowRankings },
        { label: 'Show Stats', desc: 'Make your stats tab visible to other visitors', value: showStats, set: setShowStats },
      ].map(s => (
        <div key={s.label} className="flex items-center justify-between p-3 rounded-xl bg-sr-surface border border-sr-border">
          <div>
            <p className="text-sm font-medium text-white">{s.label}</p>
            <p className="text-xs text-sr-text-muted">{s.desc}</p>
          </div>
          <button onClick={() => s.set(!s.value)}
            className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors flex-shrink-0 ${s.value ? 'bg-sr-purple' : 'bg-sr-border'}`}>
            <span className={`absolute h-4 w-4 bg-white rounded-full transition-transform ${s.value ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
      ))}

      <div className="p-3 rounded-xl bg-sr-surface border border-sr-border">
        <p className="text-sm font-medium text-white mb-1">Who Can Message Me</p>
        <p className="text-xs text-sr-text-muted mb-2">Applies to new conversations only — people already messaging you can continue.</p>
        <Select value={messagePermission} onChange={(v) => setMessagePermission(v as typeof messagePermission)} options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'followers', label: 'Only people who follow me' },
          { value: 'no_one', label: 'No one' },
        ]} />
      </div>

      <Button variant="brand" size="sm" onClick={handleSave} disabled={saving}
        icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
        {saving ? 'Saving...' : 'Save Privacy Settings'}
      </Button>
    </div>
  );
}

function NotificationsTab({ profile, refreshProfile }: { profile: Profile | null | undefined; refreshProfile: () => Promise<void> }) {
  const isParent = profile?.role === 'parent';
  const [prefs, setPrefs] = useState({
    notify_reactions: profile?.notify_reactions ?? true,
    notify_comments: profile?.notify_comments ?? true,
    notify_replies: profile?.notify_replies ?? true,
    notify_follows: profile?.notify_follows ?? true,
    notify_messages: profile?.notify_messages ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Parent notifications reuse existing DB columns with guardian semantics.
  // Social columns (reactions, follows etc.) are never shown to parents.
  const parentLabels: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: 'notify_messages', label: 'Messages from linked child', desc: 'When your linked child sends you a message' },
    { key: 'notify_reactions', label: 'Safety & verification alerts', desc: 'Platform safety notices and account alerts' },
    { key: 'notify_follows', label: 'Child verification updates', desc: "When your linked athlete's verification status changes" },
    { key: 'notify_comments', label: 'Link approved / rejected', desc: 'When an athlete accepts or declines your link request' },
  ];

  const socialLabels: { key: keyof typeof prefs; label: string }[] = [
    { key: 'notify_reactions', label: 'Reactions on my posts' },
    { key: 'notify_comments', label: 'Comments on my posts' },
    { key: 'notify_replies', label: 'Replies to my comments' },
    { key: 'notify_follows', label: 'New followers' },
    { key: 'notify_messages', label: 'Direct messages' },
  ];

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.from('profiles').update(prefs).eq('id', profile.id);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const labels = isParent ? parentLabels : socialLabels;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">Notification Preferences</h2>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}
      {saved && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
          <Check className="h-4 w-4" />Notification preferences saved.
        </div>
      )}

      {/* Always-on for parents: link requests */}
      {isParent && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-sr-surface border border-sr-border opacity-60">
          <div>
            <p className="text-sm font-medium text-white">Parent link requests received</p>
            <p className="text-xs text-sr-text-muted">When an athlete sends you a request — always on</p>
          </div>
          <div className="relative inline-flex items-center w-10 h-6 rounded-full bg-sr-purple flex-shrink-0">
            <span className="absolute h-4 w-4 bg-white rounded-full translate-x-5" />
          </div>
        </div>
      )}

      {labels.map(item => (
        <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-sr-surface border border-sr-border">
          <div>
            <p className="text-sm font-medium text-white">{item.label}</p>
            {'desc' in item && <p className="text-xs text-sr-text-muted">{(item as typeof parentLabels[0]).desc}</p>}
          </div>
          <button onClick={() => setPrefs(p => ({ ...p, [item.key]: !p[item.key] }))}
            className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors flex-shrink-0 ${prefs[item.key] ? 'bg-sr-purple' : 'bg-sr-border'}`}>
            <span className={`absolute h-4 w-4 bg-white rounded-full transition-transform ${prefs[item.key] ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
      ))}

      <Button variant="brand" size="sm" onClick={handleSave} disabled={saving}
        icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>
    </div>
  );
}

// Modular by design — each entry is self-contained, so adding Light
// Mode later means adding one more entry here plus its own override
// block in index.css, not restructuring this component.
const THEME_OPTIONS: { id: 'dark' | 'ultra_dark'; label: string }[] = [
  { id: 'dark', label: 'Dark (Default)' },
  { id: 'ultra_dark', label: 'Ultra Dark' },
];

function AppearanceTab({ profile, refreshProfile }: { profile: Profile | null | undefined; refreshProfile: () => Promise<void> }) {
  const [theme, setTheme] = useState<'dark' | 'ultra_dark'>(profile?.theme_preference ?? 'dark');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = async (id: 'dark' | 'ultra_dark') => {
    if (!profile || saving) return;
    setTheme(id); // applied instantly via App.tsx's effect on profile.theme_preference once saved
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.from('profiles').update({ theme_preference: id }).eq('id', profile.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      setTheme(profile.theme_preference); // revert the visible selection on failure
      return;
    }
    await refreshProfile();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">Appearance</h2>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {THEME_OPTIONS.map(t => (
          <button key={t.id} onClick={() => handleSelect(t.id)} disabled={saving}
            className={`p-4 rounded-xl border text-sm transition-all disabled:opacity-60 ${
              theme === t.id
                ? 'border-sr-purple bg-sr-purple/10 text-white'
                : 'border-sr-border bg-sr-surface text-sr-text-muted hover:border-sr-purple/30'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-sr-text-muted">Applies immediately and is saved to your account — it'll follow you to any device you log in on.</p>
    </div>
  );
}

/**
 * Fitbit only for now — Garmin needs manual approval from Garmin's own
 * developer program, which hasn't been applied for yet. Apple Watch
 * isn't reachable from a web app at all; HealthKit only works from a
 * native iOS app on-device, so that would be a genuinely separate
 * project, not an integration into this one.
 */
function WearablesTab({ profileId }: { profileId: string | null }) {
  const [connection, setConnection] = useState<{ connected_at: string; last_synced_at: string | null } | null>(null);
  const [latestData, setLatestData] = useState<{ steps: number | null; resting_heart_rate: number | null; active_minutes: number | null; data_date: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadConnection = () => {
    if (!profileId) return;
    supabase.from('wearable_connections').select('connected_at, last_synced_at').eq('profile_id', profileId).eq('provider', 'fitbit').maybeSingle()
      .then(({ data }) => {
        setConnection(data as typeof connection);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadConnection();
    const params = new URLSearchParams(window.location.search);
    const result = params.get('fitbit');
    if (result === 'connected') setBanner({ type: 'success', text: 'Fitbit connected.' });
    else if (result === 'error') setBanner({ type: 'error', text: params.get('reason') ?? 'Something went wrong connecting Fitbit.' });
    if (result) window.history.replaceState({}, '', '/settings');
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !connection) return;
    supabase.from('wearable_activity_data').select('steps, resting_heart_rate, active_minutes, data_date').eq('profile_id', profileId).eq('provider', 'fitbit')
      .order('data_date', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLatestData(data as typeof latestData));
  }, [profileId, connection]);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('fitbit-oauth-start');
    setConnecting(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Failed to start connection.'); return; }
    if (data?.authUrl) window.location.href = data.authUrl;
  };

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    const { data, error: err } = await supabase.functions.invoke('fitbit-sync');
    setSyncing(false);
    if (err || data?.error) { setError(data?.error ?? err?.message ?? 'Sync failed.'); return; }
    loadConnection();
    setBanner({ type: 'success', text: `Synced — ${data.steps ?? 0} steps today.` });
  };

  const handleDisconnect = async () => {
    if (!profileId) return;
    setDisconnecting(true);
    setError('');
    const { error: err } = await supabase.from('wearable_connections').delete().eq('profile_id', profileId).eq('provider', 'fitbit');
    setDisconnecting(false);
    if (err) { setError(err.message); return; }
    setConnection(null);
    setLatestData(null);
  };

  if (isLoading) return <p className="text-sm text-sr-text-muted">Loading...</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-1">Wearables</h2>
      <p className="text-sm text-sr-text-muted mb-4">Connect a wearable to bring in real activity data automatically.</p>

      {banner && (
        <div className={`mb-4 p-3 rounded-lg border text-sm ${banner.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {banner.text}
        </div>
      )}
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <div className="card-premium p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-sr-surface-light flex items-center justify-center flex-shrink-0">
            <Watch className="h-5 w-5 text-sr-purple-light" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Fitbit</p>
            <p className="text-xs text-sr-text-muted">
              {connection ? `Connected ${new Date(connection.connected_at).toLocaleDateString()}` : 'Not connected'}
            </p>
          </div>
        </div>

        {connection ? (
          <>
            {latestData && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 rounded-lg bg-sr-surface">
                  <p className="text-sm font-bold text-white">{latestData.steps ?? '—'}</p>
                  <p className="text-[10px] text-sr-text-muted">Steps</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-sr-surface">
                  <p className="text-sm font-bold text-white">{latestData.resting_heart_rate ?? '—'}</p>
                  <p className="text-[10px] text-sr-text-muted">Resting HR</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-sr-surface">
                  <p className="text-sm font-bold text-white">{latestData.active_minutes ?? '—'}</p>
                  <p className="text-[10px] text-sr-text-muted">Active min</p>
                </div>
              </div>
            )}
            <p className="text-[11px] text-sr-text-muted mb-3">
              {connection.last_synced_at ? `Last synced ${new Date(connection.last_synced_at).toLocaleString()}` : 'Never synced yet'}
            </p>
            <div className="flex gap-2">
              <button onClick={handleSync} disabled={syncing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync Now
              </button>
              <button onClick={handleDisconnect} disabled={disconnecting}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sr-border text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Disconnect
              </button>
            </div>
          </>
        ) : (
          <button onClick={handleConnect} disabled={connecting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sr-purple text-white hover:bg-sr-purple/90 disabled:opacity-50">
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Connect Fitbit
          </button>
        )}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-sr-surface border border-sr-border text-xs text-sr-text-muted">
        Garmin and Apple Watch aren't available yet — Garmin requires a separate developer approval, and Apple Watch needs a native iOS app rather than a web integration.
      </div>
    </div>
  );
}

function SecurityTab({ logout, logoutAllDevices, userEmail, profileId }: { logout: () => Promise<void>; logoutAllDevices: () => Promise<void>; userEmail: string | null; profileId: string | null }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [deletionModalOpen, setDeletionModalOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionConfirmText, setDeletionConfirmText] = useState('');
  const [deletionSubmitting, setDeletionSubmitting] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [deletionError, setDeletionError] = useState('');

  const handleExportData = async () => {
    if (!profileId) return;
    setIsExporting(true);
    try {
      await exportMyData(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export your data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!profileId) return;
    if (deletionConfirmText !== 'DELETE') { setDeletionError('Type DELETE exactly to confirm.'); return; }
    setDeletionSubmitting(true);
    setDeletionError('');
    const { error: reqErr } = await supabase.from('account_deletion_requests').insert({
      profile_id: profileId,
      reason: deletionReason.trim() || null,
      status: 'pending',
    });
    setDeletionSubmitting(false);
    if (reqErr) { setDeletionError(reqErr.message); return; }
    setDeletionRequested(true);
  };

  const handleUpdatePassword = async () => {
    setError('');
    setSuccess('');
    if (!currentPassword || !newPassword || !confirmPassword) { setError('Please fill in all fields.'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!userEmail) { setError('Could not verify your account. Please log out and back in, then try again.'); return; }

    setUpdating(true);

    // Real re-authentication: confirm the current password is actually
    // correct before allowing a change, instead of trusting that an
    // active session alone is enough (which is all the old version did
    // — the "Current Password" field was collected but never checked).
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email: userEmail, password: currentPassword });
    if (reauthError) {
      setError('Current password is incorrect.');
      setUpdating(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setUpdating(false);
      return;
    }
    setSuccess('Password updated successfully!');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setUpdating(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">Security</h2>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
          <Check className="h-4 w-4" />{success}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-sr-silver mb-1.5">Change Password</label>
        <input type="password" className="input-dark mb-2" placeholder="Current password"
          value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        <input type="password" className="input-dark mb-2" placeholder="New password"
          value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        <input type="password" className="input-dark" placeholder="Confirm new password"
          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
      </div>
      <Button variant="brand" onClick={handleUpdatePassword} disabled={updating}
        icon={updating ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
        {updating ? 'Updating...' : 'Update Password'}
      </Button>
      <hr className="border-sr-border my-4" />

      <div>
        <label className="block text-sm font-medium text-sr-silver mb-1.5">Your Data</label>
        <p className="text-xs text-sr-text-muted mb-3">Download everything associated with your account, or request permanent deletion.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleExportData} disabled={isExporting || !profileId}
            icon={isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {isExporting ? 'Preparing...' : 'Download My Data'}
          </Button>
          <Button variant="danger" onClick={() => { setDeletionModalOpen(true); setDeletionRequested(false); setDeletionReason(''); setDeletionConfirmText(''); setDeletionError(''); }}>
            Request Account Deletion
          </Button>
        </div>
      </div>

      <hr className="border-sr-border my-4" />
      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={logout}>
          Sign Out
        </Button>
        <Button variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={() => { if (confirm('This signs you out everywhere ScoutRank is currently open, not just this device. Continue?')) logoutAllDevices(); }}>
          Log Out of All Devices
        </Button>
      </div>

      {deletionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeletionModalOpen(false)}>
          <div className="w-full max-w-sm card-premium p-5" onClick={e => e.stopPropagation()}>
            {deletionRequested ? (
              <>
                <h3 className="text-sm font-semibold text-white mb-2">Request submitted</h3>
                <p className="text-xs text-sr-text-muted mb-4">Our team will review this and complete the deletion. Your account stays active until then.</p>
                <Button variant="brand" onClick={() => setDeletionModalOpen(false)}>Done</Button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-white mb-1">Request Account Deletion</h3>
                <p className="text-xs text-sr-text-muted mb-4">This permanently removes your account and everything tied to it — posts, stats, messages, all of it. This can't be undone once completed.</p>
                {deletionError && (
                  <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{deletionError}</div>
                )}
                <label className="block text-xs text-sr-text-muted mb-1">Reason (optional)</label>
                <textarea value={deletionReason} onChange={e => setDeletionReason(e.target.value)} rows={2}
                  className="input-dark w-full resize-none text-sm mb-3" placeholder="Why are you leaving? (optional)" />
                <label className="block text-xs text-sr-text-muted mb-1">Type DELETE to confirm</label>
                <input value={deletionConfirmText} onChange={e => setDeletionConfirmText(e.target.value)}
                  className="input-dark w-full text-sm mb-3" placeholder="DELETE" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDeletionModalOpen(false)} className="text-xs px-3 py-1.5 rounded-lg border border-sr-border text-sr-text-muted hover:border-sr-purple/30">
                    Cancel
                  </button>
                  <button onClick={handleRequestDeletion} disabled={deletionSubmitting}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                    {deletionSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Submit Request
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
