import { ShoppingCart, Trash2, Plus, X, MoreVertical } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { useEffect, useRef, useState } from "react";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useCart, type CartRestaurant } from "../../contexts/CartContext";
import BottomNav from "../ui/BottomNav";
import { usePreviousPage } from "../../hooks/usePreviousPage";

/**
 * Swipe tuning for the restaurant card.
 *
 * Deleting a restaurant happens on a gesture, so the bar has to be high enough
 * that the gesture is unambiguous. The first pass committed at 96px, which on a
 * phone card is barely a third of its width -- a user nudging the card while
 * trying to read it deleted a restaurant. It now takes a deliberate pull of
 * well over half the card, and past the commit point the card meets real
 * resistance so the extra travel is visibly effort, not a freebie.
 */
const SWIPE_COMMIT_RATIO = 0.45;
const SWIPE_COMMIT_MIN_PX = 140;
const SWIPE_COMMIT_MAX_PX = 240;
const SWIPE_DEADZONE_PX = 10;
/** Resistance past the commit point: the card gives less than 1px per 3px. */
const SWIPE_OVERSHOOT = 1.3;
const SWIPE_SETTLE_MS = 200;
/**
 * How much of the way back a revealed card has to be dragged to close again.
 *
 * A swipe only ever reveals now; the action is the button, so nothing about
 * this gesture depends on how fast or how far it was thrown. What is left is
 * the way back out: drag the revealed button roughly halfway home and the card
 * returns to normal.
 */
const SWIPE_CLOSE_RATIO = 0.5;

/**
 * How far a revealed card travels, as a multiple of nothing extra.
 *
 * A swipe never acts on its own any more -- it slides the card clear of its own
 * footprint and waits for a tap on the button left behind. Deleting a
 * restaurant on a gesture alone kept catching people who were only trying to
 * shift the card out of the way to read it, so the destructive half of this UI
 * now always costs a deliberate tap.
 *
 * The card finishes the journey rather than stopping under the finger: parking
 * it part-way left the action half-peeking from behind a sliver of card, so
 * what you were being asked to tap was never fully visible. This is
 * `offScreenDistance()` in the component, measured from the live card.
 */
const REVEAL_CLEARANCE_PX = 48;

