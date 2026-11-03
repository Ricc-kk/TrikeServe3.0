export type MenuSectionRow = {
  restaurant_id: string | null;
  name?: string | null;
  sort_order?: number | null;
};

export type LegacyMenuCategoryRow = {
  restaurant_id: string | null;
  name?: string | null;
};

/**
 * Categories created by business owners are stored as menu_sections.name.
 * Older shops may still have their categories in the categories table. Use
 * those only for a restaurant that has no menu sections, matching the fallback
 * used by the customer menu.
 */
export function whatWeServeCategoriesByRestaurant(
  sections: readonly MenuSectionRow[],
  legacyCategories: readonly LegacyMenuCategoryRow[] = [],
): Record<string, string[]> {
  const sectionsByRestaurant = new Map<string, Map<string, string>>();

  const addLabels = (rows: readonly (MenuSectionRow | LegacyMenuCategoryRow)[]) => {
    const byRestaurant = new Map<string, Map<string, string>>();
    for (const row of rows) {
      const restaurantId = String(row.restaurant_id ?? "").trim();
      const label = typeof row.name === "string" ? row.name.trim() : "";
      if (!restaurantId || !label) continue;

      const labels = byRestaurant.get(restaurantId) ?? new Map<string, string>();
      const key = label.toLocaleLowerCase();
      if (!labels.has(key)) labels.set(key, label);
      byRestaurant.set(restaurantId, labels);
    }
    return byRestaurant;
  };

  const sectionLabels = addLabels(sections);
  const legacyLabels = addLabels(legacyCategories);

  for (const [restaurantId, labels] of sectionLabels) {
    sectionsByRestaurant.set(restaurantId, labels);
  }
  for (const [restaurantId, labels] of legacyLabels) {
    if (!sectionsByRestaurant.has(restaurantId)) {
      sectionsByRestaurant.set(restaurantId, labels);
    }
  }

  return Object.fromEntries(
    Array.from(sectionsByRestaurant, ([restaurantId, labels]) => [
      restaurantId,
      Array.from(labels.values()),
    ]),
  );
}

export function whatWeServeCategoriesForRestaurant(
  restaurantId: string | null | undefined,
  sections: readonly MenuSectionRow[],
  legacyCategories: readonly LegacyMenuCategoryRow[] = [],
): string[] {
  if (!restaurantId) return [];
  return whatWeServeCategoriesByRestaurant(sections, legacyCategories)[restaurantId] ?? [];
}
