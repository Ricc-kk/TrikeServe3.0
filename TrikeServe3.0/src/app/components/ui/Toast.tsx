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
    bg: "bg-[#ECFDF5]",
    border: "border-[#10B981]",
    iconColor: "text-[#10B981]",
  },
  error: {
    icon: XCircle,
    bg: "bg-[#FEF2F2]",
    border: "border-[#EF4444]",
    iconColor: "text-[#EF4444]",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-[#FFFBEB]",
    border: "border-[#F59E0B]",
    iconColor: "text-[#F59E0B]",
  },
  info: {
    icon: Info,
    bg: "bg-[#EFF6FF]",
    border: "border-[#3B82F6]",
    iconColor: "text-[#3B82F6]",
  },
};

export default function Toast({ message, variant = "success", duration = 3000, onClose, action, style }: ToastProps) {
  if (!message) return null;

  const config = variantConfig[variant];
  const Icon = config.icon;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div className="fixed left-4 right-4 sm:left-auto sm:right-6 z-[3000] animate-slide-in" style={style}>
      <div className={`flex items-center gap-3 px-5 py-4 ${config.bg} border-l-4 ${config.border} rounded-xl shadow-lg max-w-sm ml-auto`}>
        <Icon className={`w-6 h-6 ${config.iconColor} flex-shrink-0`} />
        <p className="text-sm font-semibold text-[#121212] flex-1">{message}</p>
        {action && (
          <button
            onClick={() => { action.onClick(); onClose(); }}
            className="px-3 py-1.5 bg-[#E11D48] text-white text-xs font-bold rounded-lg hover:bg-[#BE123C] transition-colors whitespace-nowrap"
          >
            {action.label}
          </button>
        )}
        <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-lg transition-all">
          <X className="w-4 h-4 text-[#64748B]" />
        </button>
      </div>
    </div>
  );
}
