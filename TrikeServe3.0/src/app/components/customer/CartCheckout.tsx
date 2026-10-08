import {
  ChevronLeft,
  Trash2,
  Plus,
  Minus,
  MapPin,
  Info,
  Check,
} from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useCart } from "../../contexts/CartContext";
import { useOrders } from "../../contexts/OrderContext";
import { useAuth } from "../../contexts/AuthContext";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers, logAudit } from "@/lib/supabase";
import MapSelector from "./MapSelector";
import { getDefaultAddress, setDefaultAddress } from "@/lib/defaultAddress";
import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";

/**
 * Checkout for one restaurant.
 *
 * This used to be the second half of Cart.tsx, reached by flipping a
 * `viewMode` flag. That gave it no history entry of its own, so the browser and
 * Android back buttons walked straight past it and out of the cart. It is a
 * route now, which is what makes Back land on the cart the way every other
 * screen in the app behaves.
 *
 * The restaurant arrives as `restaurantId` in the location state and is read
 * back out of the live cart, so quantities edited here cannot drift from the
 * list behind it.
 */
export default function CartCheckout() {
  const navigate = useNavigate();
  const { cartRestaurants, updateItemQuantity, removeItem, removeRestaurant, getTotalItems } =
    useCart();
  const { addOrder } = useOrders();
  const { user } = useAuth();

  // Back to the cart list this was opened from.
  const goBack = usePreviousPage("/customer/cart");

  const routeState = useLocation().state as { restaurantId?: string } | null;
  const restaurant = useMemo(
    () => cartRestaurants.find((r) => r.id === routeState?.restaurantId) ?? null,
    [cartRestaurants, routeState?.restaurantId],
  );

  const [deliveryFee, setDeliveryFee] = useState(35);
  const [hasSelectedAddress, setHasSelectedAddress] = useState(false);
  const [fromDefaultAddress, setFromDefaultAddress] = useState(false);
  const [paymentMethod] = useState<"cash">("cash");
  const [needsCutlery, setNeedsCutlery] = useState(false);
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<{
    restaurantId: string;
    itemId: string | number;
  } | null>(null);
  const [showAddressError, setShowAddressError] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  /**
   * Set when the customer has chosen a destination after placing an order.
   *
   * Distinguishes "the cart emptied because we just ordered" from "the restaurant
   * disappeared underneath us", which the empty-cart redirect below cannot tell
   * apart on its own. See the guard at the end of this component.
   */
  const leavingRef = useRef(false);
  const [selectedAddress, setSelectedAddress] = useState({
    name: "Select Delivery Address",
    full: "Tap to choose your delivery location",
    lat: 14.7244,
    lng: 120.9668,
  });

  // Load the delivery fee set by the admin (admin_settings > rates >
  // deliveryBaseFee).
  useEffect(() => {
    supabaseHelpers.getAdminDeliveryFee().then(setDeliveryFee);
  }, []);

  // Prefill from the "Deliver to" address chosen on the food page, so the address
  // shown at checkout is the one the customer just set.
  //
  // Previously this read only the saved default, which is a *different* address:
  // it came from the profile or the last placed order, and it lagged behind. So a
  // customer who changed their delivery address on the food page still arrived at
  // checkout being offered the old one — the exact mismatch the "Deliver to" line
  // on that page exists to prevent.
  //
  // `delivery.address` is the live selection behind that line. The saved default is
  // kept as the fallback for a customer who has never picked one on the food page.
  const delivery = useDeliveryAddress();
  useEffect(() => {
    const chosen = delivery.address;
    if (chosen) {
      setSelectedAddress({
        name: chosen.label || "Delivery address",
        full: chosen.address,
        lat: Number(chosen.latitude ?? 0) || 0,
        lng: Number(chosen.longitude ?? 0) || 0,
      });
      // Without these the "Place order" button stays disabled even though an
      // address is showing, because they are what marks it as chosen.
      setHasSelectedAddress(true);
      setFromDefaultAddress(true);
      return;
    }

    const saved = getDefaultAddress(user?.id, user?.email);
    if (saved) {
      setSelectedAddress({
        name: saved.name,
        full: saved.full,
        lat: saved.lat,
        lng: saved.lng,
      });
      setHasSelectedAddress(true);
      setFromDefaultAddress(true);
    }
  }, [user?.id, user?.email, delivery.address]);

  const subtotal = restaurant
    ? restaurant.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    : 0;

  const total = subtotal + deliveryFee;

  const confirmRemoveRestaurants = () => {
    if (!restaurant) return;
    if (pendingRemoveItem) {
      removeItem(pendingRemoveItem.restaurantId, pendingRemoveItem.itemId);
      setPendingRemoveItem(null);
    }
    setShowRemoveConfirm(false);
  };

  const handlePlaceOrder = async () => {
    if (!restaurant) return;
    if (!hasSelectedAddress) {
      setShowAddressError(true);
      return;
    }
    // Don't let a previous order's ids leak into this confirmation.
    setPlacedOrderNumber(null);
    setPlacedOrderId(null);
    try {
      // CRITICAL: Get the actual Supabase restaurant.id for RLS isolation
      let businessUserId = restaurant.businessUserId;
      let supabaseRestaurantId = restaurant.supabaseRestaurantId;

      // If we don't have businessUserId, look it up from the restaurant name
      if (!businessUserId && restaurant.name) {
        console.log(
          "[Cart] businessUserId missing, looking up by restaurant name:",
          restaurant.name,
        );
        try {
          const { data: restaurantRecord, error: fetchError } = await supabase
            .from("restaurants")
            .select("id, business_user_id")
            .ilike("name", restaurant.name)
            .single();

          if (!fetchError && restaurantRecord) {
            businessUserId = restaurantRecord.business_user_id;
            supabaseRestaurantId = restaurantRecord.id;
            console.log("[Cart] Found businessUserId from restaurant name:", businessUserId);
          } else {
            console.warn("[Cart] Could not find restaurant by name:", fetchError);
          }
        } catch (error) {
          console.warn("[Cart] Error looking up restaurant by name:", error);
        }
      } else if (!supabaseRestaurantId && businessUserId) {
        console.log("[Cart] Fetching restaurant ID from Supabase for:", businessUserId);
        try {
          const { data: restaurantRecord, error: fetchError } = await supabase
            .from("restaurants")
            .select("id")
            .eq("business_user_id", businessUserId)
            .single();

          if (fetchError) {
            console.warn("[Cart] Could not fetch restaurant ID:", fetchError);
          } else if (restaurantRecord) {
            supabaseRestaurantId = restaurantRecord.id;
            console.log("[Cart] Got restaurant ID from Supabase:", supabaseRestaurantId);
          }
        } catch (error) {
          console.warn("[Cart] Error fetching restaurant:", error);
        }
      }

      const orderNumber = Math.random().toString(36).substring(2, 9).toUpperCase();
      const currentUserData = localStorage.getItem("trikeserve_current_user");
      const currentUser = currentUserData ? JSON.parse(currentUserData) : null;

      const order = {
        id: Date.now().toString(),
        orderNumber,
        restaurantName: restaurant.name,
        restaurantImage: restaurant.image,
        restaurantEmail: restaurant.id, // This is the business email/restaurant UUID
        customerEmail: currentUser?.email || "",
        customerName: currentUser?.name || "Customer",
        customerPhone: currentUser?.phone || "",
        items: restaurant.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          category: item.category,
          customizations: item.customizations || [],
        })),
        subtotal,
        deliveryFee,
        total,
        status: "pending" as const,
        deliveryMode: "delivery" as const,
        paymentMethod,
        address:
          selectedAddress.lat && selectedAddress.lng
            ? `${selectedAddress.full}|${selectedAddress.lat},${selectedAddress.lng}`
            : selectedAddress.full,
        date: new Date().toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        createdAt: new Date().toISOString(),
        estimatedTime: "25 mins",
        needsCutlery,
      };

      console.log("[Cart] Order created with:", {
        orderNumber: order.orderNumber,
        restaurantEmail: order.restaurantEmail,
        supabaseRestaurantId,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        total: order.total,
      });

      // Save to Supabase FIRST (before localStorage)
      try {
        console.log("[Cart] ========== ORDER SAVE DEBUG ==========");
        console.log("[Cart] Saving order to Supabase:", order.orderNumber);
        console.log("[Cart] Restaurant object:", {
          id: restaurant.id,
          name: restaurant.name,
          businessUserId: restaurant.businessUserId,
        });
        console.log("[Cart] With customer_id:", user?.id);
        console.log("[Cart] With business_id:", businessUserId);
        console.log("[Cart] With restaurant_email:", order.restaurantEmail);
        console.log("[Cart] ======================================");

        // Map to actual Supabase columns (based on actual schema)
        const { data: savedOrder, error: insertError } = await supabase
          .from("orders")
          .insert([
            {
              customer_id: user?.id || null, // Connect order to authenticated customer
              business_id: businessUserId || null, // Connect order to business user/restaurant owner
              order_number: order.orderNumber,
              restaurant_email: order.restaurantEmail || null, // Restaurant identifier
              restaurant_name: order.restaurantName || null, // Restaurant name for display
              restaurant_image: order.restaurantImage || null, // Restaurant image for display
              customer_email: order.customerEmail,
              customer_name: order.customerName,
              customer_phone: order.customerPhone,
              items: JSON.stringify(order.items),
              subtotal: order.subtotal,
              delivery_fee: order.deliveryFee,
              total: order.total,
              status: order.status,
              delivery_mode: order.deliveryMode,
              payment_method: order.paymentMethod,
              address: order.address,
              estimated_time: order.estimatedTime,
              needs_cutlery: order.needsCutlery,
              created_at: order.createdAt,
            },
          ])
          .select()
          .single();

        if (insertError) {
          console.error("[Cart] Error saving order to Supabase:", insertError);
          alert("Error saving order: " + (insertError?.message || "Unknown error"));
          return;
        }

        console.log("[Cart] Order saved successfully to Supabase:", savedOrder);

        // Remember the DB id so the confirmation can jump to the order details.
        setPlacedOrderId(savedOrder?.id || null);

        /*
         * The address they actually ordered to becomes their default.
         *
         * They chose it deliberately, by tapping the "Deliver to" line and picking
         * somewhere — that is the strongest possible signal of which address they
         * live at. Without this the next checkout silently reopened the one they
         * last used, so changing address for a single order had to be redone every
         * time.
         *
         * Only written when the address has coordinates: `getDefaultAddress` rejects
         * a default without lat/lng on the way back out, so storing one would just
         * be a value nothing could read.
         */
        if (selectedAddress.lat && selectedAddress.lng) {
          setDefaultAddress(
            {
              name: selectedAddress.name,
              full: selectedAddress.full,
              lat: selectedAddress.lat,
              lng: selectedAddress.lng,
            },
            user?.id,
            user?.email,
          );
        }

        /*
         * Tell the customer their own order landed.
         *
         * Nothing wrote a notification on placement. `notifyDeliveryStatusChange`
         * only fires from the driver's screen when a status changes, so the first
         * row a customer ever saw was a status update about an order they had to
         * already know about. Placing an order produced no notification at all.
         *
         * Written directly rather than through that helper because it recovers the
         * order id by parsing it out of the pickup address text, which is not
         * something to rely on when the id is already in hand.
         *
         * `order_id` is what makes the notification tappable — the notifications
         * screen builds its destination from it — so it is the field that matters
         * here, more than the wording.
         *
         * Fire and forget: the order is placed either way, and a failed
         * notification must not turn a successful order into an error.
         */
        void supabase
          .from("delivery_notifications")
          .insert([
            {
              recipient_id: user?.id ?? null,
              order_id: savedOrder?.id ?? null,
              order_number: order.orderNumber ?? null,
              restaurant_name: order.restaurantName || null,
              title: "🧾 Order placed",
              message: order.restaurantName
                ? `Your order at ${order.restaurantName} has been placed.`
                : "Your order has been placed.",
              type: "order",
              read: false,
              created_at: new Date().toISOString(),
            },
          ])
          .then(({ error: notifError }) => {
            if (notifError) {
              console.warn("[Cart] Order-placed notification failed:", notifError.message);
            }
          });

        logAudit({
          action: "place_order",
          actorRole: "customer",
          entityType: "order",
          entityId: savedOrder?.id,
          summary: `Placed an order at ${order.restaurantName || "a restaurant"}`,
          details: { order_number: order.orderNumber, total: order.total },
          actorEmail: user?.email,
          actorName: user?.name,
        });

        // ONLY add to localStorage AFTER successful Supabase save
        addOrder(order);

        // Create processing record for restaurant workflow
        try {
          console.log("[Cart] Creating order processing record...");
          const processingRecord = {
            order_id: savedOrder?.id || order.id,
            restaurant_id: supabaseRestaurantId || null,
            order_number: order.orderNumber,
            customer_email: order.customerEmail,
            customer_name: order.customerName,
            status: "received",
            estimated_prep_time: 25,
            notes: needsCutlery ? "Needs cutlery" : "",
          };

          const { error: processingError } = await supabase
            .from("order_processing")
            .insert([processingRecord])
            .select()
            .single();

          if (processingError) {
            console.error("[Cart] Error creating processing record:", processingError);
          } else {
            console.log("[Cart] Processing record created successfully");
          }
        } catch (error) {
          console.error("[Cart] Error creating processing record:", error);
        }

        // Notify the business about the new order
        try {
          if (businessUserId) {
            console.log("[Cart] Notifying business about new order...");
            await supabaseHelpers.notifyBusinessNewOrder({
              orderId: savedOrder?.id || order.id,
              orderNumber: order.orderNumber,
              restaurantName: order.restaurantName,
              customerName: order.customerName,
              total: order.total,
              businessUserId,
            });
            console.log("[Cart] Business notification sent successfully");
          }
        } catch (notifError) {
          console.error("[Cart] Error notifying business:", notifError);
        }
      } catch (error) {
        console.error("[Cart] Error saving order:", error);
      }

      setPlacedOrderNumber(order.orderNumber);
      setShowOrderConfirmation(true);
    } catch (error) {
      console.error("[Cart] Unexpected error in handlePlaceOrder:", error);
    }
  };

  // The restaurant can vanish from under this screen: deleted by a swipe on
  // the cart list, or by another tab's poll of localStorage. There is nothing
  // to check out, so go back to the list rather than render an empty order.
  //
  // `leavingRef` is the exception. After placing an order the confirmation buttons
  // deliberately empty the cart and then navigate away -- Track Order to the order
  // detail, Continue Shopping to the food screen. Both do `removeRestaurant()`
  // before navigating, so this guard saw no restaurant, fired, and its `replace`
  // *overwrote* the navigation that was on its way. That is why tapping Track
  // Order landed on the cart instead of the order detail: the customer's explicit
  // destination lost to a redirect nobody asked for.
  //
  // The flag is set before the cart is touched, so the guard knows the emptiness is
  // ours and not a stranger's. It renders nothing rather than falling through,
  // because the body below dereferences `restaurant` and it is genuinely gone.
  if (!restaurant) {
    return leavingRef.current ? null : <Navigate to="/customer/cart" replace />;
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-[var(--border)] bg-surface px-5 py-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back to cart"
          className="transition-transform active:scale-90"
        >
          <ChevronLeft className="size-6 text-[var(--ink)]" />
        </button>
        <h1 className="flex-1 truncate text-base font-bold text-[var(--ink)]">
          {restaurant.name}
        </h1>
      </div>

      <div className="space-y-6 px-5 py-6">
        {/* Order summary */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--ink)]">Order summary</h2>
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/customer/restaurant-detail?id=${encodeURIComponent(
                    restaurant.id,
                  )}&name=${encodeURIComponent(restaurant.name)}`,
                )
              }
              className="text-sm font-semibold text-[var(--info)]"
            >
              Add items
            </button>
          </div>

          <div className="space-y-4">
            {restaurant.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--muted)] p-3">
                <div className="flex items-start gap-3">
                  <div className="size-16 flex-shrink-0 overflow-hidden rounded-xl">
                    <ImageWithFallback
                      src={item.image}
                      alt={item.name}
                      className="size-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 text-sm font-semibold text-[var(--ink)]">
                      {item.name}
                    </h3>
                    {item.customizations && item.customizations.length > 0 && (
                      <div className="mb-2 space-y-0.5">
                        {item.customizations.map((customization, idx) => (
                          <p
                            key={idx}
                            className="text-xs text-[var(--muted-foreground)]"
                          >
                            • {customization.optionName}
                            {customization.price > 0 && (
                              <span className="text-[var(--primary)]">
                                {" "}
                                +₱{customization.price}
                              </span>
                            )}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="font-semibold text-[var(--ink)]">
                      ₱{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Quantity controls */}
                <div className="mt-2 flex items-center justify-between pl-[76px]">
                  <span className="text-sm text-[var(--muted-foreground)]">
                    ₱{item.price}.00 each
                  </span>
                  <div className="flex items-center gap-3">
                    {item.quantity === 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Dropping the last thing in the cart empties it, so
                          // that one asks first.
                          const isLastItem =
                            restaurant.items.length === 1 && getTotalItems() === 1;
                          if (isLastItem) {
                            setPendingRemoveItem({
                              restaurantId: restaurant.id,
                              itemId: item.id,
                            });
                            setShowRemoveConfirm(true);
                          } else {
                            removeItem(restaurant.id, item.id);
                          }
                        }}
                        className="grid size-8 place-items-center rounded-full border-2 border-[var(--error)] transition-transform active:scale-90"
                      >
                        <Trash2 size={14} className="text-[var(--error)]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(restaurant.id, item.id, -1)}
                        className="grid size-8 place-items-center rounded-full border border-line transition-transform active:scale-90"
                      >
                        <Minus size={14} className="text-[var(--ink)]" />
                      </button>
                    )}
                    <span className="min-w-[20px] text-center text-base font-bold text-[var(--ink)]">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateItemQuantity(restaurant.id, item.id, 1)}
                      disabled={item.quantity >= 50}
                      className={`grid size-8 place-items-center rounded-full border-2 transition-transform active:scale-90 ${
                        item.quantity >= 50
                          ? "cursor-not-allowed border-[var(--border)] bg-[var(--muted)] opacity-50"
                          : "border-[var(--success)] bg-[var(--success)]/10"
                      }`}
                    >
                      <Plus
                        size={14}
                        className={
                          item.quantity >= 50
                            ? "text-[var(--muted-foreground)]"
                            : "text-[var(--success)]"
                        }
                      />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cutlery */}
        <div className="flex items-center justify-between border-y border-[var(--border)] py-4">
          <div>
            <h3 className="mb-1 font-bold text-[var(--ink)]">Cutlery</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Request for cutlery only if you need it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNeedsCutlery(!needsCutlery)}
            aria-pressed={needsCutlery}
            aria-label="Request cutlery"
            className="flex-shrink-0"
          >
            <span
              className={`grid size-12 place-items-center rounded-xl border-2 transition-all ${
                needsCutlery
                  ? "border-[var(--success)] bg-[var(--success)]/10"
                  : "border-[var(--border)]"
              }`}
            >
              {needsCutlery && (
                <Check
                  className="size-6 text-[var(--success)]"
                  strokeWidth={2}
                />
              )}
            </span>
          </button>
        </div>

        {/* Address */}
        <div>
          <button
            type="button"
            onClick={() => setShowMapSelector(true)}
            className="mb-2 flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-surface p-4 transition-transform active:scale-[0.98]"
          >
            <MapPin className="size-5 flex-shrink-0 text-[var(--primary)]" />
            <div className="flex-1 text-left">
              <p
                className={`mb-0.5 font-semibold ${
                  hasSelectedAddress
                    ? "text-[var(--ink)]"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                {selectedAddress.name}
              </p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {selectedAddress.full}
              </p>
            </div>
          </button>

          {fromDefaultAddress && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              <Check className="size-3.5 flex-shrink-0 text-[var(--success)]" />
              Using your saved default address. Tap above to change it for this order.
            </p>
          )}

          {/* Floor/Unit Number */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-surface p-4">
            <input
              type="text"
              placeholder="Floor / unit no."
              aria-label="Floor or unit number"
              className="flex-1 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-foreground)]"
            />
            {/* Support text, not a control. It was `--info` blue and bold, which
                read as a link or a button and competed with the field it describes.
                Muted and lighter, it reads as a hint. The "Add" button beside it is
                gone: there is nothing for it to add — the value is typed directly in
                the field, so it only ever looked like the actual action. */}
            <span className="text-xs font-normal text-[var(--muted-foreground)]/80">
              Helps with delivery
            </span>
          </div>

          {/* Note for the driver. Optional by design: most tricycle drops need
              nothing said, so requiring it would be friction on every order. */}
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-surface p-4">
            <label
              htmlFor="driver-note"
              className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-[var(--ink)]"
            >
              Note for driver
              <span className="text-xs font-normal text-[var(--muted-foreground)]">
                Optional
              </span>
            </label>
            <textarea
              id="driver-note"
              rows={2}
              placeholder="e.g. Blue gate beside the sari-sari store"
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {/* Delivery Fee (set by the admin) */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Info className="size-5 text-[var(--amber)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--ink)]">Delivery fee</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                Food delivery (base rate)
              </p>
            </div>
          </div>
          <div className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-4">
            <span className="font-semibold text-[var(--ink)]">Delivery</span>
            <span className="font-bold text-[var(--ink)]">
              ₱{deliveryFee.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment details */}
        <div className="pb-6">
          <h2 className="mb-3 text-lg font-bold text-[var(--ink)]">Payment details</h2>
          <p className="mb-4 text-sm text-[var(--muted-foreground)]">
            Pay with cash on delivery.
          </p>
          <div className="flex w-full items-center justify-between rounded-xl border-2 border-[var(--success)] bg-[var(--success)]/5 p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-[var(--success)]">
                <span className="text-lg font-bold text-white">💵</span>
              </div>
              <span className="font-semibold text-[var(--ink)]">Cash</span>
            </div>
            <div className="grid size-6 place-items-center rounded-full bg-[var(--success)]">
              <Check className="size-4 text-white" strokeWidth={3} />
            </div>
          </div>
        </div>

        {/* Subtotal summary */}
        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Subtotal</span>
            <span className="font-semibold text-[var(--ink)]">
              ₱{subtotal.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Delivery fee</span>
            <span className="font-semibold text-[var(--ink)]">
              ₱{deliveryFee.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Fixed bottom: total and Place Order */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[var(--border)] bg-surface px-5 py-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-lg font-bold text-[var(--ink)]">Total</span>
          <span className="text-2xl font-bold text-[var(--ink)]">
            ₱{total.toFixed(2)}
          </span>
        </div>
        <button
          type="button"
          onClick={handlePlaceOrder}
          className="w-full rounded-2xl bg-[var(--success)] py-4 font-bold text-white shadow-lg transition-all active:scale-95"
        >
          Place Order
        </button>
      </div>

      {/* Order Confirmation Modal */}
      {showOrderConfirmation && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
          <Card
            className="w-full max-w-sm bg-surface p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-6 grid size-20 place-items-center rounded-full bg-[var(--success)]/10">
              <div className="grid size-16 place-items-center rounded-full bg-[var(--success)]">
                <Check className="size-10 text-white" strokeWidth={3} />
              </div>
            </div>

            <h2 className="mb-3 text-center text-2xl font-bold text-[var(--ink)]">
              Order Placed!
            </h2>
            <p className="mb-2 text-center text-[var(--muted-foreground)]">
              Your order has been successfully placed and is being prepared.
            </p>
            {placedOrderNumber && (
              <p className="mb-8 text-center text-sm text-[var(--muted-foreground)]">
                Order #{placedOrderNumber}
              </p>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setShowOrderConfirmation(false);
                  // Before removing: this empties the cart, and the empty-cart
                  // redirect must know we are leaving on purpose.
                  leavingRef.current = true;
                  removeRestaurant(restaurant.id);
                  // Go straight to this order's details. Only fall back to the
                  // order list if the order never reached the database.
                  navigate(
                    placedOrderId
                      ? `/customer/order-detail/${placedOrderId}`
                      : "/customer/activity",
                  );
                }}
                className="w-full rounded-2xl bg-[var(--success)] py-4 font-bold text-white transition-transform active:scale-95"
              >
                Track Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOrderConfirmation(false);
                  leavingRef.current = true;
                  removeRestaurant(restaurant.id);
                  navigate("/customer/food");
                }}
                className="w-full rounded-2xl bg-[var(--muted)] py-4 font-bold text-[var(--muted-foreground)] transition-transform active:scale-95"
              >
                Continue Shopping
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Remove Last Item confirmation */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
          <Card
            className="w-full max-w-sm bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-center text-xl font-bold text-[var(--ink)]">
              Remove Last Item?
            </h2>
            <p className="mb-6 text-center text-[var(--muted-foreground)]">
              This will empty your cart. Are you sure?
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={confirmRemoveRestaurants}
                className="w-full rounded-2xl bg-[var(--primary)] py-4 font-bold text-white transition-transform active:scale-95"
              >
                Yes, Empty Cart
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRemoveConfirm(false);
                  setPendingRemoveItem(null);
                }}
                className="w-full rounded-2xl bg-[var(--muted)] py-4 font-bold text-[var(--muted-foreground)] transition-transform active:scale-95"
              >
                Cancel
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Address Error Modal */}
      {showAddressError && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
          <Card
            className="w-full max-w-sm bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-center">
              <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-[var(--amber-soft)]">
                <MapPin className="size-7 text-[var(--amber)]" />
              </div>
              <h2 className="mb-1 text-xl font-bold text-[var(--ink)]">
                Delivery Address Required
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Please select a delivery address before placing your order.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAddressError(false);
                setShowMapSelector(true);
              }}
              className="w-full rounded-2xl bg-[var(--primary)] py-3 font-bold text-white transition-transform active:scale-95"
            >
              Select Address
            </button>
            <button
              type="button"
              onClick={() => setShowAddressError(false)}
              className="mt-2 w-full rounded-2xl bg-[var(--muted)] py-3 font-bold text-[var(--muted-foreground)] transition-transform active:scale-95"
            >
              Cancel
            </button>
          </Card>
        </div>
      )}

      {/* Map Selector */}
      {showMapSelector && (
        <MapSelector
          onClose={() => setShowMapSelector(false)}
          onSelectLocation={(location) => {
            setSelectedAddress({
              name: location.name,
              full: location.full,
              lat: location.lat,
              lng: location.lng,
            });
            setHasSelectedAddress(true);
            setFromDefaultAddress(false);
            setShowMapSelector(false);
          }}
          currentLocation={selectedAddress}
        />
      )}
    </div>
  );
}
