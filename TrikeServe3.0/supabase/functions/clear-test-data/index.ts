import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function chunked<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let adminEmail: string;
  let adminPassword: string;
  try {
    const body = await request.json();
    adminEmail = typeof body.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";
    adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (!adminEmail || !adminPassword) {
    return jsonResponse({ error: "Super Admin credentials are required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[clear-test-data] Supabase service configuration is missing");
    return jsonResponse({ error: "Test data cleanup is not configured" }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: admin, error: adminLookupError } = await serviceClient
    .from("admins")
    .select("admin_type, password_hash")
    .eq("email", adminEmail)
    .maybeSingle();

  if (adminLookupError) {
    console.error("[clear-test-data] Could not validate admin account:", adminLookupError.message);
    return jsonResponse({ error: "Could not validate the Super Admin account" }, 500);
  }

  if (!admin || admin.admin_type !== "business_customer" || admin.password_hash !== adminPassword) {
    return jsonResponse({ error: "Super Admin credentials are invalid" }, 401);
  }

  const deletedCounts = {
    orders: 0,
    rideRequests: 0,
    sharedRides: 0,
    chatMessages: 0,
    chatConversations: 0,
    deliveryNotifications: 0,
    foodPackagePhotos: 0,
  };
  const errors: string[] = [];

  // Inspect only package-photo objects attached to food orders. Payment
  // screenshots and rider delivery proofs live in the same bucket and must stay.
  const orderIds: string[] = [];
  let canDeleteOrders = true;
  let offset = 0;
  while (true) {
    const { data, error } = await serviceClient
      .from("orders")
      .select("id")
      .order("id", { ascending: true })
      .range(offset, offset + 499);

    if (error) {
      console.error("[clear-test-data] Could not inspect food orders:", error.message);
      errors.push(`Food orders: ${error.message}`);
      canDeleteOrders = false;
      break;
    }

    const rows = data ?? [];
    orderIds.push(...rows.map((row: { id: string }) => row.id));
    if (rows.length < 500) break;
    offset += rows.length;
  }

  const packagePhotoPaths: string[] = [];
  if (canDeleteOrders) {
    const proofStorage = serviceClient.storage.from("order_proofs");
    for (const batch of chunked(orderIds, 20)) {
      const folders = await Promise.all(batch.map(async (orderId) => {
        const paths: string[] = [];
        let folderOffset = 0;

        while (true) {
          const { data, error } = await proofStorage.list(orderId, { limit: 1000, offset: folderOffset });
          if (error) return { orderId, paths, error };

          const files = data ?? [];
          paths.push(...files
            .filter(file => file.name.startsWith("restaurant-package-"))
            .map(file => `${orderId}/${file.name}`));
          if (files.length < 1000) return { orderId, paths, error: null };
          folderOffset += files.length;
        }
      }));

      for (const folder of folders) {
        if (folder.error) {
          console.error(`[clear-test-data] Could not inspect food order photos for ${folder.orderId}:`, folder.error.message);
          errors.push(`Food order photos: ${folder.error.message}`);
          canDeleteOrders = false;
        } else {
          packagePhotoPaths.push(...folder.paths);
        }
      }
    }
  }

  if (canDeleteOrders) {
    const proofStorage = serviceClient.storage.from("order_proofs");
    for (const batch of chunked(packagePhotoPaths, 100)) {
      const { error } = await proofStorage.remove(batch);
      if (error) {
        console.error("[clear-test-data] Could not remove food order photos:", error.message);
        errors.push(`Food order photos: ${error.message}`);
        canDeleteOrders = false;
      } else {
        deletedCounts.foodPackagePhotos += batch.length;
      }
    }
  }

  if (canDeleteOrders) {
    const { count, error } = await serviceClient
      .from("orders")
      .delete({ count: "exact" })
      .not("id", "is", null);

    if (error) {
      console.error("[clear-test-data] Could not clear orders:", error.message);
      errors.push(`Food orders: ${error.message}`);
    } else {
      deletedCounts.orders = count ?? 0;
    }
  } else {
    errors.push("Food orders were kept because their package photos could not be fully cleared.");
  }

  const targets = [
    { table: "ride_requests", label: "Ride requests", countKey: "rideRequests" as const, statuses: ["pending", "completed", "cancelled"] },
    { table: "shared_ride_lobbies", label: "Shared rides", countKey: "sharedRides" as const },
    { table: "chat_messages", label: "Chat messages", countKey: "chatMessages" as const },
    { table: "chat_conversations", label: "Chat conversations", countKey: "chatConversations" as const },
    { table: "delivery_notifications", label: "Delivery notifications", countKey: "deliveryNotifications" as const },
  ];

  for (const target of targets) {
    let query = serviceClient.from(target.table).delete({ count: "exact" });
    if (target.statuses) query = query.in("status", target.statuses);
    const { count, error } = await query.not("id", "is", null);

    if (error) {
      console.error(`[clear-test-data] Could not clear ${target.table}:`, error.message);
      errors.push(`${target.label}: ${error.message}`);
      continue;
    }

    deletedCounts[target.countKey] = count ?? 0;
  }

  return jsonResponse({
    success: errors.length === 0,
    deletedCounts,
    errors,
  });
});
