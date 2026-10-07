import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** The image the customer just picked, before it is uploaded. */
  src: string;
  onCancel: () => void;
  /** Receives the cropped square, ready to upload. */
  onConfirm: (file: Blob) => void;
  busy?: boolean;
};

const OUT = 512;

/**
 * Lets the customer frame their photo before it is saved.
 *
 * A profile picture is shown everywhere as a small circle, so the part that
 * actually survives the crop is tiny. Without this, picking a photo uploaded it
 * dead centre and whatever was in the top of the frame was silently lost —
 * people ended up with the top of their head, or a shoulder. Drag to recentre
 * and zoom in if the face is small, so what they see here is what everyone else
 * will see.
 */
export default function PhotoAdjustModal({ src, onCancel, onConfirm, busy }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  /**
   * Drag guard lives in a ref, not the `dragging` state above.
   *
   * State writes are async, so a pointermove that arrives in the same tick as
   * pointerdown reads the pre-update value and is thrown away — the photo would
   * only start moving after a second move, or not at all on a quick flick. The
   * ref is written synchronously, so the very first move is honoured. State is
   * kept only to drive the grabbing cursor.
   */
  const draggingRef = useRef(false);
  const dragStart = useRef({ px: 0, py: 0, ox: 0, oy: 0 });

  /** Cover-fit scale, so the image never leaves a gap in the circle. */
  const baseScale = useCallback(() => {
    const img = imgRef.current;
    if (!img) return 1;
    return Math.max(OUT / img.naturalWidth, OUT / img.naturalHeight);
  }, []);

  /**
   * Keeps the frame covered. Both axes are pinned because at zoom 1 the image
   * is already at least as large as the output, so the offset can never travel
   * past either edge without exposing background.
   */
  const clamp = useCallback(
    (x: number, y: number, z: number) => {
      const img = imgRef.current;
      if (!img) return { x, y };
      const s = baseScale() * z;
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      return {
        x: Math.min(0, Math.max(OUT - w, x)),
        y: Math.min(0, Math.max(OUT - h, y)),
      };
    },
    [baseScale]
  );

  const draw = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = baseScale() * zoom;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.clearRect(0, 0, OUT, OUT);
    ctx.drawImage(img, offset.x, offset.y, w, h);
  }, [baseScale, zoom, offset]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Re-centre whenever a new image is loaded.
  useEffect(() => {
    setReady(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  const onImageLoad = () => {
    setReady(true);
    // Centre on the image rather than its top-left corner.
    const img = imgRef.current;
    if (img) {
      const s = Math.max(OUT / img.naturalWidth, OUT / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      setOffset({ x: (OUT - w) / 2, y: (OUT - h) / 2 });
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    setDragging(true);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    // Capture on the frame, not e.target: the target is often the canvas, and
    // capturing there still works, but capturing on the handler's own element
    // keeps the intent obvious and survives the target being replaced.
    frameRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Pointer travel is in screen px; the canvas is 512 wide, so scale it.
    const scale = OUT / rect.width;
    const next = clamp(
      dragStart.current.ox + (e.clientX - dragStart.current.px) * scale,
      dragStart.current.oy + (e.clientY - dragStart.current.py) * scale,
      zoom
    );
    setOffset(next);
  };

  const stopDragging = () => {
    draggingRef.current = false;
    setDragging(false);
  };

  const changeZoom = (next: number) => {
    const z = Math.min(4, Math.max(1, next));
    setZoom(z);
    setOffset((o) => clamp(o.x, o.y, z));
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.9
    );
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 shadow-xl">
        <h3 className="text-center text-lg font-bold text-[var(--ink)]">
          Adjust your photo
        </h3>
        {/* The instruction, up front: the whole point of this screen is that
            the framing is a choice, and it should not need discovering. */}
        <p className="mt-1 text-center text-xs text-[var(--muted-foreground)]">
          Drag the photo to move it. Everything outside the circle is cropped away.
        </p>

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          className={`relative mx-auto mt-4 aspect-square w-full max-w-[240px] touch-none select-none overflow-hidden rounded-full border-2 border-line ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <canvas ref={canvasRef} width={OUT} height={OUT} className="size-full" />
          {!ready && (
            <span className="absolute inset-0 grid place-items-center text-xs text-[var(--muted-foreground)]">
              Loading photo…
            </span>
          )}
          {/* The img is never shown; it only exists so the canvas can measure
              and draw the real bitmap. */}
          <img ref={imgRef} src={src} alt="" className="hidden" onLoad={onImageLoad} />
        </div>

        <label className="mt-4 block text-xs font-semibold text-[var(--ink)]">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
            aria-label="Zoom"
          />
        </label>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl bg-[var(--muted)] py-3 text-sm font-semibold text-[var(--muted-foreground)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!ready || busy}
            className="flex-1 rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}