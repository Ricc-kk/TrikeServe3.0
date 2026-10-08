/**
 * The "Welcome back" greeting, armed by a real sign-in and consumed once.
 *
 * This was a pair of `sessionStorage` keys, which broke the one rule the greeting
 * has to obey: `sessionStorage` survives a page reload within the tab. So the flag
 * set at sign-in could sit unconsumed -- customers land on `/customer`, but the
 * greeting lives in the Food tab -- and then fire much later the next time that
 * screen mounted, or on a plain refresh. The customer got "Welcome back" without
 * having logged in.
 *
 * A module-scoped variable is the right lifetime. Sign-in and the dashboard it
 * navigates to are the same JS instance, so the value survives the handoff; any
 * full page load re-imports this module and the variable starts as null. Refreshing
 * or reopening the app therefore cannot replay the greeting -- it only ever follows
 * an actual sign-in.
 *
 * `consumeWelcomeGreeting` clears before returning, so two mounted screens cannot
 * both greet.
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