import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase, supabaseHelpers } from "@/lib/supabase";
import { hasCoords, type LatLng } from "@/lib/distance";
import { describeCoordinates, reverseGeocodePosition } from "@/lib/reverseGeocode";
import { useAuth } from "./AuthContext";

/**
 * The customer's delivery address.
 *
 * There was no address storage anywhere before this -- no table, no local key --
 * so the food section could only hardcode a service-area name and the customer
 * had no way to say where they want the food brought. This owns the whole
 * lifecycle: pick one, remember recent ones, save named places, edit and remove.
 */

export type SavedAddress = {
  id: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at?: string;
};

export type DeliveryAddress = {
  /** Present when the address came from `user_addresses`. */
  id?: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Where this address came from, so the UI can explain it. */
  source: "profile" | "saved" | "recent" | "device";
};

const SELECTED_KEY = "trikeserve_delivery_address";
const RECENT_KEY = "trikeserve_recent_addresses";
const DEVICE_KEY = "trikeserve_device_location";
const RECENT_LIMIT = 5;

/** Same address text = same place; addresses come back in many spellings. */
const normalize = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

function readRecent(): DeliveryAddress[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecent(list: DeliveryAddress[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)));
  } catch {
    // A full or unavailable localStorage must not break ordering.
  }
}

/**
 * Where the device currently is, as a delivery address.
 *
 * This is the default "Deliver to" value: a customer who has never chosen an
 * address should see the place they are standing, not an empty prompt. It is
 * resolved once and cached, because the header, the food list and checkout each
 * build their own instance of this hook and would otherwise fire three separate
 * permission prompts for the same fix.
 *
 * Cached rather than re-requested because a delivery destination should not move
 * under the customer mid-session: someone who walks to the corner should still
 * see the address they ordered from. Selecting a different address overwrites it
 * for good — that is the "until changed" part.
 */
type CachedDeviceLocation = { address: DeliveryAddress; at: number };

let deviceLocationCache: CachedDeviceLocation | null = null;
let deviceLocationRequest: Promise<DeliveryAddress | null> | null = null;

function readCachedDeviceLocation(): DeliveryAddress | null {
  if (deviceLocationCache) return deviceLocationCache.address;
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CachedDeviceLocation;
      if (parsed?.address?.address) {
        deviceLocationCache = parsed;
        return parsed.address;
      }
    }
  } catch {
    // Fall through to asking the device.
  }
  return null;
}

function writeCachedDeviceLocation(address: DeliveryAddress) {
  const entry: CachedDeviceLocation = { address, at: Date.now() };
  deviceLocationCache = entry;
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(entry));
  } catch {
    // The in-memory cache still serves this session.
  }
}

function resolveDeviceLocation(): Promise<DeliveryAddress | null> {
  // One in-flight request shared by every caller, so three mounted screens
  // produce one permission prompt and one geocode.
  if (deviceLocationRequest) return deviceLocationRequest;
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  deviceLocationRequest = new Promise<DeliveryAddress | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        // A street name is worth one request: "Deliver to 123 Mabini St" is
        // something the customer can check, coordinates are not.
        const place = await reverseGeocodePosition(latitude, longitude);
        const address: DeliveryAddress = {
          label: place?.name || "Current location",
          address: place?.full || describeCoordinates(latitude, longitude),
          latitude,
          longitude,
          source: "device",
        };
        writeCachedDeviceLocation(address);
        resolve(address);
      },
      () => resolve(null),
      // Cached by the browser for five minutes, so revisiting a screen does not
      // re-open GPS for a value that has not moved.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }).finally(() => {
    deviceLocationRequest = null;
  });

  return deviceLocationRequest;
}

