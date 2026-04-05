# Supabase Integration Quick Reference

## Files Created

1. **`.env.local`** - Environment variables for Supabase credentials
2. **`src/lib/supabase.ts`** - Supabase client and helper functions
3. **`SUPABASE_SCHEMA.sql`** - Database schema (run in Supabase SQL Editor)
4. **`SUPABASE_SETUP.md`** - Complete setup guide
5. **`SUPABASE_AUTHCONTEXT_EXAMPLE.tsx`** - Example AuthContext with Supabase

## Quick Start (5 Steps)

### 1. Create Supabase Project
```bash
# Go to https://app.supabase.com
# Create a new project
# Copy your URL and anon key
```

### 2. Add Credentials to `.env.local`
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

### 3. Create Database Schema
```bash
# In Supabase SQL Editor:
# Copy & paste contents of SUPABASE_SCHEMA.sql
# Click Run
```

### 4. Restart Dev Server
```bash
npm run dev
```

### 5. Start Using Supabase
```typescript
import { supabaseHelpers } from '@/lib/supabase';

// Create a user
const { data, error } = await supabaseHelpers.createUser({
  email: 'user@example.com',
  name: 'John Doe',
  phone: '09123456789',
  role: 'customer',
  is_verified: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
```

## Most Common Operations

### Get a User
```typescript
// By ID
const { data: user } = await supabaseHelpers.getUserById('user-id');

// By email
const { data: user } = await supabaseHelpers.getUserByEmail('user@email.com');
```

### Create a Ride Request
```typescript
const { data: ride } = await supabaseHelpers.createRideRequest({
  customer_id: 'customer-id',
  pickup_location: 'Location A',
  dropoff_location: 'Location B',
  status: 'pending',
  ride_type: 'special',
  payment_method: 'GCASH',
  amount: 50,
  passenger_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
```

### Update a Ride Request
```typescript
const { data: updated } = await supabaseHelpers.updateRideRequest('ride-id', {
  status: 'in_progress',
  driver_id: 'driver-id',
});
```

### Get All Ride Requests for a Customer
```typescript
const { data: rides } = await supabaseHelpers.getRideRequests({
  customerId: 'customer-id',
});
```

### Send a Message
```typescript
const { data: message } = await supabaseHelpers.saveMessage({
  sender_id: 'sender-id',
  receiver_id: 'receiver-id',
  sender_type: 'customer',
  content: 'Hello!',
  read: false,
  created_at: new Date().toISOString(),
});
```

### Get Messages Between Two Users
```typescript
const { data: messages } = await supabaseHelpers.getMessages('user1-id', 'user2-id');
```

### Upload a Profile Photo
```typescript
const file = new File([...], 'profile.jpg', { type: 'image/jpeg' });
const { data: uploadData, error } = await supabaseHelpers.uploadProfilePhoto(userId, file);

// Update user with photo URL
if (data?.publicUrl) {
  await supabaseHelpers.updateUser(userId, {
    profile_photo_url: data.publicUrl,
  });
}
```

## Database Tables

### users
- `id` (UUID) - Primary key
- `email` (VARCHAR) - Unique email
- `name` (VARCHAR) - Full name
- `phone` (VARCHAR) - Phone number
- `role` (VARCHAR) - customer | rider | business | admin
- `is_verified` (BOOLEAN) - Account verification status
- `profile_photo_url` (VARCHAR) - Profile photo URL

### ride_requests
- `id` (UUID) - Primary key
- `customer_id` (UUID) - Foreign key to users
- `driver_id` (UUID) - Foreign key to users
- `pickup_location` (VARCHAR)
- `dropoff_location` (VARCHAR)
- `status` (VARCHAR) - pending | accepted | in_progress | completed | cancelled
- `ride_type` (VARCHAR) - share | special
- `payment_method` (VARCHAR) - COD | GCASH
- `amount` (DECIMAL)
- `passenger_count` (INTEGER)

### shared_ride_lobbies
- `id` (UUID) - Primary key
- `pickup_location` (VARCHAR)
- `dropoff_location` (VARCHAR)
- `status` (VARCHAR) - waiting | driver_found | in_progress | completed | cancelled
- `passengers` (TEXT[]) - Array of passenger IDs
- `driver_id` (UUID) - Foreign key to users

### messages
- `id` (UUID) - Primary key
- `sender_id` (UUID) - Foreign key to users
- `receiver_id` (UUID) - Foreign key to users
- `sender_type` (VARCHAR) - customer | driver | business
- `content` (TEXT) - Message text
- `read` (BOOLEAN) - Read status
- `created_at` (TIMESTAMP) - Creation time

