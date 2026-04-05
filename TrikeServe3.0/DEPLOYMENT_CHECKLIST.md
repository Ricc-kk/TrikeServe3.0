# ✅ DEPLOYMENT CHECKLIST - Business User Isolation Fix

## Pre-Deployment

- [ ] Code reviewed and approved
- [ ] All changes implemented in specified files
- [ ] No syntax errors in modified files
- [ ] Git commit created with changes

## Verification Steps

### Step 1: Environment Validation
- [ ] `.env.local` contains `VITE_SUPABASE_URL`
- [ ] `.env.local` contains `VITE_SUPABASE_ANON_KEY`
- [ ] Supabase project is accessible
- [ ] Node modules are installed (`npm install` complete)

### Step 2: Code Validation
- [ ] `src/app/contexts/AuthContext.tsx` updated with Supabase restaurantId fetch
- [ ] `src/app/components/business/BusinessOrders.tsx` updated with Supabase order fetch
- [ ] No TypeScript compilation errors
- [ ] No undefined variable references

### Step 3: Database Validation
- [ ] RLS enabled on `orders` table
- [ ] RLS policy exists: "Customers can view their own orders"
- [ ] RLS policy exists: "Business users can view orders for their restaurant only"
- [ ] RLS policy exists: "Business users can update orders for their restaurant only"
- [ ] All orders have `restaurant_id` field populated
- [ ] All restaurants have `business_user_id` field set

**Run in Supabase SQL Editor:**
```sql
-- Verify RLS policies
SELECT policyname FROM pg_policies 
WHERE tablename = 'orders' 
ORDER BY policyname;
```

Expected results:
- Business users can update orders for their restaurant only
- Business users can view orders for their restaurant only
- Customers can create orders
- Customers can update their own orders
- Customers can view their own orders

### Step 4: Testing in Development

**Start development server:**
```bash
npm run dev
```

**Test Case 1: Business User A**
- [ ] Login with Business User A credentials
- [ ] Navigate to Orders page
- [ ] Verify app shows "Loading..." briefly (fetching from Supabase)
- [ ] Verify orders displayed are ONLY from Business User A's restaurant
- [ ] Open browser DevTools → Network tab
- [ ] Verify Supabase API call is made
- [ ] Verify response contains restaurant_id field

**Test Case 2: Business User B**
- [ ] Logout from Business User A
- [ ] Wait 2 seconds
- [ ] Login with Business User B credentials
- [ ] Navigate to Orders page
- [ ] Verify orders displayed are ONLY from Business User B's restaurant
- [ ] **CRITICAL**: Verify Business User A's orders are NOT visible
- [ ] Verify DevTools shows different restaurant_id in API calls

**Test Case 3: Order Status Update**
- [ ] Change status of an order (pending → preparing)
- [ ] Verify status updates in UI
- [ ] Verify status persists after page refresh
- [ ] Check Supabase database directly to confirm update

**Test Case 4: RLS Enforcement**
- [ ] In Supabase SQL Editor, check orders for Business User A's restaurant
- [ ] Try to query Business User B's restaurant orders manually
- [ ] Verify query returns data (but not for other users)

### Step 5: Console Log Validation

**Expected logs when loading orders:**
```
[BusinessOrders] Current user: {email, id, restaurantId, role}
[BusinessOrders] Fetching restaurant ID from Supabase for user: <id>
[BusinessOrders] Got restaurant ID from database: <restaurant-uuid>
[BusinessOrders] Fetching orders from Supabase for restaurant: <restaurant-uuid>
[BusinessOrders] Loaded X orders from Supabase
[BusinessOrders] SECURITY: These orders are protected by RLS policies
```

**If you see these logs, everything is working correctly!**

## Deployment Steps

### For Development Environment
1. [ ] Pull latest code
2. [ ] Run `npm install` (if any dependencies changed)
3. [ ] Run `npm run dev`
4. [ ] Execute all testing steps above
5. [ ] Verify no errors in console

### For Staging Environment
1. [ ] Build project: `npm run build`
2. [ ] Verify build succeeds without errors
3. [ ] Deploy to staging server
4. [ ] Run testing steps with staging Supabase
5. [ ] Load test (verify performance with multiple orders)
6. [ ] Verify all orders load correctly

### For Production Environment
1. [ ] Create backup of production database
2. [ ] Verify all RLS policies in production Supabase
3. [ ] Deploy code to production
4. [ ] Monitor error logs for first 24 hours
5. [ ] Verify business users can see their orders
6. [ ] Verify data isolation is working (random spot checks)

## Rollback Plan

**If issues are discovered:**

1. [ ] Have previous version ready
2. [ ] Revert code: `git revert <commit-hash>`
3. [ ] Restart application
4. [ ] Monitor for any data inconsistencies

**Rollback should not affect data** - only the way data is fetched

## Post-Deployment Verification

- [ ] All business users can access their orders
- [ ] No cross-user order visibility
- [ ] Order status updates work correctly
- [ ] No performance degradation
- [ ] No console errors in production
- [ ] Supabase logs show normal RLS enforcement

## Security Audit Checklist

- [ ] RLS policies are active on `orders` table
- [ ] Only authenticated users can access orders
- [ ] Business users cannot access other users' restaurants
- [ ] Customers can only see their own orders
- [ ] No sensitive data in client-side logs
- [ ] All API calls go through Supabase with auth

## Monitoring (First 24 Hours)

**Watch for:**
- [ ] Spike in 401/403 errors (RLS blocking)
- [ ] Users reporting "orders not loading"
- [ ] Supabase error rate above normal
- [ ] Longer load times for orders page
- [ ] Any user access anomalies

**Contact points:**
- Supabase Dashboard → Logs
- Application error tracking
- User support tickets

## Success Criteria

✅ All verification steps pass
✅ No errors in logs
✅ Business users see only their orders
✅ Orders load within 2-3 seconds
✅ Status updates work correctly
✅ No data leakage between users

## Final Sign-Off

- [ ] Developer: Code changes verified
- [ ] QA: Testing checklist completed
- [ ] DevOps: Deployment successful
- [ ] Security: RLS policies verified
- [ ] Product: Feature working as expected

---

## Documents for Reference

- `BUSINESS_USER_ISOLATION_FIX.md` - Technical details
- `BUSINESS_USER_ISOLATION_VERIFICATION.sql` - Database verification queries
- `test-business-isolation.bat` - Automated test script
- `IMPLEMENTATION_COMPLETE.md` - Complete implementation guide

---

**Date**: April 5, 2026  
**Status**: Ready for Deployment  
**Risk Level**: 🟢 Low (Backward compatible, database enforced)  
**Rollback Risk**: 🟢 Low (Can revert if needed)

---

## Sign-Off Signatures

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | _________________ | ___/___/___ | ___________ |
| QA Lead | _________________ | ___/___/___ | ___________ |
| DevOps | _________________ | ___/___/___ | ___________ |
| Security | _________________ | ___/___/___ | ___________ |
| Product Owner | _________________ | ___/___/___ | ___________ |


