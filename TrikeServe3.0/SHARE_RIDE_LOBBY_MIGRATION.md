## Share Ride Lobby System - Database-Driven Implementation Guide

### Overview
This guide explains how to complete the migration of the Share Ride Lobby system from localStorage to Supabase database. The system allows customers to create shared ride lobbies, join existing ones with matching routes, and drivers to accept and process these shared rides.

---

## ✅ What Has Been Implemented

### 1. **Database Migration Script** ✅
- **File**: `MIGRATE_SHARED_RIDE_LOBBIES.sql`
- **Location**: Project root directory
- **What it does**:
  - Adds new columns to `shared_ride_lobbies` table
  - Adds `customer_id`, `pickup_address`, `dropoff_address`, `max_seats`, `price_per_seat`, `passengers_json`, `driver_name`, `driver_plate`, `driver_rating`
  - Creates performance indexes
  - Sets up RLS (Row Level Security) policies
  - Enables real-time subscriptions

### 2. **Supabase Helper Functions** ✅
- **File**: `src/lib/supabase.ts` (Enhanced)
- **New Functions Added**:
  - `getAvailableLobbyByRoute()` - Find a lobby with matching dropoff and available seats
  - `getAvailableLobbies()` - Get all waiting lobbies (optional filtering by dropoff)
  - `getWaitingLobbiesForDriver()` - Fetch all waiting lobbies for driver pickup request
  - `createShareRideLobby()` - Create a new shared ride lobby
  - `joinShareRideLobby()` - Customer joins an existing lobby
  - `leaveShareRideLobby()` - Customer leaves a lobby (removes from passengers)
  - `acceptLobbyAsDriver()` - Driver accepts a lobby and becomes assigned
  - `updateLobbyPassengers()` - Update the passenger list in a lobby
  - `startLobbyRide()` - Mark lobby as in_progress
  - `completeLobbyRide()` - Mark lobby as completed
  - `subscribeLobbyUpdates()` - Real-time WebSocket subscription for lobby changes

### 3. **Refactored ShareRideLobby Component** ✅
- **File**: `src/app/components/customer/ShareRideLobby.tsx` (COMPLETELY REFACTORED)
- **Key Changes**:
  - ✅ Removed all localStorage references
  - ✅ Uses Supabase database for persistence
  - ✅ Real-time subscription for driver assignment notifications
  - ✅ Proper async/await patterns
  - ✅ Loading and error states
  - ✅ Matches database schema field names (`pickup_location`, `dropoff_location`, `passengers_json`, etc.)
  - ✅ Automatic lobby creation/joining based on matching dropoff addresses
  - ✅ Companion support (multiple passengers from same user)

---

## 📋 INSTALLATION STEPS

### Step 1: Update Supabase Database Schema
**Time Required**: 2-3 minutes

1. Go to your **Supabase Dashboard**
2. Click on **SQL Editor** in the left sidebar
3. Click **+ New Query**
4. Copy the entire contents of `MIGRATE_SHARED_RIDE_LOBBIES.sql`
5. Paste into the SQL editor
6. Click **Run** button
7. You should see a success message

**Expected Output**:
```
Queries completed successfully
```

### Step 2: Verify Database Changes

Run this query in Supabase SQL Editor to verify the columns were added:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'shared_ride_lobbies' 
ORDER BY ordinal_position;
```

You should see these new columns:
- `customer_id` (UUID)
- `pickup_address` (VARCHAR)
- `dropoff_address` (VARCHAR)
- `max_seats` (INTEGER)
- `price_per_seat` (NUMERIC)
- `passengers_json` (JSONB)
- `driver_name` (VARCHAR)
- `driver_plate` (VARCHAR)
- `driver_rating` (VARCHAR)

### Step 3: Update Passport Requests Component

The PassengerRequests component needs updates to fetch lobbies from Supabase instead of localStorage. 

**File to update**: `src/app/components/rider/PassengerRequests.tsx`

Key changes needed:
1. Import supabaseHelpers
2. Replace localStorage reads with `supabaseHelpers.getWaitingLobbiesForDriver()`
3. Update the lobby acceptance logic to call `supabaseHelpers.acceptLobbyAsDriver()`
4. Remove localStorage writes for lobbies

### Step 4: Create Browse Available Lobbies Component (Optional)

Create a new component for customers to browse and join available lobbies:

**File**: `src/app/components/customer/BrowseAvailableLobbies.tsx`

This component should:
- Fetch available lobbies using `supabaseHelpers.getAvailableLobbies(dropoffAddress)`
- Filter by matching dropoff address
- Show lobby details and passenger count
- Allow customers to join using `supabaseHelpers.joinShareRideLobby()`

---

## 🔄 Data Flow

### Creating a Share Ride
```
Customer selects "Share Ride"
    ↓
ShareRideLobby component mounts
    ↓
findOrCreateLobby() checks:
  1. Is user already in a waiting lobby?
  2. Is there a matching lobby (same dropoff)?
  3. If no match, create a new lobby
    ↓
createShareRideLobby() → Supabase
    ↓
Real-time subscription activated
    ↓
Lobby appears in Driver's Passenger Requests
```

### Driver Accepting a Share Ride
```
Driver sees waiting lobby in Passenger Requests
    ↓
Driver clicks "Accept"
    ↓
acceptLobbyAsDriver() called
    ↓
Lobby status updated to 'driver_found'
Database updated with driver info
    ↓
Customer's ShareRideLobby receives real-time update
    ↓
Customer sees "Driver Found!" with driver details
```

### Joining an Existing Lobby
```
Customer clicks "Browse Available Lobbies"
    ↓
