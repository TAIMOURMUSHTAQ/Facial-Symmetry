/* Save and report: clinician impression, save to a patient, lock, export (JSON, CSV, print/PDF). */
import { t } from "../i18n/index.js";
import { html, raw, download } from "../util.js";
import { SAFETY_QUESTIONS } from "../knowledge/safety.js";
import { HOW_MEASURED } from "../engine/measure.js";
import { compareVisits, diffText } from "../engine/compare.js";
import { flagHTML } from "./notes.js";

export function buildReport(app) {
  const s = app.session;
  const notesById = Object.fromEntries(s.captures.map(c => [c.id, c.notes || ""]));
  const prev = (app.prevVisits || []).filter(v => v.id !== s.id).slice(-1)[0];
  const rep = {
    schemaVersion: 3, tool: "Facial Symmetry Assistant", sessionId: s.id, startedAt: s.startedAt, generatedAt: new Date().toISOString(),
    disclaimer: "Decision support only. Measurements are neutral camera estimates; AI output is a suggestion. The clinician makes all clinical decisions.",
    patient: { age: s.patient.age ? +s.patient.age : null, sex: s.patient.sex || null },
    clinician: s.clinician || null,
    caseNotes: s.notes || null,
    historyFields: (app.historyFields || []).filter(f => s.fields[f.id] !== undefined && s.fields[f.id] !== "").map(f => ({ label: f.label, value: s.fields[f.id] })),
    safetyTicked: SAFETY_QUESTIONS.filter(q => s.safety[q.key]).map(q => q.q),
    safetyAlerts: app.flags,
    captures: app.m.map(c => ({ label: c.label, reference: c.reference, notes: notesById[c.id] || null, valid: c.valid, mode: c.mode || null,
      usableFrames: c.q ? c.q.ok : 0, totalFrames: c.q ? c.q.total : 0, rows: c.rows || [], midline: c.midline || [], timeline: c.timeline || null, reason: c.reason || null })),
    plannedNotRecorded: s.captures.filter(c => !c.rec).map(c => c.label),
    aiAssistant: s.ai ? { model: s.ai.model, provider: s.ai.provider, at: s.ai.at, question: s.ai.question || null, ...s.ai.data } : null,
    clinicianImpression: s.impression || null, plan: s.plan || null,
    visit: s.patientId ? { number: (app.prevVisits || []).length + 1 } : null,
    howMeasured: HOW_MEASURED,
    privacy: "Numbers and text only. No images, video or patient name."
  };
  if (prev) rep.comparedWithVisit = { number: prev.number, date: prev.date, ...compareVisits(rep, prev.report) };
  return rep;
}

