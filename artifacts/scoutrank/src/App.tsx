import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage';
import CommunityGuidelinesPage from '@/pages/CommunityGuidelinesPage';
import ContactPage from '@/pages/ContactPage';
import ParentViewConversationPage from '@/pages/ParentViewConversationPage';
const PerformancePassportPage = lazy(() => import('@/pages/PerformancePassportPage'));
const MarketplacePage = lazy(() => import('@/pages/MarketplacePage'));
const CreateListingPage = lazy(() => import('@/pages/CreateListingPage'));
const ListingDetailPage = lazy(() => import('@/pages/ListingDetailPage'));
const AdminMarketplaceListingsPage = lazy(() => import('@/pages/AdminMarketplaceListingsPage'));
const OrderConfirmationPage = lazy(() => import('@/pages/OrderConfirmationPage'));
const SellerApplicationPage = lazy(() => import('@/pages/SellerApplicationPage'));
const AdminSellerApplicationsPage = lazy(() => import('@/pages/AdminSellerApplicationsPage'));
const SellerEarningsPage = lazy(() => import('@/pages/SellerEarningsPage'));
const AdminPayoutsPage = lazy(() => import('@/pages/AdminPayoutsPage'));
const MyOrdersPage = lazy(() => import('@/pages/MyOrdersPage'));
const EditListingPage = lazy(() => import('@/pages/EditListingPage'));
const AdminEvidenceReportsPage = lazy(() => import('@/pages/AdminEvidenceReportsPage'));
const ClaimOrRegisterClubPage = lazy(() => import('@/pages/ClaimOrRegisterClubPage'));
const AdminOrganisationClaimsPage = lazy(() => import('@/pages/AdminOrganisationClaimsPage'));
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import VerificationStatusPage from '@/pages/VerificationStatusPage';
const AdminVerificationPage = lazy(() => import('@/pages/AdminVerificationPage'));
const AdminOrganisationsPage = lazy(() => import('@/pages/AdminOrganisationsPage'));
const AdminOrganisationRequestsPage = lazy(() => import('@/pages/AdminOrganisationRequestsPage'));
import OrganisationProfilePage from '@/pages/OrganisationProfilePage';
import ParentDashboardPage from '@/pages/ParentDashboardPage';
import ParentLinkRequestsPage from '@/pages/ParentLinkRequestsPage';
const AdminPendingStatsPage = lazy(() => import('@/pages/AdminPendingStatsPage'));
const AdminReportsPage = lazy(() => import('@/pages/AdminReportsPage'));
const AdminDisputesPage = lazy(() => import('@/pages/AdminDisputesPage'));
const AdminFlaggedContentPage = lazy(() => import('@/pages/AdminFlaggedContentPage'));
import SignupPage from '@/pages/SignupPage';
import OnboardingPage from '@/pages/OnboardingPage';
import DashboardPage from '@/pages/DashboardPage';
import AthleteProfilePage from '@/pages/AthleteProfilePage';
import ProfilePage from '@/pages/ProfilePage';
import FeedPage from '@/pages/FeedPage';
import PostDetailPage from '@/pages/PostDetailPage';
import RankingsPage from '@/pages/RankingsPage';
import DiscoverPage from '@/pages/DiscoverPage';
import ClubPage from '@/pages/ClubPage';
import SettingsPage from '@/pages/SettingsPage';
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage'));
import ExplorePage from '@/pages/ExplorePage';
import SinglePostViewPage from '@/pages/SinglePostViewPage';
import ScoutBotPage from '@/pages/ScoutBotPage';
import AccountRestrictedPage from '@/pages/AccountRestrictedPage';
const ClubSignupPage = lazy(() => import('@/pages/ClubSignupPage'));
const ClubApplicationPendingPage = lazy(() => import('@/pages/ClubApplicationPendingPage'));
import RecordHighlightPage from '@/pages/RecordHighlightPage';
const AdminDeletionRequestsPage = lazy(() => import('@/pages/AdminDeletionRequestsPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} />;
  }
  if (profile?.account_status === 'suspended' || profile?.account_status === 'banned') {
    return <Navigate to="/account-restricted" />;
  }
  if (profile?.account_status === 'pending_club_approval') {
    return <Navigate to="/club-application-pending" />;
  }
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isAdmin, profile } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (profile?.account_status === 'suspended' || profile?.account_status === 'banned') {
    return <Navigate to="/account-restricted" />;
  }
  if (profile?.account_status === 'pending_club_approval') {
    return <Navigate to="/club-application-pending" />;
  }
  if (!isAdmin) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function ParentRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, profile } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (profile?.account_status === 'suspended' || profile?.account_status === 'banned') {
    return <Navigate to="/account-restricted" />;
  }
  if (profile?.account_status === 'pending_club_approval') {
    return <Navigate to="/club-application-pending" />;
  }
  if (profile?.role !== 'parent') return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function AccountRestrictedGate() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <AccountRestrictedPage />;
}

function ClubApplicationPendingGate() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <ClubApplicationPendingPage />;
}

