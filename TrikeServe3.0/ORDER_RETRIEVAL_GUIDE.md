# Order Data Retrieval Guide

## Overview
This guide covers all the ways to retrieve order data from the Supabase `orders` table using the helper functions in `src/lib/supabase.ts`.

---

## Available Order Retrieval Functions

### 1. **getOrders(customerId: string)**
Retrieve all orders for a specific customer.

```typescript
import { supabaseHelpers } from '@/lib/supabase';

const { data: orders, error } = await supabaseHelpers.getOrders('customer@example.com');

if (error) {
  console.error('Error fetching orders:', error);
} else {
  console.log('Customer orders:', orders);
}
```

**Returns:** Array of order objects for the customer
**Sorted by:** Creation date (newest first)

---

### 2. **getAllOrders(filters?: any)**
Retrieve all orders with optional filters.

```typescript
// Get all orders
const { data: allOrders, error } = await supabaseHelpers.getAllOrders();

// Get orders for a specific restaurant
const { data: restaurantOrders, error } = await supabaseHelpers.getAllOrders({
  restaurantId: 'restaurant-uuid'
});

// Get orders with specific status
const { data: pendingOrders, error } = await supabaseHelpers.getAllOrders({
  status: 'pending'
});

// Combine multiple filters
const { data: filtered, error } = await supabaseHelpers.getAllOrders({
  restaurantId: 'restaurant-uuid',
  status: 'preparing',
  customerEmail: 'john@example.com'
});
```

**Supported Filters:**
- `restaurantId` - Filter by restaurant UUID
- `customerId` - Filter by customer UUID
- `status` - Filter by order status
- `orderNumber` - Filter by order number
- `customerEmail` - Filter by customer email

**Returns:** Array of filtered order objects
**Sorted by:** Creation date (newest first)

---

### 3. **getOrderById(orderId: string)**
Retrieve a single order by its ID.

```typescript
const { data: order, error } = await supabaseHelpers.getOrderById('order-uuid');

if (order) {
  console.log('Order details:', order);
  console.log('Order total:', order.total);
  console.log('Status:', order.status);
}
```

**Returns:** Single order object
**Throws:** Error if order doesn't exist

---

### 4. **getOrderByNumber(orderNumber: string)**
Retrieve a single order by its order number (e.g., "ABC1234").

```typescript
const { data: order, error } = await supabaseHelpers.getOrderByNumber('ABC1234');

if (order) {
  console.log('Found order:', order);
}
```

**Returns:** Single order object
**Use case:** Customer looking up order by order number

---

### 5. **getBusinessOrders(restaurantId: string, filters?: any)**
Retrieve all orders for a specific business/restaurant.

```typescript
// Get all orders for a restaurant
const { data: allOrders, error } = await supabaseHelpers.getBusinessOrders('restaurant-uuid');

// Get orders within a date range
const { data: dateFiltered, error } = await supabaseHelpers.getBusinessOrders('restaurant-uuid', {
  startDate: '2026-04-01T00:00:00Z',
  endDate: '2026-04-05T23:59:59Z'
});

// Get orders with specific status
const { data: readyOrders, error } = await supabaseHelpers.getBusinessOrders('restaurant-uuid', {
  status: 'ready'
});
```

**Supported Filters:**
- `status` - Filter by order status
- `startDate` - Filter orders after this date (ISO format)
- `endDate` - Filter orders before this date (ISO format)

**Returns:** Array of order objects
**Use case:** Business dashboard showing restaurant's orders

---

### 6. **getPendingOrders(restaurantId: string)**
Retrieve all pending/active orders for a business (pending, preparing, ready, on-the-way).

```typescript
const { data: activeOrders, error } = await supabaseHelpers.getPendingOrders('restaurant-uuid');

if (activeOrders) {
  console.log(`You have ${activeOrders.length} active orders`);
  activeOrders.forEach(order => {
    console.log(`Order #${order.order_number} - Status: ${order.status}`);
  });
}
```

**Returns:** Array of active orders (excluding delivered and cancelled)
**Sorted by:** Creation date (oldest first - newest orders last)
**Use case:** Business dashboard "Active Orders" tab

---

### 7. **searchOrdersByCustomerEmail(customerEmail: string)**
Search orders by customer email (case-insensitive partial match).

```typescript
const { data: results, error } = await supabaseHelpers.searchOrdersByCustomerEmail('john');

