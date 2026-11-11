/* Compares visits of the same patient: grades, movement symmetry and findings over time.
   Works on locked reports (buildReport output), so old visits stay comparable. */
export const TREND_MOVES = [
  ["brow", "Eyebrow raise"], ["eye_gentle", "Gentle eye closure"], ["eye_tight", "Forceful eye closure"], ["snarl", "Nose wrinkle"],
  ["smile", "Smile"], ["pucker", "Lip pucker"], ["lower_teeth", "Lower lip depression"]
];
const HBN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
const MEANINGFUL = { sym: 10, sb: 5 }; // smaller changes are within measurement noise

export function metricsOf(report) {
  const g = report.grading, sym = {};
  for (const [id] of TREND_MOVES) {
    const s = report.steps && report.steps[id];
    if (s && s.valid && Number.isFinite(s.sym)) sym[id] = Math.round(s.sym * 100);
  }
  const findings = (report.findings || [])
    .filter(f => f.finalSeverity !== "Excluded" && f.finalSeverity !== "None")
    .map(f => ({ id: [f.type, f.step || "", f.side || ""].join(":"), text: f.text, severity: f.finalSeverity }));
  return {
    hb: g ? g.houseBrackmannEstimate : null, sb: g ? g.sunnybrookEstimate.composite : null, side: g ? g.side : null,
    facial: report.pattern ? report.pattern.facial : null, sym, findings
  };
}

/** direction: "better" | "worse" | "same" | null */
function judge(prev, cur, higherIsBetter, threshold) {
  if (prev == null || cur == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < threshold) return "same";
  return (d > 0) === higherIsBetter ? "better" : "worse";
}

export function compareVisits(cur, prev) {
  const a = metricsOf(prev), b = metricsOf(cur), rows = [];
  // House-Brackmann: lower is better. "Not graded" means no one-sided weakness pattern was found.
  let hbDir = null;
  if (a.hb && b.hb) hbDir = judge(HBN[a.hb], HBN[b.hb], false, 1);
  else if (a.hb && !b.hb) hbDir = b.facial === "none" ? "better" : null;
  else if (!a.hb && b.hb) hbDir = a.facial === "none" ? "worse" : null;
  rows.push({ id: "hb", label: "House-Brackmann (estimated)", prev: a.hb || "not graded", cur: b.hb || "not graded", dir: hbDir });
  rows.push({ id: "sb", label: "Sunnybrook composite (estimated)", prev: a.sb ?? "–", cur: b.sb ?? "–", delta: a.sb != null && b.sb != null ? b.sb - a.sb : null, dir: judge(a.sb, b.sb, true, MEANINGFUL.sb) });
  for (const [id, label] of TREND_MOVES) {
    if (a.sym[id] == null && b.sym[id] == null) continue;
    rows.push({ id, label: label + " symmetry", prev: a.sym[id] != null ? a.sym[id] + "%" : "–", cur: b.sym[id] != null ? b.sym[id] + "%" : "–",
      delta: a.sym[id] != null && b.sym[id] != null ? b.sym[id] - a.sym[id] : null, dir: judge(a.sym[id], b.sym[id], true, MEANINGFUL.sym) });
  }
  const prevIds = new Set(a.findings.map(f => f.id)), curIds = new Set(b.findings.map(f => f.id));
  const days = Math.round((new Date(cur.generatedAt) - new Date(prev.generatedAt)) / 86400000);
  const judged = rows.filter(r => r.dir === "better" || r.dir === "worse");
  const overall = !judged.length ? "same" : judged.every(r => r.dir === "better") ? "better" : judged.every(r => r.dir === "worse") ? "worse" : "mixed";
  return {
    days, rows, overall, sideChanged: a.side && b.side && a.side !== b.side,
    newFindings: b.findings.filter(f => !prevIds.has(f.id)),
    resolved: a.findings.filter(f => !curIds.has(f.id))
  };
}

/** Table of key measures across all visits, oldest first. */
export function trend(visits) {
  const ms = visits.map(v => metricsOf(v.report));
  const rows = [
    { label: "House-Brackmann (estimated)", values: ms.map(m => m.hb || "–") },
    { label: "Sunnybrook composite (estimated)", values: ms.map(m => m.sb ?? "–") },
    ...TREND_MOVES.map(([id, label]) => ({ label: label + " symmetry", values: ms.map(m => (m.sym[id] != null ? m.sym[id] + "%" : "–")) }))
      .filter(r => r.values.some(v => v !== "–"))
  ];
  return { cols: visits.map(v => ({ number: v.number, date: v.date })), rows };
}
