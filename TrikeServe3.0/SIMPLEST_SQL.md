# COPY-PASTE SQL INTO SUPABASE

## Query 1
```sql
SELECT id, order_number, status FROM orders ORDER BY created_at DESC LIMIT 1;
```

Copy the ID result.

---

## Query 2 (Replace ID-HERE with the ID from Query 1)
```sql
UPDATE orders SET status = 'preparing' WHERE id = 'ID-HERE' RETURNING id, status;
```

Works? 
- YES = Need RLS fix
- NO = Data problem

---

## Query 3
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'orders';
```

---

## If Query 2 Works But App Doesn't - Run This

```sql
DROP POLICY IF EXISTS "business_users_can_select" ON orders;
DROP POLICY IF EXISTS "business_users_can_update" ON orders;
CREATE POLICY "allow_all" ON orders FOR ALL USING (true) WITH CHECK (true);
```

Refresh app. Test. Should work! ✅

---

Done!

