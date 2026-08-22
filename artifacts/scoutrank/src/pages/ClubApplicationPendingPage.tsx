import { useAuth } from '@/contexts/AuthContext';
import { Clock } from 'lucide-react';

export default function ClubApplicationPendingPage() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-sr-bg flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="h-14 w-14 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
          <Clock className="h-7 w-7 text-yellow-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Your club application is under review</h1>
        <p className="text-sm text-sr-text-muted mb-6">
          An admin needs to verify you're authorised to represent this club before your account is activated. You'll be able to log in normally once it's approved.
        </p>
        <button onClick={logout} className="text-sm text-sr-purple-light hover:text-white">Log out</button>
      </div>
    </div>
  );
}
