/**
 * What counts as an acceptable password, defined once.
 *
 * Sign-up and change-password both need this, and they were not the same screen:
 * sign-up had the rules inline, SetPassword re-implemented them as four separate
 * `if` statements with their own wording, and the customer's own password could
 * be changed in neither. Three copies of a security rule is three chances to
 * disagree about what is allowed — and the worst version of that disagreement is
 * a form that rejects a password its own checklist just called good.
 *
 * Keeping it here means the visible checklist, the blur-time message and the
 * submit-time guard all read from the same list, on every screen.
 */
export const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "One number", test: (v: string) => /[0-9]/.test(v) },
] as const;

/** The rules `value` fails. Empty means the password is acceptable. */
export function passwordRuleFailures(value: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.label);
}

/** Whether `value` satisfies every rule. */
export function isAcceptablePassword(value: string): boolean {
  return passwordRuleFailures(value).length === 0;
}