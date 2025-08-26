// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-brown; icon-glyph: magic;
// MealReport.js (TZ-korrekt: Europe/Berlin)
// Tages- UND Wochenauswertung mit korrekter Zeitzone für Gruppierung & Anzeige
// CSV-Header (neu): id,exec_ts_iso,event_ts_iso,event
// Kompatibel mit alten Zeilen (id,timestamp_iso,event)
// Shortcut-Parameter: mode=today | mode=week

///////////////////////////
// Datei & CSV Utilities //
///////////////////////////
const FM  = FileManager.iCloud();
const DIR = FM.documentsDirectory();
const PATH = FM.joinPath(DIR, "meal_log.csv");

// Feste Zielzeitzone
const TZ = "Europe/Berlin";

async function ensureCsvExistsOrExit() {
  if (!FM.fileExists(PATH)) {
    const a = new Alert();
    a.title = "Keine Daten";
    a.message = "Die Datei 'meal_log.csv' existiert noch nicht.";
    a.addAction("OK"); await a.present();
    Script.complete();
  }
  if (FM.isFileStoredIniCloud(PATH)) await FM.downloadFileFromiCloud(PATH);
}

function parseCSV(text){
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

///////////////////////////
// TZ-Helper & Formatter //
///////////////////////////
function partsInTZ(d, tz = TZ) {
  const fmt = new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    h: Number(map.hour),
    mi: Number(map.minute),
    ss: Number(map.second)
  };
}
function dayKeyTZ(d, tz = TZ) {
  const p = partsInTZ(d, tz);
  const pad = n => String(n).padStart(2,"0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`; // lokaler Kalendertag
}
function fmtHMtz(d, tz = TZ) {
  if (!d) return "—";
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
}
function humanDur(ms){
  if (ms == null) return "—";
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  if (h>0) return `${h} h ${m} min`;
  if (m>0) return `${m} min ${ss} s`;
  return `${ss} s`;
}
function weekdayShortTZ(d, tz = TZ){
  return new Intl.DateTimeFormat('de-DE', { timeZone: tz, weekday: 'short' }).format(d);
}
function dayLabelTZ(d, tz = TZ){
  return new Intl.DateTimeFormat('de-DE', { timeZone: tz, weekday:'short', day:'2-digit', month:'2-digit' }).format(d);
}

///////////////////////////
// Gruppierung nach Tag  //
///////////////////////////
function groupByDayTZ(rows, tz = TZ) {
  const map = {};
  for (const r of rows) {
    const key = dayKeyTZ(r.date, tz);
    if (!map[key]) map[key] = { meals: [], drinks: [] };
    if (r.ev === "calories") map[key].meals.push(r);
    else if (r.ev === "water") map[key].drinks.push(r);
  }
  for (const key of Object.keys(map)) {
    map[key].meals.sort((a,b)=>a.date-b.date);
    map[key].drinks.sort((a,b)=>a.date-b.date);
  }
  return map;
}

// 7 lokale Tage inkl. heute
function last7DaysKeysTZ(tz = TZ) {
  const now = new Date();
  const todayKey = dayKeyTZ(now, tz);
  const [y, m, d] = todayKey.split("-").map(Number);
  const days = [];
  for (let i=6;i>=0;i--){
    const base = new Date(Date.UTC(y, m-1, d));
    base.setUTCDate(base.getUTCDate() - i);
    const key = `${base.getUTCFullYear()}-${String(base.getUTCMonth()+1).padStart(2,"0")}-${String(base.getUTCDate()).padStart(2,"0")}`;
    // 12:00 UTC als stabile Referenzzeit; Anzeige erfolgt ohnehin in TZ
    const refDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0));
    days.push({ key, refDate });
  }
  return days;
}

