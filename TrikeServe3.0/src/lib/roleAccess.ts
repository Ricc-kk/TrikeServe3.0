import type { UserRole } from "../app/contexts/AuthContext";

/**
 * Where each role's UI lives. Shared by ProtectedRoute and RoleRedirect so the
 * two can never disagree about where a session belongs — when they did, an
 * unapproved business was redirected to /business, which redirected straight
 * back, and the loop pinned the user on a blank screen.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  customer: '/customer',
  rider: '/rider',
  business: '/business/dashboard',
  admin: '/admin',
};

/**
 * Business and rider accounts must be approved by a superadmin before their own
 * UI opens. Until that happens they are not thrown out of the app: they get the
 * customer experience, which requires their email to be verified (Supabase
 * refuses sign-in otherwise) and keeps a freshly registered shop or driver from
 * hitting a dead end while waiting.
 */
export function isAwaitingApproval(
  role: UserRole | undefined,
  isVerified: boolean | undefined,
): boolean {
  if (role !== 'business' && role !== 'rider') return false;
  return !isVerified;
}

/**
 * The role that actually governs routing. A business or rider awaiting
 * approval routes as a customer, so /business and /rider stay unreachable while
 * /customer stays reachable. The stored role is left untouched — it is what
 * superadmin approval keys off, and downgrading it in the DB would erase the
 * difference between "pending" and "not a business at all".
 */
export function effectiveRole(
  role: UserRole | undefined,
  isVerified: boolean | undefined,
): UserRole | undefined {
  return isAwaitingApproval(role, isVerified) ? 'customer' : role;
}
