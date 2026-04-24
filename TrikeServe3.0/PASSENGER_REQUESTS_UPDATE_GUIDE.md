## PassengerRequests Component - Update Guide

### Summary of Changes Needed

The PassengerRequests component currently uses localStorage to manage shared ride lobbies. It needs to be updated to use the Supabase database instead.

---

## Key Changes

### 1. Remove localStorage Lobby Fetching

**BEFORE (OLD - localStorage)**:
```typescript
const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
if (!lobbiesData) return;
let lobbies = JSON.parse(lobbiesData);
const lobbyIndex = lobbies.findIndex((l: any) => l.id === request.lobbyId);
```

**AFTER (NEW - Supabase)**:
```typescript
const { data: lobby, error } = await supabaseHelpers.getLobbyById(request.lobbyId);
if (!lobby || error) return;
```

---

### 2. Update Driver Acceptance Logic

**BEFORE (OLD)**:
```typescript
// If it's a shared ride lobby, update lobby status
if (request.lobbyId) {
  const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
  if (lobbiesData) {
    try {
      let lobbies = JSON.parse(lobbiesData);
      const lobbyIndex = lobbies.findIndex((l: any) => l.id === request.lobbyId);
      
      if (lobbyIndex >= 0) {
        lobbies[lobbyIndex].status = 'driver-found';
        lobbies[lobbyIndex].driverName = user?.name;
        lobbies[lobbyIndex].driverPlate = user?.todaPlate;
        lobbies[lobbyIndex].driverRating = '4.8';
        
        localStorage.setItem('trikeserve_share_lobbies', JSON.stringify(lobbies));
        
        window.dispatchEvent(new StorageEvent('storage', {...}));
        
        request.passengerDetails = passengersWithStatus;
      }
    } catch (error) {
      console.error('Error updating lobby:', error);
    }
  }
}
```

**AFTER (NEW)**:
```typescript
// If it's a shared ride lobby, update it in Supabase
if (request.lobbyId) {
  try {
    const { data: updatedLobby, error: updateError } = await supabaseHelpers.acceptLobbyAsDriver(
      request.lobbyId,
      user.id,
      user?.name,
      user?.todaPlate,
      '4.8'
    );

    if (!updateError && updatedLobby) {
      // The lobby is now updated in the database
      // Real-time subscriptions will notify customers automatically
      console.log('✅ Lobby accepted by driver:', updatedLobby.id);
      
      // Update request with passenger details
      request.passengerDetails = updatedLobby.passengers_json || [];
    }
  } catch (error) {
    console.error('Error accepting lobby:', error);
  }
}
```

---

### 3. Fetch Waiting Lobbies for Driver

When the component loads, replace localStorage fetch with Supabase query:

**BEFORE (OLD)**:
```typescript
useEffect(() => {
  const lobbiesData = localStorage.getItem('trikeserve_ride_requests');
  if (lobbiesData) {
    const requests = JSON.parse(lobbiesData);
    setPassengerRequests(requests);
  }
}, []);
```

**AFTER (NEW)**:
```typescript
useEffect(() => {
  const fetchRequests = async () => {
    try {
      // Fetch regular ride requests from Supabase
      const { data: rides, error: ridesError } = await supabaseHelpers.getRideRequests({
        driverId: null,
        status: 'pending'
      });

      // Fetch waiting lobbies from Supabase
      const { data: lobbies, error: lobbiesError } = await supabaseHelpers.getWaitingLobbiesForDriver();

      if (!ridesError && rides) {
        // Convert ride requests to request format
        const rideRequests = rides.map(ride => ({
          id: ride.id,
          type: 'private',
          pickup: ride.pickup_location,
          dropoff: ride.dropoff_location,
          payment: ride.payment_method || 'COD',
          amount: ride.amount,
          customerName: 'Customer',
          customerPhoto: '👤',
          distance: '2.5 km',
          estimatedTime: '7 mins',
          customerId: ride.customer_id
        }));
        
        // Convert lobbies to request format
        const lobbyRequests = (lobbies || []).map(lobby => ({
          id: `lobby_${lobby.id}`,
          lobbyId: lobby.id,
          type: 'shared',
          pickup: lobby.pickup_location,
          dropoff: lobby.dropoff_location,
          pickupAddress: lobby.pickup_address,
          dropoffAddress: lobby.dropoff_address,
          payment: 'PREPAID',
          amount: lobby.price_per_seat * (lobby.passengers_json?.length || 0),
          passengers: lobby.passengers_json?.length || 0,
          maxPassengers: lobby.max_seats,
          passengerDetails: lobby.passengers_json || [],
          customerName: `${lobby.passengers_json?.length || 0} Passengers`,
          customerPhoto: '🚲',
          distance: '2.5 km',
          estimatedTime: '7 mins',
          customerId: lobby.customer_id,
          payment: 'PREPAID'
        }));

        setPassengerRequests([...rideRequests, ...lobbyRequests]);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  fetchRequests();
}, []);
```

