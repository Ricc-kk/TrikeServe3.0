import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Star } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { useAuth } from "../../contexts/AuthContext";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { supabase } from "../../../lib/supabase";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { ImageWithFallback } from "../figma/ImageWithFallback";

interface OrderedItem {
  index: number;
  id: string;
  name: string;
  quantity: number;
  image: string;
}

interface RateOrder {
  id: string;
  orderNumber: string;
  restaurantId: string;
  restaurantName: string;
  items: OrderedItem[];
}

function parseOrderedItems(rawItems: unknown): OrderedItem[] {
  let items: unknown[] = [];
  try {
    const parsed = typeof rawItems === "string" ? JSON.parse(rawItems) : rawItems;
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    return [];
  }

  return items.map((rawItem, index) => {
    const item = rawItem && typeof rawItem === "object" ? rawItem as Record<string, unknown> : {};
    const quantity = Number(item.quantity);
    return {
      index,
      id: String(item.id ?? item.menu_item_id ?? item.menuItemId ?? item.item_id ?? "").trim(),
      name: String(item.name ?? "").trim() || `Item ${index + 1}`,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      image: String(item.image ?? item.image_url ?? item.imageUrl ?? "").trim(),
    };
  });
}

function normalizeItemName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export default function OrderItemRatingPage() {
  const { orderId } = useParams();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const goBack = usePreviousPage(orderId ? `/customer/order-detail/${orderId}` : "/customer/activity");

  const [order, setOrder] = useState<RateOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [ratingLoadError, setRatingLoadError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [savedRatings, setSavedRatings] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    setLoading(true);
    setPageError(null);
    setRatingLoadError(null);
    setOrder(null);
    setRatings({});
    setSavedRatings({});
    setSaved(false);
    setShowThankYou(false);

    if (!orderId || !user?.id) {
      setPageError("This order could not be opened.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadOrder = async () => {
      try {
        const { data, error } = await supabase
          .from("orders")
          // Use the same schema-tolerant read as order details. Some existing
          // Supabase projects have not applied every optional restaurant
          // column migration, and naming those columns here makes PostgREST
          // reject the whole order lookup before the rating page can open.
          .select("*")
          .eq("id", orderId)
          .maybeSingle();

        if (error) {
          console.error("[OrderItemRatingPage] Could not load order:", error);
          if (active) setPageError("Could not load this order. Please return to order details and try again.");
          return;
        }

        if (!data) {
          if (active) setPageError("Order not found.");
          return;
        }

        const orderCustomerId = String(data.customer_id || "").trim();
        const orderCustomerEmail = String(data.customer_email || "").trim().toLowerCase();
        const currentCustomerEmail = String(user.email || "").trim().toLowerCase();
        if (orderCustomerId !== user.id && (!currentCustomerEmail || orderCustomerEmail !== currentCustomerEmail)) {
          if (active) setPageError("Order not found.");
          return;
        }

        if (String(data.status).toLowerCase() !== "delivered") {
          if (active) setPageError("You can rate items after the order is delivered.");
          return;
        }

        let restaurantId = String(data.restaurant_id || "").trim();
        if (!restaurantId) {
          const restaurantReference = String(data.restaurant_email || "").trim();
          if (restaurantReference) {
            const { data: restaurantById } = await supabase
              .from("restaurants")
              .select("id")
              .eq("id", restaurantReference)
              .maybeSingle();
            restaurantId = String(restaurantById?.id || "").trim();
          }
          if (!restaurantId && data.business_id) {
            const { data: restaurantByBusiness } = await supabase
              .from("restaurants")
              .select("id")
              .eq("business_user_id", data.business_id)
              .maybeSingle();
            restaurantId = String(restaurantByBusiness?.id || "").trim();
          }
        }
        const orderedItems = parseOrderedItems(data.items);
        if (restaurantId && orderedItems.some((item) => !item.id)) {
          const { data: menuItems, error: menuItemsError } = await supabase
            .from("menu_items")
            .select("id, name")
            .eq("restaurant_id", restaurantId);

          if (menuItemsError) {
            console.warn("[OrderItemRatingPage] Could not resolve legacy ordered item IDs:", menuItemsError);
          } else {
            const menuIdsByName = new Map<string, string[]>();
            for (const menuItem of menuItems ?? []) {
              const key = normalizeItemName(String(menuItem.name ?? ""));
              if (!key) continue;
              const matchingIds = menuIdsByName.get(key) ?? [];
              matchingIds.push(String(menuItem.id));
              menuIdsByName.set(key, matchingIds);
            }

            for (const item of orderedItems) {
              if (item.id) continue;
              const matches = menuIdsByName.get(normalizeItemName(item.name)) ?? [];
              // Only attach a menu ID when the name points to one item. An
              // ambiguous match could file the customer's rating against the
              // wrong dish when a restaurant reuses a name.
              if (matches.length === 1) item.id = matches[0];
            }
          }
        }
        const { data: savedRows, error: ratingsError } = await supabase
          .from("menu_item_ratings")
          .select("order_item_index, rating")
          .eq("order_id", orderId)
          .eq("customer_id", user.id);

        if (!active) return;
        const existing = Object.fromEntries(
          (savedRows ?? [])
            .map((row: any) => [Number(row.order_item_index), Number(row.rating)])
            .filter(([index, rating]: any[]) => Number.isInteger(index) && Number.isInteger(rating) && rating >= 1 && rating <= 5),
        ) as Record<number, number>;

        setOrder({
          id: String(data.id),
          orderNumber: String(data.order_number || "—"),
          restaurantId,
          restaurantName: String(data.restaurant_name || "Restaurant"),
          items: orderedItems,
        });
        setRatings(existing);
        setSavedRatings(existing);
        if (ratingsError) {
          console.warn("[OrderItemRatingPage] Could not load saved item ratings:", ratingsError);
          setRatingLoadError("Saved ratings could not be loaded, so rating changes are disabled. Reload this page to try again.");
        }
      } catch (error) {
        console.error("[OrderItemRatingPage] Could not load order:", error);
        if (active) setPageError("Could not load this order. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOrder();
    return () => { active = false; };
  }, [orderId, user?.id, user?.email, authLoading]);

  const hasChanges = Boolean(order && order.items.some((item) => {
    const rating = Number(ratings[item.index]);
    return item.id && Number.isInteger(rating) && rating >= 1 && rating <= 5 && savedRatings[item.index] !== rating;
  }));

  const submitRatings = async () => {
    if (!order || !user?.id || !order.restaurantId || submitting || ratingLoadError) return;

    const ratingsToSave = order.items.flatMap((item) => {
      const rating = Number(ratings[item.index]);
      if (!item.id || !Number.isInteger(rating) || rating < 1 || rating > 5 || savedRatings[item.index] === rating) {
        return [];
      }
      return [{
        order_id: order.id,
        order_item_index: item.index,
        menu_item_id: item.id,
        restaurant_id: order.restaurantId,
        customer_id: user.id,
        rating,
      }];
    });

    if (ratingsToSave.length === 0) return;
    setSubmitting(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { error } = await supabase
        .from("menu_item_ratings")
        .insert(ratingsToSave);
      if (error) throw error;

      setSavedRatings((current) => ({
        ...current,
        ...Object.fromEntries(ratingsToSave.map((row) => [row.order_item_index, row.rating])),
      }));
      setSaved(true);
      setShowThankYou(true);
    } catch (error) {
      console.error("[OrderItemRatingPage] Could not save item ratings:", error);
      setSaveError("Could not save your ratings. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--muted)] pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back to order details"
          className="grid size-11 flex-shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]"
        >
          <ArrowLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-[var(--ink)]">Rate ordered items</h1>
          {order && <p className="text-xs text-[var(--muted-foreground)]">Order #{order.orderNumber}</p>}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
        {loading ? (
          <Card className="p-6 text-center text-sm text-[var(--muted-foreground)]">Loading ordered items…</Card>
        ) : pageError ? (
          <Card className="space-y-4 p-5 text-center">
            <p role="alert" className="text-sm text-[var(--error)]">{pageError}</p>
            <Button type="button" onClick={goBack} className="w-full bg-[var(--primary)] font-bold text-white hover:bg-[var(--primary)]">
              Back to order
            </Button>
          </Card>
        ) : order ? (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{order.restaurantName}</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--ink)]">How was each item?</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Your ratings help other customers choose what to order.</p>
            </div>

            {order.items.length === 0 ? (
              <Card className="p-5 text-center text-sm text-[var(--muted-foreground)]">This order has no items to rate.</Card>
            ) : (
              <div className="space-y-3">
                {order.items.map((item) => {
                  const selectedRating = ratings[item.index] || 0;
                  const isSaved = selectedRating > 0 && savedRatings[item.index] === selectedRating;
                  return (
                    <Card key={`${item.id || item.name}-${item.index}`} className="items-start p-3 text-left">
                      <div className="flex w-full items-start justify-start gap-3 text-left">
                        {item.image ? (
                          <ImageWithFallback
                            src={item.image}
                            alt={item.name}
                            className="size-16 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div aria-hidden="true" className="size-16 shrink-0 rounded-xl bg-[var(--muted)]" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--ink)]">{item.name}</p>
                          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                            Qty: {item.quantity} · {isSaved ? "Rating saved" : selectedRating ? "Ready to save" : "Not rated"}
                          </p>
                          {!item.id && <p className="mt-1 text-xs text-[var(--error)]">This item cannot be rated.</p>}
                        </div>
                      </div>
                      <div role="group" aria-label={`Rate ${item.name}`} className="mt-3 flex w-full justify-end gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            aria-label={`Rate ${item.name} ${star} out of 5`}
                            aria-pressed={star === selectedRating}
                            disabled={!item.id || submitting || isSaved || Boolean(ratingLoadError)}
                            onClick={() => {
                              setRatings((current) => ({ ...current, [item.index]: star }));
                              setSaved(false);
                            }}
                            className={`rounded-lg p-1.5 ${isSaved ? "cursor-not-allowed" : "transition-transform hover:scale-110 disabled:opacity-40"}`}
                          >
                            <Star className={`size-6 ${star <= selectedRating ? "fill-[var(--amber)] text-[var(--amber)]" : "fill-[var(--border)] text-[var(--border)]"}`} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {!order.restaurantId && <p role="alert" className="text-sm text-[var(--error)]">This order is missing its restaurant link, so ratings cannot be saved.</p>}
            {ratingLoadError && <p role="status" className="text-sm text-[var(--amber-ink)]">{ratingLoadError}</p>}
            {saveError && <p role="alert" className="text-sm text-[var(--error)]">{saveError}</p>}
            {saved && <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[var(--success-ink)]"><CheckCircle2 className="size-4" aria-hidden="true" />Item ratings saved.</p>}

            <div className="space-y-2 pt-1">
              <Button
                type="button"
                onClick={() => void submitRatings()}
                disabled={!hasChanges || !order.restaurantId || submitting || Boolean(ratingLoadError)}
                className="w-full bg-[var(--primary)] py-3 font-bold text-white hover:bg-[var(--primary)] disabled:opacity-50"
              >
                {submitting ? "Saving ratings…" : "Save ratings"}
              </Button>
              <button type="button" onClick={goBack} className="min-h-11 w-full rounded-xl text-sm font-semibold text-[var(--muted-foreground)] hover:bg-[var(--border)]">
                Back to order details
              </button>
            </div>
          </>
        ) : null}
      </main>

      {showThankYou && order && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-rating-thank-you-title"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6"
          >
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </div>
            <h2 id="item-rating-thank-you-title" className="text-center text-xl font-bold text-[var(--ink)]">Thank you for your feedback!</h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-[var(--muted-foreground)]">
              We appreciate you taking the time to share your thoughts. Your ratings help other customers choose what to order, and we hope to serve you again soon.
            </p>

            {order.items.some((item) => savedRatings[item.index] > 0) && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="mb-3 text-sm font-bold text-[var(--ink)]">Your item ratings</h3>
                <div className="space-y-2">
                  {order.items.map((item) => {
                    const itemRating = savedRatings[item.index];
                    if (!itemRating) return null;
                    return (
                      <div key={`${item.id || item.name}-${item.index}`} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
                          {item.image ? <ImageWithFallback src={item.image} alt={item.name} className="size-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--ink)]">{item.name}</p>
                          <div className="mt-1 flex items-center gap-0.5" role="img" aria-label={`You rated ${item.name} ${itemRating} out of 5 stars`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star key={star} className={`size-4 ${star <= itemRating ? "fill-[var(--amber)] text-[var(--amber)]" : "fill-[var(--border)] text-[var(--border)]"}`} aria-hidden="true" />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              {order.items.some((item) => item.id && !savedRatings[item.index]) && (
                <Button
                  type="button"
                  onClick={() => setShowThankYou(false)}
                  className="w-full bg-[var(--primary)] py-3 font-bold text-white hover:bg-[var(--primary)]"
                >
                  Continue rating
                </Button>
              )}
              <Button
                type="button"
                onClick={goBack}
                variant={order.items.some((item) => item.id && !savedRatings[item.index]) ? "outline" : undefined}
                className={order.items.some((item) => item.id && !savedRatings[item.index])
                  ? "w-full py-3 font-bold"
                  : "w-full bg-[var(--primary)] py-3 font-bold text-white hover:bg-[var(--primary)]"}
              >
                Back to order details
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
