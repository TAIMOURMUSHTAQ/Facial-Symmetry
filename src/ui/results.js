/* Results: red flags, pattern summary, grading, findings per region with clinician review,
   possibilities to examine (with reasoning), and the bedside checklist that feeds back into the engine. */
import { t, sideName } from "../i18n/index.js";
import { html, raw, pct } from "../util.js";
import { STEPS, STEP } from "../exam/protocol.js";
import { CHECKLIST } from "../knowledge/checklist.js";
import { SEV, T } from "../engine/thresholds.js";
import { STRENGTH_LABEL } from "../engine/reason.js";
import { buildReport, changeSincePrevious } from "./report.js";

const URG = { emergency: "Emergency", urgent: "Urgent", soon: "Refer soon", routine: "Routine" };
const REL = { high: "High reliability", moderate: "Moderate reliability", low: "Low reliability: confirm by eye", clinician: "Clinician rated" };

/* Steps that examine each region; the resting face also covers the regions listed in REST_COVERS. */
const REGION_STEPS = { forehead: ["brow"], eyes: ["eye_gentle", "eye_tight", "upgaze_hold", "observe"], gaze: ["gaze_left", "gaze_right", "gaze_up", "gaze_down"],
  midface: ["snarl"], mouth: ["smile", "pucker", "lower_teeth", "smile_repeat"], cheeks: ["cheek"], jaw: ["jaw"], tongue: ["tongue", "palate"], global: ["observe"] };
const REST_COVERS = ["forehead", "eyes", "mouth", "global"];
function assessed(app, region) {
  const s = app.session;
  if (REST_COVERS.includes(region) && s.records.rest) return true;
  return (REGION_STEPS[region] || []).some(id => !s.skipped[id] && (s.records[id] || Object.keys(s.ratings[id] || {}).length));
}

export function flagsHTML(flags) {
  return flags.map(f => html`<div class="flag ${f.level}" role="${f.level === "emergency" ? "alert" : "note"}"><b>${t(f.title)}</b>${t(f.text)}</div>`);
}

function possHTML(app, r, scope) {
  const id = "poss:" + scope + ":" + r.id;
  return html`
<details class="poss" data-open="${id}" ${app.open.has(id) ? raw("open") : ""}>
  <summary>${t(r.name)} <span class="pill ${r.strength}">${t(STRENGTH_LABEL[r.strength])}</span>${r.urgency !== "routine" ? html` <span class="pill ${r.urgency}">${t(URG[r.urgency])}</span>` : ""}</summary>
  <div class="body">
    <p style="margin:0">${t(r.about)}</p>
    ${r.why.length ? html`<h4>${t("Evidence for")}</h4><ul class="for">${r.why.map(w => html`<li>${t(w)}</li>`)}</ul>` : ""}
    ${r.against.length ? html`<h4>${t("Evidence against")}</h4><ul class="against">${r.against.map(w => html`<li>${t(w)}</li>`)}</ul>` : ""}
    <h4>${t("How to confirm or exclude")}</h4><ul>${r.confirm.map(w => html`<li>${t(w)}</li>`)}</ul>
    ${r.ask.length ? html`<h4>${t("Ask the patient (not yet answered)")}</h4><ul>${r.ask.map(w => html`<li>${t(w)}</li>`)}</ul>` : ""}
    <p class="note">${t(r.category)}</p>
  </div>
</details>`;
}

