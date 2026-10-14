/**
 * A colour picker with a hue wheel, brightness slider, and hex/RGB entry.
 *
 * All three representations are views of one HSB state rather than independent
 * controls, so typing a hex code moves the wheel handle and dragging the wheel
 * rewrites the RGB fields. They cannot disagree.
 *
 * The wheel puts hue on the angle and saturation on the radius (pure hue at the
 * rim, white at the hub), with brightness on a separate slider below. That is the
 * arrangement people already know from colour pickers, and it keeps the hub from
 * colliding with the handle at low saturation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";

type HSB = { h: number; s: number; b: number }; // h in degrees, s and b in 0..1
type RGB = { r: number; g: number; b: number }; // 0..255

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Circle geometry, in the SVG's own user units (it renders at WHEEL px square). */
const WHEEL = 190;
const CX = WHEEL / 2;
const CY = WHEEL / 2;
const R_OUT = 84;
const R_IN = 24;

/** 2-degree steps: smooth enough that the rim shows no banding. */
const WEDGES = Array.from({ length: 180 }, (_, i) => {
  const h0 = (i * 360) / 180;
  const h1 = ((i + 1) * 360) / 180;
  // Angle 0 points up and increases clockwise, matching the picker maths below.
  const pt = (r: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(CX + r * Math.cos(rad)).toFixed(2)} ${(CY + r * Math.sin(rad)).toFixed(2)}`;
  };
  return {
    d: `M ${pt(R_OUT, h0)} A ${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, h1)} ` +
       `L ${pt(R_IN, h1)} A ${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, h0)} Z`,
    fill: `hsl(${h0} 100% 50%)`,
  };
});

function hsbToRgb({ h, s, b }: HSB): RGB {
  const c = b * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = b - c;
  let r = 0, g = 0, bl = 0;
  if (h < 60)       { r = c; g = x; bl = 0; }
  else if (h < 120) { r = x; g = c; bl = 0; }
  else if (h < 180) { r = 0; g = c; bl = x; }
  else if (h < 240) { r = 0; g = x; bl = c; }
  else if (h < 300) { r = x; g = 0; bl = c; }
  else              { r = c; g = 0; bl = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((bl + m) * 255) };
}

function rgbToHsb(r: number, g: number, b: number): HSB {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn)      h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else                 h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, b: max };
}

function toHex({ r, g, b }: RGB) {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function parseHex(raw: string): RGB | null {
  const m = raw.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

type Props = {
  value: string;
  onChange: (hex: string) => void;
  /** Colour the button returns to. */
  resetTo: string;
  label?: string;
};

export default function ColorPicker({ value, onChange, resetTo, label = "Edit Color" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingWheel = useRef(false);
  const draggingBar = useRef(false);

  const rgb = useMemo(() => parseHex(value) ?? { r: 0, g: 0, b: 0 }, [value]);
  const hsb = useMemo(() => rgbToHsb(rgb.r, rgb.g, rgb.b), [rgb]);
  const hex = toHex(rgb);

  // Dragging and a text field updating the same state need different guards: a
  // controlled hex input would reject every intermediate keystroke ("#A", "#AB"…).
  const [hexDraft, setHexDraft] = useState(hex);
  useEffect(() => { setHexDraft(hex); }, [hex]);

  // Close on any outside click. Capture phase so it wins over popovers that stop
  // propagation from closing themselves first.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // Escape is the one keyboard path out of a popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const setHsb = useCallback((next: HSB) => onChange(toHex(hsbToRgb(next))), [onChange]);

  const pickWheel = useCallback((clientX: number, clientY: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const dx = clientX - rect.left - CX;
    const dy = clientY - rect.top - CY;
    const r = clamp(Math.hypot(dx, dy), R_IN, R_OUT);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    setHsb({ h: deg % 360, s: (r - R_IN) / (R_OUT - R_IN), b: hsb.b });
  }, [hsb.b, setHsb]);

  const handleR = R_IN + hsb.s * (R_OUT - R_IN);
  const handleRad = ((hsb.h - 90) * Math.PI) / 180;
  const handleX = CX + handleR * Math.cos(handleRad);
  const handleY = CY + handleR * Math.sin(handleRad);

  const pickBar = useCallback((clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setHsb({ ...rgbToHsb(rgb.r, rgb.g, rgb.b), b: clamp((clientX - rect.left) / rect.width, 0, 1) });
  }, [rgb.r, rgb.g, rgb.b, setHsb]);

  const inputCls =
    "w-full h-10 px-2.5 rounded-lg border border-line bg-surface text-sm text-[var(--ink)] " +
    "font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-[var(--ink)] transition-colors hover:border-[var(--primary)]"
      >
        <span
          aria-hidden="true"
          className="size-4 rounded-full border border-line"
          style={{ backgroundColor: value }}
        />
        {label}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[1050] mt-2 w-[268px] rounded-2xl border border-line bg-surface p-4 shadow-xl"
          role="dialog"
          aria-label="Terminal icon colour"
        >
          {/* Hue on the angle, saturation on the radius. */}
          <svg
            width={WHEEL}
            height={WHEEL}
            viewBox={`0 0 ${WHEEL} ${WHEEL}`}
            className="mx-auto block touch-none cursor-crosshair select-none"
            role="presentation"
            onPointerDown={e => {
              draggingWheel.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              pickWheel(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerMove={e => {
              if (draggingWheel.current) pickWheel(e.clientX, e.clientY, e.currentTarget);
            }}
            onPointerUp={e => {
              draggingWheel.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
          >
            {WEDGES.map((w, i) => <path key={i} d={w.d} fill={w.fill} />)}
            {/* Transparent at the hub, white at the rim: saturation falls off inward. */}
            <defs>
              <radialGradient id="cw-desat">
                <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={CX} cy={CY} r={R_OUT} fill="url(#cw-desat)" />
            <circle cx={CX} cy={CY} r={R_IN} fill="#fff" />
            <circle
              cx={handleX} cy={handleY} r="9"
              fill={value} stroke="#fff" strokeWidth="3"
              className="pointer-events-none"
            />
          </svg>

          {/* Brightness, kept off the wheel so the handle never hides at s = 0. */}
          <div
            role="presentation"
            className="relative mt-3 h-6 cursor-pointer touch-none rounded-full border border-line"
            style={{ background: `linear-gradient(to right, #000, ${value})` }}
            onPointerDown={e => {
              draggingBar.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              pickBar(e.clientX, e.currentTarget);
            }}
            onPointerMove={e => { if (draggingBar.current) pickBar(e.clientX, e.currentTarget); }}
            onPointerUp={e => {
              draggingBar.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${hsb.b * 100}%`, backgroundColor: value }}
            />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Hex
              </label>
              <input
                className={inputCls}
                value={hexDraft}
                spellCheck={false}
                onChange={e => {
                  setHexDraft(e.target.value);
                  const parsed = parseHex(e.target.value);
                  if (parsed) onChange(toHex(parsed));
                }}
                onBlur={() => setHexDraft(hex)}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                RGB
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["r", "g", "b"] as const).map(ch => (
                  <div key={ch}>
                    <span className="mb-1 block text-center text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
                      {ch}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      aria-label={`${ch.toUpperCase()} channel`}
                      className={inputCls}
                      value={rgb[ch]}
                      onChange={e => {
                        const next = clamp(Math.round(Number(e.target.value) || 0), 0, 255);
                        onChange(toHex({ ...rgb, [ch]: next }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div
              className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-line px-2.5"
              aria-live="polite"
            >
              <span className="size-5 shrink-0 rounded-md border border-line" style={{ backgroundColor: value }} />
              <span className="truncate font-mono text-xs text-[var(--muted-foreground)]">{hex}</span>
            </div>
            <button
              type="button"
              onClick={() => onChange(resetTo.toUpperCase())}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--ink)]"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { hsbToRgb, rgbToHsb, toHex, parseHex };
