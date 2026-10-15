import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Menu, X } from "lucide-react";

// The bytes in this file are JPEG, not PNG, so it carries a .jpg name. Served
// under a .png name it was sent as image/png and Chromium's sniffing rejected it
// intermittently, leaving an empty logo box.
import TrikeServeLogo from "../../../assets/TRIKESERVE_logo.jpg";
import TrimmedLogo from "../ui/TrimmedLogo";
import { useAuth } from "../../contexts/AuthContext";
import { adminNavFor, isSuperAdmin } from "./adminNav";

type AdminShellProps = {
  title: string;
  /** Supporting line under the title. */
  subtitle?: ReactNode;
  /** Right-hand actions, e.g. a "New Terminal" button. */
  actions?: ReactNode;
  /** Skip the page padding when the child lays itself out. */
  bare?: boolean;
  children: ReactNode;
};

/**
 * The single admin layout.
 *
 * Previously each admin page hand-rolled `min-h-screen flex` + AdminSidebar +
 * a duplicated sticky header, which is how the destinations drifted apart
 * between screens. Everything structural now lives here.
 */
export default function AdminShell({
  title,
  subtitle,
  actions,
  bare = false,
  children,
}: AdminShellProps) {
  const { user } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const superAdmin = isSuperAdmin(user);
  const items = adminNavFor(user);
  // Rider Admin gets the short Filipino gloss; Super Admin is English-only.
  const showBilingual = !superAdmin;

  // Close the drawer on navigation so tapping an item actually navigates.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // A drawer that survives a resize would leave an invisible overlay on desktop.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mql.matches) setIsMenuOpen(false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-dvh bg-[var(--muted)] flex">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[1100] focus:top-3 focus:left-3 focus:rounded-xl focus:bg-[var(--primary)] focus:px-4 focus:py-2 focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      {/* Drawer scrim — mobile only */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-[1000] bg-black/50 lg:hidden"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Navigation */}
      <div
        id="admin-nav"
        className={[
          "fixed top-0 left-0 z-[1001] w-64 bg-[var(--sidebar)] border-r-2 border-[var(--border)]",
          "transition-transform duration-300 ease-in-out lg:translate-x-0",
          "h-dvh max-h-dvh flex flex-col",
          isMenuOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="p-5 lg:p-6 border-b-2 border-[var(--border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[var(--primary)] to-[var(--ink)] rounded-xl flex items-center justify-center overflow-hidden">
              {/* The TrikeServe mark, not a generic shield: the admin panel is
                  part of this product, and the same logo already leads the
                  business sidebar. A shield said "security" but not whose.
                  TrimmedLogo crops the asset's dead margin so the artwork fills
                  this tile and the gradient shows through behind it. */}
              <TrimmedLogo src={TrikeServeLogo} alt="TrikeServe" className="size-full object-contain p-0.5" />
            </div>
            <div className="min-w-0">
              <span className="block text-xl font-bold text-[var(--ink)]">ADMIN</span>
              <p className="text-xs text-[var(--muted-foreground)] truncate">
                {/* A Rider Admin is scoped to one terminal, so naming it says far
                    more than the generic role label, and tells them at a glance
                    which terminal they are operating on. Falls back to the role
                    while they have no assignment yet. */}
                {superAdmin
                  ? "Super Admin"
                  : user?.terminalName
                    ? `${user.terminalName} Admin`
                    : "Rider Admin"}
              </p>
            </div>
          </div>

          {/* Same missing-`flex` bug as the hamburger, and the same fix — without it
              the X sat left of the middle of its own circle. */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-[var(--muted)]"
          >
            <X className="w-5 h-5 text-[var(--ink)]" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Admin sections" className="flex-1 p-4 space-y-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {items.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? "page" : undefined}
                className={[
                  "w-full min-h-11 flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
                  active
                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                <item.Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{item.label}</span>
                  {showBilingual && (
                    <span className="block text-[11px] opacity-80 truncate">{item.filipino}</span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main column */}
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col">
        <header className="bg-surface border-b-2 border-[var(--border)] px-4 sm:px-5 lg:px-8 py-3 sm:py-4 lg:py-5 sticky top-0 z-50">
          {/* One row at every width. Stacking on mobile pushed the bell onto its
              own line and left a mostly-empty header; letting the title shrink
              and truncate instead keeps the actions reachable, and `truncate` is
              what supplies the ellipsis when the text doesn't fit. */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              {/* `flex` is load-bearing: without it the button lays out as a block
                  and the items/justify centring is inert, leaving the icon pinned
                  to the left edge of its own button. */}
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                aria-label="Open navigation"
                aria-controls="admin-nav"
                aria-expanded={isMenuOpen}
                className="lg:hidden flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-[var(--muted)] transition-colors"
              >
                <Menu className="w-6 h-6 text-[var(--ink)]" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[var(--ink)] truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-xs sm:text-sm text-[var(--muted-foreground)] truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* flex-shrink-0 and no wrapping: these are the header's controls, and
                they must not reflow when a long title is present. */}
            {actions && (
              <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">{actions}</div>
            )}
          </div>
        </header>

        <main
          id="admin-main"
          className={
            bare
              ? "flex-1 min-w-0"
              : "flex-1 min-w-0 p-4 sm:p-5 lg:p-8 pb-[max(2rem,env(safe-area-inset-bottom))]"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}