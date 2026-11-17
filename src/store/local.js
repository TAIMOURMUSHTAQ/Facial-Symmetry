/* Browser storage (IndexedDB). Data stays on this device and this browser profile only.
   Clearing site data deletes it, so the patient screen offers a full backup export and import. */
const DB = "facial-symmetry-assistant", VERSION = 2;

export class LocalStore {
  constructor() { this.kind = "local"; this.db = null; }

  open() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB not supported")); return; }
      const r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("patients")) db.createObjectStore("patients", { keyPath: "id" });
        if (!db.objectStoreNames.contains("visits")) db.createObjectStore("visits", { keyPath: "id" }).createIndex("patientId", "patientId");
        if (!db.objectStoreNames.contains("templates")) db.createObjectStore("templates", { keyPath: "id" });   // therapist routines
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });    // e.g. custom history fields
      };
      r.onsuccess = () => {
        this.db = r.result;
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        resolve(this);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("storage is blocked by another open tab"));
    });
  }

  run(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode), os = tx.objectStore(store);
      const req = fn(os);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }

  listPatients() { return this.run("patients", "readonly", os => os.getAll()); }
  getPatient(id) { return this.run("patients", "readonly", os => os.get(id)).then(x => x || null); }
  savePatient(p) { return this.run("patients", "readwrite", os => os.put(p)).then(() => p); }
  async deletePatient(id) {
    const visits = await this.listVisits(id);
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(["patients", "visits"], "readwrite");
      tx.objectStore("patients").delete(id);
      for (const v of visits) tx.objectStore("visits").delete(v.id);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }
  listVisits(patientId) {
    return this.run("visits", "readonly", os => os.index("patientId").getAll(patientId))
      .then(v => v.sort((a, b) => a.date.localeCompare(b.date)));
  }
  getVisit(id) { return this.run("visits", "readonly", os => os.get(id)).then(x => x || null); }
  saveVisit(v) { return this.run("visits", "readwrite", os => os.put(v)).then(() => v); }
  deleteVisit(id) { return this.run("visits", "readwrite", os => os.delete(id)); }

  listTemplates() { return this.run("templates", "readonly", os => os.getAll()).then(t => t.sort((a, b) => a.name.localeCompare(b.name))); }
  saveTemplate(t) { return this.run("templates", "readwrite", os => os.put(t)).then(() => t); }
  deleteTemplate(id) { return this.run("templates", "readwrite", os => os.delete(id)); }
  getSetting(key) { return this.run("settings", "readonly", os => os.get(key)).then(x => (x ? x.value : null)); }
  setSetting(key, value) { return this.run("settings", "readwrite", os => os.put({ key, value })); }

  async exportAll() {
    const patients = await this.listPatients();
    const visits = await this.run("visits", "readonly", os => os.getAll());
    const templates = await this.listTemplates();
    const settings = await this.run("settings", "readonly", os => os.getAll());
    return { format: "facial-symmetry-backup", version: 2, exportedAt: new Date().toISOString(), patients, visits, templates, settings };
  }
  async importAll(data) {
    if (!data || !Array.isArray(data.patients) || !Array.isArray(data.visits)) throw new Error("not a backup file from this tool");
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(["patients", "visits", "templates", "settings"], "readwrite");
      for (const p of data.patients) tx.objectStore("patients").put(p);
      for (const v of data.visits) tx.objectStore("visits").put(v);
      for (const t of data.templates || []) tx.objectStore("templates").put(t);
      for (const s of data.settings || []) tx.objectStore("settings").put(s);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    return { patients: data.patients.length, visits: data.visits.length };
  }
}
