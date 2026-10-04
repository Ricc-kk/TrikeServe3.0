/**
 * Storage upload failures, explained.
 *
 * Every avatar/menu/restaurant upload in the app funnels through here so a
 * failure never reaches the customer as a bare "Failed to upload". The most
 * important case is a missing bucket: the code once uploaded profile photos to
 * a bucket named `avatars` that no migration ever created, and because the
 * error was swallowed behind a generic alert, the cause stayed invisible.
 */

/** Turn a Supabase storage error into a sentence a person can act on. */
export function describeUploadError(error: unknown): string {
  if (!error) return "Please try again.";

  const message =
    typeof error === "string"
      ? error
      : ((error as { message?: string })?.message ?? String(error));

  const lower = message.toLowerCase();

  if (lower.includes("bucket not found")) {
    return "The photo storage bucket is missing. Run ADD_AVATAR_BUCKET.sql in Supabase.";
  }
  if (lower.includes("row-level security") || lower.includes("new row violates")) {
    return "You do not have permission to upload this photo.";
  }
  if (lower.includes("exceeded the maximum allowed size")) {
    return "That image is too large for storage.";
  }
  if (lower.includes("mime type") || lower.includes("not allowed")) {
    return "That file type is not accepted.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Check your connection and try again.";
  }

  return message;
}

/** The same message, shaped for the toast/alert style used across the app. */
export function uploadErrorMessage(error: unknown): string {
  return `Failed to upload. ${describeUploadError(error)}`;
}