/**
 * Cloudflare Worker: Claude broker coaching proxy.
 * Deploy as a Worker and add ANTHROPIC_API_KEY as a secret.
 * Protect the Worker hostname with Cloudflare Access; CORS is not authentication.
 */
const ALLOWED_ORIGIN = "https://pranayperiwal13.github.io";
export default {
 async fetch(request, env) {
  const origin = request.headers.get("Origin") || "";
  const cors = {
   "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
   "Access-Control-Allow-Methods": "POST, OPTIONS",
   "Access-Control-Allow-Headers": "Content-Type",
   "Vary": "Origin"
  };
  if (origin && origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", {status:403});
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  if (request.method !== "POST" || new URL(request.url).pathname !== "/coach")
   return new Response("Not found",{status:404,headers:cors});
  if (!env.ANTHROPIC_API_KEY) return Response.json({error:"Backend secret ANTHROPIC_API_KEY is not configured."},{status:500,headers:cors});
  try {
   const body = await request.json();
   if (!body || !["team","followups","individual"].includes(body.mode) || !body.workspace || typeof body.instructions !== "string")
    return Response.json({error:"Invalid coaching request."},{status:400,headers:cors});
   const compact = JSON.stringify(body.workspace);
   if (compact.length > 85000) return Response.json({error:"Workspace snapshot is too large. Narrow the CP list or interaction history."},{status:413,headers:cors});
   const upstream = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
     "content-type":"application/json",
     "x-api-key":env.ANTHROPIC_API_KEY,
     "anthropic-version":"2023-06-01"
    },
    body:JSON.stringify({
     model:"claude-sonnet-4-6",
     max_tokens:5000,
     system:"You are a practical luxury residential real-estate sales coach for a Gurgaon channel-partner team. Base every conclusion only on supplied records. Never fabricate activity, targets, motives, or conversion rates. Explicitly flag insufficient or missing data. Prioritise specific actions and ready-to-send broker follow-up language. Be candid, constructive, concise, and commercially focused.",
     messages:[{role:"user",content:body.instructions+"\n\nAnalyse this workspace snapshot:\n"+compact}]
    })
   });
   const result = await upstream.json();
   if (!upstream.ok) return Response.json({error:result?.error?.message || "Claude API request failed."},{status:upstream.status,headers:cors});
   const analysis = (result.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n\n");
   return Response.json({analysis,model:result.model,usage:result.usage},{headers:cors});
  } catch (error) {
   return Response.json({error:error.message || "Unexpected backend error."},{status:500,headers:cors});
  }
 }
};
