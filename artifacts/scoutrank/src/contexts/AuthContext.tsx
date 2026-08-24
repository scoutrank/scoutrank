import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Session, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase';

// ── Types ──
type Role = 'athlete' | 'coach' | 'scout' | 'parent' | 'admin' | 'super_admin' | null;

interface AuthState {
  user: SupabaseAuthUser | null;
  profile: Profile | null;
  role: Role;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Set when a login/session-restore was blocked because the account is
  // suspended or banned — the login page displays this. Cleared on the
  // next successful login attempt.
}

interface AuthContextType extends AuthState {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export interface SignupData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  dateOfBirth: string;
  country: string;
  state: string;
  city: string;
  primarySport: string;
  secondarySports: string[];
  currentClub: string;
  role: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

const EMPTY_STATE: AuthState = {
  user: null,
  profile: null,
  role: null,
  isLoading: true,
  isAuthenticated: false,
};

// Loads the profile row for a given auth user id. Role lives directly on
// `profiles.role` — confirmed via information_schema; there is no
// separate `users` table (an earlier version of this function assumed
// there was one and queried it, which fails with "Could not find the
// table 'public.users'" since it genuinely doesn't exist).
async function loadProfileAndRole(userId: string): Promise<{ profile: Profile | null; role: Role }> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (error) {
    console.error('Failed to load profile:', error.message);
  }

  // See the matching comment in LoginPage.tsx — .maybeSingle() has been
  // observed returning a one-item array instead of a bare object in
  // production for at least one identical query elsewhere in this app.
  // This app's dashboard rendering the signed-in user's name/role correctly
  // suggests this particular call gets the object shape most of the time,
  // but that's not a guarantee — handling both shapes here is cheap
  // insurance against the same failure mode showing up here too.
  const rawProfile = Array.isArray(data) ? data[0] : data;
  const profile = (rawProfile as Profile | null) ?? null;
  return {
    profile,
    role: (profile?.role as Role) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY_STATE);
  // When THIS tab's session was established — compared against
  // profiles.session_invalidated_at on every realtime update, so a
  // "log out of all devices" elsewhere gets picked up immediately
  // instead of waiting for this tab's access token to naturally expire
  // and fail its next refresh (which JWTs don't otherwise signal early).
  const sessionStartRef = useRef<string | null>(null);
  // Set for the duration of a deliberate logout — the profiles update
  // that logoutAllDevices makes fires this same tab's own realtime
  // listener almost immediately, which can race with signOut() itself
  // and re-apply a session object that was captured a moment before it
  // was actually invalidated. This flag makes applySession a no-op for
  // the whole logout, so nothing can undo it mid-flight.
  const loggingOutRef = useRef(false);

