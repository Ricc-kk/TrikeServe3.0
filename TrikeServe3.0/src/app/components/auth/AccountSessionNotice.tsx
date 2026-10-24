import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { armWelcomeGreeting } from '../../../lib/welcomeGreeting';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';

interface AccountSessionNoticeState {
  displayName?: string;
  otherSessionWillBeSignedOut?: boolean;
}

export default function AccountSessionNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const dialogRef = useRef<HTMLElement>(null);
  const state = location.state as AccountSessionNoticeState | null;
  const displayName = typeof state?.displayName === 'string' ? state.displayName : '';
  const otherSessionWillBeSignedOut = state?.otherSessionWillBeSignedOut === true;
  const hasNotice = displayName.length > 0;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    if (!hasNotice) navigate('/redirect', { replace: true });
  }, [hasNotice, isLoading, navigate, user]);

  useEffect(() => {
    if (isLoading || !user || !hasNotice) return;
    const continueButton = dialogRef.current?.querySelector<HTMLElement>('button');
    continueButton?.focus();

    // This handoff has a single action. Keep keyboard focus on it until the
    // signed-in user explicitly continues to the role-specific home screen.
    const keepNoticeFocused = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
      }
    };
    document.addEventListener('keydown', keepNoticeFocused, true);
    return () => document.removeEventListener('keydown', keepNoticeFocused, true);
  }, [hasNotice, isLoading, user]);

  const continueToHome = () => {
    armWelcomeGreeting(displayName);
    navigate('/redirect', { replace: true });
  };

  if (isLoading || !user || !hasNotice) {
    return (
      <main className="fixed inset-0 z-[10060] grid min-h-screen place-items-center bg-black/55 px-4 backdrop-blur-sm">
        <p role="status" className="text-sm font-medium text-[var(--muted-foreground)]">Preparing your account…</p>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-[10060] grid min-h-screen place-items-center bg-black/55 px-4 py-10 backdrop-blur-sm">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="account-session-notice-title"
        aria-describedby="account-session-notice-description"
        className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-2xl"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">TrikeServe</p>
        <h1 id="account-session-notice-title" className="mt-3 text-lg font-bold text-[var(--ink)]">
          Account already signed in
        </h1>
        <p id="account-session-notice-description" className="mt-2 text-sm text-[var(--muted-foreground)]">
          {otherSessionWillBeSignedOut
            ? 'Another device is signed in to this account. The other signed-in device will be signed out so you can continue here.'
            : 'This account is active on another device. Both sessions can stay signed in under the current session limit.'}
        </p>
        <Button
          type="button"
          onClick={continueToHome}
          className="mt-5 w-full bg-[var(--primary)] text-base"
        >
          Continue to home
        </Button>
      </section>
    </main>
  );
}
