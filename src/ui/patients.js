/* Patients screen: find or create a patient, see their visit history and trends, start a visit,
   and back up / restore the local database. */
import { t, sideName } from "../i18n/index.js";
import { html, raw, uid, download } from "../util.js";
import { trend } from "../engine/compare.js";
import { STRENGTH_LABEL } from "../engine/reason.js";

/* History answers that describe the patient, not the episode: carried into the next visit. */
export const CHRONIC = ["diabetes", "hypertension", "thyroid", "cancer", "ms"];

const fmtDate = d => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "–");
const label = p => p.ref || t("Unnamed patient") + " · " + p.id.slice(0, 6);
const demo = p => [p.age ? t("{a} y", { a: p.age }) : "", p.sex ? t(p.sex) : ""].filter(Boolean).join(" · ");

export async function refreshPatients(app) {
  app.patients = (await app.store.listPatients()).sort((a, b) => (b.lastVisitAt || b.updatedAt || "").localeCompare(a.lastVisitAt || a.updatedAt || ""));
}

function listHTML(app) {
  const q = (app.pui.q || "").toLowerCase();
  const ps = app.patients.filter(p => !q || (p.ref || "").toLowerCase().includes(q) || p.id.startsWith(q));
  if (!app.patients.length) return html`<p class="mute">${t("No saved patients yet. Create one to keep visits and track recovery.")}</p>`;
  if (!ps.length) return html`<p class="mute">${t("No patient matches “{q}”.", { q: app.pui.q })}</p>`;
  return html`<ul class="plist">${ps.map(p => html`
    <li><button data-pa="open" data-id="${p.id}" aria-current="${p.id === app.pui.selId}">
      <span><b>${label(p)}</b><br><span class="mute">${demo(p) || t("No details")}</span></span>
      <span class="mute" style="text-align:end">${t("{n} visits", { n: p.visitCount || 0 })}<br>${fmtDate(p.lastVisitAt)}</span>
    </button></li>`)}</ul>`;
}

function formHTML(app) {
  const p = app.pui.editId ? app.patients.find(x => x.id === app.pui.editId) || {} : {};
  return html`
<div class="card">
  <h2>${app.pui.editId ? t("Edit patient") : t("New patient")}</h2>
  <form class="form" id="fsa-pform" autocomplete="off">
    <label class="field"><span>${t("Name or record number (optional)")}</span><input type="text" name="ref" value="${p.ref || ""}"></label>
    <label class="field"><span>${t("Age (years)")}</span><input type="number" name="age" min="0" max="120" inputmode="numeric" value="${p.age || ""}"></label>
    <label class="field"><span>${t("Sex")}</span><select name="sex">
      ${[["", "Not recorded"], ["female", "Female"], ["male", "Male"], ["other", "Other"]].map(([v, l]) => html`<option value="${v}" ${p.sex === v ? raw("selected") : ""}>${t(l)}</option>`)}
    </select></label>
    <label class="field" style="grid-column:1/-1"><span>${t("Notes (optional)")}</span><textarea name="notes" style="min-height:60px">${p.notes || ""}</textarea></label>
  </form>
  <p class="note">${t("Stored on this device only. The name or record number is never included in exported reports.")}</p>
  <div class="row" style="margin-top:12px">
    ${app.pui.editId ? html`<button class="primary" data-pa="save">${t("Save changes")}</button>` : html`<button class="primary" data-pa="save-start">${t("Save and start visit")}</button><button data-pa="save">${t("Save only")}</button>`}
    <button data-pa="cancel">${t("Cancel")}</button>
  </div>
</div>`;
}

function visitHTML(app, v) {
  const r = v.report, top = (r.possibilities || []).slice(0, 3);
  return html`
<details class="poss" data-open="visit:${v.id}" ${app.open.has("visit:" + v.id) ? raw("open") : ""}>
  <summary>${t("Visit {n}", { n: v.number })} · ${fmtDate(v.date)}
    ${r.grading ? html`<span class="pill">${t("HB")} ${r.grading.houseBrackmannEstimate}</span>` : ""}
    ${r.redFlags && r.redFlags.some(f => f.level === "emergency") ? html`<span class="pill emergency">${t("Red flag")}</span>` : ""}</summary>
  <div class="body">
    <p style="margin:0 0 6px">${t(r.pattern ? r.pattern.summary : "")}</p>
    ${r.clinicianImpression ? html`<p style="margin:0 0 6px"><b>${t("Impression")}:</b> ${r.clinicianImpression}</p>` : ""}
    ${top.length ? html`<h4>${t("Top possibilities")}</h4><ul>${top.map(p => html`<li>${t(p.name)} (${t(STRENGTH_LABEL[p.strength])})</li>`)}</ul>` : ""}
    ${r.grading ? html`<p class="note">${t("House-Brackmann {hb} ({side}), Sunnybrook {sb}", { hb: r.grading.houseBrackmannEstimate, side: sideName(r.grading.side), sb: r.grading.sunnybrookEstimate.composite })}</p>` : ""}
    <div class="row" style="margin-top:8px">
      <button class="small" data-pa="visit-json" data-id="${v.id}">${t("Download JSON")}</button>
      <button class="small" data-pa="visit-print" data-id="${v.id}">${t("Print")}</button>
      <button class="small danger" data-pa="visit-del" data-id="${v.id}">${t("Delete visit")}</button>
    </div>
  </div>
</details>`;
}