function restaurantSubtotal(restaurant: CartRestaurant) {
  return restaurant.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

interface CardProps {
  restaurant: CartRestaurant;
  /** Whether this card is currently parked showing its action. */
  revealed: boolean;
  onReveal: (revealed: boolean) => void;
  onOpenOptions: () => void;
  onOpenCheckout: () => void;
  onAddMore: () => void;
  onDelete: () => void;
}

function CartRestaurantCard({
  restaurant,
  revealed,
  onReveal,
  onOpenOptions,
  onOpenCheckout,
  onAddMore,
  onDelete,
}: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    /** Parked offset the drag started from, 0 when the card was closed. */
    originDx: number;
    moved: boolean;
  } | null>(null);
  // Set the moment a drag passes the dead zone and cleared by the next
  // pointerdown. The click handler reads it because a swipe that ends over a
  // button still fires that button's click, which would otherwise open checkout
  // at the same moment the swipe committed.
  const swipedRef = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  /** True while the card is sliding off to perform its action. */
  const animatingOut = useRef(false);

  /**
   * Keeps the parked offset tied to the revealed flag.
   *
   * The flag lives in the page, because tapping anywhere else has to dismiss
   * whatever card is open -- so dismissing it from there leaves this card's own
   * `dx` stranded mid-slide and the card stuck off to one side with no panel
   * behind it. An effect that only resets a card which is not on its way out
   * closes that gap without cutting the slide-out animation short.
   */
  useEffect(() => {
    if (!revealed && !animatingOut.current && dx !== 0) setDx(0);
  }, [revealed, dx]);

  const commitDistance = () => {
    const width = cardRef.current?.offsetWidth ?? 0;
    if (!width) return SWIPE_COMMIT_MIN_PX;
    return Math.min(
      Math.max(width * SWIPE_COMMIT_RATIO, SWIPE_COMMIT_MIN_PX),
      SWIPE_COMMIT_MAX_PX,
    );
  };

  /** Guards every tappable region against the click a swipe leaves behind. */
  const onTap = (action: () => void) => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    action();
  };

  /**
   * How far the card must travel to be completely clear of its own footprint,
   * leaving the whole action button on screen rather than a sliver of it.
   */
  const offScreenDistance = () =>
    (cardRef.current?.offsetWidth ?? 320) + REVEAL_CLEARANCE_PX;

  /** Slides the card off, then runs the action once the slide is finished. */
  const runAction = (action: () => void) => {
    const goingLeft = dx < 0;
    const off = offScreenDistance();
    animatingOut.current = true;
    setSettling(true);
    setDx(goingLeft ? -off : off);
    settleTimer.current = setTimeout(action, SWIPE_SETTLE_MS);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    setSettling(false);
    swipedRef.current = false;
    dragRef.current = {
      startX: event.clientX,
      // A revealed card is already fully clear, so a new drag starts from
      // wherever it currently sits rather than from zero.
      originDx: dx,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) > SWIPE_DEADZONE_PX) drag.moved = true;
    if (!drag.moved) return;
    // Past the commit point the card only gives a third of the travel, so the
    // gesture feels like it is dragging against something rather than
    // coasting -- and a short accidental brush never reaches the threshold.
    const threshold = commitDistance();
    const next = drag.originDx + delta;
    const resisted =
      Math.abs(next) <= threshold
        ? next
        : Math.sign(next) *
          (threshold + (Math.abs(next) - threshold) / SWIPE_OVERSHOOT);
    const limit = threshold * (1 + 1 / SWIPE_OVERSHOOT);
    setDx(resisted > limit ? limit : resisted < -limit ? -limit : resisted);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !drag.moved) return;

    // Recomputed from the pointer rather than read back from `dx`, which is a
    // render behind by the time the finger lifts.
    const finalDx = drag.originDx + (event.clientX - drag.startX);

    setSettling(true);

    if (revealed) {
      // Dragged back towards the card's home position: put everything back to
      // normal. The card is off-screen while revealed, so this drag has to
      // start on the button that replaced it.
      if (Math.abs(finalDx) < Math.abs(drag.originDx) * SWIPE_CLOSE_RATIO) {
        setDx(0);
        onReveal(false);
        return;
      }
      // Not far enough back: snap out to fully revealed again.
      setDx(drag.originDx);
      return;
    }

    // A closed card can only ever reveal. It never acts on the swipe alone.
    if (finalDx !== 0) {
      setDx(finalDx < 0 ? -offScreenDistance() : offScreenDistance());
      onReveal(true);
    } else {
      setDx(0);
    }
  };

  /** Shared by the card and, while revealed, the button standing in for it. */
  const swipeHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  const showingDelete = dx < 0;

  return (
    <li
      className={`relative overflow-hidden rounded-2xl ${
        revealed ? "z-[110]" : ""
      }`}
    >
      {/* One panel covering the whole card; the direction decides the action.
          Mid-drag it is just a preview, so it is inert. Once the card parks it
          becomes a real button: the swipe never acts on its own, and this tap
          is what actually deletes or reorders. */}
      <button
        type="button"
        disabled={!revealed}
        {...(revealed ? swipeHandlers : {})}
        onClick={() =>
          onTap(() => {
            if (!revealed) return;
            onReveal(false);
            runAction(showingDelete ? onDelete : onAddMore);
          })
        }
        aria-hidden={!revealed}
        tabIndex={revealed ? 0 : -1}
        aria-label={
          showingDelete
            ? `Remove ${restaurant.name} from your cart`
            : `Add more items from ${restaurant.name}`
        }
        className={`absolute inset-0 flex touch-pan-y select-none items-center justify-center gap-2 text-white ${
          revealed ? "" : "pointer-events-none"
        }`}
        style={{ background: showingDelete ? "var(--error)" : "var(--primary)" }}
      >
        {showingDelete ? <Trash2 className="size-6" /> : <Plus className="size-6" />}
        <span className="text-base font-bold">
          {showingDelete ? "Delete" : "Add more"}
        </span>
      </button>

      <div
        ref={cardRef}
        {...swipeHandlers}
        style={{
          transform: `translateX(${dx}px)`,
          transition: settling ? `transform ${SWIPE_SETTLE_MS}ms ease-out` : "none",
        }}
        className="relative touch-pan-y select-none rounded-2xl border border-line bg-surface p-4"
      >
        <div className="flex items-center gap-3">
          {/* Restaurant identity leads on the left, the way the restaurant
              cards and search results already present it. */}
          <div className="size-12 flex-shrink-0 overflow-hidden rounded-full border border-line bg-[var(--muted)]">
            <ImageWithFallback
              src={restaurant.image}
              alt={restaurant.name}
              className="size-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-[var(--ink)]">
              {restaurant.name}
            </h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              {restaurant.items.length}{" "}
              {restaurant.items.length === 1 ? "item" : "items"} · From{" "}
              {restaurant.estimatedTime}
            </p>
          </div>

          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onTap(onOpenOptions)}
            aria-haspopup="dialog"
            aria-label={`Cart options for ${restaurant.name}`}
            className="grid size-10 flex-shrink-0 place-items-center rounded-full transition-transform active:scale-90"
          >
            <MoreVertical className="size-5 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Items as icons in a row, with the add button as the last thing in
            that row so it always sits beside the final item rather than being
            pinned to the edge of the card. */}
        <div className="mt-3 flex gap-2 overflow-x-auto snap-x">
          {restaurant.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTap(onOpenCheckout)}
              aria-label={`${item.name}, quantity ${item.quantity}. View cart`}
              className="relative size-12 flex-shrink-0 snap-start overflow-hidden rounded-xl border border-line"
            >
              <ImageWithFallback
                src={item.image}
                alt={item.name}
                className="size-full object-cover"
              />
              {item.quantity > 1 && (
                <span className="absolute right-0 top-0 grid min-w-5 place-items-center rounded-bl-lg bg-[var(--ink-solid)] px-1 text-[10px] font-bold leading-none text-white">
                  {item.quantity}
                </span>
              )}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onTap(onAddMore)}
            aria-label={`Add more items from ${restaurant.name}`}
            className="grid size-12 flex-shrink-0 snap-start place-items-center rounded-xl border-2 border-dashed border-[var(--border)] transition-transform active:scale-90"
          >
            <Plus className="size-5 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* The total sits above the button and stays right-aligned; the button
            itself spans the full card width with its label centred. */}
        <div className="mt-4 flex items-baseline justify-end">
          <span className="text-lg font-bold text-[var(--ink)]">
            ₱{restaurantSubtotal(restaurant).toFixed(2)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onTap(onOpenCheckout)}
          className="-mx-4 mt-1 flex w-[calc(100%+2rem)] items-center justify-center border-t border-line px-4 py-3 transition-opacity active:opacity-70"
        >
          <span className="text-sm font-bold text-[var(--ink)]">View cart</span>
        </button>
      </div>
    </li>
  );
}