function findingHTML(app, f) {
  const rv = app.session.review[f.key] || { decision: "accept" }, locked = app.session.locked;
  const rec = f.step && app.session.records[f.step];
  const sev = rv.decision === "override" ? rv.sev : f.sev;
  return html`
<div class="finding ${rv.decision === "reject" ? "rejected" : ""}">
  <div>${t(f.text)}</div>
  <div class="rev">
    <select data-rev="${f.key}" aria-label="${t("Review of finding")}" ${locked ? raw("disabled") : ""}>
      <option value="accept" ${rv.decision === "accept" ? raw("selected") : ""}>${t("Accept")}</option>
      <option value="reject" ${rv.decision === "reject" ? raw("selected") : ""}>${t("Reject (artefact)")}</option>
      <option value="override" ${rv.decision === "override" ? raw("selected") : ""}>${t("Change severity")}</option>
    </select>
    ${rv.decision === "override" ? html`<select data-sev="${f.key}" aria-label="${t("Severity")}" ${locked ? raw("disabled") : ""}>${[1, 2, 3].map(n => html`<option value="${n}" ${n === rv.sev ? raw("selected") : ""}>${t(SEV[n])}</option>`)}<option value="0" ${rv.sev === 0 ? raw("selected") : ""}>${t("Normal")}</option></select>` : ""}
  </div>
  <div class="meta">
    <span class="pill s${sev}">${t(SEV[sev] || "Normal")}</span>
    ${f.side ? html`<span>${sideName(f.side)}</span>` : ""}
    <span>· ${t(REL[f.reliability] || f.reliability)}</span>
    ${f.step ? html`<span>· ${t(STEP[f.step] ? STEP[f.step].title : f.step)}</span>` : ""}
    ${rv.decision === "override" ? html`<span>· ${t("severity changed by clinician")}</span>` : ""}
  </div>
  ${rec && rec.evidence ? html`<details class="more" style="grid-column:1/-1"><summary>${t("Show evidence frame")}</summary><img src="${rec.evidence}" alt="${t("Evidence frame")}"></details>` : ""}
</div>`;
}

function gradingHTML(G) {
  if (!G.applicable) return html`<p class="mute" style="margin:0">${t("Not applicable: no one-sided facial nerve weakness pattern was found.")}</p>`;
  const sb = G.sunnybrook, i = G.inputs, p = v => (v === null ? "–" : pct(v) + "%");
  return html`
<dl class="kv">
  <dt>${t("House-Brackmann (estimated)")}</dt><dd><b style="font-size:18px">${t("Grade")} ${G.hb}</b> · ${sideName(G.side)}</dd>
  <dt>${t("Based on")}</dt><dd>${t("forehead {f}, eye closure {c}, mouth {m} of the stronger side", { f: p(i.forehead), c: p(i.closure), m: p(i.mouth) })}</dd>
  <dt>${t("Reasons")}</dt><dd>${G.hbWhy.map(w => t(w)).join("; ")}</dd>
</dl>
<h3>${t("Sunnybrook (estimated)")}${sb.complete ? "" : html` <span class="pill">${t("partial")}</span>`}</h3>
<div class="tablewrap"><table>
  <tr><th>${t("Resting symmetry")}</th><td>${sb.rest} / 20</td></tr>
  <tr><th>${t("Voluntary movement")}</th><td>${sb.voluntary} / ${sb.voluntaryMax || 100}</td></tr>
  <tr><th>${t("Synkinesis")}</th><td>${sb.synkinesis} / 15</td></tr>
  <tr><th>${t("Composite")}</th><td><b>${sb.composite}</b> / 100</td></tr>
</table></div>
<p class="note">${t("Voluntary items")}: ${sb.items.map(v => t(v.name) + " " + (v.score ?? "–")).join(" · ")}</p>
<p class="note">${t("Confidence: {c}. Estimated from camera measurements; confirm by grading the patient yourself.", { c: t(G.confidence) })}</p>`;
}

function measurementsHTML(app) {
  const A = app.c.A, rows = [];
  for (const st of STEPS) {
    const a = A.steps[st.id];
    if (!a || !a.valid || !a.exc) continue;
    const eye = st.id.startsWith("eye");
    rows.push(html`<tr><td>${t(st.title)}</td><td>${eye ? pct(a.exc[0]) + "%" : a.exc[0]}</td><td>${eye ? pct(a.exc[1]) + "%" : a.exc[1]}</td><td>${a.sym !== undefined ? pct(a.sym) + "%" : "–"}</td><td>${pct(a.q.ratio)}%</td></tr>`);
  }
  if (!rows.length) return html`<p class="mute">${t("No movement measurements yet.")}</p>`;
  return html`<div class="tablewrap"><table><tr><th>${t("Step")}</th><th>${t("Right")}</th><th>${t("Left")}</th><th>${t("Symmetry")}</th><th>${t("Usable frames")}</th></tr>${rows}</table></div>
<p class="note">${t("Movement in inter-canthal distance units (about 32 mm), eye closure in % closed. Symmetry = weaker side ÷ stronger side.")}</p>`;
}

