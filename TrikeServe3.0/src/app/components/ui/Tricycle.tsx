import { createLucideIcon } from "lucide-react";

/**
 * TrikeServe rides tricycles, but lucide only ships a two-wheeled `Bike`.
 *
 * Built with `createLucideIcon` so the result is a real `LucideIcon` — it
 * accepts `size` / `strokeWidth` / `className` and can be handed straight to
 * components that type their prop as `icon: LucideIcon`.
 *
 * Side elevation, facing right: a tall passenger cabin on the large rear wheel,
 * a shorter handlebar box over the smaller front wheel, and a footboard
 * joining the two. Proportions were tuned against renders at 20/24px, where an
 * earlier full-width footboard collapsed into the wheels and the whole thing
 * read as a jeep.
 *
 * Each child carries a `key`: lucide renders this node array with
 * `createElement(tag, attrs)`, so the key has to live in the attrs object or
 * React warns about an unkeyed list every time the icon mounts.
 */
export const Tricycle = createLucideIcon("tricycle", [
  // rear wheel (driven) and front wheel (steered)
  ["circle", { key: "rear-wheel", cx: "6.5", cy: "17", r: "4" }],
  ["circle", { key: "front-wheel", cx: "18", cy: "17", r: "3" }],
  // cabin back wall, cabin roof, handlebar roof and steering column in one run
  ["path", { key: "cabin", d: "M2.5 17v-7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3.5" }],
  // cabin front wall
  ["path", { key: "cabin-front", d: "M11.5 8v5.5" }],
  // footboard between the two axles
  ["path", { key: "footboard", d: "M11.5 13.5h6" }],
]);

export default Tricycle;