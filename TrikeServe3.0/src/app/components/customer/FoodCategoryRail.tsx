import type { LucideIcon } from "lucide-react";
import { Coffee, CupSoda, Croissant, Flame, Grid3x3, Soup, UtensilsCrossed } from "lucide-react";

export type FoodCategoryId =
  | "all"
  | "silugan"
  | "ihawan"
  | "karinderya"
  | "kape"
  | "merienda"
  | "malamig";

type FoodCategory = {
  id: FoodCategoryId;
  label: string;
  filipino: string;
  Icon: LucideIcon;
  /**
   * `menu_items.category` values that place a restaurant in this bucket.
   * Empty for "all". Derived rather than stored, because the `restaurants`
   * table has no category column — see FoodHome's category derivation.
   */
  menuCategories: string[];
};

/**
 * The local food taxonomy.
 *
 * These six were previously defined in FoodHome and never rendered, against a
 * filter that could never match. They are wired up here instead, mapped onto the
 * category values the business menu actually writes (`BusinessMenu.tsx`).
 */
export const FOOD_CATEGORIES: FoodCategory[] = [
  { id: "all", label: "All", filipino: "Lahat", Icon: Grid3x3, menuCategories: [] },
  { id: "silugan", label: "Silugan", filipino: "Silugan", Icon: UtensilsCrossed, menuCategories: ["silog"] },
  { id: "ihawan", label: "Ihawan", filipino: "Ihawan", Icon: Flame, menuCategories: ["chicken"] },
  {
    id: "karinderya",
    label: "Karinderya",
    filipino: "Karinderya",
    Icon: Soup,
    menuCategories: ["pork", "seafood"],
  },
  { id: "kape", label: "Kafe", filipino: "Kape & Tsaa", Icon: Coffee, menuCategories: ["drinks"] },
  { id: "merienda", label: "Merienda", filipino: "Merienda", Icon: Croissant, menuCategories: ["desserts"] },
  { id: "malamig", label: "Malamig", filipino: "Malamig", Icon: CupSoda, menuCategories: ["drinks"] },
];

type FoodCategoryRailProps = {
  value: FoodCategoryId;
  onChange: (next: FoodCategoryId) => void;
  /** How many restaurants each bucket currently holds; -1 hides empty ones. */
  counts?: Partial<Record<FoodCategoryId, number>>;
};

export default function FoodCategoryRail({
  value,
  onChange,
  counts,
}: FoodCategoryRailProps) {
  return (
    <div
      role="tablist"
      aria-label="Food categories"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5"
      // A horizontally scrolling rail is not keyboard-scrollable by default.
      tabIndex={0}
    >
      {FOOD_CATEGORIES.map(({ id, label, filipino, Icon }) => {
        const selected = value === id;
        const count = counts?.[id];

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={[
              "flex min-h-14 flex-shrink-0 items-center gap-2 rounded-2xl border-2 px-3.5 transition-colors",
              selected
                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                : "border-line bg-[var(--surface)] hover:bg-[var(--muted)]",
            ].join(" ")}
          >
            <Icon
              className="size-5 flex-shrink-0"
              color={selected ? "var(--primary)" : "var(--muted-foreground)"}
              aria-hidden="true"
            />
            <span className="min-w-0 text-left leading-tight">
              <span
                className="block truncate text-sm font-bold"
                style={{ color: selected ? "var(--coral-dark)" : "var(--ink)" }}
              >
                {label}
              </span>
              <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                {filipino}
                {typeof count === "number" && count > 0 ? ` · ${count}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}