import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/ui/Logo';
import { Shield, LogOut } from 'lucide-react';
import { ADMIN_NAV_ITEMS } from '@/lib/adminNav';

/**
 * Replaces the consumer-facing site Navbar on every admin page — every
 * /admin/* route renders this instead, so you can flick straight from one
 * admin section to another (Users, Disputes, Club Applications, etc.)
 * without detouring back through /admin first. Previously each standalone
 * admin page only had a small "← Back to Admin" link (or, worse, still
 * carried the full Feed/Discover/Combine consumer nav above it).
 */
export function AdminTopNav() {
  const { isSuperAdmin } = useAuth();
  const location = useLocation();

  // /admin itself is shared by five tabs (analytics/users/posts/moderation/
  // settings) that have no dedicated route — disambiguate those via ?tab=.
  // Every other section has its own real path, matched directly.
  const activeId = location.pathname === '/admin'
    ? (new URLSearchParams(location.search).get('tab') ?? 'analytics')
    : ADMIN_NAV_ITEMS.find(i => i.to.split('?')[0] === location.pathname)?.id;

  return (
    <div className="border-b border-sr-border bg-sr-surface/50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
          <Link to="/feed" className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-shrink-0">
            <Logo size="sm" />
          </Link>
          <span className="h-5 w-px bg-sr-border hidden sm:block flex-shrink-0" />
          <Link to="/admin" className="text-sm font-semibold text-sr-purple-light items-center gap-1.5 hidden sm:flex hover:text-white transition-colors flex-shrink-0">
            <Shield className="h-4 w-4" /> Admin Dashboard
          </Link>
        </div>
        <Link to="/feed" title="Exit to App"
          className="flex-shrink-0 text-xs font-medium text-sr-text-muted hover:text-white transition-colors flex items-center gap-1.5 border border-sr-border rounded-lg px-2.5 py-1.5 hover:border-sr-purple/40">
          <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Exit to App</span>
        </Link>
      </div>

      {/* Tabs — shown at every width (unlike AdminDashboardPage's own sidebar,
          which only appears on desktop) since a standalone admin page has no
          sidebar of its own to fall back on. */}
      <div className="relative w-full border-t border-sr-border">
        <div className="max-w-7xl mx-auto overflow-x-auto">
          <div className="flex p-2 gap-1 w-max">
            {ADMIN_NAV_ITEMS.filter(t => !t.superAdminOnly || isSuperAdmin).map(item => (
              <Link key={item.id} to={item.to}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeId === item.id ? 'bg-sr-purple/10 text-sr-purple-light' : 'text-sr-text-muted hover:text-white hover:bg-sr-surface-light'
                }`}>
                <item.icon className="h-3.5 w-3.5" />{item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-sr-surface to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-sr-surface to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
