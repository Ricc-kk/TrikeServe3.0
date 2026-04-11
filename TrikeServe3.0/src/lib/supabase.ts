import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[Supabase Init] Checking environment variables...');
console.log('[Supabase Init] VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('[Supabase Init] VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');

// Check if credentials are configured
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  const errorMsg =
    `\n\n❌ SUPABASE CONFIGURATION ERROR\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Missing environment variables: ${missing.join(', ')}\n\n` +
    `How to fix:\n` +
    `1. Open the file: .env.local (in project root)\n` +
    `2. Make sure it contains:\n` +
    `   VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co\n` +
    `   VITE_SUPABASE_ANON_KEY=your_actual_key_here\n\n` +
    `3. Get the key from: Supabase Dashboard → Settings → API\n` +
    `4. STOP the dev server (Ctrl+C)\n` +
    `5. DELETE the .vite cache folder in node_modules\n` +
    `6. RESTART with: npm run dev\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  console.error(errorMsg);
  throw new Error(`Missing Supabase credentials: ${missing.join(', ')}`);
}

console.log('[Supabase Init] ✅ All credentials loaded successfully');

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);

// Helper functions for common operations
export const supabaseHelpers = {
  // User operations
  async getUserById(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    return { data, error };
  },

  async getUserByEmail(email: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    return { data, error };
  },

  async createUser(user: any) {
    const { data, error } = await supabase
      .from('users')
      .insert([user])
      .select()
      .single();
    return { data, error };
  },

  async updateUser(userId: string, updates: any) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    return { data, error };
  },

  // Ride operations
  async createRideRequest(rideRequest: any) {
    const { data, error } = await supabase
      .from('ride_requests')
      .insert([rideRequest])
      .select()
      .single();
    return { data, error };
  },

  async getRideRequests(filters?: any) {
    let query = supabase.from('ride_requests').select('*');

    if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters?.driverId) query = query.eq('driver_id', filters.driverId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  async getRideRequest(rideId: string) {
    const { data, error } = await supabase
      .from('ride_requests')
      .select('*')
      .eq('id', rideId)
      .single();
    return { data, error };
  },

  // Database-driven status updates for customer notifications
  async updateRideStatus(rideId: string, status: string, statusDetails?: any) {
    const timestamp = new Date().toISOString();
    const updateData: any = {
      status,
      updated_at: timestamp,
      ...statusDetails
    };

    const { data, error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', rideId)
      .select()
      .single();

    return { data, error };
  },

  // Store accepted request in database
  async acceptRideRequest(rideId: string, driverId: string, driverName: string, driverPhoto?: string) {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('ride_requests')
      .update({
        driver_id: driverId,
        driver_name: driverName,
        driver_photo: driverPhoto,
        status: 'accepted',
        accepted_at: timestamp,
        accepted_driver_id: driverId,
        updated_at: timestamp
      })
      .eq('id', rideId)
      .select()
      .single();

    return { data, error };
  },

  // Update driver's current status for the ride
  async updateDriverRideStatus(rideId: string, driverStatus: string, statusMessage?: string) {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('ride_requests')
      .update({
        driver_status: driverStatus,
        driver_status_message: statusMessage,
        driver_status_updated_at: timestamp,
        updated_at: timestamp
      })
      .eq('id', rideId)
      .select()
      .single();

    return { data, error };
  },

  async updateRideRequest(rideId: string, updates: any) {
    const { data, error } = await supabase
      .from('ride_requests')
      .update(updates)
      .eq('id', rideId)
      .select()
      .single();
    return { data, error };
  },

  // Shared ride lobby operations
  async createLobby(lobby: any) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .insert([lobby])
      .select()
      .single();
    return { data, error };
  },

  async getLobbyById(lobbyId: string) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('id', lobbyId)
      .single();
    return { data, error };
  },

  async getLobbies(filters?: any) {
    let query = supabase.from('shared_ride_lobbies').select('*');

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.pickupLocation) query = query.eq('pickup_location', filters.pickupLocation);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  async updateLobby(lobbyId: string, updates: any) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update(updates)
      .eq('id', lobbyId)
      .select()
      .single();
    return { data, error };
  },

  // Message operations
  async saveMessage(message: any) {
    const { data, error } = await supabase
      .from('messages')
      .insert([message])
      .select()
      .single();
    return { data, error };
  },

  async getMessages(senderId: string, receiverId: string) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
      .order('created_at', { ascending: true });
    return { data, error };
  },

  async markMessageAsRead(messageId: string) {
    const { data, error } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('id', messageId)
      .select()
      .single();
    return { data, error };
  },

  // Order operations
  async createOrder(order: any) {
    const { data, error } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single();
    return { data, error };
  },

  async getOrders(customerId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  // Get all orders with filters
  async getAllOrders(filters?: any) {
    let query = supabase.from('orders').select('*');

    if (filters?.restaurantId) query = query.eq('restaurant_id', filters.restaurantId);
    if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.orderNumber) query = query.eq('order_number', filters.orderNumber);
    if (filters?.customerEmail) query = query.eq('customer_email', filters.customerEmail);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  // Get order by ID
  async getOrderById(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    return { data, error };
  },

  // Get order by order number
  async getOrderByNumber(orderNumber: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();
    return { data, error };
  },

  // Get business orders (orders for a specific restaurant)
  async getBusinessOrders(restaurantId: string, filters?: any) {
    let query = supabase.from('orders').select('*').eq('restaurant_id', restaurantId);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.startDate) query = query.gte('created_at', filters.startDate);
    if (filters?.endDate) query = query.lte('created_at', filters.endDate);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  // Get pending orders for a business
  async getPendingOrders(restaurantId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['pending', 'preparing', 'ready', 'on-the-way'])
      .order('created_at', { ascending: true });
    return { data, error };
  },

  // Search orders by customer email
  async searchOrdersByCustomerEmail(customerEmail: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('customer_email', `%${customerEmail}%`)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  // Get recent orders (last N orders)
  async getRecentOrders(limit: number = 10) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return { data, error };
  },

  async updateOrder(orderId: string, updates: any) {
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();
    return { data, error };
  },

  // Delete order
  async deleteOrder(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);
    return { data, error };
  },

  // File uploads
  async uploadProfilePhoto(userId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/profile.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('user_profiles')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('user_profiles')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  async uploadRestaurantImage(restaurantId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${restaurantId}/image.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('restaurants')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('restaurants')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  // Order Processing Operations
  async createOrderProcessing(processing: any) {
    const { data, error } = await supabase
      .from('order_processing')
      .insert([processing])
      .select()
      .single();
    return { data, error };
  },

  async getOrderProcessing(orderId: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('order_id', orderId)
      .single();
    return { data, error };
  },

  async getRestaurantProcessing(restaurantId: string, filters?: any) {
    let query = supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId);

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.startDate) query = query.gte('created_at', filters.startDate);
    if (filters?.endDate) query = query.lte('created_at', filters.endDate);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  async updateOrderProcessingStatus(orderId: string, status: string, updates?: any) {
    const timestamp = new Date().toISOString();
    const statusUpdateMap: { [key: string]: string } = {
      'received': 'received_at',
      'confirmed': 'confirmed_at',
      'preparing': 'preparing_started_at',
      'quality_check': 'quality_check_at',
      'ready': 'ready_at',
      'assigned_rider': 'rider_assigned_at',
      'on_the_way': 'delivery_started_at',
      'delivered': 'delivered_at',
      'completed': 'completed_at',
      'cancelled': 'cancelled_at',
    };

    const updateData: any = {
      status,
      updated_at: timestamp,
      ...updates,
    };

    // Auto-set timestamp field for this status
    const timestampField = statusUpdateMap[status];
    if (timestampField) {
      updateData[timestampField] = timestamp;
    }

    const { data, error } = await supabase
      .from('order_processing')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();

    return { data, error };
  },

  async getProcessingByStatus(restaurantId: string, status: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', status)
      .order('created_at', { ascending: true });

    return { data, error };
  },

  async getActiveProcessing(restaurantId: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['received', 'confirmed', 'preparing', 'quality_check', 'ready', 'assigned_rider', 'on_the_way'])
      .order('created_at', { ascending: true });

    return { data, error };
  },

  async getProcessingHistory(restaurantId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('order_processing')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .in('status', ['delivered', 'completed', 'cancelled'])
      .order('completed_at', { ascending: false })
      .limit(limit);

    return { data, error };
  },

  async assignRiderToOrder(orderId: string, riderId: string, riderName: string) {
    const { data, error } = await supabase
      .from('order_processing')
      .update({
        assigned_rider_id: riderId,
        assigned_rider_name: riderName,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .select()
      .single();

    return { data, error };
  },

  async recordQualityCheck(orderId: string, passed: boolean, issues?: any) {
    const { data, error } = await supabase
      .from('order_processing')
      .update({
        qa_passed: passed,
        quality_issues: issues || null,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .select()
      .single();

    return { data, error };
  },

  async getProcessingStats(restaurantId: string, dateRange?: { start: string; end: string }) {
    let query = supabase
      .from('order_processing')
      .select('*', { count: 'exact' })
      .eq('restaurant_id', restaurantId);

    if (dateRange?.start) query = query.gte('created_at', dateRange.start);
    if (dateRange?.end) query = query.lte('created_at', dateRange.end);

    const { data, error, count } = await query;

    if (error) return { data: null, error };

    // Calculate statistics
    const stats = {
      totalOrders: count,
      completed: data?.filter(p => p.status === 'completed').length || 0,
      cancelled: data?.filter(p => p.status === 'cancelled').length || 0,
      averagePrepTime: 0,
      qualityIssues: data?.filter(p => !p.qa_passed).length || 0,
    };

    // Calculate average prep time
    const completedWithTime = data?.filter(p => p.actual_prep_time) || [];
    if (completedWithTime.length > 0) {
      const totalTime = completedWithTime.reduce((sum: number, p: any) => sum + (p.actual_prep_time || 0), 0);
      stats.averagePrepTime = Math.round(totalTime / completedWithTime.length);
    }

    return { data: stats, error: null };
  },
};

