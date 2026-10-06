import type { LucideIcon } from "lucide-react";
import {
  Beef,
  CakeSlice,
  Carrot,
  Coffee,
  Croissant,
  CupSoda,
  Drumstick,
  EggFried,
  Fish,
  Ham,
  Milk,
  Popcorn,
  Soup,
  Sandwich,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";

/**
 * The one food taxonomy.
 *
 * This used to live inside FoodCategoryRail and was derived by matching
 * `menu_items.category`, which made "Ihawan" mean "sells something categorised
 * chicken" rather than "is an ihawan" -- and "Kafe" and "Malamig" both matched
 * `drinks`, so those two filters could never differ.
 *
 * It now lives here, shared by:
 *  - the business sign-up form and the "What we serve" picker, which write
 *    `restaurants.cuisine`
 *  - the customer filter rail, which matches on that declared value
 *
 * `legacyMenuCategories` remains only as a fallback for shops that have not
 * declared a cuisine yet, so nothing disappears mid-migration.
 */
export type CuisineId =
  | "filipino"
  | "chicken"
  | "beef"
  | "pork"
  | "seafood"
  | "vegetable"
  | "rice"
  | "noodles"
  | "bread"
  | "desserts"
  | "breakfast"
  | "sandwiches"
  | "fried"
  | "beverages"
  | "milk_tea"
  | "coffee";

export type Cuisine = {
  id: CuisineId;
  label: string;
  filipino: string;
  Icon: LucideIcon;
  /** One line shown to a business explaining what belongs in this bucket. */
  blurb: string;
  /** `menu_items.category` values used only as a pre-migration fallback. */
  legacyMenuCategories: string[];
};

/**
 * What a shop serves, as food types.
 *
 * The previous seven were shop *archetypes* -- silugan, ihawan, karinderya --
 * which is how Filipinos describe a place, but they only cover a silog shop. A
 * milk tea stall, a bakery and a barbecue place had nowhere to go, so "drinks"
 * was filed under "Malamig" and the filter rail carried a claim the data never
 * supported.
 *
 * Food types cover every shop, and they are what a customer actually searches
 * for. The archetypes survive in `CUISINE_MIGRATION`, so an existing ihawan
 * becomes a chicken shop rather than losing its filter match.
 */
export const CUISINES: Cuisine[] = [
  {
    id: "filipino",
    label: "Filipino",
    filipino: "Pinoy",
    Icon: UtensilsCrossed,
    blurb: "Lutong bahay, classics, family recipes",
    legacyMenuCategories: ["filipino", "lutong-bahay", "filipino-food"],
  },
  {
    id: "chicken",
    label: "Chicken",
    filipino: "Manok",
    Icon: Drumstick,
    blurb: "Fried chicken, grilled, chicken combos",
    legacyMenuCategories: ["chicken"],
  },
  {
    id: "beef",
    label: "Beef",
    filipino: "Baka",
    Icon: Beef,
    blurb: "Beef dishes, steaks, bullohon",
    legacyMenuCategories: ["beef"],
  },
  {
    id: "pork",
    label: "Pork",
    filipino: "Baboy",
    Icon: Ham,
    blurb: "Pork chops, liempo, lechon",
    legacyMenuCategories: ["pork"],
  },
  {
    id: "seafood",
    label: "Seafood",
    filipino: "Isda",
    Icon: Fish,
    blurb: "Fish, shellfish, seafood plates",
    legacyMenuCategories: ["seafood"],
  },
  {
    id: "vegetable",
    label: "Vegetables",
    filipino: "Gulay",
    Icon: Carrot,
    blurb: "Vegetable dishes, salads, veggie meals",
    legacyMenuCategories: ["vegetable", "vegetables", "salad", "gulay"],
  },
  {
    id: "rice",
    label: "Rice Meals",
    filipino: "Sinangag",
    Icon: Wheat,
    blurb: "Rice meals, ulam, silog combos",
    legacyMenuCategories: ["silog", "rice", "rice-meals"],
  },
  {
    id: "noodles",
    label: "Noodles",
    filipino: "Pasta",
    Icon: Soup,
    blurb: "Pancit, pasta, noodle soups",
    legacyMenuCategories: ["noodles", "pasta", "noodle"],
  },
  {
    id: "bread",
    label: "Bread & Bakery",
    filipino: "Pan",
    Icon: Croissant,
    blurb: "Bread, pastries, baked goods",
    legacyMenuCategories: ["bakery", "bread", "pastry"],
  },
  {
    id: "desserts",
    label: "Desserts",
    filipino: "Matamis",
    Icon: CakeSlice,
    blurb: "Cakes, sweets, ice cream",
    legacyMenuCategories: ["desserts", "dessert", "sweets"],
  },
  {
    id: "breakfast",
    label: "Breakfast",
    filipino: "Agahan",
    Icon: EggFried,
    blurb: "Breakfast plates, tapsilog, morning sets",
    legacyMenuCategories: ["breakfast", "tapsilog", "brunch"],
  },
  {
    id: "sandwiches",
    label: "Sandwiches",
    filipino: "Sandwich",
    Icon: Sandwich,
    blurb: "Burgers, sandwiches, quick service",
    legacyMenuCategories: ["fastfood", "burger", "sandwiches", "sandwich"],
  },
  {
    id: "fried",
    label: "Fried Food",
    filipino: "Prrito",
    Icon: Popcorn,
    blurb: "Fries, fried snacks, crispy sides",
    legacyMenuCategories: ["fried", "snacks", "fries"],
  },
  {
    id: "beverages",
    label: "Beverages",
    filipino: "Inumin",
    Icon: CupSoda,
    blurb: "Cold drinks, refreshments, juices",
    legacyMenuCategories: ["drinks", "beverages", "juice"],
  },
  {
    id: "milk_tea",
    label: "Milk Tea",
    filipino: "Milk Tea",
    Icon: Milk,
    blurb: "Milk tea, shakes, frappe",
    legacyMenuCategories: ["milk-tea", "milktea", "shakes"],
  },
  {
    id: "coffee",
    label: "Coffee",
    filipino: "Kape",
    Icon: Coffee,
    blurb: "Coffee, espresso, tea",
    legacyMenuCategories: ["coffee", "tea"],
  },
];

/**
 * The seven archetypes this list replaced, and the bucket each one becomes.
 *
 * Kept in the app as well as in MIGRATE_CUISINES.sql, because a shop already
 * filed under a removed id has to be understood here too: the customer rail
 * drops ids it no longer knows, so without this the same row would render as
 * "no cuisine" in the app while the database still held "ihawan".
 */
export const CUISINE_MIGRATION: Record<string, CuisineId> = {
  silugan: "rice",
  ihawan: "chicken",
  karinderya: "filipino",
  kape: "coffee",
  merienda: "desserts",
  malamig: "beverages",
  fastfood: "sandwiches",
};

export const CUISINE_IDS = CUISINES.map((c) => c.id);
export const CUISINE_BY_ID = new Map(CUISINES.map((c) => [c.id, c]));

const CUISINE_IDS_SET = new Set<string>(CUISINE_IDS);

/** Narrows whatever the database returned to ids the UI knows how to render. */
export function isCuisineId(value: unknown): value is CuisineId {
  return typeof value === "string" && CUISINE_IDS_SET.has(value);
}

/**
 * Map stored ids to the ones this build knows.
 *
 * Read wherever a restaurant's cuisine comes back from the database, so a row
 * still holding a pre-migration id keeps its filter match the moment the new
 * code ships -- the SQL backfill and the app agree without either being
 * required to have run.
 */
export function normalizeCuisineIds(value: unknown): CuisineId[] {
  if (!Array.isArray(value)) return [];
  const out: CuisineId[] = [];
  for (const raw of value) {
    const id = isCuisineId(raw) ? raw : CUISINE_MIGRATION[String(raw)];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Labels for a declared `cuisine` array, in taxonomy order, unknown ids dropped. */
export function cuisineLabels(cuisine: unknown): string[] {
  const ids = normalizeCuisineIds(cuisine);
  return CUISINES.filter((c) => ids.includes(c.id)).map((c) => c.label);
}

/**
 * What a shop should be filed under when it has not declared anything.
 *
 * Kept deliberately narrower than it used to be: a shop with one `chicken` item
 * is not automatically a chicken shop, which was the original complaint. A shop
 * only falls back into a bucket when *most* of its menu sits in that one
 * category.
 */
export function inferCuisineFromMenu(
  menuCategories: string[] | undefined,
): CuisineId[] {
  if (!menuCategories?.length) return [];

  const total = menuCategories.length;
  return CUISINES.filter((c) => {
    const owned = menuCategories.filter((m) =>
      c.legacyMenuCategories.includes(m),
    ).length;
    // A clear majority, not a single item.
    return total > 0 && owned / total >= 0.5 && owned > 0;
  }).map((c) => c.id);
}
