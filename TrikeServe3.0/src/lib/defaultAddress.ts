// Customer's saved default delivery address.
//
// Stored per signed-in user in localStorage (the app uses custom localStorage
// auth rather than Supabase Auth, and the users table has no address columns).
// Cart reads this so deliveries default to it instead of forcing the customer
// to drop a pin on the map at checkout.

export interface DefaultAddress {
  name: string;
  full: string;
  lat: number;
  lng: number;
}

const storageKey = (userId?: string | null, email?: string | null) =>
  `trikeserve_default_address_${userId || email || 'guest'}`;

export function getDefaultAddress(
  userId?: string | null,
  email?: string | null
): DefaultAddress | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, email));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      (parsed.full || parsed.name)
    ) {
      return {
        name: parsed.name || parsed.full,
        full: parsed.full || parsed.name,
        lat: parsed.lat,
        lng: parsed.lng,
      };
    }
  } catch (err) {
    console.warn('[defaultAddress] Failed to read saved address:', err);
  }
  return null;
}

export function setDefaultAddress(
  address: DefaultAddress,
  userId?: string | null,
  email?: string | null
): void {
  try {
    localStorage.setItem(storageKey(userId, email), JSON.stringify(address));
  } catch (err) {
    console.warn('[defaultAddress] Failed to save address:', err);
  }
}

export function clearDefaultAddress(userId?: string | null, email?: string | null): void {
  try {
    localStorage.removeItem(storageKey(userId, email));
  } catch {}
}
