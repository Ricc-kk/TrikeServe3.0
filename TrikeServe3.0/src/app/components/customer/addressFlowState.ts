import type { LatLng } from "@/lib/distance";

/**
 * The pin the customer is part-way through saving.
 *
 * The add-address flow is four screens, so the chosen point has to survive
 * three navigations. Router state alone is not enough: on Android the hardware
 * back button and then a forward tap re-mounts the page with no state, and a
 * refresh does the same. sessionStorage keeps an in-progress address on screen
 * instead of dropping the customer back onto an empty map.
 *
 * This is deliberately not the delivery address. That only changes when the
 * customer picks one from the list or presses Select.
 */
export type AddressDraft = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

const DRAFT_KEY = "trikeserve_pending_address";

export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  address: "",
  latitude: null,
  longitude: null,
};

export function hasPin(draft: AddressDraft): boolean {
  return draft.latitude != null && draft.longitude != null;
}

export function readAddressDraft(): AddressDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_ADDRESS_DRAFT;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_ADDRESS_DRAFT;
    return {
      address: typeof parsed.address === "string" ? parsed.address : "",
      latitude: typeof parsed.latitude === "number" ? parsed.latitude : null,
      longitude: typeof parsed.longitude === "number" ? parsed.longitude : null,
    };
  } catch {
    return EMPTY_ADDRESS_DRAFT;
  }
}

export function writeAddressDraft(draft: AddressDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A full sessionStorage must not break the flow; the router state carries it.
  }
}

export function clearAddressDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clean up.
  }
}

/**
 * The street on its own, which is the part a person recognises.
 *
 * "4397 L. Bernardino Street, Gen T Deleon, Valenzuela City" is unreadable in a
 * one-line field; the street is what they scan for. Falls back to the first
 * comma-separated segment when the address carries no house number.
 */
export function streetOf(formatted: string): string {
  const first = formatted.split(",")[0]?.trim() ?? "";
  if (!first) return formatted;
  const withoutNumber = first.replace(/^\d+[A-Za-z]?\s*/, "").trim();
  return withoutNumber || first;
}

/** Everything after the street segment, for the second line of a result. */
export function restOfAddress(formatted: string): string {
  return formatted.split(",").slice(1).join(",").trim();
}

/** Where the map opens when nothing better is known. */
export const FALLBACK_CENTER: LatLng = { lat: 14.7294, lng: 120.9349 };