---

### 4. Create Ride Request Entry for Accepted Lobby

When a shared ride is accepted, also create an entry in ride_requests table:

```typescript
if (request.lobbyId) {
  try {
    // Accept the lobby
    const { data: updatedLobby } = await supabaseHelpers.acceptLobbyAsDriver(
      request.lobbyId,
      user.id,
      user?.name,
      user?.todaPlate,
      '4.8'
    );

    if (updatedLobby) {
      // Create a ride request record for tracking
      await supabaseHelpers.createRideRequest({
        customer_id: updatedLobby.customer_id,
        driver_id: user.id,
        pickup_location: updatedLobby.pickup_location,
        dropoff_location: updatedLobby.dropoff_location,
        status: 'accepted',
        ride_type: 'share',
        payment_method: 'PREPAID',
        amount: updatedLobby.price_per_seat * (updatedLobby.passengers_json?.length || 0),
        passenger_count: updatedLobby.passengers_json?.length || 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error processing lobby acceptance:', error);
  }
}
```

---

## Implementation Checklist

- [ ] Remove all `localStorage.getItem('trikeserve_share_lobbies')` calls
- [ ] Remove all `localStorage.setItem('trikeserve_share_lobbies')` calls
- [ ] Replace with Supabase helper function calls
- [ ] Import `supabaseHelpers` at the top
- [ ] Update ride request creation to use Supabase
- [ ] Test driver accepting a shared ride
- [ ] Verify real-time updates reach customers
- [ ] Test passenger count updates
- [ ] Remove localStorage cleanup code related to lobbies

---

## Helper Functions Used

```typescript
// Get a specific lobby
supabaseHelpers.getLobbyById(lobbyId)

// Get all waiting lobbies
supabaseHelpers.getWaitingLobbiesForDriver()

// Accept a lobby as driver
supabaseHelpers.acceptLobbyAsDriver(lobbyId, driverId, driverName, driverPlate, driverRating)

// Get regular ride requests
supabaseHelpers.getRideRequests(filters)

// Create a ride request record
supabaseHelpers.createRideRequest(rideRequest)
```

---

## Expected Behavior After Updates

1. **Driver sees both types of requests**:
   - Regular private/delivery rides
   - Shared ride lobbies (with multiple passengers)

2. **When driver accepts a shared ride lobby**:
   - Lobby status changes to 'driver_found' in database
   - Driver info added to lobby (name, plate, rating)
   - A ride_request entry created for tracking
   - Customers in that lobby receive real-time notification
   - Driver appears in their ShareRideLobby component

3. **No localStorage updates happen**:
   - Everything is persisted to Supabase
   - Multiple browser tabs/devices sync automatically
   - Cross-device compatibility

---

## Testing Steps

```typescript
// Test 1: Customer creates a lobby
// -> Check shared_ride_lobbies table
// -> Should see new lobby with status='waiting'

// Test 2: Driver accepts lobby
// -> Check shared_ride_lobbies: status should be 'driver_found'
// -> Check shared_ride_lobbies: driver_id, driver_name, driver_plate should be set
// -> Check ride_requests: should have new entry with ride_type='share'

// Test 3: Real-time sync
// -> Customer's ShareRideLobby should update in <1 second
// -> Should see driver details
// -> Should see "Driver Found!" status
```

---

**Last Updated**: April 23, 2026
**Status**: Ready for Implementation

