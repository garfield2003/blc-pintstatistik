import { firebaseConfig } from "./firebase-config.js";
import { SEED } from "./seed.js";

// ---------- Zustand ----------
const S = {
  be: null,
  role: "viewer",        // viewer | counter | admin
  price: 9.9,
  configExists: null,    // null = noch unbekannt
  members: [],           // {id, name, base, order, active}
  sessions: [],          // {id, label, date, closed, counts, createdAt}
  gotMembers: false, gotSessions: false,
  tab: "sitzung",
  editId: null,
  confirm: null,
  pinOpen: false,
  pinError: "",
  busy: false,
  fatal: "",
};
const canCount = () => S.role === "counter" || S.role === "admin";
const isAdmin = () => S.role === "admin";
const ready = () => S.configExists === true && S.gotMembers && S.gotSessions;

const fmtPints = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });
const fmtFr = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const p = n => fmtPints.format(n);
const fr = n => "Fr. " + fmtFr.format(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = id => document.getElementById(id);
const round = n => Math.round(n * 2) / 2;
const num = v => Math.max(0, round(parseFloat(String(v).replace(",", ".")) || 0));

// ---------- Ableitungen ----------
const sessionSum = s => Object.values(s.counts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const openSession = () => S.sessions.find(s => !s.closed) || null;
const lastClosed = () => S.sessions.find(s => s.closed) || null;
const memberTotal = id => {
  const m = S.members.find(x => x.id === id);
  return (m ? Number(m.base) || 0 : 0) + S.sessions.reduce((a, s) => a + (Number((s.counts || {})[id]) || 0), 0);
};
const memberName = id => (S.members.find(m => m.id === id) || {}).name || "";

// ---------- Schreiben ----------
function onWriteError(e) {
  const code = e && e.code;
  if (code === "permission-denied") {
    if (S.role !== "viewer") {
      S.role = "viewer";
      toast("Deine Zählrechte sind abgelaufen, weil der PIN geändert wurde. Bitte neu freischalten.");
    } else {
      toast("Dafür fehlen dir die Rechte.");
    }
    render();
  } else if (code === "timeout") {
    toast("Keine Verbindung. Für diesen Schritt braucht es Internet.");
  } else {
    toast("Speichern fehlgeschlagen. Bitte nochmals versuchen.");
  }
}
// Schreibvorgänge nicht abwarten: Firestore zeigt sie sofort an und überträgt sie, sobald Netz da ist.
const fire = promise => { Promise.resolve(promise).catch(onWriteError); };
async function attempt(fn) {
  try { await fn(); return true; } catch (e) { onWriteError(e); return false; }
}

// ---------- Meldungen ----------
let toastTimer = null, toastUndo = null;
function toast(text, undo) {
  $("toast-text").textContent = text;
  toastUndo = undo || null;
  $("toast-undo").hidden = !undo;
  $("toast").classList.toggle("noaction", !undo);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; toastUndo = null; }, 4500);
}
$("toast-undo").addEventListener("click", () => { const u = toastUndo; $("toast").hidden = true; toastUndo = null; if (u) u(); });

// ---------- Bildschirm wach halten ----------
let wake = null;
async function keepAwake() {
  if (wake || !("wakeLock" in navigator)) return;
  try { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } catch (_) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && openSession() && canCount()) keepAwake(); });

// ---------- Render ----------
const deferred = new Set();
const panelOf = { sitzung: () => renderSitzung, uebersicht: () => renderUebersicht, verwaltung: () => renderVerwaltung };
function guarded(id, fn) {
  const a = document.activeElement;
  if (a && $(id).contains(a) && a.tagName === "INPUT" && a.type !== "checkbox" && a.type !== "date") { deferred.add(id); return; }
  fn();
}
document.addEventListener("focusout", () => setTimeout(() => {
  const ids = [...deferred]; deferred.clear();
  ids.forEach(id => guarded(id, panelOf[id.slice(2)]()));
}, 0));

