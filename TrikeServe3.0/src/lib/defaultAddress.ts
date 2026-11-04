// Customer's saved default delivery address. localStorage is the fast local
// cache; authenticated accounts also sync the full address and pin to
// user_addresses so it survives another device or a cleared browser cache.

import { supabase } from "./supabase";

export interface DefaultAddress {
  name: string;
  full: string;
  lat: number;
  lng: number;
}

const storageKey = (userId?: string | null, email?: string | null) =>
  `trikeserve_default_address_${userId || email || 'guest'}`;
const selectedDeliveryAddressKey = "trikeserve_delivery_address";

function toDefaultAddress(row: any): DefaultAddress | null {
  if (!row || row.latitude == null || row.longitude == null) return null;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(row.address || row.label)) return null;
  return {
    name: row.label || row.address,
    full: row.address || row.label,
    lat,
    lng,
  };
}

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
    localStorage.setItem(
      selectedDeliveryAddressKey,
      JSON.stringify({
        label: address.name,
        address: address.full,
        latitude: address.lat,
        longitude: address.lng,
        source: "profile",
      }),
    );
  } catch (err) {
    console.warn('[defaultAddress] Failed to save address:', err);
  }
}

/** Load the account-synced default. Local-only legacy accounts return null. */
export async function loadAccountDefaultAddress(
  userId?: string | null,
): Promise<{ address: DefaultAddress | null; error: unknown | null }> {
  if (!userId) return { address: null, error: null };
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      return authError.name === "AuthSessionMissingError"
        ? { address: null, error: null }
        : { address: null, error: authError };
    }
    if (!authData.user || authData.user.id !== userId) return { address: null, error: null };

    const { data, error } = await supabase
      .from("user_addresses")
      .select("label, address, latitude, longitude")
      .eq("user_id", userId)
      .eq("is_default", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { address: error ? null : toDefaultAddress(data), error };
  } catch (error) {
    return { address: null, error };
  }
}

type AddressSaveResult = { synced: boolean; error: unknown | null };
const pendingAddressSaves = new Map<string, Promise<AddressSaveResult>>();

/** Save or update this customer's single default address in their account. */
export function saveAccountDefaultAddress(
  address: DefaultAddress,
  userId?: string | null,
): Promise<AddressSaveResult> {
  if (!userId) return Promise.resolve({ synced: false, error: null });
  const previous = pendingAddressSaves.get(userId);
  const pending = (previous ? previous.catch(() => undefined) : Promise.resolve())
    .then(() => saveAccountDefaultAddressNow(address, userId));
  pendingAddressSaves.set(userId, pending);
  void pending.then(
    () => { if (pendingAddressSaves.get(userId) === pending) pendingAddressSaves.delete(userId); },
    () => { if (pendingAddressSaves.get(userId) === pending) pendingAddressSaves.delete(userId); },
  );
  return pending;
}

async function saveAccountDefaultAddressNow(
  address: DefaultAddress,
  userId: string,
): Promise<AddressSaveResult> {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      return authError.name === "AuthSessionMissingError"
        ? { synced: false, error: null }
        : { synced: false, error: authError };
    }
    if (!authData.user) return { synced: false, error: null };
    if (authData.user.id !== userId) {
      return { synced: false, error: new Error("The signed-in account changed. Please try again.") };
    }

    const fullAddress = (address.full || address.name).trim();
    const label = (address.name || fullAddress).trim();
    if (!fullAddress || fullAddress.length > 255 || !Number.isFinite(address.lat) || !Number.isFinite(address.lng)) {
      return { synced: false, error: new Error("The address or map pin is invalid.") };
    }

    const { data: rows, error: readError } = await supabase
      .from("user_addresses")
      .select("id, label, address, is_default")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (readError) return { synced: false, error: readError };

    const normalizedAddress = fullAddress.trim().toLowerCase().replace(/\s+/g, " ");
    const current = (rows || []).find((row: any) => row.is_default)
      || (rows || []).find((row: any) =>
        String(row.address || "").trim().toLowerCase().replace(/\s+/g, " ") === normalizedAddress,
      );
    const values = {
      label: label.slice(0, 80) || "Default delivery address",
      address: fullAddress,
      latitude: address.lat,
      longitude: address.lng,
      is_default: true,
    };
    const write = current
      ? await supabase
          .from("user_addresses")
          .update(values)
          .eq("id", current.id)
          .eq("user_id", userId)
          .select("id")
          .single()
      : await supabase
          .from("user_addresses")
          .insert({ user_id: userId, ...values })
          .select("id")
          .single();
    if (write.error || !write.data?.id) return { synced: false, error: write.error || new Error("Address save returned no row.") };

    const { error: clearError } = await supabase
      .from("user_addresses")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true)
      .neq("id", write.data.id);
    if (clearError) return { synced: false, error: clearError };

    return { synced: true, error: null };
  } catch (error) {
    return { synced: false, error };
  }
}

export function clearDefaultAddress(userId?: string | null, email?: string | null): void {
  try {
    localStorage.removeItem(storageKey(userId, email));
  } catch {}
}
