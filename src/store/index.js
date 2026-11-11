/* Storage for patients and visits.
   Every store implements the same async interface, so the Laravel API can replace browser storage later:
     listPatients() getPatient(id) savePatient(p) deletePatient(id)
     listVisits(patientId) getVisit(id) saveVisit(v) deleteVisit(id)
     exportAll() importAll(data)
   Patient: { id, ref, age, sex, notes, chronic, createdAt, updatedAt, lastVisitAt, visitCount }
   Visit:   { id, patientId, number, date, report, evidence? }   (report = the locked session report) */
import { LocalStore } from "./local.js";
import { RestStore } from "./rest.js";

export class MemoryStore {
  constructor() { this.p = new Map(); this.v = new Map(); this.kind = "memory"; }
  async listPatients() { return [...this.p.values()]; }
  async getPatient(id) { return this.p.get(id) || null; }
  async savePatient(x) { this.p.set(x.id, structuredClone(x)); return x; }
  async deletePatient(id) { this.p.delete(id); for (const [k, v] of this.v) if (v.patientId === id) this.v.delete(k); }
  async listVisits(pid) { return [...this.v.values()].filter(v => v.patientId === pid).sort((a, b) => a.date.localeCompare(b.date)); }
  async getVisit(id) { return this.v.get(id) || null; }
  async saveVisit(x) { this.v.set(x.id, structuredClone(x)); return x; }
  async deleteVisit(id) { this.v.delete(id); }
  async exportAll() { return { patients: [...this.p.values()], visits: [...this.v.values()] }; }
  async importAll(d) { for (const p of d.patients || []) await this.savePatient(p); for (const v of d.visits || []) await this.saveVisit(v); }
}

/** cfg.storage: "local" (browser IndexedDB, default) | "rest" (Laravel API at cfg.apiBase) | "memory" (nothing kept). */
export async function createStore(cfg) {
  if (cfg.storage === "rest") return new RestStore(cfg.apiBase, cfg.apiHeaders);
  if (cfg.storage === "memory") return new MemoryStore();
  try { const s = new LocalStore(); await s.open(); return s; }
  catch (err) { console.warn("Browser storage unavailable, data will not be kept:", err); const m = new MemoryStore(); m.unavailable = true; return m; }
}
