/**
 * Whether a shop is open right now.
 *
 * `restaurants.is_open` is a manual switch — the owner flips it when they get in
 * and when they lock up. On its own it lies after closing time: the shop goes
 * home at 10pm, forgets to flip the switch, and the storefront keeps taking
 * orders all night.
 *
 * So the shop's real state is the switch AND its trading hours. A shop with no
 * hours configured has nothing to check and behaves exactly as it did before
 * this existed — the switch alone decides.
 *
 * All comparisons are in the shop's local time. "Open until 10pm" has to mean
 * 10pm where the shop is, not where the reader's browser happens to be, and a
 * customer ordering a kilometre away is in the same timezone anyway.
 */

/** Anything carrying hours, so a row and a draft can both be passed in. */
export interface ShopHours {
  /** "HH:MM", 24-hour. Null/undefined means no schedule. */
  open_time?: string | null;
  close_time?: string | null;
  /** 0 = Sunday .. 6 = Saturday. Null/empty means every day. */
  open_days?: number[] | null;
}

export interface ResolvedHours {
  /** False when the shop has not configured a usable schedule. */
  configured: boolean;
  open: boolean;
  close: boolean;
  /** "08:00"–"22:00", for showing back to the owner. */
  openTime: string;
  closeTime: string;
  /** Sorted, 0-6. Every day when the column is empty. */
  days: number[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const DAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "08:30" -> 510. Returns null for anything that is not a real 24-hour time. */
function minutesOf(value?: string | null): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([0-2]?\d):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(match[2]);
}

/** 510 -> "08:30". */
export function formatMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Normalise whatever the row holds into something usable.
 *
 * A half-configured row — an open time with no close time — reads as
 * unconfigured rather than as "always open", because a shop that cannot say when
 * it shuts is better off falling back to its manual switch than silently selling
 * food overnight.
 */
export function resolveHours(hours: ShopHours | null | undefined): ResolvedHours {
  const openMinutes = minutesOf(hours?.open_time);
  const closeMinutes = minutesOf(hours?.close_time);

  if (openMinutes === null || closeMinutes === null) {
    return {
      configured: false,
      open: false,
      close: false,
      openTime: '08:00',
      closeTime: '22:00',
      days: ALL_DAYS,
    };
  }

  const rawDays = Array.isArray(hours?.open_days)
    ? hours!.open_days!
    : [];
  const days = [...new Set(rawDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );

  return {
    configured: true,
    open: false,
    close: false,
    openTime: formatMinutes(openMinutes),
    closeTime: formatMinutes(closeMinutes),
    days: days.length > 0 ? days : ALL_DAYS,
  };
}

/**
 * Is the shop trading at this moment?
 *
 * Handles a window that crosses midnight: a shop open 6PM to 2AM is open on the
 * evening of one day and the small hours of the next, and which days count is
 * the day it *opened*, not the day it is currently past midnight in.
 */
export function isOpenAt(hours: ShopHours | null | undefined, now: Date = new Date()): boolean {
  const resolved = resolveHours(hours);
  if (!resolved.configured) return false;

  const openMinutes = minutesOf(resolved.openTime)!;
  const closeMinutes = minutesOf(resolved.closeTime)!;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const today = now.getDay();

  if (closeMinutes > openMinutes) {
    // A normal same-day window.
    return (
      resolved.days.includes(today) &&
      nowMinutes >= openMinutes &&
      nowMinutes < closeMinutes
    );
  }

  // Crosses midnight. Before closing time we are still in the day that opened;
  // after it we are in the tail of the previous day.
  if (nowMinutes >= openMinutes) {
    return resolved.days.includes(today);
  }
  if (nowMinutes < closeMinutes) {
    return resolved.days.includes((today + 6) % 7);
  }
  return false;
}

/**
 * The shop's real open state: their switch AND their hours.
 *
 * This is the value the storefront should use. `is_open` alone lets a shop that
 * forgot to close keep selling; hours alone would ignore a shop that has closed
 * early for the day.
 */
export function isEffectivelyOpen(
  row: (ShopHours & { is_open?: boolean | null }) | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  if (row.is_open === false) return false;
  if (!resolveHours(row).configured) return row.is_open !== false;
  return isOpenAt(row, now);
}

/**
 * Plain-language state for the owner's screen.
 *
 * Says *why* a shop reads closed, because "Closed" on a shop that is plainly open
 * is indistinguishable from a bug. Without a schedule it says the switch is off;
 * with one it names the day or the hour.
 */
export function describeOpenState(
  row: (ShopHours & { is_open?: boolean | null }) | null | undefined,
  now: Date = new Date(),
): { open: boolean; label: string; detail: string } {
  if (!row) return { open: false, label: 'Closed', detail: 'No shop linked yet' };

  const resolved = resolveHours(row);

  if (!resolved.configured) {
    return row.is_open === false
      ? { open: false, label: 'Manually closed', detail: 'You have the shop switched off.' }
      : { open: true, label: 'Open', detail: 'No trading hours set — the switch decides.' };
  }

  if (row.is_open === false) {
    return {
      open: false,
      label: 'Manually closed',
      detail: 'Outside your hours, or you have the shop switched off.',
    };
  }

  if (isOpenAt(row, now)) {
    return { open: true, label: 'Open', detail: 'Within your trading hours.' };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = minutesOf(resolved.openTime)!;
  const closeMinutes = minutesOf(resolved.closeTime)!;

  if (!resolved.days.includes(now.getDay())) {
    return {
      open: false,
      label: 'Closed today',
      detail: `${DAY_NAMES[now.getDay()]} is not one of your trading days.`,
    };
  }

  if (nowMinutes < openMinutes) {
    return {
      open: false,
      label: 'Closed',
      detail: `Opens at ${describeClock(resolved.openTime)}.`,
    };
  }

  return {
    open: false,
    label: 'Closed for the day',
    detail: `Closed at ${describeClock(resolved.closeTime)}.`,
  };
}

/** "08:00" -> "8:00 AM". For anything shown to a person. */
export function describeClock(value: string): string {
  const minutes = minutesOf(value);
  if (minutes === null) return value;
  const hours = Math.floor(minutes / 60);
  const suffix = hours < 12 ? 'AM' : 'PM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes % 60).padStart(2, '0')} ${suffix}`;
}

/** A short "Open daily 8:00 AM – 10:00 PM" line for cards and headers. */
export function describeSchedule(hours: ShopHours | null | undefined): string {
  const resolved = resolveHours(hours);
  if (!resolved.configured) return 'Hours not set';

  const everyDay = resolved.days.length === 7;
  const weekdayOnly =
    resolved.days.length === 5 && resolved.days.every((d) => d >= 1 && d <= 5);

  const days = everyDay
    ? 'Daily'
    : weekdayOnly
      ? 'Mon–Fri'
      : resolved.days.map((d) => DAY_LABELS[d]).join(', ');

  return `${days} · ${describeClock(resolved.openTime)} – ${describeClock(resolved.closeTime)}`;
}