export function useDeliveryAddress() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [recent, setRecent] = useState<DeliveryAddress[]>(() => readRecent());
  const [selected, setSelected] = useState<DeliveryAddress | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Where the device is, used only when the customer has not chosen an address.
   *
   * Separate from `selected` on purpose. This one is ours, not theirs: it must
   * never displace an address they picked, and picking one has to survive for as
   * long as they do not change it again.
   */
  const [deviceLocation, setDeviceLocation] = useState<DeliveryAddress | null>(
    () => readCachedDeviceLocation(),
  );
  const [locating, setLocating] = useState(false);

  const profileDefault = useMemo<DeliveryAddress | null>(() => {
    if (!user?.address) return null;
    return {
      label: "My address",
      address: user.address,
      latitude: null,
      longitude: null,
      source: "profile",
    };
  }, [user?.address]);

  // A restored selection wins, then a saved place, then the profile address.
  const initial = useMemo<DeliveryAddress | null>(() => {
    try {
      const raw = localStorage.getItem(SELECTED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.address) return parsed as DeliveryAddress;
      }
    } catch {
      // Fall through to the defaults below.
    }
    const fromRecent = readRecent()[0];
    if (fromRecent) return fromRecent;
    return profileDefault;
  }, [profileDefault]);

  const loadSaved = useCallback(async () => {
    if (!user?.id) {
      setSaved([]);
      return;
    }
    const { data } = await supabaseHelpers.getSavedAddresses(user.id);
    setSaved((data || []) as SavedAddress[]);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSelected((current) => current ?? initial);
      await loadSaved();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial, loadSaved]);

  /*
   * Resolve the device position, but only while nothing has been chosen.
   *
   * The guard is the whole point of this effect: `initial` is null until a stored
   * selection, a recent one or a profile address exists, so a customer who has
   * picked an address never triggers a permission prompt and never has their
   * choice silently replaced by wherever they happen to be standing.
   *
   * The resolved position is deliberately not written through `persistSelection`.
   * It is the fallback, not the choice — recording it there would make it
   * indistinguishable from a deliberate address and it would then survive as the
   * selection after they moved, which is the bug this avoids.
   */
  useEffect(() => {
    if (selected || deviceLocation) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    setLocating(true);
    resolveDeviceLocation()
      .then((address) => {
        if (cancelled) return;
        setDeviceLocation(address);
        setLocating(false);
      })
      .catch(() => {
        // Denied or unavailable. The screens fall back to an honest prompt to set
        // an address, which is more use than a spinner that has given up.
        if (!cancelled) setLocating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, deviceLocation]);

  const remember = useCallback((address: DeliveryAddress) => {
    setRecent((current) => {
      const deduped = current.filter(
        (r) => normalize(r.address) !== normalize(address.address),
      );
      const next = [{ ...address, source: "recent" as const }, ...deduped];
      writeRecent(next);
      return next;
    });
  }, []);

  /**
   * Persist the live selection everywhere it is read from.
   *
   * This is the whole bug the address screens had. `selected` is React state
   * inside whichever screen asked for the hook, and FoodHome, the restaurant
   * page and the address list each build their own instance. On mount every one
   * of them reads localStorage, not another instance. So an edit that only
   * called setSelected updated the list you were looking at and was silently
   * gone the moment you navigated back -- the "Your location" header went back
   * to the old address with no error anywhere.
   */
  const persistSelection = useCallback((address: DeliveryAddress | null) => {
    setSelected(address);
    try {
      if (address) {
        localStorage.setItem(SELECTED_KEY, JSON.stringify(address));
      } else {
        localStorage.removeItem(SELECTED_KEY);
      }
    } catch {
      // A full or unavailable localStorage must not break the selection.
    }
  }, []);

  const selectAddress = useCallback(
    (address: DeliveryAddress) => {
      persistSelection(address);
      remember(address);
    },
    [remember, persistSelection],
  );

  const saveAddress = useCallback(
    async (input: {
      label: string;
      address: string;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      // The row is written under `auth.uid()`: both the RLS policy
      // ("Users can add own addresses") and the foreign key to users(id) check
      // it. The profile object can carry something else entirely — a legacy
      // localStorage account gets `legacy-<timestamp>` — and that id exists in
      // neither, so the insert was rejected for every such customer while the
      // UI showed only "could not save".
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? user?.id;
      if (!userId) return { data: null, error: "Not signed in" };
      const result = await supabaseHelpers.addSavedAddress({
        userId,
        label: input.label.trim() || "Saved place",
        address: input.address,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      });
      if (!result.error) {
        await loadSaved();
        if (result.data) {
          selectAddress({
            id: result.data.id,
            label: result.data.label,
            address: result.data.address,
            latitude: result.data.latitude,
            longitude: result.data.longitude,
            source: "saved",
          });
        }
      }
      return result;
    },
    [user?.id, loadSaved, selectAddress],
  );

  const updateAddress = useCallback(
    async (
      addressId: string,
      patch: {
        label?: string;
        address?: string;
        latitude?: number | null;
        longitude?: number | null;
      },
    ) => {
      const result = await supabaseHelpers.updateSavedAddress(addressId, patch);
      if (!result.error) {
        await loadSaved();
        setSelected((current) => {
          if (current?.id !== addressId) return current;
          return {
            ...current,
            label: patch.label ?? current.label,
            address: patch.address ?? current.address,
            latitude: patch.latitude ?? current.latitude,
            longitude: patch.longitude ?? current.longitude,
          };
        });

        // The edited row is also the delivery address, so the change has to
        // reach the header -- and the recent list, which the address screen
        // shows at the top and which would otherwise offer the old text back
        // as a one-tap delivery destination.
        const edited = (result.data || null) as SavedAddress | null;
        if (edited) {
          const next: DeliveryAddress = {
            id: edited.id,
            label: edited.label,
            address: edited.address,
            latitude: edited.latitude,
            longitude: edited.longitude,
            source: "saved",
          };
          try {
            const raw = localStorage.getItem(SELECTED_KEY);
            const current = raw ? (JSON.parse(raw) as DeliveryAddress) : null;
            if (current?.id === addressId) {
              localStorage.setItem(SELECTED_KEY, JSON.stringify(next));
            }
          } catch {
            // Not being able to read the stored selection is not fatal.
          }
          setRecent((current) => {
            const deduped = current.filter(
              (r) => normalize(r.address) !== normalize(next.address) && r.id !== next.id,
            );
            const written = [{ ...next, source: "recent" as const }, ...deduped];
            writeRecent(written);
            return written;
          });
        }
      }
      return result;
    },
    [loadSaved],
  );

  const removeAddress = useCallback(
    async (addressId: string) => {
      const result = await supabaseHelpers.deleteSavedAddress(addressId);
      if (!result.error) {
        await loadSaved();
        // Deleting the address that is currently the delivery destination has to
        // clear the stored selection too, or the header goes on naming a row
        // that no longer exists.
        if (selected?.id === addressId) {
          persistSelection(profileDefault ?? recent[0] ?? null);
        }
        setRecent((current) => {
          const remaining = current.filter((r) => r.id !== addressId);
          if (remaining.length !== current.length) writeRecent(remaining);
          return remaining;
        });
      }
      return result;
    },
    [loadSaved, profileDefault, recent, selected, persistSelection],
  );

  const clearSelected = useCallback(() => {
    persistSelection(null);
  }, [persistSelection]);

  /**
 * What "Deliver to" shows.
 *
 * The chosen address wins outright. Only when there is none does the device
 * position stand in, so the customer always sees somewhere real rather than an
 * empty prompt — and once they choose, the choice holds until they change it.
 */
const effective = selected ?? deviceLocation;

const origin = useMemo<LatLng | null>(() => {
  if (effective && hasCoords(effective)) {
    return { lat: Number(effective.latitude), lng: Number(effective.longitude) };
  }
  return null;
}, [effective]);

  const hasSaved = saved.length > 0;

  return {
    /** The chosen address, or the device position when nothing has been chosen. */
    address: effective,
    /** True only when `address` is the device position rather than a choice. */
    isDeviceDefault: !selected && !!deviceLocation,
    /** True while the device position is still being resolved. */
    locating,
    origin,
    saved,
    recent,
    hasSaved,
    loading,
    selectAddress,
    saveAddress,
    updateAddress,
    removeAddress,
    clearSelected,
    reloadSaved: loadSaved,
  };
}

export type DeliveryAddressApi = ReturnType<typeof useDeliveryAddress>;