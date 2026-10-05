// ads.js — „reklamy” jak na prawdziwej stronie: boczne kolumny + okazjonalny popup z filmem (TMDB)

export function initAds(ctx) {
  const { esc, TMDB_KEY, getRatings, fetchFilm, rateMovie, addToList, toast } = ctx;
  const IMG = "https://image.tmdb.org/t/p/";
  const el = id => document.getElementById(id);
  const hasKey = () => TMDB_KEY && !String(TMDB_KEY).startsWith("WSTAW");
  const LS_KEY = "kineapolis_noPopup";
  const SS_KEY = "kineapolis_popupCount";

  let POOL = [];
  const shown = new Set();
  const MAX_POPUPS = 4;

  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (_e) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (_e) {} },
  };

  async function load() {
    if (!hasKey()) return;
    const q = p => fetch(`https://api.themoviedb.org/3${p}${p.includes("?") ? "&" : "?"}api_key=${TMDB_KEY}&language=pl-PL`).then(r => r.json());
    const sets = await Promise.allSettled([
      q("/trending/movie/day"), q("/movie/now_playing?region=PL"), q("/movie/upcoming?region=PL"),
    ]);
    const tags = ["🔥 Na topie", "🎬 W kinach", "🆕 Wkrótce"];
    const seen = new Set(), out = [];
    sets.forEach((r, k) => {
      if (r.status !== "fulfilled") return;
      for (const m of (r.value.results || []).slice(0, 14)) {
        if (!m.poster_path || seen.has(m.id)) continue;
        seen.add(m.id);
        out.push({
          id: m.id, title: m.title, poster: IMG + "w342" + m.poster_path,
          backdrop: m.backdrop_path ? IMG + "w780" + m.backdrop_path : null,
          year: (m.release_date || "").slice(0, 4), date: m.release_date || "",
          vote: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
          overview: m.overview || "", tag: tags[k],
        });
      }
    });
    POOL = shuffle(out);
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // następna reklama, której nie pokazywaliśmy od dawna; pomija filmy już ocenione
  function next() {
    const R = getRatings() || {};
    let cand = POOL.filter(m => !R["t" + m.id] && !shown.has(m.id));
    if (!cand.length) { shown.clear(); cand = POOL.filter(m => !R["t" + m.id]); }
    if (!cand.length) return null;
    const m = cand[Math.floor(Math.random() * cand.length)];
    shown.add(m.id);
    return m;
  }

  /* ───── boczne kolumny ───── */
  function adHTML(m, slot) {
    return `<div class="ad-card" onclick="ADS.open(${m.id})" data-slot="${slot}">
      <div class="ad-label">REKLAMA · ${esc(m.tag)}</div>
      <div class="ad-poster"><img src="${esc(m.poster)}" alt="" loading="lazy"></div>
      <div class="ad-body">
        <div class="ad-title">${esc(m.title)}</div>
        <div class="ad-meta">${m.year ? esc(m.year) : ""}${m.vote ? ` · ★ ${m.vote}` : ""}</div>
        <div class="ad-cta">Zobacz →</div>
      </div></div>`;
  }
  function fillRail(side) {
    const rail = el("ad-rail-" + side); if (!rail) return;
    const cards = [next(), next()].filter(Boolean);
    rail.innerHTML = cards.map((m, i) => adHTML(m, side + i)).join("");
  }
  function rotate() {
    ["left", "right"].forEach((side, k) => setTimeout(() => {
      const rail = el("ad-rail-" + side); if (!rail || !rail.children.length) return;
      const idx = Math.floor(Math.random() * rail.children.length), m = next(); if (!m) return;
      const old = rail.children[idx];
      old.classList.add("fade");
      setTimeout(() => { const t = document.createElement("div"); t.innerHTML = adHTML(m, side + idx); old.replaceWith(t.firstElementChild); }, 350);
    }, k * 3500));
  }
  function positionRails() {
    const top = document.querySelector(".topbar");
    let y = top ? top.getBoundingClientRect().bottom : 0;
    document.querySelectorAll(".view.active .hero, .view.active .phead, .view.active .top-tab-bar").forEach(b => {
      y = Math.max(y, b.getBoundingClientRect().bottom);
    });
    y = Math.max(y, 0) + 14;
    ["left", "right"].forEach(s => { const r = el("ad-rail-" + s); if (r) r.style.top = y + "px"; });
  }

  /* ───── szczegóły reklamy ───── */
  function find(id) { return POOL.find(m => m.id === id); }
  function open(id) {
    const m = find(id); if (!m) return;
    const dlg = el("adDialog");
    el("adContent").innerHTML = `
      <div class="ad-det">
        <div class="ad-det-poster"><img src="${esc(m.poster)}" alt=""></div>
        <div class="ad-det-info">
          <div class="ad-label">REKLAMA · ${esc(m.tag)}</div>
          <div class="ad-det-title">${esc(m.title)}</div>
          <div class="ad-meta">${[m.year, m.vote ? "★ " + m.vote + " (TMDB)" : "", m.date && m.tag.includes("Wkrótce") ? "premiera " + m.date : ""].filter(Boolean).map(esc).join(" · ")}</div>
          <p class="ad-det-desc">${esc(m.overview || "Brak opisu.")}</p>
          <div class="ad-det-btns">
            <button class="btn btn-primary" onclick="ADS.rate(${m.id})">Oceń</button>
            <button class="btn" onclick="ADS.list(${m.id})">+ Do listy</button>
            <a class="btn" href="https://www.themoviedb.org/movie/${m.id}" target="_blank" rel="noopener">TMDB ↗</a>
            <button class="btn" onclick="document.getElementById('adDialog').close()">Zamknij</button>
          </div>
        </div>
      </div>`;
    if (!dlg.open) dlg.showModal();
  }
  async function film(id) { const f = await fetchFilm(id); if (!f) toast && toast("Nie udało się pobrać filmu"); return f; }

  /* ───── popup ───── */
  let popTimer = null, hideTimer = null;
  function popupCount() { return parseInt(store.get(SS_KEY, true) || "0", 10); }
  function schedule(ms) { clearTimeout(popTimer); popTimer = setTimeout(tryPopup, ms); }
  function tryPopup() {
    if (store.get(LS_KEY) === "1" || popupCount() >= MAX_POPUPS || !POOL.length) return;
    if (document.querySelector("dialog[open]") || document.hidden) return schedule(20000); // nie przeszkadzaj
    const m = next(); if (!m) return;
    const box = el("ad-popup"); if (!box) return;
    box.innerHTML = `<button class="ad-popup-x" onclick="ADS.closePopup()" aria-label="Zamknij">✕</button>
      <div class="ad-popup-in" onclick="ADS.open(${m.id});ADS.closePopup()">
        <img src="${esc(m.backdrop || m.poster)}" alt="">
        <div class="ad-popup-body">
          <div class="ad-label">${esc(m.tag)}</div>
          <div class="ad-title">${esc(m.title)}</div>
          <div class="ad-meta">${m.year ? esc(m.year) : ""}${m.vote ? ` · ★ ${m.vote}` : ""}</div>
          <div class="ad-cta">Sprawdź →</div>
        </div></div>
      <button class="ad-popup-no" onclick="ADS.never()">Nie pokazuj więcej</button>`;
    box.classList.add("show");
    store.set(SS_KEY, String(popupCount() + 1), true);
    clearTimeout(hideTimer); hideTimer = setTimeout(closePopup, 16000);
    schedule(150000 + Math.random() * 150000); // 2,5–5 min
  }
  function closePopup() { el("ad-popup")?.classList.remove("show"); }

  window.ADS = {
    open, closePopup,
    never() { store.set(LS_KEY, "1"); closePopup(); toast && toast("Okej, bez popupów 🙂"); },
    async rate(id) { const f = await film(id); if (f) { el("adDialog").close(); rateMovie(f); } },
    async list(id) { const f = await film(id); if (f) { await addToList(f); } },
  };

  async function start() {
    await load();
    if (!POOL.length) return;
    fillRail("left"); fillRail("right");
    positionRails();
    window.addEventListener("scroll", positionRails, { passive: true });
    window.addEventListener("resize", positionRails);
    window.addEventListener("hashchange", () => setTimeout(positionRails, 60));
    setInterval(() => { if (!document.hidden) rotate(); }, 15000);
    schedule(25000);
  }
  return { start, positionRails };
}
