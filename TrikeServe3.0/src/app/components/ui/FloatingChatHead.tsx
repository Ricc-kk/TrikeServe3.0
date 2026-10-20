import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, User, Users, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useChatHeadVisibility } from "../../contexts/ChatHeadVisibilityContext";

/**
 * The floating chat head shared by ride screens and the app-wide chat inbox.
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
 * It stays reachable without sitting directly on top of the device bezel.
 */
const GAP = 8;

/**
 * Stacking order.
 *
 * The app uses layers up through `z-[9999]` for page UI and toasts. The head is
 * deliberately above them so it remains reachable across routes and overlays;
 * an opened chat panel sits one layer above the head.
 */
const Z_INDEX = 'z-[10000]';

/** Beyond this the gesture counts as a drag rather than a tap. */
const TAP_SLOP = 6;
const CLOSE_TARGET_WIDTH = 56;
const CLOSE_TARGET_HEIGHT = 56;
const CLOSE_TARGET_BOTTOM = 24;

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

function isOnCloseTarget(x: number, y: number, width: number, height: number) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const left = (window.innerWidth - CLOSE_TARGET_WIDTH) / 2;
  const top = window.innerHeight - CLOSE_TARGET_BOTTOM - CLOSE_TARGET_HEIGHT;
  return (
    centerX >= left && centerX <= left + CLOSE_TARGET_WIDTH &&
    centerY >= top && centerY <= top + CLOSE_TARGET_HEIGHT
  );
}

/** Move a top-right chat head row below any page header it would cover. */
function clearHeaderOverlap(left: number, right: number, top: number, height: number) {
  if (typeof document === 'undefined') return top;

  let safeTop = top;
  const headers = Array.from(document.querySelectorAll<HTMLElement>('#root header'))
    .map((header) => ({
      rect: header.getBoundingClientRect(),
      style: window.getComputedStyle(header),
    }))
    .filter(({ rect, style }) =>
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left < right &&
      rect.right > left,
    )
    .sort((a, b) => a.rect.top - b.rect.top);

  for (const { rect } of headers) {
    if (rect.top < safeTop + height && rect.bottom > safeTop) {
      safeTop = Math.ceil(rect.bottom + GAP);
    }
  }

  return Math.min(safeTop, Math.max(0, window.innerHeight - height - GAP));
}

