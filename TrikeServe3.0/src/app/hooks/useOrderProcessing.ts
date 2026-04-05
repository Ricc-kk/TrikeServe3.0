// Enhanced BusinessOrders Component - with Processing Integration
// This shows how to integrate the order processing system

import { useState, useEffect } from "react";
import { supabaseHelpers } from "@/lib/supabase";

interface OrderWithProcessing {
  order: any;
  processing: any;
}

export function useOrderProcessing(restaurantId: string) {
  const [activeOrders, setActiveOrders] = useState<OrderWithProcessing[]>([]);
  const [processingHistory, setProcessingHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Load active processing orders
  const loadActiveOrders = async () => {
    setLoading(true);
    try {
      const { data: processing, error } = await supabaseHelpers.getActiveProcessing(restaurantId);

      if (error) {
        console.error('[OrderProcessing] Error loading active orders:', error);
        return;
      }

      console.log('[OrderProcessing] Loaded active orders:', processing?.length);
      setActiveOrders(processing || []);
    } catch (error) {
      console.error('[OrderProcessing] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load processing history
  const loadProcessingHistory = async () => {
    try {
      const { data: history, error } = await supabaseHelpers.getProcessingHistory(restaurantId, 50);

      if (error) {
        console.error('[OrderProcessing] Error loading history:', error);
        return;
      }

      console.log('[OrderProcessing] Loaded history:', history?.length);
      setProcessingHistory(history || []);
    } catch (error) {
      console.error('[OrderProcessing] Error:', error);
    }
  };

  // Load statistics
  const loadStats = async () => {
    try {
      const { data: statistics, error } = await supabaseHelpers.getProcessingStats(restaurantId);

      if (error) {
        console.error('[OrderProcessing] Error loading stats:', error);
        return;
      }

      console.log('[OrderProcessing] Stats:', statistics);
      setStats(statistics);
    } catch (error) {
      console.error('[OrderProcessing] Error:', error);
    }
  };

  // Update order status with processing
  const updateOrderProcessing = async (orderId: string, status: string) => {
    try {
      console.log('[OrderProcessing] Updating status to:', status);

      const { data, error } = await supabaseHelpers.updateOrderProcessingStatus(orderId, status);

      if (error) {
        console.error('[OrderProcessing] Error updating status:', error);
        return;
      }

      console.log('[OrderProcessing] Status updated:', data);

      // Reload active orders
      await loadActiveOrders();
      await loadStats();
    } catch (error) {
      console.error('[OrderProcessing] Error:', error);
    }
  };

  // Assign rider to order
  const assignRider = async (orderId: string, riderId: string, riderName: string) => {
    try {
      console.log('[OrderProcessing] Assigning rider:', riderName);

      const { data, error } = await supabaseHelpers.assignRiderToOrder(orderId, riderId, riderName);

      if (error) {
        console.error('[OrderProcessing] Error assigning rider:', error);
        return;
      }

      console.log('[OrderProcessing] Rider assigned:', data);

      // Update status to assigned_rider
      await updateOrderProcessing(orderId, 'assigned_rider');
    } catch (error) {
      console.error('[OrderProcessing] Error:', error);
    }
  };

  // Record quality check
  const recordQualityCheck = async (orderId: string, passed: boolean, issues?: any) => {
    try {
      console.log('[OrderProcessing] Recording QA:', passed ? 'PASSED' : 'FAILED');

      const { data, error } = await supabaseHelpers.recordQualityCheck(orderId, passed, issues);

      if (error) {
        console.error('[OrderProcessing] Error recording QA:', error);
        return;
      }

      console.log('[OrderProcessing] QA recorded:', data);

      if (passed) {
        // Update status to ready
        await updateOrderProcessing(orderId, 'ready');
      }
    } catch (error) {
      console.error('[OrderProcessing] Error:', error);
    }
  };

  // Get timeline for order
  const getOrderTimeline = (processing: any) => {
    const timeline = [
      { status: 'received', time: processing.received_at, label: 'Received' },
      { status: 'confirmed', time: processing.confirmed_at, label: 'Confirmed' },
      { status: 'preparing', time: processing.preparing_started_at, label: 'Preparing' },
      { status: 'quality_check', time: processing.quality_check_at, label: 'QA Check' },
      { status: 'ready', time: processing.ready_at, label: 'Ready' },
      { status: 'on_the_way', time: processing.delivery_started_at, label: 'On the Way' },
      { status: 'delivered', time: processing.delivered_at, label: 'Delivered' },
    ];

    return timeline.filter(t => t.time); // Only show completed steps
  };

  // Calculate elapsed time
  const getElapsedTime = (from: string, to?: string) => {
    if (!from) return null;

    const startTime = new Date(from).getTime();
    const endTime = to ? new Date(to).getTime() : Date.now();
    const minutes = Math.round((endTime - startTime) / 60000);

    return minutes;
  };

  // Setup polling
  useEffect(() => {
    loadActiveOrders();
    loadProcessingHistory();
    loadStats();

    // Poll every 3 seconds
    const interval = setInterval(() => {
      loadActiveOrders();
    }, 3000);

    return () => clearInterval(interval);
  }, [restaurantId]);

  return {
    activeOrders,
    processingHistory,
    stats,
    loading,
    loadActiveOrders,
    loadProcessingHistory,
    loadStats,
    updateOrderProcessing,
    assignRider,
    recordQualityCheck,
    getOrderTimeline,
    getElapsedTime,
  };
}

// Usage example in component:
/*
export default function EnhancedBusinessOrders() {
  const {
    activeOrders,
    stats,
    updateOrderProcessing,
    recordQualityCheck,
    getOrderTimeline,
    getElapsedTime,
  } = useOrderProcessing(restaurantId);

  return (
    <div>
      <h2>Active Orders: {activeOrders.length}</h2>
      <p>Average Prep Time: {stats?.averagePrepTime} minutes</p>
      <p>Total Completed: {stats?.completed}</p>
      <p>Quality Issues: {stats?.qualityIssues}</p>

      {activeOrders.map((order) => (
        <div key={order.id}>
          <h3>Order #{order.order_number}</h3>
          <p>Status: {order.status}</p>
          <p>Prep Time: {getElapsedTime(order.preparing_started_at, order.ready_at)} min</p>

          <div>
            <button onClick={() => updateOrderProcessing(order.id, 'confirmed')}>
              Confirm
            </button>
            <button onClick={() => updateOrderProcessing(order.id, 'preparing')}>
              Start Preparing
            </button>
            <button onClick={() => recordQualityCheck(order.id, true)}>
              QA Passed
            </button>
          </div>

          {/* Timeline */}
          <div>
            {getOrderTimeline(order).map((step, idx) => (
              <div key={idx}>
                ✓ {step.label} - {new Date(step.time).toLocaleTimeString()}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
*/

