/* 競馬予想ボード — 表示だけを担当。計算は Python 側で済ませて JSON にしてある。 */

let IDX = null;

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const pct = (v) => (v == null ? "-" : (v * 100).toFixed(0) + "%");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(path + " が見つかりません");
  return r.json();
}

/* ---------------------------------------------------------------- タブ */
document.querySelectorAll(".tab").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".view").forEach((x) => x.classList.add("hidden"));
    b.classList.add("active");
    $("#view-" + b.dataset.view).classList.remove("hidden");
  };
});

/* ---------------------------------------------------------------- 共通部品 */
// 「n件・複勝率・平均比」を並べた表。切り口ごとの得意不得意が一目で分かる。
function tallyTable(items, label, prior) {
  if (!items || !items.length) return el("p", "cond", "データなし");
  const max = Math.max(...items.map((x) => x.top3_rate), 0.01);
  const wrap = el("div", "tablewrap");
  const t = el("table");
  t.innerHTML = `<thead><tr>
    <th>${esc(label)}</th><th class="num">出走</th><th class="num">勝</th>
    <th class="num">複勝率</th><th class="barcell"></th><th class="num">平均比</th>
  </tr></thead>`;
  const tb = el("tbody");
  items.filter((x) => x.n > 0).forEach((x) => {
    const edge = prior ? (x.top3_score - prior) / prior : 0;
    const tr = el("tr");
    tr.innerHTML = `<td>${esc(x.key)}</td>
      <td class="num">${x.n}</td><td class="num">${x.win}</td>
      <td class="num">${pct(x.top3_rate)}</td>
      <td class="barcell"><span class="bar" style="width:${(x.top3_rate / max * 100).toFixed(0)}%"></span></td>
      <td class="num" style="color:${edge > 0.05 ? "var(--good)" : edge < -0.05 ? "var(--bad)" : "var(--muted)"}">
        ${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(0)}%</td>`;
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  wrap.appendChild(t);
  return wrap;
}

function card(title, node) {
  const c = el("div", "card");
  if (title) c.appendChild(el("h2", null, esc(title)));
  if (node) c.appendChild(node);
  return c;
}

/* ---------------------------------------------------------------- レース予想 */
function fillRaceSelect() {
  const grade = $("#raceGrade").value;
  const sel = $("#raceSelect");
  sel.innerHTML = "";
  IDX.races.filter((r) => !grade || r.grade === grade).forEach((r) => {
    const o = el("option");
    o.value = r.race_id;
    o.textContent = `${r.date} ${r.course}${r.race_no}R ${r.race_name || ""} ` +
      `(${r.surface}${r.distance}m${r.grade ? " " + r.grade : ""})`;
    sel.appendChild(o);
  });
  if (sel.value) showRace(sel.value);
}

async function showRace(raceId) {
  const body = $("#raceBody");
  body.className = "";
  body.innerHTML = "<p class='cond'>計算結果を読込中…</p>";
  let d;
  try { d = await getJSON(`data/races/${raceId}.json`); }
  catch (e) { body.innerHTML = `<p class='cond'>${esc(e.message)}<br>src/export.py を実行してください。</p>`; return; }

  const c = d.condition, cp = d.course_profile;
  body.innerHTML = "";

  const head = el("div", "card");
  head.innerHTML = `<h2>${esc(c.race_name || "")} <span class="cond">${esc(c.grade || "")}</span></h2>
    <p class="cond">${esc(c.date)} ${esc(c.course)}${c.race_no}R / ${esc(c.surface)}${c.distance}m /
      ${esc(c.turn || "")}回り / 馬場${esc(c.going || "")} / ${c.head_count}頭</p>
    <p class="verdict">${esc(d.verdict.comment)}</p>
    ${d.pace ? `<p class="verdict pace"><b>展開予測: ${esc(d.pace.label)}</b><br>
      ${esc(d.pace.comment)}</p>` : ""}`;
  body.appendChild(head);

  // 予想表。オッズが取れているときだけ期待値の列を出す
  const evRows = (d.bets && d.bets.rows) || [];
  const evByNo = {};
  evRows.forEach((r) => { evByNo[r.horse_no] = r; });
  const hasOdds = d.bets && d.bets.has_odds;

  const t = el("table");
  t.innerHTML = `<thead><tr><th></th><th class="num">順</th><th class="num">馬番</th><th>馬名</th>
    <th>脚質</th><th>騎手</th><th class="num">スコア</th>
    ${hasOdds ? '<th class="num">オッズ</th><th class="num">予想勝率</th><th class="num">期待値</th>' : ""}
    <th class="num">実着順</th></tr></thead>`;
  const tb = el("tbody");
  d.predictions.forEach((p, i) => {
    const tr = el("tr");
    const hitCls = p.actual === 1 ? "hit" : p.actual && p.actual <= 3 ? "" : "miss";
    const ev = evByNo[p.horse_no] || {};
    tr.innerHTML = `<td class="mark">${esc(p.mark || "")}</td>
      <td class="num">${p.rank}</td><td class="num">${p.horse_no ?? "-"}</td>
      <td><b>${esc(p.horse_name)}</b></td><td>${esc(p.main_style || "-")}</td>
      <td>${esc(p.jockey || "-")}</td><td class="num">${p.score}</td>
      ${hasOdds ? `<td class="num">${p.odds ?? "-"}</td>
        <td class="num">${ev.win_prob != null ? pct(ev.win_prob) : "-"}</td>
        <td class="num" style="color:${(ev.ev ?? 0) >= 1 ? "var(--good)" : "var(--muted)"}">
          ${ev.ev != null ? ev.ev.toFixed(2) : "-"}</td>` : ""}
      <td class="num ${hitCls}">${p.actual ?? "-"}</td>`;
    tr.onclick = () => showReasons(p, i);
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  const wrap = card("予想", el("div", "tablewrap"));
  wrap.querySelector(".tablewrap").appendChild(t);
  wrap.appendChild(el("p", "cond", "行をクリックすると根拠を表示"));
  const reasonBox = el("div");
  reasonBox.id = "reasonBox";
  wrap.appendChild(reasonBox);
  body.appendChild(wrap);

  function showReasons(p) {
    const ul = el("ul", "reasons");
    p.reasons.forEach((r) => {
      if (!r.contrib) return;
      const li = el("li");
      li.innerHTML = `<span class="v ${r.contrib > 0 ? "plus" : "minus"}">
        ${r.contrib > 0 ? "+" : ""}${r.contrib.toFixed(2)}</span>
        <span>${esc(r.label)}</span>
        <span class="cond">n=${r.n}${r.top3_rate != null ? " / 複勝率" + pct(r.top3_rate) : ""}</span>`;
      ul.appendChild(li);
    });
    reasonBox.innerHTML = `<h3>${esc(p.horse_name)} の内訳</h3>`;
    reasonBox.appendChild(ul.children.length ? ul : el("p", "cond", "有効なデータがありません"));
  }
  showReasons(d.predictions[0]);

  // 買い目
  if (d.bets && d.bets.plans.length) {
    const bc = card("買い目の候補", null);
    if (d.bets.note) bc.appendChild(el("p", "cond", esc(d.bets.note)));
    const ul = el("ul", "plans");
    d.bets.plans.forEach((pl) => {
      const li = el("li");
      li.innerHTML = `<span class="btype">${esc(pl.type)}</span>
        <span class="blabel">${esc(pl.label)}</span>
        <span class="cond">${esc(pl.reason)}</span>`;
      ul.appendChild(li);
    });
    bc.appendChild(ul);
    body.appendChild(bc);
  }

  // レース視点
  const g = el("div", "grid");
  g.appendChild(card("枠順の傾向", tallyTable(cp.by_frame, "枠", IDX.priors.top3)));
  g.appendChild(card("脚質の傾向", tallyTable(cp.by_style, "脚質", IDX.priors.top3)));
  g.appendChild(card("人気の傾向", tallyTable(cp.by_popularity, "人気", IDX.priors.top3)));
  if (d.sex_age) {
    g.appendChild(card("性別（この条件）",
      tallyTable(d.sex_age.by_sex, "性別", IDX.priors.top3)));
    g.appendChild(card("年齢（この条件）",
      tallyTable(d.sex_age.by_age, "年齢", IDX.priors.top3)));
  }
  if (d.race_name_profile && d.race_name_profile.prev_grade.length) {
    const rn = d.race_name_profile;
    const t2 = el("table");
    t2.innerHTML = `<thead><tr><th>前走の格</th><th class="num">頭数</th><th class="num">3着内率</th></tr></thead>`;
    const tb2 = el("tbody");
    rn.prev_grade.forEach((x) => {
      tb2.innerHTML += `<tr><td>${esc(x.key)}</td><td class="num">${x.n}</td><td class="num">${pct(x.top3_rate)}</td></tr>`;
    });
    t2.appendChild(tb2);
    const cc = card("このレースで好走する馬の「前走の格」", el("div", "tablewrap"));
    cc.querySelector(".tablewrap").appendChild(t2);
    g.appendChild(cc);
  }
  body.appendChild(g);
}

/* ---------------------------------------------------------------- 馬 */
function renderHorse(p) {
  const body = $("#horseBody");
  body.className = "";
  body.innerHTML = "";
  const o = p.overall;
  const head = el("div", "card");
  const ped = p.pedigree;
  head.innerHTML = `<h2>${esc(p.name)}</h2>
    <p class="cond">${esc(p.sex || "")}${p.age || ""} / ${esc(p.trainer || "")} /
      ${o.n}戦${o.win}勝　連対率${pct(o.top2 / (o.n || 1))}　複勝率${pct(o.top3_rate)}
      主戦脚質 ${esc(p.main_style || "-")}</p>
    ${ped && ped.sire ? `<p class="cond">父 <b>${esc(ped.sire)}</b>
      ／ 母 ${esc(ped.dam || "-")}
      ／ 母父 <b>${esc(ped.broodmare_sire || "-")}</b></p>` : ""}`;
  body.appendChild(head);

  const prior = IDX.priors.top3;
  const g = el("div", "grid");
  [["距離帯", "by_distance_band"], ["距離", "by_distance"], ["芝・ダート", "by_surface"],
   ["馬場状態", "by_going"], ["回り", "by_turn"], ["競馬場", "by_course"],
   ["枠番", "by_frame"], ["騎手", "by_jockey"], ["格", "by_grade"],
   ["ペース", "by_pace"], ["前走からの間隔", "by_rest"]]
    .forEach(([label, key]) => g.appendChild(card(label, tallyTable(p[key], label, prior))));
  body.appendChild(g);

  // 全成績
  const t = el("table");
  t.innerHTML = `<thead><tr><th>日付</th><th>レース</th><th>格</th><th>条件</th>
    <th class="num">枠</th><th>騎手</th><th>脚質</th><th>ペース</th>
    <th class="num">間隔</th><th class="num">馬体重</th>
    <th class="num">人気</th><th class="num">着順</th></tr></thead>`;
  const tb = el("tbody");
  p.history.forEach((h) => {
    const bw = h.body_weight
      ? `${h.body_weight}${h.body_diff != null ? `(${h.body_diff >= 0 ? "+" : ""}${h.body_diff})` : ""}`
      : "-";
    tb.innerHTML += `<tr><td>${esc(h.date)}</td><td>${esc(h.race_name || "")}</td>
      <td>${esc(h.grade || "")}</td>
      <td class="cond">${esc(h.course)}${esc(h.surface)}${h.distance}m ${esc(h.turn || "")} ${esc(h.going || "")}</td>
      <td class="num">${h.frame ?? "-"}</td><td>${esc(h.jockey || "")}</td>
      <td>${esc(h.style || "-")}</td><td class="cond">${esc(h.pace || "-")}</td>
      <td class="num">${h.rest_days != null ? h.rest_days + "日" : "-"}</td>
      <td class="num cond">${esc(bw)}</td>
      <td class="num">${h.popularity ?? "-"}</td>
      <td class="num ${h.finish === 1 ? "hit" : ""}">${h.finish ?? "-"}</td></tr>`;
  });
  t.appendChild(tb);
  const cc = card("全成績", el("div", "tablewrap"));
  cc.querySelector(".tablewrap").appendChild(t);
  body.appendChild(cc);
}

function searchHorses() {
  const q = $("#horseSearch").value.trim();
  const ul = $("#horseHits");
  ul.innerHTML = "";
  if (!q) return;
  IDX.horses.filter((h) => h.name && h.name.includes(q)).slice(0, 30).forEach((h) => {
    const li = el("li", null, `${esc(h.name)} <span class="cond">${h.n}戦${h.win}勝</span>`);
    li.onclick = async () => {
      try { renderHorse(await getJSON(`data/horses/${h.horse_id}.json`)); }
      catch (e) { $("#horseBody").innerHTML = `<p class='cond'>${esc(e.message)}</p>`; }
    };
    ul.appendChild(li);
  });
}

/* ---------------------------------------------------------------- 産駒（血統） */
let SIRES = null;

function safeName(s) {
  // export.py の _safe_name と同じ変換
  return s.replace(/[^\w぀-ヿ一-鿿-]/g, "_");
}

let SIRE_PRIOR = null;

async function fillSireSelect() {
  try {
    const d = await getJSON("data/sires.json");
    SIRES = d.sires;
    SIRE_PRIOR = d.prior;
  } catch (e) { $("#sireBody").innerHTML = `<p class='cond'>${esc(e.message)}</p>`; return; }
  const sel = $("#sireSelect");
  sel.innerHTML = "";
  SIRES.forEach((s) => {
    const o = el("option");
    o.value = s.name;
    o.textContent = `${s.name}（産駒${s.horses}頭 / ${s.runs}戦 複勝率${pct(s.top3_rate)}）`;
    sel.appendChild(o);
  });
  if (sel.value) showSire(sel.value);
}

async function showSire(name) {
  const body = $("#sireBody");
  body.className = "";
  body.innerHTML = "<p class='cond'>読込中…</p>";
  let p;
  try { p = await getJSON(`data/sires/${safeName(name)}.json`); }
  catch (e) { body.innerHTML = `<p class='cond'>${esc(e.message)}</p>`; return; }

  const o = p.overall;
  // 比較基準は「血統を持つ馬たち（＝重賞に出た強い馬）」の平均。
  // 全体平均と比べると、どの産駒も平均超えに見えてしまう
  const prior = p.cohort_prior || SIRE_PRIOR || IDX.priors.top3;
  const ratio = o.top3_rate / prior;
  body.innerHTML = "";
  const head = el("div", "card");
  head.innerHTML = `<h2>${esc(p.name)} 産駒</h2>
    <p class="cond">${o.n}戦${o.win}勝　複勝率 ${pct(o.top3_rate)}
      （重賞級の馬の平均 ${pct(prior)}）</p>
    <p class="verdict">${ratio > 1.15
      ? "重賞級の中でも走る系統。"
      : ratio < 0.85
      ? "重賞級の中では見劣りする。条件が合うかで判断したい。"
      : "重賞級の中では平均並み。得意条件で取捨する。"}</p>
    <p class="cond">※ 血統を取っているのは重賞に出た馬だけなので、
      全出走馬の平均（${pct(IDX.priors.top3)}）ではなくこの母集団の平均と比べている。</p>`;
  body.appendChild(head);
  const g = el("div", "grid");
  [["芝・ダート", "by_surface"], ["距離帯", "by_distance_band"],
   ["馬場状態", "by_going"], ["回り", "by_turn"], ["競馬場", "by_course"],
   ["格", "by_grade"], ["脚質", "by_style"], ["ペース", "by_pace"]]
    .forEach(([label, key]) => g.appendChild(card(label, tallyTable(p[key], label, prior))));
  body.appendChild(g);
}

/* ---------------------------------------------------------------- コース傾向 */
function fillCourseSelect() {
  const seen = new Map();
  IDX.races.forEach((r) => {
    if (!r.course || !r.surface) return;
    const key = `${r.course}|${r.surface}|${r.distance}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  const sel = $("#courseSelect");
  sel.innerHTML = "";
  [...seen.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    const [c, s, d] = k.split("|");
    const o = el("option");
    o.value = k;
    o.textContent = `${c} ${s}${d}m （${n}レース）`;
    sel.appendChild(o);
  });
}

async function showCourse(key) {
  const [course, surface, distance] = key.split("|");
  const body = $("#courseBody");
  // 該当条件のレースJSONを1つ拾って、その中のコース傾向を使う
  const hit = IDX.races.find((r) => r.course === course && r.surface === surface &&
    String(r.distance) === distance);
  if (!hit) return;
  body.className = "";
  body.innerHTML = "<p class='cond'>読込中…</p>";
  let d;
  try { d = await getJSON(`data/races/${hit.race_id}.json`); }
  catch (e) { body.innerHTML = `<p class='cond'>${esc(e.message)}</p>`; return; }
  const cp = d.course_profile, ch = cp.chaos;
  body.innerHTML = "";
  const head = el("div", "card");
  head.innerHTML = `<h2>${esc(course)} ${esc(surface)}${distance}m</h2>
    <p class="cond">±${cp.tolerance}m を含む ${cp.races} レース / 延べ ${cp.runners} 頭から集計</p>
    <p class="verdict">荒れ度 ${(ch.score * 100).toFixed(0)}/100 ―
      1番人気の勝率 ${pct(ch.fav_win_rate)}、6番人気以下の勝率 ${pct(ch.longshot_win_rate)}
      ${ch.trifecta_median ? `、3連単の中央値 ${ch.trifecta_median.toLocaleString()}円` : ""}</p>`;
  body.appendChild(head);
  const g = el("div", "grid");
  g.appendChild(card("枠順", tallyTable(cp.by_frame, "枠", IDX.priors.top3)));
  g.appendChild(card("脚質", tallyTable(cp.by_style, "脚質", IDX.priors.top3)));
  g.appendChild(card("人気", tallyTable(cp.by_popularity, "人気", IDX.priors.top3)));
  g.appendChild(card("格", tallyTable(cp.by_grade, "格", IDX.priors.top3)));
  body.appendChild(g);
}

/* ---------------------------------------------------------------- 起動 */
(async function init() {
  try {
    IDX = await getJSON("data/index.json");
  } catch (e) {
    $("#dbstat").textContent = "data/index.json がありません。python3 src/export.py を実行してください。";
    return;
  }
  const s = IDX.stats;
  $("#dbstat").textContent =
    `${s.races}レース / 延べ${s.results}頭 / ${s.horses}頭を収録　全体の複勝率 ${pct(IDX.priors.top3)}`;

  const grades = [...new Set(IDX.races.map((r) => r.grade).filter(Boolean))];
  grades.forEach((g) => {
    const o = el("option"); o.value = g; o.textContent = g;
    $("#raceGrade").appendChild(o);
  });
  fillRaceSelect();
  fillCourseSelect();
  fillSireSelect();

  $("#raceGrade").onchange = fillRaceSelect;
  $("#raceSelect").onchange = (e) => showRace(e.target.value);
  $("#horseSearch").oninput = searchHorses;
  $("#sireSelect").onchange = (e) => showSire(e.target.value);
  $("#courseSelect").onchange = (e) => showCourse(e.target.value);
  if ($("#courseSelect").value) showCourse($("#courseSelect").value);
})();
