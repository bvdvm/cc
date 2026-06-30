"use strict";
import { firebaseConfig, TMDB_KEY } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ============================================================
   FIREBASE INIT + WSPÓŁDZIELONY STAN (zamiast localStorage)
   ============================================================ */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const stateCol   = collection(db, "state");
const manualCol  = collection(db, "manualFilms");
const tvCol      = collection(db, "tvShows");
const favCol     = collection(db, "favorites");   // ulubione — bez miesiąca
const snackCol   = collection(db, "snacks");       // przekąski
const detailsCol = collection(db, "filmDetails");  // cache obsady (TMDB)
const poolDocRef = (person) => doc(db, "pool", person);

let STATE = {}, MANUAL = {}, TV = {}, FAV = {}, SNACKS = {}, POOL = { karolina: [], adam: [] };
let firebaseReady = false;

function defaultState(){
  return {watched:false, want:false, kar:null, adam:null, ads:null, saga:null,
          karNoteShort:null, karNoteLong:null, adamNoteShort:null, adamNoteLong:null};
}
function stateFor(id){ return Object.assign(defaultState(), STATE[id]||{}); }

function setFilmState(id, partial){
  setDoc(doc(stateCol, id), partial, {merge:true}).catch(err=>{
    alert("Błąd zapisu do bazy (sprawdź config.js i reguły Firestore): " + err.message);
  });
}
async function addManualFilm(month, film){ await setDoc(doc(manualCol, film.id), {...film, month}); }
async function deleteManualFilm(id){
  await deleteDoc(doc(manualCol, id)).catch(()=>{});
  await deleteDoc(doc(stateCol, id)).catch(()=>{});
}
async function addTvShow(show){ await setDoc(doc(tvCol, show.id), show); }
async function deleteTvShow(id){
  await deleteDoc(doc(tvCol, id)).catch(()=>{});
  await deleteDoc(doc(stateCol, id)).catch(()=>{});
}
async function addFavorite(film){ await setDoc(doc(favCol, film.id), film); }
async function deleteFavorite(id){
  await deleteDoc(doc(favCol, id)).catch(()=>{});
  await deleteDoc(doc(stateCol, id)).catch(()=>{});
}
async function addSnack(snack){ await setDoc(doc(snackCol, snack.id), snack); }
async function deleteSnack(id){
  await deleteDoc(doc(snackCol, id)).catch(()=>{});
  await deleteDoc(doc(stateCol, id)).catch(()=>{});
}
async function addToPool(person, item){
  const cur = POOL[person] || [];
  if(cur.length >= 30){ alert(`Pula (${person === "karolina" ? "Karolina" : "Adam"}) jest pełna — 30/30. Usuń coś, żeby dodać kolejny.`); return; }
  if(cur.some(x=>x.id===item.id)){ alert("Ten film jest już w tej puli."); return; }
  await setDoc(poolDocRef(person), { items: [...cur, item] });
}
async function removeFromPool(person, id){
  await setDoc(poolDocRef(person), { items: (POOL[person]||[]).filter(x=>x.id!==id) });
}

onSnapshot(stateCol, snap=>{
  const next={}; snap.forEach(d=>next[d.id]=d.data()); STATE=next;
  firebaseReady = true; renderCurrentView();
}, err=>showFirebaseError(err));
onSnapshot(manualCol, snap=>{
  const next={}; snap.forEach(d=>next[d.id]={id:d.id, ...d.data()}); MANUAL=next; renderCurrentView();
}, err=>showFirebaseError(err));
onSnapshot(tvCol, snap=>{
  const next={}; snap.forEach(d=>next[d.id]={id:d.id, ...d.data()}); TV=next; renderCurrentView();
}, err=>showFirebaseError(err));
onSnapshot(favCol, snap=>{
  const next={}; snap.forEach(d=>next[d.id]={id:d.id, ...d.data()}); FAV=next; renderCurrentView();
}, err=>showFirebaseError(err));
onSnapshot(snackCol, snap=>{
  const next={}; snap.forEach(d=>next[d.id]={id:d.id, ...d.data()}); SNACKS=next; renderCurrentView();
}, err=>showFirebaseError(err));
onSnapshot(poolDocRef("karolina"), d=>{ POOL.karolina = d.exists() ? (d.data().items||[]) : []; renderCurrentView(); }, err=>showFirebaseError(err));
onSnapshot(poolDocRef("adam"), d=>{ POOL.adam = d.exists() ? (d.data().items||[]) : []; renderCurrentView(); }, err=>showFirebaseError(err));

let fbErrorShown = false;
function showFirebaseError(err){
  if(fbErrorShown) return; fbErrorShown = true;
  document.getElementById("updated").textContent =
    "Błąd połączenia z Firebase — sprawdź config.js i reguły Firestore. (" + err.message + ")";
}

/* ============================================================
   REPERTUAR Z data/films.json (statyczny, niezależny od Firebase)
   ============================================================ */
let DB = {months:{}, showtimes:{}, updated:null};
const START_MONTH = "2026-01";
const PEOPLE = [["kar","Karolina"],["adam","Adam"]];
let currentMonth = null;

