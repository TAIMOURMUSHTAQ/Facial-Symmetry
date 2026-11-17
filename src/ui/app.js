/* Application shell, therapist-led: the therapist decides what to examine.
   Examine (free captures) -> Case notes (optional) -> Findings and AI -> Save and report. */
import { DEFAULTS } from "../config.js";
import { t, setLang, dir } from "../i18n/index.js";
import { html, raw, uid } from "../util.js";
import { loadLandmarker } from "../vision/loader.js";
import { Vision } from "../vision/source.js";
import { METRICS, baseline, summarizeAll } from "../engine/measure.js";
import { safetyFlags } from "../knowledge/safety.js";
import { createStore, MemoryStore } from "../store/index.js";
import { renderResults, bindResults } from "./results.js";
import { renderReport, bindReport, printHTML, buildReport } from "./report.js";
import { renderPatients, bindPatients, refreshPatients, showPatients } from "./patients.js";
import { renderNotes, bindNotes } from "./notes.js";
import { aiStatus, askAI, fingerprint } from "../ai/assist.js";

const SCREENS = [["exam", "Examine"], ["notes", "Case notes"], ["results", "Findings and AI"], ["report", "Save and report"]];
const DURATIONS = [[0, "Photo"], [3, "3 s"], [5, "5 s"], [10, "10 s"], [30, "30 s"]];

export function newSession() {
  return { id: uid(), startedAt: new Date().toISOString(), patientId: null, patient: { age: "", sex: "" }, notes: "", fields: {}, safety: {},
    captures: [], clinician: "", impression: "", plan: "", locked: false, report: null, saved: null, ai: null, saveError: null };
}

export class App {
  constructor(root, options = {}) {
    this.root = root; this.cfg = { ...DEFAULTS, ...options };
    setLang(this.cfg.lang);
    root.classList.add("fsa"); root.dir = dir(); root.lang = this.cfg.lang;
    this.session = newSession(); this.screen = "exam"; this.open = new Set();
    this.vision = null; this.rec = null; this._msgT = 0; this.m = []; this.flags = [];
    this.store = new MemoryStore(); this.patients = []; this.prevVisits = []; this.templates = []; this.historyFields = [];
    this.pui = { view: "list", selId: null, q: "" }; this.ai = { status: null, busy: false, error: null }; this.saveTarget = "";
    this.renderShell(); this.compute(); this.renderPatientChip(); this.go("exam");
    this.ready = this.initStore();
    aiStatus(this.cfg).then(st => { this.ai.status = st; if (this.screen === "results") renderResults(this); });
    this.loadModel();
  }

  async initStore() {
    this.store = await createStore(this.cfg);
    try {
      await refreshPatients(this);
      this.templates = await this.store.listTemplates();
      this.historyFields = (await this.store.getSetting("historyFields")) || [];
    } catch (err) { console.error(err); }
    this.renderCaptures(); this.renderComposer();
    if (this.screen === "patient") renderPatients(this);
    if (this.screen === "notes") renderNotes(this);
  }

  $(s) { return this.root.querySelector(s); }
  $$(s) { return [...this.root.querySelectorAll(s)]; }

  /* ---------------- shell ---------------- */
  renderShell() {
    this.root.innerHTML = html`
<header class="hdr">
  <h1>${t("Facial Symmetry Assistant")}</h1>
  <div class="right">
    <span class="chip" id="fsa-curpt" hidden></span>
    <span class="chip">${t("Decision support only. Not a diagnosis.")}</span>
    <button class="small" data-act="patients">${t("Patients")}</button>
  </div>
</header>
<nav class="nav" aria-label="${t("Sections")}">
  ${SCREENS.map(([id, name], i) => html`<button data-go="${id}"><span class="n">${i + 1}</span>${t(name)}</button>`)}
</nav>
<main>
  <section data-screen="patient"><div id="fsa-patients"></div></section>
  <section data-screen="exam" class="exam">${raw(this.examHTML())}</section>
  <section data-screen="notes" class="narrow"><div id="fsa-notes"></div></section>
  <section data-screen="results"><div id="fsa-results"></div></section>
  <section data-screen="report" class="narrow"><div id="fsa-report"></div></section>
</main>
<div class="print" id="fsa-print"></div>`.s;
    this.bindShell(); this.bindExam();
    bindNotes(this); bindResults(this); bindReport(this); bindPatients(this);
  }

