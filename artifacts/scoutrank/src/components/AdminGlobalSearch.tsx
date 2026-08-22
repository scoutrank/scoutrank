import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fullName } from '@/lib/supabase';
import { Search, Users, Flag, Gavel, Loader2 } from 'lucide-react';

interface SearchResults {
  users: { id: string; username: string; first_name: string; last_name: string; avatar_url: string | null }[];
  reports: { id: string; reason: string }[];
  disputes: { id: string; kind: 'stat' | 'account'; name: string }[];
}

const EMPTY: SearchResults = { users: [], reports: [], disputes: [] };

/**
 * The header search box used to say "Search users, disputes..." but only
 * ever actually searched the Users tab — disputes weren't touched by it
 * at all despite the label. This makes it genuinely search across users,
 * open reports, and open disputes at once.
 */
export function AdminGlobalSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const navigate = useNavigate();
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) { setResults(EMPTY); setIsOpen(false); return; }

    const timeout = setTimeout(async () => {
      setIsLoading(true);
      const [usersRes, reportsRes, statDisputesRes, accountDisputesRes] = await Promise.all([
        supabase.from('profiles').select('id, username, first_name, last_name, avatar_url')
          .or(`username.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`).limit(5),
        supabase.from('reports').select('id, reason').eq('status', 'pending').ilike('reason', `%${query}%`).limit(5),
        supabase.from('stat_disputes').select('id, profiles:profile_id(first_name, last_name, username)').eq('status', 'open').limit(20),
        supabase.from('account_disputes').select('id, profiles:profile_id(first_name, last_name, username)').eq('status', 'open').limit(20),
      ]);

      const matchesQuery = (p: { first_name: string; last_name: string; username: string } | null) =>
        p && `${p.first_name} ${p.last_name} ${p.username}`.toLowerCase().includes(query.toLowerCase());

      const disputes = [
        ...((statDisputesRes.data ?? []) as unknown as { id: string; profiles: { first_name: string; last_name: string; username: string } | null }[])
          .filter(d => matchesQuery(d.profiles))
          .map(d => ({ id: d.id, kind: 'stat' as const, name: d.profiles ? fullName(d.profiles as never) : 'Unknown' })),
        ...((accountDisputesRes.data ?? []) as unknown as { id: string; profiles: { first_name: string; last_name: string; username: string } | null }[])
          .filter(d => matchesQuery(d.profiles))
          .map(d => ({ id: d.id, kind: 'account' as const, name: d.profiles ? fullName(d.profiles as never) : 'Unknown' })),
      ].slice(0, 5);

      setResults({
        users: (usersRes.data as SearchResults['users'] | null) ?? [],
        reports: (reportsRes.data as SearchResults['reports'] | null) ?? [],
        disputes,
      });
      setIsLoading(false);
      setIsOpen(true);
    }, 300);

    return () => clearTimeout(timeout);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasResults = results.users.length > 0 || results.reports.length > 0 || results.disputes.length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sr-text-muted" />
      <input
        className="input-dark pl-9 py-1.5 text-xs w-full"
        placeholder="Search users, reports, disputes..."
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (value.trim().length >= 2) setIsOpen(true); }}
      />
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 max-h-96 overflow-y-auto card-premium p-2 z-50 shadow-xl">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 text-sr-purple animate-spin" /></div>
          ) : !hasResults ? (
            <p className="text-xs text-sr-text-muted text-center py-3">No matches.</p>
          ) : (
            <>
              {results.users.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-sr-text-muted uppercase tracking-wide px-2 mb-1 flex items-center gap-1"><Users className="h-3 w-3" /> Users</p>
                  {results.users.map(u => (
                    <button key={u.id} onClick={() => { navigate(`/profile/${u.username}`); setIsOpen(false); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sr-surface-light text-left">
                      <div className="h-6 w-6 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-sr-purple/50 to-sr-blue/50 flex items-center justify-center text-[9px] font-bold text-white">
                        {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : <>{u.first_name?.[0]}{u.last_name?.[0]}</>}
                      </div>
                      <span className="text-xs text-white">{u.first_name} {u.last_name}</span>
                      <span className="text-[10px] text-sr-text-muted">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.reports.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-sr-text-muted uppercase tracking-wide px-2 mb-1 flex items-center gap-1"><Flag className="h-3 w-3" /> Reports</p>
                  {results.reports.map(r => (
                    <button key={r.id} onClick={() => { navigate('/admin/reports'); setIsOpen(false); }}
                      className="w-full flex items-center px-2 py-1.5 rounded-lg hover:bg-sr-surface-light text-left">
                      <span className="text-xs text-sr-silver truncate">{r.reason}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.disputes.length > 0 && (
                <div>
                  <p className="text-[10px] text-sr-text-muted uppercase tracking-wide px-2 mb-1 flex items-center gap-1"><Gavel className="h-3 w-3" /> Disputes</p>
                  {results.disputes.map(d => (
                    <button key={d.id} onClick={() => { navigate('/admin/disputes'); setIsOpen(false); }}
                      className="w-full flex items-center px-2 py-1.5 rounded-lg hover:bg-sr-surface-light text-left">
                      <span className="text-xs text-sr-silver">{d.name}</span>
                      <span className="text-[10px] text-sr-text-muted ml-1.5">({d.kind === 'stat' ? 'stat evidence' : 'account'})</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
