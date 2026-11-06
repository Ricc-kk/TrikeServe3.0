export const SUPER_ADMIN_EMAIL = "trikeserveadmin@gmail.com";

export function isSuperAdminEmail(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}
