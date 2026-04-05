# Data API Diagnostics & Troubleshooting

## Is the Data API the Problem?

The **Data API itself is not the problem**, but **network latency** or **RLS policy issues** could cause items to not save properly.

---

## Enhanced Diagnostics Added

I've added detailed logging to BusinessMenu.tsx to help diagnose Data API issues.

### Open Browser Console (F12)

When you use the menu, you'll now see logs like:

```
[Menu Load] Loading from Supabase, restaurantId: uuid-123
[Menu Load] Loaded from Supabase: 5 items
[Menu Sync] Inserting new item to Supabase: Fried Chicken
[Menu Sync] Item inserted successfully with UUID: uuid-456
[Menu Sync] Supabase sync completed successfully
```

---

## Common Issues & Diagnostics

### Issue 1: Items Not Saving to Supabase
**What to look for in console:**
```
[Menu Sync] Inserted new item to Supabase: Item Name
[Menu Sync] Insert error: error message
```

**Diagnosis:**
- ✅ If you see "Insert error" → RLS policy issue or network problem
- ✅ Check Supabase → menu_items table → check RLS policies
- ✅ Check network tab in DevTools for failed requests

### Issue 2: Items Disappear After Refresh
**What to look for in console:**
```
[Menu Load] Loaded from Supabase: 0 items
[Menu Load] Falling back to localStorage
```

**Diagnosis:**
- ✅ Items not in Supabase database (failed to save)
- ✅ Items are in localStorage (backup works)
- ✅ Focus on why items aren't saving (Issue 1)

### Issue 3: Slow Saves
**What to look for in console:**
```
[Menu Sync] Inserting new item...
[Wait 2-5 seconds]
[Menu Sync] Item inserted successfully
```

**Diagnosis:**
- ✅ Data API is slow (network latency)
- ✅ Items will eventually save (but with delay)
- ✅ Check Supabase status → supabase.com/status

### Issue 4: RLS Policy Error
**What to look for in console:**
```
[Menu Sync] Insert error: new row violates row level security policy
```

**Diagnosis:**
- ✅ RLS policies are blocking the insert
- ✅ Solution: Check restaurant_id and business_user_id match
- ✅ Run SQL to verify: SELECT * FROM restaurants WHERE business_user_id = 'your-id';

---

## How to Check if Data API is Working

### Method 1: Check Browser Console
1. Open your app
2. Press F12 (open DevTools)
3. Go to Console tab
4. Add a menu item
5. Look for `[Menu Sync]` logs
6. Look for `[Menu Load]` logs

### Method 2: Check Supabase Directly
1. Open Supabase Dashboard
2. Go to Table Editor
3. Click on `menu_items` table
4. Search for your items
5. If found → Data API works ✅
6. If not found → Items not reaching API ❌

### Method 3: Check Network Tab
1. Open DevTools → Network tab
2. Filter by XHR (XMLHttpRequest)
3. Add a menu item
4. Look for requests to `api.supabase.co`
5. If you see 201 (Created) → Success ✅
6. If you see 403 (Forbidden) → RLS issue ❌
7. If no requests → API not being called ❌

---

## RLS Policy Checklist

The Data API works if your RLS policies are correct. Here's what to verify:

### 1. Check Your Restaurant Record Exists
```sql
-- In Supabase SQL Editor
SELECT id, business_user_id, name FROM restaurants 
WHERE business_user_id = 'YOUR_USER_ID';
```

**Should return:** 1 restaurant record

### 2. Check Menu Items Can Be Created
```sql
-- In Supabase SQL Editor
SELECT * FROM menu_items 
WHERE restaurant_id = 'RESTAURANT_ID_FROM_ABOVE';
```

**Should return:** Your menu items

### 3. Check RLS Policies
Go to Supabase → Authentication → Policies
- ✅ "Service role can manage menu items" exists
- ✅ "Businesses can view and manage their menu items" exists
- ✅ "Customers can view menu items" exists

---

## Console Log Reference

| Log | Meaning |
|-----|---------|
| `[Menu Load] Loading from Supabase` | Trying to load from API |
| `[Menu Load] Loaded from Supabase: X items` | ✅ API working, found X items |
| `[Menu Load] Data API error:` | ❌ API error, check details |
| `[Menu Load] Falling back to localStorage` | ⚠️ Using backup, API failed |
| `[Menu Sync] Inserting new item` | Trying to save to API |
| `[Menu Sync] Item inserted successfully` | ✅ Saved to Supabase |
| `[Menu Sync] Insert error:` | ❌ Failed to save, check error |
| `[Menu Sync] Supabase sync completed` | ✅ All items synced |

---

## What These Logs Tell You

### Healthy Scenario
```
[Menu Load] Loading from Supabase, restaurantId: abc-123
[Menu Load] Loaded from Supabase: 3 items
[Menu Sync] Inserting new item to Supabase: New Item
[Menu Sync] Item inserted successfully with UUID: xyz-789
[Menu Sync] Supabase sync completed successfully
```

**This means:**
- ✅ API is working
- ✅ Items are being saved
- ✅ Data is persisting

### Fallback Scenario
```
[Menu Load] No restaurant ID, loading from localStorage
[Menu Load] Loaded from localStorage: 3 items
[Menu Sync] No restaurant ID yet, skipping Supabase save
[Menu Sync] Saved to localStorage: 3 items
```

**This means:**
- ⚠️ Restaurant record not created yet
- ✅ Items saved locally (won't lose data)
- ⚠️ Won't sync to Supabase until restaurant created

### Error Scenario
```
[Menu Load] Data API error: {error details}
[Menu Load] Falling back to localStorage
[Menu Load] Loaded from localStorage (fallback): 3 items
```

**This means:**
- ❌ API failed to load
- ✅ Items from previous session still work
- ⚠️ New items won't save to Supabase
- 🔧 Check API error details

---

## Next Steps

### If items ARE working:
- No action needed
- Data API is working fine
- The app uses localStorage as backup

### If items are NOT working:
1. **Open browser console (F12)**
2. **Look for error messages**
3. **Check the log patterns above**
4. **Report the error you see**

Then I can:
- Add retry logic if API is slow
- Fix RLS policies if they're blocking
- Add offline mode if API is unreliable
- Implement better error recovery

---

## Testing

### Test Data API Health
1. Add a menu item
2. Open console (F12)
3. Check for `[Menu Sync] Item inserted successfully`
4. If present → API working ✅
5. If missing → Check for error logs

### Test Persistence
1. Add item and see successful logs
2. Refresh page
3. Check for `[Menu Load] Loaded from Supabase`
4. Item still there → Success ✅

### Test Fallback
1. Go offline (DevTools → Network → Offline)
2. Add item (should see logs)
3. Go back online
4. Item should sync to Supabase

---

## Summary

**The Data API is not inherently broken**, but the logs will now tell us:
- ✅ If it's working
- ❌ If it's failing
- ⚠️ When it's falling back
- 🔧 What the actual error is

**Check your console logs next time there's an issue!**

