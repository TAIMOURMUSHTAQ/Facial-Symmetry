/* Connects the app to the AI proxy (server.py locally / on Render, or a Laravel route later). */
import { buildMessages } from "./prompt.js";
import { chatJSON } from "./client.js";
import { SAFETY_QUESTIONS } from "../knowledge/safety.js";

export async function aiStatus(cfg) {
  if (!cfg.aiEndpoint) return { available: false, reason: "disabled" };
  try {
    const r = await fetch(cfg.aiEndpoint.replace(/\/$/, "") + "/status", { headers: { Accept: "application/json" } });
    if (!r.ok) return { available: false, reason: "no AI service on this server" };
    return await r.json();
  } catch { return { available: false, reason: "no AI service on this server" }; }
}

/** Everything the AI sees, built from the session (no images, no name). */
export function caseData(app, question = "") {
  const s = app.session;
  const fields = (app.historyFields || []).map(f => ({ label: f.label, value: s.fields[f.id] }));
  const safety = SAFETY_QUESTIONS.filter(q => s.safety[q.key]).map(q => q.q);
  const notesById = Object.fromEntries(s.captures.map(c => [c.id, c.notes || ""]));
  return {
    patient: { age: s.patient.age, sex: s.patient.sex }, notes: s.notes, fields, safety,
    captures: app.m.map(c => ({ ...c, notes: notesById[c.id] })),
    planned: s.captures.filter(c => !c.rec).map(c => c.label), question
  };
}

/** What the AI answer depends on; when it changes, the previous answer is out of date. */
export function fingerprint(app) {
  const s = app.session;
  return JSON.stringify([s.captures.map(c => [c.id, c.label, c.notes, c.reference, c.rec ? c.rec.at : null]), s.notes, s.fields, s.safety, s.patient.age, s.patient.sex]);
}

export async function askAI(app, question) {
  const res = await chatJSON({ endpoint: app.cfg.aiEndpoint, model: "server-default", messages: buildMessages(caseData(app, question)), headers: app.cfg.apiHeaders || {} });
  if (!res.data) throw new Error("the model did not return valid JSON");
  return res;
}
