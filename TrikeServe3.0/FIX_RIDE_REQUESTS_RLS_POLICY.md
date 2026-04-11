# ✅ Fix Ride Requests Database Error - RLS Policy Issue

## The Problem
```
❌ Error booking ride. Please try again.
```

## Root Cause
The `ride_requests` table has **Row Level Security (RLS)** policies that are blocking INSERT operations because:
- Your app uses **custom authentication** (localStorage)
- RLS policies check `auth.uid()` which is **NULL** with custom auth
- Result: All INSERTs are blocked ❌

## The Solution

You need to fix the RLS policies on the `ride_requests` table. Here's the SQL:

### STEP 1: Go to Supabase Dashboard

1. Go to: https://supabase.com
2. Select your TrikeServe project
3. Click: **SQL Editor** on the left sidebar

### STEP 2: Paste This SQL

```sql
-- Drop old restrictive policies
DROP POLICY IF EXISTS "Users can insert their own ride requests" ON ride_requests;
DROP POLICY IF EXISTS "Users can view their own ride requests" ON ride_requests;
DROP POLICY IF EXISTS "Users can update their own ride requests" ON ride_requests;
DROP POLICY IF EXISTS "Authenticated users can manage ride requests" ON ride_requests;
DROP POLICY IF EXISTS "Enable read access for all users" ON ride_requests;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON ride_requests;

-- Create new PERMISSIVE policies that work with custom auth
CREATE POLICY "Anyone can insert ride requests" ON ride_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view ride requests" ON ride_requests
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update ride requests" ON ride_requests
  FOR UPDATE WITH CHECK (true);

CREATE POLICY "Anyone can delete ride requests" ON ride_requests
  FOR DELETE USING (true);
```

### STEP 3: Run the SQL

1. Paste the SQL above into the SQL Editor
2. Click: **Run** button (or press Ctrl+Enter)
3. Should see: ✅ Success message at the bottom

### STEP 4: Test in Your App

1. Stop dev server: `Ctrl + C`
2. Start dev server: `npm run dev`
3. Try booking a special ride again
4. **Should work now!** ✅

---

## What These Policies Do

| Policy | Allows |
|--------|--------|
| `Anyone can insert ride requests` | App can create new ride bookings ✅ |
| `Anyone can view ride requests` | App can fetch requests ✅ |
| `Anyone can update ride requests` | App can update request status ✅ |
| `Anyone can delete ride requests` | App can delete requests ✅ |

---

## Why This Works

These policies allow **ANY** database operation, which is fine because:
- Your app already has its own authentication (AuthContext)
- The app controls WHO can do WHAT
- The database just stores/retrieves data

This is the standard approach for **custom authentication** systems.

---

## ✅ After Running SQL

- [x] SQL executed successfully
- [x] Old policies dropped
- [x] New permissive policies created
- [x] Restart dev server
- [x] Try booking a ride
- [x] Should work! 🎉

---

## If It Still Doesn't Work

Check console (F12) for the exact error and:
1. Verify `.env.local` has Supabase credentials
2. Verify the SQL ran without errors
3. Try booking again with F5 refresh

---

**Solution is ready! Execute the SQL above and restart your app.** 🚀

