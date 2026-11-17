/* Minimal client for any OpenAI-compatible chat endpoint:
     local MedGemma via Ollama:  endpoint "http://localhost:11434/v1", model "medgemma1.5"
     ChatGPT via Laravel proxy:  endpoint "/api/facial-symmetry/ai" (the server adds the API key)
   Works in the browser and in Node 18+. Returns { data, raw, ms, usage }. */

export function parseJSON(text) {
  const s = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

export async function chatJSON({ endpoint, model, messages, apiKey, headers = {}, temperature = 0, maxTokens = 1500, timeoutMs = 180000, extra = {} }) {
  const t0 = Date.now();
  const r = await fetch(endpoint.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}), ...headers },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, response_format: { type: "json_object" }, ...extra }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) {
    const txt = await r.text(); let msg = txt.slice(0, 300);
    try { msg = JSON.parse(txt).error || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  const j = await r.json();
  const raw = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : "";
  return { data: parseJSON(raw), raw, ms: Date.now() - t0, usage: j.usage || null, model: j.model || model, provider: j.provider || null };
}