function detailHTML(app) {
  const p = app.patients.find(x => x.id === app.pui.selId);
  if (!p) return "";
  const visits = app.pui.visits || [];
  const tr = visits.length ? trend(visits) : null;
  return html`
<div class="card">
  <div class="row" style="justify-content:space-between">
    <div><h2 style="margin:0">${label(p)}</h2><div class="mute">${demo(p)}${p.notes ? " · " + p.notes : ""}</div></div>
    <div class="row">
      <button class="primary" data-pa="start" data-id="${p.id}">${visits.length ? t("Start follow-up visit") : t("Start first visit")}</button>
      <button class="small" data-pa="edit" data-id="${p.id}">${t("Edit")}</button>
      <button class="small" data-pa="export-patient" data-id="${p.id}">${t("Export")}</button>
      <button class="small danger" data-pa="delete" data-id="${p.id}">${t("Delete")}</button>
    </div>
  </div>
  ${tr && visits.length > 1 ? html`
  <h3>${t("Trend across visits")}</h3>
  <div class="tablewrap"><table>
    <tr><th></th>${tr.cols.map(c => html`<th>${t("Visit {n}", { n: c.number })}<br><span class="mute" style="font-weight:400">${fmtDate(c.date)}</span></th>`)}</tr>
    ${tr.rows.map(r => html`<tr><td>${t(r.label)}</td>${r.values.map(v => html`<td>${v}</td>`)}</tr>`)}
  </table></div>
  <p class="note">${t("Symmetry = weaker side ÷ stronger side; 100% is perfectly symmetric. Changes under about 10 points are within measurement noise.")}</p>` : ""}
  <h3>${t("Visits")}</h3>
  ${visits.length ? [...visits].reverse().map(v => visitHTML(app, v)) : html`<p class="mute">${t("No visits yet.")}</p>`}
</div>`;
}

export function renderPatients(app) {
  const box = app.root.querySelector("#fsa-patients"), st = app.store;
  box.innerHTML = html`
${st.unavailable ? html`<div class="flag urgent"><b>${t("Browser storage is unavailable")}</b>${t("Private browsing or blocked site data: patients and visits will not be kept after this tab closes.")}</div>` : ""}
<div class="pgrid">
  <div class="stack">
    <div class="card">
      <h2>${t("Patients")}</h2>
      <div class="row" style="margin-bottom:10px">
        <input type="text" id="fsa-pq" placeholder="${t("Search by name or record number")}" value="${app.pui.q || ""}" style="flex:1;min-width:160px" aria-label="${t("Search patients")}">
        <button class="primary" data-pa="new">${t("New patient")}</button>
      </div>
      <div id="fsa-plist">${listHTML(app)}</div>
      <div class="row" style="margin-top:12px">
        <button class="small" data-pa="quick">${t("Quick assessment without a record")}</button>
      </div>
    </div>
    <div class="card">
      <h2>${t("Backup")}</h2>
      <p class="note" style="margin-top:0">${st.kind === "local" ? t("Records are saved in this browser on this device only. Clearing browser data deletes them. Export a backup regularly.") : st.kind === "rest" ? t("Records are saved on the LinguaLink360 server.") : t("Records are kept only until this tab closes.")}</p>
      <div class="row"><button class="small" data-pa="backup">${t("Export all records")}</button><button class="small" data-pa="restore">${t("Import backup")}</button><input type="file" accept="application/json,.json" id="fsa-restore" hidden></div>
    </div>
  </div>
  <div class="stack">
    ${app.pui.view === "form" ? formHTML(app) : app.pui.selId ? detailHTML(app) : html`<div class="card"><h2>${t("Start here")}</h2><p class="mute" style="margin:0">${t("Choose a patient on the left to see their visits and start a follow-up, or create a new patient. Each locked assessment is saved as a visit so recovery can be compared over time.")}</p></div>`}
  </div>
</div>`.s;
}