const DIR = { better: ["▲", "Improved", "better"], worse: ["▼", "Worse", "worse"], same: ["＝", "No meaningful change", "same"] };
function compareHTML(app) {
  if (!app.prevVisits || !app.prevVisits.length) return "";
  const ch = changeSincePrevious(app, buildReport(app));
  if (!ch) return "";
  const overall = { better: "Overall improving", worse: "Overall worse", mixed: "Mixed changes", same: "No meaningful change" }[ch.overall];
  return html`
<div class="card">
  <h2>${t("Change since visit {n}", { n: ch.previousVisit })}</h2>
  <p style="margin:0 0 8px"><span class="pill ${ch.overall === "better" ? "possible" : ch.overall === "worse" ? "strong" : ""}">${t(overall)}</span> <span class="mute">${t("{d} days ago", { d: ch.days })}</span></p>
  ${ch.sideChanged ? html`<div class="flag urgent" style="margin-bottom:8px">${t("The weaker side has changed since the last visit. Check the recordings and consider a new or bilateral process.")}</div>` : ""}
  <div class="tablewrap"><table>
    <tr><th>${t("Measure")}</th><th>${t("Before")}</th><th>${t("Now")}</th><th></th></tr>
    ${ch.rows.map(r => { const d = DIR[r.dir]; return html`<tr><td>${t(r.label)}</td><td>${r.prev}</td><td>${r.cur}</td><td class="dir ${d ? d[2] : ""}" title="${d ? t(d[1]) : ""}">${d ? d[0] : "–"}${r.delta != null && r.delta !== 0 ? html` <span class="mute">${r.delta > 0 ? "+" : ""}${r.delta}</span>` : ""}</td></tr>`; })}
  </table></div>
  ${ch.newFindings.length ? html`<h3>${t("New since last visit")}</h3><ul style="margin:0;padding-inline-start:18px;font-size:13.5px">${ch.newFindings.map(f => html`<li>${t(f.text)}</li>`)}</ul>` : ""}
  ${ch.resolved.length ? html`<h3>${t("No longer found")}</h3><ul style="margin:0;padding-inline-start:18px;font-size:13.5px">${ch.resolved.map(f => html`<li>${t(f.text)}</li>`)}</ul>` : ""}
  <p class="note">${t("Changes under 10 symmetry points or 5 Sunnybrook points are treated as measurement noise. Same lighting, distance and camera make comparisons more reliable.")}</p>
</div>`;
}

