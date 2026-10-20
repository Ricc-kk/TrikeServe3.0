import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

type ScrollDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  target: HTMLElement;
  dragging: boolean;
};

const scrollableOverflow = new Set(["auto", "scroll", "overlay"]);

export default function BusinessScrollBehavior() {
  const { pathname } = useLocation();
  const dragRef = useRef<ScrollDrag | null>(null);

  useEffect(() => {
    if (pathname !== "/business" && !pathname.startsWith("/business/")) return;

    const root = document.documentElement;
    const scrollMarker = "businessScrollTarget";
    root.classList.add("business-scroll-mode");

    const markScrollable = (element: Element) => {
      if (!(element instanceof HTMLElement)) return;
      const isDocumentScroller = element === document.scrollingElement;
      const isScrollable = isDocumentScroller || scrollableOverflow.has(window.getComputedStyle(element).overflowY);

      if (isScrollable) element.dataset[scrollMarker] = "true";
      else delete element.dataset[scrollMarker];
    };

    const scan = (element: HTMLElement) => {
      markScrollable(element);
      element.querySelectorAll<HTMLElement>("*").forEach(markScrollable);
    };

    scan(document.body);
    markScrollable(root);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          markScrollable(record.target as Element);
          continue;
        }

        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node);
        });
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      subtree: true,
    });

    const resetDrag = () => {
      dragRef.current = null;
      root.classList.remove("business-scroll-dragging");
    };

    const beginDrag = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !(event.target instanceof Element)) return;
      if (event.target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='slider'], [data-business-no-scroll-drag], .gm-style, canvas",
      )) return;

      let target: HTMLElement | null = event.target as HTMLElement;
      while (target) {
        const canScroll = target.dataset[scrollMarker] === "true" && target.scrollHeight > target.clientHeight + 1;
        if (canScroll) break;
        target = target.parentElement;
      }
      if (!target) return;

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollTop: target.scrollTop,
        target,
        dragging: false,
      };
    };

    const moveDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !drag.target.isConnected) return;

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.dragging && (Math.abs(deltaY) < 4 || Math.abs(deltaY) <= Math.abs(deltaX))) return;

      if (!drag.dragging) {
        drag.dragging = true;
        root.classList.add("business-scroll-dragging");
        try {
          drag.target.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort; the document listeners still track the drag.
        }
      }

      drag.target.scrollTop = drag.startScrollTop - deltaY;
      event.preventDefault();
    };

    const endDrag = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) resetDrag();
    };

    const onWindowBlur = () => {
      if (dragRef.current?.dragging) resetDrag();
    };

    document.addEventListener("pointerdown", beginDrag, true);
    document.addEventListener("pointermove", moveDrag, { passive: false });
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    document.addEventListener("lostpointercapture", endDrag, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", beginDrag, true);
      document.removeEventListener("pointermove", moveDrag);
      document.removeEventListener("pointerup", endDrag, true);
      document.removeEventListener("pointercancel", endDrag, true);
      document.removeEventListener("lostpointercapture", endDrag, true);
      window.removeEventListener("blur", onWindowBlur);
      resetDrag();
      root.classList.remove("business-scroll-mode");
      root.querySelectorAll<HTMLElement>("[data-business-scroll-target]").forEach((element) => {
        delete element.dataset[scrollMarker];
      });
      document.querySelectorAll<HTMLElement>("[data-business-scroll-target]").forEach((element) => {
        delete element.dataset[scrollMarker];
      });
    };
  }, [pathname]);

  return null;
}
