# Shared Lobby Passenger Visibility Fix

## Problem
When a customer (original host) creates a shared ride lobby, other customers joining the lobby cannot be seen by the original host. However, when the original host leaves and rejoins the lobby, all passengers become visible.

## Root Cause
The real-time subscription callback in ShareRideLobby.tsx was performing a conditional check that sometimes skipped updating the passengers list:

```typescript
// OLD CODE - PROBLEMATIC
passengers_json: Object.prototype.hasOwnProperty.call(updatedLobbyData || {}, 'passengers_json')
  ? normalizedPassengers
  : (prevLobby?.passengers_json || [])  // ❌ Keeps old passengers if not in payload
```

When new passengers join, the subscription payload might not always include the `passengers_json` field explicitly, causing the component to retain the old passenger list instead of fetching fresh data.

## Solution

### 1. **ShareRideLobby.tsx - Improved Real-Time Subscription**
- **File**: `src/app/components/customer/ShareRideLobby.tsx`
- **Change**: Modified the subscription callback to ALWAYS fetch fresh lobby data from the database when an update is received
- **Benefit**: Ensures the component always displays the latest passenger list, regardless of what's in the subscription payload

```typescript
// NEW CODE - FETCHES FRESH DATA
const unsubscribe = supabaseHelpers.subscribeLobbyUpdates(
  existingLobby.id,
  async (updatedLobbyData) => {
    // CRITICAL: Always fetch the fresh lobby data from database
    const { data: freshLobby } = await supabaseHelpers.getLobbyById(existingLobby.id);
    
    if (freshLobby) {
      const normalizedPassengers = dedupePassengers(normalizePassengers(freshLobby.passengers_json));
      setLobby(prevLobby => ({
        ...prevLobby!,
        ...freshLobby,
        passengers_json: normalizedPassengers  // ✅ Always up-to-date
      }));
    }
  }
);
```

### 2. **Improved Polling Interval**
- **Change**: Increased polling frequency from 2.5 seconds to 1.5 seconds
- **Added**: Enhanced logging to track when passenger count changes
- **Benefit**: Fallback mechanism catches any missed real-time updates quickly

```typescript
const syncInterval = setInterval(async () => {
  const { data: latestLobby } = await supabaseHelpers.getLobbyById(existingLobby!.id);
  // ... Always updates if passenger count changes
}, 1500); // Now every 1.5 seconds (faster feedback)
```

### 3. **supabase.ts - Enhanced Subscription Handler**
- **File**: `src/lib/supabase.ts`
- **Change**: Made callback support async functions and improved error handling
- **Benefit**: Allows callbacks to await database queries without blocking the subscription

```typescript
subscribeLobbyUpdates(lobbyId: string, callback: (data: any) => Promise<void> | void) {
  // Now supports async callbacks
  await Promise.resolve(callback(payload.new));
}
```

### 4. **BrowseAvailableLobbies.tsx - Added Polling**
- **File**: `src/app/components/customer/BrowseAvailableLobbies.tsx`
- **Change**: Added polling mechanism (every 2 seconds) to refresh lobby list
- **Benefit**: Ensures lobby passenger counts update in real-time even if real-time subscription is delayed

```typescript
const pollInterval = setInterval(async () => {
  const { data } = await supabaseHelpers.getAvailableLobbies(dropoffAddress, pickupAddress);
  // Update lobbies with fresh data
}, 2000);
```

## Data Flow (Fixed)

### Original Host Sees New Passengers:
```
Customer 2 joins lobby
    ↓
Database updated: shared_ride_lobbies.passengers_json
    ↓
Real-time subscription triggers
    ↓
Subscription callback → Fetches FRESH lobby data from database ✅
    ↓
Component gets complete passenger list including Customer 2
    ↓
Component re-renders with all passengers visible ✅
```

### Multiple Update Mechanisms:
1. **Real-time subscription** - Primary (instant when available)
2. **Polling (1.5s interval)** - Fallback (catches missed updates)  
3. **User-triggered refreshes** - Explicit (when user opens/closes lobby)

## Testing Checklist
- [ ] Customer 1 creates lobby
- [ ] Customer 2 joins lobby
- [ ] Customer 1 should see Customer 2 appear (not need to leave/rejoin)
- [ ] Customer 3 joins lobby
- [ ] Both Customer 1 and 2 see Customer 3 in real-time
- [ ] Lobby remains responsive during multiple joins
- [ ] No duplicate passengers showing
- [ ] Passenger list is deduplicated correctly

## Performance Impact
- ✅ Minimal: Real-time triggers are efficient
- ✅ Polling at 1.5s is reasonable for UI responsiveness
- ✅ Database queries are optimized (single lobby fetch per event)
- ✅ No unnecessary re-renders (state comparison in effect)

## Browser Console Logs (Debug)
You'll now see detailed logs like:
```
🔄 🔄 🔄 LOBBY UPDATE RECEIVED
✅ ✅ ✅ FRESH LOBBY DATA FROM DB
👥 OLD PASSENGERS: 1
👥 NEW PASSENGERS: 2
🔄 PASSENGER COUNT CHANGED from 1 to 2 - UPDATING!
```

This helps verify the fix is working correctly.