  const applySession = useCallback(async (session: Session | null) => {
    if (loggingOutRef.current) return;
    if (!session?.user) {
      setState({ ...EMPTY_STATE, isLoading: false });
      return;
    }
    const { profile, role } = await loadProfileAndRole(session.user.id);
    if (loggingOutRef.current) return;

    if (profile?.session_invalidated_at && sessionStartRef.current
        && new Date(profile.session_invalidated_at) > new Date(sessionStartRef.current)) {
      loggingOutRef.current = true;
      await supabase.auth.signOut();
      sessionStartRef.current = null;
      setState({ ...EMPTY_STATE, isLoading: false });
      loggingOutRef.current = false;
      return;
    }

    // A suspension that's passed its end date auto-lifts here, silently
    // — no admin action needed, and this deliberately does NOT get
    // logged as a "release" (that's reserved for an admin manually
    // lifting one early). The account just becomes usable again.
    if (profile?.account_status === 'suspended' && profile.suspended_until && new Date(profile.suspended_until) <= new Date()) {
      await supabase.from('profiles').update({
        account_status: 'active', status_reason: null, suspended_until: null,
        status_changed_by: null, status_changed_at: null, status_evidence_url: null,
      }).eq('id', profile.id);
      profile.account_status = 'active';
    }

    // Suspended/banned accounts stay authenticated (not signed out) — App
    // routing redirects every route to a dedicated /account-restricted
    // page for them instead, which shows the real reason, evidence, and
    // a way to dispute it. See App.tsx's top-level restriction check.

    if (!sessionStartRef.current) sessionStartRef.current = new Date().toISOString();

    setState({
      user: session.user,
      profile,
      role,
      isLoading: false,
      isAuthenticated: true,
        });
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) applySession(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  // Live account-status updates — if an admin suspends/bans this account
  // while it's already mid-session, this takes effect immediately rather
  // than waiting for the next login/reload. Re-runs applySession's own
  // logic (auto-expiry check, restriction routing via profile.account_status)
  // by just refetching the full profile whenever this row changes.
  useEffect(() => {
    if (!state.user?.id) return;
    const userId = state.user.id;
    const channel = supabase
      .channel(`own-profile-live-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) applySession(session);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async () => {
        await supabase.auth.signOut();
        setState({ ...EMPTY_STATE, isLoading: false });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [state.user?.id, applySession]);

  // ── Login ──
  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, isLoading: true }));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setState(s => ({ ...s, isLoading: false }));
      throw error;
    }
    // onAuthStateChange fires and populates user/profile/role.
  }, []);

  // ── Signup ──
  // The `profiles` row is created server-side by a Postgres trigger on
  // auth.users (see the SQL provided alongside this change) — this function
  // only creates the auth user and passes along metadata for that trigger
  // to consume. It does NOT insert into profiles directly.
  const signup = useCallback(async (data: SignupData) => {
    setState(s => ({ ...s, isLoading: true }));

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          username: data.username,
          first_name: data.firstName,
          last_name: data.lastName,
          date_of_birth: data.dateOfBirth,
          country: data.country,
          state: data.state,
          city: data.city,
          primary_sport: data.primarySport,
          secondary_sports: data.secondarySports,
          current_club: data.currentClub,
          role: data.role,
        },
      },
    });

    if (error) {
      setState(s => ({ ...s, isLoading: false }));
      throw error;
    }

    const needsEmailConfirmation = !signUpData.session;
    if (signUpData.session) {
      await applySession(signUpData.session);
      // Best-effort IP capture for ban-evasion detection — genuinely
      // optional, a failure here should never block signup itself. This is
      // awaited before signUp() returns, so an unresponsive ipify.org with
      // no timeout would previously hang the entire signup flow (and any
      // live demo of it) indefinitely instead of just failing this one
      // optional step — bounding it with a timeout fixes that.
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        if (ipRes.ok) {
          const { ip } = await ipRes.json();
          if (ip) await supabase.from('profiles').update({ signup_ip: ip }).eq('id', signUpData.session.user.id);
        }
      } catch {
        // Not worth surfacing to the person signing up.
      }
    } else {
      // Email confirmation is required by the Supabase project settings.
      // No session yet — the trigger has still run and created the profile,
      // but the person can't log in until they confirm their email.
      setState({ ...EMPTY_STATE, isLoading: false });
    }

    return { needsEmailConfirmation };
  }, [applySession]);

  // ── Logout ──
  const logout = useCallback(async () => {
    loggingOutRef.current = true;
    await supabase.auth.signOut();
    sessionStartRef.current = null;
    setState({ ...EMPTY_STATE, isLoading: false });
    loggingOutRef.current = false;
  }, []);

  // Signs out every active session for this account, not just this one —
  // for when someone suspects their account's been accessed elsewhere.
  // The actual cross-tab-instant part is the profiles update below, which
  // every other open tab picks up via its own realtime subscription (see
  // applySession's session_invalidated_at check) — signOut({scope:
  // 'global'}) alone only revokes future token refreshes, which could
  // otherwise take up to an hour to actually kick another tab out.
  const logoutAllDevices = useCallback(async () => {
    loggingOutRef.current = true;
    if (state.user?.id) {
      await supabase.from('profiles').update({ session_invalidated_at: new Date().toISOString() }).eq('id', state.user.id);
    }
    await supabase.auth.signOut({ scope: 'global' });
    sessionStartRef.current = null;
    setState({ ...EMPTY_STATE, isLoading: false });
    loggingOutRef.current = false;
  }, [state.user?.id]);

  // ── Refresh profile (e.g. after settings update elsewhere) ──
  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    const { profile, role } = await loadProfileAndRole(data.session.user.id);
    setState(s => ({ ...s, profile, role }));
  }, []);

  // ── Update profile ──
  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!state.user) return;
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', state.user.id)
      .select()
      .single();
    if (error) {
      console.error('Failed to update profile:', error.message);
      throw error;
    }
    setState(s => ({ ...s, profile: data as Profile }));
  }, [state.user]);

  const isAdmin = state.role === 'admin' || state.role === 'super_admin';
  const isSuperAdmin = state.role === 'super_admin';

  return (
    <AuthContext.Provider value={{ ...state, isAdmin, isSuperAdmin, login, signup, logout, logoutAllDevices, updateProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
