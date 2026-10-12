import { useEffect, useState } from 'react';

/**
 * Human-readable elapsed duration.
 *
 * Deliberately zero-padded once minutes are involved: a counter that reads
 * "2m 5s" and then "2m 15s" jitters in width as the digits change, which reads as
 * the number flickering rather than time passing.
 */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(remainder).padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
  }
  return `${remainder}s`;
}

/**
 * A waiting-time counter that ticks once a second.
 *
 * Exists because computing `Date.now() - startedAt` inline during render does not
 * produce a running clock. It only refreshes when something else re-renders the
 * component, so on a screen that refreshes its data every few seconds the timer
 * advances in those same jumps -- a "live" counter a customer watches to judge how
 * long the wait has been, which was the point of showing it at all.
 *
 * Recomputed from the wall clock on every tick rather than incremented, so a
 * backgrounded tab that had its interval throttled resumes at the correct second
 * instead of crawling to catch up.
 *
 * Pass `null` while nothing is being waited on: no interval is started and the
 * counter reads "0s", so a caller does not have to guard the call site.
 */
export function useElapsedTime(startedAt?: number | string | null): string {
  const startMs = startedAt == null
    ? null
    : (typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime());

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startMs == null || Number.isNaN(startMs)) return;

    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startMs]);

  if (startMs == null || Number.isNaN(startMs)) return '0s';

  return formatElapsed((now - startMs) / 1000);
}