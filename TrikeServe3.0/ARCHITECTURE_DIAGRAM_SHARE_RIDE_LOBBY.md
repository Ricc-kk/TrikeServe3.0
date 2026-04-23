## Share Ride Lobby System - Architecture & Data Flow Diagram

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TRIKESERVE 3.0                                 │
│                   Share Ride Lobby System                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐         ┌──────────────────────┐
│   CUSTOMER FRONTEND     │         │   DRIVER FRONTEND    │
│ ┌─────────────────────┐ │         │ ┌──────────────────┐ │
│ │ ShareRideLobby.tsx  │ │         │ │ PassengerReqs.tsx│ │
│ │                     │ │         │ │                  │ │
│ │ - Create lobby      │ │         │ │ - View lobbies   │ │
│ │ - Join lobby        │ │         │ │ - Accept lobby   │ │
│ │ - View passengers   │ │         │ │ - Start ride     │ │
│ │ - Real-time updates │ │         │ │ - Complete ride  │ │
│ └─────────────────────┘ │         │ └──────────────────┘ │
│ ┌─────────────────────┐ │         │                      │
│ │ BrowseLobbies.tsx   │ │         │                      │
│ │                     │ │         │                      │
│ │ - Browse available  │ │         │                      │
│ │ - See other lobbies │ │         │                      │
│ │ - Join matching     │ │         │                      │
│ └─────────────────────┘ │         │                      │
└──────────────┬──────────┘         └──────────┬───────────┘
               │                                 │
               │                                 │
        ┌──────▼─────────────────────────────────▼──────┐
        │                                                │
        │    Supabase Helpers (supabase.ts)            │
        │                                                │
        │ ┌──────────────────────────────────────────┐ │
        │ │ Lobby Functions:                         │ │
        │ │ - createShareRideLobby()                │ │
        │ │ - joinShareRideLobby()                  │ │
        │ │ - leaveShareRideLobby()                 │ │
        │ │ - getAvailableLobbyByRoute()            │ │
        │ │ - getAvailableLobbies()                 │ │
        │ │ - getWaitingLobbiesForDriver()          │ │
        │ │ - acceptLobbyAsDriver()                 │ │
        │ │ - updateLobbyPassengers()               │ │
        │ │ - startLobbyRide()                      │ │
        │ │ - completeLobbyRide()                   │ │
        │ │ - subscribeLobbyUpdates()               │ │
        │ └──────────────────────────────────────────┘ │
        └──────────┬──────────────────────────────────┘
                   │
        ┌──────────▼──────────────────┐
        │                              │
        │  SUPABASE DATABASE           │
        │                              │
        │ ┌──────────────────────────┐ │
        │ │ shared_ride_lobbies      │ │
        │ ├──────────────────────────┤ │
        │ │ id                       │ │
        │ │ customer_id              │ │
        │ │ pickup_location          │ │
        │ │ pickup_address           │ │
        │ │ dropoff_location         │ │
        │ │ dropoff_address          │ │
        │ │ passengers_json (JSONB)  │ │ ← Array of passenger objects
        │ │ max_seats                │ │
        │ │ price_per_seat           │ │
        │ │ status                   │ │ ← waiting | driver_found | ...
        │ │ driver_id                │ │
        │ │ driver_name              │ │
        │ │ driver_plate             │ │
        │ │ driver_rating            │ │
        │ │ created_at               │ │
        │ │ updated_at               │ │
        │ └──────────────────────────┘ │
        │                              │
        │ ┌──────────────────────────┐ │
        │ │ ride_requests (ref)      │ │
        │ │ - Track shared rides     │ │
        │ └──────────────────────────┘ │
        │                              │
        └──────────────────────────────┘

        ┌──────────────────────────────┐
        │  REAL-TIME SUBSCRIPTIONS     │
        │                              │
        │ WebSocket Channels:          │
        │ - lobby_{lobbyId}            │
        │ - All status changes         │
        │ - Passenger updates          │
        │ - Driver assignments         │
        └──────────────────────────────┘
```

---

## 🔄 Data Flow Diagrams

### 1. CREATE SHARE RIDE LOBBY

```
Customer starts share ride
     │
     ▼
ShareRideLobby component mounts
     │
     ▼
findOrCreateLobby() async function
     │
     ├─ Check: Is user already in a waiting lobby?
     │    └─ If YES → Return that lobby
     │
     ├─ Check: Is there a matching lobby (same dropoff_address)?
     │    └─ If YES → Join that lobby
     │              (add to passengers_json array)
     │              (call updateLobbyPassengers)
     │
     └─ If NO → Create new lobby
              (call createShareRideLobby)
              │
              ▼
          Supabase: INSERT into shared_ride_lobbies
              │
              ▼
          Lobby created in database
          Status: 'waiting'
          Passengers: [customer]
              │
              ▼
          Real-time subscription activated
          (subscribeLobbyUpdates)
              │
              ▼
          UI shows lobby with loading state
          Customers in this lobby see each other in real-time
              │
              ▼
          Lobby appears in Driver's Passenger Requests
