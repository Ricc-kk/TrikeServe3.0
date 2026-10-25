/** Return the first-name initial for a fallback profile avatar. */
export function getProfileInitials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0]?.trim() || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return Array.from(parts[0])[0]?.toLocaleUpperCase() || "?";
}
