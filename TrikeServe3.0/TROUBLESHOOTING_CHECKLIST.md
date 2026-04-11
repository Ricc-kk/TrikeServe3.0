# Troubleshooting Checklist - Database-Driven Status (Option 2)

## ✅ Pre-Flight Check

Before running tests, verify these basics:

- [ ] All code changes applied to:
  - [ ] `src/lib/supabase.ts` - New helper functions added
  - [ ] `src/app/components/customer/Home.tsx` - Updated `checkForDriverStatusUpdate()`
  - [ ] `src/app/components/rider/ActiveRide.tsx` - Updated `updateStatus()` and accept logic
  
- [ ] SQL migration executed in Supabase:
  - [ ] Run `ADD_ACCEPTED_REQUESTS_COLUMNS.sql`
  - [ ] No errors in Supabase dashboard
  - [ ] New columns visible in `ride_requests` table

- [ ] No TypeScript errors:
  - [ ] Run `npm run build` or check IDE for errors
  - [ ] All imports are correct

---

## 🧪 Test Scenario: Customer Books & Driver Accepts

### Step 1: Setup
- [ ] Open browser dev tools (F12)
- [ ] Open Console tab
- [ ] Open Network tab
- [ ] Have two browser windows: Customer (left) and Driver (right)
- [ ] Have Supabase open to ride_requests table (third window)

### Step 2: Customer Books Ride
- [ ] Customer enters pickup location: "Home"
- [ ] Customer enters dropoff location: "Work"  
- [ ] Customer selects "Special Ride"
- [ ] Customer clicks "Book Now"
- [ ] Check console: Look for booking confirmation logs
- [ ] Check database: New row in ride_requests with status='pending'

### Step 3: Driver Accepts Ride
- [ ] Driver sees ride in "Passenger Requests"
- [ ] Driver clicks "Accept"
- [ ] Driver is taken to "Active Ride" screen

**CHECK 1: Database should show:**
```
✅ accepted_at = [current timestamp]
✅ accepted_driver_id = [driver's ID]
✅ driver_status = 'on-the-way'
✅ driver_status_message = 'Driver is on the way to pick you up!'
✅ driver_photo = [driver's photo URL]
```

**CHECK 2: Console logs on driver side:**
```
🚨🚨🚨 DRIVER ACCEPTED RIDE 🚨🚨🚨
📤 Updating DATABASE with driver acceptance...
✅ DATABASE UPDATED: Driver accepted ride
✅ DATABASE UPDATED: Driver status set to on-the-way
```

**CHECK 3: Customer should see:**
- [ ] Popup appears: "Your driver is on the way to pick you up! 🚗"
- [ ] Popup auto-dismisses after 4 seconds

**CHECK 4: Console logs on customer side:**
```
🔍 CHECKING DATABASE for Ride Status Update:
   Request ID: [ride ID]
   DB Driver Status: on-the-way
   Status Message: Driver is on the way to pick you up!
✅ NEW STATUS UPDATE FROM DATABASE: on-the-way
```

---

## 🔴 Troubleshooting: Popup Not Showing

### Issue: Customer doesn't see "Driver on the way" popup

**Step 1: Verify Database Update**
- [ ] Go to Supabase → ride_requests table
- [ ] Find your ride by ID
- [ ] Check: Is `driver_status = 'on-the-way'`?
  - NO → Driver info not saved to DB
  - YES → Continue to Step 2

**Step 2: Verify Customer's `currentRequestId`**
- [ ] Open customer's browser console
- [ ] Type: `localStorage.getItem('trikeserve_active_ride')`
- [ ] Check: Does it show `requestId` field?
  - NO → Ride not saved locally
  - YES → Continue to Step 3

**Step 3: Check Polling is Running**
- [ ] In customer console, wait 2 seconds
- [ ] You should see logs: "🔍 CHECKING DATABASE for Ride Status Update"
- [ ] Look for: "Request ID:", "DB Driver Status:", etc.
  - NO logs → Polling not running
  - YES logs → Continue to Step 4

**Step 4: Check Query Result**
- [ ] In customer console logs, look for: "DB Driver Status:"
- [ ] Is it showing the correct status?
  - NO → Query returning wrong data
  - YES → Continue to Step 5

**Step 5: Check Status Comparison**
- [ ] In console, look for: "last_shown_status" logs
- [ ] Is current status !== last shown status?
  - NO → Duplicate prevention blocking it
  - YES → Continue to Step 6

**Step 6: Manual Test**
- [ ] In customer console, type:
```javascript
// Manually call the function (if you added it to window)
checkForDriverStatusUpdate();
```
- [ ] Watch console for what happens

---

## 🔴 Troubleshooting: Database Not Updating

### Issue: Driver clicks button but database doesn't change

**Step 1: Verify Driver is Calling Function**
- [ ] Driver console should show:
```
🚨 DRIVER STATUS BUTTON CLICKED
   New Status: [status]
   Ride ID: [id]
```
  - NO logs → Button click not working
  - YES logs → Continue to Step 2

**Step 2: Verify Database Function Called**
- [ ] Driver console should show:
```
🔄 UPDATING DATABASE DRIVER STATUS
   New Driver Status: [status]
   Message: [message]
```
  - NO logs → updateRideStatusInDatabase() not being called
  - YES logs → Continue to Step 3