### orders
- `id` (UUID) - Primary key
- `customer_id` (UUID) - Foreign key to users
- `business_id` (UUID) - Foreign key to users
- `items` (JSONB) - Order items as JSON
- `total_amount` (DECIMAL)
- `status` (VARCHAR) - pending | confirmed | preparing | ready | picked_up | delivered | cancelled
- `delivery_address` (VARCHAR)

### restaurants
- `id` (UUID) - Primary key
- `name` (VARCHAR)
- `business_user_id` (UUID) - Foreign key to users
- `address` (VARCHAR)
- `phone` (VARCHAR)
- `rating` (DECIMAL)
- `is_open` (BOOLEAN)

### menu_items
- `id` (UUID) - Primary key
- `restaurant_id` (UUID) - Foreign key to restaurants
- `name` (VARCHAR)
- `description` (TEXT)
- `price` (DECIMAL)
- `category` (VARCHAR)
- `image_url` (VARCHAR)
- `is_available` (BOOLEAN)

## Storage Buckets

### user_profiles
- Stores user profile photos
- Public read access
- Path: `{user_id}/profile.{ext}`

### restaurants
- Stores restaurant photos
- Public read access
- Path: `{restaurant_id}/image.{ext}`

### menu_items
- Stores food item photos
- Public read access
- Path: `{menu_item_id}/image.{ext}`

## Useful Links

- **Supabase Console**: https://app.supabase.com
- **Supabase Docs**: https://supabase.com/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Supabase CLI**: https://supabase.com/docs/guides/cli

## Troubleshooting

### Connection Issues
```bash
# Restart dev server
npm run dev

# Check .env.local exists and has correct values
```

### Database Errors
```bash
# Check SQL Editor in Supabase for error logs
# View logs in Project Settings > Logs
```

### Authentication Issues
```bash
# Make sure user exists in database
# Check is_verified status
# Verify email and password match
```

## Example: Full User Flow

```typescript
import { supabaseHelpers } from '@/lib/supabase';

// 1. Sign up
const { data: newUser, error: signupError } = await supabaseHelpers.createUser({
  email: 'john@example.com',
  name: 'John Doe',
  phone: '09123456789',
  role: 'customer',
  is_verified: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// 2. Verify (done by admin in real app)
await supabaseHelpers.updateUser(newUser.id, {
  is_verified: true,
});

// 3. Login
const { data: user } = await supabaseHelpers.getUserByEmail('john@example.com');

// 4. Create ride request
const { data: ride } = await supabaseHelpers.createRideRequest({
  customer_id: user.id,
  pickup_location: 'Home',
  dropoff_location: 'Work',
  status: 'pending',
  ride_type: 'special',
  payment_method: 'GCASH',
  amount: 50,
  passenger_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// 5. Update ride when driver accepts
await supabaseHelpers.updateRideRequest(ride.id, {
  status: 'accepted',
  driver_id: 'driver-id',
});

// 6. Send message to driver
await supabaseHelpers.saveMessage({
  sender_id: user.id,
  receiver_id: 'driver-id',
  sender_type: 'customer',
  content: 'I will be ready in 5 minutes',
  read: false,
  created_at: new Date().toISOString(),
});
```

## Next Steps

1. ✅ Install Supabase client library
2. ✅ Set up .env.local with credentials
3. ✅ Create database schema
4. ⬜ Update AuthContext to use Supabase (see SUPABASE_AUTHCONTEXT_EXAMPLE.tsx)
5. ⬜ Migrate existing localStorage data to Supabase
6. ⬜ Update all API calls to use supabaseHelpers
7. ⬜ Add real-time subscriptions for live updates
8. ⬜ Set up proper error handling and logging
9. ⬜ Deploy to production

## Performance Tips

1. Use indexes for frequently queried columns (already set up in schema)
2. Limit query results with `.limit()`
3. Use filters to reduce data transfer
4. Cache user data in localStorage when appropriate
5. Use real-time subscriptions instead of polling when possible

```typescript
// Good: Limited query
const { data } = await supabase
  .from('ride_requests')
  .select('*')
  .eq('customer_id', userId)
  .limit(10)
  .order('created_at', { ascending: false });

// Better: With filters
const { data } = await supabaseHelpers.getRideRequests({
  customerId: userId,
  status: 'pending',
});
```

