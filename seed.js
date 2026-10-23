// Stand der Excel-Statistik «Pintstatistisk BLC KI Version.xlsx» (BLC 09-2026).
// Wird nur bei der Ersteinrichtung einmal in die Datenbank geschrieben.
// base = Pints vor der Sitzung BLC 09-2026 (Spalte «Stand»), die Sitzung selbst ist als erste Sitzung erfasst.
export const SEED = {
  price: 9.9,
  members: [
    { id: "ibo",    name: "Ibo",        base: 401 },
    { id: "oeti",   name: "Öti",        base: 330.5 },
    { id: "chair",  name: "Chair",      base: 286.5 },
    { id: "thoem",  name: "Thöm",       base: 259 },
    { id: "nsf",    name: "NSF",        base: 253 },
    { id: "kurt",   name: "Kurt",       base: 225.5 },
    { id: "chrige", name: "Chrige",     base: 186.5 },
    { id: "oli",    name: "Oli",        base: 157 },
    { id: "kuri",   name: "Kuri",       base: 130.5 },
    { id: "roefae", name: "Röfä",       base: 4 },
    { id: "froe",   name: "Frö (Gast)", base: 4 },
  ],
  sessions: [
    {
      id: "s-2026-09",
      label: "BLC 09-2026",
      date: "2026-09",
      closed: true,
      createdAt: "2026-09-01T00:00:00Z",
      counts: { ibo: 6, oeti: 6, chair: 5, thoem: 0, nsf: 6, kurt: 4, chrige: 4, oli: 0, kuri: 5, roefae: 0, froe: 0 },
    },
  ],
};
