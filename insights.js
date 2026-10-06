// insights.js — podsumowania miesięcy (oś czasu), „Wasz rok”, zgodność gustów
export function initInsights(ctx) {
  const { fs, db, toast, esc, getLv, pcSVG, personScore, jointPct, getRatings, getMovies } = ctx;
  const el = id => document.getElementById(id);
  const MN = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
  const ui = { tab: "timeline", year: null, month: null };
  const lbl = k => { const [y, m] = k.split("-"); return { name: MN[+m - 1], year: y }; };

  /* ───── dane ───── */
  function entries() {
    const R = getRatings() || {}, M = getMovies() || {};
    const out = [];
    for (const [id, r] of Object.entries(R)) {
      const f = M[id]; if (!f) continue;
      const date = (r.kar && r.kar.watchDate) || (r.adam && r.adam.watchDate); if (!date || date.length < 7) continue;
      const kP = personScore(r.kar), aP = personScore(r.adam), jP = jointPct(id);
      if (jP === null) continue;
      out.push({ id, f, date, key: date.slice(0, 7), kP, aP, jP, where: (r.kar && r.kar.where) || (r.adam && r.adam.where) || null });
    }
    // wcześniejsze seanse (Rewatch) liczą się w swoich miesiącach
    for (const f of Object.values(M)) for (const h of f.history || []) {
      if (!h.date || h.date.length < 7) continue;
      const v = [h.kar, h.adam].filter(x => x !== null && x !== undefined); if (!v.length) continue;
      out.push({ id: f.id, f, date: h.date, key: h.date.slice(0, 7), kP: h.kar ?? null, aP: h.adam ?? null, jP: Math.round(v.reduce((a, b) => a + b, 0) / v.length), where: h.where || null, old: true });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  function topKey(list, fn) {
    const c = {}; list.forEach(x => { const k = fn(x); if (k) c[k] = (c[k] || 0) + 1; });
    const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : null;
  }
  function stats(list) {
    const sorted = [...list].sort((a, b) => b.jP - a.jP);
    const both = list.filter(e => e.kP !== null && e.aP !== null).map(e => ({ ...e, diff: Math.abs(e.kP - e.aP) })).sort((a, b) => b.diff - a.diff);
    return {
      n: list.length, minutes: list.reduce((s, e) => s + (e.f.length || 0), 0),
      avgJ: avg(list.map(e => e.jP)), avgK: avg(list.filter(e => e.kP !== null).map(e => e.kP)), avgA: avg(list.filter(e => e.aP !== null).map(e => e.aP)),
      best: sorted[0] || null, worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
      kino: list.filter(e => e.where === "kino").length, dom: list.filter(e => e.where === "dom").length,
      genre: topKey(list, e => e.f.genre), dispute: both[0] && both[0].diff >= 15 ? both[0] : null,
      gold: list.filter(e => e.kP !== null && e.aP !== null && e.kP >= 80 && e.aP >= 80),
      sorted,
    };
  }
  const dur = m => { const h = Math.floor(m / 60); return h >= 100 ? `${Math.round(h / 24 * 10) / 10} d` : `${h} h ${m % 60} min`; };
  const months = () => { const g = {}; entries().forEach(e => (g[e.key] = g[e.key] || []).push(e)); return g; };

  /* ───── karta miesiąca ───── */
  function monthCard(key, list, big) {
    const st = stats(list), l = lbl(key), lv = st.avgJ !== null ? getLv(st.avgJ) : null;
    const posters = st.sorted.filter(e => e.f.poster).slice(0, 4);
    return `<div class="mo-card ${big ? "big" : ""}" onclick="INS.month('${key}')">
      <div class="mo-fan">${posters.map((e, i) => `<img src="${esc(e.f.poster)}" alt="" style="--i:${i}">`).join("")}</div>
      <div class="mo-top"><div class="mo-name">${l.name}</div><div class="mo-year">${l.year}</div></div>
      <div class="mo-num"><b>${st.n}</b><span>${st.n === 1 ? "film" : st.n < 5 ? "filmy" : "filmów"}</span></div>
      <div class="mo-chips">
        ${lv ? `<span class="mo-chip" style="color:${lv.color};border-color:${lv.color}">${pcSVG(lv.key, 16)} śr. ${st.avgJ}%</span>` : ""}
        ${st.minutes ? `<span class="mo-chip">⏱ ${dur(st.minutes)}</span>` : ""}
        ${st.kino ? `<span class="mo-chip">🎟️ ${st.kino}</span>` : ""}${st.dom ? `<span class="mo-chip">🏠 ${st.dom}</span>` : ""}
      </div>
      ${st.best ? `<div class="mo-best">★ ${esc(st.best.f.title)} <b>${st.best.jP}%</b></div>` : ""}
    </div>`;
  }

  /* ───── zakładki ───── */
  function render() {
    const body = el("pod-body"); if (!body) return;
    document.querySelectorAll("#pod-tabs .top-tab").forEach(t => t.classList.toggle("active", t.dataset.ptab === ui.tab));
    const ysel = el("pod-year"); if (ysel) ysel.style.display = ui.tab === "year" ? "" : "none";
    if (ui.tab === "timeline") body.innerHTML = timeline();
    else if (ui.tab === "year") body.innerHTML = year();
    else if (ui.tab === "dates") body.innerHTML = datesTab();
    else body.innerHTML = agreement();
  }

  /* ───── edycja dat seansów ───── */
  function datesTab() {
    const R = getRatings() || {}, M = getMovies() || {};
    const rows = Object.entries(R).filter(([id]) => M[id]).map(([id, r]) => ({ id, f: M[id], date: (r.kar && r.kar.watchDate) || (r.adam && r.adam.watchDate) || "" }))
      .sort((a, b) => a.f.title.localeCompare(b.f.title, "pl"));
    if (!rows.length) return `<div class="empty">Brak ocenionych filmów.</div>`;
    const missing = rows.filter(r => !r.date).length;
    return `<div class="gm-hint">Tu możecie poprawić daty obejrzenia — od tego zależą miesiące na osi czasu. Zmiana zapisuje się od razu (dla obojga).${missing ? ` <b>${missing}</b> filmów jest bez daty.` : ""}</div>
      <div class="dt-list">${rows.map(r => `<div class="dt-row ${r.date ? "" : "missing"}">
        ${r.f.poster ? `<img src="${esc(r.f.poster)}" alt="">` : "<span></span>"}
        <b>${esc(r.f.title)}</b><small>${r.f.year || ""}</small>
        <input type="date" value="${r.date}" onchange="INS.setDate('${esc(r.id)}', this.value)"></div>`).join("")}</div>`;
  }
  async function setDate(id, v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    const r = (getRatings() || {})[id]; if (!r) return;
    const upd = {}; if (r.kar) upd["kar.watchDate"] = v; if (r.adam) upd["adam.watchDate"] = v;
    try { await fs.updateDoc(fs.doc(fs.collection(db, "kRatings"), id), upd); toast("Zapisano datę: " + v); }
    catch (e) { toast("Nie udało się zapisać: " + e.message); }
  }

  function timeline() {
    const g = months(), keys = Object.keys(g).sort().reverse();
    if (!keys.length) return `<div class="empty">Podsumowania pojawią się, gdy ocenicie filmy z datą obejrzenia (daty możesz ustawić w zakładce „Daty”).</div>`;
    let lastY = null, html = `<div class="tl">`;
    for (const k of keys) {
      const y = k.slice(0, 4);
      if (y !== lastY) { html += `<div class="tl-year">${y}</div>`; lastY = y; }
      html += `<div class="tl-row"><div class="tl-dot"></div>${monthCard(k, g[k])}</div>`;
    }
    return html + `</div>`;
  }

  function year() {
    const all = entries(), years = [...new Set(all.map(e => e.key.slice(0, 4)))].sort().reverse();
    const ysel = el("pod-year");
    if (ysel) { ysel.innerHTML = years.map(y => `<option>${y}</option>`).join(""); if (!ui.year || !years.includes(ui.year)) ui.year = years[0]; ysel.value = ui.year; }
    if (!years.length) return `<div class="empty">Brak danych — oceniajcie filmy z datą obejrzenia.</div>`;
    const list = all.filter(e => e.key.startsWith(ui.year)), st = stats(list);
    const perM = Array.from({ length: 12 }, (_, i) => list.filter(e => +e.key.slice(5) === i + 1));
    const maxN = Math.max(1, ...perM.map(a => a.length));
    const bestM = perM.map((a, i) => ({ i, a, avg: avg(a.map(e => e.jP)) })).filter(x => x.a.length >= 1 && x.avg !== null).sort((a, b) => b.avg - a.avg)[0];
    const busyM = perM.map((a, i) => ({ i, n: a.length })).sort((a, b) => b.n - a.n)[0];
    const gen = {}; list.forEach(e => { if (e.f.genre) (gen[e.f.genre] = gen[e.f.genre] || []).push(e.jP); });
    const genArr = Object.entries(gen).map(([g, a]) => ({ g, n: a.length, avg: avg(a) })).sort((a, b) => b.n - a.n).slice(0, 6);
    const lv = st.avgJ !== null ? getLv(st.avgJ) : getLv(0);
    const harsher = st.avgK !== null && st.avgA !== null && st.avgK !== st.avgA ? (st.avgK < st.avgA ? "💛 Karolina" : "💙 Adam") : null;
    const mini = (e, i) => `<div class="yr-film" onclick="openDetail('${esc(e.id)}')"><span>${i + 1}</span>${e.f.poster ? `<img src="${esc(e.f.poster)}" alt="">` : ""}<div><b>${esc(e.f.title)}</b><small>${e.jP}%</small></div></div>`;
    return `<div class="yr">
      <div class="yr-hero">
        <div class="yr-title">WASZ<br>ROK<br><span>${ui.year}</span></div>
        <div class="yr-big">
          <div><b>${st.n}</b><span>filmów</span></div>
          <div><b>${Math.round(st.minutes / 60)}</b><span>godzin w kinie i na kanapie</span></div>
          <div><b style="color:${lv.color}">${st.avgJ ?? "—"}%</b><span>średnia ocena</span></div>
        </div>
      </div>
      <div class="yr-bars">${perM.map((a, i) => `<div class="yr-col" title="${MN[i]}: ${a.length}"><div class="yr-bar" style="height:${Math.round(a.length / maxN * 100)}%;background:${a.length ? getLv(avg(a.map(e => e.jP))).color : "var(--brd)"}"></div><small>${MN[i].slice(0, 3)}</small></div>`).join("")}</div>
      <div class="yr-facts">
        ${bestM ? `<div class="yr-fact"><small>Najlepszy miesiąc</small><b>${MN[bestM.i]}</b><span>śr. ${bestM.avg}%</span></div>` : ""}
        ${busyM && busyM.n ? `<div class="yr-fact"><small>Najwięcej seansów</small><b>${MN[busyM.i]}</b><span>${busyM.n} filmów</span></div>` : ""}
        <div class="yr-fact"><small>Kino vs dom</small><b>🎟️ ${st.kino} / 🏠 ${st.dom}</b></div>
        ${st.genre ? `<div class="yr-fact"><small>Gatunek roku</small><b>${esc(st.genre)}</b></div>` : ""}
        ${harsher ? `<div class="yr-fact"><small>Bardziej surowa ocena</small><b>${harsher}</b><span>💛 ${st.avgK}% · 💙 ${st.avgA}%</span></div>` : ""}
        ${st.gold.length ? `<div class="yr-fact"><small>Złote strzały (oboje ≥80%)</small><b>${st.gold.length}</b></div>` : ""}
        ${st.dispute ? `<div class="yr-fact"><small>Największy spór</small><b>${esc(st.dispute.f.title)}</b><span>💛 ${st.dispute.kP}% vs 💙 ${st.dispute.aP}%</span></div>` : ""}
      </div>
      <div class="profile-cols">
        <div><div class="sec-hd"><h2 style="color:var(--ok)">⭐ Top 5 roku</h2></div><div class="yr-list">${st.sorted.slice(0, 5).map(mini).join("")}</div></div>
        <div><div class="sec-hd"><h2>🎭 Gatunki</h2></div>${genArr.map(x => `<div class="gbar-row"><div class="gbar-label">${esc(x.g)}</div><div class="gbar-track"><div class="gbar-fill" style="width:${Math.round(x.n / genArr[0].n * 100)}%;background:${getLv(x.avg).color}"></div></div><div class="gbar-pct" style="color:${getLv(x.avg).color}">${x.avg}%</div><div class="gbar-cnt">${x.n}×</div></div>`).join("")}</div>
      </div>
      ${st.worst && st.n > 5 ? `<div class="sec-hd" style="margin-top:20px"><h2 style="color:var(--red)">🍿 Najsłabsze</h2></div><div class="yr-list">${st.sorted.slice(-3).reverse().map(mini).join("")}</div>` : ""}
    </div>`;
  }

  const TIERS = [[90, "Dusza w duszę"], [80, "Bratnie dusze"], [70, "Zgrany duet"], [60, "Dwa światy, jedna kanapa"], [0, "Przeciwieństwa się przyciągają"]];
  function agreement() {
    const R = getRatings() || {}, M = getMovies() || {};
    const rows = [];
    for (const [id, r] of Object.entries(R)) {
      const k = personScore(r.kar), a = personScore(r.adam); if (k === null || a === null || !M[id]) continue;
      rows.push({ id, f: M[id], k, a, diff: Math.abs(k - a) });
    }
    if (rows.length < 2) return `<div class="empty">Zgodność gustów policzymy, gdy oboje ocenicie co najmniej 2 wspólne filmy.</div>`;
    const sc = Math.max(0, Math.round(100 - rows.reduce((s, r) => s + r.diff, 0) / rows.length));
    const tier = TIERS.find(t => sc >= t[0])[1];
    const byDiff = [...rows].sort((a, b) => b.diff - a.diff);
    const twins = [...rows].sort((a, b) => a.diff - b.diff).filter(r => r.diff <= 4);
    const gold = rows.filter(r => r.k >= 80 && r.a >= 80).sort((a, b) => b.k + b.a - a.k - a.a);
    const gen = {}; rows.forEach(r => { if (r.f.genre) (gen[r.f.genre] = gen[r.f.genre] || []).push(r.diff); });
    const genArr = Object.entries(gen).filter(([, a]) => a.length >= 2).map(([g, a]) => ({ g, n: a.length, sc: Math.max(0, Math.round(100 - avg(a))) })).sort((a, b) => b.sc - a.sc);
    const kAvg = avg(rows.map(r => r.k)), aAvg = avg(rows.map(r => r.a));
    const line = (r, extra) => `<div class="ag-row" onclick="openDetail('${esc(r.id)}')">${r.f.poster ? `<img src="${esc(r.f.poster)}" alt="">` : "<span></span>"}<b>${esc(r.f.title)}</b><span class="ag-k">💛 ${r.k}%</span><span class="ag-a">💙 ${r.a}%</span><em>${extra}</em></div>`;
    return `<div class="ag">
      <div class="ag-hero"><div class="ag-ring" style="--p:${sc}"><b>${sc}%</b></div>
        <div><div class="ag-tier">${tier}</div><div class="ag-sub">zgodność gustów z ${rows.length} wspólnych filmów</div>
        <div class="ag-sub">Średnio: 💛 ${kAvg}% · 💙 ${aAvg}% ${kAvg !== aAvg ? `— ${kAvg < aAvg ? "Karolina" : "Adam"} jest bardziej wymagający/a` : ""}</div></div></div>
      <div class="profile-cols">
        <div><div class="sec-hd"><h2 style="color:var(--red)">⚡ Spory</h2></div>${byDiff.slice(0, 5).map(r => line(r, "Δ " + r.diff + "%")).join("")}</div>
        <div><div class="sec-hd"><h2 style="color:var(--gold)">✨ Złote strzały</h2></div>${gold.length ? gold.slice(0, 5).map(r => line(r, "oboje ♥")).join("") : `<div class="empty">Jeszcze brak filmu z 80%+ od obojga.</div>`}
        ${twins.length ? `<div class="sec-hd" style="margin-top:16px"><h2>🤝 Identyczne oceny</h2></div>${twins.slice(0, 3).map(r => line(r, "Δ " + r.diff + "%")).join("")}` : ""}</div>
      </div>
      ${genArr.length ? `<div class="sec-hd" style="margin-top:20px"><h2>Zgodność wg gatunku</h2></div>${genArr.map(x => `<div class="gbar-row"><div class="gbar-label">${esc(x.g)}</div><div class="gbar-track"><div class="gbar-fill" style="width:${x.sc}%;background:${getLv(x.sc).color}"></div></div><div class="gbar-pct" style="color:${getLv(x.sc).color}">${x.sc}%</div><div class="gbar-cnt">${x.n} filmów</div></div>`).join("")}` : ""}
    </div>`;
  }

  /* ───── dialog miesiąca (z nawigacją po osi czasu) ───── */
  function openMonth(key) {
    const g = months(), keys = Object.keys(g).sort();
    if (!g[key]) return;
    ui.month = key;
    const i = keys.indexOf(key), prev = keys[i - 1], next = keys[i + 1];
    const st = stats(g[key]), l = lbl(key), lv = st.avgJ !== null ? getLv(st.avgJ) : null;
    el("monthContent").innerHTML = `
      <div class="mo-nav">
        <button class="btn" ${prev ? `onclick="INS.month('${prev}')"` : "disabled"}>← ${prev ? MN[+prev.slice(5) - 1] : ""}</button>
        <div class="mo-nav-t"><b>${l.name}</b> ${l.year}</div>
        <button class="btn" ${next ? `onclick="INS.month('${next}')"` : "disabled"}>${next ? MN[+next.slice(5) - 1] : ""} →</button>
      </div>
      <div class="mo-stats">
        <div><b>${st.n}</b><small>filmów</small></div>
        <div><b>${dur(st.minutes)}</b><small>czasu</small></div>
        <div><b style="color:${lv ? lv.color : "inherit"}">${st.avgJ ?? "—"}%</b><small>średnia</small></div>
        <div><b>🎟️ ${st.kino} · 🏠 ${st.dom}</b><small>kino · dom</small></div>
        ${st.genre ? `<div><b>${esc(st.genre)}</b><small>gatunek miesiąca</small></div>` : ""}
        ${st.dispute ? `<div><b>${esc(st.dispute.f.title)}</b><small>spór: 💛 ${st.dispute.kP}% vs 💙 ${st.dispute.aP}%</small></div>` : ""}
      </div>
      <div class="yr-list" style="margin:12px 0">${[...g[key]].sort((a, b) => a.date.localeCompare(b.date)).map(e => {
        const x = getLv(e.jP);
        return `<div class="yr-film" onclick="document.getElementById('monthDialog').close();openDetail('${esc(e.id)}')"><span>${e.date.slice(8)}</span>${e.f.poster ? `<img src="${esc(e.f.poster)}" alt="">` : ""}<div><b>${esc(e.f.title)}</b><small>${e.where === "kino" ? "🎟️" : e.where === "dom" ? "🏠" : ""} ${e.kP !== null ? "💛" + e.kP + "% " : ""}${e.aP !== null ? "💙" + e.aP + "%" : ""}</small></div><em style="color:${x.color}">${e.jP}%</em></div>`;
      }).join("")}</div>
      <div class="dialog-actions"><button class="btn btn-primary" onclick="document.getElementById('monthDialog').close()">Zamknij</button></div>`;
    const d = el("monthDialog"); if (!d.open) d.showModal();
  }

  /* ───── karta miesiąca na stronie głównej ───── */
  function renderHome() {
    const box = el("home-month"), sec = el("home-month-sec"); if (!box) return;
    const g = months(), keys = Object.keys(g).sort();
    if (!keys.length) { if (sec) sec.style.display = "none"; return; }
    if (sec) sec.style.display = "";
    const k = keys[keys.length - 1];
    box.innerHTML = monthCard(k, g[k], true);
  }

  window.INS = { setDate, month: openMonth, tab(t) { ui.tab = t; render(); } };
  document.getElementById("pod-tabs")?.addEventListener("click", e => { const b = e.target.closest("[data-ptab]"); if (b) { ui.tab = b.dataset.ptab; render(); } });
  el("pod-year")?.addEventListener("change", e => { ui.year = e.target.value; render(); });

  return { render, renderHome };
}