function render() {
  guarded("p-sitzung", renderSitzung);
  guarded("p-uebersicht", renderUebersicht);
  guarded("p-verwaltung", renderVerwaltung);
  renderBill();
  const badge = $("role-badge");
  badge.hidden = S.role === "viewer" && !(S.be && S.be.demo);
  badge.innerHTML = [S.be && S.be.demo ? `<span class="chip">Demo</span>` : "", isAdmin() ? `<span class="chip live">Admin</span>` : S.role === "counter" ? `<span class="chip live">Zählt</span>` : ""].join(" ");
}

function notReady() {
  if (S.fatal) return `<div class="notice"><strong>${esc(S.fatal)}</strong></div>`;
  return `<div class="notice">Die Statistik wird geladen …</div>`;
}

function defaultLabel() {
  const d = new Date();
  return `BLC ${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateText = d => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return day ? `${day}.${m}.${y}` : `${m}.${y}`;
};

// PIN-Eingabe, eingebettet in Sitzung und Verwaltung
function pinBlock(intro, key) {
  if (!S.pinOpen) {
    return `<div class="notice row spread"><span>${intro}</span><button class="btn solid" data-pin-open>PIN eingeben</button></div>`;
  }
  return `<form class="panel pin-form" data-pin-form>
    <h3>Zählen freischalten</h3>
    <label class="field">Club-PIN<input type="password" id="pin-input-${key}" autocomplete="off" inputmode="text" required></label>
    ${S.pinError ? `<div class="err">${esc(S.pinError)}</div>` : ""}
    <div class="row"><button class="btn solid" type="submit" ${S.busy ? "disabled" : ""}>${S.busy ? "Prüfe …" : "Freischalten"}</button><button class="btn" type="button" data-pin-cancel>Abbrechen</button></div>
    <div class="muted small">Die Freischaltung gilt auf diesem Gerät, bis du sie entfernst oder der PIN geändert wird.</div>
  </form>`;
}
function wirePin(root) {
  root.querySelectorAll("[data-pin-open]").forEach(b => b.addEventListener("click", () => {
    S.pinOpen = true; S.pinError = ""; render();
    setTimeout(() => { const i = document.querySelector(`#p-${S.tab} [data-pin-form] input`); if (i) i.focus(); }, 0);
  }));
  root.querySelectorAll("[data-pin-cancel]").forEach(b => b.addEventListener("click", () => { S.pinOpen = false; S.pinError = ""; render(); }));
  root.querySelectorAll("[data-pin-form]").forEach(f => f.addEventListener("submit", async ev => {
    ev.preventDefault();
    const pin = f.querySelector("input").value.trim();
    if (!pin) return;
    document.activeElement && document.activeElement.blur();
    S.busy = true; S.pinError = ""; render();
    try {
      const role = await S.be.unlock(pin);
      if (role) {
        S.role = role; S.pinOpen = false;
        toast(role === "admin" ? "Als Admin freigeschaltet" : "Zählen freigeschaltet");
      } else {
        S.pinError = "Falscher PIN.";
      }
    } catch (e) {
      S.pinError = e && e.code === "timeout" ? "Keine Verbindung. Zum Freischalten braucht es Internet." : "Prüfung fehlgeschlagen. Bitte nochmals versuchen.";
    }
    S.busy = false; render();
  }));
}

