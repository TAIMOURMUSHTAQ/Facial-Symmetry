/* Browser storage (IndexedDB). Data stays on this device and this browser profile only.
   Clearing site data deletes it, so the patient screen offers a full backup export and import. */
const DB = "facial-symmetry-assistant", VERSION = 1;

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

  async exportAll() {
    const patients = await this.listPatients();
    const visits = await this.run("visits", "readonly", os => os.getAll());
    return { format: "facial-symmetry-backup", version: 1, exportedAt: new Date().toISOString(), patients, visits };
  }
  async importAll(data) {
    if (!data || !Array.isArray(data.patients) || !Array.isArray(data.visits)) throw new Error("not a backup file from this tool");
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(["patients", "visits"], "readwrite");
      for (const p of data.patients) tx.objectStore("patients").put(p);
      for (const v of data.visits) tx.objectStore("visits").put(v);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    return { patients: data.patients.length, visits: data.visits.length };
  }
}
