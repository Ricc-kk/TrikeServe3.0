import type { LucideIcon } from "lucide-react";
import {
  Coffee,
  Croissant,
  CupSoda,
  Flame,
  Grid3x3,
  Sandwich,
  Soup,
  UtensilsCrossed,
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
 *  - the business "What we serve" picker, which writes `restaurants.cuisine`
 *  - the customer filter rail, which matches on that declared value
 *
 * `legacyMenuCategories` remains only as a fallback for shops that have not
 * declared a cuisine yet, so nothing disappears mid-migration.
 */
export type CuisineId =
  | "silugan"
  | "ihawan"
  | "karinderya"
  | "kape"
  | "merienda"
  | "malamig"
  | "fastfood";

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

export const CUISINES: Cuisine[] = [
  {
    id: "silugan",
    label: "Silugan",
    filipino: "Silugan",
    Icon: UtensilsCrossed,
    blurb: "Rice meals, ulam, silog combos",
    legacyMenuCategories: ["silog"],
  },
  {
    id: "ihawan",
    label: "Ihawan",
    filipino: "Ihawan",
    Icon: Flame,
    blurb: "Grilled items, barbecue, fried chicken",
    legacyMenuCategories: ["chicken"],
  },
  {
    id: "karinderya",
    label: "Karinderya",
    filipino: "Karinderya",
    Icon: Soup,
    blurb: "Pork, beef, seafood, lutong bahay",
    legacyMenuCategories: ["pork", "seafood", "beef"],
  },
  {
    id: "kape",
    label: "Kafe",
    filipino: "Kape & Tsaa",
    Icon: Coffee,
    blurb: "Coffee, tea, milk tea",
    legacyMenuCategories: ["coffee", "tea"],
  },
  {
    id: "merienda",
    label: "Merienda",
    filipino: "Merienda",
    Icon: Croissant,
    blurb: "Pastries, sweets, snacks",
    legacyMenuCategories: ["desserts", "snacks"],
  },
  {
    id: "malamig",
    label: "Malamig",
    filipino: "Malamig",
    Icon: CupSoda,
    blurb: "Cold drinks,refreshments",
    legacyMenuCategories: ["drinks", "beverages"],
  },
  {
    id: "fastfood",
    label: "Fast Food",
    filipino: "Fast Food",
    Icon: Sandwich,
    blurb: "Burgers, fries, quick service",
    legacyMenuCategories: ["fastfood", "burger"],
  },
];

export const CUISINE_IDS = CUISINES.map((c) => c.id);
export const CUISINE_BY_ID = new Map(CUISINES.map((c) => [c.id, c]));

const CUISINE_IDS_SET = new Set<string>(CUISINE_IDS);

/** Narrows whatever the database returned to ids the UI knows how to render. */
export function isCuisineId(value: unknown): value is CuisineId {
  return typeof value === "string" && CUISINE_IDS_SET.has(value);
}

/** Labels for a declared `cuisine` array, in taxonomy order, unknown ids dropped. */
export function cuisineLabels(cuisine: unknown): string[] {
  if (!Array.isArray(cuisine)) return [];
  return CUISINES.filter((c) => cuisine.includes(c.id)).map((c) => c.label);
}

/**
 * What a shop should be filed under when it has not declared anything.
 *
 * Kept deliberately narrower than it used to be: a shop with one `chicken` item
 * is not automatically an ihawan, which was the original complaint. A shop only
 * falls back into a bucket when *most* of its menu sits in that one category.
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