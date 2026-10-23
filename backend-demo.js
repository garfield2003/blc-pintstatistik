// Demo-Modus ohne Firebase: alles nur im Speicher dieses Browsers, nach dem Neuladen weg.
// Läuft, solange firebase-config.js noch nicht ausgefüllt ist. PINs: Club 1234, Admin 9999.
export function createDemoBackend(seed) {
  const pins = { counter: "1234", admin: "9999" };
  let role = "viewer";
  let cb = null;
  const config = { price: seed.price };
  const members = new Map(seed.members.map((m, i) => [m.id, { name: m.name, base: m.base, order: i + 1, active: true }]));
  const sessions = new Map(seed.sessions.map(({ id, ...s }) => [id, structuredClone(s)]));

  const emit = () => {
    cb.onConfig(true, { ...config });
    cb.onMembers([...members].map(([id, d]) => ({ id, ...d })));
    cb.onSessions([...sessions].map(([id, d]) => ({ id, ...structuredClone(d) })));
  };
  const need = r => {
    const ok = r === "admin" ? role === "admin" : role === "admin" || role === "counter";
    if (!ok) throw { code: "permission-denied" };
  };
  const later = fn => async (...a) => { fn(...a); queueMicrotask(emit); };

  return {
    demo: true,
    start(c) { cb = c; cb.onRole(role); setTimeout(emit, 50); },
    increment: later((sid, mid, d) => { need("counter"); const s = sessions.get(sid); s.counts[mid] = (s.counts[mid] || 0) + d; }),
    setCount: later((sid, mid, v) => { need("counter"); sessions.get(sid).counts[mid] = v; }),
    createSession: later((id, data) => { need("counter"); sessions.set(id, structuredClone(data)); }),
    updateSession: later((sid, p) => { need("counter"); Object.assign(sessions.get(sid), p); }),
    addMember: later((id, d) => { need("counter"); members.set(id, d); }),
    deleteSession: later(sid => { need("admin"); sessions.delete(sid); }),
    updateMember: later((id, p) => { need("admin"); Object.assign(members.get(id), p); }),
    setPrice: later(v => { need("admin"); config.price = v; }),
    changeClubPin: later(p => { need("admin"); pins.counter = p; }),
    changeAdminPin: later(p => { need("admin"); pins.admin = p; }),
    async unlock(pin) {
      const r = pin === pins.admin ? "admin" : pin === pins.counter ? "counter" : null;
      if (r) role = r;
      return r;
    },
    async lock() { role = "viewer"; },
    async setup() {},
  };
}
