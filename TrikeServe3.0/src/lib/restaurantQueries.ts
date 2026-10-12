import { supabase } from "../utils/supabase";
import { isEffectivelyOpen } from "./shopHours";

/**
 * Reading restaurants, tolerating a database that has not been migrated yet.
 *
 * `cuisine`, `latitude` and `longitude` arrive with
 * ADD_RESTAURANT_CUISINE_AND_LOCATION.sql. Until that is applied, PostgREST
 * rejects the whole SELECT with a 400 for an unknown column -- which would
 * leave the customer staring at "No restaurants yet" while their food is right
 * there in the database.
 *
 * So: ask for the new columns, and on a missing-column error fall back to the
 * legacy set. The feature switches itself on the moment the migration runs,
 * with no code change.
 */

export type RestaurantRow = {
  id: string;
  name: string;
  address: string;
  rating: number;
  is_open: boolean;
  banner_image: string | null;
  logo_image: string | null;
  subtitle: string | null;
  delivery_time: string | null;
  operating_hours: string | null;
  business_user_id: string | null;
  cuisine: string[];
  latitude: number | null;
  longitude: number | null;
  /** From ADD_SHOP_HOURS.sql. Null until that migration has been run. */
  open_time: string | null;
  close_time: string | null;
  open_days: number[] | null;
  /** From ADD_SHOP_FORCE_OPEN.sql. Trading regardless of hours until this. */
  force_open_until: string | null;
};

const FULL_COLUMNS =
  "id, name, address, rating, is_open, banner_image, logo_image, subtitle, delivery_time, operating_hours, business_user_id, cuisine, latitude, longitude, open_time, close_time, open_days, force_open_until";

/*
 * Trading hours only, for a project that has run ADD_SHOP_HOURS.sql but not yet
 * ADD_SHOP_FORCE_OPEN.sql.
 *
 * Needed as its own step. Selecting a column the project does not have fails the
 * *entire* query, not just that field, so jumping straight from "hours too" to
 * "neither" would silently cost someone their schedule: their shops would go
 * back to following the manual switch alone, which is the bug the hours
 * migration exists to fix.
 */
const HOURS_COLUMNS =
  "id, name, address, rating, is_open, banner_image, logo_image, subtitle, delivery_time, operating_hours, business_user_id, cuisine, latitude, longitude, open_time, close_time, open_days";

/*
 * Before ADD_SHOP_HOURS.sql. `is_open` alone is all there is, which is exactly
 * how the app behaved before the schedule existed — so an un-migrated database
 * degrades to the old behaviour rather than to "every shop closed".
 */
const LEGACY_COLUMNS =
  "id, name, address, rating, is_open, banner_image, logo_image, subtitle, delivery_time, operating_hours, business_user_id";

/** PostgREST reports an unknown column as PGRST204, or 42703 from Postgres. */
export function isMissingColumnError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "PGRST204" || code === "42703") return true;
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("column") &&
    (message.includes("does not exist") || message.includes("could not find"))
  );
}

/**
 * Loads restaurants, retrying without the newer columns when the migration has
 * not been run. `hasLocationColumns` reports which shape came back so the UI can
 * explain a missing distance instead of hiding it.
 *
 * Steps down one optional group at a time rather than all-or-nothing, so a
 * project partway through the migrations keeps the features it does have. The
 * extra round trip only happens on a database that needs it.
 */
export async function fetchRestaurants(limit?: number): Promise<{
  rows: RestaurantRow[];
  error: any;
  hasLocationColumns: boolean;
}> {
  const applyLimit = (query: any) => (limit ? query.limit(limit) : query);

  for (const columns of [FULL_COLUMNS, HOURS_COLUMNS, LEGACY_COLUMNS]) {
    const attempt = await applyLimit(
      supabase.from("restaurants").select(columns).order("name"),
    );

    if (!attempt.error) {
      return {
        rows: (attempt.data || []).map(normalize),
        error: null,
        hasLocationColumns: columns !== LEGACY_COLUMNS,
      };
    }

    // Anything other than a missing column will not be fixed by trying fewer of
    // them, so stop and report it rather than burning the remaining attempts.
    if (!isMissingColumnError(attempt.error)) {
      return { rows: [], error: attempt.error, hasLocationColumns: false };
    }
  }

  return { rows: [], error: null, hasLocationColumns: false };
}

function normalize(row: any): RestaurantRow {
  const openTime = row.open_time ?? null;
  const closeTime = row.close_time ?? null;
  const openDays = Array.isArray(row.open_days) ? row.open_days : null;

  return {
    id: row.id,
    name: row.name,
    address: row.address || "",
    rating: Number(row.rating) || 0,
    /*
     * The customer's view of "open".
     *
     * Not `is_open` on its own: that is the owner's switch, and it lies after
     * closing time because nobody came back to flip it. With a schedule set the
     * shop closes itself, which is the whole reason the shop was asked for its
     * hours. With no schedule, this falls back to the switch exactly as before.
     */
    is_open: isEffectivelyOpen({
      is_open: row.is_open,
      open_time: openTime,
      close_time: closeTime,
      open_days: openDays,
      force_open_until: row.force_open_until ?? null,
    }),
    banner_image: row.banner_image ?? null,
    logo_image: row.logo_image ?? null,
    subtitle: row.subtitle ?? null,
    delivery_time: row.delivery_time ?? null,
    operating_hours: row.operating_hours ?? null,
    business_user_id: row.business_user_id ?? null,
    cuisine: Array.isArray(row.cuisine) ? row.cuisine : [],
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    open_time: openTime,
    close_time: closeTime,
    open_days: openDays,
    force_open_until: row.force_open_until ?? null,
  };
}