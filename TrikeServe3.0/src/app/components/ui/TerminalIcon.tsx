/**
 * The terminal icon: a canopy on two posts with a hanging "TRICYCLE TERMINAL"
 * sign, a stop-sign post and bench to the left, and a tricycle standing
 * underneath. Used as the map marker and in the Terminal Location legend.
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

import { useMemo } from "react";

/** Matches the reference artwork this was traced from. */
export const DEFAULT_TERMINAL_COLOR = "#2E75B6";

/** Defaults for the two plotted shapes, matching what the app drew before they were per-terminal. */
export const DEFAULT_ROUTE_COLOR = "#22C55E";
export const DEFAULT_BORDER_COLOR = "#22C55E";

/** Drawn extent. Cropped artboard; the marker anchor is the middle of the ground line. */
const GLYPH = { x: 0, y: 0, w: 320, h: 344 };

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

function markup(color: string): string {
  const c = normalizeTerminalColor(color);
  const w = "#FFFFFF"; // sign board, cabin and window interiors
  return `
<g>
  <!-- canopy -->
  <path d="M 20 84 L 32 56 C 58 37 100 29 160 29 C 220 29 262 37 288 56 L 300 84 Z" fill="${c}"/>
  <!-- posts -->
  <rect x="95" y="80" width="13" height="224" fill="${c}"/>
  <rect x="265" y="80" width="13" height="224" fill="${c}"/>

  <!-- hanging sign board; textLength forces it to fit whatever font resolves -->
  <rect x="122" y="92" width="138" height="32" rx="6" fill="${w}" stroke="${c}" stroke-width="9"/>
  <text x="191" y="114" font-family="Arial, Helvetica, sans-serif" font-size="17"
        font-weight="700" fill="${c}" text-anchor="middle"
        textLength="116" lengthAdjust="spacingAndGlyphs">TRICYCLE TERMINAL</text>

  <!-- stop sign on its post, with a tiny tricycle pictogram inside -->
  <circle cx="36" cy="176" r="23" fill="${w}" stroke="${c}" stroke-width="9"/>
  <rect x="30" y="163" width="13" height="9" rx="4.5" fill="${c}"/>
  <rect x="22" y="172" width="28" height="15" rx="4" fill="${c}"/>
  <circle cx="27" cy="190" r="5" fill="${c}"/>
  <circle cx="45" cy="190" r="5" fill="${c}"/>
  <rect x="31" y="199" width="10" height="103" fill="${c}"/>
  <rect x="14" y="300" width="44" height="12" rx="6" fill="${c}"/>

  <!-- bench -->
  <rect x="58" y="256" width="56" height="9" rx="4.5" fill="${c}"/>
  <rect x="59" y="268" width="25" height="24" rx="4" fill="${c}"/>
  <rect x="88" y="268" width="25" height="24" rx="4" fill="${c}"/>
  <rect x="64" y="292" width="8" height="12" fill="${c}"/>
  <rect x="112" y="292" width="8" height="12" fill="${c}"/>

  <!-- tricycle: canopy bars, cabin, window, seat lines, rear wheel, handlebar -->
  <rect x="190" y="150" width="76" height="20" rx="10" fill="${c}"/>
  <rect x="190" y="178" width="76" height="20" rx="10" fill="${c}"/>
  <rect x="132" y="192" width="76" height="86" rx="10" fill="${w}" stroke="${c}" stroke-width="9"/>
  <rect x="146" y="206" width="38" height="34" rx="4" fill="${w}" stroke="${c}" stroke-width="8"/>
  <rect x="146" y="250" width="42" height="9" rx="4.5" fill="${c}"/>
  <rect x="146" y="264" width="42" height="9" rx="4.5" fill="${c}"/>
  <rect x="118" y="246" width="28" height="52" rx="14" fill="${c}"/>
  <circle cx="238" cy="218" r="17" fill="${w}" stroke="${c}" stroke-width="8"/>
  <rect x="206" y="213" width="18" height="10" rx="5" fill="${c}"/>
  <rect x="253" y="213" width="20" height="10" rx="5" fill="${c}"/>
  <rect x="228" y="234" width="20" height="32" rx="9" fill="${c}"/>
  <rect x="223" y="264" width="30" height="34" rx="13" fill="${c}"/>

  <!-- ground -->
  <rect x="16" y="302" width="288" height="15" rx="7.5" fill="${c}"/>
</g>`.trim();
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
export function terminalMarkerIcon(color: string, size = 76) {
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
