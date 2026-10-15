/**
 * The TrikeServe mark, cropped to its artwork.
 *
 * `TRIKESERVE_logo.png` is a square canvas whose artwork occupies only the
 * middle ~79% x ~68%, on a flat #EBEBEB background. Dropped straight into a
 * rounded tile the dead margin shows as a grey border around a small mark, and
 * the tile's own background never appears — which is what made the logo look
 * like it didn't fit.
 *
 * So the transparent margin is trimmed once and cached. What is left is the
 * artwork at its true aspect ratio, which `object-contain` then fills the tile
 * with no dead space and no transform offsets to maintain.
 *
 * Falls back to the untrimmed source if the canvas can't be read, so a blocked
 * canvas degrades to today's behaviour rather than an empty box.
 */

import { useEffect, useState } from "react";

/**
 * How far a pixel may sit from the backdrop colour and still count as backdrop.
 *
 * Deliberately a difference from the sampled backdrop, not an absolute cut:
 * the logo's #EBEBEB field is not perfectly flat, and an absolute threshold picks
 * up its own background noise and crops almost nothing.
 */
const BACKGROUND_TOLERANCE = 24;

/** One entry per src: canvas work is not worth repeating on every mount. */
const cache = new Map<string, string>();

async function croppedLogo(src: string): Promise<string | null> {
  const cached = cache.get(src);
  if (cached) return cached === src ? null : cached;

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("logo failed to load"));
      img.src = src;
    });

    const w = image.naturalWidth;
    const h = image.naturalHeight;
    if (!w || !h) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);

    const { data } = ctx.getImageData(0, 0, w, h);

    // Sample the backdrop from just inside the top-left corner rather than
    // hard-coding it, so a re-skinned logo still trims correctly.
    const cornerOffset = 2;
    const corner = ((cornerOffset * w) + cornerOffset) * 4;
    const bg = [data[corner], data[corner + 1], data[corner + 2]] as const;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (
          Math.abs(data[o] - bg[0]) > BACKGROUND_TOLERANCE ||
          Math.abs(data[o + 1] - bg[1]) > BACKGROUND_TOLERANCE ||
          Math.abs(data[o + 2] - bg[2]) > BACKGROUND_TOLERANCE
        ) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Nothing found means the asset is already tight, or already transparent.
    // Either way the original is the right answer.
    if (maxX < 0 || maxY < 0) {
      cache.set(src, src);
      return null;
    }

    // A hair of padding so anti-aliased edges aren't shaved off.
    const pad = 2;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(w - sx, maxX - minX + 1 + pad * 2);
    const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);

    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;
    outCtx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

    const url = out.toDataURL("image/png");
    cache.set(src, url);
    return url;
  } catch {
    // A tainted canvas is the likely cause; remember that so we don't retry per mount.
    cache.set(src, src);
    return null;
  }
}

type Props = {
  src: string;
  alt?: string;
  className?: string;
};

export default function TrimmedLogo({ src, alt = "TrikeServe", className }: Props) {
  const [trimmed, setTrimmed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    croppedLogo(src).then(url => {
      if (active && url) setTrimmed(url);
    });
    return () => { active = false; };
  }, [src]);

  return <img src={trimmed ?? src} alt={alt} className={className} />;
}
