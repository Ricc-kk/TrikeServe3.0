import React from "react";
import { ImageWithFallback } from "./ImageWithFallback";

interface StoreLogoProps {
  logo?: string;
  emojiClass?: string;
}

const DEFAULT_LOGO = "🍽️";

function isImageUrl(value: string): boolean {
  return /^(https?:|data:|\/)/.test(value);
}

/** Renders a store/restaurant logo: an image when `logo` is a URL, otherwise an emoji. */
export default function StoreLogo({ logo, emojiClass = "text-2xl" }: StoreLogoProps) {
  const value = logo || DEFAULT_LOGO;

  if (isImageUrl(value)) {
    return (
      <ImageWithFallback
        src={value}
        alt="Store logo"
        className="w-full h-full object-cover"
      />
    );
  }

  return (
    <span className={`${emojiClass} leading-none select-none`} role="img" aria-label="Store logo">
      {value}
    </span>
  );
}
