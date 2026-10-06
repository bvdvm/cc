// game.js — KINODLE: codziennie jeden film z naszych ocenionych; zgadujemy go po wskazówkach (jak „Who Are Ya?”)
export const MAX_TRIES = 10;
export const pointsFor = n => (n >= 1 && n <= MAX_TRIES ? Math.max(10, 100 - (n - 1) * 10) : 0);

// pojedyncza komórka wskazówki: kierunek względem szukanego filmu
export function cmpNum(guess, target, near) {
  if (guess === null || guess === undefined || target === null || target === undefined) return { t: "na" };
  if (guess === target) return { t: "eq" };
  const up = target > guess;
  return { t: Math.abs(target - guess) <= near ? (up ? "near-up" : "near-down") : (up ? "up" : "down") };
}
export function compareGuess(g, t) {
  return {
    kar: cmpNum(g.kP, t.kP, 5), adam: cmpNum(g.aP, t.aP, 5),
    year: cmpNum(g.year, t.year, 2),
    genre: { t: g.genre && t.genre && g.genre === t.genre ? "eq" : "ne" },
  };
}
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const WHO = { kar: { name: "Karolina", heart: "💛", past: "zagrała" }, adam: { name: "Adam", heart: "💙", past: "zagrał" } };

export function initGame(ctx) {
  const { fs, db, esc, getLv, pcSVG, personScore, getRatings, getMovies, getSeries, getSeriesScores, toast } = ctx;
  const { collection, doc, setDoc, getDoc, onSnapshot } = fs;
  const CG = collection(db, "kGame");
  const el = id => document.getElementById(id);
  let DOCS = {};                       // id → dane
  const ui = { who: null, sug: [], mode: "kino" };

  onSnapshot(CG, s => {
    const n = {}; s.forEach(d => n[d.id] = d.data()); DOCS = n;
    if (location.hash === "#gra") render();
    ctx.onChange && ctx.onChange();
  }, e => console.warn("kGame:", e));

  /* ───── dane filmów ───── */
  function info(id) {
    const f = (getMovies() || {})[id], r = (getRatings() || {})[id]; if (!f || !r) return null;
    return { id, title: f.title, poster: f.poster, year: f.year ? Number(f.year) : null, genre: f.genre || "", kP: personScore(r.kar), aP: personScore(r.adam) };
  }
  function pool() {
    return Object.keys(getRatings() || {}).map(info).filter(i => i && i.kP !== null && i.aP !== null).sort((a, b) => a.id.localeCompare(b.id));
  }
  const today = () => dateKey();
  const dailyId = d => "daily_" + d;
  const playId = (d, w) => `play_${d}_${w}`;

  async function ensureDaily() {
    const d = today(), cur = DOCS[dailyId(d)];
    if (cur && info(cur.filmId)) return cur.filmId;
    const p = pool(); if (p.length < 5) return null;
    // sprawdź w bazie, zanim ktoś drugi zdąży utworzyć film dnia
    try { const snap = await getDoc(doc(CG, dailyId(d))); if (snap.exists() && info(snap.data().filmId)) { DOCS[dailyId(d)] = snap.data(); return snap.data().filmId; } } catch (_e) {}
    const pick = p[hash(d) % p.length].id;
    DOCS[dailyId(d)] = { filmId: pick, date: d };
    await setDoc(doc(CG, dailyId(d)), { filmId: pick, date: d }).catch(() => {});
    return pick;
  }
  const play = (d, w) => DOCS[playId(d, w)] || null;

  /* ───── akcje ───── */
  async function choose(w) {
    if (ui.mode === "wms") return chooseWms(w);
    const pl = play(today(), w);
    if (pl && pl.done) return;
    const fid = await ensureDaily();
    if (!fid) { toast("Za mało wspólnie ocenionych filmów (min. 5)"); return; }
    ui.who = w; ui.sug = [];
    render();
    el("game-input")?.focus();
  }
  function suggest(q) {
    const d = today(), w = ui.who; if (!w) return;
    const used = new Set((play(d, w) || {}).guesses || []);
    const n = norm(q.trim());
    ui.sug = n.length < 1 ? [] : pool().filter(i => !used.has(i.id) && norm(i.title).includes(n)).slice(0, 8);
    renderSug();
  }
  async function guess(id) {
    const d = today(), w = ui.who; if (!w) return;
    const fid = await ensureDaily(); const target = info(fid), g = info(id); if (!target || !g) return;
    const cur = play(d, w) || { date: d, who: w, guesses: [], solved: false, points: 0, done: false };
    if (cur.done || cur.guesses.includes(id)) return;
    const guesses = [...cur.guesses, id], n = guesses.length;
    const solved = id === fid;
    const done = solved || n >= MAX_TRIES;
    const rec = { date: d, who: w, guesses, solved, points: solved ? pointsFor(n) : 0, done, tries: n };
    DOCS[playId(d, w)] = rec;
    el("game-input").value = ""; ui.sug = [];
    render();
    await setDoc(doc(CG, playId(d, w)), rec).catch(e => toast("Nie udało się zapisać: " + e.message));
  }
  function backToWho() { ui.who = null; render(); }

  /* ───── widok ───── */
  const arrow = c => c.t === "eq" ? "✓" : c.t === "na" ? "–" : c.t.endsWith("up") ? "▲" : "▼";
  const cls = c => c.t === "eq" ? "ok" : c.t === "ne" ? "bad" : c.t === "na" ? "na" : c.t.startsWith("near") ? "near" : "far";
  function row(gid, tid) {
    const g = info(gid), t = info(tid); if (!g || !t) return "";
    const c = compareGuess(g, t);
    const cell = (label, val, cc, arrowOn = true) => `<div class="gm-cell ${cls(cc)}"><small>${label}</small><b>${val}</b>${arrowOn ? `<i>${arrow(cc)}</i>` : `<i>${cc.t === "eq" ? "✓" : "✕"}</i>`}</div>`;
    return `<div class="gm-row">
      <div class="gm-film ${gid === tid ? "win" : ""}">${g.poster ? `<img src="${esc(g.poster)}" alt="">` : "🎬"}<b>${esc(g.title)}</b></div>
      ${cell("💛 Karolina", g.kP === null ? "–" : g.kP + "%", c.kar)}
      ${cell("💙 Adam", g.aP === null ? "–" : g.aP + "%", c.adam)}
      ${cell("Rok", g.year ?? "–", c.year)}
      ${cell("Gatunek", esc(g.genre || "–"), c.genre, false)}
    </div>`;
  }
  function totals() {
    const t = { kar: { pts: 0, wmsPts: 0, games: 0, wins: 0, tries: 0 }, adam: { pts: 0, wmsPts: 0, games: 0, wins: 0, tries: 0 } };
    for (const [id, d] of Object.entries(DOCS)) {
      if (id.startsWith("wms_") && d.who && t[d.who] && d.done) { t[d.who].wmsPts += d.points || 0; continue; }
      if (!id.startsWith("play_") || !d.done || !t[d.who]) continue;
      const x = t[d.who]; x.pts += d.points || 0; x.games++; if (d.solved) { x.wins++; x.tries += d.guesses.length; }
    }
    return t;
  }

  function renderWho() {
    const d = today();
    el("game-who").innerHTML = ["kar", "adam"].map(w => {
      const pl = ui.mode === "kino" ? play(d, w) : wmsPlay(d, w), done = pl && pl.done;
      const sub = done ? `${WHO[w].past} dziś: ${pl.points} pkt`
        : ui.mode === "kino" ? (pl && pl.guesses && pl.guesses.length ? `w trakcie · próba ${pl.guesses.length + 1}/${MAX_TRIES}` : "gotowa do gry")
        : (pl && pl.answers && pl.answers.length ? `w trakcie · seria ${pl.points}` : "gotowa do gry");
      return `<button class="gm-who ${ui.who === w ? "active" : ""} ${done ? "done" : ""}" ${done ? "disabled" : ""} onclick="GAME.choose('${w}')">
        <span class="gm-who-h">${WHO[w].heart}</span><b>${WHO[w].name}</b><small>${sub}</small></button>`;
    }).join("");
    const tot = totals();
    el("game-score").innerHTML = ["kar", "adam"].map(w => {
      const x = tot[w];
      return `<div class="gm-sc"><div class="gm-sc-n">${WHO[w].heart} ${WHO[w].name}</div><div class="gm-sc-pts">${x.pts + x.wmsPts}</div>
        <small>Kinodle ${x.pts} · Ile dał? ${x.wmsPts}<br>${x.games} gier Kinodle · ${x.wins} trafionych${x.wins ? ` · śr. ${Math.round(x.tries / x.wins * 10) / 10} prób` : ""}</small></div>`;
    }).join("");
  }
  function render() {
    if (!el("game-root")) return;
    document.querySelectorAll("#game-modes .top-tab").forEach(t => t.classList.toggle("active", t.dataset.gmode === ui.mode));
    el("game-kino").style.display = ui.mode === "kino" ? "" : "none";
    el("game-wms").style.display = ui.mode === "wms" ? "" : "none";
    renderWho();
    if (ui.mode === "kino") renderKino(); else renderWms();
  }
  function renderKino() {
    const d = today(), p = pool();
    const info_ = el("game-info"), play_ = el("game-play"), board = el("game-board");
    if (p.length < 5) {
      info_.innerHTML = `<div class="empty">Do gry potrzebujemy co najmniej 5 filmów ocenionych przez oboje (macie ${p.length}). Oceniajcie dalej! 🍿</div>`;
      play_.style.display = "none"; board.innerHTML = ""; return;
    }
    const tid = (DOCS[dailyId(d)] || {}).filmId;
    if (!ui.who) {
      info_.innerHTML = `<div class="gm-hint">Wybierz, kto gra. Każde z Was może zagrać <b>raz dziennie</b> — szukamy tego samego filmu z naszych ocen. Dziś w puli: <b>${p.length}</b> filmów.</div>`;
      play_.style.display = "none"; board.innerHTML = ""; return;
    }
    const w = ui.who, pl = play(d, w) || { guesses: [], done: false };
    const n = pl.guesses.length;
    if (!pl.done) {
      info_.innerHTML = `<div class="gm-hint"><b>${WHO[w].heart} ${WHO[w].name}</b> · próba <b>${n + 1}/${MAX_TRIES}</b> · do zdobycia <b class="gm-pts">${pointsFor(n + 1)} pkt</b>
        <button class="sx-mini" onclick="GAME.back()" style="margin-left:8px">zmień gracza</button></div>
        <div class="gm-legend"><span class="ok">zgadza się</span><span class="near">▲▼ blisko (±5% / ±2 lata)</span><span class="far">▲ szukany wyższy · ▼ niższy</span><span class="bad">inny gatunek</span></div>`;
      play_.style.display = "";
    } else {
      play_.style.display = "none";
      const t = info(tid);
      info_.innerHTML = pl.solved
        ? `<div class="gm-result win">🎉 <b>${esc(t ? t.title : "")}</b> — zgadnięte w próbie ${n}! <span>+${pl.points} pkt</span></div>`
        : `<div class="gm-result lose">😬 Nie udało się. Szukany film: <b>${esc(t ? t.title : "?")}</b> ${t ? `(${t.year || "?"}, ${esc(t.genre)}, 💛${t.kP}% 💙${t.aP}%)` : ""} <span>0 pkt</span></div>`;
    }
    board.innerHTML = [...pl.guesses].reverse().map(g => row(g, tid)).join("") +
      (pl.done && !pl.guesses.includes(tid) ? row(tid, tid) : "");
    renderSug();
  }
  function renderSug() {
    const box = el("game-sug"); if (!box) return;
    box.innerHTML = ui.sug.map(i => `<button type="button" class="sr-item" onmousedown="event.preventDefault()" onclick="GAME.guess('${esc(i.id)}')">
      ${i.poster ? `<img src="${esc(i.poster)}" alt="">` : '<div class="sr-ph">🎬</div>'}<span>${esc(i.title)} <small style="color:var(--muted)">(${i.year || "?"})</small></span></button>`).join("");
  }


  /* ═════════ „Ile dał?” (WhatsMyScore) ═════════ */
  const wmsSeqId = d => "wms_seq_" + d, wmsPlayId = (d, w) => `wms_${d}_${w}`;
  const wmsPlay = (d, w) => DOCS[wmsPlayId(d, w)] || null;
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // pula: każda ocena jednej osoby (film albo serial) = osobna pozycja
  function wmsPool() {
    const out = [], R = getRatings() || {}, M = getMovies() || {};
    for (const [id, r] of Object.entries(R)) {
      if (!M[id]) continue;
      for (const w of ["kar", "adam"]) { const p = personScore(r[w]); if (p !== null) out.push({ key: `f:${id}|${w}|${p}`, id, kind: "f", who: w, pct: p }); }
    }
    for (const x of (getSeriesScores ? getSeriesScores() : [])) out.push({ key: `s:${x.id}|${x.who}|${x.pct}`, id: x.id, kind: "s", who: x.who, pct: x.pct });
    return out;
  }
  // sekwencja dnia: deterministyczna, bez kolejnych identycznych ocen i bez tego samego tytułu pod rząd
  function buildSeq(pool, seed) {
    const rnd = mulberry(seed), left = [...pool].sort((a, b) => a.key.localeCompare(b.key));
    for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
    const seq = [left.shift()];
    while (left.length) {
      const prev = seq[seq.length - 1];
      let k = left.findIndex(x => x.pct !== prev.pct && x.id !== prev.id);
      if (k < 0) k = left.findIndex(x => x.id !== prev.id);
      if (k < 0) k = 0;
      seq.push(left.splice(k, 1)[0]);
    }
    return seq.map(x => x.key);
  }
  const parseKey = k => { const [a, who, pct] = k.split("|"); return { kind: a[0], id: a.slice(2), who, pct: Number(pct) }; };
  function wmsItem(key) {
    const it = parseKey(key);
    if (it.kind === "f") { const f = (getMovies() || {})[it.id]; return { ...it, title: f ? f.title : "?", poster: f ? f.poster : null, year: f ? f.year : null }; }
    const s = (getSeries ? getSeries() : {})[it.id] || {};
    return { ...it, title: s.title || "?", poster: s.poster || null, year: s.year || null };
  }
  async function ensureSeq() {
    const d = today(), id = wmsSeqId(d), cur = DOCS[id];
    if (cur && cur.seq && cur.seq.length > 2) return cur.seq;
    try { const snap = await getDoc(doc(CG, id)); if (snap.exists() && (snap.data().seq || []).length > 2) { DOCS[id] = snap.data(); return snap.data().seq; } } catch (_e) {}
    const pool = wmsPool(); if (pool.length < 10) return null;
    const seq = buildSeq(pool, hash(d));
    DOCS[id] = { date: d, seq };
    await setDoc(doc(CG, id), { date: d, seq }).catch(() => {});
    return seq;
  }
  async function chooseWms(w) {
    const pl = wmsPlay(today(), w); if (pl && pl.done) return;
    const seq = await ensureSeq();
    if (!seq) { toast("Za mało ocen do gry (min. 10)"); return; }
    ui.who = w; render();
  }
  async function answer(dir) {
    const d = today(), w = ui.who; if (!w) return;
    const seq = await ensureSeq(); if (!seq) return;
    const cur = wmsPlay(d, w) || { date: d, who: w, answers: [], points: 0, done: false };
    if (cur.done) return;
    const k = cur.answers.length, ref = parseKey(seq[k]), nxt = parseKey(seq[k + 1]);
    const ok = dir === "h" ? nxt.pct >= ref.pct : nxt.pct <= ref.pct;   // remis liczy się jako trafienie
    const answers = [...cur.answers, dir + (ok ? "+" : "-")];
    const points = answers.filter(a => a.endsWith("+")).length;
    const done = !ok || k + 2 >= seq.length;
    const rec = { date: d, who: w, answers, points, done, wrong: !ok };
    DOCS[wmsPlayId(d, w)] = rec;
    render();
    await setDoc(doc(CG, wmsPlayId(d, w)), rec).catch(e => toast("Nie udało się zapisać: " + e.message));
  }
  function setMode(m) { ui.mode = m; ui.who = null; render(); }

  function wmsCard(it, hidden, cls = "") {
    const lv = hidden ? null : getLv(it.pct);
    return `<div class="wm-card ${cls}">
      <div class="wm-poster">${it.poster ? `<img src="${esc(it.poster)}" alt="">` : (it.kind === "s" ? "📺" : "🎬")}</div>
      <div class="wm-title">${esc(it.title)}</div>
      <div class="wm-meta">${it.kind === "s" ? "📺 Serial" : "🎬 Film"}${it.year ? " · " + esc(it.year) : ""}</div>
      <div class="wm-who">${WHO[it.who].heart} ${WHO[it.who].name} ${hidden ? "oceniła/ocenił:" : "oceniła/ocenił:"}</div>
      ${hidden ? `<div class="wm-score hid">?</div>` : `<div class="wm-score" style="color:${lv.color}">${pcSVG(lv.key, 30)}<b>${it.pct}%</b></div>`}
    </div>`;
  }
  function renderWms() {
    const box = el("game-wms"); if (!box) return;
    const d = today(), pool = wmsPool();
    if (pool.length < 10) { box.innerHTML = `<div class="empty">Do „Ile dał?” potrzebujemy co najmniej 10 ocen filmów lub seriali (macie ${pool.length}).</div>`; return; }
    const seq = (DOCS[wmsSeqId(d)] || {}).seq;
    if (!ui.who || !seq) {
      box.innerHTML = `<div class="gm-hint"><b>Ile dał?</b> Widzisz ocenę jednej osoby za film lub serial — zgadnij, czy następna pozycja (ocena <i>jednej z Was</i>) jest <b>wyższa</b> czy <b>niższa</b>. Każda dobra odpowiedź to <b>1 punkt</b>, pierwszy błąd kończy serię. Jedna seria dziennie na osobę, a punkty idą do wspólnej puli z Kinodle.</div>`;
      return;
    }
    const w = ui.who, pl = wmsPlay(d, w) || { answers: [], points: 0, done: false };
    const k = pl.answers.length;
    const marks = pl.answers.map(a => `<span class="wm-mark ${a.endsWith("+") ? "ok" : "bad"}">${a[0] === "h" ? "▲" : "▼"}</span>`).join("");
    if (!pl.done) {
      const ref = wmsItem(seq[k]), nxt = wmsItem(seq[k + 1]);
      box.innerHTML = `<div class="gm-hint"><b>${WHO[w].heart} ${WHO[w].name}</b> · seria: <b class="gm-pts">${pl.points}</b> <span class="wm-marks">${marks}</span>
        <button class="sx-mini" onclick="GAME.back()" style="margin-left:8px">zmień gracza</button></div>
        <div class="wm-arena">${wmsCard(ref, false, "ref")}
          <div class="wm-vs">
            <button class="wm-btn up" onclick="GAME.answer('h')">▲<span>Wyżej</span></button>
            <button class="wm-btn down" onclick="GAME.answer('l')">▼<span>Niżej</span></button>
          </div>${wmsCard(nxt, true)}</div>`;
    } else {
      const shown = seq.slice(0, k + 1).map(wmsItem);   // odsłonięte, w tym ostatnia (błędna) pozycja
      box.innerHTML = `<div class="gm-result ${pl.points ? "win" : "lose"}">${pl.wrong ? "💥 Seria zakończona" : "🏆 Przeszłaś całą sekwencję!"} — <b>${pl.points}</b> ${pl.points === 1 ? "dobra odpowiedź" : "dobrych odpowiedzi"} <span>+${pl.points} pkt</span></div>
        <div class="wm-run">${shown.map((it, i) => `<div class="wm-run-item ${i > 0 ? (pl.answers[i - 1].endsWith("+") ? "ok" : "bad") : ""}">
          ${i > 0 ? `<i>${pl.answers[i - 1][0] === "h" ? "▲" : "▼"}</i>` : ""}${it.poster ? `<img src="${esc(it.poster)}" alt="">` : ""}<b>${esc(it.title)}</b><small>${WHO[it.who].heart} ${it.pct}%</small></div>`).join("")}</div>`;
    }
  }

  window.GAME = { choose, guess, answer, setMode, back: backToWho };
  el("game-input")?.addEventListener("input", e => suggest(e.target.value));
  el("game-input")?.addEventListener("keydown", e => { if (e.key === "Enter" && ui.sug[0]) { e.preventDefault(); guess(ui.sug[0].id); } });

  /* ───── profil ───── */
  function profileHTML(w) {
    const rec = Object.entries(DOCS).filter(([id, d]) => id.startsWith("play_") && d.who === w && d.done).map(([, d]) => d).sort((a, b) => a.date.localeCompare(b.date));
    const wm = Object.entries(DOCS).filter(([id, d]) => id.startsWith("wms_") && d.who === w && d.done && d.answers).map(([, d]) => d);
    if (!rec.length && !wm.length) return "";
    const wmPts = wm.reduce((s, r) => s + (r.points || 0), 0), wmBest = wm.length ? Math.max(...wm.map(r => r.points || 0)) : 0;
    const wins = rec.filter(r => r.solved), pts = rec.reduce((s, r) => s + (r.points || 0), 0);
    const avgT = wins.length ? Math.round(wins.reduce((s, r) => s + r.guesses.length, 0) / wins.length * 10) / 10 : null;
    const best = wins.length ? Math.min(...wins.map(r => r.guesses.length)) : null;
    let streak = 0, bestStreak = 0; rec.forEach(r => { streak = r.solved ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak); });
    const first = wins.filter(r => r.guesses.length === 1).length;
    return `<div class="section"><div class="sec-hd"><h2>🎯 Kinodle</h2><button class="see-all" onclick="setView('gra')">Zagraj →</button></div>
      <div class="profile-quick-stats sx-pqs">
        <div class="pqs-item"><div class="pqs-val" style="color:var(--gold)">${pts + wmPts}</div><div class="pqs-lbl">Punkty łącznie</div></div>
        ${wm.length ? `<div class="pqs-item"><div class="pqs-val">${wmBest}</div><div class="pqs-lbl">Najdłuższa seria „Ile dał?”</div></div><div class="pqs-item"><div class="pqs-val">${wm.length}</div><div class="pqs-lbl">Serii „Ile dał?”</div></div>` : ""}
        <div class="pqs-item"><div class="pqs-val">${rec.length}</div><div class="pqs-lbl">Rozegranych gier</div></div>
        <div class="pqs-item"><div class="pqs-val">${wins.length}</div><div class="pqs-lbl">Trafionych</div></div>
        ${avgT !== null ? `<div class="pqs-item"><div class="pqs-val">${avgT}</div><div class="pqs-lbl">Śr. prób</div></div>` : ""}
        ${best !== null ? `<div class="pqs-item"><div class="pqs-val">${best}</div><div class="pqs-lbl">Najszybciej (prób)</div></div>` : ""}
        <div class="pqs-item"><div class="pqs-val">${first}</div><div class="pqs-lbl">Za pierwszym razem</div></div>
        <div class="pqs-item"><div class="pqs-val">${bestStreak}🔥</div><div class="pqs-lbl">Najdłuższa seria</div></div>
      </div></div>`;
  }

  return { render, profileHTML, totals };
}
