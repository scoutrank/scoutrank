import { supabase } from '@/lib/supabase';

/**
 * Subscribes to live Postgres changes on a table via Supabase Realtime.
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 *
 * Requires the table to actually be added to the `supabase_realtime`
 * publication in the database first (see the SQL provided alongside
 * this feature) — without that, this subscribes successfully but never
 * receives any events, which looks identical to "not working" from here.
 */
export function subscribeToTable<T = Record<string, unknown>>(
  table: string,
  events: {
    onInsert?: (row: T) => void;
    onDelete?: (oldRow: Partial<T>) => void;
    onUpdate?: (row: T) => void;
  },
): () => void {
  const channel = supabase
    .channel(`realtime:${table}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, payload => {
      events.onInsert?.(payload.new as T);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, payload => {
      events.onDelete?.(payload.old as Partial<T>);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, payload => {
      events.onUpdate?.(payload.new as T);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
