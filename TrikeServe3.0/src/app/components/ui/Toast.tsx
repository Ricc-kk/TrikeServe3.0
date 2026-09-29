import { useEffect, useRef } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
  style?: React.CSSProperties;
}

const variantConfig: Record<ToastVariant, {
  icon: typeof CheckCircle;
  bg: string;
  border: string;
  iconColor: string;
}> = {
  success: {
    icon: CheckCircle,
    bg: "bg-[var(--success-soft)]",
    border: "border-[var(--success)]",
    iconColor: "text-[var(--success)]",
  },
  error: {
    icon: XCircle,
    bg: "bg-[var(--error-soft)]",
    border: "border-[var(--error)]",
    iconColor: "text-[var(--error)]",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-[var(--amber-soft)]",
    border: "border-[var(--amber)]",
    iconColor: "text-[var(--amber)]",
  },
  info: {
    icon: Info,
    bg: "bg-[var(--info-soft)]",
    border: "border-[var(--info)]",
    iconColor: "text-[var(--info)]",
  },
};

export default function Toast({ message, variant = "success", duration = 3000, onClose, action, style }: ToastProps) {
  // Hooks must run unconditionally: Toast is sometimes mounted with an empty
  // message and receives one later, which would otherwise change hook order.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => onCloseRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration, message]);

  if (!message) return null;

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div className="fixed left-4 right-4 sm:left-auto sm:right-6 z-[3000] animate-slide-in" style={style}>
      <div className={`flex items-center gap-3 px-5 py-4 ${config.bg} border-l-4 ${config.border} rounded-xl shadow-lg max-w-sm ml-auto`}>
        <Icon className={`w-6 h-6 ${config.iconColor} flex-shrink-0`} />
        <p className="text-sm font-semibold text-[var(--ink)] flex-1">{message}</p>
        {action && (
          <button
            onClick={() => { action.onClick(); onClose(); }}
            className="px-3 py-1.5 bg-[var(--primary)] text-white text-xs font-bold rounded-lg hover:bg-[var(--primary)] transition-colors whitespace-nowrap"
          >
            {action.label}
          </button>
        )}
        <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-lg transition-all">
          <X className="w-4 h-4 text-[var(--muted-foreground)]" />
        </button>
      </div>
    </div>
  );
}
