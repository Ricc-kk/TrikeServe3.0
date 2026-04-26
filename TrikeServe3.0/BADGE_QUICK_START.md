# 🏷️ Badge Feature - Quick Start Guide

## What's New?

Business owners can now assign badges to menu items, and customers will see them on the store page with special styling!

---

## 🏪 For Business Owners

### How to Assign a Badge

1. Go to **Menu** in your business dashboard
2. Click on any menu item to edit it
3. In the edit modal, find **"Badge (Optional)"** section
4. Choose one of these options:
   - **Most Ordered** 🔴 - Red badge for popular items
   - **Most Liked** 🔵 - Blue badge for customer favorites
   - **Signature** 🟨 - Amber badge for specialty dishes
   - **No Badge** - Remove any badge
5. Click **"Save Changes"**

### What It Looks Like

Your menu items will show:
- Item name and badge label underneath
- Badge color indicator
- Icon representing the badge type

**Example:**
```
Item Name: Chicken Adobo
[🔴 Most Ordered]  Price: ₱150
```

---

## 👥 For Customers

### What Customers Will See

When browsing restaurant menus:

1. ** Badge on Item Image** (top-left corner)
   - 🔴 **Red badge** = "Most ordered" 
   - 🔵 **Blue badge** = "Most liked"
   - ⚫ **Black badge** = "Signature dish"

2. **"What People Say" Section**
   - "Top Picks" area shows items with badges
   - Helps customers find popular/special items

3. **Why Badges Help**
   - Discover popular items quickly
   - See restaurant's specialty dishes
   - Find customer favorites

---

## 💾 Database Info

### New Column Added
```sql
ALTER TABLE menu_items 
ADD COLUMN badge VARCHAR(50);
```

Run this SQL file in Supabase:
**File:** `ADD_BADGE_TO_MENU_ITEMS.sql`

### Badge Values
- `'most-ordered'` - Most popular item
- `'most-liked'` - Customer favorite
- `'signature'` - Restaurant specialty
- `NULL` - No badge (default)

---

## ✨ Features

✅ **Easy to Use** - Simple button selection
✅ **Visual Feedback** - See badges in real-time
✅ **Auto-Save** - Changes save automatically
✅ **Mobile Friendly** - Works on all devices
✅ **Persistent** - Saved to Supabase
✅ **Backup** - Also saved to localStorage

---

## 🚀 Getting Started

### Step 1: Run Database Migration
Execute `ADD_BADGE_TO_MENU_ITEMS.sql` in Supabase SQL Editor

### Step 2: Edit a Menu Item
1. Open Business Dashboard
2. Go to Menu
3. Click any item
4. Add a badge
5. Save

### Step 3: Check Customer View
1. Open `/customer/food`
2. Click any restaurant
3. **You should see badges on items!**

---

## 🎨 Badge Styling

| Badge | Color | Icon | Hex |
|-------|-------|------|-----|
| Most Ordered | Red | 📈 Trending | #E11D48 |
| Most Liked | Blue | ⭐ Star | #3B82F6 |
| Signature | Amber | 🏆 Award | #F59E0B |

---

## 🔗 Related Files

- **Implementation:** `BusinessMenu.tsx`, `RestaurantDetail.tsx`
- **Database:** `ADD_BADGE_TO_MENU_ITEMS.sql`
- **Documentation:** `BADGE_FEATURE_IMPLEMENTATION.md`

---

## 📞 Support

If badges don't appear:
1. ✅ Check migration was run in Supabase
2. ✅ Refresh the page (Ctrl+R)
3. ✅ Check browser console for errors
4. ✅ Verify item was saved (check localStorage)

---

**Happy highlighting! 🎉**


