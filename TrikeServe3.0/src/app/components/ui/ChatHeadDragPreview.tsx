import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ChatHeadDragPosition {
  left: number;
  top: number;
}

const CLOSE_TARGET_SIZE = 56;
const CLOSE_TARGET_BOTTOM = 24;
const CLOSE_TARGET_PADDING = 16;

/** Match the floating chat head's forgiving bottom-center dismiss target. */
export function isChatHeadOverCloseTarget(centerX: number, centerY: number, padding = CLOSE_TARGET_PADDING) {
  const left = (window.innerWidth - CLOSE_TARGET_SIZE) / 2 - padding;
  const top = window.innerHeight - CLOSE_TARGET_BOTTOM - CLOSE_TARGET_SIZE - padding;
  return centerX >= left && centerX <= left + CLOSE_TARGET_SIZE + padding * 2 &&
    centerY >= top && centerY <= top + CLOSE_TARGET_SIZE + padding * 2;
}

/** Center a dragged row head over the same close target used by FloatingChatHead. */
export function getChatHeadClosePosition(width: number, height: number): ChatHeadDragPosition {
  return {
    left: Math.round((window.innerWidth - width) / 2),
    top: Math.round(window.innerHeight - CLOSE_TARGET_BOTTOM - (CLOSE_TARGET_SIZE + height) / 2),
  };
}

/** Animate the row's stationary heads into their newly reordered positions. */
export function animateChatHeadReorder(list: HTMLElement | null, reorder: () => void) {
  const previous = new Map<string, DOMRect>();
  list?.querySelectorAll<HTMLElement>('[data-chat-head-id]').forEach((head) => {
    const id = head.dataset.chatHeadId;
    if (id) previous.set(id, head.getBoundingClientRect());
  });

  reorder();
  if (!list || previous.size === 0) return;

  requestAnimationFrame(() => {
    const moved: HTMLElement[] = [];
    list.querySelectorAll<HTMLElement>('[data-chat-head-id]').forEach((head) => {
      const id = head.dataset.chatHeadId;
      const before = id ? previous.get(id) : null;
      if (!before) return;
      const after = head.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (dx === 0 && dy === 0) return;
      head.style.transition = 'none';
      head.style.transform = `translate(${dx}px, ${dy}px)`;
      moved.push(head);
    });
    if (moved.length === 0) return;

    // Commit the inverse positions, then animate each head into its new slot.
    list.getBoundingClientRect();
    requestAnimationFrame(() => {
      moved.forEach((head) => {
        head.style.transition = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        head.style.transform = '';
      });
      window.setTimeout(() => moved.forEach((head) => {
        head.style.transition = '';
        head.style.transform = '';
      }), 240);
    });
  });
}

/** A pointer-following copy of the selected row head plus the floating X target. */
export default function ChatHeadDragPreview({
  position,
  size,
  overCloseTarget,
  children,
}: {
  position: ChatHeadDragPosition | null;
  size: number;
  overCloseTarget: boolean;
  children: ReactNode;
}) {
  if (!position || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed z-[10002] bottom-6 left-1/2 -translate-x-1/2 transition-transform duration-150 ${overCloseTarget ? 'scale-110' : 'scale-100'}`}
      >
        <span
          className="flex size-14 items-center justify-center rounded-full border-2 text-white shadow-xl transition-colors"
          style={{
            backgroundColor: overCloseTarget ? 'rgba(15, 23, 42, 0.42)' : 'rgba(15, 23, 42, 0.26)',
            borderColor: 'rgba(255, 255, 255, 0.72)',
          }}
        >
          <X className="size-5" strokeWidth={2.5} />
        </span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[10003] will-change-transform"
        style={{
          width: size,
          height: size,
          transform: `translate3d(${position.left}px, ${position.top}px, 0)`,
          transition: 'transform 45ms linear',
        }}
      >
        <div className="grid size-full scale-105 place-items-center overflow-visible rounded-full border-2 border-[var(--primary)] bg-[var(--surface)] opacity-95 shadow-xl">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