if (results) {
  console.log(`Found ${results.length} orders matching "john"`);
}
```

**Returns:** Array of matching order objects
**Use case:** Search functionality for finding orders

---

### 8. **getRecentOrders(limit: number = 10)**
Get the most recent orders in the system.

```typescript
// Get last 10 orders (default)
const { data: recent10, error } = await supabaseHelpers.getRecentOrders();

// Get last 50 orders
const { data: recent50, error } = await supabaseHelpers.getRecentOrders(50);

// Get last 5 orders
const { data: recent5, error } = await supabaseHelpers.getRecentOrders(5);
```

**Returns:** Array of most recent orders
**Parameters:** `limit` (default 10)
**Use case:** Admin dashboard, recent activity

---

## Order Data Structure

Each order object contains:

```typescript
{
  id: UUID,                      // Unique order ID
  order_number: string,          // e.g., "ABC1234"
  restaurant_id: UUID,           // References restaurants table
  customer_id: UUID,             // References users table
  customer_email: string,        // Customer's email
  customer_name: string,         // Customer's name
  customer_phone: string,        // Customer's phone
  items: JSON,                   // Array of ordered items
  subtotal: decimal,             // Before delivery fee
  delivery_fee: decimal,         // Delivery charge
  total: decimal,                // Final total
  status: varchar,               // pending|preparing|ready|on-the-way|delivered|cancelled
  delivery_mode: varchar,        // delivery|pickup
  payment_method: varchar,       // cash|gcash
  address: text,                 // Delivery address
  estimated_time: varchar,       // e.g., "25 mins"
  needs_cutlery: boolean,        // Customer preference
  created_at: timestamp,         // Order creation time
  updated_at: timestamp          // Last update time
}
```

---

## Practical Examples

### Example 1: Fetch Customer's Order History

```typescript
import { supabaseHelpers } from '@/lib/supabase';

async function getCustomerOrderHistory(customerId: string) {
  try {
    const { data: orders, error } = await supabaseHelpers.getOrders(customerId);
    
    if (error) throw error;
    
    if (!orders || orders.length === 0) {
      console.log('No orders found');
      return [];
    }
    
    // Process orders
    const processedOrders = orders.map(order => ({
      orderNumber: order.order_number,
      total: `₱${order.total}`,
      status: order.status,
      date: new Date(order.created_at).toLocaleDateString(),
      items: order.items.length
    }));
    
    return processedOrders;
  } catch (error) {
    console.error('Error fetching order history:', error);
    return [];
  }
}
```

---

### Example 2: Business Dashboard - Active Orders

```typescript
import { supabaseHelpers } from '@/lib/supabase';

async function getBusinessDashboard(restaurantId: string) {
  try {
    const { data: activeOrders, error } = await supabaseHelpers.getPendingOrders(restaurantId);
    
    if (error) throw error;
    
    // Count by status
    const statuses = {
      pending: activeOrders?.filter(o => o.status === 'pending').length || 0,
      preparing: activeOrders?.filter(o => o.status === 'preparing').length || 0,
      ready: activeOrders?.filter(o => o.status === 'ready').length || 0,
      onTheWay: activeOrders?.filter(o => o.status === 'on-the-way').length || 0
    };
    
    console.log('Active Orders:', statuses);
    
    return {
      totalActive: activeOrders?.length || 0,
      statusBreakdown: statuses,
      orders: activeOrders
    };
  } catch (error) {
    console.error('Error fetching business dashboard:', error);
  }
}
```

---

### Example 3: Search Orders

```typescript
import { supabaseHelpers } from '@/lib/supabase';