const csvCell = v => { const x = v == null ? "" : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
function toCSV(rep) {
  const rows = [["capture", "reference", "mode", "measurement", "right", "left", "difference", "unit"]];
  for (const c of rep.captures) for (const r of c.rows) rows.push([c.label, c.reference ? "yes" : "", c.mode, r.name, r.R, r.L, diffText(r, c.mode), r.unit]);
  for (const f of rep.safetyAlerts) rows.push(["SAFETY ALERT", "", f.level, f.title, "", "", f.action, f.source]);
  if (rep.aiAssistant) rows.push(["AI", "", rep.aiAssistant.model, "summary", "", "", rep.aiAssistant.summary, ""]);
  rows.push(["IMPRESSION", "", "", rep.clinicianImpression || "", "", "", rep.plan || "", ""]);
  return rows.map(r => r.map(csvCell).join(",")).join("\n");
}

export function printHTML(app, rep, current = true) {
  const s = app.session;
  const ev = current && app.printImages ? s.captures.filter(c => c.rec && c.rec.evidence).slice(0, 6) : [];
  return html`
<h1>${t("Facial examination")}${rep.visit ? " · " + t("Visit {n}", { n: rep.visit.number }) : ""}</h1>
<div>${new Date(rep.generatedAt).toLocaleString()}${rep.patient.age ? " · " + t("Age") + " " + rep.patient.age : ""}${rep.patient.sex ? " · " + t(rep.patient.sex) : ""}${rep.clinician ? " · " + t("Clinician") + ": " + rep.clinician : ""}</div>
<p><i>${t(rep.disclaimer)}</i></p>
${rep.safetyAlerts.length ? html`<h2>${t("Safety alerts")}</h2>${rep.safetyAlerts.map(f => html`<div class="flagp"><b>${t(f.title)}.</b> ${t(f.action)} <i>(${f.source})</i></div>`)}` : ""}
${rep.caseNotes ? html`<h2>${t("Case notes")}</h2><p>${rep.caseNotes}</p>` : ""}
${rep.historyFields.length ? html`<h2>${t("History")}</h2><ul>${rep.historyFields.map(f => html`<li>${f.label}: ${f.value}</li>`)}</ul>` : ""}
<h2>${t("Captures")}</h2>
${rep.captures.map(c => html`<h3 style="margin:8px 0 2px">${c.label}${c.reference ? " (" + t("reference") + ")" : ""}</h3>${c.notes ? html`<p style="margin:0">${c.notes}</p>` : ""}
  ${c.valid ? html`<table><tr><th>${t("Measurement")}</th><th>${t("Right")}</th><th>${t("Left")}</th><th>${t("Difference")}</th></tr>${c.rows.slice(0, c.mode === "change" ? 6 : 13).map(r => html`<tr><td>${t(r.name)}</td><td>${r.R}${r.unit ? " " + r.unit : ""}</td><td>${r.L}${r.unit ? " " + r.unit : ""}</td><td>${diffText(r, c.mode)}</td></tr>`)}</table>` : html`<p>${t("Not measurable")}: ${c.reason}</p>`}`)}
${rep.comparedWithVisit && rep.comparedWithVisit.matched.length ? html`<h2>${t("Compared with visit {n}", { n: rep.comparedWithVisit.number })}</h2>${rep.comparedWithVisit.matched.map(m => html`<p><b>${m.label}</b>: ${m.rows.slice(0, 3).map(r => `${t(r.name)} ${r.before} → ${r.now}`).join("; ")}</p>`)}` : ""}
${rep.aiAssistant ? html`<h2>${t("AI assistant")} (${rep.aiAssistant.model})</h2>${rep.aiAssistant.question ? html`<p><i>${rep.aiAssistant.question}</i><br>${rep.aiAssistant.answer || ""}</p>` : ""}<p>${rep.aiAssistant.summary || ""}</p>${Array.isArray(rep.aiAssistant.possibilities) ? html`<ul>${rep.aiAssistant.possibilities.map(p => html`<li>${p.condition || ""}${p.urgency ? " (" + p.urgency + ")" : ""}</li>`)}</ul>` : ""}<p><i>${t("AI output can be wrong or incomplete.")}</i></p>` : ""}
<h2>${t("Clinician impression")}</h2><p>${rep.clinicianImpression || "—"}</p>${rep.plan ? html`<h2>${t("Plan")}</h2><p>${rep.plan}</p>` : ""}
${ev.length ? html`<h2>${t("Frames")}</h2>${ev.map(c => html`<img src="${c.rec.evidence}" alt="${c.label}">`)}` : ""}`.s;
}

export function renderReport(app) {
  const s = app.session, box = app.root.querySelector("#fsa-report");
  const ev = s.captures.filter(c => c.rec && c.rec.evidence);
  const canLock = s.captures.some(c => c.rec);
  box.innerHTML = html`
<div class="stack">
  ${app.flags.filter(f => f.level === "emergency").map(flagHTML)}
  <div class="card">
    <h2>${t("Your conclusion")}</h2>
    <fieldset style="border:0;margin:0;padding:0" class="stack" ${s.locked ? raw("disabled") : ""}>
      <label class="field"><span>${t("Clinician name or role (optional)")}</span><input type="text" data-k="clinician" value="${s.clinician}"></label>
      <label class="field"><span>${t("Your impression")}</span><textarea data-k="impression" placeholder="${t("Your clinical impression in your own words.")}">${s.impression}</textarea></label>
      <label class="field"><span>${t("Plan")}</span><textarea data-k="plan">${s.plan}</textarea></label>
    </fieldset>
    ${!s.patientId && !s.locked ? html`
    <div class="stack" style="gap:8px;margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
      <label class="field"><span>${t("Save this examination to")}</span>
        <select data-k2="target">
          <option value="">${t("Don't save (download the report instead)")}</option>
          <option value="new" ${app.saveTarget === "new" ? raw("selected") : ""}>${t("A new patient")}</option>
          ${(app.patients || []).map(p => html`<option value="${p.id}" ${app.saveTarget === p.id ? raw("selected") : ""}>${p.ref || t("Unnamed patient") + " · " + p.id.slice(0, 6)}${p.age ? " · " + p.age + " y" : ""}</option>`)}
        </select></label>
      ${app.saveTarget === "new" ? html`<label class="field"><span>${t("Name or record number (optional)")}</span><input type="text" data-k2="ref" autocomplete="off"></label>` : ""}
    </div>` : ""}
    ${!s.locked && (s.patientId || app.saveTarget) ? html`<label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-rep="saveimg" ${app.saveEvidence ? raw("checked") : ""}>${t("Also save the capture frames with this visit (stored on this device)")}</label>` : ""}
    <div class="row" style="margin-top:12px">
      ${s.locked ? html`<span class="chip">${t("Locked {d}", { d: new Date(s.report.generatedAt).toLocaleTimeString() })}</span>` : html`<button class="primary" data-rep="lock" ${canLock ? "" : raw("disabled")}>${s.patientId || app.saveTarget ? t("Lock and save visit") : t("Lock and create report")}</button>`}
      <button data-go="results">${t("Back to findings")}</button>
    </div>
    ${s.saved ? html`<div class="flag alert" style="margin-top:10px"><b>${t("Saved")}</b>${t("Saved to {p} as visit {n}.", { p: s.saved.ref || t("the patient record"), n: s.saved.number })}</div>` : ""}
    ${s.saveError ? html`<div class="flag urgent" style="margin-top:10px"><b>${t("Not saved")}</b>${t("Could not save the visit: {e}. Download the JSON report so nothing is lost.", { e: s.saveError })}</div>` : ""}
    ${s.locked && !s.patientId ? html`<p class="note">${t("Not saved to a patient record. Download the report before closing the tab.")}</p>` : ""}
  </div>
  ${s.locked ? html`
  <div class="card">
    <h2>${t("Export")}</h2>
    <div class="row">
      <button data-rep="json">${t("Download JSON")}</button><button data-rep="csv">${t("Download CSV")}</button><button data-rep="print">${t("Print or save as PDF")}</button>
      <label class="note" style="margin:0;display:flex;gap:6px;align-items:center"><input type="checkbox" data-rep="printimg" ${app.printImages ? raw("checked") : ""}>${t("Include frames in the printout")}</label>
    </div>
    <p class="note">${t("JSON and CSV contain numbers and text only: no images, video or patient name.")}</p>
  </div>` : ""}
  ${ev.length ? html`<div class="card"><h2>${t("Capture frames")}</h2><p class="note" style="margin-top:0">${t("Frames stay in this browser tab. Download only what you need for the record.")}</p>
    <div class="row">${ev.map(c => html`<button class="small" data-ev="${c.id}">${c.label}</button>`)}</div></div>` : ""}
  <div class="row"><button data-act="patients">${t("Patients")}</button></div>
</div>`.s;
}

export function bindReport(app) {
  const sec = app.root.querySelector("[data-screen=report]");
  sec.addEventListener("input", e => { const k = e.target.dataset.k; if (k && !app.session.locked) app.session[k] = e.target.value; });
  sec.addEventListener("change", e => {
    if (e.target.dataset.rep === "printimg") app.printImages = e.target.checked;
    if (e.target.dataset.rep === "saveimg") app.saveEvidence = e.target.checked;
    if (e.target.dataset.k2 === "target") { app.saveTarget = e.target.value; renderReport(app); }
  });
  sec.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const s = app.session;
    if (b.dataset.ev) { const c = s.captures.find(x => x.id === b.dataset.ev); download(`capture-${c.label.replace(/[^\w-]+/g, "_").slice(0, 40)}.jpg`, c.rec.evidence); return; }
    const act = b.dataset.rep;
    if (act === "lock") {
      b.disabled = true;
      const refEl = sec.querySelector("[data-k2=ref]");
      app.attachPatient(refEl ? refEl.value.trim() : "").then(async () => {
        app.cancelRecording(true); app.compute();
        s.report = buildReport(app); s.locked = true;
        if (typeof app.cfg.onExport === "function") { try { app.cfg.onExport(s.report); } catch (err) { console.error(err); } }
        try { await app.saveVisit(); } catch (err) { s.saveError = err.message; }
        app.renderPatientChip(); renderReport(app);
      }).catch(err => { s.saveError = err.message; renderReport(app); });
    } else if (act === "json") download(`facial-exam-${s.id.slice(0, 8)}.json`, JSON.stringify(s.report, null, 2), "application/json");
    else if (act === "csv") download(`facial-exam-${s.id.slice(0, 8)}.csv`, toCSV(s.report), "text/csv");
    else if (act === "print") { app.root.querySelector("#fsa-print").innerHTML = printHTML(app, s.report, true); window.print(); }
  });
}
