import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, User, Users } from "lucide-react";

/**
 * The floating chat head shared by the customer's and driver's ride screens.
 *
 * Both sides had the same need -- a way to reach the passenger/driver thread
 * from a live ride without leaving the map -- and the driver's version had grown
 * a drag handler, an unread badge, a ripple and edge snapping. Duplicating that
 * for the customer would mean two implementations to keep in step, so this holds
 * the behaviour and each screen only supplies the peer's photo and a callback.
 *
 * Position is stored per `storageKey`, so the two sides do not fight over one
 * shared slot when both are open during a test or a shared device.
 */

/**
 * Breathing room between the docked head and the screen edge.
 *
 * Also the clearance it keeps from the bottom tab bar, which is `z-[1500]`.
 * Docking it 8px off the edge would otherwise park it underneath the nav, where
 * it renders but cannot be tapped.
 */
const GAP = 8;

/**
 * Stacking order.
 *
 * Had to clear three things it was colliding with: the customer's ride card and
 * the driver's sheet both sit at `z-[1100]`, which the head originally matched --
 * an exact tie, so paint order decided whether it was visible -- and the bottom
 * tab bar is `z-[1500]`, above it. Kept below the full-screen overlays
 * (`z-[3000]`+), so a modal still covers the head rather than the head floating
 * over a dialog.
 */
const Z_INDEX = 'z-[1600]';

/** Beyond this the gesture counts as a drag rather than a tap. */
const TAP_SLOP = 6;

/**
 * Whether a stored avatar value is actually a URL.
 *
 * `chat_conversations.participant_*_avatar` is only URL-shaped for accounts that
 * have set a photo. For everyone else it holds a name-initial or an emoji, and
 * passing that to `<img src>` renders the browser's broken-image icon inside the
 * circle -- which is exactly what the head was showing.
 */
function isImageUrl(value: string | null | undefined): value is string {
  const v = value?.trim() || '';
  return /^https?:\/\//i.test(v) || v.startsWith('data:image/');
}

type Side = 'left' | 'right';

