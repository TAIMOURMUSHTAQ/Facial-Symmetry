/* Application shell: patient -> history -> guided exam -> results -> review and report. */
import { DEFAULTS } from "../config.js";
import { t, setLang, dir } from "../i18n/index.js";
import { html, raw, uid } from "../util.js";
import { loadLandmarker } from "../vision/loader.js";
import { Vision } from "../vision/source.js";
import { STEPS, STEP, GROUPS, stepScore } from "../exam/protocol.js";
import { HISTORY, YN_OPTIONS } from "../knowledge/history.js";
import { analyzeAll } from "../engine/analyze.js";
import { buildFindings, reviewed } from "../engine/findings.js";
import { findPatterns, grade } from "../engine/patterns.js";
import { reason } from "../engine/reason.js";
import { T } from "../engine/thresholds.js";
import { createStore, MemoryStore } from "../store/index.js";
import { renderResults, bindResults } from "./results.js";
import { renderReport, bindReport, printHTML } from "./report.js";
import { renderPatients, bindPatients, refreshPatients, showPatients, CHRONIC } from "./patients.js";
import { stepSummary } from "./summary.js";

const SCREENS = [["patient", "Patient"], ["history", "History"], ["exam", "Guided exam"], ["results", "Results"], ["report", "Review and report"]];

export function newSession() {
  return { id: uid(), startedAt: new Date().toISOString(), patientId: null, patient: {}, history: {}, checklist: {}, records: {}, ratings: {}, skipped: {},
    review: {}, clinician: "", impression: "", notes: "", locked: false, report: null, saved: null };
}

export class App {
  constructor(root, options = {}) {
    this.root = root; this.cfg = { ...DEFAULTS, ...options };
    setLang(this.cfg.lang);
    root.classList.add("fsa"); root.dir = dir(); root.lang = this.cfg.lang;
    this.session = newSession(); this.screen = "patient"; this.cur = "rest"; this.open = new Set();
    this.vision = null; this.rec = null; this.restM = null; this._msgT = 0;
    this.store = new MemoryStore(); this.patients = []; this.prevVisits = []; this.pui = { view: "list", selId: null, q: "" };
    this.renderShell(); this.compute(); this.go("patient");
    this.ready = this.initStore();
    this.loadModel();
  }

