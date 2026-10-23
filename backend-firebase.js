// Datenzugriff über Firebase (Firestore + anonyme Anmeldung).
// Wer zählen darf, entscheiden die Regeln in firestore.rules anhand des Club-PIN.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function createFirebaseBackend(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  let uid = null;

  // Online-Schreibvorgänge, die eine Antwort brauchen (PIN prüfen), sollen nicht ewig hängen
  const withTimeout = (p, ms = 12000) => Promise.race([
    p, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout" }), ms)),
  ]);

  return {
    demo: false,

    start(cb) {
      onAuthStateChanged(auth, async user => {
        if (!user) return;
        if (uid === user.uid) return;
        uid = user.uid;
        try {
          const w = await getDoc(doc(db, "writers", uid));
          cb.onRole(w.exists() ? w.data().role : "viewer");
        } catch (_) { cb.onRole("viewer"); }
      });
      signInAnonymously(auth).catch(() => cb.onError("Anmeldung bei Firebase fehlgeschlagen. Ist «Anonym» unter Authentication aktiviert?"));

      onSnapshot(doc(db, "config", "main"), s => cb.onConfig(s.exists(), s.exists() ? s.data() : null), () => cb.onError("Datenbank nicht erreichbar."));
      onSnapshot(collection(db, "members"), s => cb.onMembers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
      onSnapshot(collection(db, "sessions"), { includeMetadataChanges: true }, s => {
        cb.onSessions(s.docs.map(d => ({ id: d.id, ...d.data() })));
        cb.onPending(s.metadata.hasPendingWrites);
      });
    },

    // ----- Zählen (Rolle «counter» oder «admin») -----
    increment: (sid, mid, delta) => updateDoc(doc(db, "sessions", sid), { [`counts.${mid}`]: increment(delta) }),
    setCount: (sid, mid, v) => updateDoc(doc(db, "sessions", sid), { [`counts.${mid}`]: v }),
    createSession: (id, data) => setDoc(doc(db, "sessions", id), data),
    updateSession: (sid, patch) => updateDoc(doc(db, "sessions", sid), patch),
    addMember: (id, data) => setDoc(doc(db, "members", id), data),

    // ----- Verwaltung (Rolle «admin») -----
    deleteSession: sid => deleteDoc(doc(db, "sessions", sid)),
    updateMember: (id, patch) => updateDoc(doc(db, "members", id), patch),
    setPrice: v => setDoc(doc(db, "config", "main"), { price: v }, { merge: true }),
    changeClubPin: pin => withTimeout(setDoc(doc(db, "secret", "pin"), { value: pin })),
    async changeAdminPin(pin) {
      await withTimeout(setDoc(doc(db, "secret", "admin"), { value: pin }));
      await withTimeout(setDoc(doc(db, "writers", uid), { pin, role: "admin", at: new Date().toISOString() }));
    },

    // ----- PIN -----
    // Probiert zuerst Admin, dann Club-PIN. Die Regeln lassen den Eintrag nur zu, wenn der PIN stimmt.
    async unlock(pin) {
      for (const role of ["admin", "counter"]) {
        try {
          await withTimeout(setDoc(doc(db, "writers", uid), { pin, role, at: new Date().toISOString() }));
          return role;
        } catch (e) {
          if (e && e.code === "timeout") throw e;
        }
      }
      return null;
    },
    lock: () => deleteDoc(doc(db, "writers", uid)),

    // ----- Ersteinrichtung: Admin-PIN, Club-PIN und Excel-Stand -----
    async setup(adminPin, clubPin, seed) {
      await withTimeout(setDoc(doc(db, "secret", "admin"), { value: adminPin }));
      await withTimeout(setDoc(doc(db, "writers", uid), { pin: adminPin, role: "admin", at: new Date().toISOString() }));
      await withTimeout(setDoc(doc(db, "secret", "pin"), { value: clubPin }));
      await Promise.all([
        ...seed.members.map((m, i) => setDoc(doc(db, "members", m.id), { name: m.name, base: m.base, order: i + 1, active: true })),
        ...seed.sessions.map(s => { const { id, ...rest } = s; return setDoc(doc(db, "sessions", id), rest); }),
      ]);
      await setDoc(doc(db, "config", "main"), { price: seed.price });
    },
  };
}
