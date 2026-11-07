# Private ride booking RLS fix

The customer booking flow inserts a `special` row into `ride_requests` and
requests the inserted row back. Supabase Auth sets `auth.uid()` to the same ID
as `users.id`, so the database can allow the customer to create and read only
their own private booking.

Run [FIX_PRIVATE_RIDE_BOOKING_RLS.sql](FIX_PRIVATE_RIDE_BOOKING_RLS.sql) in the
Supabase SQL Editor for an existing database. The full schema installs the
same policies for new databases.

LocalStorage-only legacy logins do not establish a Supabase Auth identity and
cannot pass this owner check. Those accounts need to sign in through Supabase
Auth before creating private ride bookings.
