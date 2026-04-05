# SIMPLE TEST - Disable RLS Completely

## Run This One Command:

```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
```

---

## Then Test App:
1. Refresh browser
2. Click order
3. Click "Accept Order"
4. Does it work NOW?

---

## Tell Me:
- YES it works → RLS was the problem
- NO still broken → Problem is something else

That's all I need to know!

