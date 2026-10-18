import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";

type ModalVariant = "danger" | "warning" | "success";

interface ConfirmationModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  variant?: ModalVariant;
  confirmLabel?: string;
  isConfirming?: boolean;
  confirmingLabel?: string;
  /** Stacking class, raised when confirming over a full-screen overlay (e.g. a map picker). */
  zIndexClassName?: string;
}

const variantConfig: Record<ModalVariant, {
  icon: typeof CheckCircle;
  iconBg: string;
  iconColor: string;
  confirmBg: string;
  confirmHover: string;
}> = {
  danger: {
    icon: XCircle,
    iconBg: "bg-[var(--error-soft)]",
    iconColor: "text-[var(--error)]",
    confirmBg: "bg-[var(--error)]",
    confirmHover: "hover:bg-[var(--error)]",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-[var(--amber-soft)]",
    iconColor: "text-[var(--amber-ink)]",
    confirmBg: "bg-[var(--amber)]",
    confirmHover: "hover:bg-[var(--amber)]",
  },
  success: {
    icon: CheckCircle,
    iconBg: "bg-[var(--success-soft)]",
    iconColor: "text-[var(--success)]",
    confirmBg: "bg-[var(--success)]",
    confirmHover: "hover:bg-[var(--success)]",
  },
};

export default function ConfirmationModal({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  variant = "danger",
  confirmLabel = "Confirm",
  isConfirming = false,
  confirmingLabel = "Please wait...",
  zIndexClassName = "z-[400]",
}: ConfirmationModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    if (isOpen && !isConfirming) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [isOpen, isConfirming, onCancel]);

  if (!isOpen) return null;

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/50" onClick={isConfirming ? undefined : onCancel} />
      <div className="relative w-full max-w-sm bg-surface rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 text-center">
          <div className={`w-14 h-14 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <Icon className={`w-7 h-7 ${config.iconColor}`} />
          </div>
          <h3 className="text-lg font-bold text-[var(--ink)] mb-2">{title}</h3>
          <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
        </div>
        <div className="flex border-t-2 border-[var(--border)]">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={isConfirming}
            className="flex-1 py-3 text-sm font-semibold text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            Cancel
          </button>
          <div className="w-px bg-[var(--border)]" />
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            aria-busy={isConfirming}
            className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-bold text-white ${config.confirmBg} ${config.confirmHover} transition-colors disabled:cursor-wait disabled:opacity-80`}
          >
            {isConfirming && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isConfirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
