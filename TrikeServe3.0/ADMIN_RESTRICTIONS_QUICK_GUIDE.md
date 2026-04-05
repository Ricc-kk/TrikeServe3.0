# Admin Role Restrictions - Quick Reference Guide

## Summary of Changes

### 1. Business & Customer Admin Restrictions

**AdminSettings.tsx:**
```
BEFORE: All admins could see and modify rate configuration
AFTER:  Only Driver Admins can see/modify rates
        Business & Customer Admins see a yellow warning banner
```

**VerifiedUsers.tsx:**
```
BEFORE: All admins could approve/reject any user type
AFTER:  Business & Customer Admins can ONLY approve/reject:
        ✓ Customer users
        ✓ Business users
        ✗ Driver/Rider users (show "Cannot Verify" button)
```

### 2. Driver Admin Restrictions

**AdminSettings.tsx:**
```
BEFORE: N/A
AFTER:  Driver Admins can view and modify rate configuration
        (This is their only admin capability)
```

**VerifiedUsers.tsx:**
```
BEFORE: All admins could approve/reject any user type
AFTER:  Driver Admins can ONLY approve/reject:
        ✓ Driver/Rider users
        ✗ Customer users (show "Cannot Verify" button)
        ✗ Business users (show "Cannot Verify" button)
```

## Implementation Details

### Key Functions in VerifiedUsers.tsx

```typescript
// Check if admin can verify a specific user type
const canVerifyUser = (userRole: string): boolean => {
  if (user?.adminType === 'business_customer') {
    return userRole !== 'rider';  // Can verify customer & business, NOT rider
  }
  if (user?.adminType === 'rider') {
    return userRole === 'rider';  // Can verify rider only
  }
  return true;  // Super admin can verify all
};

// Provide explanation why verification is blocked
const getVerificationBlockedReason = (userRole: string): string => {
  if (user?.adminType === 'business_customer') {
    return 'Business & Customer Admin cannot verify driver users';
  }
  if (user?.adminType === 'rider') {
    return 'Driver Admin can only verify driver users';
  }
  return '';
};
```

### UI Changes in VerifiedUsers.tsx

**Pending Users Section:**
```jsx
{canVerifyUser(u.role) ? (
  <>
    {/* Show Approve & Reject buttons */}
    <button className="bg-green-500">Approve</button>
    <button className="bg-red-500">Reject</button>
  </>
) : (
  {/* Show disabled Cannot Verify button with tooltip */}
  <div title={getVerificationBlockedReason(u.role)}>
    Cannot Verify
  </div>
)}
```

### Restricted Access Banner in AdminSettings.tsx

**For Business & Customer Admins:**
```jsx
{isBusinessCustomerAdmin && (
  <div className="bg-[#FEF3C7] border-2 border-[#FCD34D]">
    <AlertTriangle />
    <h3>Access Restricted</h3>
    <p>As a Business & Customer Administrator, you do not have 
       access to fixed rate configuration. Only Driver Administrators 
       can modify rate settings.</p>
  </div>
)}
```

## Testing Scenarios

### Scenario 1: Business & Customer Admin
- [ ] Login with `adminType: 'business_customer'`
- [ ] Navigate to AdminSettings → Rate Configuration hidden, warning shown
- [ ] Navigate to VerifiedUsers → Can approve customer users
- [ ] Navigate to VerifiedUsers → Can approve business users
- [ ] Navigate to VerifiedUsers → Cannot approve driver users (see "Cannot Verify")

### Scenario 2: Driver Admin
- [ ] Login with `adminType: 'rider'`
- [ ] Navigate to AdminSettings → Rate Configuration visible and editable
- [ ] Navigate to VerifiedUsers → Can approve driver users
- [ ] Navigate to VerifiedUsers → Cannot approve customer users (see "Cannot Verify")
- [ ] Navigate to VerifiedUsers → Cannot approve business users (see "Cannot Verify")

### Scenario 3: Super Admin
- [ ] Login with `adminType: undefined` or other
- [ ] Navigate to AdminSettings → Rate Configuration visible
- [ ] Navigate to VerifiedUsers → Can approve all user types

## Files Modified

1. **src/app/components/admin/AdminSettings.tsx**
   - Lines ~133-137: Added `isBusinessCustomerAdmin` variable
   - Lines ~178-190: Added restricted access banner UI
   - Lines ~192-195: Conditional rendering of rate config section

2. **src/app/components/admin/VerifiedUsers.tsx**
   - Lines ~245-267: Added `canVerifyUser()` helper function
   - Lines ~269-277: Added `getVerificationBlockedReason()` helper function
   - Lines ~470-485: Updated pending users buttons with conditional rendering

## Deployment Checklist

- [x] Code changes implemented
- [x] Build completed without errors
- [x] All TypeScript types validated
- [x] Helper functions created and tested
- [x] UI properly reflects role restrictions
- [ ] Manual testing with different admin roles
- [ ] User acceptance testing
- [ ] Deploy to production

