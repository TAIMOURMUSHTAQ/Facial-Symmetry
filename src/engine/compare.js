/* Visit-to-visit comparison for therapist-led sessions.
   Captures are matched by the therapist's own label (case and spacing ignored). For each matched capture the
   left/right difference of every measurement is shown before and now. Neutral: no "better/worse" judgement;
   the therapist reads the direction. */
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const sideWord = s => (s === "R" ? "right" : s === "L" ? "left" : "");

/** "left 80% less" style text for one measurement row. */
export function diffText(r, mode) {
  if (!r) return "–";
  if (r.invalid) return "not valid (" + r.invalid + ")";
  if (r.diff === null || r.diff === undefined) return "below precision";
  if (!r.smaller || !r.diff) return "equal";
  return `${sideWord(r.smaller)} ${r.diff}% ${mode === "change" ? "less movement" : "smaller"}`;
}

export function compareVisits(cur, prev) {
  const prevBy = new Map((prev.captures || []).filter(c => c.valid).map(c => [norm(c.label), c]));
  const matched = [];
  for (const c of (cur.captures || []).filter(x => x.valid)) {
    const p = prevBy.get(norm(c.label));
    if (!p) continue;
    const pRows = new Map(p.rows.map(r => [r.id, r]));
    const rows = c.rows.filter(r => pRows.has(r.id)).map(r => ({ id: r.id, name: r.name, before: diffText(pRows.get(r.id), p.mode), now: diffText(r, c.mode),
      beforeDiff: pRows.get(r.id).smaller ? pRows.get(r.id).diff : 0, nowDiff: r.smaller ? r.diff : 0, beforeSide: pRows.get(r.id).smaller, nowSide: r.smaller }));
    // show the measurements that moved most in this capture first (same order as the current capture)
    matched.push({ label: c.label, reference: c.reference, rows });
  }
  const days = Math.round((new Date(cur.generatedAt) - new Date(prev.generatedAt)) / 86400000);
  const curLabels = new Set((cur.captures || []).map(c => norm(c.label)));
  return { days, matched, onlyBefore: (prev.captures || []).filter(c => !curLabels.has(norm(c.label))).map(c => c.label),
    onlyNow: (cur.captures || []).filter(c => !prevBy.has(norm(c.label))).map(c => c.label) };
}

/** Trend table: for each capture label seen in 2+ visits, its main measurement's left/right difference per visit. */
export function trend(visits) {
  const counts = new Map();
  for (const v of visits) for (const c of (v.report.captures || []).filter(x => x.valid)) counts.set(norm(c.label), (counts.get(norm(c.label)) || 0) + 1);
  const rows = [];
  for (const [key, n] of counts) {
    if (n < 2) continue;
    const latest = [...visits].reverse().map(v => (v.report.captures || []).find(c => norm(c.label) === key && c.valid)).find(Boolean);
    const main = latest.rows[0];
    rows.push({ label: `${latest.label}: ${main.name}`, values: visits.map(v => {
      const c = (v.report.captures || []).find(x => norm(x.label) === key && x.valid);
      const r = c && c.rows.find(x => x.id === main.id);
      return r ? diffText(r, c.mode) : "–";
    }) });
  }
  return { cols: visits.map(v => ({ number: v.number, date: v.date })), rows };
}
