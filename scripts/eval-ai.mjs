#!/usr/bin/env node
/* Evaluates an LLM (default: local MedGemma 1.5 via Ollama) on the synthetic patients in tests/scenarios.js.

   Usage:
     node scripts/eval-ai.mjs                                   # MedGemma via Ollama, both modes
     node scripts/eval-ai.mjs --mode=blind --cases=bells,stroke
     AI_ENDPOINT=https://api.openai.com/v1 AI_MODEL=<model> AI_KEY=sk-... node scripts/eval-ai.mjs   # any OpenAI-compatible API

   Scores per case: leading possibility correct (top-1), correct within first 3 (top-3), weaker side correct,
   emergency handled correctly (raised when needed, no false alarm otherwise), valid JSON, no overclaiming,
   response time. Results are written to tests/results/. */
import { writeFileSync, mkdirSync } from "node:fs";
import { CASES, caseDataFor } from "../tests/scenarios.js";
import { buildMessages } from "../src/ai/prompt.js";
import { chatJSON } from "../src/ai/client.js";

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const endpoint = arg("endpoint", process.env.AI_ENDPOINT || "http://localhost:11434/v1");
const model = arg("model", process.env.AI_MODEL || "medgemma1.5");
const modes = ["therapist-led"];   // the AI sees the therapist's captures, notes and safety ticks (no rule engine)
const only = arg("cases", "");
const cases = CASES.filter(c => !only || only.split(",").includes(c.id));

const sideOf = s => {
  const x = String(s || "").toLowerCase();
  if (/both|bilat/.test(x)) return "both";
  if (/\bright\b/.test(x)) return "right";
  if (/\bleft\b/.test(x)) return "left";
  return "none";
};
const EMERG = /stroke|aneurysm|dissection|emergen|airway|respirat|breath|crisis/i;
const OVERCLAIM = /\b(the diagnosis is|is diagnosed with|confirms? (a |the )?diagnosis|definitive diagnosis|consistent only with)\b/i;

function score(c, out) {
  const d = out.data || {}, poss = Array.isArray(d.possibilities) ? d.possibilities : [];
  const names = poss.map(p => String(p && (p.condition || p.name) || ""));
  const flagsText = (Array.isArray(d.red_flags) ? d.red_flags : []).join(" | ");
  const emergencyPoss = poss.filter(p => /emergen/i.test(String(p && p.urgency))).map(p => p.condition || p.name).join(" | ");
  const e = c.expect;
  const top1 = (e.allowEmpty && (!names.length || /normal|no (significant|abnormal)/i.test(String(d.summary)))) || (names[0] ? e.top.test(names[0]) : false);
  const top3 = top1 || names.slice(0, 3).some(n => e.top.test(n));
  const side = sideOf(d.weaker_side) === e.side;
  const raised = !!(flagsText.trim() || emergencyPoss);
  const emergency = e.emergency
    ? raised && (!e.flag || e.flag.test(flagsText + " " + emergencyPoss + " " + names[0]))
    : !emergencyPoss && !EMERG.test(flagsText);
  return { json: !!out.data && Array.isArray(d.possibilities), top1, top3, side, emergency, overclaim: OVERCLAIM.test(String(d.summary || "")),
    modelTop: names[0] || "(none)", modelSide: d.weaker_side, redFlags: d.red_flags || [], ms: out.ms };
}

// same generation settings server.py uses for Ollama (prevents repetition loops in small models)
const GEN = /11434/.test(endpoint) ? { temperature: 0.2, maxTokens: 1200, extra: { frequency_penalty: 0.4, seed: 7 } } : {};
const pct = (n, d) => (d ? Math.round(100 * n / d) + "%" : "–");

