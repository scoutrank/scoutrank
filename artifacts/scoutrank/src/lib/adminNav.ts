import {
  Users, Flag, Shield, BarChart3, Building2, Settings, MessageCircle,
  Inbox, ShieldOff, Gavel, AlertTriangle, UserX, ShoppingBag, ShieldCheck, DollarSign,
} from 'lucide-react';

// Single source of truth for every admin section — used by AdminDashboardPage's
// own sidebar/mobile tabs (internal, no navigation) AND by AdminTopNav (real
// navigation) on every standalone /admin/* page. Keep this in sync with the
// `adminTabs` list inside AdminDashboardPage.tsx if a section is added or
// renamed there.
//
// Sections without their own dedicated route (analytics, users, posts,
// moderation, settings) link to /admin with a ?tab= query param, which
// AdminDashboardPage reads on load to select the right tab.
export type AdminNavId =
  | 'analytics' | 'users' | 'posts' | 'reports' | 'verification' | 'disputes'
  | 'flagged' | 'organisations' | 'org_requests' | 'moderation' | 'deletion_requests'
  | 'marketplace_reviews' | 'seller_applications' | 'payouts' | 'evidence_reports'
  | 'org_claims' | 'settings';

export interface AdminNavItem {
  id: AdminNavId;
  label: string;
  icon: typeof Users;
  to: string;
  superAdminOnly?: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { id: 'analytics',            label: 'Analytics',            icon: BarChart3,   to: '/admin' },
  { id: 'users',                label: 'Users',                icon: Users,       to: '/admin?tab=users' },
  { id: 'posts',                label: 'Posts',                icon: MessageCircle, to: '/admin?tab=posts' },
  { id: 'reports',              label: 'Reports',               icon: Flag,        to: '/admin/reports' },
  { id: 'verification',         label: 'Verification',         icon: Shield,      to: '/admin/verification' },
  { id: 'disputes',             label: 'Disputes',              icon: Gavel,       to: '/admin/disputes' },
  { id: 'flagged',              label: 'AI Flagged',           icon: AlertTriangle, to: '/admin/flagged' },
  { id: 'organisations',        label: 'Organisations',        icon: Building2,   to: '/admin/organisations' },
  { id: 'org_requests',         label: 'Org Requests',         icon: Inbox,       to: '/admin/organisation-requests' },
  { id: 'moderation',           label: 'Moderation',           icon: ShieldOff,   to: '/admin?tab=moderation', superAdminOnly: true },
  { id: 'deletion_requests',    label: 'Deletion Requests',    icon: UserX,       to: '/admin/deletion-requests', superAdminOnly: true },
  { id: 'marketplace_reviews',  label: 'Combine Reviews',      icon: ShoppingBag, to: '/admin/combine-reviews' },
  { id: 'seller_applications',  label: 'Seller Applications',  icon: ShieldCheck, to: '/admin/seller-applications' },
  { id: 'payouts',              label: 'Combine Payouts',      icon: DollarSign,  to: '/admin/payouts' },
  { id: 'evidence_reports',     label: 'Evidence Reports',     icon: Flag,        to: '/admin/evidence-reports' },
  { id: 'org_claims',           label: 'Club Applications',    icon: Building2,   to: '/admin/organisation-claims' },
  { id: 'settings',             label: 'Settings',             icon: Settings,    to: '/admin?tab=settings' },
];
