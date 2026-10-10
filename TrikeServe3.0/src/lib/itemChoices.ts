/**
 * Choice options on a menu item -- the shared contract between the shop's menu
 * editor and the customer's ordering sheet.
 *
 * Both screens read and write the same `menu_items.customization_groups` JSONB
 * column, and the shapes have to agree exactly: the shop writes it, and the
 * customer modal reads it and would throw on anything unexpected. So the type
 * lives here rather than in either component.
 *
 * Field names are not free. The customer modal already reads `name`, `required`,
 * `minSelections`, `maxSelections` and `options`, and `maxSelections` is what
 * decides whether the customer gets radio circles or checkboxes.
 */

export interface ItemOption {
  /** Client-side key. Unique within its group; never a database identity. */
  id: number;
  name: string;
  /** Added to the item price, so an extra shot can cost more than the base dish. */
  price: number;
}

export interface ItemChoiceGroup {
  id: number;
  name: string;
  /**
   * Whether the customer is offered this group at all.
   *
   * Distinct from `required`: required means "pick one before adding to cart",
   * this means "does this choice exist right now". A shop switches one off over a
   * stock shortage rather than deleting the list and rebuilding it.
   */
  enabled: boolean;
  required: boolean;
  minSelections: number;
  /** 1 renders as radio circles on the storefront, more than 1 as checkboxes. */
  maxSelections: number;
  options: ItemOption[];
}

let nextId = Date.now();
const freshId = () => (nextId += 1);

/** "Choice A", "Choice B" ... for the nth group on an item. */
export const defaultGroupName = (index: number) => `Choice ${String.fromCharCode(65 + index)}`;

/**
 * A blank group, already holding one empty option.
 *
 * Seeded with an option rather than none: a group with no options is dropped on
 * save, so it would render as an empty box with an "Add option" button and give
 * the shop the impression it had worked. One empty row makes the thing to fill in
 * obvious.
 */
export const newChoiceGroup = (index: number): ItemChoiceGroup => ({
  id: freshId(),
  name: defaultGroupName(index),
  enabled: true,
  required: true,
  minSelections: 1,
  maxSelections: 1,
  options: [{ id: freshId(), name: "", price: 0 }],
});

/**
 * Drop the groups that are not worth sending.
 *
 * A group with no name or no named options cannot be rendered by the customer
 * modal -- it would show an empty picker nobody can satisfy -- so it is dropped
 * here rather than stored and defended against on the storefront. Disabled groups
 * are kept: turning one back on should not mean retyping it.
 */
export const usableChoiceGroups = (groups: ItemChoiceGroup[]): ItemChoiceGroup[] =>
  groups
    .filter((g) => g.name.trim() !== "" && g.options.some((o) => o.name.trim() !== ""))
    .map((g) => ({ ...g, options: g.options.filter((o) => o.name.trim() !== "") }));

/**
 * Read the column into groups, whatever shape it arrives in.
 *
 * Three shapes reach here: a real array (PostgREST parsed jsonb), a JSON string
 * (a jsonb column selected inside a larger row, and the localStorage fallback
 * which was stringified), and nothing at all (a database that has not run
 * ADD_MENU_ITEM_OPTIONS.sql, so the column is absent from the row). All three are
 * ordinary; only the first is an array, so the others would throw on `.map` the
 * first time somebody opened the item.
 *
 * Fields are filled in with defaults rather than trusted: this is a JSON column
 * with no constraints on it, and a hand-edited row should not be able to break the
 * customer modal with a missing `maxSelections`.
 */
export function parseChoiceGroups(raw: unknown): ItemChoiceGroup[] {
  let value = raw;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  return value
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .map((g) => {
      const options = Array.isArray(g.options) ? g.options : [];
      const maxSelections = Number(g.maxSelections);
      return {
        id: Number.isFinite(Number(g.id)) ? Number(g.id) : freshId(),
        name: typeof g.name === "string" ? g.name : "",
        // Absent means enabled. Options saved before this flag existed have no
        // `enabled` key, and defaulting those to off would silently delete every
        // customer's drink choice on the first load.
        enabled: g.enabled !== false,
        required: g.required !== false,
        minSelections: Number.isFinite(Number(g.minSelections)) ? Number(g.minSelections) : 1,
        maxSelections: Number.isFinite(maxSelections) && maxSelections > 0 ? maxSelections : 1,
        options: options
          .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
          .map((o) => ({
            id: Number.isFinite(Number(o.id)) ? Number(o.id) : freshId(),
            name: typeof o.name === "string" ? o.name : "",
            price: Number.isFinite(Number(o.price)) ? Number(o.price) : 0,
          })),
      };
    });
}