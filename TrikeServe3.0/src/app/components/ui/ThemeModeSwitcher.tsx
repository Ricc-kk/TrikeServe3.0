import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";

import { cn } from "./utils";

type ThemeChoice = {
  value: "system" | "light" | "dark";
  label: string;
  filipino: string;
  Icon: typeof Sun;
};

const CHOICES: ThemeChoice[] = [
  { value: "system", label: "Default", filipino: "Awtomatiko", Icon: Laptop },
  { value: "light", label: "Light", filipino: "Maliwanag", Icon: Sun },
  { value: "dark", label: "Dark", filipino: "Madilim", Icon: Moon },
];

type ThemeModeSwitcherProps = {
  /** Show the short Filipino gloss under each label. */
  bilingual?: boolean;
  className?: string;
  /** Heading rendered above the control. Empty by default so the switcher can sit
      under a section heading the host page already renders. */
  title?: string;
};

/**
 * Three-way appearance control: Default (follow the device), Light, Dark.
 *
 * Mounted as a segmented control so the current choice is always visible —
 * a bare sun/moon toggle cannot express "follow the system", and cannot tell
 * the user which of the three is active without opening something.
 */
export default function ThemeModeSwitcher({
  bilingual = false,
  className,
  title = "",
}: ThemeModeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The resolved theme is unknown until the client mounts, so rendering the
  // active state before then would flash the wrong segment.
  useEffect(() => setMounted(true), []);

  return (
    <div className={className}>
      {title && (
        <p className="text-sm font-bold text-[var(--ink)] mb-2">{title}</p>
      )}
      <div
        role="radiogroup"
        aria-label={title || "Appearance"}
        className="grid grid-cols-3 gap-1.5 rounded-2xl border border-line bg-[var(--muted)] p-1.5"
      >
        {CHOICES.map(({ value, label, filipino, Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-xs font-bold transition-colors",
                active
                  ? "bg-surface text-[var(--primary)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--ink)]"
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </span>
              {bilingual && (
                <span className="text-[10px] font-normal opacity-80">{filipino}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}