BrowseAvailableLobbies fetches lobbies
  (getAvailableLobbies with dropoff filter)
    ↓
Customer sees available lobbies
    ↓
Customer clicks "Join Lobby"
    ↓
joinShareRideLobby() called
    ↓
Customer added to passengers_json array
    ↓
All customers in lobby receive real-time update
    ↓
Lobby status shows updated passenger count
```

---

## 🔐 Security (RLS Policies)

The migration script automatically sets up these policies:

| Policy | Allows | Condition |
|--------|--------|-----------|
| View Waiting Lobbies | All authenticated users | `status = 'waiting'` |
| View Own Lobbies | Customers | `customer_id = auth.uid()` |
| View Assigned Lobbies | Drivers | `driver_id = auth.uid()` |
| Create Lobbies | Customers | `customer_id = auth.uid()` |
| Update Own Lobbies | Customers | `customer_id = auth.uid()` |
| Update Assigned | Drivers | `driver_id = auth.uid()` |

---

## 📊 Database Schema

### shared_ride_lobbies Table

```sql
Column                Type          Purpose
──────────────────────────────────────────────────────────
id                   UUID          Primary key
customer_id          UUID          Lobby creator
pickup_location      VARCHAR(255)  Pickup location name
pickup_address       VARCHAR(500)  Detailed pickup address
dropoff_location     VARCHAR(255)  Dropoff location name
dropoff_address      VARCHAR(500)  Detailed dropoff address
status               VARCHAR(50)   waiting | driver_found | in_progress | completed | cancelled
passengers_json      JSONB         Array of passenger objects
max_seats            INTEGER       Maximum passengers
price_per_seat       DECIMAL(10,2) Price per person
driver_id            UUID          Assigned driver
driver_name          VARCHAR(255)  Driver's name
driver_plate         VARCHAR(50)   Vehicle plate/number
driver_rating        VARCHAR(10)   Driver rating (e.g., "4.8")
created_at           TIMESTAMP     When lobby was created
updated_at           TIMESTAMP     Last update time
```

### Passengers JSON Structure

```json
[
  {
    "id": "user-uuid-or-companion-id",
    "name": "Customer Name or +N Companion",
    "emoji": "👤",
    "joinedAt": "2024-04-23T10:30:00Z",
    "pickup": "SM Seaside",
    "pickupAddress": "SM City Seaside, Cebu City"
  }
]
```

---

## 🧪 Testing Checklist

- [ ] Database migration runs without errors
- [ ] New columns visible in Supabase
- [ ] Customer creates a lobby → appears in database
- [ ] Second customer joins lobby → passengers_json updates in real-time
- [ ] Driver accepts lobby → status changes to 'driver_found'
- [ ] Customer sees driver details immediately (real-time update)
- [ ] Customer leaves lobby → removed from passengers_json
- [ ] If last passenger leaves → lobby marked as 'cancelled'
- [ ] Non-matching routes don't join the same lobby
- [ ] Same dropoff address passengers match correctly
- [ ] Full lobby shows "Lobby Full" message
- [ ] Companions added correctly (ID like "userId_companion_1")

---

## 📝 Passenger Requests Component Updates

### Currently Using: localStorage (OLD)
```typescript
const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
```

### Should Use: Supabase (NEW)
```typescript
const { data: lobbies, error } = await supabaseHelpers.getWaitingLobbiesForDriver();
```

### Key Changes Needed:

1. **Fetch lobbies**:
```typescript
const { data: lobbies } = await supabaseHelpers.getWaitingLobbiesForDriver();
```

2. **Accept lobby**:
```typescript
await supabaseHelpers.acceptLobbyAsDriver(
  lobbyId,
  driver.id,
  driver.name,
  driver.todaPlate,
  driver.rating
);
```

3. **Update ride request with lobby details**:
```typescript
// Create a corresponding ride_request with type: 'shared'
await supabaseHelpers.createRideRequest({
  customer_id: lobby.customer_id,
  driver_id: driver.id,
  pickup_location: lobby.pickup_location,
  dropoff_location: lobby.dropoff_location,
  status: 'accepted',
  ride_type: 'share',
  payment_method: 'PREPAID',
  amount: lobby.price_per_seat * lobby.passengers_json.length,
  passenger_count: lobby.passengers_json.length
});
```

---

## 🚀 Next Steps

1. ✅ Run the migration SQL
2. ⏳ Update PassengerRequests component
3. ⏳ Create BrowseAvailableLobbies component
4. ⏳ Test the complete flow
5. ⏳ Remove localStorage references from ShareRideLobby (already done!)
6. ⏳ Deploy to production

---

## 🐛 Troubleshooting

### Issue: "Lobby not found" errors
**Solution**: Make sure the migration SQL was executed successfully. Check Supabase SQL logs.

### Issue: Real-time updates not working
**Solution**: Verify that:
- Realtime is enabled in Supabase settings
- The table has realtime enabled (check Publication in Supabase)
- Browser has WebSocket support enabled

### Issue: Passengers_json shows as null
**Solution**: Ensure all lobby creations pass the `passengers_json` field with at least an empty array.

### Issue: RLS policies denying access
**Solution**: 
- Check user is logged in with correct role
- Verify `auth.uid()` matches the `customer_id` or `driver_id`
- Test with unauthenticated user (should fail)

---

## 📚 Related Documentation

- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Real-time subscriptions: https://supabase.com/docs/guides/realtime
- PostgreSQL JSONB: https://www.postgresql.org/docs/current/datatype-json.html

---

**Created**: April 23, 2026
**Last Updated**: April 23, 2026
**Status**: Implementation In Progress

