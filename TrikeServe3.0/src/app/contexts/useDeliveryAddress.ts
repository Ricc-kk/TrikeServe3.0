import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseHelpers } from "@/lib/supabase";
import { hasCoords, type LatLng } from "@/lib/distance";
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
  source: "profile" | "saved" | "recent";
};

const SELECTED_KEY = "trikeserve_delivery_address";
const RECENT_KEY = "trikeserve_recent_addresses";
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

export function useDeliveryAddress() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [recent, setRecent] = useState<DeliveryAddress[]>(() => readRecent());
  const [selected, setSelected] = useState<DeliveryAddress | null>(null);
  const [loading, setLoading] = useState(true);

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

  const selectAddress = useCallback(
    (address: DeliveryAddress) => {
      setSelected(address);
      remember(address);
      try {
        localStorage.setItem(SELECTED_KEY, JSON.stringify(address));
      } catch {
        // Selection still applies for this session.
      }
    },
    [remember],
  );

  const saveAddress = useCallback(
    async (input: {
      label: string;
      address: string;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      if (!user?.id) return { data: null, error: "Not signed in" };
      const result = await supabaseHelpers.addSavedAddress({
        userId: user.id,
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
      patch: { label?: string; address?: string },
    ) => {
      const result = await supabaseHelpers.updateSavedAddress(addressId, patch);
      if (!result.error) {
        await loadSaved();
        setSelected((current) =>
          current?.id === addressId
            ? {
                ...current,
                label: patch.label ?? current.label,
                address: patch.address ?? current.address,
              }
            : current,
        );
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
        setSelected((current) => {
          if (current?.id !== addressId) return current;
          return profileDefault ?? recent[0] ?? null;
        });
      }
      return result;
    },
    [loadSaved, profileDefault, recent],
  );

  const clearSelected = useCallback(() => {
    setSelected(null);
    try {
      localStorage.removeItem(SELECTED_KEY);
    } catch {
      // Nothing to clean up.
    }
  }, []);

  /** Where restaurants should be measured from, when we know where "here" is. */
  const origin = useMemo<LatLng | null>(() => {
    if (selected && hasCoords(selected)) {
      return { lat: Number(selected.latitude), lng: Number(selected.longitude) };
    }
    return null;
  }, [selected]);

  const hasSaved = saved.length > 0;

  return {
    address: selected,
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