import { useEffect, useRef, useState } from "react";
import { Camera, Code2, MapPin, Route, Settings2, Trash2, Users, X } from "lucide-react";
import { useDevModeFeature, useDevModeStatus } from "../../hooks/useDevModeSettings";
import { Switch } from "./switch";

function SettingRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  icon: Icon,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  icon: typeof Code2;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 ${disabled ? "opacity-55" : ""}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-semibold text-[var(--ink)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--muted-foreground)]">{description}</span>
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={title}
      />
    </div>
  );
}

export default function DevModeSettings() {
  const [isEnabled, setIsEnabled] = useDevModeStatus();
  const [quickAccessEnabled, setQuickAccessEnabled] = useDevModeFeature("quickAccess");
  const [testDataToolsEnabled, setTestDataToolsEnabled] = useDevModeFeature("testDataTools");
  const [enforceBoundary, setEnforceBoundary] = useDevModeFeature("enforceBoundary");
  const [imageProofRequired, setImageProofRequired] = useDevModeFeature("imageProofRequired");
  const [sameRouteLobbyFilter, setSameRouteLobbyFilter] = useDevModeFeature("sameRouteLobbyFilter");
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnPointerOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnPointerOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!isEnabled) return null;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[10001]">
      {isOpen && (
        <div
          ref={panelRef}
          id="dev-mode-settings-panel"
          role="dialog"
          aria-labelledby="dev-mode-settings-title"
          className="absolute bottom-[calc(100%+0.75rem)] right-0 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Code2 className="size-4" aria-hidden="true" />
                </span>
                <h2 id="dev-mode-settings-title" className="text-base font-bold text-[var(--ink)]">Developer settings</h2>
              </div>
              <p className="pl-10 text-xs text-[var(--muted-foreground)]">Choose which testing tools are available.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close developer settings"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-soft hover:text-[var(--ink)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-2">
            <SettingRow
              id="dev-mode-enabled"
              title="Developer mode"
              description="Show developer tools across the app."
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              icon={Code2}
            />
            <SettingRow
              id="dev-mode-quick-access"
              title="Quick Access"
              description="Show test account shortcuts on the sign-in screen."
              checked={quickAccessEnabled}
              onCheckedChange={setQuickAccessEnabled}
              disabled={!isEnabled}
              icon={Users}
            />
            <SettingRow
              id="dev-mode-test-data-tools"
              title="Test data tools"
              description="Show the clear test data control in admin overview."
              checked={testDataToolsEnabled}
              onCheckedChange={setTestDataToolsEnabled}
              disabled={!isEnabled}
              icon={Trash2}
            />
            <SettingRow
              id="dev-mode-same-route-lobby-filter"
              title="Same-route lobby filter"
              description="Only show and allow joining shared lobbies with the selected pickup and drop-off."
              checked={sameRouteLobbyFilter}
              onCheckedChange={setSameRouteLobbyFilter}
              disabled={!isEnabled}
              icon={Route}
            />
            <SettingRow
              id="dev-mode-enforce-boundary"
              title="Enforce boundary"
              description="Restrict ride pickups, drop-offs, and delivery areas to terminal coverage."
              checked={enforceBoundary}
              onCheckedChange={setEnforceBoundary}
              disabled={!isEnabled}
              icon={MapPin}
            />
            <SettingRow
              id="dev-mode-image-proof-required"
              title="Image proof required"
              description="Require payment proof at checkout and a handover photo to complete deliveries."
              checked={imageProofRequired}
              onCheckedChange={setImageProofRequired}
              disabled={!isEnabled}
              icon={Camera}
            />
          </div>
          <p className="mt-3 text-center text-[10px] text-[var(--muted-foreground)]">Settings are saved on this device.</p>
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close developer settings" : "Open developer settings"}
        aria-expanded={isOpen}
        aria-controls="dev-mode-settings-panel"
        title="Developer settings"
        className="grid size-14 place-items-center rounded-full border border-white/15 bg-[var(--ink-solid)] text-white shadow-lg shadow-black/25 transition-transform hover:scale-105 hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
      >
        {isOpen ? <X className="size-6" aria-hidden="true" /> : <Settings2 className="size-6" aria-hidden="true" />}
        <span className="sr-only">Dev mode on</span>
      </button>
    </div>
  );
}
