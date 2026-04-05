# DIAGNOSE WHY UPDATE FAILED

## STEP 1: Check Table Structure
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

Report back:
- What columns exist?
- Does it have `id` and `status` columns?

---

## STEP 2: See Your Order Data
```sql
SELECT * FROM orders 
ORDER BY created_at DESC 
LIMIT 1;
```

Report back:
- What does the order look like?
- Copy the full row output

---

## STEP 3: Check Data Type of ID
```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'id';
```

Report back:
- What is the data type of `id`? (UUID, text, bigint, etc)

---

## STEP 4: Check Data Type of Status
```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'status';
```

Report back:
- What is the data type of `status`?

---

## STEP 5: Try Simple Update Without Updated_at
```sql
UPDATE orders 
SET status = 'preparing'
WHERE id = 'ID-HERE'
RETURNING *;
```

Report back:
- Did this work?
- What error message if it failed?

---

## STEP 6: Check If Table Uses UUID or Text for ID
```sql
SELECT id FROM orders LIMIT 1;
```

Report back:
- What does the ID look like? (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or something else?)

---

## WHAT TO TELL ME

Run steps 1-6 and tell me:
1. All columns in orders table
2. Full data of most recent order
3. Data type of `id` column
4. Data type of `status` column
5. Did Step 5 work? (the simple update)
6. What does an order ID look like?

Then I'll know exactly what's wrong!

