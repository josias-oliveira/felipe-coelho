import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const whatsapp = String(body.whatsapp ?? "").replace(/\D/g, "");

  if (!name || !email || !isValidEmail(email) || whatsapp.length < 10) {
    return json({ error: "invalid_fields" }, 400);
  }

  // dados que só o servidor captura de forma confiável
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0].trim() || null;
  const userAgent = req.headers.get("user-agent");

  // geolocalização aproximada pelo IP (best-effort, não bloqueia o insert)
  let geoCountry: string | null = null;
  let geoCity: string | null = null;
  if (ip && ip !== "127.0.0.1") {
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: AbortSignal.timeout(2500),
      });
      if (geoRes.ok) {
        const geo = await geoRes.json();
        geoCountry = geo.country_name ?? null;
        geoCity = geo.city ?? null;
      }
    } catch {
      // segue sem geolocalização
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // e-mail já apareceu antes (normalizado) => este envio é um duplicado
  const { data: existing } = await supabase
    .from("skill_leads")
    .select("id")
    .ilike("email", email.toLowerCase())
    .limit(1);
  const isDuplicate = !!existing && existing.length > 0;

  const { error } = await supabase.from("skill_leads").insert({
    name,
    email,
    whatsapp,
    ip_address: ip,
    user_agent: userAgent,
    language: str(body.language),
    timezone: str(body.timezone),
    screen_resolution: str(body.screen_resolution),
    referrer: str(body.referrer),
    utm_source: str(body.utm_source),
    utm_medium: str(body.utm_medium),
    utm_campaign: str(body.utm_campaign),
    geo_country: geoCountry,
    geo_city: geoCity,
    session_id: str(body.session_id),
    is_duplicate: isDuplicate,
  });

  if (error) return json({ error: "insert_failed" }, 500);

  return json({ ok: true });
});
