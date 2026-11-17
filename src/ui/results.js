/* Findings and AI: neutral measurements of every capture, the cited safety alerts, the AI assistant
   (question box, interpretation, suggested next captures) and change since the last visit. */
import { t } from "../i18n/index.js";
import { html, raw } from "../util.js";
import { HOW_MEASURED } from "../engine/measure.js";
import { compareVisits } from "../engine/compare.js";
import { fingerprint } from "../ai/assist.js";
import { buildReport } from "./report.js";
import { flagHTML } from "./notes.js";

const SIDE_WORD = { right: "patient's right", left: "patient's left", both: "both sides", none: "no weaker side" };
const sideWord = s => (s === "R" ? t("right") : s === "L" ? t("left") : "");
const signed = (v, change) => (v === null || v === undefined ? "–" : change && v > 0 ? "+" + v : String(v));
const list = v => (Array.isArray(v) ? v.filter(x => x && (typeof x !== "string" || x.trim())) : []);

function aiHTML(app) {
  const st = app.ai.status, a = app.session.ai, busy = app.ai.busy, s = app.session;
  if (st && !st.available && !a) return html`<div class="card"><h2>${t("AI assistant")}</h2><p class="mute" style="margin:0">${t("Not available here: {r}. Start the app with ./scripts/serve.sh (local MedGemma via Ollama) or set OPENAI_API_KEY on the server.", { r: t(st.reason || "no API key configured") })}</p></div>`;
  const d = a ? a.data : null, stale = a && a.fp !== fingerprint(app);
  const done = new Set(s.captures.map(c => c.label.toLowerCase()));
  return html`
<div class="card ai">
  <h2>${t("AI assistant")} ${st && st.model ? html`<span class="pill">${st.model}</span>` : ""}</h2>
  <label class="field"><span>${t("Ask about this patient (optional)")}</span>
    <textarea id="fsa-aiq" style="min-height:64px" placeholder="${t("e.g. What else should I check? Does this fit a peripheral pattern? What would separate Bell's palsy from a central cause here?")}" ${busy || s.locked ? raw("disabled") : ""}>${app.aiDraft || ""}</textarea></label>
  <div class="row" style="margin-top:8px"><button class="primary" data-ai="ask" ${busy || s.locked ? raw("disabled") : ""}>${busy ? t("Thinking…") : a ? t("Ask again") : t("Ask the AI")}</button>
    <span class="note" style="margin:0">${t("Sends your capture labels, notes and the numbers. No images, no name.")}</span></div>
  ${app.ai.error ? html`<div class="flag urgent" style="margin-top:10px">${t("AI request failed: {e}", { e: app.ai.error })}</div>` : ""}
  ${d ? html`
    ${stale ? html`<div class="flag urgent" style="margin-top:10px">${t("Your captures or notes changed after the AI answered. Ask again for an up-to-date view.")}</div>` : ""}
    ${a.question && d.answer ? html`<h3>${t("Answer")}</h3><p class="mute" style="margin:0 0 4px;font-style:italic">“${a.question}”</p><p style="margin:0">${d.answer}</p>` : ""}
    ${list(d.red_flags).map(f => html`<div class="flag emergency" style="margin-top:8px">${f}</div>`)}
    <h3>${t("Interpretation")}</h3><p style="margin:0 0 6px">${d.summary || ""}</p>
    ${d.weaker_side ? html`<p class="note" style="margin:0 0 6px">${t("Weaker side")}: <b>${t(SIDE_WORD[String(d.weaker_side).toLowerCase()] || d.weaker_side)}</b></p>` : ""}
    ${list(d.possibilities).length ? html`<h3>${t("Possibilities to examine")}</h3><ol style="margin:0;padding-inline-start:20px;font-size:14px">${list(d.possibilities).map(p => html`<li style="margin-bottom:4px"><b>${p.condition || p.name || ""}</b>${p.urgency && p.urgency !== "routine" ? html` <span class="pill ${String(p.urgency).toLowerCase()}">${p.urgency}</span>` : ""}${p.why ? html`<br><span class="mute">${p.why}</span>` : ""}</li>`)}</ol>` : ""}
    ${list(d.next_captures).length ? html`<h3>${t("Suggested next captures")}</h3><ul class="sugg">${list(d.next_captures).map((n, i) => {
      const label = n.label || String(n), have = done.has(String(label).toLowerCase());
      return html`<li><div><b>${label}</b>${n.why ? html`<br><span class="mute">${n.why}</span>` : ""}</div><button class="small" data-sugg="${i}" ${have || s.locked ? raw("disabled") : ""}>${have ? t("On your list") : t("Add to my captures")}</button></li>`;
    })}</ul>` : ""}
    ${list(d.bedside_checks).length ? html`<h3>${t("Checks the camera cannot do")}</h3><ul style="margin:0;padding-inline-start:18px;font-size:14px">${list(d.bedside_checks).map(x => html`<li>${x}</li>`)}</ul>` : ""}
    <p class="note">${a.model} · ${(a.ms / 1000).toFixed(1)} s · ${new Date(a.at).toLocaleTimeString()}</p>` : ""}
  <p class="disclaimer" style="margin-top:10px">${t("AI output can be wrong or incomplete. Treat it like a colleague's opinion; you make the decisions.")}</p>
</div>`;
}

