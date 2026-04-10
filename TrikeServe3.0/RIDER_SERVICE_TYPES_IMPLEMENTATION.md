# Rider Service Types & Go Online Implementation

## Overview
This implementation adds the following features to the Rider dashboard:
1. **Persistent "Go Online" status** - Saves rider's online/offline state to database
2. **Service Types Management** - Riders can select which services to accept (Delivery, Ride Share, Private)
3. **Operating Locations Display** - Shows selected service types and operating locations in rider profile

## Database Schema Changes

### Required Migrations
Run the following SQL in your Supabase SQL Editor to add the necessary columns:

```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT ARRAY['shared', 'delivery'],
ADD COLUMN IF NOT EXISTS current_seats INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_is_online_role ON users(is_online, role) 
WHERE role = 'rider';

CREATE INDEX IF NOT EXISTS idx_users_service_types ON users 
USING GIN (service_types);
```

**Or use the migration file:**
- File: `ADD_RIDER_SERVICE_TYPES_MIGRATION.sql`
- Simply copy and paste the SQL content into your Supabase SQL Editor

## Code Changes

### 1. AuthContext Updates (`src/app/contexts/AuthContext.tsx`)
- Added new User interface properties:
  - `isOnline?: boolean` - Tracks if rider is online
  - `serviceTypes?: string[]` - Array of accepted service types
  - `currentSeats?: number` - Current occupied seats in vehicle

- Updated `login()` function to load these fields from Supabase
- Updated `signup()` function to initialize these fields for new riders
- Updated `updateProfile()` function to save these fields to database

### 2. RiderDashboard Component (`src/app/components/rider/RiderDashboard.tsx`)
- Integrated with AuthContext to get initial user state
- Added useEffect hook to persist online status, service types, and current seats whenever they change
- The "Go Online" button now updates the auth context automatically

**Key Features:**
- Online status persists across browser sessions
- Service type changes are saved to database in real-time
- Current seat count is tracked

### 3. ServiceTypes Component (`src/app/components/rider/ServiceTypes.tsx`)
- Integrated with AuthContext to load user's current selections
- Saves selected services and seat count to database when "Save Service Types" is clicked
- Supports three service types:
  - **Shared Rides (Sasabay)** - Multiple passengers
  - **Delivery** - Food and package delivery
  - **Private Rides (Pakyaw)** - Exclusive rides

### 4. RiderProfile Component (`src/app/components/rider/RiderProfile.tsx`)
- Added new "Operating Locations & Services" section
- Displays active service types as badges
- Shows pickup and dropoff locations
- Includes link to manage service types

## User Flow

### Going Online
1. Rider opens the dashboard
2. Clicks "Go Online" button
3. Status is immediately saved to database and persists across sessions
4. When online, bottom service type shortcuts appear

### Managing Service Types
1. From dashboard, click "Service Types" shortcut
2. Select/deselect service types (Delivery, Ride Share, Private)
3. Set number of occupied seats for shared rides
4. Click "Save Service Types"
5. Changes are persisted to database

### Viewing Profile
1. Open Rider Profile
2. New "Operating Locations & Services" section shows:
   - Active service type badges
   - Default pickup location
   - Default dropoff location
3. Click "Manage Service Types" to change selections

## Data Persistence

All rider data is now persisted across:
- ✅ Browser sessions (Supabase database)
- ✅ Device refreshes
- ✅ Tab closes
- ✅ Login/logout cycles

**Storage Strategy:**
1. Primary: Supabase database (source of truth)
2. Fallback: localStorage (if database fails)
3. Current session: React state

## Testing Checklist

- [ ] Login as a rider
- [ ] Click "Go Online" and refresh page - status should persist
- [ ] Click "Go Offline" - status should update
- [ ] Go to Service Types page
- [ ] Select/deselect services and save
- [ ] Refresh page - selections should persist
- [ ] Check Rider Profile - should show selected service types
- [ ] Close and reopen browser - all data should be there

## Troubleshooting

### Service types not saving?
1. Check browser console for errors
2. Verify `ADD_RIDER_SERVICE_TYPES_MIGRATION.sql` was executed in Supabase
3. Check that user role is 'rider' in database

### Online status not persisting?
1. Verify Supabase connection is working
2. Check that `is_online` column exists in users table
3. Review browser console for any fetch errors

### Data showing old values after refresh?
1. Clear browser localStorage: `localStorage.clear()`
2. Hard refresh browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. Re-login to force fresh data load from Supabase

## API References

### UpdateProfile
```typescript
await updateProfile({ 
  isOnline: true,
  serviceTypes: ['shared', 'delivery'],
  currentSeats: 2
});
```

### Service Types Array Values
- `'shared'` - Ride Share (Sasabay)
- `'delivery'` - Delivery Services
- `'private'` - Private Rides (Pakyaw)

## Environment Setup

No additional environment variables needed. Uses existing Supabase configuration from `.env.local`

## Files Modified/Created

### New Files
- `ADD_RIDER_SERVICE_TYPES_MIGRATION.sql` - Database migration

### Modified Files
- `src/app/contexts/AuthContext.tsx` - Added user fields and update logic
- `src/app/components/rider/RiderDashboard.tsx` - Integrated auth and persistence
- `src/app/components/rider/ServiceTypes.tsx` - Integrated auth and saving
- `src/app/components/rider/RiderProfile.tsx` - Added service types display

## Future Enhancements

- Add auto-logout when offline for X minutes of inactivity
- Geo-fence based service availability
- Service type availability by location/time
- Analytics on service type preferences
- Real-time driver availability map

