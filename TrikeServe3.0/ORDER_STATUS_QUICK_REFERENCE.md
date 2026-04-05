# Order Status Management - Quick Reference Guide

## 🚀 Quick Start

### View and Manage Orders
```
1. Login as business user
2. Go to /business/orders
3. Click on any order
4. See status progress bar
5. Click action button to change status
```

---

## 📊 Status Workflow Diagram

```
┌─────────────┐
│  PENDING    │  Customer just ordered
│ New Order   │
└──────┬──────┘
       │ Accept
       ↓
┌─────────────┐
│ PREPARING   │  Kitchen is making it
│   Blue      │
└──────┬──────┘
       │ Ready
       ↓
┌─────────────┐
│    READY    │  Order is prepared
│   Green     │
└──┬────────┬─┘
   │        │
   │Pickup  │Delivery
   │        │
   ↓        ↓
COMPLETE   ASSIGN RIDER
   ✓        │
            ↓
         ┌──────────────┐
         │ ON-THE-WAY   │  Rider delivering
         │   Orange     │
         └──────┬───────┘
                │ Delivered
                ↓
            ┌─────────────┐
            │  DELIVERED  │  Order complete
            │    Gray     │
            └─────────────┘
                   ✅

DECLINE (anytime)
   │
   ↓
┌──────────────┐
│  CANCELLED   │  Order declined
│     Red      │
└──────────────┘
```

---

## 🎯 Each Status Explained

### 🟨 PENDING (New Order)
- **What:** Customer just placed order
- **Your Action:** Review and accept/decline
- **Buttons:** Accept Order / Decline Order
- **Next:** PREPARING or CANCELLED

### 🔵 PREPARING (Being Prepared)
- **What:** Kitchen is preparing food
- **Your Action:** Wait for food to be ready
- **Buttons:** Ready for Pickup
- **Next:** READY

### 🟢 READY (Order Ready)
- **What:** Food is prepared and packaged
- **Your Action:** Wait for pickup or assign rider
- **Buttons:** 
  - Pickup: Completed
  - Delivery: Rider Assigned - On The Way
- **Next:** DELIVERED (for pickup) or ON-THE-WAY (for delivery)

### 🟠 ON-THE-WAY (Out for Delivery)
- **What:** Rider is delivering to customer
- **Your Action:** Wait for delivery to complete
- **Buttons:** Delivered - Complete Order
- **Next:** DELIVERED

### ⚫ DELIVERED (Order Complete)
- **What:** Order successfully delivered/picked up
- **Your Action:** None - order is complete
- **Buttons:** None
- **Status:** ✅ Order Complete

### 🔴 CANCELLED (Order Cancelled)
- **What:** Order was declined
- **Your Action:** None - order is cancelled
- **Buttons:** None
- **Status:** ✗ Order Cancelled

---

## ✅ What Happens When You Change Status

1. **Order Status Updates** ✓
2. **Progress Bar Updates** ✓
3. **Sidebar Badge Updates** ✓
4. **Supabase Saves Change** ✓
5. **Customer Gets Notification** ✓
6. **Customer Activity Updates** ✓

---

## 📱 How to Use on Mobile

```
1. Tap order to open details
2. Scroll down to see action buttons
3. Tap the action button
4. Status updates immediately
5. Tap "Close" to go back
```

---

## 🎨 Visual Status Indicators

| Status | Color | Icon | Meaning |
|--------|-------|------|---------|
| PENDING | 🟨 Yellow | ⏳ | Waiting for action |
| PREPARING | 🔵 Blue | 👨‍🍳 | Being prepared |
| READY | 🟢 Green | ✓ | Ready to go |
| ON-THE-WAY | 🟠 Orange | 🚗 | In transit |
| DELIVERED | ⚫ Gray | ✅ | Complete |
| CANCELLED | 🔴 Red | ✗ | Cancelled |

---

## 💡 Tips

- **Accept quickly:** Customers wait for confirmation
- **Update regularly:** Keep customers informed
- **Prepare efficiently:** Faster = happier customers
- **Assign riders fast:** For delivery orders
- **Confirm delivery:** Always mark as delivered

---

## 🆘 Common Questions

**Q: Can I go back to a previous status?**
A: No, statuses only move forward. Be careful when clicking!

**Q: What if I decline an order?**
A: It becomes CANCELLED and customer is notified.

**Q: How do customers know status changed?**
A: They get notifications automatically!

**Q: Can I see all orders I changed status for?**
A: Yes, check the History tab.

**Q: What's the difference between DELIVERED and COMPLETED?**
A: They're the same - order is done.

---

## 🚀 Example: Accepting Your First Order

```
1. Login as business
2. See PENDING order in list
3. Click on it to view details
4. Read customer info and items
5. See green "Accept Order" button
6. Click it
7. Status changes to PREPARING
8. Progress bar updates
9. Order moves to active list
10. Start preparing! 👨‍🍳
```

---

## 📊 Full Workflow Example

### Delivery Order:
```
PENDING (1 min)
  ↓ Accept
PREPARING (15 mins)
  ↓ Ready
READY (5 mins)
  ↓ Assign Rider
ON-THE-WAY (10 mins)
  ↓ Delivered
COMPLETED ✅
Total: ~31 minutes
```

### Pickup Order:
```
PENDING (1 min)
  ↓ Accept
PREPARING (15 mins)
  ↓ Ready
READY (customer picks up)
  ↓ Complete
COMPLETED ✅
Total: ~16 minutes
```

---

## ✨ Summary

- ✅ Click order to view
- ✅ See progress bar
- ✅ Click action button
- ✅ Status updates
- ✅ Customer notified
- ✅ Done!

**That's it! Orders are now fully manageable.** 🚀

---

*Quick Reference v1.0*
*Date: April 5, 2026*

