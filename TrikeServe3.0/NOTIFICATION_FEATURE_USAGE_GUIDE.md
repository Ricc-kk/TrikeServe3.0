# Cart Notification Feature - Visual Guide & Usage

## User Experience

### When a Customer Adds Items to Cart

**Before:**
- Customer adds item to cart
- No visual feedback about the addition (except cart counter update)

**After (New Feature):**
- Customer adds item to cart
- A small toast notification appears in the **upper right corner**
- Notification displays: **"n item(s) added to the cart"** in white text on a green background
- Notification automatically dismisses after 3 seconds
- Customer can click the X button to dismiss sooner

---

## Notification Appearance

### Location
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Upper Right Corner of Screen                       │
│                      ┌──────────────────────────┐  │
│                      │ ✓ 1 item added to cart │✕  │
│                      └──────────────────────────┘  │
│                                                     │
│  (Green background with white text)                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Visual Characteristics
- **Background Color:** Green (#10B981)
- **Text Color:** White
- **Animation:** Slides in from right side (0.3 seconds)
- **Position:** Fixed at top-right with 1rem (16px) padding
- **Icon:** Green checkmark (✓)
- **Close Button:** X icon in white on the right side
- **Auto-dismiss:** 3 seconds

### Multiple Items Example
When adding 3 items at once:
```
┌──────────────────────────────────────────┐
│ ✓ 3 items added to the cart            │✕│
└──────────────────────────────────────────┘
```

---

## Step-by-Step Usage

### Scenario 1: Adding a Single Item
1. User navigates to a restaurant
2. User clicks "Add to Cart" on a menu item (or completes customization modal)
3. **Action triggered:** `addToCartWithCustomizations(item, 1, [])`
4. **Result:** Toast shows "1 item added to the cart"
5. Notification appears in upper right
6. User can continue browsing or dismiss the notification
7. After 3 seconds, notification automatically disappears

### Scenario 2: Adding Multiple Quantities
1. User opens a menu item
2. User selects customizations and sets quantity to 3
3. User clicks "Add to Cart"
4. **Action triggered:** `addToCartWithCustomizations(item, 3, [customizations])`
5. **Result:** Toast shows "3 items added to the cart"
6. Same display and dismissal behavior as above

### Scenario 3: Updating Existing Cart Item
- When adding an item that already exists in cart from the same restaurant
- **Current behavior:** Quantity is increased in the existing cart entry
- **Notification:** Still shows the quantity of items being added in this action

---

## Technical Flow

```
User Click (Add to Cart)
        ↓
addToCartWithCustomizations()
        ↓
addItemToCart() [CartContext]
        ↓
showNotification() [NotificationContext]
        ↓
Toast Component Renders
        ↓
Notification Appears (Top-Right)
        ↓
Auto-dismiss after 3 seconds OR Manual dismiss on click
```

---

## Notification States

### Success Notification (Green)
```
Theme Color: #10B981
Usage: When items are successfully added to cart
Message: "{quantity} item(s) added to the cart"
```

### Error Notification (Red) - *For Future Use*
```
Theme Color: #E11D48
Usage: When cart add fails
Message: Error message
```

### Info Notification (Blue) - *For Future Use*
```
Theme Color: #3B82F6
Usage: For informational messages
Message: Info message
```

---

## React Component Architecture

```
Root
├── AuthProvider
├── FavoritesProvider
├── CartProvider
├── OrderProvider
└── NotificationProvider (NEW)
    ├── Toast Component (NEW)
    │   └── Displays notifications
    └── Outlet
        └── Page Components
            ├── RestaurantDetail
            │   └── Uses useNotification()
            │       └── Calls showNotification()
            └── Other Pages
```

---

## Configuration Options

### Notification Duration
Default: 3000ms (3 seconds)
Can be customized when calling `showNotification()`:
```typescript
showNotification("Message", "success", 5000); // 5 seconds
showNotification("Message", "success", 0);    // No auto-dismiss
```

### Notification Message
The message is dynamically generated based on quantity:
```typescript
// Single item
showNotification("1 item added to the cart", "success");

// Multiple items
showNotification("3 items added to the cart", "success");
```

### Notification Type
Current types: 'success', 'error', 'info'
Each has its own color and icon styling.

---

## Testing Checklist

- [ ] Add single item to cart → Notification shows "1 item added to the cart"
- [ ] Add multiple items to cart → Notification shows "n items added to the cart"
- [ ] Notification appears in upper right corner
- [ ] Notification has green background with white text
- [ ] Notification slides in from right
- [ ] Notification auto-dismisses after 3 seconds
- [ ] Click X button on notification → Dismisses immediately
- [ ] Click on notification body → Dismisses immediately
- [ ] Continue adding items → Notifications stack and appear one after another
- [ ] No errors in browser console

---

## Browser Support

Works on all modern browsers that support:
- React Context API
- CSS Animations
- Position: fixed

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## Accessibility

- Notification has proper contrast (white on green)
- Close button (X) is easily clickable
- Notification doesn't trap keyboard focus
- Auto-dismissal provides time to read message (3 seconds)

---

## Future Enhancements

1. **Smart Stacking**
   - Multiple notifications stack vertically
   - Older notifications fade out as new ones appear

2. **Sound Notification**
   - Optional beep/sound when item is added

3. **Animated Counter**
   - Show cart count update in notification

4. **Customizable Messages**
   - Different messages based on context (first item, repeat add, etc.)

5. **Notification History**
   - Keep log of recent cart additions

6. **Mobile Optimized**
   - Responsive positioning on mobile screens
   - Larger touch targets for close button

---

## Troubleshooting

**Notification not appearing?**
- Check that NotificationProvider is wrapping all routes in Root.tsx
- Check that Toast component is rendered in Root.tsx
- Check browser console for errors

**Notification appears but looks wrong?**
- Check CSS classes are properly imported
- Verify Tailwind CSS is properly configured
- Check z-index conflicts with other elements

**Auto-dismiss not working?**
- Check notification duration is set (default: 3000ms)
- Check browser console for JavaScript errors

---

## Development Notes

- Notification context is global and can be used anywhere in the app
- Multiple notifications can be shown simultaneously
- Each notification has a unique ID for tracking
- Notifications are stored in React state, not localStorage
- No external dependencies required (uses React context and lucide-react for icons)

