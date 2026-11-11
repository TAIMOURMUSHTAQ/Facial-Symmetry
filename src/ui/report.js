/* Review and report: clinician impression, lock, export (JSON, CSV, print/PDF), evidence downloads. */
import { t, sideName } from "../i18n/index.js";
import { html, raw, download, r3 } from "../util.js";
import { STEPS, STEP } from "../exam/protocol.js";
import { HISTORY_Q } from "../knowledge/history.js";
import { CHECKLIST } from "../knowledge/checklist.js";
import { SEV } from "../engine/thresholds.js";
import { STRENGTH_LABEL } from "../engine/reason.js";
import { flagsHTML } from "./results.js";
import { compareVisits } from "../engine/compare.js";

/** Change since the patient's previous saved visit, or null. */
export function changeSincePrevious(app, report) {
  const prev = (app.prevVisits || []).filter(v => v.id !== app.session.id).slice(-1)[0];
  if (!prev) return null;
  const c = compareVisits(report, prev.report);
  return { previousVisit: prev.number, previousDate: prev.date, ...c };
}

export function buildReport(app) {
  const s = app.session, { A, F0, F, P, G, R } = app.c;
  const steps = {};
  for (const st of STEPS) {
    if (s.skipped[st.id]) { steps[st.id] = { skipped: true }; continue; }
    const a = st.id === "rest" ? A.rest : A.steps[st.id];
    if (!a) continue;
    const { q, m, pose, ...rest } = a;
    steps[st.id] = { ...rest, usableFrames: q ? q.ok : 0, totalFrames: q ? q.total : 0, source: s.records[st.id] ? s.records[st.id].source : null,
      ...(st.id === "rest" && m ? { restMetrics: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r3(v)])) } : {}) };
  }
  const patient = { age: s.patient.age ? +s.patient.age : null, sex: s.patient.sex || null, reportedSide: s.patient.reportedSide || null, reason: s.patient.reason || null };
  if (app.cfg.includePatientRef && s.patient.ref) patient.ref = s.patient.ref;
  return {
    schemaVersion: 2, tool: "Facial Symmetry Assistant", sessionId: s.id, startedAt: s.startedAt, generatedAt: new Date().toISOString(),
    disclaimer: "Decision support only. Findings and possibilities are not a diagnosis and must be confirmed by a qualified clinician.",
    patient, clinician: s.clinician || null,
    history: s.history, bedsideChecks: s.checklist,
    steps,
    findings: F0.map(f => ({ key: f.key, type: f.type, region: f.region, side: f.side, severity: SEV[f.sev], value: r3(f.value), reliability: f.reliability, step: f.step, text: f.text,
      review: (s.review[f.key] && s.review[f.key].decision) || "accept", finalSeverity: (() => { const k = F.find(x => x.key === f.key); return k ? SEV[k.sev] : "Excluded"; })() })),
    pattern: { facial: P.facial, weakerSide: P.side, summary: P.summary, branches: P.branches, synkinesisSide: P.synkinesis, fatigable: P.fatigable, ptosisSide: P.ptosisSide, gazeLimits: P.gazeLimits },
    grading: G.applicable ? { houseBrackmannEstimate: G.hb, side: G.side, reasons: G.hbWhy, inputs: G.inputs, sunnybrookEstimate: { rest: G.sunnybrook.rest, voluntary: G.sunnybrook.voluntary, synkinesis: G.sunnybrook.synkinesis, composite: G.sunnybrook.composite, complete: G.sunnybrook.complete }, confidence: G.confidence } : null,
    redFlags: R.flags,
    possibilities: R.supported.map(r => ({ id: r.id, name: r.name, strength: r.strength, score: r.score, urgency: r.urgency, evidenceFor: r.why, evidenceAgainst: r.against })),
    nextChecks: R.next,
    visit: s.patientId ? { number: (app.prevVisits || []).length + 1, previousVisits: (app.prevVisits || []).length } : null,
    clinicianImpression: s.impression || null, clinicianNotes: s.notes || null,
    privacy: "Numbers and text only. No images, video or patient name are included."
  };
}