function captureHTML(app, c) {
  const cap = app.session.captures.find(x => x.id === c.id) || {}, change = c.mode === "change", id = "cap:" + c.id;
  if (!c.valid) return html`<div class="card"><h3 style="margin:0">${c.label}</h3><p class="flag urgent" style="margin-top:8px">${t(c.reason)} ${t("Record it again on the Examine screen.")}</p></div>`;
  const row = r => html`<tr><td>${t(r.name)}<div class="mute" style="font-size:11.5px">${t(r.region)}</div></td><td>${signed(r.R, change)}${r.unit && r.R !== null ? " " + r.unit : ""}</td><td>${signed(r.L, change)}${r.unit && r.L !== null ? " " + r.unit : ""}</td><td>${r.invalid ? html`<span class="mute">${t("not valid ({w})", { w: t(r.invalid) })}</span>` : r.diff === null ? html`<span class="mute">${t("below precision")}</span>` : r.smaller && r.diff ? html`${sideWord(r.smaller)} ${r.diff}% ${change ? t("less") : t("smaller")}` : t("equal")}</td></tr>`;
  const head = html`<tr><th>${t("Measurement")}</th><th>${change ? t("Right change") : t("Right")}</th><th>${change ? t("Left change") : t("Left")}</th><th>${t("Difference")}</th></tr>`;
  // movement captures: the measurable changes first; everything below camera precision is folded away
  const measurable = c.rows.filter(r => r.comparable);
  const first = change ? measurable.slice(0, 6) : c.rows, rest = change ? c.rows.filter(r => !first.includes(r)) : [];
  return html`
<div class="card">
  <div class="row" style="justify-content:space-between">
    <h3 style="margin:0">${c.label} ${c.reference ? html`<span class="pill possible">${t("Reference")}</span>` : ""}</h3>
    <span class="note" style="margin:0">${change ? t("Change from reference, at the moment of largest change") : c.reference ? t("Absolute values (reference)") : t("Absolute values (no reference recorded)")} · ${t("{n} usable frames", { n: c.q.ok })}</span>
  </div>
  ${cap.notes ? html`<p class="note" style="margin:6px 0 0;color:var(--text)">${t("Your notes")}: ${cap.notes}</p>` : ""}
  <div class="tablewrap" style="margin-top:8px"><table>${head}${first.map(row)}</table></div>
  ${rest.length ? html`<details class="more" data-open="${id}" ${app.open.has(id) ? raw("open") : ""}><summary>${t("Show {n} more measurements (smaller or below precision)", { n: rest.length })}</summary><div class="tablewrap"><table>${head}${rest.map(row)}</table></div></details>` : ""}
  <p class="note">${t("Midline")}: ${c.midline.map(m => `${t(m.name)} ${signed(m.value, change)} mm`).join(" · ")}</p>
  ${c.timeline ? html`<p class="note">${t("Over {s} s", { s: c.timeline.seconds })}: ${t("{b} blinks/min", { b: c.timeline.blinksPerMin })} · ${t("one-sided eye closures")} R ${c.timeline.oneSidedEyeClosures.R} / L ${c.timeline.oneSidedEyeClosures.L} · ${t("start-to-end upper lid")} R ${signed(c.timeline.startToEnd.upperLidR, true)} / L ${signed(c.timeline.startToEnd.upperLidL, true)} mm · ${t("mouth corner height")} R ${signed(c.timeline.startToEnd.mouthCornerHeightR, true)} / L ${signed(c.timeline.startToEnd.mouthCornerHeightL, true)} mm</p>` : ""}
  ${cap.rec && cap.rec.evidence ? html`<details class="more" data-open="${id}:img" ${app.open.has(id + ":img") ? raw("open") : ""}><summary>${t("Show frame")}</summary><img class="evi" src="${cap.rec.evidence}" alt="${t("Frame from {c}", { c: c.label })}"></details>` : ""}
</div>`;
}

