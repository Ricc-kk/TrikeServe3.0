# Visual Guide: Rider Service Types Implementation

## 1. RIDER DASHBOARD - Go Online Button

### BEFORE (Not Persistent)
```
┌─────────────────────────────────────────┐
│  [Go Online] (only in current session)  │
└─────────────────────────────────────────┘
```

### AFTER (Persistent)
```
┌─────────────────────────────────────────┐
│  🟢 Go Offline (saved to database)      │
│  - Persists after browser refresh       │
│  - Persists after logout/login          │
│  - Syncs across tabs                    │
└─────────────────────────────────────────┘
```

**Status indicators:**
- 🟢 Red status light when ONLINE (shows "Go Offline")
- ⚫ Black button when OFFLINE (shows "Go Online")

---

## 2. SERVICE TYPES PAGE - New Features

### Path: Rider Dashboard → "Service Types" card → Opens dedicated page

```
┌──────────────────────────────────────────────────────┐
│ ← Service Types                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Select which service types you want to accept       │
│                                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ ✓ 📦 Delivery                  [Selected]       │  │
│ │   Food & package delivery                       │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ ✓ 👥 Ride Share                [Selected]       │  │
│ │   Shared rides with other passengers            │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ ☐ 🚗 Private Ride              [Not Selected]   │  │
│ │   Exclusive rides, no sharing                   │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ Current Seats Taken (for shared rides)              │
│ [0] [1] [2] [3] [4]  ← Toggle current occupancy    │
│                                                      │
│ [Save Service Types] ← Saves to database            │
└──────────────────────────────────────────────────────┘
```

**NEW Features:**
- Service types now save to database
- Current seats value persists
- Selections load from database on page open
- Selections persist after refresh

---

## 3. RIDER PROFILE - Operating Locations Section

### Path: Rider Dashboard → Profile Icon → Shows new section

```
┌──────────────────────────────────────────────────────┐
│ Profile Header                                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Personal Information                                 │
│ [... existing content ...]                           │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Operating Locations & Services     ← NEW SECTION    │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Active Service Types:                                │
│ ┌──────────┐ ┌──────────┐                           │
│ │📦Delivery│ │👥 Shared │                           │
│ └──────────┘ └──────────┘                           │
│                                                      │
│ [Manage Service Types] ← Link to edit               │
│                                                      │
│ Default Pickup Location:                             │
│ 📍 Tagalog Terminal, Valenzuela City                │
│                                                      │
│ Default Drop-off Location:                           │
│ 📍 Barangay Hall, Tagalog                           │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Driver Information                                   │
│ [... existing content ...]                           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**NEW Features:**
- Service type badges with icons and colors
- Shows exactly which services rider accepts
- One-click link to manage/change services
- Integrated with existing pickup/dropoff locations

---

## 4. DATA FLOW - How Information Moves

```
┌─────────────────────────────────────────────────────┐
│ User clicks "Go Online" on Dashboard                │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ React State updates (isOnline = true)               │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ useEffect hook detects change                       │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Calls updateProfile({ isOnline: true })             │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Updates Supabase: users table → is_online = true    │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Updates localStorage (backup)                        │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Dashboard shows "Go Offline" button                  │
└─────────────────────────────────────────────────────┘
                      ↓
          (Browser refresh happens)
                      ↓
┌─────────────────────────────────────────────────────┐
│ Login loads user from Supabase                       │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ isOnline = true loaded from database                │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Dashboard still shows "Go Offline" ✅ PERSISTENT    │
└─────────────────────────────────────────────────────┘
```

---

## 5. SERVICE TYPES FLOW - Selection to Display

```
User navigates to Service Types page
        ↓
Loads current selections from user.serviceTypes
        ↓
Displays checkboxes with current selections
        ↓
User clicks to select/deselect services
        ↓
Sets currentSeats value (0-4)
        ↓
Clicks "Save Service Types"
        ↓
updateProfile() saves to Supabase
        ↓
Returns to Dashboard
        ↓
