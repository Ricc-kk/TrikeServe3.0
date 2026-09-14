import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle, XCircle, Info, X } from "lucide-react";

type ModalVariant = "danger" | "warning" | "success";

interface ConfirmationModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  variant?: ModalVariant;
  confirmLabel?: string;
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
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    confirmBg: "bg-[#EF4444]",
    confirmHover: "hover:bg-[#DC2626]",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    confirmBg: "bg-[#F59E0B]",
    confirmHover: "hover:bg-[#D97706]",
  },
  success: {
    icon: CheckCircle,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    confirmBg: "bg-[#10B981]",
    confirmHover: "hover:bg-[#059669]",
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
}: ConfirmationModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) cancelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 text-center">
          <div className={`w-14 h-14 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <Icon className={`w-7 h-7 ${config.iconColor}`} />
          </div>
          <h3 className="text-lg font-bold text-[#121212] mb-2">{title}</h3>
          <p className="text-sm text-[#64748B]">{message}</p>
        </div>
        <div className="flex border-t-2 border-[#E2E8F0]">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 py-3 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FA] transition-colors"
          >
            Cancel
          </button>
          <div className="w-px bg-[#E2E8F0]" />
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 text-sm font-bold text-white ${config.confirmBg} ${config.confirmHover} transition-colors`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