```

### 2. DRIVER ACCEPTS LOBBY

```
Driver sees shared lobby in Passenger Requests
     │
     ▼
Driver clicks "Accept"
     │
     ▼
acceptRideRequest() called
     │
     ├─ Check: Does driver have active rides?
     │    └─ If YES → Show error, return
     │
     └─ If NO → Accept the lobby
              │
              ▼
          acceptLobbyAsDriver(lobbyId, driverId, ...)
              │
              ▼
          Supabase: UPDATE shared_ride_lobbies
              SET status = 'driver_found'
              SET driver_id = driverId
              SET driver_name = driverName
              SET driver_plate = driverPlate
              SET driver_rating = driverRating
              │
              ▼
          Lobby updated in database
              │
              ▼
          Real-time event triggered
              │
              ├─ Customer's browser receives update
              │    │
              │    ▼
              │  ShareRideLobby component updates
              │    │
              │    ▼
              │  Shows "Driver Found!" status
              │  Shows driver details
              │
              └─ Driver's browser shows confirmation
                   Navigates to active ride view
```

### 3. CUSTOMER JOINS EXISTING LOBBY

```
Customer clicks "Browse Available Lobbies"
     │
     ▼
BrowseAvailableLobbies component opens
     │
     ▼
Fetch lobbies: getAvailableLobbies(dropoffAddress)
     │
     ▼
Supabase: SELECT from shared_ride_lobbies
          WHERE status = 'waiting'
          AND dropoff_address = ?
          │
          ▼
List of waiting lobbies displayed
Each showing:
- Passenger count
- Available seats
- Price per seat
- Passenger avatars
     │
     ▼
Customer selects a lobby and clicks "Join"
     │
     ▼
joinShareRideLobby(lobbyId, passengerObject)
     │
     ├─ Fetch lobby from database
     │
     ├─ Check: Is lobby full?
     │    └─ If YES → Show error
     │
     ├─ Check: Is customer already in lobby?
     │    └─ If YES → Return existing lobby
     │
     └─ If OK → Add to passengers_json
              │
              ▼
          Supabase: UPDATE shared_ride_lobbies
              SET passengers_json = 
                  array_append(passengers_json, passenger)
              │
              ▼
          All customers in lobby receive real-time update
              │
              ▼
          Everyone sees new passenger count
          New passenger is added to the list
          BrowseLobbies modal closes
          New customer sees ShareRideLobby component
```

### 4. CUSTOMER LEAVES LOBBY

```
Customer clicks "Leave Lobby"
     │
     ▼
Confirm dialog shown
     │
     ▼
User clicks "Leave"
     │
     ▼
leaveShareRideLobby(lobbyId, userId)
     │
     ├─ Remove userId from passengers_json
     │    (also removes companions: userId_companion_1, etc.)
     │
     └─ Supabase: UPDATE shared_ride_lobbies
              SET passengers_json = 
                  array_remove(passengers_json, ...)
              │
              ▼
          Check: Is passengers_json now empty?
              │
              ├─ If YES → Mark lobby as 'cancelled'
              │             └─ Cleanup
              │
              └─ If NO → Update passenger count display
                         All remaining passengers see update
```

---

## 🔐 RLS Security Flow

```
REQUEST TO DATABASE
     │
     ▼
Check User Authentication
     │
     ├─ If NOT logged in → DENY
     │
     └─ If logged in → Check RLS policies
          │
          ▼
          Policy: "Customers can view waiting lobbies"
          - SELECT from shared_ride_lobbies
          - WHERE status = 'waiting'
          - NO authentication needed
          - Anyone can browse
          │
          ▼
          Policy: "Customers can view own lobbies"
          - SELECT from shared_ride_lobbies
          - WHERE auth.uid() = customer_id
          - Only creator can see their lobby
          │
          ▼
          Policy: "Drivers can view assigned lobbies"
          - SELECT from shared_ride_lobbies
          - WHERE auth.uid() = driver_id
          - Only assigned driver can see
          │
          ▼
          Policy: "Customers can create lobbies"
          - INSERT into shared_ride_lobbies
          - WITH CHECK auth.uid() = customer_id
          - Customer_id must match auth user
          │
          ▼
          Policy: "Customers can update own lobbies"
          - UPDATE shared_ride_lobbies
          - WHERE auth.uid() = customer_id
          - Can only update own lobbies
          │
          ▼
          All checks passed → ALLOW
