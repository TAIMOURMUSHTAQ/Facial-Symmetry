/* Case notes: free-text notes, the therapist's own history fields (built once, reused for every patient),
   and the emergency safety check. Nothing here is preset except the safety items, which cite their sources. */
import { t } from "../i18n/index.js";
import { html, raw, uid } from "../util.js";
import { SAFETY_QUESTIONS } from "../knowledge/safety.js";

export function flagHTML(f) {
  return html`<div class="flag ${f.level}" role="${f.level === "emergency" ? "alert" : "note"}"><b>${t(f.title)}</b>${t(f.action)}<div class="src">${t("Source")}: ${f.source}</div></div>`;
}

function fieldInput(f, v, locked) {
  const dis = locked ? raw("disabled") : "";
  if (f.type === "yesno") return html`<div class="seg yn">${[["yes", "Yes"], ["no", "No"]].map(([val, l]) => html`<label><input type="radio" name="hf|${f.id}" value="${val}" ${v === val ? raw("checked") : ""} ${dis}>${t(l)}</label>`)}</div>`;
  if (f.type === "choice") return html`<div class="seg">${(f.options || []).map(o => html`<label><input type="radio" name="hf|${f.id}" value="${o}" ${v === o ? raw("checked") : ""} ${dis}>${o}</label>`)}</div>`;
  return html`<input type="text" data-hf="${f.id}" value="${v || ""}" ${dis} style="max-width:360px">`;
}

export function renderNotes(app) {
  const s = app.session, box = app.root.querySelector("#fsa-notes"), locked = s.locked, edit = app.editFields;
  const fields = app.historyFields || [];
  box.innerHTML = html`
<div class="stack">
  ${app.flags.map(flagHTML)}
  <div class="card">
    <h2>${t("Patient")}</h2>
    <div class="form">
      <label class="field"><span>${t("Age (years)")}</span><input type="number" data-pt="age" min="0" max="120" inputmode="numeric" value="${s.patient.age || ""}" ${locked ? raw("disabled") : ""}></label>
      <label class="field"><span>${t("Sex")}</span><select data-pt="sex" ${locked ? raw("disabled") : ""}>${[["", "Not recorded"], ["female", "Female"], ["male", "Male"], ["other", "Other"]].map(([v, l]) => html`<option value="${v}" ${s.patient.sex === v ? raw("selected") : ""}>${t(l)}</option>`)}</select></label>
    </div>
  </div>

  <div class="card">
    <h2>${t("Case notes")}</h2>
    <textarea data-notes style="min-height:140px" placeholder="${t("History, symptoms, onset, what you have observed so far, in your own words. The AI reads these notes.")}" ${locked ? raw("disabled") : ""}>${s.notes || ""}</textarea>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">${t("My history fields")}</h2>
      <button class="small" data-hf-act="toggle">${edit ? t("Done editing") : fields.length ? t("Edit my fields") : t("Create my fields")}</button></div>
    <p class="note" style="margin:6px 0 4px">${t("Your own reusable checklist. Build it once; it appears for every patient on this device.")}</p>
    ${fields.length && !edit ? fields.map(f => html`<div class="q"><div class="qt">${f.label}</div>${fieldInput(f, s.fields[f.id], locked)}</div>`) : ""}
    ${!fields.length && !edit ? html`<p class="mute" style="margin:6px 0 0">${t("No fields yet. Your case notes above are enough; add fields only if you want a structured checklist.")}</p>` : ""}
    ${edit ? html`
      <ul class="fieldlist">${fields.map((f, i) => html`<li><span><b>${f.label}</b> <span class="mute">· ${t({ yesno: "Yes / no", text: "Text", choice: "Choice" }[f.type])}${f.type === "choice" ? ": " + (f.options || []).join(", ") : ""}</span></span>
        <span class="row" style="gap:4px"><button class="small" data-hf-up="${i}" ${i === 0 ? raw("disabled") : ""} aria-label="${t("Move up")}">↑</button><button class="small danger" data-hf-del="${f.id}" aria-label="${t("Delete field")}">✕</button></span></li>`)}</ul>
      <div class="form" style="margin-top:10px;align-items:end">
        <label class="field"><span>${t("Question or field name")}</span><input type="text" id="fsa-hf-label" placeholder="${t("e.g. Recent ear pain")}"></label>
        <label class="field"><span>${t("Answer type")}</span><select id="fsa-hf-type"><option value="yesno">${t("Yes / no")}</option><option value="text">${t("Text")}</option><option value="choice">${t("Choice")}</option></select></label>
        <label class="field"><span>${t("Choices (comma separated, for Choice)")}</span><input type="text" id="fsa-hf-opts" placeholder="${t("e.g. Hours, Days, Weeks")}"></label>
      </div>
      <div class="row" style="margin-top:10px"><button class="primary" data-hf-act="add">${t("Add field")}</button></div>` : ""}
  </div>

  <div class="card">
    <h2>${t("Safety check")}</h2>
    <p class="note" style="margin:0 0 6px">${t("Tick anything present. Each alert names its clinical source. These are the only built-in rules in the app.")}</p>
    ${SAFETY_QUESTIONS.map(q => html`<label class="check"><input type="checkbox" data-safety="${q.key}" ${s.safety[q.key] ? raw("checked") : ""} ${locked ? raw("disabled") : ""}> ${t(q.q)}</label>`)}
  </div>
  <div class="row"><button data-go="exam">${t("Back to examine")}</button><button class="primary" data-go="results">${t("View findings and ask the AI")}</button></div>
</div>`.s;
}