function PeerAvatar({
  src,
  label,
  group = false,
  messages = false,
}: {
  src: string | null;
  label: string;
  group?: boolean;
  messages?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = isImageUrl(src) && failedSrc !== src ? src : null;
  const initial = Array.from(label.trim())[0]?.toLocaleUpperCase();

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        className="size-full object-cover"
        draggable={false}
        onError={() => setFailedSrc(imageSrc)}
      />
    );
  }
  if (group) return <Users className="size-6 text-[var(--primary)]" aria-hidden="true" />;
  if (messages) return <MessageCircle className="size-6 text-[var(--primary)]" aria-hidden="true" />;
  if (!initial) return <User className="size-6 text-[var(--primary)]" aria-hidden="true" />;

  return (
    <span
      className="grid size-full place-items-center bg-[var(--primary)]/10 text-lg font-semibold text-[var(--primary)]"
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

type Side = 'left' | 'right';

export interface FloatingChatHeadStackItem {
  id: string;
  peerAvatar: string | null;
  peerLabel: string;
  peerIsGroup?: boolean;
  unread: number;
  onOpen: () => void;
}

const STACK_PEEK = 14;
const STACK_DRAG_DELAY = 115;
const MAX_STACK_ITEMS = 3;
const CHAT_HEAD_SIZE = 56;
const CHAT_HEAD_ROW_GAP = 8;

export default function FloatingChatHead({
  storageKey,
  dismissalStorageKey,
  peerAvatar,
  peerIsGroup,
  peerIsMessages = false,
  peerLabel,
  unread,
  pulseKey,
  headId,
  stackItems = [],
  showStackItems = false,
  opened,
  onOpen,
  onInitialResolve,
  isGlobal = false,
  hidden = false,
  initialPlacement = 'top-right',
  layoutKey,
  zIndexClass = Z_INDEX,
}: {
  /**
   * Stacking order override.
   *
   * Defaults to `Z_INDEX`, which keeps the head above app pages and overlays.
   * Use an override only when the head needs a distinct position relative to a
   * chat panel.
   */
  zIndexClass?: string;
  /** Whether this is the app-wide instance rather than a screen-specific head. */
  isGlobal?: boolean;
  /** Recheck header clearance when the current route changes. */
  layoutKey?: string;
  /** Keep this head mounted while a screen-specific chat head is active. */
  hidden?: boolean;
  /** Initial position for this head's independent saved position. */
  initialPlacement?: 'center-right' | 'top-right';
  /** Distinct per side, e.g. `trikeserve_chat_head_pos_rider`. */
  storageKey: string;
  /** Persist dismissal across auth-driven unmounts, scoped to the signed-in account. */
  dismissalStorageKey?: string;
  peerAvatar: string | null;
  /** A shared ride has several passengers and no single face to show. */
  peerIsGroup?: boolean;
  /** Use a generic message icon when the user has no conversation yet. */
  peerIsMessages?: boolean;
  peerLabel: string;
  unread: number;
  /** Bump to replay the ripple; see `pulseKey` in ActiveRide. */
  pulseKey: number;
  /** Stable conversation id, used to animate a newly promoted top head. */
  headId?: string;
  /** Recent conversations shown beside the latest head or revealed on drag. */
  stackItems?: FloatingChatHeadStackItem[];
  /** Show the stack as a single row instead of revealing it only while dragging. */
  showStackItems?: boolean;
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
  const { user } = useAuth();
  const { registerLocalHead, openedConversationId } = useChatHeadVisibility();
  const resolvedDismissalStorageKey = dismissalStorageKey ?? (
    user?.id
      ? `trikeserve_global_chat_head_dismissed_${user.id}`
      : undefined
  );
  const groupRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLButtonElement | null>(null);
  const stackHeadRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousHeadIdRef = useRef(headId || null);
  const pos = useRef({ x: 0, y: 0 });
  const placed = useRef(false);
  const moved = useRef(false);
  const drag = useRef<{ dx: number; dy: number; side?: Side } | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);

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
  const [viewportWidth, setViewportWidth] = useState(0);
  const [mountRetry, setMountRetry] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverCloseTarget, setIsOverCloseTarget] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (!resolvedDismissalStorageKey || typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(resolvedDismissalStorageKey) === 'true';
    } catch {
      return false;
    }
  });
  const previousDismissalStorageKeyRef = useRef(resolvedDismissalStorageKey);
  // Only a new message or a user-opened chat should restore a dismissed head.
  // Conversation metadata changes and routine page rerenders do not.
  const openedThreadRoute = isGlobal && /\/messages\/(?:thread|business|driver)\//.test(layoutKey || '');
  const manualOpenSignal = openedConversationId && (isGlobal || openedConversationId === headId)
    ? `conversation:${openedConversationId}`
    : openedThreadRoute ? `route:${layoutKey}` : '';
  const dismissalActivityKey = `${pulseKey}:${manualOpenSignal}`;
  // Establish the current route as the baseline on mount. If auth restores a
  // thread URL, it must not look like a manual open and clear a saved dismissal.
  const previousDismissalActivityKeyRef = useRef(dismissalActivityKey);
  const parkAfterRestoreRef = useRef(false);
  const retryRef = useRef<number | null>(null);

  const maxRowHeadCount = viewportWidth > 0
    ? Math.max(1, Math.floor((viewportWidth - GAP * 2 + CHAT_HEAD_ROW_GAP) / (CHAT_HEAD_SIZE + CHAT_HEAD_ROW_GAP)))
    : 1;
  const visibleStackItems = showStackItems
    ? stackItems.slice(0, maxRowHeadCount - 1)
    : stackItems.slice(0, MAX_STACK_ITEMS);

  const positionStackHeads = useCallback((nextSide: Side, animated: boolean) => {
    const direction = nextSide === 'right' ? -1 : 1;
    const offset = showStackItems ? CHAT_HEAD_SIZE + CHAT_HEAD_ROW_GAP : STACK_PEEK;
    stackHeadRefs.current.slice(0, visibleStackItems.length).forEach((el, index) => {
      if (!el) return;
      el.style.transition = animated
        ? `left ${STACK_DRAG_DELAY}ms ease-out, top ${STACK_DRAG_DELAY}ms ease-out`
        : 'none';
      // Stack heads share the main head's positioned wrapper. Their offset is
      // relative to that wrapper so dragging the stack cannot leave them behind.
      el.style.left = `${direction * offset * (index + 1)}px`;
      el.style.top = '0px';
    });
  }, [showStackItems, visibleStackItems.length]);

  useLayoutEffect(() => {
    if (isGlobal) return;
    return registerLocalHead(headId);
  }, [headId, isGlobal, registerLocalHead]);

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

  const save = useCallback((savedSide: Side) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...pos.current, side: savedSide }));
    } catch {
      // Persistence is a convenience; the head works without it.
    }
  }, [storageKey]);

  const parkAtTopRight = useCallback(() => {
    const el = headRef.current;
    const group = groupRef.current;
    if (!el || !group) return;
    const rect = el.getBoundingClientRect();
    const width = rect.width;
    const step = showStackItems ? CHAT_HEAD_SIZE + CHAT_HEAD_ROW_GAP : STACK_PEEK;
    const x = Math.max(GAP, Math.round(window.innerWidth - width - GAP));
    const stackWidth = showStackItems ? step * visibleStackItems.length : 0;
    const rowLeft = showStackItems ? Math.max(GAP, x - stackWidth) : x;
    pos.current = {
      x,
      y: isGlobal
        ? clearHeaderOverlap(rowLeft, x + width, GAP, rect.height)
        : GAP,
    };
    setSide('right');
    group.style.left = `${pos.current.x}px`;
    group.style.top = `${pos.current.y}px`;
    positionStackHeads('right', false);
    save('right');
  }, [isGlobal, positionStackHeads, save, showStackItems, visibleStackItems.length]);

  useLayoutEffect(() => {
    if (!isGlobal || !placed2 || !placed.current || dismissed) return;

    const moveBelowHeader = () => {
      const el = headRef.current;
      const group = groupRef.current;
      if (!el || !group) return;
      const rect = el.getBoundingClientRect();
      const step = showStackItems ? CHAT_HEAD_SIZE + CHAT_HEAD_ROW_GAP : STACK_PEEK;
      const stackWidth = showStackItems ? step * visibleStackItems.length : 0;
      const rowLeft = side === 'right' ? pos.current.x - stackWidth : pos.current.x;
      const rowRight = side === 'right'
        ? pos.current.x + rect.width
        : pos.current.x + rect.width + stackWidth;
      const safeTop = clearHeaderOverlap(rowLeft, rowRight, pos.current.y, rect.height);
      if (safeTop <= pos.current.y) return;

      pos.current = { ...pos.current, y: safeTop };
      group.style.top = `${safeTop}px`;
      positionStackHeads(side, false);
      save(side);
    };

    const frame = requestAnimationFrame(moveBelowHeader);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(moveBelowHeader)
      : null;
    document.querySelectorAll('#root header').forEach((header) => observer?.observe(header));
    window.addEventListener('scroll', moveBelowHeader, true);
    window.addEventListener('resize', moveBelowHeader);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', moveBelowHeader, true);
      window.removeEventListener('resize', moveBelowHeader);
    };
  }, [dismissed, isGlobal, layoutKey, placed2, positionStackHeads, save, showStackItems, side, visibleStackItems.length]);

  useEffect(() => {
    if (!showStackItems) return;
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
      if (placed.current) parkAtTopRight();
    };
    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, [parkAtTopRight, showStackItems]);

  useLayoutEffect(() => {
    if (previousDismissalStorageKeyRef.current === resolvedDismissalStorageKey) return;
    const previousKey = previousDismissalStorageKeyRef.current;
    previousDismissalStorageKeyRef.current = resolvedDismissalStorageKey;

    if (!resolvedDismissalStorageKey && previousKey) {
      // Signing out is not a request to restore an open head on the next
      // session. Keep it dismissed for this account until new chat activity or
      // an explicit manual open clears it.
      try {
        window.localStorage.setItem(previousKey, 'true');
      } catch {
        // Persistence is a convenience; the head works without it.
      }
      setDismissed(true);
      return;
    }

    // Local heads can stay mounted while auth or the active conversation
    // changes. Load that identity's dismissal before the browser paints, and
    // treat the identity change itself as neither a new message nor a manual
    // open.
    previousDismissalActivityKeyRef.current = dismissalActivityKey;
    let nextDismissed = false;
    if (resolvedDismissalStorageKey) {
      try {
        nextDismissed = window.localStorage.getItem(resolvedDismissalStorageKey) === 'true';
      } catch {
        // Persistence is a convenience; the head works without it.
      }
    }
    setDismissed(nextDismissed);
  }, [dismissalActivityKey, resolvedDismissalStorageKey]);

  useLayoutEffect(() => {
    if (previousDismissalActivityKeyRef.current === dismissalActivityKey) return;
    previousDismissalActivityKeyRef.current = dismissalActivityKey;
    if (dismissed) {
      if (resolvedDismissalStorageKey) {
        try {
          window.localStorage.removeItem(resolvedDismissalStorageKey);
        } catch {
          // Persistence is a convenience; the head works without it.
        }
      }
      // The dismissed render has no head element to move yet. Reposition in the
      // layout effect that runs after the restored button is mounted.
      parkAfterRestoreRef.current = true;
      setDismissed(false);
      return;
    }
    // A head that is still mounted can be moved before the new activity paints.
    parkAtTopRight();
  }, [dismissalActivityKey, dismissed, parkAtTopRight, resolvedDismissalStorageKey]);

  useLayoutEffect(() => {
    if (dismissed || !parkAfterRestoreRef.current) return;
    parkAfterRestoreRef.current = false;
    // A dismissed head stays at the drop point in memory. Reopening it there
    // puts it directly on top of the bottom close target, so restore it to the
    // top right once the button exists again.
    parkAtTopRight();
  }, [dismissed, parkAtTopRight]);

  useEffect(() => {
    onInitialResolve?.();
  }, [onInitialResolve]);

  useEffect(() => () => {
    pointerCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (dismissed || !user?.id) return;
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
      const savedOnCloseTarget = saved && isOnCloseTarget(saved.x, saved.y, rect.width, rect.height);
      if (saved && !savedOnCloseTarget && !showStackItems) {
        // Re-clamped: the phone may have been rotated or resized since saving,
        // and a raw stored x could be off-screen entirely.
        const x = Math.min(Math.max(GAP, saved.x), window.innerWidth - rect.width - GAP);
        const y = Math.min(Math.max(0, saved.y), window.innerHeight - rect.height);
        const safeY = isGlobal
          ? clearHeaderOverlap(x, x + rect.width, y, rect.height)
          : y;
        pos.current = { x, y: safeY };
        if (safeY !== y) save(saved.side);
        setSide(saved.side);
      } else {
        // Global rows stay anchored at the top-right; standalone heads use the
        // configured placement when first shown or recovered from the close area.
        const x = Math.max(GAP, Math.round(window.innerWidth - rect.width - GAP));
        const step = showStackItems ? CHAT_HEAD_SIZE + CHAT_HEAD_ROW_GAP : STACK_PEEK;
        const stackWidth = showStackItems ? step * visibleStackItems.length : 0;
        const rowLeft = showStackItems ? Math.max(GAP, x - stackWidth) : x;
        const y = isGlobal
          ? clearHeaderOverlap(rowLeft, x + rect.width, GAP, rect.height)
          : initialPlacement === 'top-right' ? GAP : Math.round(window.innerHeight * 0.42);
        pos.current = { x, y };
        setSide('right');
        if (savedOnCloseTarget || showStackItems) save('right');
      }

      placed.current = true;
      // The wrapper moves the main head and its stack as one unit. Applied
      // directly; state would re-render the map on every move.
      const group = groupRef.current;
      if (group) {
        group.style.left = `${pos.current.x}px`;
        group.style.top = `${pos.current.y}px`;
      }
      positionStackHeads(showStackItems ? 'right' : saved?.side ?? 'right', false);
      setPlaced2(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (retryRef.current) cancelAnimationFrame(retryRef.current);
    };
  }, [dismissed, initialPlacement, isGlobal, mountRetry, positionStackHeads, save, showStackItems, user?.id, visibleStackItems.length]);

  useEffect(() => {
    if (placed.current) positionStackHeads(side, false);
  }, [side, visibleStackItems.length, positionStackHeads]);

  const stackAnimationKey = visibleStackItems.map((item) => item.id).join('|');
  useEffect(() => {
    if (!headId) return;
    const previousHeadId = previousHeadIdRef.current;
    previousHeadIdRef.current = headId;
    if (!previousHeadId || previousHeadId === headId) return;
    headRef.current?.animate?.(
      [
        { transform: `translateX(${side === 'right' ? '10px' : '-10px'}) scale(0.9)`, opacity: 0.65 },
        { transform: 'translateX(0) scale(1.04)', opacity: 1, offset: 0.72 },
        { transform: 'translateX(0) scale(1)', opacity: 1 },
      ],
      { duration: 230, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [headId, side]);

  useEffect(() => {
    const stackHeads = stackHeadRefs.current.slice(0, visibleStackItems.length);
    if (!isDragging || hidden) {
      stackHeads.forEach((el) => el?.getAnimations().forEach((animation) => animation.cancel()));
      return;
    }
    if (!placed2 || !stackAnimationKey) return;
    const revealSide = drag.current?.side ?? side;
    stackHeads.forEach((el, index) => {
      if (!el?.animate) return;
      el.animate(
        [
          { transform: `translateX(${revealSide === 'right' ? '8px' : '-8px'}) scale(0.92)`, opacity: 0.55 },
          { transform: 'translateX(0) scale(1)', opacity: 1 },
        ],
        { duration: 190, delay: index * 35, easing: 'ease-out' },
      );
    });
  }, [hidden, isDragging, placed2, side, stackAnimationKey, visibleStackItems.length]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const el = headRef.current;
    if (!el) return;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    pointerCleanupRef.current?.();
    moved.current = false;
    setIsDragging(false);
    setIsOverCloseTarget(false);
    const rect = el.getBoundingClientRect();
    // Remember where inside the button the finger landed, so the head does not
    // snap its corner to the touch point.
    drag.current = { dx: startX - rect.left, dy: startY - rect.top };
    el.setPointerCapture?.(pointerId);

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
    };

    const snapToEdge = () => {
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
      const group = groupRef.current;
      if (group) {
        group.style.left = `${pos.current.x}px`;
        group.style.top = `${pos.current.y}px`;
      }
      positionStackHeads(next, false);
      save(next);
    };

    const onMove = (ev: PointerEvent) => {
      if (!drag.current || ev.pointerId !== pointerId) return;
      // A few pixels of wobble is a tap on a phone, not a drag.
      if (
        !moved.current &&
        (Math.abs(ev.clientX - startX) > TAP_SLOP || Math.abs(ev.clientY - startY) > TAP_SLOP)
      ) {
        moved.current = true;
        setIsDragging(true);
      }
      const w = rect.width;
      const h = rect.height;
      const x = Math.min(Math.max(0, ev.clientX - drag.current.dx), window.innerWidth - w);
      const y = Math.min(Math.max(0, ev.clientY - drag.current.dy), window.innerHeight - h);
      pos.current = { x: Math.round(x), y: Math.round(y) };
      const group = groupRef.current;
      if (group) {
        group.style.left = `${pos.current.x}px`;
        group.style.top = `${pos.current.y}px`;
      }
      // Decided during the drag but applied on release, so it does not jump
      // sides under the finger mid-gesture.
      drag.current.side = pos.current.x + w / 2 < window.innerWidth / 2 ? 'left' : 'right';
      positionStackHeads(drag.current.side, true);
      setIsOverCloseTarget(moved.current && isOnCloseTarget(pos.current.x, pos.current.y, w, h));
    };

    const onUp = (ev: PointerEvent) => {
      if (!drag.current || ev.pointerId !== pointerId) return;
      const w = rect.width;
      const h = rect.height;
      const shouldDismiss = moved.current && isOnCloseTarget(pos.current.x, pos.current.y, w, h);
      drag.current = null;
      cleanup();
      setIsDragging(false);
      setIsOverCloseTarget(false);

      if (shouldDismiss) {
        if (resolvedDismissalStorageKey) {
          try {
            window.localStorage.setItem(resolvedDismissalStorageKey, 'true');
          } catch {
            // Persistence is a convenience; the head works without it.
          }
        }
        setDismissed(true);
        return;
      }

      // Snap to the edge it was released nearest, so it never ends up covering
      // whatever the driver or customer is looking at.
      snapToEdge();
    };

    const onCancel = (ev: PointerEvent) => {
      if (!drag.current || ev.pointerId !== pointerId) return;
      drag.current = null;
      cleanup();
      setIsDragging(false);
      setIsOverCloseTarget(false);
      snapToEdge();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    pointerCleanupRef.current = cleanup;
  }, [positionStackHeads, resolvedDismissalStorageKey, save]);

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
      const group = groupRef.current;
      if (!el || !group) return;
      const w = el.getBoundingClientRect().width;
      pos.current = { x: Math.max(GAP, Math.round(window.innerWidth - w - GAP)), y: GAP };
      setSide('right');
      group.style.left = `${pos.current.x}px`;
      group.style.top = `${pos.current.y}px`;
      positionStackHeads('right', false);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...pos.current, side: 'right' }));
      } catch {
        // Not fatal; it will simply re-park next time.
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [opened, positionStackHeads, storageKey]);

  if (dismissed || !user?.id) return null;
  const stackSide = isDragging ? drag.current?.side ?? side : side;
  const isThisConversationOpen = Boolean(headId && openedConversationId === headId);
  const isHidden = hidden || isThisConversationOpen;

  return createPortal(
    <div
      ref={groupRef}
      style={{
        left: pos.current.x,
        top: pos.current.y,
        opacity: placed2 && !isHidden ? 1 : 0,
        pointerEvents: isHidden ? 'none' : 'auto',
      }}
      className={`fixed ${zIndexClass} size-14`}
    >
      {visibleStackItems.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => { stackHeadRefs.current[index] = el; }}
          type="button"
          style={{
            left: (stackSide === 'right' ? -1 : 1) *
              (showStackItems ? CHAT_HEAD_SIZE + CHAT_HEAD_ROW_GAP : STACK_PEEK) * (index + 1),
            top: 0,
            opacity: showStackItems || isDragging ? 1 : 0,
            pointerEvents: isHidden || (!showStackItems && !isDragging) ? 'none' : 'auto',
            zIndex: visibleStackItems.length - index,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            item.onOpen();
          }}
          aria-label={`Chat with ${item.peerLabel}`}
          aria-hidden={isHidden || (!showStackItems && !isDragging) || undefined}
          tabIndex={isHidden || (!showStackItems && !isDragging) ? -1 : undefined}
          className="absolute grid size-14 place-items-center overflow-visible rounded-full border-2 border-[var(--border)] bg-[var(--surface)] shadow-xl touch-none select-none"
        >
          <span className="relative size-full overflow-hidden rounded-full">
            <PeerAvatar
              src={item.peerAvatar}
              label={item.peerLabel}
              group={item.peerIsGroup}
            />
          </span>
          {item.unread > 0 && (
            <span className="absolute -top-1 right-0 grid min-w-[16px] place-items-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold text-[var(--primary-foreground)] shadow">
              {item.unread > 99 ? '99+' : item.unread}
            </span>
          )}
        </button>
      ))}
      <button
      ref={headRef}
      type="button"
      style={{
        left: 0,
        top: 0,
        zIndex: visibleStackItems.length + 1,
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
      aria-hidden={isHidden || undefined}
      tabIndex={isHidden ? -1 : undefined}
      className="absolute grid size-14 place-items-center overflow-visible rounded-full bg-[var(--surface)] border-2 border-[var(--primary)] shadow-xl touch-none select-none"
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
          The wrapper crops profile photos to a circle. Missing, non-URL, or
          failed photos fall back to the peer's initial so a profile without a
          photo still has a clear chat head.
      */}
      <span className="relative size-full overflow-hidden rounded-full">
        <PeerAvatar
          src={peerAvatar}
          label={peerLabel}
          group={peerIsGroup}
          messages={peerIsMessages}
        />
      </span>

      {/* Unread count on the side facing into the screen, so it is never clipped
          by the edge the head is docked to. */}
      {unread > 0 && (
        <span
          className={`absolute -top-1 grid min-w-[20px] place-items-center rounded-full bg-[var(--primary)] px-1 text-[11px] font-bold text-[var(--primary-foreground)] shadow ${
            side === 'right' ? '-left-2' : '-right-2'
          }`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      </button>
      {isDragging && !isHidden && (
        <div
          aria-hidden="true"
          className={`fixed ${zIndexClass} pointer-events-none bottom-6 left-1/2 -translate-x-1/2 transition-transform duration-150 ${isOverCloseTarget ? 'scale-110' : 'scale-100'}`}
        >
          <span className={`flex h-14 w-14 items-center justify-center rounded-full border-2 shadow-xl transition-colors ${isOverCloseTarget ? 'border-red-700 bg-red-700 text-white' : 'border-red-500 bg-red-600 text-white'}`}>
            <X className="size-5" strokeWidth={2.5} />
          </span>
        </div>
      )}
    </div>,
    document.body,
  );
}
