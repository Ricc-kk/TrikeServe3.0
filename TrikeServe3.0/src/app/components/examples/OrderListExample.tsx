import { useState, useEffect } from 'react';
import { supabaseHelpers } from '@/lib/supabase';

/**
 * Example Component: Order List Display
 * Shows how to retrieve and display orders from Supabase
 */

export default function OrderListExample() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all'); // all, pending, preparing, ready, delivered

  useEffect(() => {
    fetchOrders();
  }, [filter]);

  // Method 1: Get all recent orders
  const fetchOrders = async () => {
    setLoading(true);
    setError(null);

    try {
      let result;

      // Get orders based on filter
      if (filter === 'all') {
        // Get recent 20 orders
        result = await supabaseHelpers.getRecentOrders(20);
      } else {
        // Get orders with specific status
        result = await supabaseHelpers.getAllOrders({
          status: filter
        });
      }

      const { data, error: dbError } = result;

      if (dbError) {
        throw new Error(dbError.message);
      }

      setOrders(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  // Method 2: Get orders for a specific customer
  const getCustomerOrders = async (customerId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabaseHelpers.getOrders(customerId);

      if (error) throw error;

      setOrders(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Method 3: Get orders for a specific restaurant
  const getRestaurantOrders = async (restaurantId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabaseHelpers.getBusinessOrders(restaurantId);

      if (error) throw error;

      setOrders(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Method 4: Get pending orders for a restaurant
  const getPendingOrdersForBusiness = async (restaurantId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabaseHelpers.getPendingOrders(restaurantId);

      if (error) throw error;

      setOrders(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Method 5: Search orders by customer email
  const searchOrders = async (email: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabaseHelpers.searchOrdersByCustomerEmail(email);

      if (error) throw error;

      setOrders(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Method 6: Get single order by ID
  const getOrderDetails = async (orderId: string) => {
    try {
      const { data, error } = await supabaseHelpers.getOrderById(orderId);

      if (error) throw error;

      console.log('Order details:', data);
      return data;
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Method 7: Get single order by order number
  const getOrderByNumber = async (orderNumber: string) => {
    try {
      const { data, error } = await supabaseHelpers.getOrderByNumber(orderNumber);

      if (error) throw error;

      console.log('Found order:', data);
      return data;
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-[var(--amber-soft)] text-[var(--amber-dark)]';
      case 'preparing':
        return 'bg-[var(--info-soft)] text-[var(--info)]';
      case 'ready':
        return 'bg-[var(--success-soft)] text-[var(--success)]';
      case 'on-the-way':
        return 'bg-[var(--amber-soft)] text-[var(--amber-dark)]';
      case 'delivered':
        return 'bg-[var(--muted)] text-[var(--ink)]';
      case 'cancelled':
        return 'bg-[var(--error-soft)] text-[var(--error)]';
      default:
        return 'bg-[var(--muted)] text-[var(--ink)]';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Order Management</h1>

      {/* Error Message */}
      {error && (
        <div className="bg-[var(--error-soft)] border border-[var(--error)] text-[var(--error)] px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Filter Buttons */}
      <div className="mb-6 flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded ${
            filter === 'all'
              ? 'bg-[var(--info)] text-white'
              : 'bg-[var(--border)] text-[var(--ink)]'
          }`}
        >
          All Orders
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded ${
            filter === 'pending'
              ? 'bg-[var(--info)] text-white'
              : 'bg-[var(--border)] text-[var(--ink)]'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter('preparing')}
          className={`px-4 py-2 rounded ${
            filter === 'preparing'
              ? 'bg-[var(--info)] text-white'
              : 'bg-[var(--border)] text-[var(--ink)]'
          }`}
        >
          Preparing
        </button>
        <button
          onClick={() => setFilter('ready')}
          className={`px-4 py-2 rounded ${
            filter === 'ready'
              ? 'bg-[var(--info)] text-white'
              : 'bg-[var(--border)] text-[var(--ink)]'
          }`}
        >
          Ready
        </button>
        <button
          onClick={() => setFilter('delivered')}
          className={`px-4 py-2 rounded ${
            filter === 'delivered'
              ? 'bg-[var(--info)] text-white'
              : 'bg-[var(--border)] text-[var(--ink)]'
          }`}
        >
          Delivered
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin">
            <div className="h-8 w-8 border-4 border-[var(--info)] border-t-transparent rounded-full"></div>
          </div>
          <p className="mt-2 text-[var(--muted-foreground)]">Loading orders...</p>
        </div>
      )}

      {/* Orders Table */}
      {!loading && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-[var(--border)]">
            <thead className="bg-[var(--muted)]">
              <tr>
                <th className="border border-[var(--border)] px-4 py-2 text-left">Order #</th>
                <th className="border border-[var(--border)] px-4 py-2 text-left">Customer</th>
                <th className="border border-[var(--border)] px-4 py-2 text-left">Email</th>
                <th className="border border-[var(--border)] px-4 py-2 text-right">Total</th>
                <th className="border border-[var(--border)] px-4 py-2 text-left">Status</th>
                <th className="border border-[var(--border)] px-4 py-2 text-left">Date</th>
                <th className="border border-[var(--border)] px-4 py-2 text-left">Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-[var(--muted)]">
                  <td className="border border-[var(--border)] px-4 py-2 font-semibold">
                    {order.order_number}
                  </td>
                  <td className="border border-[var(--border)] px-4 py-2">
                    {order.customer_name || 'N/A'}
                  </td>
                  <td className="border border-[var(--border)] px-4 py-2 text-sm">
                    {order.customer_email}
                  </td>
                  <td className="border border-[var(--border)] px-4 py-2 text-right font-semibold">
                    ₱{order.total?.toFixed(2) || '0.00'}
                  </td>
                  <td className="border border-[var(--border)] px-4 py-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="border border-[var(--border)] px-4 py-2 text-sm">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="border border-[var(--border)] px-4 py-2">
                    {Array.isArray(order.items) ? order.items.length : 0} items
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!loading && orders.length === 0 && !error && (
        <div className="text-center py-8 text-[var(--muted-foreground)]">
          <p>No orders found</p>
        </div>
      )}

      {/* Available Methods */}
      <div className="mt-12 p-6 bg-[var(--muted)] rounded-lg">
        <h2 className="text-2xl font-bold mb-4">Available Methods (for testing)</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">1. Get Customer Orders</h3>
            <button
              onClick={() => getCustomerOrders('customer-uuid')}
              className="bg-[var(--success)] text-white px-4 py-2 rounded hover:bg-[var(--success)]"
            >
              Fetch Customer Orders
            </button>
          </div>

          <div>
            <h3 className="font-semibold mb-2">2. Get Restaurant Orders</h3>
            <button
              onClick={() => getRestaurantOrders('restaurant-uuid')}
              className="bg-[var(--success)] text-white px-4 py-2 rounded hover:bg-[var(--success)]"
            >
              Fetch Restaurant Orders
            </button>
          </div>

          <div>
            <h3 className="font-semibold mb-2">3. Get Pending Orders for Business</h3>
            <button
              onClick={() => getPendingOrdersForBusiness('restaurant-uuid')}
              className="bg-[var(--success)] text-white px-4 py-2 rounded hover:bg-[var(--success)]"
            >
              Fetch Pending Orders
            </button>
          </div>

          <div>
            <h3 className="font-semibold mb-2">4. Search Orders by Email</h3>
            <input
              type="email"
              placeholder="Enter email to search"
              className="px-4 py-2 border border-[var(--border)] rounded mr-2"
              id="searchEmail"
            />
            <button
              onClick={() => {
                const email = (
                  document.getElementById('searchEmail') as HTMLInputElement
                )?.value;
                if (email) searchOrders(email);
              }}
              className="bg-[var(--success)] text-white px-4 py-2 rounded hover:bg-[var(--success)]"
            >
              Search
            </button>
          </div>

          <div>
            <h3 className="font-semibold mb-2">5. Get Order by Number</h3>
            <input
              type="text"
              placeholder="Enter order number (e.g., ABC1234)"
              className="px-4 py-2 border border-[var(--border)] rounded mr-2"
              id="orderNumber"
            />
            <button
              onClick={() => {
                const orderNum = (
                  document.getElementById('orderNumber') as HTMLInputElement
                )?.value;
                if (orderNum) getOrderByNumber(orderNum);
              }}
              className="bg-[var(--success)] text-white px-4 py-2 rounded hover:bg-[var(--success)]"
            >
              Get Order
            </button>
          </div>

          <div>
            <h3 className="font-semibold mb-2">6. Get Order Details by ID</h3>
            <input
              type="text"
              placeholder="Enter order ID"
              className="px-4 py-2 border border-[var(--border)] rounded mr-2"
              id="orderId"
            />
            <button
              onClick={() => {
                const id = (document.getElementById('orderId') as HTMLInputElement)
                  ?.value;
                if (id) getOrderDetails(id);
              }}
              className="bg-[var(--success)] text-white px-4 py-2 rounded hover:bg-[var(--success)]"
            >
              Get Details
            </button>
          </div>
        </div>
      </div>

      {/* Code Examples */}
      <div className="mt-12 p-6 bg-[var(--info-soft)] rounded-lg">
        <h2 className="text-2xl font-bold mb-4">Code Examples</h2>
        <pre className="bg-[var(--ink)] text-[var(--success)] p-4 rounded overflow-x-auto text-sm">
{`// Method 1: Get all recent orders
const { data: orders } = await supabaseHelpers.getRecentOrders(20);

// Method 2: Get customer orders
const { data: customerOrders } = await supabaseHelpers.getOrders(customerId);

// Method 3: Get restaurant orders
const { data: businessOrders } = await supabaseHelpers.getBusinessOrders(restaurantId);

// Method 4: Get pending orders for business
const { data: pending } = await supabaseHelpers.getPendingOrders(restaurantId);

// Method 5: Get orders with filters
const { data: filtered } = await supabaseHelpers.getAllOrders({
  restaurantId: 'uuid',
  status: 'pending'
});

// Method 6: Search orders by email
const { data: results } = await supabaseHelpers.searchOrdersByCustomerEmail('john@example.com');

// Method 7: Get order by ID
const { data: order } = await supabaseHelpers.getOrderById(orderId);

// Method 8: Get order by number
const { data: order } = await supabaseHelpers.getOrderByNumber('ABC1234');`}
        </pre>
      </div>
    </div>
  );
}