async function searchCustomerOrders(searchEmail: string) {
  try {
    const { data: results, error } = await supabaseHelpers.searchOrdersByCustomerEmail(searchEmail);
    
    if (error) throw error;
    
    if (!results) {
      console.log('No results found');
      return [];
    }
    
    return results.map(order => ({
      orderNumber: order.order_number,
      customerEmail: order.customer_email,
      total: order.total,
      status: order.status
    }));
  } catch (error) {
    console.error('Error searching orders:', error);
    return [];
  }
}
```

---

### Example 4: Get Orders with Filters

```typescript
import { supabaseHelpers } from '@/lib/supabase';

async function getFilteredOrders(restaurantId: string, status: string) {
  try {
    const { data: orders, error } = await supabaseHelpers.getBusinessOrders(restaurantId, {
      status: status
    });
    
    if (error) throw error;
    
    return orders || [];
  } catch (error) {
    console.error('Error fetching filtered orders:', error);
    return [];
  }
}

// Usage
const readyOrders = await getFilteredOrders('restaurant-id', 'ready');
const deliveryOrders = await getFilteredOrders('restaurant-id', 'on-the-way');
```

---

### Example 5: Get Recent Orders (Admin Dashboard)

```typescript
import { supabaseHelpers } from '@/lib/supabase';

async function getAdminDashboardOrders() {
  try {
    // Get last 20 orders
    const { data: recentOrders, error } = await supabaseHelpers.getRecentOrders(20);
    
    if (error) throw error;
    
    if (!recentOrders) return [];
    
    // Calculate total revenue
    const totalRevenue = recentOrders.reduce((sum, order) => sum + order.total, 0);
    
    return {
      orders: recentOrders,
      count: recentOrders.length,
      totalRevenue: `₱${totalRevenue.toFixed(2)}`,
      averageOrder: `₱${(totalRevenue / recentOrders.length).toFixed(2)}`
    };
  } catch (error) {
    console.error('Error fetching admin orders:', error);
  }
}
```

---

## Error Handling

All functions return `{ data, error }` objects. Always check for errors:

```typescript
const { data: orders, error } = await supabaseHelpers.getOrders(customerId);

if (error) {
  console.error('Database error:', error.message);
  // Handle error appropriately
} else if (!orders) {
  console.log('No orders found');
} else {
  // Process orders
}
```

---

## Performance Considerations

### Pagination (For Large Datasets)
For large numbers of orders, consider implementing pagination:

```typescript
async function getOrdersWithPagination(restaurantId: string, page: number = 1, pageSize: number = 10) {
  const { data, error, count } = await supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return { data, error, count };
}
```

---

### Filtering Performance Tips
1. Always filter on indexed columns (restaurant_id, customer_id, status, created_at)
2. Use specific filters instead of fetching all data
3. Use date ranges instead of getting all orders
4. Limit results with `.limit()` when appropriate

---

## Status Values

Orders can have these status values:
- `pending` - Order just placed
- `preparing` - Business is preparing the order
- `ready` - Order ready for pickup/delivery
- `on-the-way` - Rider is delivering
- `delivered` - Order completed
- `cancelled` - Order cancelled

---

## Common Queries

### Get all pending orders for today
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);

const { data } = await supabaseHelpers.getBusinessOrders(restaurantId, {
  status: 'pending',
  startDate: today.toISOString(),
  endDate: new Date().toISOString()
});
```

### Get total orders count
```typescript
const { data: allOrders } = await supabaseHelpers.getAllOrders();
const totalOrders = allOrders?.length || 0;
```

### Get delivered orders
```typescript
const { data: completed } = await supabaseHelpers.getAllOrders({
  status: 'delivered'
});
```

---

## Summary

| Function | Purpose | Use Case |
|----------|---------|----------|
| `getOrders()` | Get customer's orders | Customer order history |
| `getAllOrders()` | Get filtered orders | Admin dashboard |
| `getOrderById()` | Get single order | Order detail page |
| `getOrderByNumber()` | Find by order number | Order lookup |
| `getBusinessOrders()` | Get business orders | Business dashboard |
| `getPendingOrders()` | Get active orders | Business active orders |
| `searchOrdersByCustomerEmail()` | Search orders | Search functionality |
| `getRecentOrders()` | Get newest orders | Admin activity |

---

*Guide Version: 1.0*
*Date: April 5, 2026*