/** Grabber plus the single header row: all the minimised sheet shows. */
const SHEET_MIN_PX = 112;
/** Three 56px rows, the header, the grabber and the padding below them. */
const SHEET_OPTIONS_PX = 300;
const SHEET_MAX_VH = 0.88;

interface SheetProps {
  restaurant: CartRestaurant;
  onClose: () => void;
  onAddMore: () => void;
  onRequestDelete: () => void;
}

/**
 * The cart options sheet.
 *
 * Same mechanism as the "Address near you" sheet on the pin map: the height
 * lives in state so it can be measured and clamped, the drag itself lives in a
 * ref so a pointermove does not re-render the page, and the grabber alone
 * carries `touch-none` so a drag starting anywhere else still scrolls the page
 * behind it.
 *
 * Three snap points, because the three-dot button opens it with the options
 * already showing rather than hiding them behind another drag: minimised (grab
 * and title only), options (the resting state), and full screen when dragged
 * to the top. Dragging back down walks back down through them.
 */
function CartOptionsSheet({
  restaurant,
  onClose,
  onAddMore,
  onRequestDelete,
}: SheetProps) {
  const [height, setHeight] = useState(SHEET_OPTIONS_PX);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  /** Full screen: the viewport, capped the same way the map sheet caps it. */
  const fullHeight = () => Math.round(window.innerHeight * SHEET_MAX_VH);

  /** The three stops, ascending. Full screen never falls below the options. */
  const snapPoints = () => [
    SHEET_MIN_PX,
    Math.min(SHEET_OPTIONS_PX, fullHeight()),
    fullHeight(),
  ];

  const optionsVisible = height > (SHEET_MIN_PX + SHEET_OPTIONS_PX) / 2;

  const onPointerDown = (event: React.PointerEvent) => {
    dragRef.current = { startY: event.clientY, startHeight: height };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startY - event.clientY;
    setHeight(
      Math.min(fullHeight(), Math.max(SHEET_MIN_PX, drag.startHeight + delta)),
    );
  };

  /**
   * Snap to the nearest of the three stops, biased by how far the finger
   * travelled so a decisive flick is not ignored for having stopped just short
   * of the middle one.
   */
  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    const travelled = drag.startY - event.clientY;
    const points = snapPoints();

    if (travelled > 60) {
      // Upward flick: one stop further up than where the drag began.
      const i = points.findIndex((p) => p >= drag.startHeight - 1);
      setHeight(points[Math.min(points.length - 1, i + 1)]);
      return;
    }
    if (travelled < -60) {
      setHeight(points[Math.max(0, points.findIndex((p) => p >= drag.startHeight - 1) - 1)]);
      return;
    }
    // Slow drag: settle on whichever stop is nearest.
    let nearest = points[0];
    for (const p of points) {
      if (Math.abs(p - height) < Math.abs(nearest - height)) nearest = p;
    }
    setHeight(nearest);
  };

  const rows: { label: string; onClick: () => void; danger?: boolean }[] = [
    { label: "Add more items", onClick: onAddMore },
    { label: "Delete cart", onClick: onRequestDelete, danger: true },
    { label: "Cancel", onClick: onClose },
  ];

  return (
    <div
      className="fixed inset-0 z-[2200] bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={`Cart options for ${restaurant.name}`}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ height }}
        className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-[var(--surface)] shadow-[0_-8px_32px_rgba(0,0,0,0.28)]"
      >
        {/* `touch-none` here and nowhere else, so the drag moves the sheet
            rather than scrolling the page behind it. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="shrink-0 cursor-grab touch-none px-4 pb-1 pt-3 active:cursor-grabbing"
        >
          <div
            className="mx-auto h-1.5 w-10 rounded-full bg-[var(--border)]"
            aria-hidden="true"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          {/* No title line: the options are the whole sheet. The close button
              stays because it is the only affordance that works without
              reading anything. */}
          <div className="flex shrink-0 justify-end pb-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close options"
              className="grid size-9 place-items-center rounded-full transition-transform active:scale-90"
            >
              <X className="size-5 text-[var(--ink)]" />
            </button>
          </div>

          {optionsVisible && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {rows.map((row) => (
                <button
                  key={row.label}
                  type="button"
                  onClick={row.onClick}
                  className={`flex min-h-14 w-full items-center border-t border-line px-1 text-base font-semibold transition-opacity active:opacity-60 ${
                    row.danger ? "text-[var(--error)]" : "text-[var(--ink)]"
                  }`}
                >
                  {row.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Cart() {
  const navigate = useNavigate();
  const { cartRestaurants, removeRestaurant, getTotalItems } = useCart();
  // Back means "the page I came from"; the browse screen is the answer when
  // there is no history, such as a cold deep link.
  const goBack = usePreviousPage("/customer/food");

  const [optionsFor, setOptionsFor] = useState<CartRestaurant | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CartRestaurant | null>(null);
  // Which card is parked showing its action. Only ever one, so tapping
  // anywhere else can dismiss it.
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const openCheckout = (restaurant: CartRestaurant) => {
    navigate("/customer/cart/checkout", {
      state: { restaurantId: restaurant.id },
    });
  };

  const openRestaurant = (restaurant: CartRestaurant) => {
    setOptionsFor(null);
    navigate(
      `/customer/restaurant-detail?id=${encodeURIComponent(
        restaurant.id,
      )}&name=${encodeURIComponent(restaurant.name)}`,
    );
  };

  const totalItems = getTotalItems();

  return (
    <div className="min-h-screen bg-surface pb-32">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-[var(--border)] bg-surface px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="transition-transform active:scale-90"
          >
            <X className="size-6 text-[var(--ink)]" />
          </button>
          <h1 className="text-xl font-bold text-[var(--ink)]">My Cart</h1>
        </div>
        {cartRestaurants.length > 0 && (
          <span className="text-sm font-semibold text-[var(--muted-foreground)]">
            {totalItems} {totalItems === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {cartRestaurants.length > 0 ? (
        <>
          {/* Tap-away target for a parked card. Below the revealed card, which
              carries z-[110] of its own. */}
          {revealedId && (
            <div
              className="fixed inset-0 z-[100]"
              onClick={() => setRevealedId(null)}
              aria-hidden="true"
            />
          )}
          <ul className="space-y-4 px-5 py-4">
            {cartRestaurants.map((restaurant) => (
              <CartRestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                revealed={revealedId === restaurant.id}
                onReveal={(on) => setRevealedId(on ? restaurant.id : null)}
                onOpenOptions={() => setOptionsFor(restaurant)}
                onOpenCheckout={() => openCheckout(restaurant)}
                onAddMore={() => openRestaurant(restaurant)}
                onDelete={() => {
                  setOptionsFor(null);
                  setRevealedId(null);
                  removeRestaurant(restaurant.id);
                }}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 grid size-24 place-items-center rounded-full bg-[var(--muted)]">
            <ShoppingCart className="size-12 text-[var(--border)]" />
          </div>
          <h3 className="mb-2 text-xl font-bold text-[var(--ink)]">
            Your cart is empty
          </h3>
          <p className="mb-6 text-[var(--muted-foreground)]">
            Add items to get started
          </p>
          <Link to="/customer/food">
            <Button className="bg-[var(--primary)] hover:bg-[var(--primary)]">
              Browse Food
            </Button>
          </Link>
        </div>
      )}

      <BottomNav active="cart" />

      {optionsFor && (
        <CartOptionsSheet
          restaurant={optionsFor}
          onClose={() => setOptionsFor(null)}
          onAddMore={() => openRestaurant(optionsFor)}
          onRequestDelete={() => {
            setPendingDelete(optionsFor);
            setOptionsFor(null);
          }}
        />
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
          <Card
            className="w-full max-w-sm bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-center text-xl font-bold text-[var(--ink)]">
              Remove {pendingDelete.name}?
            </h3>
            <p className="mb-6 text-center text-[var(--muted-foreground)]">
              This takes every item from this restaurant out of your cart.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  removeRestaurant(pendingDelete.id);
                  setPendingDelete(null);
                }}
                className="w-full rounded-2xl bg-[var(--error)] py-4 font-bold text-white transition-transform active:scale-95"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="w-full rounded-2xl bg-[var(--muted)] py-4 font-bold text-[var(--muted-foreground)] transition-transform active:scale-95"
              >
                Cancel
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
