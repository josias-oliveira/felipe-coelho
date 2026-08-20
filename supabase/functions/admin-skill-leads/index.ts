import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// sha256("@abseed-felipe") — mesma senha do admin-leads, só o hash trafega.
const ADMIN_PASSWORD_HASH = "08eb04c0467b3a0f4ad36fbb9b4fe5b4dcbe8bca6bccb5680accb1de0b068d83";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (String(body.password_hash ?? "") !== ADMIN_PASSWORD_HASH) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: leads, error } = await supabase
    .from("skill_leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return json({ error: "query_failed" }, 500);

  // funil: sessões únicas por tipo de evento
  const counts = async (event: string) => {
    const { count } = await supabase
      .from("skill_events")
      .select("id", { count: "exact", head: true })
      .eq("event", event);
    return count ?? 0;
  };

  const [visits, popupOpens, downloads] = await Promise.all([
    counts("visit"),
    counts("popup_open"),
    counts("download"),
  ]);

  return json({
    leads,
    stats: { visits, popup_opens: popupOpens, downloads },
  });
});
