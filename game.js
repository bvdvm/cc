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
  const { fs, db, esc, getLv, pcSVG, personScore, getRatings, getMovies, toast } = ctx;
  const { collection, doc, setDoc, getDoc, onSnapshot } = fs;
  const CG = collection(db, "kGame");
  const el = id => document.getElementById(id);
  let DOCS = {};                       // id → dane
  const ui = { who: null, sug: [] };

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
    const t = { kar: { pts: 0, games: 0, wins: 0, tries: 0 }, adam: { pts: 0, games: 0, wins: 0, tries: 0 } };
    for (const [id, d] of Object.entries(DOCS)) {
      if (!id.startsWith("play_") || !d.done || !t[d.who]) continue;
      const x = t[d.who]; x.pts += d.points || 0; x.games++; if (d.solved) { x.wins++; x.tries += d.guesses.length; }
    }
    return t;
  }

  function render() {
    const root = el("game-root"); if (!root) return;
    const d = today(), p = pool();
    const tot = totals();
    // wybór gracza
    el("game-who").innerHTML = ["kar", "adam"].map(w => {
      const pl = play(d, w), done = pl && pl.done;
      return `<button class="gm-who ${ui.who === w ? "active" : ""} ${done ? "done" : ""}" ${done ? "disabled" : ""} onclick="GAME.choose('${w}')">
        <span class="gm-who-h">${WHO[w].heart}</span><b>${WHO[w].name}</b>
        <small>${done ? `${WHO[w].past} dziś: ${pl.points} pkt` : pl && pl.guesses.length ? `w trakcie · próba ${pl.guesses.length + 1}/${MAX_TRIES}` : "gotowa do gry"}</small></button>`;
    }).join("");
    // wynik ogólny
    el("game-score").innerHTML = ["kar", "adam"].map(w => {
      const x = tot[w];
      return `<div class="gm-sc"><div class="gm-sc-n">${WHO[w].heart} ${WHO[w].name}</div><div class="gm-sc-pts">${x.pts}</div><small>${x.games} gier · ${x.wins} trafionych${x.wins ? ` · śr. ${Math.round(x.tries / x.wins * 10) / 10} prób` : ""}</small></div>`;
    }).join("");

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

  window.GAME = { choose, guess, back: backToWho };
  el("game-input")?.addEventListener("input", e => suggest(e.target.value));
  el("game-input")?.addEventListener("keydown", e => { if (e.key === "Enter" && ui.sug[0]) { e.preventDefault(); guess(ui.sug[0].id); } });

  /* ───── profil ───── */
  function profileHTML(w) {
    const rec = Object.entries(DOCS).filter(([id, d]) => id.startsWith("play_") && d.who === w && d.done).map(([, d]) => d).sort((a, b) => a.date.localeCompare(b.date));
    if (!rec.length) return "";
    const wins = rec.filter(r => r.solved), pts = rec.reduce((s, r) => s + (r.points || 0), 0);
    const avgT = wins.length ? Math.round(wins.reduce((s, r) => s + r.guesses.length, 0) / wins.length * 10) / 10 : null;
    const best = wins.length ? Math.min(...wins.map(r => r.guesses.length)) : null;
    let streak = 0, bestStreak = 0; rec.forEach(r => { streak = r.solved ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak); });
    const first = wins.filter(r => r.guesses.length === 1).length;
    return `<div class="section"><div class="sec-hd"><h2>🎯 Kinodle</h2><button class="see-all" onclick="setView('gra')">Zagraj →</button></div>
      <div class="profile-quick-stats sx-pqs">
        <div class="pqs-item"><div class="pqs-val" style="color:var(--gold)">${pts}</div><div class="pqs-lbl">Punkty łącznie</div></div>
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