Navigate to Profile
        ↓
Profile loads user.serviceTypes
        ↓
Displays service type badges
        ↓
Shows pickup/dropoff locations
        ↓
User can click "Manage Service Types" to edit
```

---

## 6. BROWSER SCENARIOS - What Persists

### Scenario 1: Page Refresh
```
1. Go Online ✓
2. Select services ✓
3. Press F5 (refresh)
4. Status and services still there ✓
```

### Scenario 2: Close Tab
```
1. Go Online ✓
2. Select services ✓
3. Close tab
4. Reopen TrikeServe
5. Login again
6. Status and services still there ✓
```

### Scenario 3: Clear Cache
```
1. Go Online ✓
2. Select services ✓
3. Clear browser cache
4. Reload page (auto-login from localStorage fails)
5. Login again manually
6. Status and services still there ✓ (from Supabase)
```

### Scenario 4: Multiple Tabs
```
Tab 1: Go Online
         ↓
Tab 2: Services updated in database
         ↓
Tab 1: Sees synchronized status ✓
```

---

## 7. DATABASE VIEW - What's Stored

```
Supabase Table: users

┌──────┬──────────┬──────────────────┬───────────────┐
│ id   │ is_online│ service_types    │ current_seats │
├──────┼──────────┼──────────────────┼───────────────┤
│ 123  │ true     │ [shared,delivery]│ 2             │
│ 456  │ false    │ [delivery]       │ 0             │
│ 789  │ true     │ [shared,private] │ 1             │
└──────┴──────────┴──────────────────┴───────────────┘

service_types values:
- 'shared'   → 👥 Ride Share
- 'delivery' → 📦 Delivery
- 'private'  → 🚗 Private Ride
```

---

## 8. STATE VARIABLES - What Gets Saved

```typescript
// Persisted to Supabase (in users table)
user.isOnline: boolean          // e.g., true
user.serviceTypes: string[]     // e.g., ['shared', 'delivery']
user.currentSeats: number       // e.g., 2

// Existing fields that work with new features
user.pickupLocation: string     // e.g., "Tagalog Terminal"
user.dropoffLocation: string    // e.g., "Barangay Hall"
```

---

## 9. RESPONSIVE BEHAVIOR - Mobile Compatibility

All features work on mobile devices:

```
Mobile Phone View:
┌──────────────────┐
│  Dashboard       │
│  [Go Online] ← Full width responsive button
│                  │
│  Service Types ← Tappable card
│  Destination   ← Tappable card
│  More Options  ← Tappable card
└──────────────────┘

Service Types Page on Mobile:
┌──────────────────┐
│ ← Service Types  │
├──────────────────┤
│ Service card     │
│ [checkbox] Delivery
│                  │
│ Service card     │
│ [checkbox] Share │
│                  │
│ [SAVE] button    │
└──────────────────┘
```

---

## 10. COLOR SCHEME - Visual Indicators

```
Online Status:
- 🟢 Green indicator = ONLINE (showing "Go Offline")
- ⚫ Black button = OFFLINE (showing "Go Online")

Service Badges:
- 🔴 Red background (#E11D48)
- White text
- With emoji icons:
  - 📦 Delivery
  - 👥 Ride Share
  - 🚗 Private Ride

Locations:
- 📍 Pickup: Red icon
- 📍 Dropoff: Green icon
```

---

## Summary of Changes Visible to User

✅ **Go Online button now remembers status**
✅ **Service types options persist to database**
✅ **Current seats value saves**
✅ **Profile shows selected service types**
✅ **Quick link to manage services from profile**
✅ **All data persists across sessions**
✅ **Mobile-friendly and responsive**

---

## What Happens Behind the Scenes

1. Database schema updated with 3 new columns
2. Auth context updated to manage new fields
3. Components updated to load/save to database
4. Automatic sync on every change
5. Fallback to localStorage if database unavailable
6. Data loads from Supabase on login

**Result: A fully persistent, database-backed rider management system** 🎉

