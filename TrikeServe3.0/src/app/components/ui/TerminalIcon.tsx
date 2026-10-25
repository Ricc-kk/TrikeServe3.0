/**
 * The terminal icon: a canopy on two posts with a hanging "TRICYCLE TERMINAL"
 * sign, a stop-sign post and bench to the left, and a tricycle standing
 * underneath. Used as the map marker and in the Terminal Location legend.
 *
 * The artwork itself lives in `assets/terminal-icon.svg`, traced from the
 * supplied image with its background removed. That background was a rounded
 * white tile, and it is exactly the part that has to go: painted over a pale map
 * or a light card it reads as a box *around* the terminal rather than as the
 * terminal, and the map markers are dropped straight on top of roads. Keeping
 * the trace as a real asset file rather than inline markup means the icon can be
 * swapped, recoloured or exported without hunting through a component.
 *
 * Colour is a prop rather than hard-coded so the legend, the markers and the
 * colour picker all read the same single value. The sign board, cabin and
 * window keep white fill, so the icon keeps its internal contrast whatever hue
 * an admin picks — a single-colour icon is unreadable on a pale yellow terminal
 * sitting on a light map.
 *
 * The geometry is written once and rendered two ways: as a React element, and as
 * a data URI for Google Maps (which takes an image URL, not a component).
 * Duplicating the markup between the two would guarantee they drift apart.
 */

import { forwardRef, useMemo } from "react";
import type { LucideProps } from "lucide-react";
// Read as text, not as a URL. A normal `.svg` import resolves to a file URL,
// which cannot be recoloured, and the only thing standing between this file and
// the screen is the one `currentColor` substitution in `markup` below.
import terminalGlyph from "../../../assets/terminal-icon.svg?raw";

/** Matches the reference artwork this was traced from. */
export const DEFAULT_TERMINAL_COLOR = "#2E75B6";

/** Defaults for the two plotted shapes, matching what the app drew before they were per-terminal. */
export const DEFAULT_ROUTE_COLOR = "#22C55E";
export const DEFAULT_BORDER_COLOR = "#22C55E";

/** Drawn extent. Square artboard, matching the source image; the marker anchor is the middle of the ground line. */
const GLYPH = { x: 0, y: 0, w: 320, h: 320 };

/** Midpoint of the ground bar, which is what the marker stands on. */
const GROUND_Y = 309;

/**
 * Resolve any stored value to a colour that can safely be drawn.
 *
 * Two jobs. It is the boundary that makes injecting the markup below safe — a
 * hand-edited value in the colour picker's hex field cannot smuggle markup into
 * the document. And it is what every caller needs when reading a terminal's
 * colour: rows created before ADD_TERMINAL_MARKER_COLOR.sql have no value, and a
 * bad one should fall back to the default rather than render nothing.
 */
export function normalizeTerminalColor(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : DEFAULT_TERMINAL_COLOR;
}

/**
 * The same resolution for the road and border colours, with their own defaults.
 *
 * These live here rather than beside the icon because they are one concern —
 * "a terminal's colours, made safe to draw" — and because the map, the editor and
 * the approval path all need them from the same place.
 */
export function normalizeRouteColor(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : DEFAULT_ROUTE_COLOR;
}

export function normalizeBorderColor(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : DEFAULT_BORDER_COLOR;
}

/**
 * The one colour this glyph will draw in without sanitising it.
 *
 * `normalizeTerminalColor` rejects anything that is not a hex, which is the
 * right call for a value coming out of the colour picker — but it means
 * `currentColor` can never survive, and `currentColor` is exactly what an icon
 * sitting in running text needs in order to match that text. Hence the opt-in
 * below rather than a hole in the validator.
 */
const INHERIT_COLOR = "currentColor";

function markup(color: string, inheritColor = false): string {
  /*
   * The one substitution that turns the asset into a coloured icon.
   *
   * It is also what makes this safe: the file is ours and `currentColor` is its
   * only placeholder, and the value written in place of it has been through
   * normalizeTerminalColor, so a hand-edited hex in the colour picker cannot
   * smuggle markup into the document.
   */
  const safe =
    inheritColor && color === INHERIT_COLOR ? INHERIT_COLOR : normalizeTerminalColor(color);
  return terminalGlyph.replace(/currentColor/g, safe);
}