export function renderResults(app) {
  const { F0, P, G, R } = app.c, s = app.session;
  const done = STEPS.filter(st => app.status(st.id) === "done").length;
  const warn = STEPS.filter(st => app.status(st.id) === "warn").map(st => t(st.title));
  const asks = [...new Set(R.supported.slice(0, 6).flatMap(r => r.ask))];
  const box = app.root.querySelector("#fsa-results");
  if (!s.records.rest) {
    box.innerHTML = html`<div class="card narrow"><h2>${t("No examination yet")}</h2><p>${t("Record at least the resting face in the guided exam to see results.")}</p><button class="primary" data-go="exam">${t("Go to guided exam")}</button></div>`.s;
    return;
  }
  box.innerHTML = html`
<div class="stack">
  ${flagsHTML(R.flags)}
  <div class="results">
    <div class="stack">
      <div class="card">
        <h2>${t("Summary")}</h2>
        <p style="margin:0 0 8px;font-size:15.5px">${t(P.summary)}</p>
        <p class="note" style="margin:0 0 10px">${t("{d} of {n} steps measured.", { d: done, n: STEPS.length })}${warn.length ? " " + t("Low quality: {s}.", { s: warn.join(", ") }) : ""}</p>
        <h3>${t("Possibilities to examine, most supported first")}</h3>
        ${R.supported.length ? R.supported.slice(0, 6).map(r => possHTML(app, r, "top")) : html`<p class="mute">${t("No condition is supported by the current findings.")}</p>`}
        <p class="disclaimer" style="margin-top:10px">${t("These are possibilities to check, ranked by how well the measurements and answers fit. They are not diagnoses. Confirm every one with your own examination.")}</p>
      </div>
      <div class="card">
        <h2>${t("Findings and possibilities by region")}</h2>
        ${R.byRegion.map(reg => {
          const fs = F0.filter(f => f.region === reg.id);
          return html`<div class="region">
            <h3>${t(reg.name)} ${fs.length ? html`<span class="pill">${fs.length}</span>` : ""}</h3>
            ${fs.length ? fs.map(f => findingHTML(app, f)) : html`<p class="mute" style="margin:0 0 6px;font-size:13.5px">${assessed(app, reg.id) ? t("No findings in this region.") : t("Not assessed yet. Complete the related exam steps to check this region.")}</p>`}
            ${reg.possible.length ? html`<div class="note" style="margin:8px 0 4px;color:var(--text)">${t("Possibilities to examine")}</div>${reg.possible.map(r => possHTML(app, r, reg.id))}` : ""}
            ${reg.unsupported.length ? html`<details class="more"><summary>${t("Also checked, not supported ({n})", { n: reg.unsupported.length })}</summary><ul class="note" style="margin-top:4px">${reg.unsupported.map(r => html`<li>${t(r.name)}</li>`)}</ul></details>` : ""}
          </div>`;
        })}
      </div>
      <details class="card"><summary style="cursor:pointer;font-weight:650">${t("Measurements")}</summary>${measurementsHTML(app)}</details>
    </div>
    <div class="stack">
      ${compareHTML(app)}
      <div class="card"><h2>${t("Facial nerve grading")}</h2>${gradingHTML(G)}</div>
      <div class="card"><h2>${t("Next best checks")}</h2>${R.next.length ? html`<ol style="margin:0;padding-inline-start:20px">${R.next.map(n => html`<li>${t(n)}</li>`)}</ol>` : html`<p class="mute" style="margin:0">${t("None suggested.")}</p>`}</div>
      ${asks.length ? html`<div class="card"><h2>${t("Questions still worth asking")}</h2><ul style="margin:0;padding-inline-start:20px">${asks.map(a => html`<li>${t(a)}</li>`)}</ul><button class="small" data-go="history" style="margin-top:10px">${t("Answer in history")}</button></div>` : ""}
      <div class="card">
        <h2>${t("Bedside checks")}</h2>
        <p class="note" style="margin:0 0 6px">${t("The camera cannot test these. Record what you find; the possibilities update straight away.")}</p>
        <fieldset style="border:0;margin:0;padding:0" ${s.locked ? raw("disabled") : ""}>
        ${CHECKLIST.map(c => html`<div class="q" style="grid-template-columns:1fr"><div class="qt">${t(c.q)}</div><div class="seg">${c.options.map(([v, l]) => html`<label><input type="radio" name="c|${c.key}" value="${v}" ${s.checklist[c.key] === v ? raw("checked") : ""}>${t(l)}</label>`)}</div></div>`)}
        </fieldset>
      </div>
      <div class="row"><button data-go="exam">${t("Back to exam")}</button><button class="primary" data-go="report">${t("Review and report")}</button></div>
    </div>
  </div>
</div>`.s;
}

export function bindResults(app) {
  const sec = app.root.querySelector("[data-screen=results]");
  sec.addEventListener("change", e => {
    const el = e.target, s = app.session;
    if (s.locked) return;
    if (el.dataset.rev) {
      const k = el.dataset.rev, f = app.c.F0.find(x => x.key === k);
      s.review[k] = { decision: el.value, sev: el.value === "override" ? (s.review[k] && s.review[k].sev) ?? f.sev : undefined };
    } else if (el.dataset.sev) {
      s.review[el.dataset.sev].sev = +el.value;
    } else if (el.name && el.name.startsWith("c|")) {
      s.checklist[el.name.slice(2)] = el.value;
    } else return;
    const y = window.scrollY;
    app.compute(); renderResults(app); window.scrollTo(0, y);
  });
  sec.addEventListener("toggle", e => {
    const d = e.target; if (!d.dataset || !d.dataset.open) return;
    if (d.open) app.open.add(d.dataset.open); else app.open.delete(d.dataset.open);
  }, true);
}
