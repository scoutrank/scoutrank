import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { PostRemovalNoticeModal } from '@/components/PostRemovalNoticeModal';
import { AccountWarningModal } from '@/components/AccountWarningModal';

export function Layout() {
  return (
    <div className="min-h-[100dvh] bg-sr-bg">
      <Navbar />
      {/* pb-16 clears the mobile bottom tab bar; lg:pb-0 removes it on desktop */}
      <main className="min-h-[calc(100dvh-4rem)] pb-16 lg:pb-0">
        <Outlet />
      </main>
      <PostRemovalNoticeModal />
      <AccountWarningModal />
    </div>
  );
}