export function terminalIconUrl(color: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GLYPH.x} ${GLYPH.y} ${GLYPH.w} ${GLYPH.h}">` +
    markup(color) +
    `</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * A Google Maps icon for the terminal.
 *
 * Anchored at the middle of the ground line, so the shelter stands on the
 * terminal point rather than floating above it.
 */
export function terminalMarkerIcon(color: string, size = 40) {
  const height = Math.round((size * GLYPH.h) / GLYPH.w);
  return {
    url: terminalIconUrl(color),
    scaledSize: { width: size, height },
    anchor: { x: Math.round(size / 2), y: Math.round((GROUND_Y / GLYPH.h) * height) },
  };
}

type Props = {
  /** Rendered width in px; height follows the glyph's aspect ratio. */
  size?: number;
  color?: string;
  className?: string;
  /** Accessible label; omit for a purely decorative glyph. */
  title?: string;
};

/**
 * A teardrop pin carrying a number, for the plotted points of a shape.
 *
 * Numbering is what makes a half-drawn route editable: an admin needs to know
 * which tap is point 4 to undo or fix it. The fill is the shape's own colour so
 * a route point never reads as a border point on the same map.
 *
 * `label` is interpolated as text, so it is coerced to a short digit run here —
 * the colour goes through the normalisers for the same reason.
 */
export function numberedPinIcon(label: string | number, color: string, size = 30) {
  const text = String(label).replace(/[^0-9]/g, '').slice(0, 3) || '';
  const fill = normalizeRouteColor(color);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40">` +
    `<path d="M16 38 C 10 28 3 22 3 15 A 13 13 0 1 1 29 15 C 29 22 22 28 16 38 Z" ` +
    `fill="${fill}" stroke="#FFFFFF" stroke-width="2"/>` +
    `<text x="16" y="20" font-family="Arial, Helvetica, sans-serif" font-size="13" ` +
    `font-weight="700" fill="#FFFFFF" text-anchor="middle">${text}</text>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: Math.round((size * 40) / 32) },
    anchor: { x: size / 2, y: Math.round((size * 40) / 32) },
  };
}

/**
 * A plain pin in a shape's colour, used for the terminal's centre while that
 * shape is being edited.
 */
export function shapePinIcon(color: string, size = 26) {
  const fill = normalizeRouteColor(color);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40">` +
    `<path d="M16 38 C 10 28 3 22 3 15 A 13 13 0 1 1 29 15 C 29 22 22 28 16 38 Z" ` +
    `fill="${fill}" stroke="#FFFFFF" stroke-width="2.5"/>` +
    `<circle cx="16" cy="15" r="5" fill="#FFFFFF"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: Math.round((size * 40) / 32) },
    anchor: { x: size / 2, y: Math.round((size * 40) / 32) },
  };
}

export default function TerminalIcon({
  size = 32,
  color = DEFAULT_TERMINAL_COLOR,
  className,
  title,
}: Props) {
  // normalizeTerminalColor runs inside markup, so the injected string is vetted
  // either way; this hook only keeps the DOM write off the render path.
  const body = useMemo(() => markup(color), [color]);

  return (
    <svg
      viewBox={`${GLYPH.x} ${GLYPH.y} ${GLYPH.w} ${GLYPH.h}`}
      width={size}
      height={Math.round((size * GLYPH.h) / GLYPH.w)}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/**
 * The terminal glyph dressed as a Lucide icon.
 *
 * The shared UI components — StatCard, EmptyState, ChoiceCard, BottomNav and
 * the nav item arrays across the app — all type their icon prop as
 * `LucideIcon` and all call it the way lucide icons are called: a `className`
 * for size, a text colour class, and nothing else. `TerminalIcon` answers none
 * of that. It wants a fixed hex rather than inheriting the text colour, and it
 * is a plain component rather than a `forwardRef` exotic component.
 *
 * So this is the same geometry behind lucide's calling convention. It exists
 * because dropping `TerminalIcon` straight into those call sites would type
 * error, and — worse — would draw every icon on a coloured tile in the default
 * terminal blue, since `text-white` would be silently ignored.
 */
export const TerminalIconGlyph = forwardRef<SVGSVGElement, LucideProps>(
  function TerminalIconGlyph({ size = 24, color, className, ...rest }, ref) {
    // Lucide lets `size` be a string ("1.5rem"); the SVG wants a number.
    const px = typeof size === "number" ? size : parseFloat(String(size)) || 24;
    const body = useMemo(() => markup(color ?? INHERIT_COLOR, true), [color]);
    // Lucide icons are decorative unless labelled, and so is this one — but it
    // has to stop hiding itself when a caller did supply a label.
    const labelled = rest["aria-label"] != null || rest.title != null;

    return (
      <svg
        {...rest}
        ref={ref}
        viewBox={`${GLYPH.x} ${GLYPH.y} ${GLYPH.w} ${GLYPH.h}`}
        width={px}
        height={px}
        className={className}
        role={labelled ? "img" : undefined}
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }
);