function compareHTML(app) {
  const prev = (app.prevVisits || []).filter(v => v.id !== app.session.id).slice(-1)[0];
  if (!prev) return "";
  const ch = compareVisits(buildReport(app), prev.report);
  return html`
<div class="card">
  <h2>${t("Compared with visit {n}", { n: prev.number })} <span class="mute" style="font-size:13px;font-weight:400">${t("{d} days ago", { d: ch.days })}</span></h2>
  ${ch.matched.length ? ch.matched.map(m => html`<h3>${m.label}</h3><div class="tablewrap"><table><tr><th>${t("Measurement")}</th><th>${t("Before")}</th><th>${t("Now")}</th></tr>${m.rows.slice(0, 4).map(r => html`<tr><td>${t(r.name)}</td><td>${r.before}</td><td>${r.now}</td></tr>`)}</table></div>`)
    : html`<p class="mute" style="margin:0">${t("No captures with the same name as last visit. Use the same capture names (or load the same routine) to compare visits.")}</p>`}
  <p class="note">${t("Captures are matched by name. The tool shows the numbers; you judge improvement.")}</p>
</div>`;
}

export function renderResults(app) {
  const box = app.root.querySelector("#fsa-results"), recorded = app.m;
  if (!recorded.length) {
    box.innerHTML = html`<div class="card narrow"><h2>${t("Nothing recorded yet")}</h2><p>${t("Record at least one capture on the Examine screen. You can still ask the AI what to examine first.")}</p><div class="row"><button class="primary" data-go="exam">${t("Go to Examine")}</button></div></div>${aiHTML(app)}`.s;
    return;
  }
  const hasRef = recorded.some(c => c.reference);
  box.innerHTML = html`
<div class="stack">
  ${app.flags.map(flagHTML)}
  <div class="results">
    <div class="stack">
      ${!hasRef ? html`<div class="flag alert"><b>${t("No reference capture")}</b>${t("Values are absolute for every capture. Mark one capture (usually a relaxed face) as the reference on the Examine screen to see movement as change from it.")}</div>` : ""}
      ${recorded.map(c => captureHTML(app, c))}
      <details class="card more" data-open="how" ${app.open.has("how") ? raw("open") : ""}><summary style="font-weight:650;color:var(--text)">${t("How the numbers are measured")}</summary><ul style="font-size:13.5px;padding-inline-start:18px">${HOW_MEASURED.map(x => html`<li>${t(x)}</li>`)}</ul></details>
    </div>
    <div class="stack">
      ${aiHTML(app)}
      ${compareHTML(app)}
      <div class="row"><button data-go="notes">${t("Case notes")}</button><button data-go="exam">${t("Back to examine")}</button><button class="primary" data-go="report">${t("Save and report")}</button></div>
    </div>
  </div>
</div>`.s;
}

export function bindResults(app) {
  const sec = app.root.querySelector("[data-screen=results]");
  sec.addEventListener("input", e => { if (e.target.id === "fsa-aiq") app.aiDraft = e.target.value; });
  sec.addEventListener("click", e => {
    if (e.target.closest("[data-ai=ask]")) { app.runAI((app.aiDraft || "").trim()); return; }
    const b = e.target.closest("[data-sugg]");
    if (b && app.session.ai) {
      const n = (app.session.ai.data.next_captures || [])[+b.dataset.sugg];
      if (n && app.addPlanned(n.label || String(n), parseInt(n.seconds, 10) || 5)) { b.textContent = t("Added"); b.disabled = true; }
    }
  });
  sec.addEventListener("toggle", e => {
    const d = e.target; if (!d.dataset || !d.dataset.open) return;
    if (d.open) app.open.add(d.dataset.open); else app.open.delete(d.dataset.open);
  }, true);
}
