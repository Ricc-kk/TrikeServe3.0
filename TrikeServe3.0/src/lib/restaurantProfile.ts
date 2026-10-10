import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import {
  PROFILE_REVIEWED_FIELDS,
  applyBusinessProfileUpdate,
  getPendingBusinessProfileUpdate,
  submitBusinessProfileUpdate,
  withdrawBusinessProfileUpdate,
  type ApprovalRequest,
  type BusinessProfileUpdate,
} from "@/lib/supabase";
import { isCuisineId } from "@/lib/foodTaxonomy";
import { useAuth } from "@/app/contexts/AuthContext";

/**
 * The one place a business's shop record is read and written.
 *
 * There used to be two editors for the same facts and they did not talk.
 * `BusinessProfile`'s "Pickup Location" called the map picker, threw the
 * latitude and longitude away, and wrote only `restaurants.address`, while
 * `BusinessHome`'s "Edit store info" wrote the coordinates through a separate
 * code path. Save the address in one screen and the pin stayed where it was;
 * move the pin in the other and the address text never changed.
 *
 * Both screens now read and write through this hook, so there is a single row,
 * a single set of values, and one save path to reason about.
 *
 * Saving is staged rather than applied (see `save`). A business proposes; the
 * Super Admin applies.
 */

/** The live row, as the storefront and the customers see it. */
export type RestaurantRecord = BusinessProfileUpdate & {
  id: string;
  is_open: boolean;
  logo_image: string | null;
  banner_image: string | null;
};

export type SaveOutcome = {
  ok: boolean;
  /** True when the change is waiting for the Super Admin, false when live. */
  staged: boolean;
  error?: string;
};

/** A shop that has never been pinned has no address worth reviewing yet. */
const isNeverPinned = (r: RestaurantRecord | null) =>
  r?.latitude == null || r?.longitude == null;

/** Only the reviewed fields travel, so an unrelated column can never be staged. */
function toPatch(values: Partial<RestaurantRecord>): BusinessProfileUpdate {
  const patch: Record<string, unknown> = {};
  for (const { key } of PROFILE_REVIEWED_FIELDS) {
    if (!(key in values)) continue;
    patch[key] = (values as Record<string, unknown>)[key];
  }
  return patch as BusinessProfileUpdate;
}

