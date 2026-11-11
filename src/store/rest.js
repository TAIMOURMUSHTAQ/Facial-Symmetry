/* Laravel API store (for phase 3 integration). Same interface as LocalStore.
   Expected routes under apiBase (e.g. "/api/facial-symmetry"):
     GET    /patients                 -> [patient]
     GET    /patients/{id}            -> patient
     PUT    /patients/{id}            <- patient
     DELETE /patients/{id}
     GET    /patients/{id}/visits     -> [visit]
     GET    /visits/{id}              -> visit
     PUT    /visits/{id}              <- visit
     DELETE /visits/{id}
   apiHeaders can carry the CSRF token: { "X-CSRF-TOKEN": "..." }. Not yet tested against a server. */
export class RestStore {
  constructor(base, headers = {}) { this.base = (base || "").replace(/\/$/, ""); this.headers = headers; this.kind = "rest"; }

  async req(method, path, body) {
    const r = await fetch(this.base + path, {
      method, credentials: "same-origin",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...this.headers },
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 404 && method === "GET") return null;
    if (!r.ok) throw new Error(`${method} ${path} failed (${r.status})`);
    return r.status === 204 ? null : r.json();
  }

  listPatients() { return this.req("GET", "/patients").then(x => x || []); }
  getPatient(id) { return this.req("GET", `/patients/${encodeURIComponent(id)}`); }
  savePatient(p) { return this.req("PUT", `/patients/${encodeURIComponent(p.id)}`, p).then(() => p); }
  deletePatient(id) { return this.req("DELETE", `/patients/${encodeURIComponent(id)}`); }
  listVisits(pid) { return this.req("GET", `/patients/${encodeURIComponent(pid)}/visits`).then(v => (v || []).sort((a, b) => a.date.localeCompare(b.date))); }
  getVisit(id) { return this.req("GET", `/visits/${encodeURIComponent(id)}`); }
  saveVisit(v) { return this.req("PUT", `/visits/${encodeURIComponent(v.id)}`, v).then(() => v); }
  deleteVisit(id) { return this.req("DELETE", `/visits/${encodeURIComponent(id)}`); }
  async exportAll() {
    const patients = await this.listPatients(), visits = [];
    for (const p of patients) visits.push(...await this.listVisits(p.id));
    return { format: "facial-symmetry-backup", version: 1, exportedAt: new Date().toISOString(), patients, visits };
  }
  async importAll(d) { for (const p of d.patients) await this.savePatient(p); for (const v of d.visits) await this.saveVisit(v); return { patients: d.patients.length, visits: d.visits.length }; }
}
