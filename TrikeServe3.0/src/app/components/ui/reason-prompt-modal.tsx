import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type ReasonVariant = "danger" | "warning";

interface ReasonPromptModalProps {
  isOpen: boolean;
  title: string;
  /** Optional line under the title naming the order/ride being acted on. */
  description?: string;
  /** Label for the confirming button, e.g. "Cancel Ride". */
  confirmLabel: string;
  placeholder?: string;
  variant?: ReasonVariant;
  /** Stacking class, raised when opened over another overlay. */
  zIndexClassName?: string;
  onSubmit: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

/** Shortest reason we accept — guards against a single stray character. */
const MIN_REASON_LENGTH = 3;
/** Matches the limit used elsewhere for free-text fields. */
const MAX_REASON_LENGTH = 300;

const variantConfig: Record<ReasonVariant, { iconBg: string; iconColor: string; button: string }> = {
  danger: {
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    button: "bg-[#EF4444] hover:bg-[#DC2626]",
  },
  warning: {
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    button: "bg-[#F59E0B] hover:bg-[#D97706]",
  },
};

/**
 * Prompts for a free-text reason before a cancel/decline goes through.
 *
 * Used by the customer (cancel ride/order), the business (decline an order) and
 * the rider (decline a request) so all three read identically and every one of
 * them records why.
 */
export default function ReasonPromptModal({
  isOpen,
  title,
  description,
  confirmLabel,
  placeholder = "Tell us why…",
  variant = "danger",
  zIndexClassName = "z-[4000]",
  onSubmit,
  onCancel,
}: ReasonPromptModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Start each prompt from a clean slate.
  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError(null);
      setIsSubmitting(false);
      // Let the modal paint before focusing.
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onCancel();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen) return null;

  const config = variantConfig[variant];

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      setError(`Please give a reason of at least ${MIN_REASON_LENGTH} characters.`);
      textareaRef.current?.focus();
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4`}>
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => { if (!isSubmitting) onCancel(); }}
      />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={`w-14 h-14 ${config.iconBg} rounded-full flex items-center justify-center`}>
              <AlertTriangle className={`w-7 h-7 ${config.iconColor}`} />
            </div>
            <button
              onClick={() => { if (!isSubmitting) onCancel(); }}
              className="w-8 h-8 rounded-full bg-[#F8F9FA] flex items-center justify-center active:scale-90 transition-transform"
            >
              <X size={16} className="text-[#64748B]" />
            </button>
          </div>

          <h3 className="text-lg font-bold text-[#121212] mb-1">{title}</h3>
          {description && <p className="text-sm text-[#64748B] mb-4">{description}</p>}

          <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B] block mb-1.5">
            Reason <span className="text-[#E11D48]">*</span>
          </label>
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            maxLength={MAX_REASON_LENGTH}
            rows={3}
            placeholder={placeholder}
            className={`w-full px-3 py-2.5 border-2 rounded-xl text-sm outline-none resize-none transition-colors ${
              error ? "border-[#EF4444]" : "border-[#CBD5E1] focus:border-[#E11D48]"
            }`}
          />

          {error ? (
            <p className="text-xs text-[#EF4444] mt-1.5 font-medium">{error}</p>
          ) : (
            <p className="text-xs text-[#94A3B8] mt-1.5">
              {reason.length}/{MAX_REASON_LENGTH} — this is shared with the other party.
            </p>
          )}
        </div>

        <div className="flex border-t-2 border-[#E2E8F0]">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FA] transition-colors disabled:opacity-50"
          >
            Go Back
          </button>
          <div className="w-px bg-[#E2E8F0]" />
          <button
            onClick={submit}
            disabled={isSubmitting}
            className={`flex-1 py-3 text-sm font-bold text-white ${config.button} transition-colors disabled:opacity-60`}
          >
            {isSubmitting ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
