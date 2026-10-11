# Memory

## Project: TrikeServe3.0 (React + Vite + Supabase)
- Tricycle ride-hailing app with three roles: customer, rider (driver), business, plus admin. Customer screens live in `src/app/components/customer/`, rider in `src/app/components/rider/`.
- Shared chat UI: `ui/FloatingChatHead.tsx` (draggable head, unread badge, ripple) and `rider/RideChatOverlay.tsx` (in-place chat sheet); both take an optional `zIndexClass` because the customer lobby sheet sits at z-[2000], above their defaults (1600/1700).
- Supabase auth (no local password store). Login page (`src/app/components/Login.tsx`) has a "Quick Access — Test Accounts" picker; customer/rider/business accounts use password `Admin12345`, admin accounts `admin123`.

## Testing two-account flows (rides/lobbies)
- localStorage is shared per browser origin, so one profile cannot hold two sessions. Use a second account via an **incognito preview tab** (preview_open with incognito:true) for the other role, e.g. rider in the main tab + customer in incognito.
- Key storage names: `trikeserve_active_ride` (customer), `trikeserve_active_ride_rider` (rider), `trikeserve_active_share_lobby`, `trikeserve_chat_opened_customer`, `trikeserve_chat_head_pos_customer`/`_rider`.
- The lobby's liveness depends on an existing `shared_ride_lobbies` row in `driver_found` status; verification can reuse one instead of booking a new ride.
- Browser preview screenshots often lag a frame or two behind clicks — trust the accessibility snapshot (`preview_snapshot`) over the image for state checks.
