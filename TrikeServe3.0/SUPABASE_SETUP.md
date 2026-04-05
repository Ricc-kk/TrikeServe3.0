# TrikeServe3.0 - Supabase Integration Guide

## Overview
This guide will help you set up Supabase as the backend for your TrikeServe3.0 application. Supabase provides:
- PostgreSQL Database
- Real-time Subscriptions
- Authentication
- File Storage
- Row Level Security

## Prerequisites
- A Supabase account (sign up at https://app.supabase.com)
- Node.js and npm installed
- Your TrikeServe3.0 project

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://app.supabase.com)
2. Click **"New Project"**
3. Fill in the details:
   - **Name**: TrikeServe3.0
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose the closest to your location (e.g., Asia Pacific)
4. Click **"Create new project"** and wait for it to initialize (may take a few minutes)

## Step 2: Get Your API Keys

1. Once your project is created, go to **Project Settings** (gear icon)
2. Click on **API** in the left sidebar
3. You'll see two important keys:
   - **Project URL**: This is your `VITE_SUPABASE_URL`
   - **anon public**: This is your `VITE_SUPABASE_ANON_KEY`
4. Copy these values

## Step 3: Configure Environment Variables

1. Open `.env.local` in your project root
2. Replace the placeholder values with your actual Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 4: Initialize the Database Schema

1. In Supabase, go to the **SQL Editor** (in the left sidebar)
2. Click **"New Query"**
3. Copy the entire contents of `SUPABASE_SCHEMA.sql` from your project
4. Paste it into the SQL Editor
5. Click **"Run"** to execute the schema

This will create all the necessary tables:
- `users` - User accounts with role-based access
- `ride_requests` - Individual ride requests
- `shared_ride_lobbies` - Group ride lobbies
- `messages` - Communication between users
- `orders` - Food delivery orders
- `restaurants` - Business restaurant listings
- `menu_items` - Food menu items
- `favorites` - User favorite restaurants

## Step 5: Set Up Storage Buckets

Your storage buckets are automatically created via the SQL schema, but you should verify them:

1. Go to **Storage** in Supabase
2. You should see three buckets:
   - `user_profiles` - User profile photos
   - `restaurants` - Restaurant photos
   - `menu_items` - Food item photos

If they're not visible, create them manually:
1. Click **"New bucket"**
2. Create: `user_profiles`, `restaurants`, `menu_items`
3. Make them **public** by unchecking "Private bucket"

## Step 6: Enable Authentication

1. Go to **Authentication** in Supabase
2. Click **Providers**
3. Enable these providers (optional but recommended):
   - Email (enabled by default)
   - Google OAuth
   - Facebook OAuth

## Step 7: Restart Your Application

```bash
# Stop your development server (Ctrl+C)
# Then run:
npm run dev
```

## Step 8: Start Using Supabase in Your Code

### Example: Creating a User

```typescript
import { supabaseHelpers } from '@/lib/supabase';

// Create a new user
const { data: newUser, error } = await supabaseHelpers.createUser({
  email: 'user@example.com',
  name: 'John Doe',
  phone: '09123456789',
  role: 'customer',
  is_verified: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

if (error) {
  console.error('Error creating user:', error);
} else {
  console.log('User created:', newUser);
}
```

### Example: Getting User by Email

```typescript
const { data: user, error } = await supabaseHelpers.getUserByEmail('user@example.com');
```

### Example: Creating a Ride Request

```typescript
const { data: ride, error } = await supabaseHelpers.createRideRequest({
  customer_id: userId,
  pickup_location: 'Tagalag Terminal',
  dropoff_location: 'SM City North EDSA',
  status: 'pending',
  ride_type: 'special',
  payment_method: 'GCASH',
  amount: 50,
  passenger_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
```

### Example: Uploading a Profile Photo

```typescript
const file = new File([...], 'profile.jpg', { type: 'image/jpeg' });
const { data, error } = await supabaseHelpers.uploadProfilePhoto(userId, file);

if (data?.publicUrl) {
  // Update user profile with the photo URL
  await supabaseHelpers.updateUser(userId, {
    profile_photo_url: data.publicUrl,
  });
}
```

## Available Supabase Helper Functions

### User Operations
- `getUserById(userId)` - Get user by ID
- `getUserByEmail(email)` - Get user by email
- `createUser(user)` - Create a new user
- `updateUser(userId, updates)` - Update user profile

### Ride Operations
- `createRideRequest(rideRequest)` - Create a ride request
- `getRideRequests(filters)` - Get ride requests with filters
- `updateRideRequest(rideId, updates)` - Update ride request status

### Lobby Operations
- `createLobby(lobby)` - Create a shared ride lobby
- `getLobbyById(lobbyId)` - Get lobby details
- `getLobbies(filters)` - Get available lobbies
- `updateLobby(lobbyId, updates)` - Update lobby status

### Message Operations
- `saveMessage(message)` - Save a message
- `getMessages(senderId, receiverId)` - Get conversation history
- `markMessageAsRead(messageId)` - Mark message as read

### Order Operations
- `createOrder(order)` - Create a food order
- `getOrders(customerId)` - Get customer's orders
- `updateOrder(orderId, updates)` - Update order status

### File Operations
- `uploadProfilePhoto(userId, file)` - Upload user profile photo
- `uploadRestaurantImage(restaurantId, file)` - Upload restaurant photo

## Real-Time Updates (Optional)

To enable real-time updates, you can subscribe to table changes:

```typescript
import { supabase } from '@/lib/supabase';

// Subscribe to ride request changes
const subscription = supabase
  .from('ride_requests')
  .on('*', (payload) => {
    console.log('Ride update:', payload);
  })
  .subscribe();

// Remember to unsubscribe when component unmounts
subscription.unsubscribe();
```

## Integrating with AuthContext

To integrate Supabase authentication with your existing AuthContext:

```typescript
import { supabaseHelpers } from '@/lib/supabase';

const login = async (email: string, password: string) => {
  try {
    const { data: user, error } = await supabaseHelpers.getUserByEmail(email);
    
    if (error || !user) {
      return { success: false, error: 'Invalid email or password' };
    }
    
    // TODO: Add password hashing verification in your backend
    setUser(user);
    localStorage.setItem('trikeserve_current_user', JSON.stringify(user));
    return { success: true };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'An error occurred' };
  }
};
```

## Troubleshooting

### Error: "Supabase credentials not configured"
- Make sure you've created the `.env.local` file
- Verify that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
- Restart your development server after updating `.env.local`

### Error: "relation 'users' does not exist"
- The database schema hasn't been executed yet
- Go back to Step 4 and run the SQL schema

### Error: "Permission denied"
- Check your Row Level Security (RLS) policies
- The policies are set up in the SQL schema to allow basic operations

### Connection Timeout
- Verify your Supabase project is running
- Check your internet connection
- Try clearing your browser cache and restarting the dev server

## Next Steps

1. **Update AuthContext** - Modify `AuthContext.tsx` to use Supabase authentication
2. **Migrate Existing Data** - Move your localStorage data to Supabase
3. **Enable Real-time Features** - Set up subscriptions for live updates
4. **Add Authentication UI** - Update login/signup components to use Supabase Auth
5. **Deploy** - Set up automatic backups and prepare for production

## Documentation

- [Supabase Docs](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)

## Support

If you encounter any issues:
1. Check the Supabase logs: **Project Settings > Logs**
2. Review the browser console for error messages
3. Check the Supabase Status page: https://status.supabase.com/