///////////////////////////
// Tages-/Wochen-Logik   //
///////////////////////////
function daySummaryTZ(grouped, dayKey){
  const day = grouped[dayKey] || { meals: [], drinks: [] };
  const meals = day.meals;
  const drinks = day.drinks;

  // Übernacht-Fasten: letzte Kalorien VORTAG -> erste Kalorien HEUTE
  const [Y, M, D] = dayKey.split("-").map(Number);
  const prev = new Date(Date.UTC(Y, M-1, D));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const prevKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,"0")}-${String(prev.getUTCDate()).padStart(2,"0")}`;
  const prevMeals = (grouped[prevKey]?.meals || []);
  const lastPrev = prevMeals.length ? prevMeals[prevMeals.length-1] : null;
  const firstToday = meals.length ? meals[0] : null;

  let fastOvernight = null;
  if (lastPrev && firstToday) fastOvernight = firstToday.date - lastPrev.date;

  // Spans
  let drinkSpan = null;
  if (drinks.length >= 2) drinkSpan = drinks[drinks.length-1].date - drinks[0].date;

  let calorieSpan = null;
  if (meals.length >= 2) calorieSpan = meals[meals.length-1].date - meals[0].date;

  return {
    mealsCount: meals.length,
    drinksCount: drinks.length,
    fastOvernight,
    drinkSpan,
    calorieSpan,
    firstMeal: meals.length ? meals[0].date : null,
    lastMeal:  meals.length ? meals[meals.length-1].date : null,
    firstDrink: drinks.length ? drinks[0].date : null,
    lastDrink:  drinks.length ? drinks[drinks.length-1].date : null
  };
}

///////////////////////////
// Mini SVG Bar Charts   //
///////////////////////////
function svgBarChart(data, title, width=360, height=180, color="#4e79a7"){
  const padL=30, padB=24, padT=24, padR=10;
  const w=width - padL - padR, h=height - padT - padB;
  const max = Math.max(1, ...data.map(d=>d.value));
  const bw = w / data.length;
  let bars="", yAxis="";
  data.forEach((d,i)=>{
    const barH = (d.value/max)*h;
    const x = padL + i*bw + 6, y = padT + (h-barH);
    bars += `<rect x="${x}" y="${y}" width="${bw-12}" height="${barH}" rx="3" fill="${color}"/>`;
    bars += `<text x="${x + (bw-12)/2}" y="${height-6}" font-size="10" text-anchor="middle" fill="#666">${d.label}</text>`;
  });
  const yTicks = [0, Math.ceil(max/2), max];
  yTicks.forEach(t=>{
    const y = padT + h - (t/max)*h;
    yAxis += `<text x="4" y="${y+3}" font-size="10" fill="#666">${t}</text>`;
    yAxis += `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" stroke="#eee"/>`;
  });
  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${width/2}" y="14" font-size="12" text-anchor="middle" fill="#222">${title}</text>
  ${yAxis}
  ${bars}