async function main() {
  console.log(`Model: ${model} @ ${endpoint}\nCases: ${cases.length}, modes: ${modes.join(", ")}\n`);
  process.stdout.write("Warming up (loading the model)… ");
  try { const w = await chatJSON({ endpoint, model, messages: [{ role: "user", content: 'Reply with {"ok":true}' }], maxTokens: 20 }); console.log(`ready (${(w.ms / 1000).toFixed(1)} s)\n`); }
  catch (err) { console.error("\nCannot reach the model: " + err.message + "\nIs Ollama running (ollama serve) and the model pulled (ollama pull medgemma1.5)?"); process.exit(1); }

  const results = [];
  for (const c of cases) {
    const data = caseDataFor(c);
    for (const mode of modes) {
      process.stdout.write(`${c.id.padEnd(18)} ${mode.padEnd(7)} `);
      let out;
      try { out = await chatJSON({ endpoint, model, messages: buildMessages(data), apiKey: process.env.AI_KEY, ...GEN }); }
      catch (err) { out = { data: null, raw: "ERROR: " + err.message, ms: 0 }; }
      const s = score(c, out);
      results.push({ case: c.id, title: c.title, mode, expected: String(c.expect.top), ...s, raw: out.raw });
      console.log(`${s.top1 ? "✓" : "✗"} top1  ${s.top3 ? "✓" : "✗"} top3  ${s.side ? "✓" : "✗"} side  ${s.emergency ? "✓" : "✗"} emerg  ${(s.ms / 1000).toFixed(1)} s  → ${s.modelTop.slice(0, 60)}`);
    }
  }

  const lines = [`# AI evaluation: ${model}`, "", `Endpoint: ${endpoint}  `, `Date: ${new Date().toISOString()}  `, `Cases: ${cases.length} synthetic patients (tests/scenarios.js)`, ""];
  lines.push("The AI receives what a therapist would enter: their own capture names, neutral measurements, free-text notes and safety ticks. No rule engine.", "");
  for (const mode of modes) {
    const R = results.filter(r => r.mode === mode), n = R.length, c = k => R.filter(r => r[k]).length;
    const avg = n ? R.reduce((a, r) => a + r.ms, 0) / n / 1000 : 0;
    lines.push(`## Mode: ${mode}`, "", "| Measure | Score |", "|---|---|",
      `| Valid JSON | ${c("json")}/${n} (${pct(c("json"), n)}) |`,
      `| Leading possibility correct (top-1) | ${c("top1")}/${n} (${pct(c("top1"), n)}) |`,
      `| Correct within first 3 (top-3) | ${c("top3")}/${n} (${pct(c("top3"), n)}) |`,
      `| Weaker side correct | ${c("side")}/${n} (${pct(c("side"), n)}) |`,
      `| Emergency handled correctly | ${c("emergency")}/${n} (${pct(c("emergency"), n)}) |`,
      `| Overclaimed a diagnosis | ${c("overclaim")}/${n} |`,
      `| Average response time | ${avg.toFixed(1)} s |`, "",
      "| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |", "|---|---|---|---|---|---|---|",
      ...R.map(r => `| ${r.case} | ${r.expected.replace(/\|/g, "/").slice(0, 40)} | ${String(r.modelTop).replace(/\|/g, "/").slice(0, 70)} | ${r.top1 ? "✓" : "✗"} | ${r.top3 ? "✓" : "✗"} | ${r.side ? "✓" : `✗ (${r.modelSide})`} | ${r.emergency ? "✓" : "✗"} |`), "");
  }
  const md = lines.join("\n");
  console.log("\n" + md);
  mkdirSync(new URL("../tests/results/", import.meta.url), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19), base = `../tests/results/ai-eval-${model.replace(/[^\w.-]/g, "_")}-${stamp}`;
  writeFileSync(new URL(base + ".md", import.meta.url), md);
  writeFileSync(new URL(base + ".json", import.meta.url), JSON.stringify({ model, endpoint, results }, null, 2));
  console.log(`\nSaved ${base.slice(3)}.md and .json`);
}
main();