function AppRoutes() {
  const { isAuthenticated, isAdmin, isLoading: authLoading, profile } = useAuth();

  useEffect(() => {
    document.documentElement.classList.remove('theme-ultra-dark');
    if (profile?.theme_preference === 'ultra_dark') {
      document.documentElement.classList.add('theme-ultra-dark');
    }
  }, [profile?.theme_preference]);

  // Club-owning accounts used to land on their org page here — that's
  // gone now. /dashboard is the one landing spot for every account type;
  // a club's own page is reachable via "My Club" in the nav instead, same
  // as anywhere else you'd navigate to on purpose rather than land on.
  const authenticatedDest = isAdmin
    ? '/admin'
    : profile?.role === 'parent'
    ? '/parent'
    : profile?.onboarding_completed === false
    ? '/onboarding'
    : '/dashboard';

  if (isAuthenticated && authLoading) {
    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse" />
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-sr-bg flex items-center justify-center">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sr-purple to-sr-blue animate-pulse" />
      </div>
    }>
    <Routes>
      {/* Public */}
      <Route path="/" element={isAuthenticated ? <Navigate to={authenticatedDest} /> : <LandingPage />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to={authenticatedDest} /> : <LoginPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to={authenticatedDest} /> : <SignupPage />} />
      <Route path="/signup/club" element={isAuthenticated ? <Navigate to={authenticatedDest} /> : <ClubSignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Onboarding */}
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/verification-status" element={<ProtectedRoute><VerificationStatusPage /></ProtectedRoute>} />

      {/* Parent routes */}
      <Route path="/parent" element={<ParentRoute><ParentDashboardPage /></ParentRoute>} />
      <Route path="/parent/conversation/:conversationId" element={<ParentRoute><ParentViewConversationPage /></ParentRoute>} />
      <Route path="/parent/link-requests" element={<ProtectedRoute><ParentLinkRequestsPage /></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/admin/verification" element={<AdminRoute><AdminVerificationPage /></AdminRoute>} />
      <Route path="/admin/organisations" element={<AdminRoute><AdminOrganisationsPage /></AdminRoute>} />
      <Route path="/admin/organisation-requests" element={<AdminRoute><AdminOrganisationRequestsPage /></AdminRoute>} />
      <Route path="/admin/pending-stats" element={<AdminRoute><AdminPendingStatsPage /></AdminRoute>} />
      <Route path="/admin/reports" element={<AdminRoute><AdminReportsPage /></AdminRoute>} />
      <Route path="/admin/disputes" element={<AdminRoute><AdminDisputesPage /></AdminRoute>} />
      <Route path="/admin/flagged" element={<AdminRoute><AdminFlaggedContentPage /></AdminRoute>} />
      <Route path="/admin/deletion-requests" element={<AdminRoute><AdminDeletionRequestsPage /></AdminRoute>} />

      {/* Deliberately outside ProtectedRoute — that's what redirects here,
          so this route can't itself check account_status or it'd loop. */}
      <Route path="/account-restricted" element={<AccountRestrictedGate />} />
      <Route path="/club-application-pending" element={<ClubApplicationPendingGate />} />
      <Route path="/record-highlight" element={<ProtectedRoute><RecordHighlightPage /></ProtectedRoute>} />

      {/* Layout routes */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/post/:id" element={<PostDetailPage />} />
        <Route path="/rankings" element={<RankingsPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/profile/:username/passport" element={<PerformancePassportPage />} />
        <Route path="/organisation/:id" element={<OrganisationProfilePage />} />
        <Route path="/club/:slug" element={<ClubPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/:postId" element={<SinglePostViewPage />} />
        <Route path="/scout-bot" element={<ScoutBotPage />} />
        <Route path="/combine" element={<MarketplacePage />} />
        <Route path="/combine/new" element={<CreateListingPage />} />
        <Route path="/combine/order/:id" element={<OrderConfirmationPage />} />
        <Route path="/combine/become-a-seller" element={<SellerApplicationPage />} />
        <Route path="/combine/:id/edit" element={<EditListingPage />} />
        <Route path="/admin/evidence-reports" element={<AdminEvidenceReportsPage />} />
        <Route path="/clubs/claim-or-register" element={<ClaimOrRegisterClubPage />} />
        <Route path="/admin/organisation-claims" element={<AdminOrganisationClaimsPage />} />
        <Route path="/combine/:id" element={<ListingDetailPage />} />
        <Route path="/admin/combine-reviews" element={<AdminMarketplaceListingsPage />} />
        <Route path="/admin/seller-applications" element={<AdminSellerApplicationsPage />} />
        <Route path="/combine/earnings" element={<SellerEarningsPage />} />
        <Route path="/admin/payouts" element={<AdminPayoutsPage />} />
        <Route path="/combine/my-orders" element={<MyOrdersPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={
        <div className="min-h-screen bg-sr-bg flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-bold gradient-text-brand mb-4">404</h1>
            <p className="text-sr-text-muted">Page not found</p>
          </div>
        </div>
      } />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
