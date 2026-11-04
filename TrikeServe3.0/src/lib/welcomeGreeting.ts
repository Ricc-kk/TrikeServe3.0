/**
 * One-time greeting armed by a successful sign-in and consumed on the landing
 * dashboard. Keeping it in memory lets sign-in hand it off without allowing a
 * reload or a later app visit to replay it.
 *
 * `consumeWelcomeGreeting` clears before returning, so two screens cannot greet
 * for the same sign-in.
 */

let armedName: string | null = null;

/** Called once, immediately after a successful sign-in. */
export function armWelcomeGreeting(displayName: string): void {
  armedName = displayName;
}

/**
 * Take the greeting, if one is waiting.
 *
 * Returns the display name and clears the flag, so a second call in the same page
 * load returns null.
 */
export function consumeWelcomeGreeting(): string | null {
  if (armedName === null) return null;
  const name = armedName;
  armedName = null;
  return name;
}
