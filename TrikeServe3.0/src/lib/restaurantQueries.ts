import { supabase } from "../utils/supabase";

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
};

const FULL_COLUMNS =
  "id, name, address, rating, is_open, banner_image, logo_image, subtitle, delivery_time, operating_hours, business_user_id, cuisine, latitude, longitude";

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
 * Loads restaurants, retrying without the new columns when the migration has
 * not been run. `hasLocationColumns` reports which shape came back so the UI
 * can explain a missing distance instead of hiding it.
 */
export async function fetchRestaurants(limit?: number): Promise<{
  rows: RestaurantRow[];
  error: any;
  hasLocationColumns: boolean;
}> {
  const applyLimit = (query: any) => (limit ? query.limit(limit) : query);

  const first = await applyLimit(
    supabase.from("restaurants").select(FULL_COLUMNS).order("name"),
  );

  if (!first.error) {
    return {
      rows: (first.data || []).map(normalize),
      error: null,
      hasLocationColumns: true,
    };
  }

  if (!isMissingColumnError(first.error)) {
    return { rows: [], error: first.error, hasLocationColumns: false };
  }

  const legacy = await applyLimit(
    supabase.from("restaurants").select(LEGACY_COLUMNS).order("name"),
  );
  if (legacy.error) {
    return { rows: [], error: legacy.error, hasLocationColumns: false };
  }

  return {
    rows: (legacy.data || []).map(normalize),
    error: null,
    hasLocationColumns: false,
  };
}

function normalize(row: any): RestaurantRow {
  return {
    id: row.id,
    name: row.name,
    address: row.address || "",
    rating: Number(row.rating) || 0,
    is_open: row.is_open !== false,
    banner_image: row.banner_image ?? null,
    logo_image: row.logo_image ?? null,
    subtitle: row.subtitle ?? null,
    delivery_time: row.delivery_time ?? null,
    operating_hours: row.operating_hours ?? null,
    business_user_id: row.business_user_id ?? null,
    cuisine: Array.isArray(row.cuisine) ? row.cuisine : [],
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  };
}