// ---------- Ersteinrichtung ----------
function renderSetup(el) {
  el.innerHTML = `
    <div class="session-head"><h3>Ersteinrichtung</h3><h2>Pintstatistik einrichten</h2></div>
    <form class="panel" id="setup">
      <div class="muted">Die Datenbank ist noch leer. Lege zwei PINs fest. Danach wird der Stand aus der Excel-Statistik (BLC 09-2026, ${p(SEED.members.reduce((a, m) => a + m.base, 0) + SEED.sessions.reduce((a, s) => a + sessionSum(s), 0))} Pints) übernommen.</div>
      <label class="field">Admin-PIN (nur für dich: Preis, Mitglieder, PIN-Wechsel)<input type="password" id="setup-admin" autocomplete="new-password" minlength="6" required></label>
      <label class="field">Club-PIN (zum Zählen, kannst du weitergeben)<input type="password" id="setup-club" autocomplete="new-password" minlength="4" required></label>
      ${S.pinError ? `<div class="err">${esc(S.pinError)}</div>` : ""}
      <div><button class="btn solid" type="submit" ${S.busy ? "disabled" : ""}>${S.busy ? "Richte ein …" : "Einrichten und Excel-Stand übernehmen"}</button></div>
      <div class="muted small">Admin-PIN mindestens 6 Zeichen, Club-PIN mindestens 4. Die beiden müssen sich unterscheiden.</div>
    </form>`;
  $("setup").addEventListener("submit", async ev => {
    ev.preventDefault();
    const a = $("setup-admin").value.trim(), c = $("setup-club").value.trim();
    if (a === c) { S.pinError = "Admin-PIN und Club-PIN müssen verschieden sein."; render(); return; }
    document.activeElement && document.activeElement.blur();
    S.busy = true; S.pinError = ""; render();
    try {
      await S.be.setup(a, c, SEED);
      S.role = "admin";
      toast("Eingerichtet. Du bist als Admin freigeschaltet.");
    } catch (e) {
      S.pinError = e && e.code === "timeout" ? "Keine Verbindung zu Firebase." :
        "Einrichtung abgelehnt. Wurde sie schon einmal gemacht? Dann Seite neu laden.";
    }
    S.busy = false; render();
  });
}

// ---------- Sitzung ----------
function renderSitzung() {
  const el = $("p-sitzung");
  if (S.configExists === false && S.gotMembers && S.members.length === 0) { renderSetup(el); return; }
  if (!ready()) { el.innerHTML = notReady(); return; }
  const s = openSession();

  if (!s) {
    const last = lastClosed();
    el.innerHTML = `
      <div class="session-head">
        <h3>Keine Sitzung offen</h3>
        <h2>Neue Sitzung im Oliver Twist</h2>
        ${last ? `<div class="muted small">Letzte Sitzung: ${esc(last.label)} · ${p(sessionSum(last))} Pints</div>` : ""}
      </div>
      ${canCount() ? `
      <form id="new-session" class="panel">
        <div class="row">
          <label class="field" style="flex:1 1 180px">Bezeichnung<input type="text" id="ns-label" value="${esc(defaultLabel())}" required></label>
          <label class="field" style="flex:0 1 180px">Datum<input type="date" id="ns-date" value="${today()}" required></label>
        </div>
        <div><button class="btn solid" type="submit">Sitzung starten</button></div>
      </form>` : pinBlock("Eine Sitzung starten kann, wer den Club-PIN hat.", "s")}
    `;
    wirePin(el);
    const f = $("new-session");
    if (f) f.addEventListener("submit", ev => {
      ev.preventDefault();
      const label = $("ns-label").value.trim() || defaultLabel();
      const date = $("ns-date").value || today();
      const id = "s-" + date + "-" + Math.random().toString(36).slice(2, 6);
      fire(S.be.createSession(id, { label, date, closed: false, counts: {}, createdAt: new Date().toISOString() }));
      keepAwake();
    });
    return;
  }

  const active = S.members.filter(m => m.active !== false);
  const ro = !canCount();
  el.innerHTML = `
    <div class="session-head">
      <h3><span class="chip live">Live</span>&nbsp; ${esc(dateText(s.date))}</h3>
      <div class="label">${esc(s.label)}</div>
      ${ro ? "" : `<div class="muted small">Tippe auf +1 für jedes Pint. ½ für ein halbes, − zum Korrigieren.</div>`}
    </div>
    ${ro ? pinBlock("Du siehst die Sitzung live. Zum Zählen braucht es den Club-PIN.", "s") : ""}
    <div class="counter-list">
      ${active.map(m => {
        const c = Number((s.counts || {})[m.id]) || 0;
        const tot = memberTotal(m.id);
        return `<div class="counter">
          <div class="who"><div class="name">${esc(m.name)}</div><div class="tot num">Total ${p(tot)} · ${fr(tot * S.price)}</div></div>
          <div class="count num ${c ? "" : "zero"}" data-count="${esc(m.id)}" aria-live="polite">${p(c)}</div>
          ${ro ? "" : `<div class="ctl">
            <button class="mini" data-act="minus" data-m="${esc(m.id)}" aria-label="${esc(m.name)} minus 1" ${c ? "" : "disabled"}>−</button>
            <button class="mini" data-act="half" data-m="${esc(m.id)}" aria-label="${esc(m.name)} plus ein halbes Pint">½</button>
            <button class="plus" data-act="plus" data-m="${esc(m.id)}" aria-label="${esc(m.name)} plus 1 Pint">+1</button>
          </div>`}
        </div>`;
      }).join("")}
    </div>
    ${active.length === 0 ? `<div class="notice">Noch keine Mitglieder. Unter <strong>Verwaltung</strong> erfassen.</div>` : ""}
    ${ro ? "" : `
    <form id="add-guest" class="row">
      <input type="text" id="guest-name" placeholder="Gast oder neues Mitglied" aria-label="Name" style="flex:1 1 200px">
      <button class="btn" type="submit">Hinzufügen</button>
    </form>`}
  `;
  wirePin(el);
  el.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
    const mid = b.dataset.m, name = memberName(mid);
    const cur = Number((s.counts || {})[mid]) || 0;
    keepAwake();
    if (b.dataset.act === "plus") bump(s.id, mid, 1, `${name}: +1 Pint`);
    if (b.dataset.act === "half") bump(s.id, mid, 0.5, `${name}: +½ Pint`);
    if (b.dataset.act === "minus") bump(s.id, mid, -Math.min(1, cur), `${name}: −1 Pint`);
  }));
  const g = $("add-guest");
  if (g) g.addEventListener("submit", ev => {
    ev.preventDefault();
    const name = $("guest-name").value.trim();
    if (name) addMember(name);
  });
}