/** Open the patients screen with fresh data (list and the selected patient's visits). */
export async function showPatients(app) {
  renderPatients(app);
  try {
    await refreshPatients(app);
    if (app.pui.selId) app.pui.visits = await app.store.listVisits(app.pui.selId);
  } catch (err) { console.error(err); }
  if (app.screen === "patient") renderPatients(app);
}

async function selectPatient(app, id) {
  app.pui.selId = id; app.pui.view = "detail";
  app.pui.visits = id ? await app.store.listVisits(id) : [];
  renderPatients(app);
}

export function bindPatients(app) {
  const sec = app.root.querySelector("[data-screen=patient]");
  sec.addEventListener("input", e => {
    if (e.target.id === "fsa-pq") { app.pui.q = e.target.value; sec.querySelector("#fsa-plist").innerHTML = listHTML(app).s; }
  });
  sec.addEventListener("toggle", e => {
    const d = e.target; if (!d.dataset || !d.dataset.open) return;
    if (d.open) app.open.add(d.dataset.open); else app.open.delete(d.dataset.open);
  }, true);
  sec.addEventListener("change", async e => {
    if (e.target.id !== "fsa-restore") return;
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const n = await app.store.importAll(JSON.parse(await f.text()));
      await refreshPatients(app); renderPatients(app);
      alert(t("Imported {p} patients and {v} visits.", { p: n.patients, v: n.visits }));
    } catch (err) { alert(t("Could not import: {e}", { e: err.message })); }
  });
  sec.addEventListener("click", async e => {
    const b = e.target.closest("[data-pa]"); if (!b) return;
    const a = b.dataset.pa, id = b.dataset.id, st = app.store;
    try {
      if (a === "open") await selectPatient(app, id);
      else if (a === "new") { app.pui.view = "form"; app.pui.editId = null; renderPatients(app); sec.querySelector("#fsa-pform input").focus(); }
      else if (a === "edit") { app.pui.view = "form"; app.pui.editId = id; renderPatients(app); }
      else if (a === "cancel") { app.pui.view = app.pui.selId ? "detail" : "list"; renderPatients(app); }
      else if (a === "save" || a === "save-start") {
        const fd = new FormData(sec.querySelector("#fsa-pform")), now = new Date().toISOString();
        const old = app.pui.editId ? app.patients.find(x => x.id === app.pui.editId) : null;
        const p = { ...(old || { id: uid(), createdAt: now, visitCount: 0, chronic: {} }), ref: fd.get("ref").trim(), age: fd.get("age"), sex: fd.get("sex"), notes: fd.get("notes").trim(), updatedAt: now };
        await st.savePatient(p); await refreshPatients(app);
        app.pui.editId = null;
        if (a === "save-start") { await app.startVisit(p); return; }
        await selectPatient(app, p.id);
      }
      else if (a === "start") await app.startVisit(app.patients.find(x => x.id === id));
      else if (a === "quick") await app.startVisit(null);
      else if (a === "delete") {
        const p = app.patients.find(x => x.id === id);
        if (!confirm(t("Delete {p} and all their visits? This cannot be undone.", { p: label(p) }))) return;
        await st.deletePatient(id); await refreshPatients(app);
        app.pui.selId = null; app.pui.view = "list";
        if (app.session.patientId === id) app.session.patientId = null;
        renderPatients(app); app.renderPatientChip();
      }
      else if (a === "export-patient") {
        const p = app.patients.find(x => x.id === id), visits = await st.listVisits(id);
        download(`patient-${id.slice(0, 8)}.json`, JSON.stringify({ format: "facial-symmetry-backup", version: 1, exportedAt: new Date().toISOString(), patients: [p], visits }, null, 2), "application/json");
      }
      else if (a === "backup") download(`facial-symmetry-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await st.exportAll(), null, 2), "application/json");
      else if (a === "restore") sec.querySelector("#fsa-restore").click();
      else if (a === "visit-json") { const v = await st.getVisit(id); download(`visit-${v.number}-${v.date.slice(0, 10)}.json`, JSON.stringify(v.report, null, 2), "application/json"); }
      else if (a === "visit-print") { const v = await st.getVisit(id); app.printReport(v.report); }
      else if (a === "visit-del") {
        if (!confirm(t("Delete this visit? This cannot be undone."))) return;
        await st.deleteVisit(id);
        const p = app.patients.find(x => x.id === app.pui.selId), left = await st.listVisits(p.id);
        await st.savePatient({ ...p, visitCount: left.length, lastVisitAt: left.length ? left[left.length - 1].date : null });
        await refreshPatients(app); await selectPatient(app, p.id);
      }
    } catch (err) { alert(t("Storage error: {e}", { e: err.message })); }
  });
}