```

---

## 📱 Real-Time Subscription Flow

```
Browser A (Customer 1)         Browser B (Customer 2)         Browser C (Driver)
      │                               │                              │
      │                               │                              │
      ├─ Opens ShareRideLobby ───────┼─ Joins same lobby ────┬──────┤
      │                               │                       │      │
      │                               │                       │      │
      ▼                               ▼                       │      │
subscribeLobbyUpdates          subscribeLobbyUpdates         │      │
("lobby_123")                  ("lobby_123")                  │      │
      │                               │                       │      │
      │                               │                       │      │
      └──────────────┬────────────────┘                       │      │
                     │                                        │      │
                     ▼                                        │      │
         Supabase Real-time Engine                           │      │
         Channel: "lobby_123"                                │      │
                     │                                        │      │
    ┌────────────────┼────────────────────────────────────────┤      │
    │                │                                        │      │
    ▼                ▼                                        ▼      ▼
[UPDATE EVENT: Status changed from 'waiting' to 'driver_found']
[Driver info added: name, plate, rating]


Both customers instantly receive:
┌────────────────────────────────────┐
│ {                                  │
│   event: 'UPDATE',                 │
│   new: {                           │
│     id: 'lobby_123',               │
│     status: 'driver_found',        │
│     driver_name: 'Juan',           │
│     driver_plate: 'ABC123',        │
│     driver_rating: '4.8'           │
│   }                                │
│ }                                  │
└────────────────────────────────────┘

They immediately:
✅ See "Driver Found!" status
✅ Show driver details
✅ Enable call/chat with driver
✅ No manual refresh needed
✅ Latency < 1 second
```

---

## 📊 Database State Transitions

```
SHARED_RIDE_LOBBIES TABLE STATE MACHINE

                    ┌─────────────────────┐
                    │   WAITING           │
                    │ (Default state)     │
                    │ - Passengers found  │
                    │ - No driver yet     │
                    └────────────┬────────┘
                                 │
                  ┌──────────────┼─────────┬──────────────┐
                  │              │         │              │
          ┌───────▼────────┐     │     ┌───▼──────────┐   │
          │ CANCELLED      │     │     │ DRIVER_FOUND │   │
          │ (Empty lobby)  │     │     │ (Driver OK'd) │   │
          └────────────────┘     │     └───┬──────────┘   │
                                 │         │               │
                                 │    ┌────▼────────────┐  │
                                 │    │  IN_PROGRESS    │  │
                                 │    │ (Ride started)  │  │
                                 │    └────┬───────────┘  │
                                 │         │               │
                                 │    ┌────▼─────────────┐ │
                                 │    │  COMPLETED      │ │
                                 │    │ (Ride finished) │ │
                                 │    └─────────────────┘ │
                                 │                        │
                 ┌───────────────┘                        │
                 │                                        │
                 └────────────────────────────────────────┘

State Transitions:
WAITING         → DRIVER_FOUND   (Driver accepts)
WAITING         → CANCELLED      (Last passenger leaves)
DRIVER_FOUND    → IN_PROGRESS    (Driver starts ride)
IN_PROGRESS     → COMPLETED      (Driver finishes ride)
```

---

## 🎯 Key Design Features

### 1. **No Local Storage**
- All data persisted in Supabase PostgreSQL
- No localStorage used for lobbies
- Survivves page refreshes
- Works across devices

### 2. **Real-Time Synchronization**
- WebSocket-based real-time updates
- All clients see changes instantly
- No polling required (was 2 seconds before)
- < 1 second latency

### 3. **Scalability**
- Passenger_json is JSONB - efficient storage
- Proper indexes on hot fields (status, dropoff_location)
- Can handle thousands of concurrent lobbies
- Database-level filtering before returning to app

### 4. **Security**
- RLS policies prevent unauthorized access
- Customers can only see/modify own lobbies
- Drivers can only see assigned lobbies
- All changes require authentication

### 5. **Atomicity**
- Database constraints ensure data consistency
- Foreign keys protect referential integrity
- No race conditions with proper transactions
- JSONB validation at database level

---

## 🚀 Performance Metrics (Target)

| Operation | Target | Method |
|-----------|--------|--------|
| Create lobby | < 500ms | Direct INSERT |
| Join lobby | < 500ms | UPDATE passengers_json |
| Accept lobby | < 500ms | Driver UPDATE |
| Real-time update | < 1000ms | WebSocket |
| Fetch lobbies | < 200ms | Indexed SELECT |
| Leave lobby | < 500ms | UPDATE passengers_json |

---

**Diagram Created**: April 23, 2026  
**Last Updated**: April 23, 2026

