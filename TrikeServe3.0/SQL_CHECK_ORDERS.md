# SIMPLE SQL - Run These ONE BY ONE

## 1. Check Recent Orders
```sql
SELECT id, order_number, status, created_at, updated_at
FROM orders
ORDER BY created_at DESC 
LIMIT 10;
```

Copy an ID from the results.

---

## 2. Check That Order Details
```sql
SELECT * FROM orders 
WHERE id = 'PASTE-ID-HERE';
```

---

## 3. Try Manual Update (Test If It Works)
```sql
UPDATE orders 
SET status = 'preparing', updated_at = NOW()
WHERE id = 'PASTE-ID-HERE'
RETURNING id, status, updated_at;
```

## 4. Check RLS Policies
```sql
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'orders';
```

---

## REPORT BACK WITH:
- Query 1 output (recent orders)
- Did Query 3 work? (YES/NO)
- Query 4 output (policy names)

**That's it!**

