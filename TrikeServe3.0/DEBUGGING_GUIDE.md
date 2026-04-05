# Step-by-Step Debugging Guide

## Quick Answer
**No, the Data API isn't broken.** But I've added logging to show you exactly what's happening.

---

## 5-Minute Diagnosis

### Step 1: Identify the Problem
**Question:** Do items disappear?
- **YES** → Go to "Diagnosis A"
- **NO** → Go to "Diagnosis B"

### Diagnosis A: Items Disappear

**Test 1: Check Console Logs**
```
F12 → Console tab → Add menu item → Watch logs
```

**Look for:**
- ✅ `[Menu Sync] Item inserted successfully` → Problem solved!
- ❌ `[Menu Sync] Insert error:` → See below

**If you see "Insert error":**
```
Read the error message carefully
Common errors:
- "violates row level security" → RLS issue
- "Network error" → API unavailable
- "timeout" → API too slow
```

**Test 2: Check localStorage**
```
F12 → Application → Local Storage → Look for menuItems_yourEmail
```

- ✅ Found items → localStorage working
- ❌ No items → Something broke the save

**Test 3: Check Supabase**
```
Supabase Dashboard → menu_items table → Search for your items
```

- ✅ Items found → API worked (but reload issue)
- ❌ No items → Items never reached API

### Diagnosis B: Items Don't Disappear

✅ **You're good!** The system is working.

If you want to verify everything:
```
F12 → Console → Look for success logs:
[Menu Sync] Supabase sync completed successfully
[Menu Load] Loaded from Supabase: X items
```

---

## Detailed Debugging

### When Console Shows Error

**Console Error Example:**
```
[Menu Sync] Insert error: permission denied
```

**What it means:**
- RLS policy is blocking your access
- Your user ID doesn't match the restaurant

**How to fix:**
1. Go to Supabase Dashboard
2. Go to SQL Editor
3. Run:
```sql
SELECT id, business_user_id FROM restaurants 
WHERE name LIKE '%your%';
```

4. Check if your user ID matches `business_user_id`

---

### When Console Shows Success But Item Disappears

**Console Logs:**
```
[Menu Sync] Item inserted successfully with UUID: abc-123
[Menu Sync] Supabase sync completed successfully
[Menu Load] Loaded from Supabase: 1 items
[REFRESH PAGE]
[Menu Load] Loaded from Supabase: 0 items
```

**What it means:**
- Item saved successfully
- Item disappeared on reload
- Something deleted it or the query changed

**How to fix:**
1. Check Supabase → menu_items table
2. Look for your items (search by name)
3. If found → Query issue
4. If not found → Something deleted them

---

### When You Don't See Any Logs

**No `[Menu Sync]` or `[Menu Load]` in console**

**What it means:**
- Console is maybe scrolled
- Or functions aren't being called
- Or there's an earlier error

**How to fix:**
1. Refresh console (click the circle icon)
2. Clear console: `console.clear()` 
3. Add item again
4. Scroll to top of console
5. Look for logs

---

## Common Scenarios

### Scenario 1: "violates row level security"

**Error Log:**
```
[Menu Sync] Insert error: new row violates row level security policy "Service role can manage menu items"
```

**Cause:** RLS policy is too restrictive

**Fix:**
1. Go to Supabase → Authentication → Policies
2. Check menu_items policies
3. Verify policies allow INSERT with `auth.role() = 'service_role'`
4. If not, recreate policies from MENU_ITEMS_SUPABASE_SETUP.sql

### Scenario 2: "Network error" or "Connection refused"

**Error Log:**
```
[Menu Sync] Critical error during save: Network error: Failed to connect to api.supabase.co
```

**Cause:** Supabase API is unreachable

**Fix:**
1. Check internet connection
2. Check Supabase status: https://status.supabase.com
3. Items are saved to localStorage (safe!)
4. Try again in a few minutes

### Scenario 3: Items Saved But Not Loading

**Console Logs:**
```
[Menu Sync] Item inserted successfully with UUID: xyz-789
[Menu Load] Loaded from Supabase: 0 items
```

**Cause:** Items saved but query didn't find them

**Fix:**
1. Check restaurant_id is correct:
```sql
SELECT restaurant_id, name FROM menu_items LIMIT 5;
SELECT id FROM restaurants WHERE business_user_id = 'your-user-id';
```

2. Make sure IDs match

### Scenario 4: Slow Saves (takes 2+ seconds)

**Console Logs:**
```
[Menu Sync] Inserting new item...
[2 second wait...]
[Menu Sync] Item inserted successfully
```

**Cause:** Network is slow or API is under load

**Fix:**
1. This is normal if connection is slow
2. Items will eventually save
3. localStorage has your backup
4. No action needed

---

## Console Log Timeline

This is what you should see when everything works:

```
TIME 0:00 - User adds item
[Menu Sync] Inserted new item to Supabase: Chicken

TIME 0:01 - Saving starts
[Menu Sync] Inserting new item to Supabase: Chicken

TIME 0:30 - Save completes  
[Menu Sync] Item inserted successfully with UUID: abc-123
[Menu Sync] Supabase sync completed successfully

TIME 0:30 - Also saved to localStorage
[Menu Sync] Saved to localStorage: 4 items

TIME 0:31 - User refreshes page
[Menu Load] Loading from Supabase, restaurantId: xyz-789
[Menu Load] Loaded from Supabase: 4 items

TIME 0:32 - Items appear on page ✅
```

---

## If Nothing Works

### Emergency Steps

1. **Open Console** - F12 → Console
2. **Clear It** - Right-click → Clear console
3. **Add Item** - Create a menu item
4. **Copy Logs** - Select all console text
5. **Send to Me** - Include the logs in your message

I'll be able to:
- See exact error messages
- Diagnose the real problem
- Fix it properly

---

## Checklist for Working System

✅ **Add menu item**
- [ ] See `[Menu Sync] Inserting` log
- [ ] See `[Menu Sync] Item inserted successfully` log
- [ ] Item appears on page

✅ **Refresh page**
- [ ] See `[Menu Load] Loading from Supabase` log
- [ ] See `[Menu Load] Loaded from Supabase` log
- [ ] Item still there

✅ **Sign out and back in**
- [ ] Add another item
- [ ] Sign out
- [ ] Sign back in
- [ ] Go to Business Menu
- [ ] Item still there

✅ **Check Supabase**
- [ ] Open Supabase → menu_items table
- [ ] Search for your items
- [ ] Items are there

**If all checkmarks work:**
✨ **Your system is working perfectly!** ✨

---

## Summary

1. **Open Console (F12)**
2. **Add menu item**
3. **Look for logs**
4. **Check if error**
5. **If error, follow the scenario**
6. **If no error, you're good!**

**The logs will tell you everything you need to know.**

