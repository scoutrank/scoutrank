/**
 * ErrorBoundary
 *
 * Catches any render-time exception thrown by a child component and
 * shows a ScoutRank-branded recovery screen instead of a blank page.
 *
 * Implementation notes:
 *  - Must be a class component — React's error-boundary API requires it.
 *  - Uses a React Router <Link> for "Return to Dashboard" so the SPA
 *    never makes a full-page request that Vercel would have to handle.
 *  - "Reload page" is the one case that needs window.location.reload()
 *    because the React state is corrupted and must be discarded.
 *  - componentDidCatch logs full error + component stack to the console
 *    so developers can diagnose crashes; the UI never shows stack traces.
 *  - Error message shown in dev/preview builds (import.meta.env.DEV);
 *    hidden in production.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { WarningIcon } from '@/components/icons';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always log the full detail so developers can diagnose issues in
    // any environment. Stack traces are never shown in the UI.
    console.error('[ErrorBoundary caught]', error, info.componentStack);
  }

  private handleReload = () => {
    // Full reload discards the corrupted React tree.
    window.location.reload();
  };

  private handleReturnHome = () => {
    // Reset error state before navigating. The <Link> below will then
    // render the dashboard route inside the same React tree without a
    // full-page navigation, so Vercel's SPA rewrite is not needed here.
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen bg-sr-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center card-premium p-10">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-sr-purple to-sr-blue flex items-center justify-center mb-6">
            <WarningIcon size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-sr-text-muted mb-6 text-sm leading-relaxed">
            An unexpected error occurred. Your data is safe — this is a display issue only.
          </p>

          {/* Dev / preview only: show error message — never in production */}
          {isDev && this.state.error && (
            <pre className="text-left text-xs text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg p-3 mb-6 overflow-auto max-h-28 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/*
              Reload page: must be a full reload because the React
              component tree is in an unknown state after an error.
            */}
            <button
              onClick={this.handleReload}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sr-purple to-sr-blue text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              Reload page
            </button>

            {/*
              Return to Dashboard: uses React Router <Link> so the
              navigation stays client-side. handleReturnHome clears
              the error state first so the component tree is reset
              before rendering the dashboard route.
            */}
            <Link
              to="/dashboard"
              onClick={this.handleReturnHome}
              className="px-6 py-2.5 rounded-xl border border-sr-border text-sr-silver text-sm font-semibold hover:border-sr-purple/40 hover:text-white transition-colors">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
