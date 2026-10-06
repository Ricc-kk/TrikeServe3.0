import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * How long the farewell stays up on its own.
 *
 * Was a flat 2000ms, which read as a stall rather than a goodbye. Long enough
 * that the message registers, short enough that nobody waits on it.
 */
const GOODBYE_MS = 1000;

type GoodbyeOverlayProps = {
  /** Fallback when the account has no name on it yet. */
  name?: string;
  /** Line under the heading, e.g. "See you again soon, Juan! 👋" */
  subline: (name: string) => ReactNode;
  /** Icon inside the disc. */
  icon: ReactNode;
  /** Tinted disc background and progress-bar fill, as a CSS colour value. */
  accentSoft: string;
  accent: string;
  /** Runs on auto-dismiss or on an immediate tap. Must be safe to call once. */
  onDone: () => void;
};

/**
 * Farewell shown while signing out, then navigates away.
 *
 * Tapping anywhere finishes immediately. Signing out is not destructive and
 * not reversible in a way that needs a second tap, so making someone wait out a
 * countdown to reach the same result only adds a step. The guard means the tap
 * and the timer firing together cannot both log the user out.
 */
export default function GoodbyeOverlay({
  name,
  subline,
  icon,
  accentSoft,
  accent,
  onDone,
}: GoodbyeOverlayProps) {
  const finishedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    onDone();
  };

  useEffect(() => {
    timerRef.current = window.setTimeout(finish, GOODBYE_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = name?.trim() || "there";

  return (
    <div
      onClick={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          finish();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Signing you out. Tap to continue now."
      className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 cursor-pointer"
    >
      <div className="bg-surface rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: accentSoft }}
        >
          {icon}
        </div>
        <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Goodbye! 👋</h3>
        <p className="text-[var(--muted-foreground)] text-sm">{subline(displayName)}</p>

        <div className="mt-6">
          <div className="w-full bg-[var(--border)] rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: "100%",
                backgroundColor: accent,
                // Matches GOODBYE_MS so the bar never finishes before, or runs
                // on after, the overlay has already gone.
                animation: `shrink ${GOODBYE_MS}ms linear forwards`,
              }}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">Tap anywhere to sign out now</p>
      </div>
    </div>
  );
}