export default function FloatingChatHead({
  storageKey,
  peerAvatar,
  peerIsGroup,
  peerLabel,
  unread,
  pulseKey,
  opened,
  onOpen,
  onInitialResolve,
}: {
  /** Distinct per side, e.g. `trikeserve_chat_head_pos_rider`. */
  storageKey: string;
  peerAvatar: string | null;
  /** A shared ride has several passengers and no single face to show. */
  peerIsGroup?: boolean;
  peerLabel: string;
  unread: number;
  /** Bump to replay the ripple; see `pulseKey` in ActiveRide. */
  pulseKey: number;
  /**
   * Whether chat has been opened on this ride.
   *
   * Switches the head from mid-screen to the top-right corner, and is what the
   * caller sets when it navigates into the thread.
   */
  opened?: boolean;
  onOpen: () => void;
  /**
   * Called once on mount so the parent can resolve the conversation.
   *
   * The head needs to know whether anything is unread before it is ever tapped,
   * so the id has to be known up front rather than on first click.
   */
  onInitialResolve?: () => void;
}) {
  const headRef = useRef<HTMLButtonElement | null>(null);
  const pos = useRef({ x: 0, y: 0 });
  const placed = useRef(false);
  const moved = useRef(false);
  const drag = useRef<{ dx: number; dy: number; side?: Side } | null>(null);

  /**
   * Which edge it is docked to.
   *
   * State, not a ref: the unread badge renders on the opposite side to the edge,
   * so docking must repaint. A ref left the badge holding the class from the
   * last unrelated render.
   */
  const [side, setSide] = useState<Side>('left');
  /**
   * Whether the position has been measured yet.
   *
   * The button is always rendered -- hidden with `opacity-0` -- because it has to
   * be in the tree for its ref to exist. Gating the render on this flag instead
   * made the component unable to measure itself: not mounted, no ref, never
   * placed.
   */
  const [placed2, setPlaced2] = useState(false);
  const [mountRetry, setMountRetry] = useState(0);
  const retryRef = useRef<number | null>(null);

  const read = (): { x: number; y: number; side: Side } | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null;
      return { x: p.x, y: p.y, side: p.side === 'left' ? 'left' : 'right' };
    } catch {
      return null;
    }
  };

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...pos.current, side }));
    } catch {
      // Persistence is a convenience; the head works without it.
    }
  };

  useEffect(() => {
    onInitialResolve?.();
  }, [onInitialResolve]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = headRef.current;
      // A missing ref means the button is not in the tree yet; retrying on the
      // next frame is the fix. Returning early here instead would deadlock: the
      // component used to hide itself until `placed`, so it never mounted, so the
      // ref never appeared, so it never became visible.
      if (!el) {
        retryRef.current = requestAnimationFrame(() => setMountRetry((n) => n + 1));
        return;
      }
      const rect = el.getBoundingClientRect();

      const saved = read();
      if (saved) {
        // Re-clamped: the phone may have been rotated or resized since saving,
        // and a raw stored x could be off-screen entirely.
        pos.current = {
          x: Math.min(Math.max(GAP, saved.x), window.innerWidth - rect.width - GAP),
          y: Math.min(Math.max(0, saved.y), window.innerHeight - rect.height),
        };
        setSide(saved.side);
      } else {
        // First appearance: right edge at mid height -- clear of the map's zoom
        // controls, the route line, and the ride sheet along the bottom.
        pos.current = {
          x: Math.round(window.innerWidth - rect.width - GAP),
          y: Math.round(window.innerHeight * 0.42),
        };
        setSide('right');
      }

      placed.current = true;
      // Applied directly; state would re-render the map on every move.
      el.style.left = `${pos.current.x}px`;
      el.style.top = `${pos.current.y}px`;
      setPlaced2(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (retryRef.current) cancelAnimationFrame(retryRef.current);
    };
  }, [mountRetry]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const el = headRef.current;
    if (!el) return;
    moved.current = false;
    const rect = el.getBoundingClientRect();
    // Remember where inside the button the finger landed, so the head does not
    // snap its corner to the touch point.
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    el.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      // A few pixels of wobble is a tap on a phone, not a drag.
      if (
        !moved.current &&
        (Math.abs(ev.clientX - e.clientX) > TAP_SLOP || Math.abs(ev.clientY - e.clientY) > TAP_SLOP)
      ) {
        moved.current = true;
      }
      const w = rect.width;
      const h = rect.height;
      const x = Math.min(Math.max(0, ev.clientX - drag.current.dx), window.innerWidth - w);
      const y = Math.min(Math.max(0, ev.clientY - drag.current.dy), window.innerHeight - h);
      pos.current = { x: Math.round(x), y: Math.round(y) };
      el.style.left = `${pos.current.x}px`;
      el.style.top = `${pos.current.y}px`;
      // Decided during the drag but applied on release, so it does not jump
      // sides under the finger mid-gesture.
      drag.current.side = pos.current.x + w / 2 < window.innerWidth / 2 ? 'left' : 'right';
    };

    const onUp = () => {
      // Snap to the edge it was released nearest, so it never ends up covering
      // whatever the driver or customer is looking at.
      const w = rect.width;
      const h = rect.height;
      const next =
        drag.current?.side ??
        (pos.current.x + w / 2 < window.innerWidth / 2 ? 'left' : 'right');

      pos.current = {
        x: next === 'left' ? GAP : Math.round(window.innerWidth - w - GAP),
        y: Math.min(Math.max(0, pos.current.y), window.innerHeight - h),
      };
      setSide(next);
      el.style.left = `${pos.current.x}px`;
      el.style.top = `${pos.current.y}px`;
      save();

      drag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [storageKey]);

  /**
   * Park the head in the top-right corner once chat has been opened.
   *
   * Reading happens in the Messages tab, so on the way back the head would
   * otherwise still be sitting mid-screen -- exactly where it covers the map.
   * The top right is the one corner guaranteed clear of the ride sheet, the
   * pickup/drop-off labels and the driver's route line.
   *
   * Persisted, so it stays there for the rest of the ride rather than being
   * dragged back on the next mount.
   */
  useEffect(() => {
    if (!opened) return;
    const raf = requestAnimationFrame(() => {
      const el = headRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      pos.current = { x: Math.round(window.innerWidth - w - GAP), y: GAP };
      setSide('right');
      el.style.left = `${pos.current.x}px`;
      el.style.top = `${pos.current.y}px`;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...pos.current, side: 'right' }));
      } catch {
        // Not fatal; it will simply re-park next time.
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [opened, storageKey]);

  return (
    <button
      ref={headRef}
      type="button"
      style={{
        left: pos.current.x,
        top: pos.current.y,
        // Hidden until measured, but always in the tree so the ref exists.
        opacity: placed2 ? 1 : 0,
      }}
      onPointerDown={onPointerDown}
      onClick={() => {
        // Pointer capture means the browser fires click after a drag too.
        // Swallowing it is what makes "drag to move" and "tap to open" two
        // distinct actions.
        if (moved.current) {
          moved.current = false;
          return;
        }
        onOpen();
      }}
      aria-label={`Chat with ${peerLabel}. Drag to move.`}
      className={`fixed ${Z_INDEX} grid size-14 place-items-center overflow-visible rounded-full bg-[var(--surface)] border-2 border-[var(--primary)] shadow-xl touch-none select-none`}
    >
      {/*
          Ripple.

          Loops for as long as anything is unread, and stops the moment the count
          hits zero. A single play left a dead control: the pulse was the only cue
          that a reply was waiting, so it has to keep going until it is read.

          `key` remounts the rings on each new message so the loop restarts from
          the top rather than continuing mid-cycle.
      */}
      <span
        key={unread > 0 ? pulseKey : 'idle'}
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <span
          className={`absolute inset-0 rounded-full border-2 border-[var(--primary)] ${
            unread > 0 ? 'chat-pulse-ring--loop' : 'chat-pulse-ring'
          }`}
        />
        <span
          className={`absolute inset-0 rounded-full border-2 border-[var(--primary)] ${
            unread > 0 ? 'chat-pulse-ring--loop' : 'chat-pulse-ring'
          }`}
          style={{ animationDelay: '0.45s' }}
        />
      </span>

      {/*
          `rounded-full` plus `overflow-hidden` on the inner wrapper is what crops
          the photo; rounded corners alone leave a square image poking out.

          The URL check matters. `peer.avatar` is only URL-shaped for accounts
          that have set a photo -- for everyone else it holds a name-initial or an
          emoji, and handing that to <img> renders a broken-image icon. Falling
          back to the glyph in that case is what the check buys.
      */}
      <span className="relative size-full overflow-hidden rounded-full">
        {isImageUrl(peerAvatar) ? (
          <img src={peerAvatar} alt="" className="size-full object-cover" draggable={false} />
        ) : peerIsGroup ? (
          <Users className="size-6 text-[var(--primary)]" aria-hidden="true" />
        ) : (
          <User className="size-6 text-[var(--primary)]" aria-hidden="true" />
        )}
      </span>

      {/* Unread count on the side facing into the screen, so it is never clipped
          by the edge the head is docked to. */}
      {unread > 0 && (
        <span
          className={`absolute -top-1 grid min-w-[20px] place-items-center rounded-full bg-[var(--error)] px-1 text-[11px] font-bold text-white shadow ${
            side === 'right' ? '-left-2' : '-right-2'
          }`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