</svg>`;
}

///////////////////////////
// HTML Templates        //
///////////////////////////
function baseStyles() {
  return `<style>
  body{font-family:-apple-system,system-ui; padding:14px; color:#222;}
  h1{font-size:18px;margin:0 0 8px}
  section.card{border:1px solid #eee; border-radius:12px; padding:12px; margin:8px 0}
  table{border-collapse:collapse;width:100%}
  th,td{border-bottom:1px solid #eee; padding:6px; text-align:left; font-size:14px}
  th{font-weight:600}
  .kpi{display:flex;justify-content:space-between;margin:6px 0}
  .muted{color:#666;font-size:13px}
  </style>`;
}

function renderTodayCard(title, dsum){
  return `
<section class="card">
  <h1>${title}</h1>
  <div class="kpi"><div>Übernacht-Fasten</div><div><b>${humanDur(dsum.fastOvernight)}</b></div></div>
  <div class="kpi"><div>Mahlzeiten heute</div><div><b>${dsum.mealsCount}</b></div></div>
  <div class="kpi"><div>Trink-Events heute</div><div><b>${dsum.drinksCount}</b></div></div>
  <div class="kpi"><div>Trink-Span (erste↔letzte)</div><div><b>${humanDur(dsum.drinkSpan)}</b></div></div>
  <div class="kpi"><div>Kalorien-Span (erste↔letzte)</div><div><b>${humanDur(dsum.calorieSpan)}</b></div></div>
  <div class="muted">
    ${dsum.firstMeal ? "Erste Mahlzeit: "+fmtHMtz(dsum.firstMeal) : "—"}<br>
    ${dsum.lastMeal  ? "Letzte Mahlzeit: "+fmtHMtz(dsum.lastMeal) : "—"}<br>
    ${dsum.firstDrink? "Erstes Trinken: "+fmtHMtz(dsum.firstDrink) : "—"}<br>
    ${dsum.lastDrink ? "Letztes Trinken: "+fmtHMtz(dsum.lastDrink) : "—"}
  </div>
</section>`;
}

function renderTodayHTML(today, dsum){
  const lbl = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(today);
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
${baseStyles()}
<h1>Tagesauswertung (${lbl})</h1>
${renderTodayCard("Heute", dsum)}
`;
}

function renderWeekHTML(perDay, todaySummary){
  const mealBars = svgBarChart(
    perDay.map(x=>({label: weekdayShortTZ(x.refDate), value: x.mealsCount})),
    "Mahlzeiten/Tag (7 Tage)"
  );
  const drinkBars = svgBarChart(
    perDay.map(x=>({label: weekdayShortTZ(x.refDate), value: x.drinksCount})),
    "Trink-Events/Tag (7 Tage)", 360, 180, "#59a14f"
  );

  // Tabelle inkl. Spalten: Fastenzeit Nacht davor, Kalorien-Span, Trink-Span, Erste/Letzte Kalorien (Uhrzeit)
  let table = `<table>
  <thead><tr>
    <th>Tag</th>
    <th>Fastenzeit Nacht davor</th>
    <th>Mahlzeiten</th>
    <th>Trink-Events</th>
    <th>Kalorien-Span</th>
    <th>Trink-Span</th>
    <th>Erste Kalorien (Uhrzeit)</th>
    <th>Letzte Kalorien (Uhrzeit)</th>
  </tr></thead><tbody>`;
  for (const d of perDay) {
    table += `<tr>
      <td>${dayLabelTZ(d.refDate)}</td>
      <td>${d.fastOvernight!=null ? humanDur(d.fastOvernight) : "—"}</td>
      <td>${d.mealsCount}</td>
      <td>${d.drinksCount}</td>
      <td>${d.calorieSpan!=null ? humanDur(d.calorieSpan) : "—"}</td>
      <td>${d.drinkSpan!=null ? humanDur(d.drinkSpan) : "—"}</td>
      <td>${fmtHMtz(d.firstMeal)}</td>
      <td>${fmtHMtz(d.lastMeal)}</td>
    </tr>`;
  }
  table += `</tbody></table>`;

  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
${baseStyles()}
<h1>Wochenauswertung (letzte 7 Tage)</h1>
${renderTodayCard("Heute (Kurzüberblick)", todaySummary)}
<section class="card">
  ${mealBars}
</section>
<section class="card">
  ${drinkBars}
</section>
<section class="card">
  <h1>Details (7 Tage)</h1>
  ${table}
</section>`;
}

///////////////////////////
// Param-Parsing         //
///////////////////////////
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
// MAIN                  //
///////////////////////////
await ensureCsvExistsOrExit();
const rows = parseCSV(FM.readString(PATH));
if (rows.length === 0) {
  const a = new Alert(); a.title="Keine Einträge"; a.message="CSV ist leer."; a.addAction("OK"); await a.present(); Script.complete();
}

// Gruppierung nach lokaler Berlin-Zeit
const grouped = groupByDayTZ(rows, TZ);

// Heute in TZ
const now = new Date();
const todayKey = dayKeyTZ(now, TZ);

// Modus bestimmen
let MODE = (getParams().mode || "").toLowerCase(); // "today" | "week"
if (MODE !== "today" && MODE !== "week") {
  const modeAlert = new Alert();
  modeAlert.title = "Auswertung";
  modeAlert.message = "Ansicht wählen";
  modeAlert.addAction("Heute");
  modeAlert.addAction("Letzte 7 Tage");
  modeAlert.addCancelAction("Abbrechen");
  const ix = await modeAlert.present();
  if (ix === -1) Script.complete();
  MODE = (ix === 0) ? "today" : "week";
}

if (MODE === "today") {
  const dsum = daySummaryTZ(grouped, todayKey);
  const html = renderTodayHTML(now, dsum);
  const wv = new WebView(); await wv.loadHTML(html); await wv.present(true); Script.complete();
}

// Woche:
const dayList = last7DaysKeysTZ(TZ);
const perDay = dayList.map(d => {
  const sum = daySummaryTZ(grouped, d.key);
  return {
    refDate: d.refDate,
    mealsCount: sum.mealsCount,
    drinksCount: sum.drinksCount,
    fastOvernight: sum.fastOvernight,
    drinkSpan: sum.drinkSpan,
    calorieSpan: sum.calorieSpan,
    firstMeal: sum.firstMeal,
    lastMeal: sum.lastMeal
  };
});

// Heute-Kurzüberblick für die Wochenansicht
const todaySummary = daySummaryTZ(grouped, todayKey);

const html = renderWeekHTML(perDay, todaySummary);
const wv = new WebView(); await wv.loadHTML(html); await wv.present(true);
Script.complete();