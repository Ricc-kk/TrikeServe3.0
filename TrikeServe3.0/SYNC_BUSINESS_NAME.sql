-- Reconcile the shop name across the two columns it was being kept in
--
-- A business's name lived in two places:
--   restaurants.name     what customers see, what orders are made out, what the
--                        Shop screen edits
--   users.business_name what the app header and the Settings screen read
--
-- They were written by different screens and nothing kept them together, so they
-- drifted. The cause was structural rather than a typo: Settings wrote the copy
-- immediately while the shop row it also writes is *staged* for Super Admin
-- review, so a rename that was never approved still moved the name the owner saw
-- in Settings. The code no longer does this -- `applyBusinessProfileUpdate`
-- mirrors the name once the change is live, on both the staged and the
-- first-pin path -- but rows that drifted before the fix are still wrong.
--
-- restaurants.name wins. It is the name the customers are given, the one printed
-- on orders, and the one the Shop screen saves back to, so it is the value the
-- other copy should have been following.
--
-- Preview before running:
--   SELECT u.email, u.business_name AS header_name, r.name AS shop_name
--   FROM users u
--   JOIN restaurants r ON r.business_user_id = u.id
--   WHERE u.role = 'business'
--     AND COALESCE(NULLIF(u.business_name, ''), '') IS DISTINCT FROM COALESCE(r.name, '');
--
-- Rows where the owner has never set a name are skipped: those have an empty
-- copy, and filling it in would put a name on shops that never chose one.

UPDATE users u
SET business_name = r.name,
    updated_at = now()
FROM restaurants r
WHERE r.business_user_id = u.id
  AND NULLIF(BTRIM(r.name), '') IS NOT NULL
  AND COALESCE(NULLIF(BTRIM(u.business_name), ''), '') IS DISTINCT FROM BTRIM(r.name);

-- If a shop has more than one row for one owner, the join above would pick an
-- arbitrary one. That is a data problem of its own (two shops, one owner, menu
-- and orders split across them) and is deliberately not resolved here.