  go(screen) {
    this.screen = screen;
    this.$$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== screen; });
    this.$$(".nav [data-go]").forEach(b => b.setAttribute("aria-current", b.dataset.go === screen ? "step" : "false"));
    if (screen === "patient") showPatients(this);
    if (screen === "exam") { this.renderComposer(); this.renderCaptures(); }
    if (screen === "notes") renderNotes(this);
    if (screen === "results") { this.compute(); renderResults(this); }
    if (screen === "report") { this.compute(); renderReport(this); }
    if (this.root.getBoundingClientRect().top < 0) this.root.scrollIntoView({ block: "start" });
  }

  bindShell() {
    this.root.addEventListener("click", e => {
      const g = e.target.closest("[data-go]");
      if (g && this.root.contains(g)) { this.go(g.dataset.go); return; }
      if (e.target.closest("[data-act='patients']")) { this.pui.view = this.pui.selId ? "detail" : "list"; this.go("patient"); }
    });
  }

  compute() {
    const s = this.session;
    this.m = summarizeAll(s.captures);
    this.flags = safetyFlags(s.safety);
    const ref = s.captures.find(c => c.reference && c.rec);
    this.refBase = ref ? baseline(ref.rec) : null;
  }

  /* ---------------- sessions and patients ---------------- */
  hasUnsaved() { const s = this.session; return !s.locked && s.captures.some(c => c.rec); }

  async startVisit(p) {
    if (this.hasUnsaved() && !confirm(t("Discard the current unsaved examination and start a new one?"))) return;
    this.cancelRecording(true); this.session = newSession(); this.open = new Set(); this.saveTarget = ""; this.ai.error = null;
    const s = this.session; this.prevVisits = [];
    if (p) {
      s.patientId = p.id; this.pui.selId = p.id; this.pui.view = "detail";
      s.patient = { age: p.age || "", sex: p.sex || "" };
      s.fields = { ...(p.lastFields || {}) };   // the therapist's own history fields carry over; edit if changed
      this.prevVisits = await this.store.listVisits(p.id);
    }
    this.compute(); this.renderPatientChip(); this.go("exam");
  }

  renderPatientChip() {
    const el = this.$("#fsa-curpt"), s = this.session, p = s.patientId && this.patients.find(x => x.id === s.patientId);
    el.hidden = false;
    el.textContent = p ? t("{p} · visit {n}", { p: p.ref || t("Unnamed patient"), n: this.prevVisits.length + 1 }) : t("New examination (not saved yet)");
  }

  async attachPatient(newRef) {
    const s = this.session, target = this.saveTarget;
    if (s.patientId || !target) return;
    let p;
    if (target === "new") {
      const now = new Date().toISOString();
      p = { id: uid(), ref: newRef || "", age: s.patient.age || "", sex: s.patient.sex || "", notes: "", createdAt: now, updatedAt: now, visitCount: 0 };
      await this.store.savePatient(p); await refreshPatients(this);
    } else p = await this.store.getPatient(target);
    if (!p) throw new Error("patient not found");
    s.patientId = p.id; this.pui.selId = p.id; this.pui.view = "detail";
    s.patient = { age: s.patient.age || p.age || "", sex: s.patient.sex || p.sex || "" };
    this.prevVisits = await this.store.listVisits(p.id);
    this.saveTarget = "";
  }

  async saveVisit() {
    const s = this.session;
    if (!s.patientId || !s.report) return null;
    const p = await this.store.getPatient(s.patientId);
    if (!p) return null;
    const number = (this.prevVisits.length ? Math.max(...this.prevVisits.map(v => v.number || 0)) : 0) + 1;
    const visit = { id: s.id, patientId: p.id, number, date: s.report.generatedAt, report: s.report };
    if (this.saveEvidence) visit.evidence = Object.fromEntries(s.captures.filter(c => c.rec && c.rec.evidence).map(c => [c.id, c.rec.evidence]));
    await this.store.saveVisit(visit);
    await this.store.savePatient({ ...p, age: s.patient.age || p.age, sex: s.patient.sex || p.sex, lastFields: s.fields, visitCount: number, lastVisitAt: visit.date, updatedAt: visit.date });
    await refreshPatients(this);
    s.saved = { number, ref: p.ref };
    return visit;
  }

  printReport(report) { this.$("#fsa-print").innerHTML = printHTML(this, report, false); window.print(); }

  /* ---------------- AI ---------------- */
  async runAI(question = "") {
    if (this.ai.busy) return;
    this.ai.busy = true; this.ai.error = null; renderResults(this);
    try {
      this.compute();
      const res = await askAI(this, question);
      this.session.ai = { at: new Date().toISOString(), model: res.model, provider: res.provider, ms: res.ms, question, data: res.data, fp: fingerprint(this) };
    } catch (err) { this.ai.error = err.message; }
    this.ai.busy = false;
    if (this.screen === "results") { const y = window.scrollY; renderResults(this); window.scrollTo(0, y); }
  }

  /** Add a planned (not yet recorded) capture, e.g. from an AI suggestion or a routine. */
  addPlanned(label, seconds = 5, reference = false) {
    const s = this.session, l = String(label || "").trim();
    if (!l || s.captures.some(c => c.label.toLowerCase() === l.toLowerCase())) return false;
    s.captures.push({ id: uid(), label: l, seconds: Number.isFinite(+seconds) ? Math.max(0, Math.min(30, +seconds)) : 5, reference: !!reference && !s.captures.some(c => c.reference), notes: "" });
    return true;
  }

  /* ---------------- examine screen ---------------- */
  examHTML() {
    return html`
<div class="stage">
  <div class="viewport" id="fsa-vp">
    <video playsinline muted autoplay></video><img alt="${t("Uploaded image")}" hidden><canvas></canvas>
    <div class="vp-empty" id="fsa-empty">${t("Loading face model…")}</div>
    <div class="vp-msg" id="fsa-msg" role="status" hidden></div>
    <div class="vp-rec" id="fsa-rec"></div>
    <div class="vp-count" id="fsa-count"></div>
    <div class="vp-say" id="fsa-say"></div>
  </div>
  <div class="bar">
    <button class="primary" data-src="camera" disabled>${t("Start camera")}</button>
    <button data-src="video" disabled>${t("Upload video")}</button>
    <button data-src="image" disabled>${t("Upload image")}</button>
    <label class="note" style="margin:0;display:flex;gap:6px;align-items:center"><input type="checkbox" id="fsa-mirror">${t("Mirror preview")}</label>
    <input type="file" accept="video/*" hidden id="fsa-vin"><input type="file" accept="image/*" hidden id="fsa-iin">
    <div class="readout"><span>${t("Roll")} <b id="fsa-roll">–</b></span><span>${t("Pitch")} <b id="fsa-pitch">–</b></span><span>${t("Yaw")} <b id="fsa-yaw">–</b></span><span><b id="fsa-fps">0</b> fps</span><span id="fsa-mode"></span></div>
  </div>
  <p class="note">${t("Right and left always mean the patient's own sides. Without mirroring, the patient's right appears on the left of the screen. Images and video stay on this device.")}</p>
</div>
<div class="stack">
  <div class="card" id="fsa-composer"></div>
  <div class="card" id="fsa-caps"></div>
</div>`.s;
  }

  knownLabels() {
    const set = new Set();
    for (const tp of this.templates) for (const it of tp.items) set.add(it.label);
    for (const c of this.session.captures) set.add(c.label);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  renderComposer() {
    const box = this.$("#fsa-composer"); if (!box) return;
    const s = this.session, rec = !!this.rec, hasRef = s.captures.some(c => c.reference);
    const kind = this.vision ? this.vision.kind : "none";
    box.innerHTML = html`
<h2>${t("New capture")}</h2>
<label class="field"><span>${t("What will the patient do? (your own words)")}</span>
  <input type="text" id="fsa-label" list="fsa-labels" autocomplete="off" placeholder="${t("e.g. Relaxed face, Raise eyebrows, Smile, Say “pa-ta-ka”")}" ${rec ? raw("disabled") : ""}></label>
<datalist id="fsa-labels">${this.knownLabels().map(l => html`<option value="${l}">`)}</datalist>
<div class="row" style="margin-top:8px;align-items:flex-end">
  <label class="field" style="width:130px"><span>${t("Length")}</span><select id="fsa-dur" ${rec ? raw("disabled") : ""}>${DURATIONS.map(([v, l]) => html`<option value="${v}" ${v === 5 ? raw("selected") : ""}>${t(l)}</option>`)}</select></label>
  <label class="note" style="margin:0 0 8px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="fsa-ref" ${hasRef ? "" : raw("checked")} ${rec ? raw("disabled") : ""}>${t("Reference capture")}</label>
</div>
<p class="note" style="margin-top:4px">${hasRef ? t("Other captures are measured as change from the reference.") : t("Mark one capture as the reference (usually a relaxed face). Other captures are then measured as change from it.")}</p>
<div class="prog" id="fsa-prog"><i></i></div>
<div class="row">
  ${rec ? html`<button class="danger" data-cap-act="stop">${t("Stop")}</button>` : html`<button class="primary" data-cap-act="record" ${kind === "none" || s.locked ? raw("disabled") : ""}>${kind === "image" ? t("Measure this image") : t("Record")}</button>`}
  ${kind === "none" ? html`<span class="note" style="margin:0">${t("Start the camera or upload media first.")}</span>` : ""}
</div>`.s;
  }

  renderCaptures() {
    const box = this.$("#fsa-caps"); if (!box) return;
    const s = this.session, byId = Object.fromEntries(this.m.map(x => [x.id, x]));
    const line = c => {
      const m = byId[c.id];
      if (!m) return "";
      if (!m.valid) return html`<div class="note" style="color:var(--amber)">${t(m.reason)}</div>`;
      const top = m.rows.slice(0, 2).map(r => `${t(r.name)}: R ${m.mode === "change" && r.R > 0 ? "+" : ""}${r.R}${r.unit ? " " + r.unit : ""}, L ${m.mode === "change" && r.L > 0 ? "+" : ""}${r.L}${r.unit ? " " + r.unit : ""}`).join(" · ");
      return html`<div class="note" style="margin-top:4px">${m.mode === "change" ? t("Largest change") + ": " : t("Absolute values") + ": "}${top} <span class="mute">(${t("{n} frames", { n: m.q.ok })})</span></div>`;
    };
    box.innerHTML = html`
<div class="row" style="justify-content:space-between"><h2 style="margin:0">${t("Captures")} ${s.captures.length ? html`<span class="pill">${s.captures.filter(c => c.rec).length}/${s.captures.length}</span>` : ""}</h2></div>
<div class="row" style="margin:10px 0">
  <select id="fsa-tpl" style="flex:1;min-width:160px" aria-label="${t("My routines")}"><option value="">${this.templates.length ? t("Load one of my routines…") : t("No saved routines yet")}</option>${this.templates.map(tp => html`<option value="${tp.id}">${tp.name} (${tp.items.length})</option>`)}</select>
  <button class="small" data-cap-act="save-tpl" ${s.captures.length ? "" : raw("disabled")}>${t("Save as my routine")}</button>
  <button class="small danger" data-cap-act="del-tpl" ${this.templates.length ? "" : raw("disabled")}>${t("Delete routine")}</button>
</div>
${s.captures.length ? html`<ol class="caplist">${s.captures.map(c => html`
  <li class="capitem ${c.rec ? "" : "planned"}">
    <div class="row" style="justify-content:space-between;gap:6px">
      <div><span class="dot ${c.rec ? "done" : ""}">${c.rec ? "✓" : ""}</span> <b>${c.label}</b> ${c.reference ? html`<span class="pill possible">${t("Reference")}</span>` : ""} <span class="mute" style="font-size:12.5px">${c.seconds ? c.seconds + " s" : t("Photo")}</span></div>
      <div class="row" style="gap:6px">
        <button class="small ${c.rec ? "" : "primary"}" data-cap-rec="${c.id}" ${this.rec || s.locked || !this.vision || this.vision.kind === "none" ? raw("disabled") : ""}>${c.rec ? t("Record again") : t("Record")}</button>
        ${!c.reference ? html`<button class="small" data-cap-refset="${c.id}" ${s.locked ? raw("disabled") : ""}>${t("Make reference")}</button>` : ""}
        <button class="small danger" data-cap-del="${c.id}" aria-label="${t("Remove {c}", { c: c.label })}" ${s.locked ? raw("disabled") : ""}>✕</button>
      </div>
    </div>
    ${line(c)}
    <textarea class="capnotes" data-cap-notes="${c.id}" placeholder="${t("Your observations (optional)")}" ${s.locked ? raw("disabled") : ""}>${c.notes || ""}</textarea>
  </li>`)}</ol>` : html`<p class="mute" style="margin:0">${t("No captures yet. You decide the examination: type what you want the patient to do, record it, and repeat. Load one of your routines, or ask the AI for suggestions on the Findings screen.")}</p>`}
<div class="row" style="margin-top:12px"><button class="primary" data-go="results" ${s.captures.some(c => c.rec) ? "" : raw("disabled")}>${t("View findings and ask the AI")}</button></div>`.s;
  }

  bindExam() {
    const vp = this.$("#fsa-vp"), sec = this.$("[data-screen=exam]");
    sec.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      const s = this.session;
      if (b.dataset.src === "camera") this.toggleCamera();
      else if (b.dataset.src === "video") this.$("#fsa-vin").click();
      else if (b.dataset.src === "image") this.$("#fsa-iin").click();
      else if (b.dataset.capAct === "record") this.startRecording(null);
      else if (b.dataset.capAct === "stop") { this.cancelRecording(); this.renderComposer(); this.renderCaptures(); }
      else if (b.dataset.capRec) this.startRecording(b.dataset.capRec);
      else if (b.dataset.capRefset) { s.captures.forEach(c => { c.reference = c.id === b.dataset.capRefset; }); this.compute(); this.renderCaptures(); this.renderComposer(); }
      else if (b.dataset.capDel) {
        const c = s.captures.find(x => x.id === b.dataset.capDel);
        if (c && c.rec && !confirm(t("Remove “{c}” and its recording?", { c: c.label }))) return;
        s.captures = s.captures.filter(x => x.id !== b.dataset.capDel); this.compute(); this.renderCaptures(); this.renderComposer();
      }
      else if (b.dataset.capAct === "save-tpl") {
        const name = prompt(t("Name this routine (e.g. “My facial palsy routine”):"));
        if (!name || !name.trim()) return;
        await this.store.saveTemplate({ id: uid(), name: name.trim(), items: s.captures.map(c => ({ label: c.label, seconds: c.seconds, reference: !!c.reference })), createdAt: new Date().toISOString() });
        this.templates = await this.store.listTemplates(); this.renderCaptures();
      }
      else if (b.dataset.capAct === "del-tpl") {
        const id = this.$("#fsa-tpl").value, tp = this.templates.find(x => x.id === id);
        if (!tp) { alert(t("Choose a routine in the list first.")); return; }
        if (!confirm(t("Delete the routine “{n}”?", { n: tp.name }))) return;
        await this.store.deleteTemplate(id); this.templates = await this.store.listTemplates(); this.renderCaptures();
      }
    });
    sec.addEventListener("change", e => {
      const el = e.target;
      if (el.id === "fsa-mirror") vp.classList.toggle("mirror", el.checked);
      if (el.id === "fsa-vin" || el.id === "fsa-iin") {
        const f = el.files[0]; el.value = ""; if (!f) return;
        (el.id === "fsa-vin" ? this.vision.loadVideo(f) : this.vision.loadImage(f)).then(() => this.afterSource(), err => this.msg(t("Could not open the file: {e}", { e: err.message }), "warn"));
      }
      if (el.id === "fsa-tpl" && el.value) {
        const tp = this.templates.find(x => x.id === el.value);
        if (tp) { tp.items.forEach(it => this.addPlanned(it.label, it.seconds, it.reference)); this.renderCaptures(); this.renderComposer(); }
      }
    });
    sec.addEventListener("input", e => {
      const id = e.target.dataset.capNotes;
      if (id) { const c = this.session.captures.find(x => x.id === id); if (c) c.notes = e.target.value; }
    });
    sec.addEventListener("keydown", e => { if (e.target.id === "fsa-label" && e.key === "Enter") { e.preventDefault(); this.startRecording(null); } });
    if (this.cfg.mirrorPreview) { this.$("#fsa-mirror").checked = true; vp.classList.add("mirror"); }
  }

  async loadModel() {
    try {
      const { mod, landmarker, offline } = await loadLandmarker();
      const vp = this.$("#fsa-vp");
      this.vision = new Vision({ video: vp.querySelector("video"), image: vp.querySelector("img"), canvas: vp.querySelector("canvas"),
        landmarker, mod, poseLimit: this.cfg.poseLimitDeg, onFrame: f => this.onFrame(f) });
      this.$$("[data-src]").forEach(b => { b.disabled = false; });
      this.$("#fsa-empty").textContent = t("Start the camera, or upload a video or image of the patient.");
      this.$("#fsa-mode").textContent = offline ? t("model: on device") : t("model: online");
      if (this.cfg.autoStartCamera && this.screen === "exam" && this.vision.kind === "none") this.toggleCamera();
    } catch (err) {
      this.$("#fsa-empty").textContent = t("Could not load the face model: {e}. Serve this folder over http(s) or localhost.", { e: err.message });
    }
  }

  async toggleCamera() {
    const v = this.vision;
    if (v.kind === "camera") { this.cancelRecording(true); v.stop(); this.afterSource(); return; }
    try { await v.startCamera(); this.afterSource(); }
    catch (err) { this.msg(t("Camera unavailable: {e}. Allow camera access and try again.", { e: err.message }), "warn"); }
  }

  afterSource() {
    const k = this.vision.kind;
    this.$("#fsa-empty").hidden = k !== "none";
    this.$("#fsa-msg").hidden = k === "none";
    this.$("#fsa-vp").style.aspectRatio = k === "none" ? "" : String(this.vision.aspect);
    this.$("[data-src=camera]").textContent = k === "camera" ? t("Stop camera") : t("Start camera");
    this.renderComposer(); this.renderCaptures();
  }

  msg(text, tone = "") { const m = this.$("#fsa-msg"); m.hidden = false; m.textContent = text; m.className = "vp-msg " + tone; }

  onFrame(f) {
    const now = performance.now();
    if (this.rec && this.rec.phase === "rec") this.collect(f);
    if (now - this._msgT < 100 && !f.single) return;
    this._msgT = now;
    if (f.pose) {
      this.$("#fsa-roll").textContent = Math.round(f.pose.roll) + "°";
      this.$("#fsa-pitch").textContent = Math.round(f.pose.pitch) + "°";
      this.$("#fsa-yaw").textContent = Math.round(f.pose.yaw) + "°";
    }
    this.$("#fsa-fps").textContent = this.vision.fps;
    if (this.rec && this.rec.phase === "rec") return;
    if (!f.face) this.msg(t("No face detected. Centre the patient in the oval."), "warn");
    else if (!f.sizeOk) this.msg(t("Face too small. Move the camera closer."), "warn");
    else if (!f.poseOk) this.msg(t("Head turned or tilted more than {d}°. Ask the patient to face the camera.", { d: this.cfg.poseLimitDeg }), "warn");
    else this.msg(t("Face detected. Ready to record."), "ok");
  }

  /* ---------------- recording ---------------- */
  newRec() { return { frames: [], total: 0, noFace: 0, badPose: 0, single: false, evidence: null, at: new Date().toISOString(), source: this.vision.kind }; }
  slim(f) { return { t: f.t, m: f.m, pose: f.pose, ok: f.ok, still: f.still }; }

  /** capId: record a listed capture; null: create one from the composer. */
  startRecording(capId) {
    const v = this.vision, s = this.session;
    if (this.rec) return;
    if (!v || v.kind === "none") { this.msg(t("Start the camera or upload media first."), "warn"); return; }
    if (s.locked) { this.msg(t("This examination is locked. Start a new one to record again."), "warn"); return; }
    let cap = capId ? s.captures.find(c => c.id === capId) : null;
    if (!cap) {
      const input = this.$("#fsa-label"), label = (input.value || "").trim() || t("Capture {n}", { n: s.captures.length + 1 });
      const existing = s.captures.find(c => c.label.toLowerCase() === label.toLowerCase());
      const reference = this.$("#fsa-ref").checked;
      if (existing) cap = existing;
      else { cap = { id: uid(), label, seconds: +this.$("#fsa-dur").value, reference: false, notes: "" }; s.captures.push(cap); }
      if (reference) s.captures.forEach(c => { c.reference = c === cap; });
    }
    const photo = cap.seconds === 0 || v.kind === "image";
    if (photo) {
      const f = v.latest, rec = this.newRec();
      rec.single = true; rec.total = 1;
      if (!f || !f.face) rec.noFace = 1; else { if (!f.ok) rec.badPose = 1; rec.frames.push(this.slim(f)); }
      rec.evidence = v.snapshot();
      this.finishRecording(cap, rec); return;
    }
    if (v.kind === "video" && v.video.paused) v.video.play().catch(() => {});
    this.rec = { cap, rec: this.newRec(), phase: "count", best: -Infinity, lastShot: 0 };
    const say = this.$("#fsa-say"); say.textContent = cap.label; say.classList.add("on");
    this.renderComposer(); this.renderCaptures();
    const cd = this.$("#fsa-count");
    let n = v.kind === "camera" ? 3 : 0;
    const tick = () => {
      if (!this.rec || this.rec.cap !== cap) return;
      if (n > 0) { cd.textContent = n; cd.classList.add("on"); n--; this.rec.timer = setTimeout(tick, 1000); return; }
      cd.classList.remove("on");
      this.rec.phase = "rec"; this.rec.t0 = performance.now();
      const dur = cap.seconds * 1000, recEl = this.$("#fsa-rec");
      recEl.classList.add("on");
      this.rec.timer = setInterval(() => {
        const el = performance.now() - this.rec.t0, bar = this.$("#fsa-prog i");
        if (bar) bar.style.width = Math.min(100, el / dur * 100) + "%";
        recEl.textContent = "● " + Math.max(0, Math.ceil((dur - el) / 1000)) + " s";
        if (el >= dur) { const r = this.rec; this.cancelRecording(true); this.finishRecording(cap, r.rec); }
      }, 100);
    };
    tick();
  }

  collect(f) {
    const R = this.rec, rec = R.rec, cap = R.cap;
    rec.total++;
    if (!f.face) { rec.noFace++; return; }
    if (!f.ok) rec.badPose++;
    rec.frames.push(this.slim(f));
    if (!f.ok) return;
    const now = performance.now(), el = now - R.t0;
    if (!cap.reference && this.refBase) {
      // evidence frame = moment of largest change from the reference
      const ref = this.refBase.m;
      const sc = METRICS.reduce((a, mt) => a + Math.abs(mt.value(f.m, "R") - mt.value(ref, "R")) + Math.abs(mt.value(f.m, "L") - mt.value(ref, "L")), 0);
      if (sc > R.best && now - R.lastShot > 150) { R.best = sc; R.lastShot = now; rec.evidence = this.vision.snapshot(); }
    } else if (!rec.evidence && el >= cap.seconds * 400) rec.evidence = this.vision.snapshot();
    this.msg(t("Recording… {n} usable frames", { n: rec.frames.filter(x => x.ok).length }), "ok");
  }

  cancelRecording(keep) {
    if (!this.rec) return;
    clearTimeout(this.rec.timer); clearInterval(this.rec.timer);
    this.rec = null;
    this.$("#fsa-count").classList.remove("on"); this.$("#fsa-rec").classList.remove("on"); this.$("#fsa-say").classList.remove("on");
    if (!keep) this.msg(t("Recording stopped. Nothing was saved."), "warn");
  }

  finishRecording(cap, rec) {
    if (!rec.evidence && rec.frames.length) rec.evidence = this.vision.snapshot();
    cap.rec = rec;
    this.compute();
    const input = this.$("#fsa-label"); if (input) input.value = "";
    this.renderComposer(); this.renderCaptures();
    const nextPlanned = this.session.captures.find(c => !c.rec);
    this.msg(nextPlanned ? t("Saved “{c}”. Next on your list: “{n}”.", { c: cap.label, n: nextPlanned.label }) : t("Saved “{c}”.", { c: cap.label }), "ok");
  }
}