  async initStore() {
    this.store = await createStore(this.cfg);
    try { await refreshPatients(this); } catch (err) { console.error(err); }
    if (this.screen === "patient") renderPatients(this);
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
    <button class="small" data-act="new-patient">${t("Patients")}</button>
  </div>
</header>
<nav class="nav" aria-label="${t("Assessment steps")}">
  ${SCREENS.map(([id, name], i) => html`<button data-go="${id}"><span class="n">${i + 1}</span>${t(name)}</button>`)}
</nav>
<main>
  <section data-screen="patient"><div id="fsa-patients"></div></section>
  <section data-screen="history" class="narrow stack">${raw(this.historyHTML())}</section>
  <section data-screen="exam" class="exam">${raw(this.examHTML())}</section>
  <section data-screen="results"><div id="fsa-results"></div></section>
  <section data-screen="report" class="narrow"><div id="fsa-report"></div></section>
</main>
<div class="print" id="fsa-print"></div>`.s;
    this.bindShell(); this.bindForms(); this.bindExam();
    bindResults(this); bindReport(this); bindPatients(this);
  }

  go(screen) {
    this.screen = screen;
    this.$$("[data-screen]").forEach(s => { s.hidden = s.dataset.screen !== screen; });
    this.$$(".nav [data-go]").forEach(b => b.setAttribute("aria-current", b.dataset.go === screen ? "step" : "false"));
    if (screen === "patient") showPatients(this);
    if (screen === "history") this.renderHistoryFlags();
    if (screen === "exam") this.renderStep();
    if (screen === "results") { this.compute(); renderResults(this); }
    if (screen === "report") { this.compute(); renderReport(this); }
    if (this.root.getBoundingClientRect().top < 0) this.root.scrollIntoView({ block: "start" });
  }

  bindShell() {
    this.root.addEventListener("click", e => {
      const g = e.target.closest("[data-go]");
      if (g && this.root.contains(g)) { this.go(g.dataset.go); return; }
      const a = e.target.closest("[data-act='new-patient']");
      if (a) this.newPatient();
    });
  }

  hasUnsaved() {
    const s = this.session;
    return !s.locked && (Object.keys(s.records).length > 0 || Object.keys(s.ratings).length > 0);
  }

  /** Header button: back to the patient list (keeps the current assessment unless a new visit is started). */
  newPatient() { this.pui.view = this.pui.selId ? "detail" : "list"; this.go("patient"); }

  /** Start a fresh assessment, for a saved patient or (p = null) as a quick assessment that is not saved. */
  async startVisit(p) {
    if (this.hasUnsaved() && !confirm(t("Discard the current unsaved assessment and start a new one?"))) return;
    this.cancelRecording(); this.session = newSession(); this.cur = "rest"; this.restM = null; this.open = new Set();
    const s = this.session;
    this.prevVisits = [];
    if (p) {
      s.patientId = p.id; this.pui.selId = p.id; this.pui.view = "detail";
      s.patient = { ref: p.ref || "", age: p.age || "", sex: p.sex || "" };
      for (const k of CHRONIC) if (p.chronic && p.chronic[k]) s.history[k] = p.chronic[k];
      this.prevVisits = await this.store.listVisits(p.id);
      s.patient.reason = this.prevVisits.length ? "followup" : "";
    }
    this.syncHistoryForm(); this.compute(); this.renderPatientChip(); this.go("history");
  }

  renderPatientChip() {
    const el = this.$("#fsa-curpt"), s = this.session, p = s.patientId && this.patients.find(x => x.id === s.patientId);
    el.hidden = false;
    el.textContent = p ? t("{p} · visit {n}", { p: p.ref || t("Unnamed patient"), n: this.prevVisits.length + 1 }) : t("Quick assessment (not saved)");
  }

  /** Save the locked session as a visit of the current patient. */
  async saveVisit() {
    const s = this.session;
    if (!s.patientId || !s.report) return null;
    const p = await this.store.getPatient(s.patientId);
    if (!p) return null;
    const number = (this.prevVisits.length ? Math.max(...this.prevVisits.map(v => v.number || 0)) : 0) + 1;
    const visit = { id: s.id, patientId: p.id, number, date: s.report.generatedAt, report: s.report };
    if (this.saveEvidence) visit.evidence = Object.fromEntries(STEPS.filter(st => s.records[st.id] && s.records[st.id].evidence).map(st => [st.id, s.records[st.id].evidence]));
    await this.store.saveVisit(visit);
    const chronic = { ...(p.chronic || {}) };
    for (const k of CHRONIC) if (s.history[k] && s.history[k] !== "unknown") chronic[k] = s.history[k];
    await this.store.savePatient({ ...p, age: s.patient.age || p.age, sex: s.patient.sex || p.sex, chronic, visitCount: number, lastVisitAt: visit.date, updatedAt: visit.date });
    await refreshPatients(this);
    s.saved = { number, ref: p.ref };
    return visit;
  }

  printReport(report) {
    this.$("#fsa-print").innerHTML = printHTML(this, report, false);
    window.print();
  }

  /* ---------------- reasoning pipeline ---------------- */
  compute() {
    const s = this.session, recs = {};
    for (const st of STEPS) {
      if (s.skipped[st.id]) continue;
      const rec = s.records[st.id], rating = s.ratings[st.id];
      if (rec || rating) recs[st.id] = { ...(rec || { frames: [], total: 0 }), rating: rating || {} };
    }
    const A = analyzeAll(recs);
    const F0 = buildFindings(A);
    const F = reviewed(F0, s.review);
    const P = findPatterns(F, A);
    const G = grade(P, A, F);
    const R = reason({ F, P, history: s.history, checklist: s.checklist, patient: s.patient });
    this.c = { A, F0, F, P, G, R };
    return this.c;
  }

  /* ---------------- history ---------------- */
  historyHTML() {
    const seg = (name, opts, yn) => html`<div class="seg${yn ? " yn" : ""}" role="radiogroup">${opts.map(([v, l]) => html`<label><input type="radio" name="${name}" value="${v}">${t(l)}</label>`)}</div>`;
    return html`
<div id="fsa-hflags" class="stack"></div>
<div class="card">
  <h2>${t("This visit")}</h2>
  <div class="form" id="fsa-visit">
    <label class="field"><span>${t("Age (years)")}</span><input type="number" name="age" min="0" max="120" inputmode="numeric"></label>
    <label class="field"><span>${t("Sex")}</span><select name="sex"><option value="">${t("Not recorded")}</option><option value="female">${t("Female")}</option><option value="male">${t("Male")}</option><option value="other">${t("Other")}</option></select></label>
    <label class="field"><span>${t("Side reported by patient or referrer")}</span><select name="reportedSide"><option value="">${t("Not stated")}</option><option value="R">${t("Patient's right")}</option><option value="L">${t("Patient's left")}</option><option value="both">${t("Both sides")}</option></select></label>
    <label class="field"><span>${t("Reason for assessment")}</span><select name="reason"><option value="">${t("Not stated")}</option><option value="new">${t("New facial asymmetry or weakness")}</option><option value="followup">${t("Follow-up of a known condition")}</option><option value="screen">${t("Screening (speech, swallowing or oral-motor)")}</option></select></label>
  </div>
  <p class="note">${t("This tool helps you examine systematically. It measures, suggests possibilities and explains its reasoning. You make the diagnosis.")}</p>
</div>
${HISTORY.map(g => html`
<div class="card">
  <h2>${t(g.group)}</h2>
  ${g.items.map(i => html`<div class="q"><div class="qt">${t(i.q)}</div>${seg("h_" + i.key, i.type === "yn" ? YN_OPTIONS : i.options, i.type === "yn")}</div>`)}
</div>`)}
<div class="row"><button data-go="patient">${t("Back")}</button><button class="primary" data-go="exam">${t("Continue to guided exam")}</button></div>
<p class="note">${t("Unanswered questions are treated as unknown. Long-term conditions (diabetes, blood pressure, thyroid, cancer, MS) carry over to the next visit. Results update automatically when you change answers.")}</p>`.s;
  }

  syncHistoryForm() {
    const s = this.session;
    this.$$("#fsa-visit input, #fsa-visit select").forEach(el => { el.value = s.patient[el.name] || ""; });
    this.$$("[data-screen=history] input[type=radio]").forEach(el => { el.checked = s.history[el.name.slice(2)] === el.value; });
  }

  bindForms() {
    this.$("#fsa-visit").addEventListener("input", e => { const el = e.target; if (el.name) { this.session.patient[el.name] = el.value; this.compute(); } });
    this.$("[data-screen=history]").addEventListener("change", e => {
      const el = e.target; if (!el.name || !el.name.startsWith("h_")) return;
      this.session.history[el.name.slice(2)] = el.value;
      this.compute(); this.renderHistoryFlags();
    });
  }

  renderHistoryFlags() {
    const flags = this.c.R.flags.filter(f => f.level === "emergency");
    this.$("#fsa-hflags").innerHTML = flags.map(f => html`<div class="flag emergency" role="alert"><b>${t(f.title)}</b>${t(f.text)}</div>`.s).join("");
  }

  /* ---------------- guided exam ---------------- */
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
  <div class="card stepcard" id="fsa-step"></div>
  <div class="card steplist"><h2>${t("Examination steps")}</h2><div id="fsa-steps"></div></div>
</div>`.s;
  }