**Step 3: Check for Errors**
- [ ] Driver console should show:
```
✅ DATABASE UPDATED SUCCESSFULLY
```
  - NO logs → Database update failed
  - Look for: "❌ Error updating database:"
  - Check the error message

**Step 4: Verify Supabase Connection**
- [ ] In browser console (any page), type:
```javascript
supabase.auth.getUser().then(user => console.log(user));
```
  - Should show user logged in
  - If error → Supabase credentials issue

**Step 5: Check Ride ID**
- [ ] Verify the ride ID being used matches what's in the database
- [ ] Type in console:
```javascript
// Should match the ride you're working with
console.log(localStorage.getItem('trikeserve_active_ride'));
```

---

## 🔴 Troubleshooting: Ride Not Clearing After Completion

### Issue: After "Complete Ride", customer still sees ride

**Step 1: Verify Ride Status in Database**
- [ ] Go to Supabase → ride_requests table
- [ ] Find your ride
- [ ] Check: Is `status = 'completed'`?
  - NO → Complete ride not saving
  - YES → Continue to Step 2

**Step 2: Check Driver Status**
- [ ] In same database row, check: `driver_status = 'completed'`?
  - NO → Status not being mapped correctly
  - YES → Continue to Step 3

**Step 3: Verify Customer Sees Completion Popup**
- [ ] Customer console should show:
```
✅ NEW STATUS UPDATE FROM DATABASE: completed
```
  - NO → Status change not detected
  - YES → Continue to Step 4

**Step 4: Check Ride Clear Logic**
- [ ] Customer console should show:
```
🎉 RIDE COMPLETED! Clearing ride state...
```
  - NO → Clear logic not executing
  - YES → Ride should be cleared (but check Step 5)

**Step 5: Verify localStorage Cleared**
- [ ] In customer console, type:
```javascript
localStorage.getItem('trikeserve_active_ride');
```
  - Should return: `null`
  - If not null → Clear logic didn't work

**Step 6: Manual Clear**
- [ ] If still showing, manually clear:
```javascript
localStorage.removeItem('trikeserve_active_ride');
localStorage.removeItem('last_shown_status_[ride_id]');
// Refresh page
location.reload();
```

---

## 🔴 Troubleshooting: Multiple Popups Showing

### Issue: Customer sees same status popup multiple times

**Cause:** `last_shown_status` tracking not working

**Fix:**
- [ ] Check localStorage for `last_shown_status_` keys
- [ ] Type in console:
```javascript
const keys = Object.keys(localStorage)
  .filter(k => k.includes('last_shown_status'));
console.log(keys);
```
- [ ] Should see entries like: `last_shown_status_abc123`
- [ ] If missing → Tracking not saving
- [ ] Clear and try again:
```javascript
// Clear all status tracking
Object.keys(localStorage)
  .filter(k => k.includes('last_shown_status'))
  .forEach(k => localStorage.removeItem(k));
```

---

## 🔴 Troubleshooting: Passenger Requests Not Clearing

### Issue: Ride appears in "Passenger Requests" even after completion

**This is SEPARATE from database-driven status!** This depends on RLS policies.

**Check:**
- [ ] Ride completed in database? (`status = 'completed'`)
  - YES → This is an RLS/query filtering issue, not a status update issue

**Possible causes:**
- [ ] Passenger Requests query includes completed rides
- [ ] RLS policy allowing driver to see completed rides
- [ ] UI not filtering out completed rides

**Quick fix in code:** Filter out completed rides in the query

---

## 📊 Database Verification Queries

Copy-paste these into Supabase SQL Editor to verify:

### Check if columns exist:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ride_requests'
AND column_name IN ('accepted_at', 'driver_status', 'driver_photo')
ORDER BY column_name;
```

**Expected:** Should show 6 new columns

### Check a specific ride:
```sql
SELECT id, customer_id, status, driver_status, 
       driver_status_message, accepted_at, driver_photo
FROM ride_requests
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:** Should show your recent ride with status data

### Check indexes:
```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'ride_requests'
AND indexname LIKE 'idx_ride%';
```

**Expected:** Should show 3 indexes we created

---

## 🆘 Still Not Working?

### Gather Debug Info:

1. **Browser Console Logs:**
   - [ ] Copy console output from Customer side
   - [ ] Copy console output from Driver side

2. **Database State:**
   - [ ] Take screenshot of ride_requests table
   - [ ] Show the specific ride row

3. **Error Messages:**
   - [ ] Any "❌ Error" messages in console?
   - [ ] Any network errors (Network tab)?

4. **Verify:
   - [ ] `.env.local` has correct Supabase credentials
   - [ ] No TypeScript compilation errors
   - [ ] Latest code changes applied

---

## ✅ Success Indicators

When everything is working:

- ✅ Driver accepts ride → immediately saved to database
- ✅ Customer sees popup within 2 seconds
- ✅ Driver updates status → customer sees popup within 2 seconds
- ✅ Completion → customer's ride clears
- ✅ No errors in console
- ✅ No missing database columns
- ✅ All indexes created

---

**If you're still stuck, check:**
1. SQL migration ran without errors
2. All code files have correct changes
3. Supabase connection working
4. No TypeScript errors
5. Check Database query results directly in Supabase

Good luck! 🚀


