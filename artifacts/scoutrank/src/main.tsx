import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';

// Error monitoring — added so a real user hitting a broken edge function,
// a thrown exception, or a blank-white-screen crash actually surfaces
// somewhere instead of us only finding out if they happen to tell us
// (which is exactly what happened with the review-stat-evidence failure
// at today's presentation). tracesSampleRate/replaysSessionSampleRate
// are kept low/off since this is a free-tier project — just error
// capture, not full performance/session tracing.
Sentry.init({
  dsn: 'https://9b8ff2f0df344e12980ac78c0436f58d@o4511971217965056.ingest.de.sentry.io/4511971222487120',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0,
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');
createRoot(rootEl).render(
  <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>,
);

// Minimal fallback UI — a broken white screen is worse than a plain
// "something went wrong, refresh" message, and this still lets Sentry
// capture the error that triggered it.
function ErrorFallback() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '12px',
      background: '#0a0a12', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: '24px', textAlign: 'center',
    }}>
      <p style={{ fontSize: '18px', fontWeight: 600 }}>Something went wrong.</p>
      <p style={{ color: '#9ca3af', fontSize: '14px' }}>We've been notified. Try refreshing the page.</p>
      <button
        onClick={() => window.location.reload()}
        style={{ marginTop: '8px', padding: '8px 20px', borderRadius: '8px', background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        Refresh
      </button>
    </div>
  );
}
