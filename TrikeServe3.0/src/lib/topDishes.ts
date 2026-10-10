/**
 * Which dishes actually sold, and how many of each.
 *
 * Orders keep their line items as a JSON blob, so there is no column anywhere that
 * says a dish was sold N times — the count has to come from walking the lines.
 *
 * This lives outside the dashboard because it is needed twice there: once for the
 * "most ordered" pie, and once for the sold badge on the popular-menu cards. They
 * were previously the same loop, which is how a pie and a card beside it can end
 * up disagreeing about the same dish.
 *
 * Counts are keyed by menu-item id as a string, because ids arrive as numbers from
 * PostgREST and as numbers inside the order JSON, and `1` and `"1"` are different
 * keys to a Map even though they are the same dish.
 */

export interface DishSale {
  /** Menu-item id, stringified so it matches whatever the order lines carried. */
  id: string;
  name: string;
  /** Units, not orders: three of a dish in one order counts as three. */
  units: number;
}

export type DishCountMap = Map<string, number>;

/**
 * Total units per menu item across the given orders.
 *
 * A line with no readable id is skipped rather than guessed at. Orders are written
 * by several versions of the app over time, so a malformed blob is a real
 * possibility, and one unreadable line is not worth failing the whole count over.
 */
export function countUnitsByMenuItem(orders: Array<Record<string, any>>): DishCountMap {
  const sold: DishCountMap = new Map();

  for (const order of orders ?? []) {
    let lines: any[] = [];
    try {
      const raw = typeof order?.items === "string" ? JSON.parse(order.items) : order?.items;
      if (Array.isArray(raw)) lines = raw;
    } catch {
      // Keep going: this order simply contributes nothing.
    }

    for (const line of lines) {
      const id = String(line?.id ?? "");
      if (!id) continue;
      const qty = Number(line?.quantity ?? 1);
      sold.set(id, (sold.get(id) ?? 0) + (Number.isFinite(qty) && qty > 0 ? qty : 1));
    }
  }

  return sold;
}

/**
 * The best sellers, most units first.
 *
 * Only dishes with a sale are returned. A pie slice for something nobody ordered
 * is a slice of nothing, and on a shop that has just opened it would be the whole
 * circle.
 *
 * Ties keep the menu's own order rather than being re-sorted, so the list does not
 * reshuffle between two renders when two dishes happen to be level.
 */
export function topDishesByUnits(
  orders: Array<Record<string, any>>,
  menuItems: Array<Record<string, any>>,
  limit = 6,
  sold: DishCountMap = countUnitsByMenuItem(orders),
): DishSale[] {
  const ranked = (menuItems ?? [])
    .map((item: any) => ({ item, units: sold.get(String(item?.id)) ?? 0 }))
    .filter((entry: any) => entry.units > 0)
    .sort((a: any, b: any) => b.units - a.units);

  return ranked.slice(0, limit).map((entry: any) => ({
    id: String(entry.item.id),
    name: String(entry.item.name ?? "Untitled"),
    units: entry.units,
  }));
}

/**
 * Slice colours for a category chart.
 *
 * Theme tokens rather than hex values, so the chart follows light and dark mode
 * like everything else on the screen. The set is fixed and ordered so the same
 * dish keeps the same colour from one render to the next — a pie whose top slice
 * changes colour between visits cannot be read at a glance.
 */
export const DISH_SLICE_COLORS: ReadonlyArray<string> = [
  "var(--primary)",
  "var(--amber)",
  "var(--info)",
  "var(--success)",
  "var(--violet)",
  "var(--teal)",
];