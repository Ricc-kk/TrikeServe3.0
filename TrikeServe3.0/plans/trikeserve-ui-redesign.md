# TrikeServe — System-wide UI Redesign (all four roles)

Redesign the **real production app** in `TrikeServe3.0/` to the design language of the
TrikeServe customer-hub reference. This is **not** a standalone prototype: every screen
keeps its existing Supabase, Google Maps, pricing, cart, auth, and routing logic. Only
presentation, layout, components, and copy change.

## Decisions (confirmed)

- **Scope:** all four roles — customer, rider, business, admin.
- **Depth:** full visual redesign of each screen (layout, hierarchy, typography, components).
- **Layout:** mobile-first card hub **everywhere**; the business and admin sidebar layouts are
  retired in favor of the centered hub + labeled bottom navigation on all breakpoints.
- **Language:** English-first labels with short Filipino reassurance lines (no duplicated long
  paragraphs).
- **Maps:** **in scope.** Google Maps is a first-class UI surface, not an embedded widget —
  see the Map system section below.

## Stack reality (kept as-is)

- React 18 + Vite + Tailwind v4 + `ui/` primitives (CVA + Radix) + `react-router`. **No MUI** —
  the package is installed but unused; do not add it.
- Design tokens live in `src/styles/theme.css` (`@theme inline` mapping), the Atkinson
  Hyperlegible font in `src/styles/fonts.css`, and focus/safe-area/reduced-motion handling in
  `src/styles/index.css`.
- Google Maps is loaded through `@react-google-maps/api` plus the app's own loader
  (`src/lib/mapLoader.tsx`) and shared constants (`src/lib/googleMaps.ts`). These are not
  modified by the redesign.
- The app previews at **port 8443**; the frontend is npm-based and needs the portable Node 22
  (see `.freebuff/run.md`).

---

## Phase 0 — Foundation: one shell, one set of primitives

**Goal:** stop per-screen ad-hoc styling. Everything composes from a small, shared kit.

Shared components in `src/app/components/ui/`:

- `AppShell.tsx` — centered `max-w-3xl` warm canvas with `ambient-bg`, `bg-surface` panel,
  safe-area and bottom-nav padding; rounded floating panel from `md` up.
- `AppHeader.tsx` — role-aware ink header: amber "TS" monogram, greeting + title, service-area
  row, trust chip, labeled notification control with badge, optional short Filipino hint.
  Identity, greeting, area, and notification target derive from the signed-in user.
- `BottomNav.tsx` (extended) — `customer`, `rider`, `business`, and `admin` variants
  (`adminVariant: "super" | "rider"`), extra per-tab badges, react-router links, 56px targets.
- `AppSheet.tsx` — accessible bottom sheet/dialog on Radix Dialog: focus trap, Escape to close,
  explicit close control, and **focus returned to the control that opened it**. (Named `AppSheet`
  to avoid colliding with the existing shadcn `sheet.tsx` on case-insensitive file systems.)
- `ChoiceCard.tsx` — large selectable card with `aria-pressed`; selected state uses border,
  fill, icon treatment **and** a check badge, never colour alone.
- `SectionHeading.tsx` — eyebrow + sentence-case title + optional Filipino line + trailing slot.
- `StatCard.tsx` — metric card (`surface`, `ink`, `amber`, `mint` tones).
- `EmptyState.tsx` — shared empty / no-results / error surface.
- `MapCanvas.tsx` — shared Google Map surface (see below).

Design-token hardening in `src/styles/theme.css` / `src/styles/index.css`:

- Add `--color-surface`, `--color-soft`, `--color-line` plus `--shadow-soft`, `--shadow-card`,
  `--shadow-app`, an extended radius scale (`--radius-card`, `--radius-pill`), and a shared type
  scale (`--text-caption/body/lead/title/display`).
- Keep the existing palette; reserve red (`--error`) for destructive/error only.
- Provide `.ambient-bg`, `.route-line`, and `.scrollbar-hidden` helpers.

**Guardrails for every later phase:**

- No raw hex literals in JSX; no `uppercase` on actions or secondary copy.
- No redundant `from-[var(--primary)] to-[var(--primary)]` gradients.
- No icon-only control without an accessible name; 44–48px minimum targets.
- Bilingual pairing: English primary, one short Filipino line.

---

## Map system (Google Maps) — now part of the UI

The app already depends on Google Maps for pickup/destination picking, live tracking, rider
navigation, terminal boundaries, and store locations. The redesign treats the map as a
**designed surface** with its own states and chrome, so it stops looking like a raw embed.

**`MapCanvas` is the single entry point.** It wraps the existing loader
(`src/lib/mapLoader.tsx`) and `GoogleMap` and always renders something meaningful:

| State | What the user sees |
| --- | --- |
| Loading | Warm skeleton with a spinner and "Loading map / Naglo-load…" (`role="status"`). |
| Key missing / script blocked / load error | "Map is unavailable" panel explaining that address search and nearby places still work, with an optional labeled **Try again** action. |
| Ready | Framed rounded map with a warm hairline border, gestures enabled, optional zoom control, and an **overlay slot** for status cards and controls. |

Map UI rules for every later phase:

- **Always framed and labeled.** Each map instance gets an accessible name describing what it
  shows (e.g. "Map showing the Gen. T. de Leon terminal").