export function useRestaurantProfile() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<RestaurantRecord | null>(null);
  const [pending, setPending] = useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const businessUserId = user?.id ?? null;

  // Three business screens mount this hook at once (Overview, Shop, Menu), and
  // each used to be able to decide for itself that no shop row existed. Two
  // inserts racing means two shops for one owner, with the menu, orders and
  // the customer's storefront split across them. One in-flight attempt, and a
  // lookup before inserting rather than assuming.
  const ensureInFlight = useRef<Promise<RestaurantRecord | null> | null>(null);

  const load = useCallback(async () => {
    if (!businessUserId) {
      setRestaurant(null);
      setLoading(false);
      return;
    }
    try {
      const { data, error: loadError } = await supabase
        .from("restaurants")
        .select(
          "id, name, subtitle, address, latitude, longitude, cuisine, delivery_time, operating_hours, is_open, logo_image, banner_image",
        )
        .eq("business_user_id", businessUserId)
        .maybeSingle();

      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setRestaurant({
          ...(data as unknown as RestaurantRecord),
          cuisine: Array.isArray(data.cuisine) ? data.cuisine.filter(isCuisineId) : [],
        });
      } else {
        setRestaurant(null);
      }
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [businessUserId]);

  const loadPending = useCallback(async (restaurantId: string | undefined) => {
    if (!restaurantId) {
      setPending(null);
      return;
    }
    const { request } = await getPendingBusinessProfileUpdate(restaurantId);
    setPending(request);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPending(restaurant?.id);
  }, [restaurant?.id, loadPending]);

  /**
   * Create the row on first use.
   *
   * `restaurants` is not created at sign-up, so every entry point that needs
   * one used to insert its own half-built copy with whichever subset of columns
   * that screen happened to know about -- which is how a shop ended up with a
   * name and nothing else. One creator, seeded from the registration answers.
   */
  const ensureRestaurant = useCallback(async (): Promise<RestaurantRecord | null> => {
    if (restaurant) return restaurant;
    if (!businessUserId) return null;
    if (ensureInFlight.current) return ensureInFlight.current;

    ensureInFlight.current = (async () => {
      // Re-read rather than trusting `restaurant`, which is still null on the
      // first render: a shop that already exists has to be found, not duplicated.
      const { data: existing } = await supabase
        .from("restaurants")
        .select(
          "id, name, subtitle, address, latitude, longitude, cuisine, delivery_time, operating_hours, is_open, logo_image, banner_image",
        )
        .eq("business_user_id", businessUserId)
        .maybeSingle();

      if (existing) {
        setRestaurant(existing as unknown as RestaurantRecord);
        return existing as unknown as RestaurantRecord;
      }

      const seed = {
        name: user?.businessName || user?.name || "My Restaurant",
        address: (user as { businessAddress?: string })?.businessAddress || "",
        // Declared at sign-up when the owner picked "What we serve"; without
        // this a new shop is invisible to every customer cuisine filter until
        // someone opens the settings modal.
        cuisine: Array.isArray(user?.businessCuisine)
          ? user.businessCuisine.filter(isCuisineId)
          : [],
      };

      // The pin placed during sign-up. It lives in the localStorage seed rather
      // than on `users`, which has no coordinate columns -- without this a new
      // shop's map opens on the default city centre instead of the address it
      // chose while registering.
      let seedPin: { latitude: number; longitude: number } | null = null;
      try {
        const raw = localStorage.getItem(`restaurantData_${user?.email || ""}`);
        const parsed = raw ? JSON.parse(raw) : null;
        if (typeof parsed?.latitude === "number" && typeof parsed?.longitude === "number") {
          seedPin = { latitude: parsed.latitude, longitude: parsed.longitude };
        }
      } catch {
        // Malformed seed: the shop simply starts without a pin.
      }

      const { data, error: insertError } = await supabase
        .from("restaurants")
        .insert({
          name: seed.name,
          business_user_id: businessUserId,
          address: seed.address,
          phone: user?.phone || "",
          rating: 5.0,
          is_open: true,
          cuisine: seed.cuisine,
          created_at: new Date().toISOString(),
          ...(seedPin ? { latitude: seedPin.latitude, longitude: seedPin.longitude } : {}),
        })
        .select()
        .single();

      if (insertError || !data) {
        setError(insertError?.message || "Could not create the shop record");
        return null;
      }

      const created = {
        ...(data as unknown as RestaurantRecord),
        ...seed,
        id: data.id,
      };
      setRestaurant(created);
      return created;
    })();

    try {
      return await ensureInFlight.current;
    } finally {
      ensureInFlight.current = null;
    }
  }, [restaurant, businessUserId, user]);

  /**
   * Save a change.
   *
   * The first map pin applies immediately. A shop that has never been pinned
   * has no live address for the change to be reviewed against, and requiring an
   * approval to say "I am here" would leave it unplaceable and sorting last in
   * every "near you" list forever. Every change after that is staged.
   */
  const save = useCallback(
    async (patch: Partial<RestaurantRecord>): Promise<SaveOutcome> => {
      if (!businessUserId) return { ok: false, staged: false, error: "Not signed in" };
      setSaving(true);
      setError(null);

      try {
        const current = await ensureRestaurant();
        if (!current) {
          return { ok: false, staged: false, error: error ?? "Could not open the shop record" };
        }

        const after: BusinessProfileUpdate = {
          ...toPatch(current),
          ...toPatch(patch),
          restaurant_id: current.id,
          business_user_id: businessUserId,
        };

        if (isNeverPinned(current)) {
          const applied = await applyBusinessProfileUpdate(after);
          if (!applied.success) {
            setError(applied.error ?? null);
            return { ok: false, staged: false, error: applied.error };
          }
          await load();
          return { ok: true, staged: false };
        }

        const submitted = await submitBusinessProfileUpdate({
          restaurantId: current.id,
          businessUserId,
          before: { ...toPatch(current), restaurant_id: current.id },
          after,
          requestedByEmail: user?.email,
          requestedByName: user?.businessName || user?.name,
        });

        if (!submitted.success) {
          setError(submitted.error ?? null);
          return { ok: false, staged: true, error: submitted.error };
        }

        await loadPending(current.id);
        return { ok: true, staged: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not save the shop profile";
        setError(message);
        return { ok: false, staged: false, error: message };
      } finally {
        setSaving(false);
      }
    },
    [businessUserId, ensureRestaurant, load, loadPending, user, error],
  );

  /** Take a staged change back before the Super Admin acts on it. */
  const withdraw = useCallback(async (): Promise<SaveOutcome> => {
    if (!pending) return { ok: true, staged: false };
    setSaving(true);
    const result = await withdrawBusinessProfileUpdate(pending.id);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? null);
      return { ok: false, staged: true, error: result.error };
    }
    setPending(null);
    return { ok: true, staged: false };
  }, [pending]);

  /** The values a staged change proposes, or null when nothing is queued. */
  const pendingValues = pendingValuesOf(pending);

  return {
    restaurant,
    restaurantId: restaurant?.id ?? null,
    /**
     * The one name to show for this shop, everywhere.
     *
     * `restaurants.name` is the shop as the customers see it; `users.business_name`
     * is a copy of it. Screens that used the copy went stale whenever the row was
     * renamed from the other end, so they now read this instead of reaching for
     * either column themselves.
     *
     * Falls back to the copy only while the shop row has not loaded, so the first
     * paint is never blank.
     */
    shopName:
      restaurant?.name?.trim() ||
      user?.businessName?.trim() ||
      user?.name?.trim() ||
      "My Restaurant",
    pending,
    pendingValues,
    hasPending: pending != null,
    loading,
    saving,
    error,
    save,
    withdraw,
    reload: load,
    ensureRestaurant,
  };
}

/**
 * Unwrap the proposed values from the approval row.
 *
 * Tolerates a payload without an `after` block: a row written before this
 * shape existed must render as "unknown" rather than crash the screen that
 * displays it.
 */
export function pendingValuesOf(
  pending: ApprovalRequest | null,
): BusinessProfileUpdate | null {
  if (!pending?.payload) return null;
  const payload = pending.payload as { after?: BusinessProfileUpdate } | null;
  return payload?.after ?? null;
}
