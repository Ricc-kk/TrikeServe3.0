import { useState, useEffect, useMemo, useRef, useId } from "react";
import { createPortal } from "react-dom";
import {
  Users, Store, Search, Trash2, CheckCircle,
  XCircle, Menu, User as UserIcon, Shield, Filter, MoreVertical, ChevronDown,
  Mail, Phone, MapPin, CalendarDays, Hash, Check
} from "lucide-react";
import { TerminalIconGlyph } from "../ui/TerminalIcon";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import ListPagination from "../ui/ListPagination";
import { useAuth } from "../../contexts/AuthContext";

import { supabase } from "../../../utils/supabase";
import { adminDeleteUser, adminVerifyUser, adminUnverifyUser, adminChangeRole } from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";
import EmptyState from "../ui/EmptyState";
import AdminShell from "./AdminShell";
import { StatSkeleton, TableSkeleton } from "./AdminSkeleton";

interface StoredUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'rider' | 'business' | 'admin';
  isVerified: boolean;
  createdAt: string;
  password: string;
  adminType?: 'business_customer' | 'rider';
  todaPlate?: string;
  /** Which TODA this driver drives out of, for the TODA filter below. */
  terminalId?: string;
  terminalName?: string;
  businessName?: string;
  businessAddress?: string;
  address?: string;
  /**
   * The business's actual restaurant row, joined from `restaurants`.
   *
   * This is the source of truth. `businessName` / `businessAddress` on the user
   * are a denormalised copy that several restaurant screens write past, so they
   * can be stale or missing while the shop itself is perfectly intact — which is
   * why the profile is read from here and the copy is only a fallback.
   */
  restaurant?: {
    name?: string;
    address?: string;
    subtitle?: string;
    rating?: number | null;
    isOpen?: boolean | null;
    cuisine?: string[] | null;
    deliveryTime?: string | null;
    logoImage?: string | null;
  } | null;
}

/**
 * A business user's restaurant profile.
 *
 * One component for both the mobile card and the desktop table so the two can't
 * drift — the previous version showed only an address in the table and nothing
 * at all on mobile, which is how the whole profile ended up looking missing.
 *
 * Falls back to the user-row copy when no restaurants row exists yet (a shop is
 * only created once its owner sets one up), and says so rather than rendering an
 * empty block.
 */