  bindExam() {
    const vp = this.$("#fsa-vp");
    this.$("[data-screen=exam]").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.src === "camera") this.toggleCamera();
      else if (b.dataset.src === "video") this.$("#fsa-vin").click();
      else if (b.dataset.src === "image") this.$("#fsa-iin").click();
      else if (b.dataset.step) { this.cancelRecording(); this.cur = b.dataset.step; this.renderStep(); }
      else if (b.dataset.do) this.stepAction(b.dataset.do);
    });
    this.$("[data-screen=exam]").addEventListener("change", e => {
      const el = e.target;
      if (el.id === "fsa-mirror") vp.classList.toggle("mirror", el.checked);
      if (el.id === "fsa-vin" || el.id === "fsa-iin") {
        const f = el.files[0]; el.value = ""; if (!f) return;
        (el.id === "fsa-vin" ? this.vision.loadVideo(f) : this.vision.loadImage(f)).then(() => this.afterSource(), err => this.msg(t("Could not open the file: {e}", { e: err.message }), "warn"));
      }
      if (el.name && el.name.startsWith("r_") && !this.session.locked) {
        const [, step, key] = el.name.split("|");
        (this.session.ratings[step] ||= {})[key] = el.value;
        delete this.session.skipped[step];
        this.compute(); this.renderStepResult(); this.renderStepList();
      }
    });
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
    } catch (err) {
      this.$("#fsa-empty").textContent = t("Could not load the face model: {e}. Serve this folder over http(s) or localhost.", { e: err.message });
    }
  }

  async toggleCamera() {
    const v = this.vision;
    if (v.kind === "camera") { this.cancelRecording(); v.stop(); this.afterSource(); return; }
    try { await v.startCamera(); this.afterSource(); }
    catch (err) { this.msg(t("Camera unavailable: {e}. Allow camera access and try again.", { e: err.message }), "warn"); }
  }

  afterSource() {
    const k = this.vision.kind;
    this.$("#fsa-empty").hidden = k !== "none";
    this.$("#fsa-msg").hidden = k === "none";
    this.$("#fsa-vp").style.aspectRatio = k === "none" ? "" : String(this.vision.aspect);
    this.$("[data-src=camera]").textContent = k === "camera" ? t("Stop camera") : t("Start camera");
    this.renderStep();
  }

  msg(text, tone = "") {
    const m = this.$("#fsa-msg"); m.hidden = false; m.textContent = text; m.className = "vp-msg " + tone;
  }

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
  stepAction(act) {
    const i = STEPS.findIndex(s => s.id === this.cur);
    if (act === "record") this.startRecording();
    else if (act === "stop") { this.cancelRecording(); this.renderStep(); }
    else if (act === "capture") this.capturePhoto();
    else if (act === "skip") { this.cancelRecording(); this.session.skipped[this.cur] = true; this.compute(); this.next(i); }
    else if (act === "next") this.next(i);
    else if (act === "prev" && i > 0) { this.cur = STEPS[i - 1].id; this.renderStep(); }
    else if (act === "results") this.go("results");
  }

  next(i) {
    if (i < STEPS.length - 1) { this.cur = STEPS[i + 1].id; this.renderStep(); } else this.go("results");
  }

  newRec() { return { frames: [], total: 0, noFace: 0, badPose: 0, single: false, evidence: null, at: new Date().toISOString(), source: this.vision.kind }; }

  startRecording() {
    const step = STEP[this.cur], v = this.vision;
    if (!v || v.kind === "none") { this.msg(t("Start the camera or upload media first."), "warn"); return; }
    if (this.session.locked) { this.msg(t("This session is locked. Start a new patient to record again."), "warn"); return; }
    if (this.rec) return;
    if (step.id !== "rest" && !this.session.records.rest) { this.msg(t("Record the resting face first: every movement is measured against it."), "warn"); }
    if (v.kind === "image") {
      if (!["rest", "move"].includes(step.kind)) { this.msg(t("This step needs the live camera or a video."), "warn"); return; }
      const f = v.latest, rec = this.newRec();
      rec.single = true; rec.total = 1;
      if (!f || !f.face) rec.noFace = 1; else { if (!f.ok) rec.badPose = 1; rec.frames.push(this.slim(f)); }
      rec.evidence = v.snapshot();
      this.finishRecording(step, rec); return;
    }
    if (v.kind === "video" && v.video.paused) v.video.play().catch(() => {});
    const count = v.kind === "camera" ? 3 : 0;
    this.rec = { step, rec: this.newRec(), phase: "count", best: -Infinity, lastShot: 0 };
    const say = this.$("#fsa-say"); say.textContent = t(step.say); say.classList.add("on");
    this.renderStepCard();
    const cd = this.$("#fsa-count");
    let n = count;
    const tickCount = () => {
      if (!this.rec || this.rec.step !== step) return;
      if (n > 0) { cd.textContent = n; cd.classList.add("on"); n--; this.rec.timer = setTimeout(tickCount, 1000); return; }
      cd.classList.remove("on");
      this.rec.phase = "rec"; this.rec.t0 = performance.now();
      const dur = step.dur * 1000, bar = this.$("#fsa-prog i"), recEl = this.$("#fsa-rec");
      recEl.classList.add("on");
      this.rec.timer = setInterval(() => {
        const el = performance.now() - this.rec.t0;
        if (bar) bar.style.width = Math.min(100, el / dur * 100) + "%";
        recEl.textContent = "● " + Math.max(0, Math.ceil((dur - el) / 1000)) + " s";
        if (el >= dur) { const r = this.rec; this.cancelRecording(true); this.finishRecording(step, r.rec); }
      }, 100);
    };
    tickCount();
  }

  slim(f) { return { t: f.t, m: f.m, pose: f.pose, ok: f.ok, still: f.still }; }

  collect(f) {
    const R = this.rec, rec = R.rec, step = R.step;
    rec.total++;
    if (!f.face) { rec.noFace++; return; }
    if (!f.ok) rec.badPose++;
    rec.frames.push(this.slim(f));
    if (!f.ok) return;
    const now = performance.now(), el = now - R.t0;
    if ((step.kind === "move" || step.kind === "repeat") && this.restM) {
      const sc = stepScore(step, f.m, this.restM);
      if (sc > R.best && now - R.lastShot > 150) { R.best = sc; R.lastShot = now; rec.evidence = this.vision.snapshot(); }
    } else if (!rec.evidence && el >= step.dur * 400) rec.evidence = this.vision.snapshot();
    this.msg(t("Recording… {n} usable frames", { n: rec.frames.filter(x => x.ok).length }), "ok");
  }

  cancelRecording(keep) {
    if (!this.rec) return;
    clearTimeout(this.rec.timer); clearInterval(this.rec.timer);
    this.rec = null;
    this.$("#fsa-count").classList.remove("on"); this.$("#fsa-rec").classList.remove("on"); this.$("#fsa-say").classList.remove("on");
    if (!keep) this.msg(t("Recording stopped. Nothing was saved."), "warn");
  }

  finishRecording(step, rec) {
    const s = this.session;
    if (!rec.evidence && rec.frames.length) rec.evidence = this.vision.snapshot();
    s.records[step.id] = rec; delete s.skipped[step.id];
    this.compute();
    if (step.id === "rest") this.restM = this.c.A.rest && this.c.A.rest.valid ? this.c.A.rest.m : null;
    this.renderStep();
  }

  capturePhoto() {
    const v = this.vision, step = STEP[this.cur];
    if (!v || v.kind === "none") { this.msg(t("Start the camera or upload media first."), "warn"); return; }
    if (this.session.locked) { this.msg(t("This session is locked. Start a new patient to record again."), "warn"); return; }
    const rec = this.newRec(), f = v.latest;
    rec.single = true; rec.total = 1;
    if (f && f.face) rec.frames.push(this.slim(f)); else rec.noFace = 1;
    rec.evidence = v.snapshot();
    this.session.records[step.id] = rec; delete this.session.skipped[step.id];
    this.compute(); this.renderStep();
  }

  /* ---------------- step rendering ---------------- */
  status(id) {
    const s = this.session, st = STEP[id];
    if (s.skipped[id]) return "skip";
    if (st.kind === "rate") return Object.keys(s.ratings[id] || {}).length ? "done" : "pending";
    if (!s.records[id]) return "pending";
    const a = id === "rest" ? this.c.A.rest : this.c.A.steps[id];
    if (!a || !a.valid || a.q.ratio < T.validFrameRatio) return "warn";
    return "done";
  }

  renderStep() { this.renderStepCard(); this.renderStepList(); }

  renderStepList() {
    const icon = { done: "✓", warn: "!", skip: "–", pending: "" };
    this.$("#fsa-steps").innerHTML = GROUPS.map(g => html`
<div class="gname">${t(g.name)}</div>
<ol>${STEPS.filter(s => s.group === g.id).map(s => { const st = this.status(s.id); return html`<li><button data-step="${s.id}" aria-current="${s.id === this.cur}"><span class="dot ${st}">${icon[st]}</span>${t(s.title)}${s.required ? html` <span class="pill">${t("required")}</span>` : ""}</button></li>`; })}</ol>`.s).join("");
  }

  renderStepCard() {
    const step = STEP[this.cur], i = STEPS.indexOf(step), g = GROUPS.find(x => x.id === step.group);
    const v = this.vision, kind = v ? v.kind : "none", recording = !!this.rec;
    const canRecord = step.kind !== "rate" && kind !== "none" && !(kind === "image" && !["rest", "move"].includes(step.kind));
    const ratings = step.rating ? html`<div class="stack" style="gap:8px;margin-top:6px">${step.rating.map(r => html`
      <div><div class="note" style="margin:0 0 4px;color:var(--text)">${t(r.label)}</div>
      <div class="seg">${r.options.map(([val, l]) => html`<label><input type="radio" name="r_|${step.id}|${r.key}" value="${val}" ${(this.session.ratings[step.id] || {})[r.key] === val ? raw("checked") : ""}>${t(l)}</label>`)}</div></div>`)}</div>` : "";
    this.$("#fsa-step").innerHTML = html`
<div class="grp">${t(g.name)} · ${t("Step {n} of {total}", { n: i + 1, total: STEPS.length })}</div>
<h2>${t(step.title)}</h2>
<p class="say">“${t(step.say)}”</p>
<p class="watch"><b>${t("Watch for:")}</b> ${t(step.watch)}</p>
${step.kind !== "rate" ? html`<p class="note" style="margin:0 0 6px">${t("Recording length: {s} s.", { s: step.dur })} ${step.kind === "rest" ? t("Only still frames are used; blinks and talking are ignored.") : step.kind === "move" ? t("Ask for maximum effort and hold it.") : ""}</p>` : ""}
${ratings}
<div class="prog" id="fsa-prog"><i></i></div>
<div class="row">
  ${step.kind !== "rate" ? (recording ? html`<button class="danger" data-do="stop">${t("Stop")}</button>` : html`<button class="primary" data-do="record" ${canRecord ? "" : raw("disabled")}>${this.session.records[step.id] ? t("Record again") : kind === "image" ? t("Measure this image") : t("Record")}</button>`) : html`<button data-do="capture" ${kind === "none" ? raw("disabled") : ""}>${t("Capture photo (optional)")}</button>`}
  <button data-do="prev" ${i === 0 || recording ? raw("disabled") : ""}>${t("Back")}</button>
  <button data-do="skip" ${step.required || recording ? raw("disabled") : ""}>${t("Skip")}</button>
  <button data-do="next" ${recording ? raw("disabled") : ""}>${i === STEPS.length - 1 ? t("View results") : t("Next")}</button>
</div>
${kind === "image" && !["rest", "move"].includes(step.kind) && step.kind !== "rate" ? html`<p class="note">${t("This step needs the live camera or a video.")}</p>` : ""}
${kind === "video" ? html`<p class="note">${t("Video: play or seek to the moment the patient performs this movement, then select Record.")}</p>` : ""}
<div id="fsa-stepres"></div>
<div class="row" style="margin-top:12px"><button data-do="results" ${this.session.records.rest ? "" : raw("disabled")}>${t("Finish exam and view results")}</button></div>`.s;
    this.renderStepResult();
  }

  renderStepResult() {
    const box = this.$("#fsa-stepres"); if (!box) return;
    box.innerHTML = stepSummary(this, this.cur);
  }
}
