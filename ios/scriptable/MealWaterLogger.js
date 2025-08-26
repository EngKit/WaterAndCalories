// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: magic;
// MealWaterLogger.js (fix: korrekte Zeitzone, zeigt IMMER beide "seit letztem"-Zeiten)
// CSV-Header (neu): id,exec_ts_iso,event_ts_iso,event
// Akzeptiert Kurzbefehle-Parameter: event=water | event=calories

///////////////////////////
// Datei & Utilities     //
///////////////////////////
const FM  = FileManager.iCloud();
const DIR = FM.documentsDirectory();
const PATH = FM.joinPath(DIR, "meal_log.csv");

// KORREKT: lokale ISO mit Offset, inkl. angepasster Uhrzeit
function isoLocal(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  // lokale "Wandzeit" bauen
  const localWall = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19); // YYYY-MM-DDTHH:MM:SS
  // Offset berechnen
  const offMin = -d.getTimezoneOffset(); // z.B. +120 für +02:00
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
// tolerant: alte (3 Spalten) und neue (4 Spalten) Zeilen
function parseCSV(text) {
  const rows = (text||"").trim().split(/\r?\n/);
  if (rows.length <= 1) return [];
  const out=[];
  for (let i=1;i<rows.length;i++){
    const line = rows[i]; if(!line) continue;
    const cols=[]; let cur="", q=false;
    for (const c of line){
      if (c === '"') q=!q;
      else if (c === ',' && !q){ cols.push(cur); cur=""; }
      else cur += c;
    }
    cols.push(cur);
    if (cols.length >= 4) {
      const id=cols[0], execTs=cols[1], eventTs=cols[2], ev=cols[3];
      out.push({ id, execTs, eventTs, ev, date: new Date(eventTs) });
    } else if (cols.length >= 3) {
      const id=cols[0], ts=cols[1], ev=cols[2];
      out.push({ id, execTs: ts, eventTs: ts, ev, date: new Date(ts) });
    }
  }
  return out
    .filter(r => !isNaN(r.date))
    .sort((a,b)=>a.date-b.date);
}
function lastOfEvent(rows, ev) {
  for (let i=rows.length-1;i>=0;i--) if (rows[i].ev===ev) return rows[i];
  return null;
}
function diffHuman(ms) {
  if (ms == null) return "—";
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const ss= s%60;
  if (h>0) return `${h} h ${m} min`;
  if (m>0) return `${m} min ${ss} s`;
  return `${ss} s`;
}
// Parameter aus Kurzbefehle/URL
function getParams(){
  let p = (typeof args.shortcutParameter==="string"?args.shortcutParameter.trim():"");
  if (!p && args.plainTexts?.length) p = String(args.plainTexts[0]).trim();
  if (!p && args.urls?.length)      p = String(args.urls[0]).trim();
  if (!p) return {};
  let q=p; const qm=p.indexOf("?"); if (qm>=0) q=p.slice(qm+1);
  const o={}; q.split("&").forEach(pair=>{
    if(!pair) return; const [k,v]=pair.split("="); if(k) o[k.trim().toLowerCase()]=(v||"").trim().toLowerCase();
  });
  return o;
}

///////////////////////////
// MAIN
///////////////////////////
await ensureFile();
const runsInApp = config.runsInApp;
const params = getParams();
let eventType = params.event; // "water" | "calories"

// Falls kein Parameter: Auswahl anzeigen
if (!eventType) {
  const a = new Alert();
  a.title = "Eintragen";
  a.message = "Was möchtest du speichern?";
  a.addAction("💧 Wasser");
  a.addAction("🍽️ Kalorien");
  a.addCancelAction("Abbrechen");
  const ix = await a.present();
  if (ix===-1) Script.complete();
  eventType = (ix===0) ? "water" : "calories";
}

// 1) Vor dem Schreiben: letzte Events auslesen
const existing = FM.readString(PATH) || "";
const all = parseCSV(existing);
const lastWater = lastOfEvent(all, "water");
const lastCals  = lastOfEvent(all, "calories");

const now = new Date();
const sinceWaterStr = lastWater ? diffHuman(now - lastWater.date) : "—";
const sinceCalsStr  = lastCals  ? diffHuman(now - lastCals.date)  : "—";

// 2) Jetzt schreiben (exec_ts = jetzt, event_ts = jetzt)
const line = `${Math.floor(Math.random()*1e9).toString(36)},${isoLocal(now)},${isoLocal(now)},${eventType}\n`;
safeAppend(line);

// 3) Meldung (immer beide Zeiten)
const msg =
  (eventType==="water" ? "💧 " : "🍽️ ") + "Gespeichert.\n" +
  `Letztes Wasser: ${sinceWaterStr}\n` +
  `Letzte Kalorienaufnahme: ${sinceCalsStr}`;

if (runsInApp) {
  const ok=new Alert(); ok.title="Erfasst"; ok.message=msg; ok.addAction("OK"); await ok.present();
} else {
  const n=new Notification(); n.title="Erfasst"; n.body=msg; n.sound="default"; await n.schedule();
}
Script.complete();