const csvCell = v => { const x = v == null ? "" : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
function toCSV(rep) {
  const rows = [["section", "item", "side", "severity_or_strength", "detail", "review"]];
  for (const f of rep.findings) rows.push(["finding", f.text, f.side, f.finalSeverity, f.reliability, f.review]);
  for (const p of rep.possibilities) rows.push(["possibility", p.name, "", p.strength, p.urgency, ""]);
  for (const r of rep.redFlags) rows.push(["red_flag", r.title, "", r.level, r.text, ""]);
  if (rep.grading) rows.push(["grading", "House-Brackmann estimate", rep.grading.side, rep.grading.houseBrackmannEstimate, "Sunnybrook composite " + rep.grading.sunnybrookEstimate.composite, ""]);
  rows.push(["impression", rep.clinicianImpression || "", "", "", rep.clinicianNotes || "", ""]);
  return rows.map(r => r.map(csvCell).join(",")).join("\n");
}

export function printHTML(app, rep, current = true) {
  const s = app.session, ev = current ? STEPS.filter(st => s.records[st.id] && s.records[st.id].evidence).slice(0, 6) : [];
  const history = current ? s.history : rep.history || {}, checklist = current ? s.checklist : rep.bedsideChecks || {};
  const hist = Object.entries(history).filter(([, v]) => v && v !== "unknown" && v !== "no").map(([k, v]) => t(HISTORY_Q[k] ? HISTORY_Q[k].q : k) + " " + (v === "yes" ? t("Yes") : v));
  const checks = CHECKLIST.filter(c => checklist[c.key]).map(c => t(c.q) + ": " + t((c.options.find(o => o[0] === checklist[c.key]) || [, ""])[1]));
  const ch = rep.changeSincePreviousVisit;
  return html`
<h1>${t("Facial symmetry assessment")}${rep.visit ? " · " + t("Visit {n}", { n: rep.visit.number }) : ""}</h1>
<div>${new Date(rep.generatedAt).toLocaleString()} · ${t("Session")} ${rep.sessionId.slice(0, 8)}${rep.patient.age ? " · " + t("Age") + " " + rep.patient.age : ""}${rep.patient.sex ? " · " + t(rep.patient.sex) : ""}${rep.clinician ? " · " + t("Clinician") + ": " + rep.clinician : ""}</div>
<p><i>${t(rep.disclaimer)}</i></p>
${rep.redFlags.length ? html`<h2>${t("Red flags and alerts")}</h2>${rep.redFlags.map(f => html`<div class="flagp"><b>${t(f.title)}.</b> ${t(f.text)}</div>`)}` : ""}
<h2>${t("Pattern")}</h2><p>${t(rep.pattern.summary)}</p>
${rep.grading ? html`<p>${t("House-Brackmann estimate")}: <b>${t("Grade")} ${rep.grading.houseBrackmannEstimate}</b> (${sideName(rep.grading.side)}) · ${t("Sunnybrook composite estimate")}: <b>${rep.grading.sunnybrookEstimate.composite}</b>${rep.grading.sunnybrookEstimate.complete ? "" : " (" + t("partial") + ")"}</p>` : ""}
${ch ? html`<h2>${t("Change since visit {n} ({d} days)", { n: ch.previousVisit, d: ch.days })}</h2>
<table><tr><th>${t("Measure")}</th><th>${t("Before")}</th><th>${t("Now")}</th><th>${t("Change")}</th></tr>${ch.rows.map(r => html`<tr><td>${t(r.label)}</td><td>${r.prev}</td><td>${r.cur}</td><td>${t(r.dir || "–")}</td></tr>`)}</table>` : ""}
<h2>${t("Findings")}</h2>
<table><tr><th>${t("Finding")}</th><th>${t("Severity")}</th><th>${t("Review")}</th></tr>${rep.findings.map(f => html`<tr><td>${t(f.text)}</td><td>${t(f.finalSeverity)}</td><td>${t(f.review)}</td></tr>`)}</table>
<h2>${t("Possibilities to examine")}</h2>
<table><tr><th>${t("Possibility")}</th><th>${t("Match")}</th><th>${t("Urgency")}</th></tr>${rep.possibilities.map(p => html`<tr><td>${t(p.name)}</td><td>${t(STRENGTH_LABEL[p.strength])}</td><td>${t(p.urgency)}</td></tr>`)}</table>
${hist.length ? html`<h2>${t("History (positive answers)")}</h2><ul>${hist.map(h => html`<li>${h}</li>`)}</ul>` : ""}
${checks.length ? html`<h2>${t("Bedside checks")}</h2><ul>${checks.map(h => html`<li>${h}</li>`)}</ul>` : ""}
<h2>${t("Clinician impression")}</h2><p>${rep.clinicianImpression || "—"}</p>${rep.clinicianNotes ? html`<p>${rep.clinicianNotes}</p>` : ""}
${app.printImages && ev.length ? html`<h2>${t("Evidence frames")}</h2>${ev.map(st => html`<img src="${s.records[st.id].evidence}" alt="${t(STEP[st.id].title)}">`)}` : ""}`.s;
}

export function renderReport(app) {
  const s = app.session, R = app.c.R, box = app.root.querySelector("#fsa-report");
  const ev = STEPS.filter(st => s.records[st.id] && s.records[st.id].evidence);
  box.innerHTML = html`
<div class="stack">
  ${flagsHTML(R.flags.filter(f => f.level === "emergency"))}
  <div class="card">
    <h2>${t("Clinician review")}</h2>
    <fieldset style="border:0;margin:0;padding:0" class="stack" ${s.locked ? raw("disabled") : ""}>
      <label class="field"><span>${t("Clinician name or role (optional)")}</span><input type="text" data-k="clinician" value="${s.clinician}"></label>
      <label class="field"><span>${t("Your working impression")}</span><textarea data-k="impression" placeholder="${t("e.g. Left lower motor neuron facial palsy, House-Brackmann IV, onset 2 days. Bell's palsy most likely.")}">${s.impression}</textarea></label>
      <label class="field"><span>${t("Notes and plan")}</span><textarea data-k="notes">${s.notes}</textarea></label>
    </fieldset>
    <p class="note">${t("The report records which findings you accepted, rejected or changed. Your impression is the clinical conclusion; the tool's possibilities are supporting information.")}</p>
    <div class="row" style="margin-top:12px">
      ${s.locked ? html`<span class="chip">${t("Locked {d}", { d: new Date(s.report.generatedAt).toLocaleTimeString() })}</span>` : html`<button class="primary" data-rep="lock" ${s.records.rest ? "" : raw("disabled")}>${s.patientId ? t("Lock and save visit") : t("Lock session and create report")}</button>`}
      <button data-go="results">${t("Back to results")}</button>
    </div>
    ${!s.locked && s.patientId ? html`<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-rep="saveimg" ${app.saveEvidence ? raw("checked") : ""}>${t("Also save evidence frames with this visit (stored on this device)")}</label>` : ""}
    ${!s.patientId ? html`<p class="note">${t("Quick assessment: this report is not saved to a patient record. Download it before closing the tab.")}</p>` : ""}
    ${s.saved ? html`<div class="flag alert" style="margin-top:10px"><b>${t("Saved")}</b>${t("Saved to {p} as visit {n}.", { p: s.saved.ref || t("the patient record"), n: s.saved.number })}</div>` : ""}
    ${s.saveError ? html`<div class="flag urgent" style="margin-top:10px"><b>${t("Not saved")}</b>${t("Could not save the visit: {e}. Download the JSON report so nothing is lost.", { e: s.saveError })}</div>` : ""}
  </div>
  ${s.locked ? html`
  <div class="card">
    <h2>${t("Export")}</h2>
    <div class="row">
      <button data-rep="json">${t("Download JSON")}</button>
      <button data-rep="csv">${t("Download CSV")}</button>
      <button data-rep="print">${t("Print or save as PDF")}</button>
      <label class="note" style="margin:0;display:flex;gap:6px;align-items:center"><input type="checkbox" data-rep="printimg" ${app.printImages ? raw("checked") : ""}>${t("Include evidence frames in the printout")}</label>
    </div>
    <pre>${JSON.stringify(s.report, null, 2)}</pre>
    <p class="note">${t("The JSON and CSV contain numbers and text only: no images, video or patient name.")}</p>
  </div>` : ""}
  ${ev.length ? html`<div class="card"><h2>${t("Evidence frames")}</h2><p class="note" style="margin-top:0">${t("Frames stay in this browser tab. Download only what you need for the record.")}</p>
    <div class="row">${ev.map(st => html`<button class="small" data-ev="${st.id}">${t(st.title)}</button>`)}</div></div>` : ""}
  <div class="row"><button data-act="new-patient">${t("New patient")}</button></div>
</div>`.s;
}

export function bindReport(app) {
  const sec = app.root.querySelector("[data-screen=report]");
  sec.addEventListener("input", e => { const k = e.target.dataset.k; if (k && !app.session.locked) app.session[k] = e.target.value; });
  sec.addEventListener("change", e => {
    if (e.target.dataset.rep === "printimg") app.printImages = e.target.checked;
    if (e.target.dataset.rep === "saveimg") app.saveEvidence = e.target.checked;
  });
  sec.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const s = app.session;
    if (b.dataset.ev) { download(`evidence-${b.dataset.ev}.jpg`, s.records[b.dataset.ev].evidence); return; }
    const act = b.dataset.rep;
    if (act === "lock") {
      app.cancelRecording(true); app.compute();
      s.report = buildReport(app);
      s.report.changeSincePreviousVisit = changeSincePrevious(app, s.report);
      s.locked = true;
      if (typeof app.cfg.onExport === "function") { try { app.cfg.onExport(s.report); } catch (err) { console.error(err); } }
      b.disabled = true;
      app.saveVisit().catch(err => { s.saveError = err.message; }).finally(() => renderReport(app));
    } else if (act === "json") download(`facial-assessment-${s.id.slice(0, 8)}.json`, JSON.stringify(s.report, null, 2), "application/json");
    else if (act === "csv") download(`facial-assessment-${s.id.slice(0, 8)}.csv`, toCSV(s.report), "text/csv");
    else if (act === "print") { app.root.querySelector("#fsa-print").innerHTML = printHTML(app, s.report, true); window.print(); }
  });
}
