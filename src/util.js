/* Small shared helpers: vectors, statistics, DOM. No dependencies. */

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = a => Math.hypot(a[0], a[1], a[2]);
export const unit = a => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const deg = r => r * 180 / Math.PI;

export const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
export const sd = a => { if (!a.length) return NaN; const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
export const quantile = (a, q) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
export const median = a => quantile(a, 0.5);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const r1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
export const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
export const r3 = v => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
export const pct = v => (Number.isFinite(v) ? Math.round(v * 100) : null);

/** Symmetry of two non-negative excursions: 1 = identical, 0 = one side does not move. */
export const symmetry = (a, b) => {
  const hi = Math.max(a, b, 0), lo = Math.max(Math.min(a, b), 0);
  return hi <= 0 ? 1 : lo / hi;
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Tagged template that escapes interpolations unless they are wrapped with raw(). */
const RAW = Symbol("raw");
export const raw = s => ({ [RAW]: true, s: String(s) });
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    const part = Array.isArray(v) ? v.map(x => (x && x[RAW] ? x.s : esc(x))).join("") : v && v[RAW] ? v.s : v === false || v == null ? "" : esc(v);
    out += part + strings[i + 1];
  });
  return raw(out);
}

export function download(name, data, type) {
  const a = document.createElement("a");
  a.href = data.startsWith && data.startsWith("data:") ? data : URL.createObjectURL(new Blob([data], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  if (!a.href.startsWith("data:")) setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
