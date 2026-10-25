import { ArrowRight, ShoppingCart } from "lucide-react";
import { Link } from "react-router";

import { useCartOptional } from "../../contexts/CartContext";

/** A compact reminder, without pushing the home feed behind a full cart list. */
export default function CustomerCartPreview() {
  const cart = useCartOptional();
  if (!cart) return null;

  const { cartRestaurants, getTotalItems } = cart;
  const count = getTotalItems();
  if (count === 0) return null;

  const subtotal = cartRestaurants.reduce(
    (total, restaurant) => total + restaurant.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    0,
  );

  return (
    <Link
      to="/customer/cart"
      aria-label={`Open My Cart, ${count} ${count === 1 ? "item" : "items"}`}
      className="flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-card transition-colors hover:border-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)] sm:gap-4 sm:px-5"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
        <ShoppingCart className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--ink)] sm:text-base">My Cart</span>
        <span className="block text-xs leading-relaxed text-[var(--muted-foreground)]">
          {count} {count === 1 ? "item" : "items"} · {cartRestaurants.length} {cartRestaurants.length === 1 ? "cart" : "carts"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-[var(--ink)]" aria-label={`Items subtotal, ₱${subtotal.toFixed(2)}`}>₱{subtotal.toFixed(2)}</span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-[var(--teal)]">
          View cart <ArrowRight className="size-3.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