function bump(sid, mid, delta, msg) {
  if (!delta) return;
  fire(S.be.increment(sid, mid, delta));
  const el = document.querySelector(`[data-count="${mid}"]`);
  if (el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  toast(msg, () => fire(S.be.increment(sid, mid, -delta)));
}

function renderBill() {
  const s = openSession();
  const show = S.tab === "sitzung" && !!s && ready();
  $("bill").hidden = !show;
  if (!show) return;
  const sum = sessionSum(s);
  $("bill-pints").textContent = `${p(sum)} Pints`;
  $("bill-fr").textContent = fr(sum * S.price);
  $("bill-close").hidden = !canCount();
}
$("bill-close").addEventListener("click", () => {
  const s = openSession(); if (!s) return;
  fire(S.be.updateSession(s.id, { closed: true }));
  toast(`${s.label} abgeschlossen: ${p(sessionSum(s))} Pints`);
  if (wake) { try { wake.release(); } catch (_) {} }
});

// ---------- Übersicht ----------
function renderUebersicht() {
  const el = $("p-uebersicht");
  if (!ready()) { el.innerHTML = notReady(); return; }
  const rows = S.members.map(m => ({ m, tot: memberTotal(m.id) })).sort((a, b) => b.tot - a.tot || a.m.name.localeCompare(b.m.name));
  const total = rows.reduce((a, r) => a + r.tot, 0);
  const max = rows.length ? rows[0].tot || 1 : 1;
  const ref = openSession() || lastClosed();
  const liters = total / 2;
  const editing = S.sessions.find(x => x.id === S.editId);

  el.innerHTML = `
    <div class="row spread">
      <h2>Gesamtübersicht</h2>
      <div class="muted small">Stand ${esc(S.sessions[0] ? S.sessions[0].label : "–")} · Pintpreis ${fr(S.price)}</div>
    </div>
    <div class="stats">
      <div class="stat"><span>Pints total</span><b class="num">${p(total)}</b></div>
      <div class="stat"><span>Ausgegeben</span><b class="num">${fr(total * S.price)}</b></div>
      <div class="stat"><span>Liter</span><b class="num">${fmt1.format(liters)}</b></div>
      <div class="stat"><span>Fässer à 30 l</span><b class="num">${fmt1.format(liters / 30)}</b></div>
    </div>
    <div class="tablebox">
      <table>
        <thead><tr><th>#</th><th>Name</th><th>${ref ? esc(ref.label) : "Letzte"}</th><th>Pints</th><th>Fr.</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `<tr class="${r.m.active === false ? "inactive" : ""}">
            <td class="rank">${i + 1}</td>
            <td class="nm">${esc(r.m.name)}<div class="bar"><i style="width:${(r.tot / max * 100).toFixed(1)}%"></i></div></td>
            <td>${ref ? p(Number((ref.counts || {})[r.m.id]) || 0) : "–"}</td>
            <td><b>${p(r.tot)}</b></td>
            <td>${fmtFr.format(r.tot * S.price)}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr><td></td><td>Total</td><td>${ref ? p(sessionSum(ref)) : "–"}</td><td>${p(total)}</td><td>${fmtFr.format(total * S.price)}</td></tr></tfoot>
      </table>
    </div>
    <div class="row"><button class="btn" id="export">Als Excel (CSV) herunterladen</button></div>

    <div class="row spread"><h2>Sitzungen</h2><div class="muted small">${canCount() ? "Antippen für Details und Korrekturen" : "Antippen für Details"}</div></div>
    <div class="tablebox">
      <table class="hist">
        <thead><tr><th>Sitzung</th><th>Pints</th><th>Fr.</th></tr></thead>
        <tbody>
          ${S.sessions.map(s => `<tr class="hist-row ${s.id === S.editId ? "open" : ""}" data-edit="${esc(s.id)}" tabindex="0" aria-expanded="${s.id === S.editId}">
            <td class="nm"><span class="caret" aria-hidden="true">›</span>${esc(s.label)} ${s.closed ? "" : `<span class="chip live">Live</span>`}<div class="sub">${esc(dateText(s.date))}</div></td>
            <td>${p(sessionSum(s))}</td>
            <td>${fmtFr.format(sessionSum(s) * S.price)}</td>
          </tr>${s.id === S.editId ? `<tr class="detail-row"><td colspan="3">${canCount() ? editPanel(s) : detailPanel(s)}</td></tr>` : ""}`).join("")}
          <tr><td class="nm muted">Übertrag Excel<div class="sub">bis ${esc(S.sessions.length ? S.sessions[S.sessions.length - 1].label : "")}</div></td><td class="muted">${p(S.members.reduce((a, m) => a + (Number(m.base) || 0), 0))}</td><td></td></tr>
        </tbody>
      </table>
    </div>
  `;
  $("export").addEventListener("click", exportCsv);
  el.querySelectorAll("[data-edit]").forEach(tr => {
    const open = () => {
      S.editId = S.editId === tr.dataset.edit ? null : tr.dataset.edit; S.confirm = null; renderUebersicht();
      const row = document.querySelector(`[data-edit="${CSS.escape(tr.dataset.edit)}"]`);
      if (S.editId && row) row.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  if (editing && canCount()) wireEditPanel(editing);
}

// Nur-Ansicht: wer wie viel getrunken hat
function detailPanel(s) {
  const counts = s.counts || {};
  const rows = S.members.map(m => ({ m, c: Number(counts[m.id]) || 0 }));
  const drank = rows.filter(r => r.c > 0).sort((a, b) => b.c - a.c || a.m.name.localeCompare(b.m.name));
  const none = rows.filter(r => r.c === 0 && r.m.active !== false);
  const sum = sessionSum(s);
  return `<div class="detail">
    <table class="detail-table">
      <tbody>
        ${drank.map(r => `<tr><td class="nm">${esc(r.m.name)}</td><td>${p(r.c)}</td><td>${fmtFr.format(r.c * S.price)}</td></tr>`).join("")}
      </tbody>
      <tfoot><tr><td>Total</td><td>${p(sum)}</td><td>${fmtFr.format(sum * S.price)}</td></tr></tfoot>
    </table>
    ${drank.length === 0 ? `<div class="muted small">In dieser Sitzung wurde noch nichts gezählt.</div>` : ""}
    ${none.length && drank.length ? `<div class="muted small">Ohne Pint: ${none.map(r => esc(r.m.name)).join(", ")}</div>` : ""}
    ${s.closed ? "" : `<div class="muted small">Die Sitzung läuft noch, die Zahlen ändern sich live.</div>`}
  </div>`;
}

function editPanel(s) {
  const list = S.members.filter(m => m.active !== false || (s.counts || {})[m.id]);
  return `<div class="panel" id="edit-panel">
    <div class="row spread">
      <h3>Korrektur</h3>
      <button class="btn" id="edit-done">Fertig</button>
    </div>
    <div class="row">
      <label class="field" style="flex:1 1 180px">Bezeichnung<input type="text" id="ed-label" value="${esc(s.label)}"></label>
      <label class="field" style="flex:0 1 180px">Datum<input type="${/^\d{4}-\d{2}-\d{2}$/.test(s.date) ? "date" : "text"}" id="ed-date" value="${esc(s.date || "")}"></label>
    </div>
    <div class="edit-grid">
      ${list.map(m => `<label class="edit-item"><span>${esc(m.name)}</span>
        <input type="number" step="0.5" min="0" inputmode="decimal" class="num" id="ed-c-${esc(m.id)}" data-c="${esc(m.id)}" value="${Number((s.counts || {})[m.id]) || 0}"></label>`).join("")}
    </div>
    <div class="muted small">Total dieser Sitzung: <b class="num">${p(sessionSum(s))} Pints</b> · ${fr(sessionSum(s) * S.price)}. Änderungen werden sofort gespeichert.</div>
    <div class="row">
      ${s.closed ? `<button class="btn" id="ed-reopen" ${openSession() ? "disabled title=\"Es ist bereits eine Sitzung offen\"" : ""}>Wieder eröffnen</button>` : `<button class="btn" id="ed-close">Abschliessen</button>`}
      ${isAdmin() ? `<button class="btn danger" id="ed-del">Sitzung löschen</button>` : ""}
    </div>
    ${S.confirm === "del-" + s.id ? `<div class="confirm"><div>«${esc(s.label)}» mit ${p(sessionSum(s))} Pints endgültig löschen?</div>
      <div class="row"><button class="btn danger" id="ed-del-yes">Ja, löschen</button><button class="btn" id="ed-del-no">Abbrechen</button></div></div>` : ""}
  </div>`;
}
function wireEditPanel(s) {
  $("edit-done").addEventListener("click", () => { S.editId = null; S.confirm = null; renderUebersicht(); });
  document.querySelectorAll("#edit-panel [data-c]").forEach(inp => inp.addEventListener("change", () => {
    fire(S.be.setCount(s.id, inp.dataset.c, num(inp.value)));
  }));
  const lab = $("ed-label"), dat = $("ed-date");
  lab.addEventListener("change", () => { const v = lab.value.trim(); if (v) fire(S.be.updateSession(s.id, { label: v })); });
  dat.addEventListener("change", () => fire(S.be.updateSession(s.id, { date: dat.value })));
  const c = $("ed-close"), r = $("ed-reopen"), d = $("ed-del");
  if (c) c.addEventListener("click", () => fire(S.be.updateSession(s.id, { closed: true })));
  if (r) r.addEventListener("click", () => fire(S.be.updateSession(s.id, { closed: false })));
  if (d) d.addEventListener("click", () => { S.confirm = "del-" + s.id; renderUebersicht(); });
  const yes = $("ed-del-yes"), no = $("ed-del-no");
  if (yes) yes.addEventListener("click", () => {
    fire(S.be.deleteSession(s.id)); S.editId = null; S.confirm = null; toast(`${s.label} gelöscht`);
  });
  if (no) no.addEventListener("click", () => { S.confirm = null; renderUebersicht(); });
}

function exportCsv() {
  const sessions = [...S.sessions].reverse();
  const n = v => String(v);
  const cell = v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const head = ["Name", "Übertrag Excel", ...sessions.map(s => `${s.label} (${dateText(s.date)})`), "Total Pints", "Total Fr."];
  const lines = [head];
  for (const m of S.members) {
    const t = memberTotal(m.id);
    lines.push([m.name, n(Number(m.base) || 0), ...sessions.map(s => n(Number((s.counts || {})[m.id]) || 0)), n(t), (t * S.price).toFixed(2)]);
  }
  const total = S.members.reduce((a, m) => a + memberTotal(m.id), 0);
  lines.push(["Total", n(S.members.reduce((a, m) => a + (Number(m.base) || 0), 0)), ...sessions.map(s => n(sessionSum(s))), n(total), (total * S.price).toFixed(2)]);
  lines.push([]);
  lines.push(["Pintpreis", S.price.toFixed(2)]);
  const csv = "﻿" + lines.map(r => r.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `BLC-Pintstatistik-${today()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Verwaltung ----------
function renderVerwaltung() {
  const el = $("p-verwaltung");
  if (!ready()) { el.innerHTML = notReady(); return; }
  if (!isAdmin()) {
    el.innerHTML = `
      <h2>Verwaltung</h2>
      ${S.role === "counter" ? `<div class="notice row spread"><span>Dieses Gerät darf zählen.</span><button class="btn" id="lock">Zählrechte entfernen</button></div>` : ""}
      ${pinBlock("Preis, Mitglieder und PINs ändert, wer den Admin-PIN hat.", "v")}
      <div class="panel"><h3>Aktueller Pintpreis</h3><b class="num" style="font-size:1.4rem">${fr(S.price)}</b></div>
      ${S.be.demo ? `<div class="notice">Demo-Modus: Club-PIN <strong>1234</strong>, Admin-PIN <strong>9999</strong>. Nichts wird gespeichert.</div>` : ""}
    `;
    wirePin(el);
    const l = $("lock");
    if (l) l.addEventListener("click", lock);
    return;
  }
  el.innerHTML = `
    <div class="row spread"><h2>Verwaltung</h2><button class="btn" id="lock">Admin auf diesem Gerät abmelden</button></div>
    <div class="panel">
      <h3>Guinness-Preis im Pub</h3>
      <div class="row">
        <label class="field" style="flex:0 1 160px">Pintpreis in Fr.<input type="number" step="0.10" min="0" inputmode="decimal" id="price" class="num" value="${S.price.toFixed(2)}"></label>
      </div>
      <div class="muted small">Alle Beträge rechnen alle Pints mit dem aktuell gültigen Preis.</div>
    </div>
    <div class="panel">
      <h3>Club-PIN zum Zählen</h3>
      <div class="muted small">Gib den Club-PIN weiter, wenn jemand anders zählen soll. Wenn du ihn änderst, verlieren alle anderen Geräte ihre Zählrechte.</div>
      <form class="row" id="club-pin-form">
        <input type="password" id="club-pin" autocomplete="new-password" minlength="4" placeholder="Neuer Club-PIN" aria-label="Neuer Club-PIN" style="flex:1 1 180px">
        <button class="btn" type="submit">Club-PIN ändern</button>
      </form>
      <h3>Admin-PIN</h3>
      <form class="row" id="admin-pin-form">
        <input type="password" id="admin-pin" autocomplete="new-password" minlength="6" placeholder="Neuer Admin-PIN" aria-label="Neuer Admin-PIN" style="flex:1 1 180px">
        <button class="btn" type="submit">Admin-PIN ändern</button>
      </form>
    </div>
    <div class="panel">
      <h3>Mitglieder und Gäste</h3>
      <div class="muted small">«Übertrag» sind die Pints aus der Excel-Statistik vor den hier erfassten Sitzungen. Nur aktive Personen erscheinen beim Zählen.</div>
      <div>
        ${S.members.map(m => `<div class="member-row">
          <label class="field">Name<input type="text" id="mn-${esc(m.id)}" data-name="${esc(m.id)}" value="${esc(m.name)}"></label>
          <label class="field">Übertrag<input type="number" step="0.5" min="0" class="num" id="mb-${esc(m.id)}" data-base="${esc(m.id)}" value="${Number(m.base) || 0}"></label>
          <label class="toggle"><input type="checkbox" id="ma-${esc(m.id)}" data-active="${esc(m.id)}" ${m.active !== false ? "checked" : ""}> aktiv</label>
        </div>`).join("")}
      </div>
      <form id="add-member" class="row">
        <input type="text" id="new-member" placeholder="Name" aria-label="Neues Mitglied" style="flex:1 1 200px">
        <button class="btn" type="submit">Mitglied hinzufügen</button>
      </form>
    </div>
  `;
  $("lock").addEventListener("click", lock);
  const pr = $("price");
  pr.addEventListener("change", () => {
    const v = Math.max(0, parseFloat(String(pr.value).replace(",", ".")) || 0);
    fire(S.be.setPrice(v)); toast(`Pintpreis: ${fr(v)}`);
  });
  $("club-pin-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const v = $("club-pin").value.trim();
    if (v.length < 4) { toast("Der Club-PIN braucht mindestens 4 Zeichen."); return; }
    if (await attempt(() => S.be.changeClubPin(v))) { $("club-pin").value = ""; toast("Club-PIN geändert"); }
  });
  $("admin-pin-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const v = $("admin-pin").value.trim();
    if (v.length < 6) { toast("Der Admin-PIN braucht mindestens 6 Zeichen."); return; }
    if (await attempt(() => S.be.changeAdminPin(v))) { $("admin-pin").value = ""; toast("Admin-PIN geändert"); }
  });
  el.querySelectorAll("[data-name]").forEach(i => i.addEventListener("change", () => {
    const v = i.value.trim(); if (v) fire(S.be.updateMember(i.dataset.name, { name: v }));
  }));
  el.querySelectorAll("[data-base]").forEach(i => i.addEventListener("change", () => fire(S.be.updateMember(i.dataset.base, { base: num(i.value) }))));
  el.querySelectorAll("[data-active]").forEach(i => i.addEventListener("change", () => fire(S.be.updateMember(i.dataset.active, { active: i.checked }))));
  $("add-member").addEventListener("submit", ev => { ev.preventDefault(); const n = $("new-member").value.trim(); if (n) addMember(n); });
}

async function lock() {
  if (await attempt(() => S.be.lock())) { S.role = "viewer"; toast("Rechte auf diesem Gerät entfernt"); render(); }
}

function addMember(name) {
  const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "m";
  let id = slug, n = 2;
  while (S.members.some(m => m.id === id)) id = slug + "-" + n++;
  const order = S.members.reduce((a, m) => Math.max(a, Number(m.order) || 0), 0) + 1;
  fire(S.be.addMember(id, { name, base: 0, order, active: true }));
  toast(`${name} hinzugefügt`);
}

// ---------- Register ----------
const TABS = ["sitzung", "uebersicht", "verwaltung"];
document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => selectTab(b.dataset.tab)));
function selectTab(t) {
  S.tab = t;
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  TABS.forEach(k => { $("p-" + k).hidden = k !== t; });
  renderBill();
  try { localStorage.setItem("blc-tab", t); } catch (_) {}
}
let savedTab = null; try { savedTab = localStorage.getItem("blc-tab"); } catch (_) {}
const hashTab = location.hash.slice(1);
selectTab(TABS.includes(hashTab) ? hashTab : TABS.includes(savedTab) ? savedTab : "sitzung");

// ---------- Online-Anzeige ----------
const showOffline = () => { $("offline").hidden = navigator.onLine; };
addEventListener("online", showOffline); addEventListener("offline", showOffline); showOffline();

// ---------- Start ----------
const configured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("HIER");
(async () => {
  if (configured) {
    const { createFirebaseBackend } = await import("./backend-firebase.js");
    S.be = createFirebaseBackend(firebaseConfig);
  } else {
    const { createDemoBackend } = await import("./backend-demo.js");
    S.be = createDemoBackend(SEED);
  }
  S.be.start({
    onRole(r) { S.role = r || "viewer"; render(); },
    onConfig(exists, d) { S.configExists = exists; if (d && typeof d.price === "number") S.price = d.price; render(); },
    onMembers(list) { S.members = list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)); S.gotMembers = true; render(); },
    onSessions(list) {
      S.sessions = list.map(s => ({ ...s, counts: { ...(s.counts || {}) } }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      S.gotSessions = true; render();
    },
    onPending() {},
    onError(msg) { S.fatal = msg; render(); },
  });
  render();
})();