- **Overlay, don't duplicate.** Pickup/destination summaries, driver status, and fare cards float
  over the map via `overlay` and open the shared `AppSheet` for details.
- **Never a dead end.** When maps are blocked, the surrounding address search, preset places, and
  manual entry remain usable.
- **Restrained chrome.** Default Google UI is off; only the zoom control is offered where useful,
  and all other controls are our own labeled buttons.
- **Motion and contrast.** Marker animation respects `prefers-reduced-motion`; controls meet AA
  contrast against the map tiles (warm surface cards with a solid background).

---

## Phase 1 — Customer experience

- **Ride flow** (`customer/Home.tsx`, 2,988 lines): extract presentation into `customer/ride/`
  subcomponents — `RideServiceSwitch`, `PickupCard`, `DestinationPicker` (sheet + search +
  nearby presets), `RideTypeCards` (**Sabay/Shared** and **Pribado/Private** with fare + ETA),
  `FareSummary`, `RideConfirmSheet`, `RideBookedSuccess` — while keeping the existing
  maps/pricing/lobby/ride-status logic intact. The map becomes a `MapCanvas` with the pickup
  card overlaid; the terminal picker and destination search open in the shared `AppSheet`.
- **Live tracking:** the active-ride card becomes an overlay on `MapCanvas` (driver marker,
  route polyline, ETA), with a labeled expand action instead of gesture-only panning.
- **Food flow** (`customer/FoodHome.tsx`): shared `AppHeader`, large bilingual search, category
  chips, restaurant cards (photo, cuisine, rating, time, delivery fee), add-to-cart, persistent
  cart bar. Real restaurant/menu/cart providers unchanged.
- **Customer sub-screens:** `CategoryFood`, `RestaurantDetail`, `Cart`, `Activity`,
  `Notifications`, `CustomerMessages`, `CustomerDirectChat`, `Account`, `AccountManagement`,
  `Profile`, `Favorites`, `OrderDetail`, `SharedRides`, `ShareRideLobby`, `LobbyList`,
  `BrowseAvailableLobbies`, `CurrentRideTracker`, `CustomizationModal`, `MapSelector`,
  `ReturnToRideButton`.
- **Shared surfaces:** `Login`, `auth/*`, `LocationPermissionPrompt`, `ui/Toast`,
  `ui/confirmation-modal`, `chat/ChatHub`.

## Phase 2 — Rider hub

- `rider/RiderDashboard.tsx`: hub with online/offline header, earnings + terminal-queue stat
  cards, nearby request card, active-trip card, primary accept CTA. The dispatch map becomes a
  `MapCanvas` with the request/queue overlay; navigation mode keeps real directions and adds a
  labeled "recenter" and "open pickup directions" control.
- `BottomNav` rider variant: Home / Rides / Earnings / Messages / Account.
- Restyle `ServiceTypes`, `MyDestination`, `AutoAccept`, `MoreOptions`, `PassengerRequests`,
  `ActiveRide`, `Earnings`, `RiderProfile`, message screens, `TerminalQueueCard`,
  `ActiveRideButton`. `MyDestination` and `ActiveRide` maps move to `MapCanvas`.

## Phase 3 — Business hub (sidebar retired)

- Replace `business/BusinessSidebar.tsx` with the shared `BottomNav` business variant:
  Home / Orders / Menu / Messages / Account; secondary destinations fold into hub cards.
- `business/BusinessDashboard.tsx`: hub with store open/closed toggle, sales/orders/rating stat
  cards, orders-to-prepare list with "mark ready", and a clear link into menu management.
- Restyle `BusinessHome`, `BusinessMenu`, `BusinessOrders`, `BusinessAccount`, `BusinessProfile`,
  `BusinessMessages`, `BusinessDirectChat`, `AddCustomizationModal`, `BusinessMapSelector`.
  `BusinessMapSelector` becomes a `MapCanvas` with a draggable-pin overlay card.

## Phase 4 — Admin hub (sidebar retired)

- Replace `admin/AdminSidebar.tsx` with the shared `BottomNav` admin variant (role-aware for
  Super Admin vs Rider Admin), keeping badge polling.
- `admin/AdminDashboard.tsx`: hub led by an urgent-review card (amber), count stat cards, then
  the verification queue.
- Restyle `AdminUsers`, `AdminTerminals`, `AdminApprovals`, `AdminSettings`, `VerifiedUsers`.
  Terminal boundary drawing/editing uses `MapCanvas` with labeled draw controls.

## Phase 5 — Verification & hardening

1. Portable Node 22 per `.freebuff/run.md`; `npm run build` in `TrikeServe3.0/`.
2. Live preview on 8443: exercise each role end-to-end, including map states.
3. Responsive: 360px phone (no horizontal overflow, nothing hidden behind the nav), tablet, and
   desktop centered canvas for every role.
4. Accessibility: focus order, Escape closes sheets, focus returns to the opener, accessible
   names, `prefers-reduced-motion`, AA contrast.
5. Guardrail scan: raw hex, `uppercase` on actions, `border-2` remnants, `text-red-600`, and
   unlabeled icon-only controls.
6. Bilingual pass: every primary action has a short Filipino line; nothing truncates at 360px.

## Out of scope

- No backend/schema/auth/Supabase/Maps/routing/pricing logic changes.
- No new application routes; no persistence changes.
- No committed `.env.local` or secrets.
