/** Return a compact, readable fallback avatar from a profile name or email. */
export function getProfileInitials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0]?.trim() || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join("").toUpperCase();
  return `${Array.from(parts[0])[0]}${Array.from(parts[parts.length - 1])[0]}`.toUpperCase();
}
