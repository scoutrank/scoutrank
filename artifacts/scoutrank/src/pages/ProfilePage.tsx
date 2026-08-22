// /profile/:username — public profile dispatcher.
// Loads the profile, then renders the correct component for the role.
// Keeps routing simple (one URL pattern for all account types) while
// letting each role have its own purpose-built UI.
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase';
import AthleteProfilePage from './AthleteProfilePage';
import ParentProfilePage from './ParentProfilePage';

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<Profile | null | 'loading'>('loading');

  useEffect(() => {
    if (!username) { setProfile(null); return; }
    supabase
      .from('profiles')
      .select('role')
      .eq('username', username)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setProfile(null); return; }
        setProfile(data as Profile);
      });
  }, [username]);

  if (profile === 'loading') return null; // let each page handle its own loading spinner

  // Parent profiles get their own dedicated page.
  if (profile?.role === 'parent') return <ParentProfilePage />;

  // Everyone else (athlete, coach, scout, unknown) uses AthleteProfilePage.
  return <AthleteProfilePage />;
}
