import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { ImageWithFallback } from "../figma/ImageWithFallback";

/**
 * Proof capture: one control for the two screenshots an order now carries.
 *
 * The customer's GCash receipt and the rider's photo at handover are the same
 * shape of interaction -- take a picture, see it, replace it -- so they share one
 * component rather than growing two near-identical blocks.
 *
 * What differs is only how the picture is taken, which is what `mode` is for:
 *
 *   'camera' the rider's handover photo. Opens the camera directly.
 *              `capture="environment"` is what does that: it is a plain file
 *              input with a hint attached, so on a phone the OS offers the camera
 *              and on a desktop the file picker. No Capacitor plugin, so this
 *              works in the Android WebView today without rebuilding the APK.
 *
 *   'upload'  the customer's GCash screenshot. No `capture`, so the gallery or
 *              file browser opens -- correct, because the screenshot was taken
 *              elsewhere and is already on the device.
 *
 * The component deliberately does not upload anything. It hands the chosen file
 * up and waits to be told whether it was accepted, because the two callers
 * differ in what they do with it (the customer attaches it to an order that does
 * not exist yet, the rider to one already in flight) and in what failure means.
 */
export type ProofMode = "camera" | "upload";

interface ProofCaptureProps {
  /** What the picture is of. Used for the label and the button's accessible name. */
  label: string;
  /** One line telling the person what to actually photograph. */
  hint?: string;
  mode: ProofMode;
  /** Already-saved proof, shown instead of the picker. */
  value?: string | null;
  /** Uploading right now; the picker is disabled and a spinner is shown. */
  busy?: boolean;
  /** Replaces the preview with this message. */
  error?: string | null;
  /** Called with the chosen file. The caller owns the upload. */
  onSelect: (file: File) => void;
  /** Called when the preview's remove button is used. */
  onClear?: () => void;
  /** Reject anything larger than this, in megabytes. */
  maxSizeMb?: number;
}

export default function ProofCapture({
  label,
  hint,
  mode,
  value,
  busy = false,
  error,
  onSelect,
  onClear,
  maxSizeMb = 8,
}: ProofCaptureProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);

  /*
   * A file chosen for this order must not survive into the next one.
   *
   * The input is a controlled-by-DOM element: picking a photo, then swapping to a
   * different order and picking again, fires no `change` event the second time
   * because the browser still believes the same file is selected. The proof then
   * silently stays on the previous order.
   */
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = '';
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear first: a rejected file must not leave a stale message on screen if
    // the next attempt succeeds.
    setTooBig(null);

    if (file.size > maxSizeMb * 1024 * 1024) {
      setTooBig(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use one under ${maxSizeMb}MB.`);
      // Reset so the same file can be picked again after being rejected.
      e.target.value = '';
      return;
    }

    onSelect(file);
  };

  const openPicker = () => {
    if (busy) return;
    setTooBig(null);
    inputRef.current?.click();
  };

  const message = tooBig || error || null;

  return (
    <div>
      <p className="mb-2 text-sm font-bold text-[var(--ink)]">{label}</p>

      {value ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-[var(--surface)]">
          <div className="relative aspect-[4/3] w-full bg-[var(--muted)]">
            <ImageWithFallback
              src={value}
              alt={label}
              className="size-full object-cover"
            />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
              <Check className="size-3" aria-hidden="true" />
              Attached
            </span>
          </div>
          <div className="flex gap-2 p-3">
            <button
              type="button"
              onClick={openPicker}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : mode === "camera" ? (
                <Camera className="size-4" aria-hidden="true" />
              ) : (
                <ImagePlus className="size-4" aria-hidden="true" />
              )}
              {mode === "camera" ? "Retake photo" : "Choose another"}
            </button>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                disabled={busy}
                aria-label={`Remove ${label.toLowerCase()}`}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-[var(--muted-foreground)] disabled:opacity-60"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center transition-colors hover:border-[var(--primary)] disabled:opacity-60"
        >
          <span className="grid size-12 place-items-center rounded-full bg-[var(--primary-soft)]">
            {busy ? (
              <Loader2 className="size-6 animate-spin text-[var(--primary)]" aria-hidden="true" />
            ) : mode === "camera" ? (
              <Camera className="size-6 text-[var(--primary)]" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-6 text-[var(--primary)]" aria-hidden="true" />
            )}
          </span>
          <span className="text-sm font-bold text-[var(--ink)]">
            {busy
              ? 'Uploading…'
              : mode === 'camera'
                ? 'Take photo'
                : 'Upload payment proof'}
          </span>
          {hint && (
            <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>
          )}
        </button>
      )}

      {/*
       * `capture` only takes effect on a file input that is in the DOM. It is
       * always rendered -- including once a preview is showing -- because a
       * conditionally removed input loses the hint when it comes back on mobile.
       */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={mode === 'camera' ? 'environment' : undefined}
        onChange={handleChange}
        className="hidden"
        aria-label={mode === 'camera' ? `Take ${label.toLowerCase()} with the camera` : `Upload ${label.toLowerCase()}`}
      />

      {message && (
        <p
          role="alert"
          className="mt-2 rounded-xl bg-[var(--error-soft)] px-3 py-2 text-xs text-[var(--error)]"
        >
          {message}
        </p>
      )}
    </div>
  );
}