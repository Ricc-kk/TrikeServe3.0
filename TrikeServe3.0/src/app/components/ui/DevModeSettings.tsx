import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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

interface FloatingPosition {
  left: number;
  top: number;
}

interface FloatingDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  position: FloatingPosition;
  moved: boolean;
}

const DEV_SETTINGS_POSITION_KEY = "trikeserve_dev_settings_position";
const SETTINGS_ICON_SIZE = 56;
const SETTINGS_MARGIN = 12;

function clampFloatingPosition(position: FloatingPosition): FloatingPosition {
  if (typeof window === "undefined") return position;
  return {
    left: Math.max(SETTINGS_MARGIN, Math.min(window.innerWidth - SETTINGS_ICON_SIZE - SETTINGS_MARGIN, position.left)),
    top: Math.max(SETTINGS_MARGIN, Math.min(window.innerHeight - SETTINGS_ICON_SIZE - SETTINGS_MARGIN, position.top)),
  };
}

function getInitialFloatingPosition(): FloatingPosition {
  if (typeof window === "undefined") return { left: SETTINGS_MARGIN, top: SETTINGS_MARGIN };

  try {
    const saved = JSON.parse(window.localStorage.getItem(DEV_SETTINGS_POSITION_KEY) || "null");
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
      return clampFloatingPosition({ left: saved.left, top: saved.top });
    }
  } catch {
    // Use the default corner if the saved position is missing or unavailable.
  }

  return clampFloatingPosition({
    left: window.innerWidth - SETTINGS_ICON_SIZE - 16,
    top: window.innerHeight - SETTINGS_ICON_SIZE - 104,
  });
}

export default function DevModeSettings() {
  const [isEnabled, setIsEnabled] = useDevModeStatus();
  const [quickAccessEnabled, setQuickAccessEnabled] = useDevModeFeature("quickAccess");
  const [testDataToolsEnabled, setTestDataToolsEnabled] = useDevModeFeature("testDataTools");
  const [enforceBoundary, setEnforceBoundary] = useDevModeFeature("enforceBoundary");
  const [imageProofRequired, setImageProofRequired] = useDevModeFeature("imageProofRequired");
  const [sameRouteLobbyFilter, setSameRouteLobbyFilter] = useDevModeFeature("sameRouteLobbyFilter");
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<FloatingPosition>(getInitialFloatingPosition);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<FloatingDrag | null>(null);
  const ignoreNextClickRef = useRef(false);

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.left,
      startTop: position.top,
      position,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;

    drag.moved = true;
    drag.position = clampFloatingPosition({
      left: drag.startLeft + deltaX,
      top: drag.startTop + deltaY,
    });
    setPosition(drag.position);
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    if (!drag.moved) return;

    setPosition(drag.position);
    try {
      window.localStorage.setItem(DEV_SETTINGS_POSITION_KEY, JSON.stringify(drag.position));
    } catch {
      // The icon remains movable for this session if storage is unavailable.
    }
    ignoreNextClickRef.current = true;
    window.setTimeout(() => {
      ignoreNextClickRef.current = false;
    }, 0);
  };

  const handleTriggerClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    setIsOpen((open) => !open);
  };

  useEffect(() => {
    const clampPositionOnResize = () => setPosition((current) => clampFloatingPosition(current));
    window.addEventListener("resize", clampPositionOnResize);
    return () => window.removeEventListener("resize", clampPositionOnResize);
  }, []);

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

  const panelWidth = Math.min(352, window.innerWidth - 32);
  const panelLeft = Math.max(
    16,
    Math.min(window.innerWidth - panelWidth - 16, position.left + SETTINGS_ICON_SIZE - panelWidth),
  );
  const aboveSpace = position.top - SETTINGS_MARGIN;
  const belowSpace = window.innerHeight - position.top - SETTINGS_ICON_SIZE - SETTINGS_MARGIN;
  const panelOpensBelow = belowSpace > aboveSpace;
  const panelMaxHeight = Math.max(160, Math.min(window.innerHeight - SETTINGS_MARGIN * 2, Math.max(aboveSpace, belowSpace)));

  return (
    <div className="fixed z-[10001]" style={{ left: position.left, top: position.top }}>
      {isOpen && (
        <div
          ref={panelRef}
          id="dev-mode-settings-panel"
          role="dialog"
          aria-labelledby="dev-mode-settings-title"
          style={{
            left: panelLeft - position.left,
            top: panelOpensBelow ? `calc(100% + 0.75rem)` : "auto",
            bottom: panelOpensBelow ? "auto" : `calc(100% + 0.75rem)`,
            maxHeight: panelMaxHeight,
          }}
          className="absolute w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-card p-4 shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div
              className="min-w-0 cursor-move touch-none select-none"
              title="Drag to move developer settings"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
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
        onClick={handleTriggerClick}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        aria-label={isOpen ? "Close developer settings" : "Open developer settings"}
        aria-expanded={isOpen}
        aria-controls="dev-mode-settings-panel"
        title="Drag to move; click to open developer settings"
        className="grid size-14 touch-none cursor-move place-items-center rounded-full border border-white/15 bg-[var(--ink-solid)] text-white shadow-lg shadow-black/25 transition-transform hover:scale-105 hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
      >
        {isOpen ? <X className="size-6" aria-hidden="true" /> : <Settings2 className="size-6" aria-hidden="true" />}
        <span className="sr-only">Dev mode on</span>
      </button>
    </div>
  );
}
