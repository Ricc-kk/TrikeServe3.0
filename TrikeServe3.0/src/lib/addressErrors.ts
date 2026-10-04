/**
 * Why a saved address did not save.
 *
 * Every failure used to arrive as "Could not save this address. Please try
 * again.", which is the least useful sentence in the app: it tells the customer
 * nothing about whether to retry, sign in again, or pick a different place. The
 * database rejects these writes for a handful of distinguishable reasons —
 * a signed-out session, a profile row that is missing, a field too long for
 * the column — and each one has a different action behind it.
 *
 * The most common cause in practice is not in this list at all: the customer
 * has no Supabase session, or is on a legacy localStorage account whose id
 * matches neither `auth.uid()` nor `users(id)`.
 */
export function describeAddressSaveError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : ((error as { message?: string })?.message ?? String(error ?? ""));

  const lower = raw.toLowerCase();

  if (!raw) {
    return "We could not reach the server to save this address. Check your connection and try again.";
  }
  if (lower.includes("jwt") || lower.includes("rls") || lower.includes("row-level") || lower.includes("401") || lower.includes("permission denied")) {
    return "Your session has expired, so this address was not saved. Please sign in again and retry — your pin is still here.";
  }
  if (lower.includes("foreign key") || lower.includes("users_id_fkey") || lower.includes("violates foreign key")) {
    return "Your account profile is missing, so this address could not be saved. Please sign out and sign in again.";
  }
  if (lower.includes("value too long") || lower.includes("character varying")) {
    return "That address is too long to save. Shorten it to the street and city, then try again.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "You have already saved this address.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("timeout")) {
    return "We could not reach the server. Check your connection and try again — your pin is still here.";
  }
  if (lower.includes("not signed in")) {
    return "You are signed out, so this address was not saved. Please sign in and try again.";
  }

  // Never surface a raw driver string: it can leak column names and internals,
  // and it reads as a bug report to a customer.
  return "This address could not be saved. Please check the details and try again.";
}