function monthFilms(m){
  const out = Object.assign({}, DB.months[m]?.films ?? {});
  for(const f of Object.values(MANUAL)) if(f.month === m) out[f.id] = f;
  return out;
}
function allMonthKeys(){
  const manualMonths = Object.values(MANUAL).map(f=>f.month).filter(Boolean);
  return [...new Set([...Object.keys(DB.months), ...manualMonths])];
}
function collectAllFilmEntries(){
  const byId = new Map();
  for(const m of allMonthKeys()){
    for(const f of Object.values(monthFilms(m))){
      if(!byId.has(f.id)) byId.set(f.id, {film:f, months:[]});
      byId.get(f.id).months.push(m);
    }
  }
  return [...byId.values()];
}

/* ---------- helpers ---------- */
function monthRange(){
  const out = []; const now = new Date();
  let end = now.getFullYear()*12 + now.getMonth();
  for(const m of allMonthKeys()){ const [y,mo]=m.split("-").map(Number); end=Math.max(end, y*12+(mo-1)); }
  const [sy,sm] = START_MONTH.split("-").map(Number);
  for(let i = sy*12+(sm-1); i <= end; i++) out.push(`${Math.floor(i/12)}-${String(i%12+1).padStart(2,"0")}`);
  return out;
}
const MONTH_NAMES = ["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
function monthLabel(m){ const [y,mo]=m.split("-"); return `${MONTH_NAMES[+mo-1]} '${y.slice(2)}`; }
function isCurrentMonth(m){ const n=new Date(); return m===`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; }
function avg(s){ const v=[s.kar,s.adam].filter(x=>x!==null&&x!==""&&!isNaN(x)).map(Number); if(!v.length) return null; return v.reduce((a,b)=>a+b,0)/v.length; }
function fmtAvg(a){ return a===null||a===undefined ? "–" : (Math.round(a*10)/10).toLocaleString("pl-PL"); }
function esc(s){ const d=document.createElement("div"); d.textContent=s??""; return d.innerHTML; }
function fmtDt(iso){ const d=new Date(iso); if(isNaN(d)) return iso;
  return d.toLocaleDateString("pl-PL",{weekday:"short",day:"numeric",month:"numeric"})+" "+d.toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}); }

/* ---------- kolory i poziomy ocen (1=czerwony … 10=zielony) ---------- */
const SCORE_LEVELS = {
  1:"Matcha Popcorn", 2:"Przykry Film", 3:"Dramat", 4:"Ujdzie W Tłoku", 5:"Średniawka",
  6:"Całkiem OK", 7:"Niezły", 8:"Klasa", 9:"Mega", 10:"Absolutne Kino",
};
function scoreColor(v){
  if(v===null||v===undefined) return null;
  const c = Math.max(1, Math.min(10, Number(v)));
  const hue = (c-1)/9*120; // 0=czerwony, 120=zielony
  return `hsl(${hue.toFixed(0)} 72% 45%)`;
}
function scoreLevel(v){
  if(v===null||v===undefined) return null;
  const r = Math.max(1, Math.min(10, Math.round(Number(v))));
  return SCORE_LEVELS[r];
}

/* ---------- znajdź film/serial/ulubiony/przekąskę po id (do modala szczegółów) ---------- */
function findAnyItem(id, kind){
  if(kind==="tv") return TV[id];
  if(kind==="fav") return FAV[id];
  if(kind==="snack") return SNACKS[id];
  if(MANUAL[id]) return MANUAL[id];
  for(const m of allMonthKeys()){ const f = monthFilms(m)[id]; if(f) return f; }
  return null;
}

/* ============================================================
   TICKET CARD (wspólny dla filmów i seriali)
   ============================================================ */
function ticketHTML(film, st, opts={}){
  const {showShows=false, showAds=true, showSaga=true, kind="film"} = opts;
  const a = avg(st);
  const color = scoreColor(a);
  const poster = film.poster
    ? `<img src="${esc(film.poster)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=ph>🎬</div>'">`
    : `<div class="ph">🎬</div>`;

  let shows = "";
  if(showShows){
    const evs = (DB.showtimes[film.id]||[]).slice()
      .sort((x,y)=>String(x.dt).localeCompare(String(y.dt)))
      .filter(e=>new Date(e.dt) > new Date()).slice(0,4);
    if(evs.length){
      shows = `<div class="shows"><div class="sh-label">Najbliższe pokazy</div><ul>` +
        evs.map(e=>`<li><span class="when">${esc(fmtDt(e.dt))}</span><span>${esc(e.cinema.replace("Poznań ",""))}</span>
          ${(e.attrs||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</li>`).join("") + `</ul></div>`;
    }
  }
  const sagaPill = showSaga
    ? (st.saga
        ? `<button class="t-saga" data-act="saga">🏷️ ${esc(st.saga)}</button>`
        : `<button class="t-saga" data-act="saga">+ saga</button>`)
    : "";
  const notesLine = (st.karNoteShort || st.adamNoteShort) ? `<div class="t-notes">
      ${st.karNoteShort?`<span class="note k">K: ${esc(st.karNoteShort)}</span>`:""}
      ${st.adamNoteShort?`<span class="note a">A: ${esc(st.adamNoteShort)}</span>`:""}
    </div>` : "";

  return `
  <article class="ticket ${st.watched?"watched":""} ${st.want&&!st.watched?"wanted":""}"
    data-id="${esc(film.id)}" data-kind="${kind}">
    <div class="poster" data-act="details">
      ${poster}
      <div class="stamp ${a===null?"none":""}" ${color?`style="border-color:${color};color:${color}"`:""} title="Średnia ocena">${fmtAvg(a)}</div>
    </div>
    <div class="t-body">
      <button type="button" class="t-title" data-act="details">${esc(film.title)}</button>
      <div class="t-meta">
        ${film.length?`<span>${film.length} min</span>`:""}
        ${film.year?`<span>${esc(film.year)}</span>`:""}
        ${kind==="film"?`<span class="cin">${(film.cinemas||[]).map(c=>esc(c.replace("Poznań ",""))).join(" · ")}</span>`:""}
        ${film.manual||kind!=="film"?`<button class="t-del" data-act="del">usuń</button>`:""}
        ${sagaPill}
      </div>
      ${notesLine}
      ${st.watched ? `
      <div class="rates">
        ${PEOPLE.map(([k,name])=>`
        <div class="rate">
          <span class="who">${name} <button type="button" class="note-btn" data-act="note" data-person="${k}" title="Notatka">💬</button></span>
          <input type="number" min="1" max="10" step="0.5" inputmode="decimal" data-field="${k}" value="${st[k] ?? ""}" placeholder="1–10">
        </div>`).join("")}
        ${showAds ? `<div class="rate ads">
          <span class="who">Reklamy</span>
          <input type="number" min="0" max="60" step="1" inputmode="numeric" data-field="ads" value="${st.ads ?? ""}" placeholder="min">
        </div>` : ""}
      </div>` : ""}
      <div class="toggle">
        <button data-act="toggle">${st.watched?"✓ Obejrzane":"Oznacz jako obejrzane"}</button>
        ${!st.watched?`<button data-act="want">${st.want?"★ Na liście":"☆ Do obejrzenia"}</button>`:""}
      </div>
      ${shows}
    </div>
  </article>`;
}

function snackCardHTML(s, st){
  const a = avg(st);
  const color = scoreColor(a);
  return `
  <article class="ticket snack" data-id="${esc(s.id)}" data-kind="snack">
    <div class="snack-icon">
      ${esc(s.icon||"🍿")}
      <div class="stamp ${a===null?"none":""}" ${color?`style="border-color:${color};color:${color}"`:""} title="Średnia ocena">${fmtAvg(a)}</div>
    </div>
    <div class="t-body">
      <div class="t-title">${esc(s.name)}</div>
      <div class="rates">
        ${PEOPLE.map(([k,name])=>`
        <div class="rate">
          <span class="who">${name}</span>
          <input type="number" min="1" max="10" step="0.5" inputmode="decimal" data-field="${k}" value="${st[k] ?? ""}" placeholder="1–10">
        </div>`).join("")}
      </div>
      <button class="t-del" data-act="del">usuń</button>
    </div>
  </article>`;
}

function sortFilms(arr, mode){
  const cmp = {
    "avg-desc":(a,b)=>(avg(stateFor(b.id))??-1)-(avg(stateFor(a.id))??-1),
    "avg-asc": (a,b)=>(avg(stateFor(a.id))??99)-(avg(stateFor(b.id))??99),
    "title":   (a,b)=>a.title.localeCompare(b.title,"pl"),
    "ads-desc":(a,b)=>(stateFor(b.id).ads??-1)-(stateFor(a.id).ads??-1),
    "ads-asc": (a,b)=>(stateFor(a.id).ads??999)-(stateFor(b.id).ads??999),
    "seen":    (a,b)=>String(a.firstSeen).localeCompare(String(b.firstSeen)),
  }[mode] || (()=>0);
  return arr.slice().sort(cmp);
}

/* ============================================================
   WIDOK: MIESIĄCE
   ============================================================ */
function renderMonths(){
  const nav = document.getElementById("months"); nav.innerHTML = "";
  for(const m of monthRange()){
    const n = Object.keys(monthFilms(m)).length;
    const b = document.createElement("button");
    b.innerHTML = `${esc(monthLabel(m))} <span class="cnt">(${n})</span>`;
    b.className = m === currentMonth ? "active" : "";
    b.onclick = ()=>{ currentMonth = m; render(); };
    nav.appendChild(b);
  }
}
function render(){
  renderMonths();
  const films = Object.values(monthFilms(currentMonth));
  const mode = document.getElementById("sort").value;
  const showShows = isCurrentMonth(currentMonth);
  const fallback = mode.startsWith("avg")||mode.startsWith("ads") ? "title" : mode;

  const watched = sortFilms(films.filter(f=>stateFor(f.id).watched), mode);
  const want    = sortFilms(films.filter(f=>!stateFor(f.id).watched && stateFor(f.id).want), fallback);
  const rest    = sortFilms(films.filter(f=>!stateFor(f.id).watched && !stateFor(f.id).want), fallback);

  document.getElementById("watchedList").innerHTML = watched.map(f=>ticketHTML(f, stateFor(f.id), {showShows:false})).join("");
  document.getElementById("todoList").innerHTML    = want.map(f=>ticketHTML(f, stateFor(f.id), {showShows})).join("");
  document.getElementById("restList").innerHTML    = rest.map(f=>ticketHTML(f, stateFor(f.id), {showShows})).join("");

  document.getElementById("watchedEmpty").hidden = watched.length>0;
  document.getElementById("todoEmpty").hidden = want.length>0;
  document.getElementById("restEmpty").hidden = rest.length>0;
  document.getElementById("watchedCount").textContent = `${watched.length} z ${films.length}`;
  document.getElementById("todoCount").textContent = `${want.length}`;
  document.getElementById("restCount").textContent = `${rest.length}`;
}

/* ============================================================
   WIDOK: RANKING (wszech czasów, średnia)
   ============================================================ */
function rankRowHTML(i, film, st, scoreKey, monthsArr){
  const scoreVal = scoreKey ? st[scoreKey] : avg(st);
  const color = scoreColor(scoreVal);
  const lvl = scoreKey ? null : scoreLevel(scoreVal);
  const posCls = (scoreVal===null||scoreVal===undefined) ? "" : (["p1","p2","p3"][i]||"");
  const kind = String(film.id||"").startsWith("tv") ? "tv" : "film";
  const poster = film.poster
    ? `<img src="${esc(film.poster)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=ph>🎬</div>'">`
    : `<div class="ph">🎬</div>`;
  return `
  <div class="rank-row ${posCls} ${(scoreVal===null||scoreVal===undefined)?"unrated":""}" data-id="${esc(film.id)}" data-kind="${kind}">
    <div class="rank-pos">${i+1}</div>
    <div class="rank-poster" data-act="details">${poster}</div>
    <div class="rank-info">
      <button type="button" class="rank-title" data-act="details">${esc(film.title)}</button>
      <div class="rank-meta">
        ${monthsArr?`<span>${monthsArr.slice().sort().map(monthLabel).map(esc).join(", ")}</span>`:""}
        ${film.length?`<span>${film.length} min</span>`:""}
        ${st.saga?`<span>🏷️ ${esc(st.saga)}</span>`:""}
        ${lvl?`<span class="lvl" style="color:${color}">${esc(lvl)}</span>`:""}
      </div>
    </div>
    <div class="rank-avg" ${color?`style="border-color:${color};color:${color}"`:""} title="${scoreKey?"Twoja ocena":"Średnia"}">${scoreVal===null||scoreVal===undefined?"–":scoreVal}</div>
  </div>`;
}
function renderRanking(){
  const entries = collectAllFilmEntries().filter(e=>stateFor(e.film.id).watched);
  const rows = entries.sort((a,b)=>{
    const av=avg(stateFor(a.film.id)), bv=avg(stateFor(b.film.id));
    if(av===null&&bv===null) return a.film.title.localeCompare(b.film.title,"pl");
    if(av===null) return 1; if(bv===null) return -1;
    return bv-av || a.film.title.localeCompare(b.film.title,"pl");
  });
  document.getElementById("rankList").innerHTML = rows.map((r,i)=>rankRowHTML(i,r.film,stateFor(r.film.id),null,r.months)).join("");
  document.getElementById("rankEmpty").hidden = rows.length>0;
  document.getElementById("rankCount").textContent = rows.length ? `${rows.length} ${rows.length===1?"film":"filmów"}` : "";
}

/* ============================================================
   WIDOK: TOP 10 (osobno dla każdej osoby)
   ============================================================ */
function top10(person, limit=10, source="film"){
  const entries = source==="tv" ? Object.values(TV).map(f=>({film:f})) : collectAllFilmEntries();
  return entries.map(e=>({film:e.film, st:stateFor(e.film.id)}))
    .filter(x=>x.st.watched && x.st[person]!=null)
    .sort((a,b)=>b.st[person]-a.st[person])
    .slice(0,limit);
}
function renderTop10(){
  const kar = top10("kar",10,"film"), adam = top10("adam",10,"film");
  document.getElementById("top10Kar").innerHTML = kar.map((r,i)=>rankRowHTML(i,r.film,r.st,"kar")).join("");
  document.getElementById("top10Adam").innerHTML = adam.map((r,i)=>rankRowHTML(i,r.film,r.st,"adam")).join("");
  document.getElementById("top10KarEmpty").hidden = kar.length>0;
  document.getElementById("top10AdamEmpty").hidden = adam.length>0;
}

/* ============================================================
   WIDOK: SAGI
   ============================================================ */
function allSagas(){
  return [...new Set(Object.values(STATE).map(s=>s.saga).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pl"));
}
function renderSagi(){
  const entries = collectAllFilmEntries();
  const groups = {};
  for(const e of entries){
    const st = stateFor(e.film.id);
    if(!st.saga) continue;
    (groups[st.saga] ??= []).push({film:e.film, st});
  }
  const names = Object.keys(groups).sort((a,b)=>a.localeCompare(b,"pl"));
  document.getElementById("sagaGroups").innerHTML = names.length ? names.map(name=>{
    const items = groups[name];
    const rated = items.map(i=>avg(i.st)).filter(v=>v!==null);
    const gAvg = rated.length ? rated.reduce((a,b)=>a+b,0)/rated.length : null;
    return `
    <div class="saga-group">
      <div class="saga-head">
        <h3>${esc(name)}</h3>
        <span class="pool-count">${items.length} ${items.length===1?"film":"filmów"}</span>
        <span class="saga-avg">${gAvg!==null?"śr. "+fmtAvg(gAvg):""}</span>
      </div>
      <div class="saga-body">
        ${items.map(i=>ticketHTML(i.film, i.st, {showShows:false, showAds:true, showSaga:false})).join("")}
      </div>
    </div>`;
  }).join("") : `<div class="empty">Żaden film nie ma jeszcze przypisanej sagi. Kliknij „+ saga" na bilecie filmu, żeby dodać.</div>`;
}
function editSaga(id){
  const cur = stateFor(id).saga || "";
  const existing = allSagas().join(", ");
  const val = prompt(`Do jakiej sagi / uniwersum należy ten tytuł?\n(zostaw puste, aby usunąć przypisanie)\n\nIstniejące sagi: ${existing||"brak"}`, cur);
  if(val===null) return;
  setFilmState(id, {saga: val.trim() || null});
}

/* ============================================================
   WIDOK: SERIALE
   ============================================================ */
function renderSeriale(){
  const shows = Object.values(TV);
  const watched = shows.filter(s=>stateFor(s.id).watched);
  const want = shows.filter(s=>!stateFor(s.id).watched && stateFor(s.id).want);
  const rest = shows.filter(s=>!stateFor(s.id).watched && !stateFor(s.id).want);

  document.getElementById("tvWatchedList").innerHTML = watched.map(s=>ticketHTML(s, stateFor(s.id), {kind:"tv", showAds:false})).join("");
  document.getElementById("tvWantList").innerHTML    = want.map(s=>ticketHTML(s, stateFor(s.id), {kind:"tv", showAds:false})).join("");
  document.getElementById("tvRestList").innerHTML    = rest.map(s=>ticketHTML(s, stateFor(s.id), {kind:"tv", showAds:false})).join("");
  document.getElementById("tvWatchedEmpty").hidden = watched.length>0;
  document.getElementById("tvWantEmpty").hidden = want.length>0;
  document.getElementById("tvRestEmpty").hidden = rest.length>0;
  document.getElementById("tvWatchedCount").textContent = watched.length;
  document.getElementById("tvWantCount").textContent = want.length;
  document.getElementById("tvRestCount").textContent = rest.length;

  const tk = top10("kar",10,"tv"), ta = top10("adam",10,"tv");
  document.getElementById("tvTop10Kar").innerHTML = tk.map((r,i)=>rankRowHTML(i,r.film,r.st,"kar")).join("") || `<div class="empty">Brak ocen.</div>`;
  document.getElementById("tvTop10Adam").innerHTML = ta.map((r,i)=>rankRowHTML(i,r.film,r.st,"adam")).join("") || `<div class="empty">Brak ocen.</div>`;
}

/* ============================================================
   WIDOK: ULUBIONE (bez przypisania do miesiąca)
   ============================================================ */
function renderFavorites(){
  const items = Object.values(FAV);
  document.getElementById("favList").innerHTML = items.map(f=>ticketHTML(f, stateFor(f.id), {kind:"fav", showAds:true})).join("");
  document.getElementById("favEmpty").hidden = items.length>0;
  document.getElementById("favCount").textContent = items.length;
}

/* ============================================================
   WIDOK: PRZEKĄSKI
   ============================================================ */
function renderSnacks(){
  const items = Object.values(SNACKS).slice().sort((a,b)=>(avg(stateFor(b.id))??-1)-(avg(stateFor(a.id))??-1));
  document.getElementById("snackList").innerHTML = items.map(s=>snackCardHTML(s, stateFor(s.id))).join("");
  document.getElementById("snackEmpty").hidden = items.length>0;
}
document.getElementById("addSnackBtn")?.addEventListener("click", async ()=>{
  const name = prompt("Nazwa przekąski (np. Popcorn słony, Nachosy z serem):");
  if(!name || !name.trim()) return;
  const icon = prompt("Emoji/ikonka (opcjonalnie, Enter dla 🍿):", "🍿");
  await addSnack({id:"sn"+Date.now(), name:name.trim(), icon:(icon||"🍿").trim()||"🍿"});
});

/* ============================================================
   WIDOK: LOSUJ
   ============================================================ */
let drawSource = "both";
function renderLosuj(){ renderPool("kar"); renderPool("adam"); }
function renderPool(person){
  const key = person==="kar" ? "karolina" : "adam";
  const items = POOL[key] || [];
  const grid = document.getElementById("pool-"+person);
  grid.innerHTML = items.map(it=>`
    <div class="pool-card" data-id="${esc(it.id)}" data-person="${person}">
      ${it.poster?`<img src="${esc(it.poster)}" alt="${esc(it.title)}" title="${esc(it.title)}">`:`<div class="ph" title="${esc(it.title)}">🎬</div>`}
      <button class="pc-del" data-act="poolDel" title="Usuń z puli">✕</button>
    </div>`).join("");
  document.getElementById("count-"+person).textContent = items.length + "/30";
}
function drawRandom(){
  let pool = [];
  if(drawSource==="kar"||drawSource==="both") pool = pool.concat(POOL.karolina||[]);
  if(drawSource==="adam"||drawSource==="both") pool = pool.concat(POOL.adam||[]);
  if(!pool.length){ alert("Wybrana pula jest pusta — dodaj filmy najpierw."); return; }
  const btn = document.getElementById("drawBtn"); btn.disabled = true;
  const card = document.getElementById("drawCard"); card.hidden = false;
  let i = 0; const total = 14;
  function tick(){
    const r = pool[Math.floor(Math.random()*pool.length)];
    card.innerHTML = `${r.poster?`<img src="${esc(r.poster)}" alt="">`:""}<div class="draw-title">${esc(r.title)}</div>`;
    i++;
    if(i < total) setTimeout(tick, 60 + i*14);
    else btn.disabled = false;
  }
  tick();
}

/* ============================================================
   PRZEŁĄCZANIE WIDOKÓW
   ============================================================ */
const VIEWS = ["months","ranking","top10","sagi","seriale","ulubione","przekaski","losuj"];
function currentView(){ const h=location.hash.replace("#",""); return VIEWS.includes(h)?h:"months"; }
function setView(){
  const v = currentView();
  for(const id of VIEWS) document.getElementById(id+"Main").hidden = (id!==v);
  document.getElementById("months").hidden = v!=="months";
  document.getElementById("toolbar").style.display = v==="months" ? "" : "none";
  document.querySelectorAll("#tabs a").forEach(a=>a.classList.toggle("active", a.dataset.view===v));
  renderCurrentView();
}
function renderCurrentView(){
  const v = currentView();
  if(v==="months") render();
  else if(v==="ranking") renderRanking();
  else if(v==="top10") renderTop10();
  else if(v==="sagi") renderSagi();
  else if(v==="seriale") renderSeriale();
  else if(v==="ulubione") renderFavorites();
  else if(v==="przekaski") renderSnacks();
  else if(v==="losuj") renderLosuj();
}
window.addEventListener("hashchange", setView);

/* ============================================================
   DELEGACJA ZDARZEŃ — kafelki (filmy + seriale)
   ============================================================ */
function wireTicketEvents(containerId){
  const root = document.getElementById(containerId);
  if(!root) return;
  root.addEventListener("click", e=>{
    const trigger = e.target.closest("[data-act]");
    if(!trigger) return;
    const row = trigger.closest(".ticket, .rank-row");
    if(!row) return;
    const id = row.dataset.id, kind = row.dataset.kind || "film";
    switch(trigger.dataset.act){
      case "toggle": setFilmState(id, {watched: !stateFor(id).watched}); break;
      case "want":   setFilmState(id, {want: !stateFor(id).want}); break;
      case "saga":   editSaga(id); break;
      case "note":   openNoteDialog(id, trigger.dataset.person); break;
      case "details": { const item = findAnyItem(id, kind); if(item) openDetails(id, item, kind); break; }
      case "del":
        if(!confirm("Usunąć ten wpis?")) return;
        if(kind==="tv") deleteTvShow(id);
        else if(kind==="fav") deleteFavorite(id);
        else if(kind==="snack") deleteSnack(id);
        else deleteManualFilm(id);
        break;
    }
  });
  root.addEventListener("change", e=>{
    const inp = e.target.closest("input[data-field]");
    if(!inp) return;
    const id = inp.closest(".ticket, .rank-row").dataset.id;
    const v = inp.value===""?null:Number(inp.value);
    setFilmState(id, {[inp.dataset.field]: (v===null||isNaN(v))?null:v});
  });
}
["monthsMain","rankingMain","top10Main","sagiMain","serialeMain","ulubioneMain","przekaskiMain"].forEach(wireTicketEvents);

document.getElementById("sort").addEventListener("change", render);

/* ============================================================
   POLA / LOSOWANIE — zdarzenia
   ============================================================ */
document.querySelectorAll('input[name="drawSrc"]').forEach(r=>{
  r.addEventListener("change", e=>{ if(e.target.checked) drawSource = e.target.value; });
});
document.getElementById("drawBtn").addEventListener("click", drawRandom);
["kar","adam"].forEach(person=>{
  document.getElementById("pool-"+person).addEventListener("click", e=>{
    const btn = e.target.closest('[data-act="poolDel"]'); if(!btn) return;
    const card = btn.closest(".pool-card");
    removeFromPool(person==="kar"?"karolina":"adam", card.dataset.id);
  });
});
document.getElementById("addPoolKar").onclick = ()=>openSearch({mode:"pool", person:"karolina"});
document.getElementById("addPoolAdam").onclick = ()=>openSearch({mode:"pool", person:"adam"});
document.getElementById("addFilmBtn").onclick = ()=>openSearch({mode:"film", month:currentMonth});
document.getElementById("addTvBtn").onclick = ()=>openSearch({mode:"tv"});
document.getElementById("addFavBtn").onclick = ()=>openSearch({mode:"fav"});

/* ============================================================
   WYSZUKIWARKA TMDB (wspólny dialog: film / serial / pula)
   ============================================================ */
const TMDB_IMG = "https://image.tmdb.org/t/p/";
const searchDialog = document.getElementById("searchDialog");
let searchCtx = {mode:"film", month:null, person:null};
let lastResults = [];
let searchTimer = null;

function openSearch(ctx){
  searchCtx = ctx;
  document.getElementById("searchTitle").textContent =
    ctx.mode==="tv" ? "Dodaj serial"
    : ctx.mode==="pool" ? `Dodaj do puli (${ctx.person==="karolina"?"Karolina":"Adam"})`
    : ctx.mode==="fav" ? "Dodaj do ulubionych"
    : "Dodaj film";
  document.getElementById("searchInput").value = "";
  document.getElementById("searchResults").innerHTML = "";
  document.getElementById("mfTitle").value = "";
  document.getElementById("mfLink").value = "";
  document.getElementById("mfPoster").value = "";
  document.getElementById("mfLength").value = "";

  const monthWrap = document.getElementById("searchMonthWrap");
  if(ctx.mode==="film"){
    monthWrap.hidden = false;
    const sel = document.getElementById("searchMonth");
    sel.innerHTML = monthRange().map(m=>`<option value="${m}" ${m===ctx.month?"selected":""}>${esc(monthLabel(m))}</option>`).join("");
  } else { monthWrap.hidden = true; }

  searchDialog.showModal();
  document.getElementById("searchInput").focus();
}
document.getElementById("searchCancel").onclick = ()=>searchDialog.close();

document.getElementById("searchInput").addEventListener("input", e=>{
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if(q.length < 2){ document.getElementById("searchResults").innerHTML = ""; return; }
  searchTimer = setTimeout(()=>runSearch(q), 350);
});

async function runSearch(q){
  const box = document.getElementById("searchResults");
  if(!TMDB_KEY || TMDB_KEY.startsWith("WSTAW")){
    box.innerHTML = `<p class="sr-hint">Brak klucza TMDB w config.js — użyj formularza „Dodaj ręcznie" poniżej.</p>`;
    return;
  }
  const type = searchCtx.mode==="tv" ? "tv" : "movie";
  try{
    const r = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&language=pl-PL&query=${encodeURIComponent(q)}`);
    if(!r.ok) throw new Error("HTTP "+r.status);
    const data = await r.json();
    lastResults = (data.results||[]).slice(0,8);
    box.innerHTML = lastResults.length ? lastResults.map(res=>{
      const title = res.title || res.name;
      const date = res.release_date || res.first_air_date || "";
      const poster = res.poster_path ? TMDB_IMG+"w92"+res.poster_path : null;
      return `<button type="button" class="sr-item" data-id="${res.id}">
        ${poster?`<img src="${poster}" alt="">`:'<div class="sr-ph">🎬</div>'}
        <span>${esc(title)} ${date?`<small>(${esc(date.slice(0,4))})</small>`:""}</span>
      </button>`;
    }).join("") : `<p class="sr-hint">Brak wyników.</p>`;
  }catch(err){
    box.innerHTML = `<p class="sr-hint">Błąd wyszukiwania TMDB: ${esc(err.message)}</p>`;
  }
}

document.getElementById("searchResults").addEventListener("click", async e=>{
  const btn = e.target.closest(".sr-item"); if(!btn) return;
  await selectSearchResult(Number(btn.dataset.id));
});

async function selectSearchResult(tmdbId){
  const r = lastResults.find(x=>x.id===tmdbId);
  if(!r) return;

  if(searchCtx.mode==="pool"){
    const item = {id:"t"+tmdbId, title:r.title||r.name, poster: r.poster_path?TMDB_IMG+"w342"+r.poster_path:null};
    await addToPool(searchCtx.person, item);
    searchDialog.close(); return;
  }
  if(searchCtx.mode==="tv"){
    const show = {
      id:"tv"+tmdbId, title:r.name, poster:r.poster_path?TMDB_IMG+"w342"+r.poster_path:null,
      link:`https://www.themoviedb.org/tv/${tmdbId}`, year:(r.first_air_date||"").slice(0,4)||null,
    };
    await addTvShow(show);
    searchDialog.close(); return;
  }
  if(searchCtx.mode==="fav"){
    let runtime=null, collectionName=null;
    try{
      const dr = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&language=pl-PL`);
      if(dr.ok){ const det = await dr.json(); runtime = det.runtime || null; collectionName = det.belongs_to_collection?.name || null; }
    }catch(_e){}
    const film = {
      id:"t"+tmdbId, title:r.title, poster:r.poster_path?TMDB_IMG+"w342"+r.poster_path:null,
      link:`https://www.themoviedb.org/movie/${tmdbId}`, length:runtime,
      year:(r.release_date||"").slice(0,4)||null, manual:true, source:"tmdb",
    };
    await addFavorite(film);
    if(collectionName) await setFilmState(film.id, {saga: collectionName});
    searchDialog.close(); return;
  }
  // mode === "film"
  let runtime = null, collectionName = null;
  try{
    const dr = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}&language=pl-PL`);
    if(dr.ok){ const det = await dr.json(); runtime = det.runtime || null; collectionName = det.belongs_to_collection?.name || null; }
  }catch(_e){ /* brak szczegółów nie blokuje dodania */ }

  const month = document.getElementById("searchMonth").value || searchCtx.month;
  const film = {
    id:"t"+tmdbId, title:r.title, poster:r.poster_path?TMDB_IMG+"w342"+r.poster_path:null,
    link:`https://www.themoviedb.org/movie/${tmdbId}`, length:runtime,
    year:(r.release_date||"").slice(0,4)||null, cinemas:[], firstSeen:month+"-01", manual:true, source:"tmdb",
  };
  await addManualFilm(month, film);
  if(collectionName) await setFilmState(film.id, {saga: collectionName});
  currentMonth = month;
  searchDialog.close();
}

/* ręczne dodanie bez TMDB (fallback) */
document.getElementById("mfSave").onclick = async ()=>{
  const title = document.getElementById("mfTitle").value.trim();
  if(!title){ alert("Podaj tytuł."); return; }
  const id = "m"+Date.now();
  const base = {
    id, title,
    poster: document.getElementById("mfPoster").value.trim() || null,
    link: document.getElementById("mfLink").value.trim() || null,
    length: document.getElementById("mfLength").value ? Number(document.getElementById("mfLength").value) : null,
    manual:true, source:"manual",
  };
  if(searchCtx.mode==="pool"){
    await addToPool(searchCtx.person, {id, title, poster:base.poster});
  } else if(searchCtx.mode==="tv"){
    await addTvShow({...base, year:null});
  } else if(searchCtx.mode==="fav"){
    await addFavorite({...base, year:null});
  } else {
    const month = document.getElementById("searchMonth").value || searchCtx.month;
    await addManualFilm(month, {...base, year:month.slice(0,4), cinemas:[], firstSeen:month+"-01"});
    currentMonth = month;
  }
  searchDialog.close();
};

/* ============================================================
   NOTATKI (krótka — widoczna na kafelku, długa — tylko w szczegółach)
   ============================================================ */
const noteDialog = document.getElementById("noteDialog");
let noteCtx = {id:null, person:null};
function openNoteDialog(id, person){
  noteCtx = {id, person};
  const st = stateFor(id);
  document.getElementById("noteDialogTitle").textContent = `Notatka — ${person==="kar"?"Karolina":"Adam"}`;
  document.getElementById("noteShort").value = st[person+"NoteShort"] || "";
  document.getElementById("noteLong").value = st[person+"NoteLong"] || "";
  noteDialog.showModal();
}
document.getElementById("noteCancel").onclick = ()=>noteDialog.close();
document.getElementById("noteSave").onclick = ()=>{
  const short = document.getElementById("noteShort").value.trim().slice(0,80);
  const long = document.getElementById("noteLong").value.trim();
  setFilmState(noteCtx.id, {
    [noteCtx.person+"NoteShort"]: short || null,
    [noteCtx.person+"NoteLong"]: long || null,
  });
  noteDialog.close();
};

/* ============================================================
   MODAL SZCZEGÓŁÓW (plakat, ocena+poziom, obsada z TMDB, notatki)
   ============================================================ */
const detailsDialog = document.getElementById("detailsDialog");
async function openDetails(id, film, kind){
  const st = stateFor(id);
  const a = avg(st);
  const color = scoreColor(a);
  const lvl = scoreLevel(a);
  const body = document.getElementById("detailsBody");
  body.innerHTML = `
    <div class="dt-head">
      <div class="dt-poster">${film.poster?`<img src="${esc(film.poster)}" alt="">`:'<div class="ph">🎬</div>'}</div>
      <div class="dt-info">
        <h2>${esc(film.title)}</h2>
        <div class="dt-meta">${film.year?esc(film.year):""}${film.year&&film.length?" · ":""}${film.length?film.length+" min":""}</div>
        <div class="dt-score" ${color?`style="color:${color};border-color:${color}"`:""}>${fmtAvg(a)}</div>
        ${lvl?`<div class="dt-level" style="color:${color}">${esc(lvl)}</div>`:""}
        ${film.link?`<a href="${esc(film.link)}" target="_blank" rel="noopener" class="btn">Otwórz stronę ↗</a>`:""}
      </div>
    </div>
    ${kind!=="snack"?`<div class="dt-section"><h4>Obsada</h4><p id="detailsCast">Wczytywanie…</p></div>`:""}
    ${(st.karNoteLong || st.adamNoteLong) ? `<div class="dt-section"><h4>Notatki</h4>
      ${st.karNoteLong?`<p><strong>Karolina:</strong> ${esc(st.karNoteLong)}</p>`:""}
      ${st.adamNoteLong?`<p><strong>Adam:</strong> ${esc(st.adamNoteLong)}</p>`:""}
    </div>` : ""}
  `;
  detailsDialog.showModal();
  if(kind!=="snack"){
    const cast = await getCast(id, film, kind);
    const el = document.getElementById("detailsCast");
    if(el) el.textContent = cast && cast.length ? cast.join(", ") : "Brak danych o obsadzie.";
  }
}
document.getElementById("detailsClose").onclick = ()=>detailsDialog.close();

async function getCast(id, film, kind){
  try{
    const snap = await getDoc(doc(detailsCol, id));
    if(snap.exists() && snap.data().cast) return snap.data().cast;
  }catch(_e){ /* brak cache, lecimy dalej */ }
  if(!TMDB_KEY || TMDB_KEY.startsWith("WSTAW")) return null;

  let tmdbId = null, type = kind==="tv" ? "tv" : "movie";
  if(id.startsWith("tv")) tmdbId = id.slice(2);
  else if(id.startsWith("t")) tmdbId = id.slice(1);
  else {
    try{
      const r = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=pl-PL&query=${encodeURIComponent(film.title)}`);
      const data = await r.json();
      tmdbId = data.results?.[0]?.id || null;
    }catch(_e){ return null; }
  }
  if(!tmdbId) return null;
  try{
    const cr = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/credits?api_key=${TMDB_KEY}&language=pl-PL`);
    const cdata = await cr.json();
    const cast = (cdata.cast||[]).slice(0,8).map(c=>c.name);
    await setDoc(doc(detailsCol, id), {cast, tmdbId, cachedAt: Date.now()});
    return cast;
  }catch(_e){ return null; }
}

/* ============================================================
   INIT
   ============================================================ */
async function loadFilms(){
  try{
    const r = await fetch("data/films.json?v="+Date.now());
    DB = await r.json();
  }catch(e){
    document.getElementById("updated").textContent = "Nie udało się wczytać data/films.json — sprawdź, czy plik istnieje w repo.";
  }
}
(async function init(){
  await loadFilms();
  if(DB.updated) document.getElementById("updated").textContent = "Repertuar z: " + DB.updated;
  const range = monthRange();
  const now = range.find(isCurrentMonth);
  currentMonth = (now && DB.months[now]) ? now : (Object.keys(DB.months).sort().pop() || now || range[range.length-1]);
  setView();
})();
