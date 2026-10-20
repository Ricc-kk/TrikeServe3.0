import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

interface FullSizeImagePreviewProps {
  src: string;
  alt: string;
  children: ReactNode;
  className?: string;
}

/** Opens an image in an in-app, full-screen viewer and returns to the page on close. */
export default function FullSizeImagePreview({
  src,
  alt,
  children,
  className = "",
}: FullSizeImagePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View full-size image: ${alt}`}
          className={`block w-full text-left ${className}`}
        >
          {children}
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="z-[2999] bg-black/95" />
        <DialogPrimitive.Content
          aria-label="Full-size image"
          className="fixed inset-0 z-[3000] flex min-h-dvh items-center justify-center bg-black/95 p-3 outline-none sm:p-6"
        >
          <DialogTitle className="sr-only">Full-size image</DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close full-size image"
              className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10 grid size-12 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X className="size-6" aria-hidden="true" />
            </button>
          </DialogClose>
          <img
            src={src}
            alt={alt}
            className="max-h-[calc(100dvh-2rem)] max-w-full object-contain sm:max-h-[calc(100dvh-3rem)]"
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
