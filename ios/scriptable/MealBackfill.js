// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
// MealBackfill.js — Nachtragen mit Schnellauswahl (ohne Mengen)
// CSV-Header: id,exec_ts_iso,event_ts_iso,event
// Datei: iCloud/Scriptable/meal_log.csv

///////////////////////////
// Datei & Utilities     //
///////////////////////////
const FM  = FileManager.iCloud();
const DIR = FM.documentsDirectory();
const PATH = FM.joinPath(DIR, "meal_log.csv");

// Lokale ISO (Wandzeit + Offset korrekt)
function isoLocal(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  const localWall = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19); // YYYY-MM-DDTHH:MM:SS
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(offMin) / 60));
  const mm = pad(Math.abs(offMin) % 60);
  return `${localWall}${sign}${hh}:${mm}`;
}

async function ensureFile() {
  if (!FM.fileExists(PATH)) {
    FM.writeString(PATH, "id,exec_ts_iso,event_ts_iso,event\n");
  } else if (FM.isFileStoredIniCloud(PATH)) {
    await FM.downloadFileFromiCloud(PATH);
  }
}

function safeAppend(line) {
  if (!FM.fileExists(PATH)) {
    FM.writeString(PATH, "id,exec_ts_iso,event_ts_iso,event\n" + line);
    return;
  }
  const t = FM.readString(PATH) || "";
  FM.writeString(PATH, t + line);
}

// Helpers für Datum/Zeit-Eingabe
function todayDateStr() {
  const d = new Date(), pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function nowTimeStr() {
  const d = new Date(), pad=n=>String(n).padStart(2,"0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseLocalDateTime(dateStr, timeStr) {
  const dRe = /^(\d{4})-(\d{2})-(\d{2})$/;
  const tRe = /^(\d{2}):(\d{2})$/;
  const dm = (dateStr||"").match(dRe);
  const tm = (timeStr||"").match(tRe);
  if (!dm || !tm) return null;
  const y=+dm[1], m=+dm[2], d=+dm[3], hh=+tm[1], mm=+tm[2];
  const dt = new Date(y, m-1, d, hh, mm, 0, 0); // lokale Zeit
  return isNaN(dt.getTime()) ? null : dt;
}

///////////////////////////
// MAIN (UI)             //
///////////////////////////
await ensureFile();

// 1) Ereignistyp wählen
const choose = new Alert();
choose.title = "Nachtragen";
choose.message = "Was möchtest du nachtragen?";
choose.addAction("💧 Wasser");
choose.addAction("🍽️ Kalorien");
choose.addCancelAction("Abbrechen");
const ix = await choose.present();
if (ix === -1) Script.complete();
const eventType = (ix === 0) ? "water" : "calories";

// 2) Schnellauswahl für Zeitpunkt
const quick = new Alert();
quick.title = "Zeitpunkt";
quick.message = "Bitte auswählen:";
quick.addAction("Jetzt");
quick.addAction("−15 min");
quick.addAction("−30 min");
quick.addAction("−1 h");
quick.addAction("−2 h");
quick.addAction("Eigene Zeit …"); // manuelle Eingabe
quick.addCancelAction("Abbrechen");
const qx = await quick.present();
if (qx === -1) Script.complete();

const execTs = new Date();
let eventTs = new Date(execTs);

// Mapping für Offsets
const offsets = {
  1: 15 * 60 * 1000,
  2: 30 * 60 * 1000,
  3: 60 * 60 * 1000,
  4: 2  * 60 * 60 * 1000
};

if (qx >= 1 && qx <= 4) {
  eventTs = new Date(execTs.getTime() - offsets[qx]);
} else if (qx === 5) {
  // 3) Manuelle Eingabe: Datum & Uhrzeit
  const a = new Alert();
  a.title = "Eigene Zeit";
  a.message = "Datum & Uhrzeit eingeben:";
  a.addTextField(todayDateStr(), todayDateStr()); // YYYY-MM-DD
  a.addTextField(nowTimeStr(),   nowTimeStr());   // HH:MM (24h)
  a.addAction("Speichern");
  a.addCancelAction("Abbrechen");
  const res = await a.present();
  if (res === -1) Script.complete();
  const dateStr = a.textFieldValue(0).trim();
  const timeStr = a.textFieldValue(1).trim();
  const parsed  = parseLocalDateTime(dateStr, timeStr);
  if (parsed) eventTs = parsed;
  else {
    const warn = new Alert();
    warn.title = "Hinweis";
    warn.message = "Ungültiges Datum/Zeit-Format. Der aktuelle Zeitpunkt wurde verwendet.";
    warn.addAction("OK"); await warn.present();
  }
}
// (qx === 0) => „Jetzt“; eventTs bleibt execTs

// 4) Schreiben
const id = Math.floor(Math.random() * 1e9).toString(36);
const line = `${id},${isoLocal(execTs)},${isoLocal(eventTs)},${eventType}\n`;
safeAppend(line);

// 5) Feedback
const ok = new Alert();
ok.title = "Gespeichert";
ok.message =
  `${eventType === "water" ? "Wasser" : "Kalorien"} nachgetragen\n\n` +
  `Ereigniszeit: ${eventTs.toLocaleString()}\n` +
  `Erfasst am:   ${execTs.toLocaleString()}`;
ok.addAction("OK");
await ok.present();

Script.complete();