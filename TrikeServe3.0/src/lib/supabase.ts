import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Support both legacy and current env var names for the client key.
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

console.log('[Supabase Init] Checking environment variables...');
console.log('[Supabase Init] VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('[Supabase Init] VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
console.log(
  '[Supabase Init] VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY:',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ? '✅ Set' : '❌ Missing'
);

// Check if credentials are configured
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY');

  const errorMsg =
    `\n\n❌ SUPABASE CONFIGURATION ERROR\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Missing environment variables: ${missing.join(', ')}\n\n` +
    `How to fix:\n` +
    `1. Open the file: .env.local (in project root)\n` +
    `2. Make sure it contains:\n` +
    `   VITE_SUPABASE_URL=https://azmzuucnfqqymnunntmw.supabase.co\n` +
    `   VITE_SUPABASE_ANON_KEY=your_actual_key_here\n` +
    `   # OR\n` +
    `   VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_actual_key_here\n\n` +
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

// Extract a safe file extension (fallback 'jpg') so weird filenames can't break the storage path
function safeFileExtension(file: File): string {
  const raw = file.name.split('.').pop() || '';
  return /^[a-zA-Z0-9]{1,10}$/.test(raw) ? raw.toLowerCase() : 'jpg';
}

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
    const normalizedEmail = email.toLowerCase().trim();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (data && !error) {
      return { data, error: null };
    }

    try {
      const localUsersJson = localStorage.getItem('trikeserve_users');
      const localUsers: any[] = localUsersJson ? JSON.parse(localUsersJson) : [];
      const localUser = localUsers.find((u) => (u.email || '').toLowerCase() === normalizedEmail);

      if (localUser) {
        return {
          data: {
            ...localUser,
            role: localUser.role || 'customer',
            is_verified: localUser.is_verified ?? localUser.isVerified ?? true,
            created_at: localUser.created_at || localUser.createdAt || new Date().toISOString(),
          },
          error: null,
        };
      }
    } catch (localError) {
      console.warn('[supabaseHelpers.getUserByEmail] Local user lookup failed:', localError);
    }

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
  async acceptRideRequest(rideId: string, driverId: string, driverName: string, driverPhoto?: string, driverPlate?: string, driverRating?: string) {
    const timestamp = new Date().toISOString();

    // DEBUG: Log what we're about to update
    console.log('📤 acceptRideRequest DEBUG LOG:');
    console.log('   Ride ID:', rideId);
    console.log('   Driver ID:', driverId);
    console.log('   Driver Name:', driverName);
    console.log('   Driver Photo:', driverPhoto);
    console.log('   Driver Plate:', driverPlate, '(will be:', (driverPlate || 'N/A'), ')');
    console.log('   Driver Rating:', driverRating, '(will be:', (driverRating || '4.8'), ')');

    const updateData = {
      driver_id: driverId,
      driver_name: driverName,
      driver_photo: driverPhoto,
      driver_plate: driverPlate || 'N/A',
      driver_rating: driverRating || '4.8',
      status: 'accepted',
      accepted_at: timestamp,
      accepted_driver_id: driverId,
      updated_at: timestamp
    };

    console.log('📝 Update object:', updateData);

    const { data, error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', rideId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating ride_requests:', error);
    } else {
      console.log('✅ Successfully updated ride_requests:', data);
    }

    return { data, error };
  },

  // Atomically claim a pending ride for a driver (fails if already claimed).
  // Guards on status='pending' and driver_id IS NULL so two drivers can't accept the same request.
  async claimRideRequest(rideId: string, driverId: string, driverName: string, driverPhoto?: string, driverPlate?: string, driverRating?: string) {
    const timestamp = new Date().toISOString();

    const updateData = {
      driver_id: driverId,
      driver_name: driverName,
      driver_photo: driverPhoto || null,
      driver_plate: driverPlate || 'N/A',
      driver_rating: driverRating || '4.8',
      status: 'accepted',
      accepted_at: timestamp,
      accepted_driver_id: driverId,
      updated_at: timestamp
    };

    const { data, error } = await supabase
      .from('ride_requests')
      .update(updateData)
      .eq('id', rideId)
      .eq('status', 'pending')
      .is('driver_id', null)
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

  // Enhanced Shared Ride Lobby Operations
  async getAvailableLobbyByRoute(pickupAddr: string, dropoffAddr: string) {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('status', 'waiting')
      .eq('pickup_address', pickupAddr)
      .eq('dropoff_address', dropoffAddr)
      .gt('max_seats', 0)
      .order('created_at', { ascending: true })
      .limit(1);

    return { data: data?.[0] || null, error };
  },

  async getAvailableLobbies(dropoffAddr?: string, pickupAddr?: string) {
    let query = supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('status', 'waiting');

    if (pickupAddr) {
      query = query.eq('pickup_address', pickupAddr);
    }

    if (dropoffAddr) {
      query = query.eq('dropoff_address', dropoffAddr);
    }

    const { data, error } = await query
      .order('created_at', { ascending: true });

    return { data, error };
  },

  async getWaitingLobbiesForDriver() {
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    return { data, error };
  },

  async createShareRideLobby(lobby: any) {
    const timestamp = new Date().toISOString();
    const lobbyData = {
      ...lobby,
      passengers_json: lobby.passengers_json ?? lobby.passengers ?? [],
      created_at: timestamp,
      updated_at: timestamp
    };

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .insert([lobbyData])
      .select()
      .single();

    return { data, error };
  },

  async joinShareRideLobby(lobbyId: string, passenger: any) {
    // First get the current lobby
    const { data: lobby, error: fetchError } = await supabase
      .from('shared_ride_lobbies')
      .select('*')
      .eq('id', lobbyId)
      .single();

    if (fetchError) return { data: null, error: fetchError };
    if (!lobby) return { data: null, error: new Error('Lobby not found') };

    // Parse passengers
    let passengers = [];
    try {
      passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : JSON.parse(lobby.passengers_json || '[]');
    } catch (e) {
      passengers = [];
    }

    // Check if passenger already in lobby
    if (passengers.some((p: any) => p.id === passenger.id)) {
      return { data: lobby, error: null };
    }

    // Check capacity
    if (passengers.length >= lobby.max_seats) {
      return { data: null, error: new Error('Lobby is full') };
    }

    // Add passenger
    passengers.push(passenger);
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        passengers_json: passengers,
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

   async leaveShareRideLobby(lobbyId: string, passengerId: string) {
     console.log(`🚪 LEAVE LOBBY: lobbyId=${lobbyId}, passengerId=${passengerId}`);

     try {
       // First get the current lobby
       const { data: lobby, error: fetchError } = await supabase
         .from('shared_ride_lobbies')
         .select('*')
         .eq('id', lobbyId)
         .single();

       if (fetchError) {
         console.error('❌ Error fetching lobby:', fetchError);
         return { data: null, error: fetchError };
       }

       if (!lobby) {
         console.error('❌ Lobby not found:', lobbyId);
         return { data: null, error: new Error('Lobby not found') };
       }

       console.log('✅ Lobby found:', { id: lobbyId, status: lobby.status });

       // Parse passengers
       let passengers = [];
       try {
         passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : JSON.parse(lobby.passengers_json || '[]');
       } catch (e) {
         console.warn('⚠️ Error parsing passengers:', e);
         passengers = [];
       }

       console.log(`👥 Current passengers (${passengers.length}):`, passengers.map((p: any) => p.id));

       // Remove passenger and companions (companions have ID like "userId_companion_1")
       const updatedPassengers = passengers.filter((p: any) => {
         const isMainPassenger = p.id === passengerId;
         const isCompanion = p.id.startsWith(`${passengerId}_companion_`);
         const shouldKeep = !isMainPassenger && !isCompanion;

         if (!shouldKeep) {
           console.log(`  🚶 Removing passenger: ${p.id}`);
         }

         return shouldKeep;
       });

       console.log(`👥 Updated passengers (${updatedPassengers.length}):`, updatedPassengers.map((p: any) => p.id));

       const timestamp = new Date().toISOString();

        const isHostCancelling = lobby.customer_id === passengerId;

        // If the host cancels, or if no passengers are left, mark the lobby as cancelled.
        if (isHostCancelling || updatedPassengers.length === 0) {
          console.log(isHostCancelling ? '🛑 Host is cancelling the lobby' : '🗑️ Lobby is now empty, marking as cancelled');
         const { data, error } = await supabase
           .from('shared_ride_lobbies')
           .update({
             status: 'cancelled',
             passengers_json: [],
             updated_at: timestamp
           })
           .eq('id', lobbyId)
           .select()
           .single();

         if (error) {
           console.error('❌ Error marking lobby as cancelled:', error);
           return { data: null, error };
         }

         console.log('✅ Lobby marked as cancelled');
         return { data, error };
       }

       // Update lobby with remaining passengers
       console.log('📝 Updating lobby with remaining passengers');
       const { data, error } = await supabase
         .from('shared_ride_lobbies')
         .update({
           passengers_json: updatedPassengers,
           updated_at: timestamp
         })
         .eq('id', lobbyId)
         .select()
         .single();

       if (error) {
         console.error('❌ Error updating lobby:', error);
         return { data: null, error };
       }

       console.log('✅ Successfully left lobby');
       return { data, error };
     } catch (err) {
       console.error('❌ Unexpected error in leaveShareRideLobby:', err);
       return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
     }
   },

  async acceptLobbyAsDriver(lobbyId: string, driverId: string, driverName: string, driverPlate?: string, driverRating?: string) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        driver_id: driverId,
        driver_name: driverName,
        driver_plate: driverPlate || null,
        driver_rating: driverRating || '4.8',
        status: 'driver_found',
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  async updateLobbyPassengers(lobbyId: string, passengers: any[]) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        passengers_json: passengers,
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  async startLobbyRide(lobbyId: string) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        status: 'in_progress',
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  // Track the driver's progress on a shared-ride lobby so customers in the
  // lobby see the same status popups they get for private rides.
  async updateLobbyDriverStatus(lobbyId: string, driverStatus: string, statusMessage?: string) {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        driver_status: driverStatus,
        driver_status_message: statusMessage,
        driver_status_updated_at: timestamp,
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  async completeLobbyRide(lobbyId: string) {
    const timestamp = new Date().toISOString();

    const { data, error } = await supabase
      .from('shared_ride_lobbies')
      .update({
        status: 'completed',
        updated_at: timestamp
      })
      .eq('id', lobbyId)
      .select()
      .single();

    return { data, error };
  },

  // Complete a shared ride: close the lobby AND record it as a completed
  // ride_requests row so it appears in the driver's recent trips/earnings
  // (queried by driver_id + status='completed') and in the host customer's
  // activity log (queried by customer_id + status='completed').
  async completeSharedRide(lobbyId: string, details: {
    customerId?: string;
    driverId?: string;
    driverName?: string;
    driverRating?: string;
    pickup: string;
    dropoff: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    pickupLat?: number | null;
    pickupLng?: number | null;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    amount: number;
    passengerCount?: number;
    paymentMethod?: 'COD' | 'GCASH';
  }) {
    const timestamp = new Date().toISOString();

    // 1) Close the lobby so it stops showing as active for everyone.
    const lobbyResult = await this.completeLobbyRide(lobbyId);

    // 2) Record the completed shared ride in ride_requests. ride_requests
    //    requires a customer_id (NOT NULL + FK), so skip the insert when we
    //    don't have one and just close the lobby.
    if (!details.customerId) {
      console.warn('[supabaseHelpers.completeSharedRide] No customer id — lobby closed but ride not recorded.');
      return { lobby: lobbyResult, ride: { data: null, error: null } };
    }

    const rideResult = await supabase
      .from('ride_requests')
      .insert([{
        customer_id: details.customerId,
        driver_id: details.driverId || null,
        pickup_location: details.pickup,
        dropoff_location: details.dropoff,
        pickup_address: details.pickupAddress || null,
        dropoff_address: details.dropoffAddress || null,
        pickup_lat: details.pickupLat ?? null,
        pickup_lng: details.pickupLng ?? null,
        dropoff_lat: details.dropoffLat ?? null,
        dropoff_lng: details.dropoffLng ?? null,
        status: 'completed',
        ride_type: 'share',
        payment_method: details.paymentMethod || 'GCASH',
        amount: details.amount,
        passenger_count: details.passengerCount || 1,
        driver_name: details.driverName || null,
        driver_rating: details.driverRating || '4.8',
        created_at: timestamp,
        updated_at: timestamp,
      }])
      .select()
      .single();

    return { lobby: lobbyResult, ride: rideResult };
  },

   subscribeLobbyUpdates(lobbyId: string, callback: (data: any) => Promise<void> | void) {
     console.log(`📡 Setting up real-time subscription for lobby: ${lobbyId}`);

     const channel = supabase
       .channel(`lobby_${lobbyId}`)
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'shared_ride_lobbies',
           filter: `id=eq.${lobbyId}`
         },
         async (payload) => {
           console.log('🔄 🔄 🔄 REAL-TIME UPDATE RECEIVED 🔄 🔄 🔄', {
             event: payload.eventType,
             table: payload.table,
             lobbyId: payload.new?.id,
             newData: payload.new
           });

           try {
             // Call the callback with the new data
             // The callback can be async, so we await it
             await Promise.resolve(callback(payload.new));
           } catch (err) {
             console.error('❌ Error processing lobby update callback:', err);
           }
         }
       )
       .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
           console.log(`✅ Real-time subscription ACTIVE for lobby: ${lobbyId}`);
         } else if (status === 'CHANNEL_ERROR') {
           console.error(`❌ Subscription ERROR for lobby: ${lobbyId}`);
         } else if (status === 'CLOSED') {
           console.warn(`⚠️ Subscription CLOSED for lobby: ${lobbyId}`);
         }
       });

     // Return unsubscribe function
     return () => {
       console.log(`🛑 Unsubscribing from lobby: ${lobbyId}`);
       supabase.removeChannel(channel);
     };
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

  // Chat operations
  async getChatConversationByThreadKey(threadKey: string) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('thread_key', threadKey)
      .single();
    return { data, error };
  },

  async getChatConversationById(conversationId: string) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();
    return { data, error };
  },

  async ensureChatConversation(conversation: {
    threadKey: string;
    threadType?: string;
    contextType?: string | null;
    contextId?: string | null;
    participantAId: string;
    participantBId: string;
    participantARole: string;
    participantBRole: string;
    participantAName?: string;
    participantBName?: string;
    participantAAvatar?: string;
    participantBAvatar?: string;
    subject?: string | null;
  }) {
    const existing = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('thread_key', conversation.threadKey)
      .maybeSingle();

    if (existing.data) {
      return { data: existing.data, error: existing.error };
    }

    const { data, error } = await supabase
      .from('chat_conversations')
      .insert([{
        thread_key: conversation.threadKey,
        thread_type: conversation.threadType || 'direct',
        context_type: conversation.contextType || null,
        context_id: conversation.contextId || null,
        participant_a_id: conversation.participantAId,
        participant_b_id: conversation.participantBId,
        participant_a_role: conversation.participantARole,
        participant_b_role: conversation.participantBRole,
        participant_a_name: conversation.participantAName || null,
        participant_b_name: conversation.participantBName || null,
        participant_a_avatar: conversation.participantAAvatar || null,
        participant_b_avatar: conversation.participantBAvatar || null,
        subject: conversation.subject || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    return { data, error };
  },

  async getChatConversations(userId: string) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(`participant_a_id.eq.${userId},participant_b_id.eq.${userId}`)
      .order('updated_at', { ascending: false });
    return { data, error };
  },

  async getChatMessages(conversationId: string) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    return { data, error };
  },

  async sendChatMessage(message: {
    conversationId: string;
    senderId: string;
    receiverId: string;
    senderName: string;
    senderRole: string;
    receiverRole: string;
    message: string;
  }) {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        receiver_id: message.receiverId,
        sender_name: message.senderName,
        sender_role: message.senderRole,
        receiver_role: message.receiverRole,
        message: message.message,
        read: false,
        created_at: timestamp,
        updated_at: timestamp,
      }])
      .select()
      .single();

    if (!error) {
      const { data: conversation } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('id', message.conversationId)
        .single();

      if (conversation) {
        const isParticipantA = conversation.participant_a_id === message.senderId;
        const unreadA = isParticipantA ? (conversation.unread_count_a || 0) : (conversation.unread_count_a || 0) + 1;
        const unreadB = !isParticipantA ? (conversation.unread_count_b || 0) : (conversation.unread_count_b || 0) + 1;

        await supabase
          .from('chat_conversations')
          .update({
            last_message_preview: message.message,
            last_message_sender_id: message.senderId,
            last_message_at: timestamp,
            unread_count_a: isParticipantA ? unreadA : unreadA,
            unread_count_b: isParticipantA ? unreadB : unreadB,
            updated_at: timestamp,
          })
          .eq('id', message.conversationId);
      }
    }

    return { data, error };
  },

  async markChatConversationRead(conversationId: string, userId: string) {
    const timestamp = new Date().toISOString();
    const { data: conversation } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    const { data, error } = await supabase
      .from('chat_messages')
      .update({ read: true, read_at: timestamp, updated_at: timestamp })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .eq('read', false)
      .select();

    if (conversation) {
      const isParticipantA = conversation.participant_a_id === userId;
      await supabase
        .from('chat_conversations')
        .update({
          unread_count_a: isParticipantA ? 0 : conversation.unread_count_a || 0,
          unread_count_b: isParticipantA ? conversation.unread_count_b || 0 : 0,
          updated_at: timestamp,
        })
        .eq('id', conversationId);
    }

    return { data, error };
  },

  async getUnreadChatCount(userId: string) {
    const { data, error, count } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .eq('receiver_id', userId)
      .eq('read', false);

    return { count, data, error };
  },

  subscribeToChatConversation(conversationId: string, callback: (data: any) => void) {
    const channel = supabase
      .channel(`chat_conversation_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => callback(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  subscribeToUserChatThreads(userId: string, callback: () => void) {
    const channel = supabase
      .channel(`chat_threads_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `participant_a_id=eq.${userId}`,
        },
        () => callback()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
          filter: `participant_b_id=eq.${userId}`,
        },
        () => callback()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
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

  // Update an order's delivery status using either the order ID or order number.
  // This keeps delivery requests and business/customer order views in sync.
  async updateDeliveryOrderStatus(orderId?: string, orderNumber?: string, status?: string) {
    const timestamp = new Date().toISOString();
    const payload = {
      status,
      updated_at: timestamp,
    };

    if (orderId) {
      const byId = await supabase
        .from('orders')
        .update(payload)
        .eq('id', orderId)
        .select()
        .single();

      if (byId.data || !orderNumber) {
        return byId;
      }
    }

    if (orderNumber) {
      const { data: order, error: lookupError } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderNumber)
        .single();

      if (lookupError || !order?.id) {
        return { data: null, error: lookupError || new Error('Order not found') };
      }

      return supabase
        .from('orders')
        .update(payload)
        .eq('id', order.id)
        .select()
        .single();
    }

    return { data: null, error: new Error('Missing order identifier') };
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

  async uploadRestaurantBanner(restaurantId: string, file: File) {
    const filePath = `${restaurantId}/banner.${safeFileExtension(file)}`;

    const { data, error } = await supabase.storage
      .from('restaurants')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('restaurants')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  async uploadRestaurantLogo(restaurantId: string, file: File) {
    const filePath = `${restaurantId}/logo.${safeFileExtension(file)}`;

    const { data, error } = await supabase.storage
      .from('restaurants')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('restaurants')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  async uploadMenuItemImage(menuItemId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${menuItemId}/image.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('menu_items')
      .upload(filePath, file, { upsert: true });

    if (error) return { data: null, error };

    const { data: publicUrlData } = supabase.storage
      .from('menu_items')
      .getPublicUrl(filePath);

    return { data: publicUrlData, error: null };
  },

  // Load the admin-set base delivery fee (admin_settings > rates > deliveryBaseFee)
  async getAdminDeliveryFee(): Promise<number> {
    const fallback = 35;
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'rates')
        .single();

      if (!error && data?.setting_value) {
        const parsed = JSON.parse(data.setting_value);
        if (typeof parsed?.deliveryBaseFee === 'number') return parsed.deliveryBaseFee;
      }
    } catch (e) {
      console.warn('[supabaseHelpers] Could not load admin delivery fee from Supabase:', e);
    }

    // Fallback to the localStorage backup of the admin rates
    try {
      const saved = localStorage.getItem('trikeserve_rates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.deliveryBaseFee === 'number') return parsed.deliveryBaseFee;
      }
    } catch (e) {
      console.warn('[supabaseHelpers] Could not load admin delivery fee from localStorage:', e);
    }

    return fallback;
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

  // Real-time subscription for driver status updates
  subscribeToRideUpdates(rideId: string, callback: (data: any) => void) {
    console.log(`📡 Setting up real-time subscription for ride: ${rideId}`);

    const channel = supabase
      .channel(`ride_${rideId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_requests',
          filter: `id=eq.${rideId}`
        },
        (payload) => {
          try {
            console.log('🔄 Real-time update received:', payload);
            // Some payloads (DELETE) may not include `new`. Prefer `new` then `record`.
            const record = payload?.new || payload?.record || null;
            if (!record) {
              console.warn('⚠️ Real-time payload had no record/new field:', payload);
              return;
            }
            callback(record);
          } catch (err) {
            console.error('❌ Error processing realtime payload for ride', rideId, err, payload);
          }
        }
      )
      .subscribe((statusOrEvent) => {
        // Status can be a string or an object depending on client version; log full value for debugging.
        console.log(`📡 subscribe() callback for ride ${rideId} - status:`, statusOrEvent);

        // Attempt to detect common error states
        try {
          const statusStr = typeof statusOrEvent === 'string' ? statusOrEvent : statusOrEvent?.status || statusOrEvent?.type;
          if (statusStr === 'SUBSCRIBED') {
            console.log(`✅ Real-time subscription active for ride: ${rideId}`);
          } else if (String(statusStr).toUpperCase().includes('CHANNEL_ERROR') || String(statusStr).toUpperCase().includes('ERROR')) {
            console.error(`❌ Subscription error for ride: ${rideId} - status:`, statusOrEvent);
          }
        } catch (err) {
          console.warn('⚠️ Unable to parse subscribe status for ride:', rideId, statusOrEvent, err);
        }
      });

    // Return unsubscribe function
    return () => {
      console.log(`🛑 Unsubscribing from ride: ${rideId}`);
      supabase.removeChannel(channel);
    };
  },

  // Subscribe to accepted rides (for driver acceptance in real-time)
  subscribeToAcceptedRides(customerId: string, callback: (data: any) => void) {
    console.log(`📡 Setting up real-time subscription for customer accepted rides: ${customerId}`);

    const channel = supabase
      .channel(`customer_${customerId}_rides`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ride_requests',
          filter: `customer_id=eq.${customerId}`
        },
        (payload) => {
          // Only notify if driver has been assigned
          if (payload.new.accepted_driver_id) {
            console.log('🎉 Driver accepted ride (real-time):', payload);
            callback(payload.new);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Real-time subscription active for customer: ${customerId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Subscription error for customer: ${customerId}`);
        }
      });

    return () => {
      console.log(`🛑 Unsubscribing from customer rides: ${customerId}`);
      supabase.removeChannel(channel);
    };
  },
};