export function bindNotes(app) {
  const sec = app.root.querySelector("[data-screen=notes]");
  const save = () => app.store.setSetting("historyFields", app.historyFields).catch(err => alert(t("Could not save your fields: {e}", { e: err.message })));
  sec.addEventListener("input", e => {
    const el = e.target, s = app.session; if (s.locked) return;
    if (el.dataset.pt) s.patient[el.dataset.pt] = el.value;
    if (el.hasAttribute("data-notes")) s.notes = el.value;
    if (el.dataset.hf) s.fields[el.dataset.hf] = el.value;
  });
  sec.addEventListener("change", e => {
    const el = e.target, s = app.session; if (s.locked) return;
    if (el.name && el.name.startsWith("hf|")) s.fields[el.name.slice(3)] = el.value;
    if (el.dataset.safety) { s.safety[el.dataset.safety] = el.checked; app.compute(); renderNotes(app); }
  });
  sec.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.hfAct === "toggle") { app.editFields = !app.editFields; renderNotes(app); }
    else if (b.dataset.hfAct === "add") {
      const label = sec.querySelector("#fsa-hf-label").value.trim(), type = sec.querySelector("#fsa-hf-type").value;
      const options = sec.querySelector("#fsa-hf-opts").value.split(",").map(x => x.trim()).filter(Boolean);
      if (!label) { sec.querySelector("#fsa-hf-label").focus(); return; }
      if (type === "choice" && options.length < 2) { alert(t("Enter at least two choices, separated by commas.")); return; }
      app.historyFields = [...app.historyFields, { id: uid(), label, type, ...(type === "choice" ? { options } : {}) }];
      save(); renderNotes(app); sec.querySelector("#fsa-hf-label").focus();
    } else if (b.dataset.hfDel) {
      const f = app.historyFields.find(x => x.id === b.dataset.hfDel);
      if (!confirm(t("Delete the field “{f}”? Answers already saved in visits are kept.", { f: f.label }))) return;
      app.historyFields = app.historyFields.filter(x => x.id !== b.dataset.hfDel); save(); renderNotes(app);
    } else if (b.dataset.hfUp) {
      const i = +b.dataset.hfUp, a = [...app.historyFields]; [a[i - 1], a[i]] = [a[i], a[i - 1]];
      app.historyFields = a; save(); renderNotes(app);
    }
  });
}
