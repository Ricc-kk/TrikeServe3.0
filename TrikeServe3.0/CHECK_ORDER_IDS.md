# DEBUG - What Order ID is App Using?

Since manual SQL works but app doesn't, maybe the app is using a DIFFERENT order ID than what exists in the database.

## STEP 1: Get Order IDs from Database

```sql
SELECT id, order_number FROM orders 
ORDER BY created_at DESC 
LIMIT 3;
```

Copy these IDs.

---

## STEP 2: Check App Console

1. Open browser DevTools (F12)
2. Go to Console tab
3. Click on a pending order
4. Click "Accept Order"
5. Look for this in console:

```
[BusinessOrders] Order ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Copy that ID.

---

## STEP 3: Compare

Are they the SAME?

```
Database ID:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
App ID:       yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
```

If DIFFERENT → App is using wrong ID  
If SAME → Database and app agree, RLS is the issue

---

## STEP 4: Test With Correct ID

If they're different, manually test with the app's ID:

```sql
UPDATE orders 
SET status = 'preparing'
WHERE id = 'APP-ID-HERE'
RETURNING id, status;
```

If this works → App ID is fine  
If this fails → App ID doesn't match any order

---

**Tell me:**
1. Database IDs (first 3)
2. App ID from console
3. Are they the same?
4. Did manual update with app ID work?

This will tell us exactly what's wrong!

