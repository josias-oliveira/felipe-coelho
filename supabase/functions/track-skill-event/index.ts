import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVENTS = ["visit", "popup_open", "download"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
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

  const event = String(body.event ?? "");
  const sessionId = String(body.session_id ?? "").trim().slice(0, 64);

  if (!EVENTS.includes(event) || !sessionId) {
    return json({ error: "invalid_fields" }, 400);
  }

  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0].trim() || null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // um evento por tipo por sessão: o funil conta pessoas, não cliques repetidos
  const { data: existing } = await supabase
    .from("skill_events")
    .select("id")
    .eq("event", event)
    .eq("session_id", sessionId)
    .limit(1);

  if (existing && existing.length > 0) return json({ ok: true, deduped: true });

  const { error } = await supabase.from("skill_events").insert({
    event,
    session_id: sessionId,
    ip_address: ip,
    user_agent: req.headers.get("user-agent"),
    referrer: str(body.referrer),
    utm_source: str(body.utm_source),
    utm_medium: str(body.utm_medium),
    utm_campaign: str(body.utm_campaign),
  });

  if (error) return json({ error: "insert_failed" }, 500);

  return json({ ok: true });
});