function RestaurantProfile({ user }: { user: StoredUser }) {
  const r = user.restaurant;
  const address = r?.address || user.businessAddress;

  if (!r) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">
        {address
          ? `No restaurant set up yet — listed as ${address}`
          : 'No restaurant set up yet'}
      </p>
    );
  }

  const cuisines = Array.isArray(r.cuisine) ? r.cuisine.filter(Boolean) : [];

  return (
    <div className="flex items-start gap-3 min-w-0">
      {r.logoImage ? (
        <img
          src={r.logoImage}
          alt=""
          loading="lazy"
          className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-line"
        />
      ) : null}
      <div className="min-w-0 text-xs text-[var(--muted-foreground)] space-y-0.5">
        {r.subtitle && <p className="truncate font-medium text-[var(--ink)]">{r.subtitle}</p>}
        {address && <p className="truncate">Addr: {address}</p>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
          {r.rating != null && (
            <span className="font-semibold text-[var(--amber)]">★ {Number(r.rating).toFixed(1)}</span>
          )}
          {r.isOpen != null && (
            <span
              className={`font-semibold ${r.isOpen ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}
            >
              {r.isOpen ? 'Open' : 'Closed'}
            </span>
          )}
          {r.deliveryTime && <span>{r.deliveryTime}</span>}
        </div>
        {cuisines.length > 0 && (
          <p className="truncate">{cuisines.join(' · ')}</p>
        )}
      </div>
    </div>
  );
}

/** Shared dialog frame, above the admin navigation and below confirmations. */
function ModalShell({
  open,
  active = true,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-sm',
  zClass = 'z-[1100]',
  initialFocusRef,
}: {
  open: boolean;
  /** Pause keyboard handling while a confirmation is above this dialog. */
  active?: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  zClass?: string;
  /** Focused when the dialog opens, so the keyboard is inside it. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (open && active) (initialFocusRef?.current ?? dialogRef.current)?.focus();
  }, [open, active, initialFocusRef]);

  useEffect(() => {
    if (!open || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        e.preventDefault();
        dialogRef.current.focus();
      } else if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, active, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={`fixed inset-0 ${zClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/50" data-modal-backdrop="" aria-hidden="true" onClick={active ? onClose : undefined} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative w-full ${maxWidth} bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]`}
      >
        <div className="p-5 border-b border-line shrink-0">
          <h3 id={titleId} className="text-lg font-bold text-[var(--ink)] break-words">{title}</h3>
          {description ? (
            <p id={descriptionId} className="text-sm text-[var(--muted-foreground)] mt-1 break-words">{description}</p>
          ) : null}
        </div>

        <div className="min-h-0 overflow-y-auto">{children}</div>

        {footer ? <div className="border-t border-line shrink-0">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * One choice in an {@link OptionPicker}.
 *
 * `hint` is the line under the label that says what picking this actually does.
 * It earns its place on the choices that change somebody's access rather than
 * merely narrow a list -- "this makes them able to run a terminal" is not
 * something to leave implied behind the word "Driver".
 */
export type PickerOption = {
  value: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
};

/**
 * A modal list of choices, standing in for a native `<select>`.
 *
 * Every dropdown on this screen is one of these now -- the three filters and the
 * role a user is changed to. A native select is a closed box: it renders its
 * options with the platform's own styling, offers no room to say what an option
 * means, and on a touch screen it hands the list to an OS sheet the page cannot
 * style. Putting the list in a dialog the app owns means the options can carry a
 * second line, the current one can be ticked, and it looks the same on every
 * device.
 */
function OptionPicker({
  open,
  title,
  description,
  options,
  value,
  onPick,
  onClose,
  emptyNote,
}: {
  open: boolean;
  title: string;
  description?: string;
  options: PickerOption[];
  /** Currently chosen value, ticked in the list. */
  value: string | null;
  onPick: (value: string) => void;
  onClose: () => void;
  /** Shown instead of the list when there is nothing to choose. */
  emptyNote?: string;
}) {
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalShell
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      zClass="z-[1100]"
      initialFocusRef={firstOptionRef}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 text-sm font-semibold text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
        >
          Cancel
        </button>
      }
    >
      <ul role="listbox" aria-label={title} className="py-1">
        {options.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)] italic">
            {emptyNote || 'Nothing to choose from yet'}
          </li>
        ) : (
          options.map((opt, i) => {
            const selected = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  ref={i === 0 ? firstOptionRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onPick(opt.value)}
                  className={`w-full min-h-11 flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--soft)] ${
                    selected ? 'bg-[var(--soft)]' : ''
                  }`}
                >
                  {opt.icon ? <span className="flex-shrink-0">{opt.icon}</span> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--ink)]">
                      {opt.label}
                    </span>
                    {opt.hint ? (
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        {opt.hint}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check
                      className="w-4 h-4 flex-shrink-0 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </ModalShell>
  );
}

/**
 * The button that stands where a filter's `<select>` used to.
 *
 * Shows the current choice and nothing else, which is what the select showed, so
 * nothing is lost -- but it names itself for a screen reader via `label`, because
 * "Verified Only" on its own does not say which filter it belongs to.
 */
function FilterButton({
  label,
  valueLabel,
  onClick,
}: {
  label: string;
  valueLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      className="w-full min-h-11 flex items-center justify-between gap-2 px-3 py-3 border border-line rounded-xl font-semibold bg-surface text-[var(--ink)] hover:bg-[var(--muted)] transition-colors"
    >
      <span className="truncate">{valueLabel}</span>
      <ChevronDown
        className="w-4 h-4 flex-shrink-0 text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The label a filter button shows for its current value.
 *
 * Falls back to the neutral label when the stored value names an option that no
 * longer exists -- a TODA deleted from under an open tab, most likely. The button
 * then reads "All TODAs" and the list still ticks nothing, rather than showing a
 * blank control.
 */
function labelOfOption(
  options: PickerOption[],
  value: string,
  fallback: string,
): string {
  return options.find(o => o.value === value)?.label ?? fallback;
}

/**
 * The name a row is listed and sorted under.
 *
 * A business is listed under its shop name, so sorting on `users.name` alone
 * files the shops by the owner's name instead -- "Baga Burger" landing between
 * "Lou Cruz" and "Lots'a Wings" because the row behind it is sorted on something
 * nobody can see. Sort on what is shown instead.
 *
 * Doing it here rather than relying only on the query's ORDER BY is also what
 * makes pagination safe: this is a total order over the displayed name, so two
 * loads cannot disagree about who is on which page.
 */
function displayNameOf(u: StoredUser): string {
  return u.role === 'business' ? (u.businessName || u.name) : u.name;
}

/** Comparator for `Array.prototype.sort`, case- and accent-insensitive. */
function byDisplayName(a: StoredUser, b: StoredUser): number {
  // A row with no name at all still needs a position; sorting it last is more
  // honest than letting it interleave with real names.
  const an = (a.name || '').trim();
  const bn = (b.name || '').trim();
  if (!an && bn) return 1;
  if (an && !bn) return -1;
  return displayNameOf(a).localeCompare(displayNameOf(b), undefined, { sensitivity: 'base' });
}

/**
 * Role icon and badge colour, at module scope.
 *
 * Was inside the component, which meant the detail panel -- a separate component
 * rendered for the selected user -- could not reach them. They depend on nothing
 * but the role string, so there is no reason for them to be per-instance; leaving
 * them in scope meant the panel had to have both passed in as props forever.
 */
function getRoleIcon(role: string) {
  switch (role) {
    case 'customer':
      return <Users className="w-5 h-5 text-[var(--success)]" />;
    case 'rider':
      return <TerminalIconGlyph className="w-5 h-5 text-[var(--info)]" />;
    case 'business':
      return <Store className="w-5 h-5 text-[var(--violet)]" />;
    default:
      return <UserIcon className="w-5 h-5 text-[var(--muted-foreground)]" />;
  }
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'customer':
      return 'bg-[var(--success)]';
    case 'rider':
      return 'bg-[var(--info)]';
    case 'business':
      return 'bg-[var(--violet)]';
    default:
      return 'bg-[var(--muted-foreground)]';
  }
}

/** A date a person can read, or an honest "unknown" rather than "Invalid Date". */
function formatJoined(iso?: string): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * One labelled value in the detail panel.
 *
 * The label sits above the value rather than beside it, so a long email or shop
 * address gets the full column width instead of being truncated against a fixed
 * label gutter — which is what every email in this table was doing before.
 */
function DetailField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="mt-0.5 flex-shrink-0 text-[var(--muted-foreground)]" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
          {label}
        </p>
        <div className="text-sm text-[var(--ink)] break-words">{children}</div>
      </div>
    </div>
  );
}

/** Rendered in place of a value the account simply does not carry. */
function NotSet() {
  return <span className="text-[var(--muted-foreground)] italic">Not set</span>;
}

/**
 * The full record behind one summarised row, in a dialog.
 *
 * Everything the table dropped to make itself a summary lives here: the contact
 * details, the role-specific fields that differ per role, and when the account
 * was created.
 *
 * This is a modal rather than an expanding row. Expanding in place pushed the
 * rows below it down the page, which on a ten-row page means the record you
 * opened scrolls away from the row you opened it for -- and left no way to see a
 * long restaurant profile without scrolling inside a page that was already
 * scrolling.
 *
 * The role-specific part is genuinely conditional rather than a generic
 * key/value list, because a driver, a shop and a customer do not have the same
 * fields. Showing a customer's "TODA Plate: not set" is worse than not showing
 * the field at all.
 *
 * Confirmations appear above this dialog without losing the selected record.
 */
function UserDetailModal({
  user,
  active,
  isSuperAdmin,
  onClose,
  onVerify,
  onUnverify,
  onDelete,
}: {
  user: StoredUser | null;
  active: boolean;
  isSuperAdmin: boolean;
  onClose: () => void;
  onVerify: () => void;
  onUnverify: () => void;
  onDelete: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  if (!user) return null;

  const displayName = displayNameOf(user);

  return (
    <ModalShell
      open
      active={active}
      title={displayName}
      description={user.email}
      onClose={onClose}
      maxWidth="max-w-lg"
      zClass="z-[1100]"
      initialFocusRef={closeRef}
      footer={
        <div className="flex flex-wrap items-center gap-2 p-4">
          {isSuperAdmin ? (
            <>
              <button
                type="button"
                onClick={user.isVerified ? onUnverify : onVerify}
                className={`min-h-11 px-4 rounded-lg transition-all flex items-center gap-1.5 font-semibold text-xs ${
                  user.isVerified
                    ? 'bg-[var(--amber)] text-white'
                    : 'bg-[var(--success)] text-white'
                }`}
              >
                {user.isVerified ? (
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                )}
                {user.isVerified ? 'Unverify' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="min-h-11 px-4 rounded-lg bg-[var(--error)] text-white transition-all flex items-center gap-1.5 font-semibold text-xs"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Delete
              </button>
            </>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)] flex-1">
              Verification, role changes and account management are handled by the
              Super Admin.
            </p>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="ml-auto min-h-11 px-5 rounded-xl border border-line font-semibold text-sm text-[var(--ink)] hover:bg-[var(--muted)] transition-colors"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center ${
              user.role === 'customer'
                ? 'bg-[var(--success-soft)]'
                : user.role === 'rider'
                  ? 'bg-[var(--info-soft)]'
                  : 'bg-[var(--violet-soft)]'
            }`}
          >
            {getRoleIcon(user.role)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={getRoleBadgeColor(user.role)}>{user.role.toUpperCase()}</Badge>
            {user.isVerified ? (
              <Badge className="bg-[var(--success-soft)] text-[var(--success)]">Verified</Badge>
            ) : (
              <Badge className="bg-[var(--amber-soft)] text-[var(--amber-ink)]">Pending</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField icon={<Phone className="w-4 h-4" />} label="Phone">
            {user.phone || <NotSet />}
          </DetailField>
          <DetailField icon={<CalendarDays className="w-4 h-4" />} label="Joined">
            {formatJoined(user.createdAt)}
          </DetailField>

          {/* Role-specific. Only the fields this role actually has -- an account
              that never carries a value is not shown a field saying so. */}
          {user.role === 'rider' && (
            <>
              <DetailField icon={<Hash className="w-4 h-4" />} label="TODA Plate">
                {user.todaPlate || <NotSet />}
              </DetailField>
              {/* The terminal is set from Terminals -> Assignments, and a driver
                  can legitimately have none. Saying which TODA is the one thing
                  the table could not fit and the office kept asking for. */}
              <DetailField icon={<TerminalIconGlyph className="w-4 h-4" />} label="TODA">
                {user.terminalName || user.terminalId || <NotSet />}
              </DetailField>
            </>
          )}

          {user.role === 'customer' && (
            <DetailField icon={<MapPin className="w-4 h-4" />} label="Address">
              {user.address || <NotSet />}
            </DetailField>
          )}
        </div>

        {user.role === 'business' && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5">
              Restaurant
            </p>
            <RestaurantProfile user={user} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  /**
   * Which TODA the list is narrowed to, and the list of TODAs to offer.
   *
   * A third filter because role and status cannot answer "who is on M TODA":
   * every driver is a driver and most are verified, so the only way to find one
   * terminal's people was to read the whole list. `unassigned` is an option in
   * its own right — the drivers nobody has given a terminal to are the ones most
   * worth seeing, and they have no terminal to be found under.
   */
  const [filterTerminal, setFilterTerminal] = useState<string>("all");
  const [terminals, setTerminals] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // PostgREST's builder is thenable, not a real Promise, so it has no
        // `.catch` -- the read is wrapped rather than chained onto one.
        const { data } = await supabase.from('terminals').select('id, name').order('name');
        if (!cancelled && data) setTerminals(data);
      } catch {
        /* offline, or the table isn't there: the filter offers no TODAs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, [user]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // The restaurant profile is joined rather than read off the user row.
      // `restaurants.business_user_id` -> `users.id` is the only link between
      // them, and a shop row is not created at sign-up, so business users
      // without one are expected — the mapping has to survive a null here.
      //
      // Ordered by name because this list is paginated. PostgREST without an
      // ORDER BY returns rows in whatever order the planner happens to produce,
      // and that order is not guaranteed to be the same twice -- so page 2 could
      // repeat a row already on page 1, or skip one entirely. Alphabetical also
      // happens to be the order someone scanning a directory wants.
      const { data: supabaseUsers, error } = await supabase
        .from('users')
        .select('*, restaurants(name, address, subtitle, rating, is_open, cuisine, delivery_time, logo_image)')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading users from Supabase:', error);
        loadUsersFromLocalStorage();
        return;
      }

      if (!supabaseUsers) {
        setLoading(false);
        return;
      }

      const allUsers: StoredUser[] = supabaseUsers.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isVerified: u.is_verified,
        createdAt: u.created_at,
        password: '',
        adminType: u.admin_type,
        todaPlate: u.toda_plate,
        terminalId: u.terminal_id,
        terminalName: u.terminal_name,
        // The joined row wins; the user-row copy is only a fallback for a shop
        // that has no restaurants row yet.
        businessName: u.restaurants?.name || u.business_name,
        businessAddress: u.restaurants?.address || u.business_address,
        address: u.address,
        restaurant: u.restaurants
          ? {
              name: u.restaurants.name,
              address: u.restaurants.address,
              subtitle: u.restaurants.subtitle,
              rating: u.restaurants.rating,
              isOpen: u.restaurants.is_open,
              cuisine: u.restaurants.cuisine,
              deliveryTime: u.restaurants.delivery_time,
              logoImage: u.restaurants.logo_image,
            }
          : null,
      }));

      const adminType = user?.adminType;
      // Super Admin sees every user; the Rider Admin only gets riders (read-only).
      let filteredUsers = allUsers.filter(u => u.role !== 'admin');
      if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter(u => u.role === 'rider');
      }

      setUsers(filteredUsers.sort(byDisplayName));
    } catch (error) {
      console.error('Error in loadUsers:', error);
      loadUsersFromLocalStorage();
    } finally {
      setLoading(false);
    }
  };

  const loadUsersFromLocalStorage = () => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (!usersJson) {
      setLoading(false);
      return;
    }
    {
      const allUsers: StoredUser[] = JSON.parse(usersJson);
      const adminType = user?.adminType;

      // Super Admin sees every user; the Rider Admin only gets riders (read-only).
      let filteredUsers = allUsers.filter(u => u.role !== 'admin');
      if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter(u => u.role === 'rider');
      }

      setUsers(filteredUsers);
    }
    setLoading(false);
  };

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'success';
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const openModal = (config: typeof modalConfig) => {
    setModalConfig(config);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalConfig(null);
  };

  const handleDeleteUser = async (userId: string) => {
    openModal({
      title: "Delete User",
      message: "Are you sure you want to delete this user? This action cannot be undone.",
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        const result = await adminDeleteUser(userId);
        if (!result.success) {
          setToast({ message: `Delete failed: ${result.error}`, variant: 'error' });
          return;
        }
        const usersJson = localStorage.getItem('trikeserve_users');
        if (usersJson) {
          const allUsers: StoredUser[] = JSON.parse(usersJson);
          localStorage.setItem('trikeserve_users', JSON.stringify(allUsers.filter(u => u.id !== userId)));
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User deleted successfully', variant: 'success' });
      },
    });
  };

  const handleVerifyUser = async (userId: string) => {
    openModal({
      title: "Verify User",
      message: "Approve this user? They will be able to log in immediately.",
      variant: "success",
      confirmLabel: "Verify",
      onConfirm: async () => {
        const result = await adminVerifyUser(userId);
        if (!result.success) {
          setToast({ message: `Verify failed: ${result.error}`, variant: 'error' });
          return;
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User verified successfully', variant: 'success' });
      },
    });
  };

  const handleUnverifyUser = async (userId: string) => {
    openModal({
      title: "Unverify User",
      message: "Are you sure you want to unverify this user? They will not be able to log in until re-verified.",
      variant: "warning",
      confirmLabel: "Unverify",
      onConfirm: async () => {
        const result = await adminUnverifyUser(userId);
        if (!result.success) {
          setToast({ message: `Unverify failed: ${result.error}`, variant: 'error' });
          return;
        }
        const usersJson = localStorage.getItem('trikeserve_users');
        if (usersJson) {
          const allUsers: StoredUser[] = JSON.parse(usersJson);
          localStorage.setItem('trikeserve_users', JSON.stringify(allUsers.map(u =>
            u.id === userId ? { ...u, isVerified: false } : u
          )));
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User unverified successfully', variant: 'warning' });
      },
    });
  };

  // Only the Super Admin performs user actions; the Rider Admin gets a read-only driver list.
  const isSuperAdmin = user?.adminType === 'business_customer';
  const isRiderReadOnly = user?.adminType === 'rider';

  const canVerifyUser = (_userRole: string): boolean => isSuperAdmin;
  const canDeleteUser = (_userRole: string): boolean => isSuperAdmin;

  const getBlockedReason = (_userRole: string): string =>
    'Only the Super Admin can manage users';

  /**
   * Confirm and apply a role change.
   *
   * Takes the role as an argument rather than reading it from component state.
   * The old inline editor staged the choice in `editRole` and only read it on
   * save, which meant the value being confirmed could be a step behind what was
   * on screen if anything re-rendered in between -- and left two pieces of state
   * (editingUserId, editRole) alive purely to carry one value from a dropdown to
   * a confirmation.
   */
  const handleSaveRole = (userId: string, role: string, name: string) => {
    openModal({
      title: "Change Role",
      message: `Change ${name}'s role to ${role.toUpperCase()}?`,
      variant: "success",
      confirmLabel: "Change Role",
      onConfirm: async () => {
        const result = await adminChangeRole(userId, role);
        if (!result.success) {
          setToast({ message: `Change role failed: ${result.error}`, variant: 'error' });
          return;
        }
        loadUsers();
        closeModal();
        setToast({ message: `User role changed to ${role.toUpperCase()}`, variant: 'success' });
      },
    });
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.includes(searchQuery);

    const matchesRole = filterRole === "all" || u.role === filterRole;
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "verified" && u.isVerified) ||
      (filterStatus === "pending" && !u.isVerified);
    // `unassigned` is a terminal filter value rather than a terminal, so it is
    // matched here instead of being faked into the options list.
    const matchesTerminal =
      filterTerminal === "all" ||
      (filterTerminal === "unassigned" ? !u.terminalId : u.terminalId === filterTerminal);

    return matchesSearch && matchesRole && matchesStatus && matchesTerminal;
  });

  // Lets the empty state say *why* it is empty and offer a way back.
  const hasActiveFilter =
    searchQuery.trim() !== "" ||
    filterRole !== "all" ||
    filterStatus !== "all" ||
    filterTerminal !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setFilterRole("all");
    setFilterStatus("all");
    setFilterTerminal("all");
    setPage(1);
  };

  /**
   * Which filter's modal is open, and which user's role is being changed.
   *
   * Two separate slots rather than one, because they can be open at the same
   * time in principle and neither is a child of the other -- a role change
   * belongs to a row, a filter belongs to the bar above the table.
   */
  const [openFilter, setOpenFilter] = useState<'role' | 'status' | 'terminal' | null>(null);
  const [roleEditForUserId, setRoleEditForUserId] = useState<string | null>(null);

  const closePickers = () => {
    setOpenFilter(null);
    setRoleEditForUserId(null);
  };

  /**
   * Changing a filter starts a new list, so it starts at page 1.
   *
   * Done in the same handler as the filter change rather than in an effect
   * watching the filters. An effect fires after the render that changed them, so
   * the list would briefly be sliced at the *old* page number -- showing nothing,
   * on the one screen where the reader is deciding whether their filter worked.
   * The open detail panel is deliberately left alone: if the selected user still
   * matches, there is no reason to close what they were reading.
   */
  const onFilterChange = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setPage(1);
  };

  /** Apply a choice from a filter modal and dismiss it. */
  const pickFilter = (
    key: 'role' | 'status' | 'terminal',
    setter: (value: string) => void,
    value: string,
  ) => {
    setter(value);
    setPage(1);
    setOpenFilter(null);
  };

  const roleFilterOptions = useMemo<PickerOption[]>(() => {
    const options: PickerOption[] = [{ value: 'all', label: 'All Roles' }];
    // Deduplicated because the two admin types overlap on 'rider': without this
    // a Rider Admin's modal would offer "Drivers" twice, as the old <select> did.
    const seen = new Set(['all']);
    const add = (value: string, label: string) => {
      if (seen.has(value)) return;
      seen.add(value);
      options.push({ value, label });
    };
    if (!user?.adminType || user.adminType === 'business_customer') {
      add('customer', 'Customers');
      add('business', 'Businesses');
    }
    add('rider', 'Drivers');
    return options;
  }, [user?.adminType]);

  const statusFilterOptions: PickerOption[] = [
    { value: 'all', label: 'All Status' },
    { value: 'verified', label: 'Verified Only' },
    { value: 'pending', label: 'Pending Only' },
  ];

  const terminalFilterOptions = useMemo<PickerOption[]>(
    () => [
      { value: 'all', label: 'All TODAs' },
      // Before any TODA exists this is the only way to reach the drivers who
      // have no terminal, so it is always offered.
      {
        value: 'unassigned',
        label: 'No TODA yet',
        hint: 'Drivers not on any terminal',
      },
      ...terminals.map(t => ({
        value: t.id,
        label: t.name,
        icon: (
          <TerminalIconGlyph
            className="w-4 h-4 text-[var(--info)]"
            aria-hidden="true"
          />
        ),
      })),
    ],
    [terminals],
  );

  /**
   * The roles this user may be moved to, and what each one would mean.
   *
   * The hints are the point. Changing somebody's role hands them a different app
   * and a different set of permissions, and that used to be confirmed by a
   * single sentence naming a role -- so the consequences were only visible after
   * the choice had already been made and confirmed.
   */
  const roleChangeOptions = useMemo<PickerOption[]>(() => {
    const options: PickerOption[] = [];
    const canSeeAll = !user?.adminType || user.adminType === 'business_customer';
    if (canSeeAll) {
      options.push(
        {
          value: 'customer',
          label: 'Customer',
          hint: 'Books rides and orders food',
        },
        {
          value: 'business',
          label: 'Business',
          hint: 'Runs a shop on the platform',
        },
      );
    }
    options.push({
      value: 'rider',
      label: 'Driver',
      hint: 'Drives out of a TODA terminal',
    });
    return options;
  }, [user?.adminType]);

  const userBeingReRole = users.find(u => u.id === roleEditForUserId) || null;

  /**
   * Rows per page. Ten is what a summary row needs -- small enough to scan a
   * whole screen of them, large enough that a busy terminal's drivers are not
   * spread over half a dozen pages.
   */
  const PAGE_SIZE = 10;

  /**
   * The page being read, and which user's details dialog is open.
   */
  const [page, setPage] = useState(1);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  /**
   * Open the detail dialog for a row.
   *
   * Not a toggle. A row opens a dialog that sits over the table, so tapping the
   * same row again cannot reach it, and a toggle would only mean that if the
   * dialog were somehow dismissed the next tap reopened it instead of closing it.
   */
  const openUserDetails = (id: string) => setDetailUserId(id);

  /** The row the dialog is showing, re-read from state so edits show up in it. */
  const detailUser = users.find(u => u.id === detailUserId) || null;

  /**
   * Page count comes from the *filtered* list, so it shrinks the moment a filter
   * narrows things. `page` is clamped on read rather than corrected in an
   * effect: an effect would render one frame too far first, and two effects
   * racing to correct the same page number is how you end up on page 1 of a
   * one-page list anyway.
   */
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const firstRowOnPage = filteredUsers.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastRowOnPage = Math.min(safePage * PAGE_SIZE, filteredUsers.length);

  // A user whose account is deleted while their details dialog is open must not
  // leave it pointing at a row that is no longer in the list.
  useEffect(() => {
    if (detailUserId && !users.some(u => u.id === detailUserId)) {
      setDetailUserId(null);
    }
  }, [users, detailUserId]);

  const stats = {
    total: users.length,
    customers: users.filter(u => u.role === 'customer').length,
    riders: users.filter(u => u.role === 'rider').length,
    businesses: users.filter(u => u.role === 'business').length,
    verified: users.filter(u => u.isVerified).length,
    pending: users.filter(u => !u.isVerified).length,
  };

  return (
    <AdminShell
      title="User Management"
      subtitle="Manage users, roles, and verifications"
    >

        {/* Content */}
        <div className="space-y-6">
          {loading && (
            <>
              <StatSkeleton count={6} />
              <div className="mt-6">
                <TableSkeleton rows={6} cols={5} />
              </div>
            </>
          )}

          {!loading && isRiderReadOnly && (
            <Card className="p-4 mb-6 border-2 border-[var(--info-soft)] bg-[var(--info-soft)]">
              <p className="text-sm text-[var(--info)] font-semibold">Read-only access</p>
              <p className="text-xs text-[var(--info)]/80 mt-0.5">
                Verification, role changes and account management are handled by the Super Admin.
              </p>
            </Card>
          )}

          {!loading && (
          <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 lg:gap-4 mb-6">
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Total Users</p>
              <p className="text-2xl font-bold text-[var(--ink)]">{stats.total}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Customers</p>
              <p className="text-2xl font-bold text-[var(--success)]">{stats.customers}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Drivers</p>
              <p className="text-2xl font-bold text-[var(--info)]">{stats.riders}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Businesses</p>
              <p className="text-2xl font-bold text-[var(--violet)]">{stats.businesses}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Verified</p>
              <p className="text-2xl font-bold text-[var(--success)]">{stats.verified}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Pending</p>
              <p className="text-2xl font-bold text-[var(--amber)]">{stats.pending}</p>
            </Card>
          </div>

          {/* Search and Filters */}
          <Card className="p-5 border border-line bg-surface mb-6">
            {/* Four across, not three: adding the TODA filter to a three-column grid would
            have put it on a row of its own, doubling the height of the bar for
            one more control. */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                <label htmlFor="admin-user-search" className="sr-only">
                  Search users
                </label>
                <Input
                  id="admin-user-search"
                  type="search"
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => onFilterChange(setSearchQuery, e.target.value)}
                  className="pl-10 border border-line min-h-11"
                />
              </div>

              {/* Role Filter */}
              <FilterButton
                label="Filter by role"
                valueLabel={labelOfOption(roleFilterOptions, filterRole, 'All Roles')}
                onClick={() => setOpenFilter('role')}
              />

              {/* Status Filter */}
              <FilterButton
                label="Filter by verification status"
                valueLabel={labelOfOption(statusFilterOptions, filterStatus, 'All Status')}
                onClick={() => setOpenFilter('status')}
              />

              {/* TODA Filter */}
              <FilterButton
                label="Filter by TODA"
                valueLabel={labelOfOption(terminalFilterOptions, filterTerminal, 'All TODAs')}
                onClick={() => setOpenFilter('terminal')}
              />
            </div>
          </Card>

          {/* Users List */}
          <Card className="border border-line bg-surface overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="p-4 sm:p-6">
                <EmptyState
                  icon={Users}
                  title={hasActiveFilter ? 'No users match these filters' : 'No users yet'}
                  description={
                    hasActiveFilter
                      ? 'Try a different search term, role, status or TODA.'
                      : 'Registered customers, drivers and businesses will appear here.'
                  }
                  filipino={hasActiveFilter ? 'Wala pang tumutugma sa mga filter na ito.' : 'Wala pang nakarehistong gumagamit.'}
                  action={
                    hasActiveFilter ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="min-h-11 px-5 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
<>
              {/* Mobile: stacked cards. The table below needs three columns plus a
                  44px tap target, which a phone has no room for, so below sm each
                  user is one card that opens the same detail dialog. */}
              <div className="sm:hidden space-y-3">
                {pagedUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => openUserDetails(u.id)}
                    aria-label={`View details for ${displayNameOf(u)}`}
                    aria-haspopup="dialog"
                    className="w-full text-left rounded-2xl border border-line bg-surface p-4 min-h-11"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center ${
                          u.role === 'customer'
                            ? 'bg-[var(--success-soft)]'
                            : u.role === 'rider'
                              ? 'bg-[var(--info-soft)]'
                              : 'bg-[var(--violet-soft)]'
                        }`}
                      >
                        {getRoleIcon(u.role)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[var(--ink)] truncate">
                          {displayNameOf(u)}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                          {u.email}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge className={getRoleBadgeColor(u.role)}>
                        {u.role.toUpperCase()}
                      </Badge>
                      {u.isVerified ? (
                        <Badge className="bg-[var(--success-soft)] text-[var(--success)]">
                          Verified
                        </Badge>
                      ) : (
                        <Badge className="bg-[var(--amber-soft)] text-[var(--amber-ink)]">
                          Pending
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop / tablet: the summary table.

                  Three columns and the actions. Email, phone, plate, TODA, address
                  and the restaurant profile all moved behind the row click, which
                  is what takes this from seven columns and a horizontal scrollbar
                  down to something a laptop can show at a glance. */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">
                    Registered users. Select a row to see the full account details.
                  </caption>
                  <thead className="bg-[var(--muted)] border-b-2 border-[var(--border)]">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider"
                      >
                        User
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider"
                      >
                        Role
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider"
                      >
                        Status
                      </th>
                      {/* Only the Super Admin can verify or delete, so a Rider Admin
                          is just given an inert column of disabled buttons. Hide it
                          from them instead and let the remaining columns use the
                          space. */}
                      {!isRiderReadOnly && (
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-bold text-[var(--muted-foreground)] tracking-wider"
                        >
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {pagedUsers.map((u) => (
                      <tr
                        key={u.id}
                        onClick={event => {
                          // Role and account-action buttons keep their own behavior.
                          if ((event.target as Element).closest('button, a, input, select, textarea, [role="button"]')) return;
                          openUserDetails(u.id);
                        }}
                        className="cursor-pointer hover:bg-[var(--muted)] transition-colors"
                      >
                        <td className="px-4 py-2">
                          {/* Native button also supports opening details by keyboard. */}
                          <button
                            type="button"
                            onClick={() => openUserDetails(u.id)}
                            aria-label={`View details for ${displayNameOf(u)}`}
                            aria-haspopup="dialog"
                            className="flex w-full min-h-11 items-center gap-3 text-left rounded-lg group"
                          >
                            <div
                              className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center ${
                                u.role === 'customer'
                                  ? 'bg-[var(--success-soft)]'
                                  : u.role === 'rider'
                                    ? 'bg-[var(--info-soft)]'
                                    : 'bg-[var(--violet-soft)]'
                              }`}
                            >
                              {getRoleIcon(u.role)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-[var(--ink)] truncate">
                                {displayNameOf(u)}
                              </p>
                              <p className="text-xs text-[var(--muted-foreground)] truncate">
                                {u.email}
                              </p>
                            </div>
                          </button>
                        </td>
<td className="px-4 py-2">
                              {/* The badge is the control. It used to sit beside
                                  a pencil that opened an inline editor, which
                                  meant two clicks and a row-width <select> to
                                  change one word -- and the pencil was the only
                                  hint that the badge was tappable at all. The
                                  role a person holds is also the thing most
                                  worth re-reading, so tapping it is the obvious
                                  gesture. */}
                              {isSuperAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => setRoleEditForUserId(u.id)}
                                  aria-label={`Change role for ${displayNameOf(u)}, currently ${u.role}`}
                                  aria-haspopup="dialog"
                                  className="min-h-11 flex items-center rounded-lg group"
                                >
                                  <span className="group-hover:opacity-80 transition-opacity">
                                    <Badge className={getRoleBadgeColor(u.role)}>
                                      {u.role.toUpperCase()}
                                    </Badge>
                                  </span>
                                </button>
                              ) : (
                                <Badge className={getRoleBadgeColor(u.role)}>
                                  {u.role.toUpperCase()}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {u.isVerified ? (
                                <Badge className="bg-[var(--success-soft)] text-[var(--success)]">
                                  Verified
                                </Badge>
                              ) : (
                                <Badge className="bg-[var(--amber-soft)] text-[var(--amber-ink)]">
                                  Pending
                                </Badge>
                              )}
                            </td>
                            {!isRiderReadOnly && (
                              <td className="px-4 py-2">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={
                                      canVerifyUser(u.role)
                                        ? u.isVerified
                                          ? () => handleUnverifyUser(u.id)
                                          : () => handleVerifyUser(u.id)
                                        : undefined
                                    }
                                    disabled={!canVerifyUser(u.role)}
                                    aria-label={`${u.isVerified ? 'Unverify' : 'Verify'} ${displayNameOf(u)}`}
                                    title={
                                      !canVerifyUser(u.role)
                                        ? getBlockedReason(u.role)
                                        : u.isVerified
                                          ? 'Unverify this user'
                                          : 'Verify this user'
                                    }
                                    className={`min-h-11 px-3 rounded-lg transition-all flex items-center gap-1.5 font-semibold text-xs ${
                                      canVerifyUser(u.role)
                                        ? u.isVerified
                                          ? 'bg-[var(--amber)] hover:bg-[var(--amber)] text-white cursor-pointer'
                                          : 'bg-[var(--success)] hover:bg-[var(--success)] text-white cursor-pointer'
                                        : 'bg-[var(--muted-foreground)] text-[var(--muted-foreground)] cursor-not-allowed opacity-50'
                                    }`}
                                  >
                                    {u.isVerified ? (
                                      <XCircle className="w-4 h-4" aria-hidden="true" />
                                    ) : (
                                      <CheckCircle className="w-4 h-4" aria-hidden="true" />
                                    )}
                                    {u.isVerified ? 'Unverify' : 'Verify'}
                                  </button>
                                  <button
                                    onClick={
                                      canDeleteUser(u.role)
                                        ? () => handleDeleteUser(u.id)
                                        : undefined
                                    }
                                    disabled={!canDeleteUser(u.role)}
                                    aria-label={`Delete ${displayNameOf(u)}`}
                                    title={
                                      !canDeleteUser(u.role)
                                        ? getBlockedReason(u.role)
                                        : 'Delete this user'
                                    }
                                    className={`min-h-11 px-3 rounded-lg transition-all flex items-center gap-1.5 font-semibold text-xs ${
                                      canDeleteUser(u.role)
                                        ? 'bg-[var(--error)] hover:bg-[var(--error)] text-white cursor-pointer'
                                        : 'bg-[var(--muted-foreground)] text-[var(--muted-foreground)] cursor-not-allowed opacity-50'
                                    }`}
                                  >
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                    Delete
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination, below the table rather than above it: the range line
                  reads as a summary of what is on screen. Hidden entirely for a
                  list that fits on one page, so a short list is never shown
                  furniture for a problem it does not have. */}
              {filteredUsers.length > PAGE_SIZE && (
                <div className="border-t border-line px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Showing{' '}
                    <span className="font-bold text-[var(--ink)] tabular-nums">
                      {firstRowOnPage}
                    </span>
                    –
                    <span className="font-bold text-[var(--ink)] tabular-nums">
                      {lastRowOnPage}
                    </span>{' '}
                    of{' '}
                    <span className="font-bold text-[var(--ink)] tabular-nums">
                      {filteredUsers.length}
                    </span>{' '}
                    {filteredUsers.length === 1 ? 'user' : 'users'}
                  </p>
                  <ListPagination
                    page={safePage}
                    pageCount={pageCount}
                    onChange={setPage}
                    label="Users"
                  />
                </div>
              )}
              </>
            )}
          </Card>
          </>
          )}
        </div>

      {/* The detail dialog, for whichever row was opened. Rendered once at the end
          rather than inside the row: it is one overlay over the whole table,
          not something that belongs to a particular <tr>. */}
      <UserDetailModal
        user={detailUser}
        active={!modalOpen}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setDetailUserId(null)}
        onVerify={() => detailUser && handleVerifyUser(detailUser.id)}
        onUnverify={() => detailUser && handleUnverifyUser(detailUser.id)}
        onDelete={() => detailUser && handleDeleteUser(detailUser.id)}
      />

      {/* Filter modals. One dialog serving all three, so only one can be open at
          a time and the trap/escape handling is written once. */}
      <OptionPicker
        open={openFilter === 'role'}
        title="Filter by Role"
        options={roleFilterOptions}
        value={filterRole}
        onPick={v => pickFilter('role', setFilterRole, v)}
        onClose={closePickers}
      />
      <OptionPicker
        open={openFilter === 'status'}
        title="Filter by Status"
        options={statusFilterOptions}
        value={filterStatus}
        onPick={v => pickFilter('status', setFilterStatus, v)}
        onClose={closePickers}
      />
      <OptionPicker
        open={openFilter === 'terminal'}
        title="Filter by TODA"
        description={
          terminals.length === 0
            ? 'No TODA has been created yet, so there is nothing to filter by. Drivers with no terminal are under "No TODA yet".'
            : undefined
        }
        options={terminalFilterOptions}
        value={filterTerminal}
        onPick={v => pickFilter('terminal', setFilterTerminal, v)}
        onClose={closePickers}
      />

      {/* Role change, opened by tapping the role badge on a row. Dismissed before
          the confirmation opens, so the two dialogs are never stacked. */}
      <OptionPicker
        open={!!userBeingReRole}
        title={userBeingReRole ? `Change ${displayNameOf(userBeingReRole)}'s Role` : 'Change Role'}
        options={roleChangeOptions}
        value={userBeingReRole?.role ?? null}
        onPick={role => {
          const target = userBeingReRole;
          // Closed first: handleSaveRole opens the confirmation modal, and two
          // overlays at once is how the top one becomes unclearable.
          closePickers();
          if (target) handleSaveRole(target.id, role, displayNameOf(target));
        }}
        onClose={closePickers}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={modalOpen}
        onConfirm={modalConfig?.onConfirm || (() => {})}
        onCancel={closeModal}
        title={modalConfig?.title || ''}
        message={modalConfig?.message || ''}
        variant={modalConfig?.variant || 'danger'}
        confirmLabel={modalConfig?.confirmLabel || 'Confirm'}
        zIndexClassName="z-[1200]"
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </AdminShell>
  );
}
