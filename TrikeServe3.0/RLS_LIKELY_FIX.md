# LIKELY FIX: RLS Policy Issue

## STEP 1: Verify the Problem

Run this in Supabase SQL Editor:

```sql
-- See recent orders
SELECT id, order_number, status FROM orders ORDER BY created_at DESC LIMIT 1;
```

Copy the ID from results.

---

## STEP 2: Test Manual Update

```sql
-- Replace ID-HERE with actual ID from Step 1
UPDATE orders 
SET status = 'preparing', updated_at = NOW()
WHERE id = 'ID-HERE'
RETURNING id, status;
```

**Does this work?**
- ✅ YES → RLS is blocking the app
- ❌ NO → Database schema issue

---

## STEP 3: If Manual Update Works, Fix RLS

Run THIS to allow updates:

```sql
-- First, see what policies exist
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'orders';
```

If you see restrictive policies, drop them and create a permissive one:

```sql
-- Remove restrictive policies
DROP POLICY IF EXISTS "business_users_can_select" ON orders;
DROP POLICY IF EXISTS "business_users_can_update" ON orders;
DROP POLICY IF EXISTS "business_users_can_insert" ON orders;

-- Create simple permissive policy
CREATE POLICY "allow_authenticated_updates" ON orders
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

---

## STEP 4: Test App Again

1. Refresh browser (Ctrl+R)
2. Try to accept an order
3. Should work now! ✅

---

## If Still Doesn't Work

Run this to COMPLETELY DISABLE RLS (temporary test):

```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
```

Test the app. If it works now, RLS is definitely the issue.

Then re-enable with proper policy:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create open policy
CREATE POLICY "all_authenticated_can_manage" ON orders
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

---

## COPY-PASTE SEQUENCE

Run these in order:

1️⃣
```sql
SELECT id, order_number, status FROM orders ORDER BY created_at DESC LIMIT 1;
```

2️⃣ (copy ID from above)
```sql
UPDATE orders 
SET status = 'preparing', updated_at = NOW()
WHERE id = 'PASTE-ID-HERE'
RETURNING *;
```

3️⃣
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders';
```

4️⃣ (if #2 worked but app doesn't, run this)
```sql
DROP POLICY IF EXISTS "business_users_can_select" ON orders;
DROP POLICY IF EXISTS "business_users_can_update" ON orders;
DROP POLICY IF EXISTS "business_users_can_insert" ON orders;

CREATE POLICY "allow_authenticated_updates" ON orders
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

5️⃣ Refresh app and test!

---

**Let me know:**
- Did manual UPDATE work? (YES/NO)
- What policies showed up in step 3?
- Did the RLS fix work?

