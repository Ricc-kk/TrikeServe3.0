# 🔑 How to Fix the 401 Unauthorized Error

## Problem
Your business owner is getting a **401 Unauthorized** error when trying to load orders.

Error message: `Invalid API key - Double check your Supabase anon or service_role API key`

## Root Cause
The `.env.local` file has the wrong API key or is missing the anon key entirely.

---

## Solution: Get Your Actual Supabase Anon Key

### Step 1: Open Supabase Dashboard
1. Go to: https://app.supabase.com
2. Select your project
3. Go to **Settings** (gear icon at bottom left)
4. Click **API**

### Step 2: Copy the Anon Key
You'll see:
```
Project URL: https://azmzuucnfqqymnunntmw.supabase.co
Anon (public) key: [YOUR-ACTUAL-KEY-HERE]
Service Role key: [NOT-THIS-ONE]
```

**Copy the "Anon (public) key"** - This is what you need!

### Step 3: Update .env.local
Update your `.env.local` file in the project root:

```dotenv
# Supabase Configuration
VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co
VITE_SUPABASE_ANON_KEY=your_actual_anon_key_here_paste_it_exactly_as_shown
```

**Replace `your_actual_anon_key_here_paste_it_exactly_as_shown` with the actual key from Supabase!**

### Step 4: Restart Development Server
```bash
# Stop the dev server (Ctrl+C)
# Then restart it:
npm run dev
```

### Step 5: Test
1. Login as business user
2. Go to Orders page
3. Check browser console (F12)
4. Should see orders loading (no more 401 errors) ✅

---

## Important Notes

⚠️ **The anon key looks like this:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJl...
```
(Long string that looks like random characters)

❌ **NOT like this (publishable key):**
```
sb_publishable_sCLoB7L3IJ5f6d3i18cyRA_aX1VFDv1
```

---

## If You Don't See the Anon Key

1. Go to Supabase Dashboard
2. Click **Settings** (gear icon)
3. Select **API** from left menu
4. Under "Project API keys" you should see:
   - `anon` public - This is what you need!
   - `service_role` secret - Don't use this!

If you still don't see it, you may need to create a new API key:
1. Click "Create API key"
2. Choose "Anon (public)" role
3. Copy the generated key

---

## Common Issues

### Issue 1: Key keeps changing
**Solution**: Don't copy the whole row, just the key value itself

### Issue 2: Still getting 401
**Solution**: 
- Clear browser cache (Ctrl+Shift+Delete)
- Restart dev server
- Verify you copied the EXACT key

### Issue 3: Can't find Settings in Supabase
**Solution**: 
- Make sure you're logged into Supabase
- You should be on your project's dashboard
- Look for gear icon (⚙️) at bottom left

---

## Testing the Fix

After updating `.env.local` and restarting:

1. **Check console logs** (F12 in browser):
   ```
   [BusinessOrders] Current user: {...}
   [BusinessOrders] Fetching orders from Supabase for restaurant: xxx
   [BusinessOrders] Loaded X orders from Supabase
   ```
   ✅ Should NOT see: `Error fetching orders`

2. **Check Network tab** (F12 → Network):
   - Look for request to `azmzuucnfqqymnunntmw.supabase.co/rest/v1/orders`
   - Response status should be **200** (not 401)

3. **Verify orders appear** on Orders page ✅

---

## What Your .env.local Should Look Like

```dotenv
# Supabase Configuration
VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...abc123...xyz789
```

Both lines are required!

---

## Need Help?

If you're still stuck:

1. ✅ Go to https://app.supabase.com
2. ✅ Select your project
3. ✅ Settings → API
4. ✅ Copy the anon key
5. ✅ Paste into `.env.local`
6. ✅ Restart dev server

That's it! Business orders should load. 🎉

---

**Quick Checklist:**
- [ ] Found Supabase project in dashboard
- [ ] Located Settings → API
- [ ] Copied the Anon (public) key
- [ ] Updated `.env.local` with the key
- [ ] Restarted dev server
- [ ] Orders now loading without 401 errors ✅

