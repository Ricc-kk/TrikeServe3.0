-- GCash payment proof + delivery photo proof
--
-- Why this file exists
-- --------------------
-- Checkout is GCash-only for the food, with the delivery fee collected in cash by
-- the rider. Two things were missing for that to work:
--
--   1. Somewhere to put the customer's screenshot of the GCash transfer, and a
--      status meaning "the shop has looked at it and the money is there".
--   2. Somewhere to put the rider's photo of the handover.
--
-- Without (1) the shop had no way to tell a paid order from an unpaid one, and
-- without (2) a delivered order was just a status with no evidence behind it.
--
-- The status list is repaired here too. `SUPABASE_SCHEMA.sql` constrains
-- orders.status to a list that omits `on-the-way`, a value the app has been
-- writing for some time -- so that file's constraint cannot be what the running
-- database has. Rather than guess, this script drops whatever CHECK is there and
-- installs one listing every status the app actually uses, including the new
-- `payment-confirmed`.
--
-- Idempotent: safe to re-run.
--
-- Run in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Payment proof
-- ---------------------------------------------------------------------------

-- Screenshot of the GCash transfer the customer made. Public URL, not the raw
-- blob: it is rendered in <img> on the shop's and the customer's own screens.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ;

-- The two halves of the bill, stored apart because they are paid in two
-- different ways: the food by GCash before the order is accepted, the delivery
-- fee in cash at the door. A single `total` cannot say which is which, and the
-- shop cannot reconcile a transfer against a total that includes cash nobody
-- has handed over yet.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gcash_amount NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_cash NUMERIC(10, 2);

-- When the shop confirmed the money arrived, and who confirmed it. The who
-- matters: it is the only record of which shop accepted the payment on an order
-- whose business_id can be reassigned.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT;

-- ---------------------------------------------------------------------------
-- Delivery proof
-- ---------------------------------------------------------------------------

-- The rider's photo at the moment of handover.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_proof_uploaded_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Order status
-- ---------------------------------------------------------------------------

-- Drop any existing CHECK on status. The constraint name Postgres generated for
-- a plain column CHECK is `orders_status_check`, but an inline constraint in the
-- original CREATE TABLE may have been left unnamed -- hence the second drop,
-- which matches on the expression rather than the name.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status;

-- Every status the app writes, verified against the source rather than assumed:
--   pending           placed, payment proof uploaded, awaiting review
--   payment-confirmed shop verified the transfer  (new)
--   preparing         kitchen is cooking
--   confirmed         published, rider requested / on the rider leg
--   ready             packed
--   picked_up         (legacy; the rider app now writes picked-up on ride_requests)
--   on-the-way        rider travelling
--   delivered         handed over
--   cancelled         declined or cancelled
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'payment-confirmed',
    'preparing',
    'ready',
    'confirmed',
    'picked_up',
    'on-the-way',
    'delivered',
    'cancelled'
  ));

-- ---------------------------------------------------------------------------
-- Shop payment instructions
-- ---------------------------------------------------------------------------

-- What the customer should actually do: which GCash number, under whose name,
-- what to put in the reference. Free text because every shop phrases it
-- differently, and the customer has to read it before paying.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Payment screenshots and rider photos. Public read for the same reason the
-- other buckets are: both are rendered in <img>, including on the customer's own
-- order screen, which they may be looking at signed out of nothing in
-- particular.
INSERT INTO storage.buckets (id, name, public)
VALUES ('order_proofs', 'order_proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read access to order proofs" ON storage.objects;
CREATE POLICY "Public read access to order proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'order_proofs');

-- Uploads are keyed `${orderId}/payment.<ext>` and `${orderId}/delivery.<ext>`,
-- so anyone signed in may write inside an order folder. This cannot be narrowed
-- to "the order's own customer" the way `user_profiles` is: the orders table has
-- no RLS policy that lets a rider read the row to check ownership, and the rider
-- leg of a delivery is a genuine second writer. Read access to `orders` is
-- already open to every signed-in user on this project, so this does not widen
-- anything meaningful.
DROP POLICY IF EXISTS "Signed-in users can upload order proofs" ON storage.objects;
CREATE POLICY "Signed-in users can upload order proofs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'order_proofs' AND
    auth.uid() IS NOT NULL
  );

-- Re-uploading replaces the previous file (upsert), so UPDATE is needed too --
-- a customer fixing a blurry screenshot depends on it.
DROP POLICY IF EXISTS "Signed-in users can replace order proofs" ON storage.objects;
CREATE POLICY "Signed-in users can replace order proofs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'order_proofs' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'order_proofs' AND auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

-- Should list the nine statuses and no others.
SELECT DISTINCT status FROM orders ORDER BY status;

-- Should list the seven new columns.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'orders'
   AND column_name IN (
     'payment_proof_url', 'payment_proof_uploaded_at',
     'gcash_amount', 'delivery_fee_cash',
     'payment_confirmed_at', 'payment_confirmed_by',
     'delivery_proof_url', 'delivery_proof_uploaded_at'
   )
 ORDER BY column_name;

-- Should return exactly one row.
SELECT id, name, public FROM storage.buckets WHERE id = 'order_proofs';