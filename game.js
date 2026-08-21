/* ============================================================
   ケミカラ！ 〜無機化学 完全マスター〜  ゲーム本体 v2
   色オーブ撃ち + 知識4択クイズ + ドーパミン全開演出
   ============================================================ */
(() => {
"use strict";

// ---------- ユーティリティ ----------
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- サウンド (WebAudio シンセ) ----------
let audioCtx = null;
function ac() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function tone(freq, dur, type = "sine", vol = 0.18, when = 0) {
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + when + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + when); o.stop(c.currentTime + when + dur + 0.05);
  } catch (e) {}
}
function sweep(f1, f2, dur, type = "sine", vol = 0.15, when = 0) {
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, c.currentTime + when);
    o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + when + dur);
    g.gain.setValueAtTime(vol, c.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + when + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + when); o.stop(c.currentTime + when + dur + 0.05);
  } catch (e) {}
}
const SFX = {
  correct(combo) {
    const base = 523.25 * Math.pow(1.059463, Math.min(combo, 14));
    tone(base, 0.12, "square", 0.12);
    tone(base * 1.25, 0.14, "square", 0.10, 0.06);
    tone(base * 1.5, 0.22, "square", 0.10, 0.12);
  },
  perfect(combo) {
    const base = 659.25 * Math.pow(1.059463, Math.min(combo, 12));
    [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, 0.16, "square", 0.11, i * 0.05));
    sweep(base * 2, base * 4, 0.3, "sine", 0.08, 0.2);
  },
  wrong() { tone(196, 0.25, "sawtooth", 0.14); tone(147, 0.35, "sawtooth", 0.12, 0.08); },
  fever() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.18, "square", 0.12, i * 0.06)); },
  levelup() { sweep(300, 1200, 0.35, "square", 0.1); [880, 1108, 1318].forEach((f, i) => tone(f, 0.2, "square", 0.1, 0.3 + i * 0.08)); },
  gameover() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "triangle", 0.14, i * 0.18)); },
  start() { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.15, "square", 0.1, i * 0.09)); },
  count() { tone(1200, 0.03, "square", 0.05); },
  rankS() { [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.22, "square", 0.12, i * 0.1)); },
};

// ---------- 状態 ----------
const state = {
  screen: "title",
  activeCats: new Set(Object.keys(CATEGORIES)),
  deck: [], deckIdx: 0,
  current: null, mode: "color",
  orbs: [], particles: [], shockwaves: [],
  score: 0, combo: 0, maxCombo: 0,
  correct: 0, miss: 0, perfects: 0,
  lives: 3,
  level: 1, levelProgress: 0,
  fever: false, feverEnd: 0, feverGauge: 0,
  qTimeLimit: 9000, qDeadline: 0,
  locked: false,
  missedItems: [],
  running: false,
  shakeT: 0,
};
const levelMult = () => 1 + (state.level - 1) * 0.5; // Lv1=×1.0, Lv2=×1.5...
const LEVEL_NEED = 5; // 5問正解ごとにレベルアップ

// ---------- 画面切替 ----------
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
  state.screen = name;
}

// ---------- 背景の星 ----------
(function stars() {
  const wrap = $("bg-stars");
  for (let i = 0; i < 60; i++) {
    const s = document.createElement("div");
    s.className = "star";
    const sz = rand(1, 3);
    s.style.cssText = `width:${sz}px;height:${sz}px;left:${rand(0, 100)}%;top:${rand(0, 100)}%;animation-delay:${rand(0, 3)}s`;
    wrap.appendChild(s);
  }
})();

// ---------- タイトル: カテゴリボタン ----------
function buildCatButtons() {
  const wraps = { color: $("cat-buttons-color"), quiz: $("cat-buttons-quiz") };
  wraps.color.innerHTML = ""; wraps.quiz.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, c]) => {
    const b = document.createElement("button");
    b.className = "cat-btn" + (state.activeCats.has(key) ? " on" : "");
    b.textContent = `${c.icon} ${c.name}`;
    b.onclick = () => {
      if (state.activeCats.has(key)) {
        if (state.activeCats.size === 1) return;
        state.activeCats.delete(key);
      } else state.activeCats.add(key);
      b.classList.toggle("on");
      tone(660, 0.06, "sine", 0.08);
    };
    (wraps[c.group] || wraps.color).appendChild(b);
  });
}
buildCatButtons();

// ---------- ハイスコア ----------
const HS_KEY = "chemcolor_hiscore";
const getHiscore = () => parseInt(localStorage.getItem(HS_KEY) || "0", 10);
$("title-hiscore").textContent = getHiscore();

// ---------- キャンバス ----------
const canvas = $("game-canvas");
const ctx = canvas.getContext("2d");
let cw = 0, ch = 0, dpr = 1;
function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  cw = r.width; ch = r.height;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

// ---------- デッキ構築（色＋クイズ混合） ----------
function buildDeck() {
  const colorPool = COLOR_DB.filter(it => state.activeCats.has(it.cat)).map(it => ({ ...it, type: "color" }));
  const quizPool = QUIZ_DB.filter(it => state.activeCats.has(it.cat)).map(it => ({ ...it, type: "quiz" }));
  return shuffle([...colorPool, ...quizPool]);
}

// ---------- ゲーム開始 ----------
function startGame() {
  state.deck = buildDeck();
  state.deckIdx = 0;
  state.score = 0; state.combo = 0; state.maxCombo = 0;
  state.correct = 0; state.miss = 0; state.perfects = 0;
  state.lives = 3;
  state.level = 1; state.levelProgress = 0;
  state.fever = false; state.feverGauge = 0;
  state.missedItems = [];
  state.particles = []; state.shockwaves = [];
  state.locked = false;
  document.body.classList.remove("fever");
  $("fever-banner").classList.add("hidden");
  showScreen("game");
  resizeCanvas();
  updateHUD();
  SFX.start();
  nextQuestion();
  if (!state.running) { state.running = true; requestAnimationFrame(loop); }
}

// ---------- 出題 ----------
function nextQuestion() {
  if (state.lives <= 0) return;
  if (state.deckIdx >= state.deck.length) {
    state.deck = shuffle(state.deck);
    state.deckIdx = 0;
  }
  const item = state.deck[state.deckIdx++];
  state.current = item;
  state.mode = item.type;
  state.locked = false;

  const cat = CATEGORIES[item.cat];
  $("q-cat").textContent = `${cat.icon} ${cat.name}`;
  $("q-text").textContent = item.q;
  $("q-sub").textContent = item.sub || "";

  if (item.type === "color") setupColorQuestion(item);
  else setupQuizQuestion(item);

  const baseTime = item.type === "color" ? 9000 : 13000;
  state.qTimeLimit = state.fever ? baseTime * 0.75 : baseTime;
  state.qDeadline = performance.now() + state.qTimeLimit;
}

function setupColorQuestion(item) {
  $("quiz-choices").classList.add("hidden");
  canvas.style.pointerEvents = "auto";
  const allNames = Object.keys(PALETTE);
  const decoys = shuffle(allNames.filter(n => n !== item.color));
  const names = shuffle([item.color, ...decoys.slice(0, 3)]);

  state.orbs = [];
  const R = Math.min(cw, ch) * 0.115 + 14;
  const placed = [];
  names.forEach((name) => {
    let x, y, tries = 0;
    do { x = rand(R + 8, cw - R - 8); y = rand(R + 8, ch - R - 8); tries++; }
    while (tries < 200 && placed.some(p => Math.hypot(p.x - x, p.y - y) < R * 2.25));
    placed.push({ x, y });
    state.orbs.push({
      name, color: PALETTE[name], x, y, r: 0, targetR: R,
      vx: rand(-0.35, 0.35), vy: rand(-0.35, 0.35),
      phase: rand(0, Math.PI * 2), pop: 0, dead: false,
      correct: name === item.color,
    });
  });
}

function setupQuizQuestion(item) {
  state.orbs = [];
  canvas.style.pointerEvents = "none";
  const box = $("quiz-choices");
  box.classList.remove("hidden");
  box.innerHTML = "";
  const choices = shuffle([{ t: item.a, ok: true }, ...item.d.map(t => ({ t, ok: false }))]);
  const labels = ["A", "B", "C", "D"];
  choices.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "quiz-btn";
    b.innerHTML = `<span class="qb-label">${labels[i]}</span>${c.t}`;
    b.onclick = () => onQuizAnswer(b, c.ok);
    box.appendChild(b);
  });
}

// ---------- HUD ----------
function updateHUD() {
  $("hud-score").textContent = state.score.toLocaleString();
  const cEl = $("hud-combo");
  if (state.combo >= 2) {
    cEl.classList.remove("hidden");
    cEl.textContent = state.combo + " COMBO!";
    cEl.classList.toggle("big", state.combo >= 6);
  } else cEl.classList.add("hidden");
  $("hud-lives").textContent = "❤️".repeat(state.lives) + "🖤".repeat(Math.max(0, 3 - state.lives));
  $("hud-level").textContent = `Lv.${state.level} ×${levelMult().toFixed(1)}`;
  $("hud-feverfill").style.width = (state.fever ? 100 : state.feverGauge * 100) + "%";
}

// ---------- エフェクト ----------
function burst(x, y, color, count = 26, speed = 5) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(1, speed);
    state.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
      life: 1, decay: rand(0.012, 0.03),
      size: rand(2, 6), color, grav: 0.08,
      type: Math.random() < 0.3 ? "star" : "dot",
    });
  }
}
function shockwave(x, y, color) {
  state.shockwaves.push({ x, y, r: 8, maxR: Math.max(cw, ch) * 0.5, color, life: 1 });
}
function confettiRain(n = 40) {
  for (let i = 0; i < n; i++) {
    state.particles.push({
      x: rand(0, cw), y: -10, vx: rand(-1, 1), vy: rand(1, 3),
      life: 1, decay: rand(0.004, 0.01),
      size: rand(3, 7), color: `hsl(${rand(0, 360)},90%,60%)`,
      grav: 0.02, type: "rect", rot: rand(0, 6), vr: rand(-0.2, 0.2),
    });
  }
}
function floatText(x, y, text, color, size = 26) {
  const el = document.createElement("div");
  el.className = "fb-text";
  el.style.cssText = `left:${x}px; top:${y}px; color:${color}; font-size:${size}px; text-shadow:0 0 12px ${color};`;
  el.textContent = text;
  $("feedback-layer").appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function showMemo(item, isCorrect) {
  const el = document.createElement("div");
  el.className = "fb-memo";
  const ans = item.type === "quiz" ? item.a : item.color;
  const head = isCorrect ? "" : `正解:「${ans}」 `;
  el.textContent = head + (item.memo ? `💡 ${item.memo}` : "");
  $("feedback-layer").appendChild(el);
  setTimeout(() => el.remove(), 2300);
}
function showJudge(kind) { // perfect / great / good
  const b = $("judge-banner");
  b.className = "";
  b.classList.add("judge-" + kind);
  b.textContent = kind.toUpperCase() + "!!";
  b.classList.remove("hidden");
  void b.offsetWidth;
  b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  setTimeout(() => b.classList.add("hidden"), 750);
}
function comboSplash() {
  if (state.combo < 3 || state.combo % 3 !== 0) return;
  const el = document.createElement("div");
  el.className = "combo-splash";
  el.textContent = `🔥 ${state.combo} COMBO 🔥`;
  $("feedback-layer").appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// ---------- 共通: 正解処理 ----------
function applyCorrect(fx, fy) {
  state.locked = true;
  state.correct++;
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);

  // 判定 PERFECT / GREAT / GOOD（残り時間割合）
  const frac = Math.max(0, (state.qDeadline - performance.now()) / state.qTimeLimit);
  let judge = "good", judgeBonus = 0;
  if (frac > 0.7) { judge = "perfect"; judgeBonus = 150; state.perfects++; }
  else if (frac > 0.4) { judge = "great"; judgeBonus = 60; }

  let pts = 100 + Math.floor(frac * 100) + state.combo * 20 + judgeBonus;
  pts = Math.floor(pts * levelMult());
  if (state.fever) pts *= 2;
  state.score += pts;

  // フィーバーゲージ
  if (!state.fever) {
    state.feverGauge = Math.min(1, state.feverGauge + (judge === "perfect" ? 0.2 : 0.14));
    if (state.feverGauge >= 1) enterFever();
  } else confettiRain(20);

  // レベル
  state.levelProgress++;
  if (state.levelProgress >= LEVEL_NEED) {
    state.levelProgress = 0;
    state.level++;
    SFX.levelup();
    const lb = $("levelup-banner");
    lb.textContent = `⚡ LEVEL UP! Lv.${state.level} (スコア×${levelMult().toFixed(1)}) ⚡`;
    lb.classList.remove("hidden");
    void lb.offsetWidth;
    lb.style.animation = "none"; void lb.offsetWidth; lb.style.animation = "";
    setTimeout(() => lb.classList.add("hidden"), 1400);
    confettiRain(30);
  }

  if (judge === "perfect") SFX.perfect(state.combo); else SFX.correct(state.combo);
  showJudge(judge);
  comboSplash();
  shockwave(fx, fy, judge === "perfect" ? "#ffd700" : "#69f0ae");
  floatText(fx, fy - 30, `+${pts}`, "#ffeb3b", 30);
  if (state.current.memo) showMemo(state.current, true);

  $("screen-game").classList.remove("flash-correct");
  void $("screen-game").offsetWidth;
  $("screen-game").classList.add("flash-correct");

  updateHUD();
  setTimeout(nextQuestion, state.current.memo ? 950 : 600);
}

// ---------- 共通: ミス処理 ----------
function applyWrong(fx, fy, timeout = false) {
  state.locked = true;
  state.miss++;
  state.combo = 0;
  state.lives--;
  state.feverGauge = Math.max(0, state.feverGauge - 0.25);
  if (state.fever) exitFever();

  SFX.wrong();
  state.shakeT = 12;
  $("question-panel").classList.remove("shake");
  void $("question-panel").offsetWidth;
  $("question-panel").classList.add("shake");
  floatText(fx, fy, timeout ? "時間切れ！" : "MISS...", "#ff5252", 28);
  showMemo(state.current, false);
  if (!state.missedItems.includes(state.current)) state.missedItems.push(state.current);

  updateHUD();
  if (state.lives <= 0) setTimeout(gameOver, 1700);
  else setTimeout(nextQuestion, 1800);
}

// ---------- 色オーブ: タップ判定 ----------
function onTap(x, y) {
  if (state.screen !== "game" || state.locked || !state.current || state.mode !== "color") return;
  for (const o of state.orbs) {
    if (o.dead) continue;
    if (Math.hypot(o.x - x, o.y - y) <= o.r + 12) {
      if (o.correct) {
        o.dead = true;
        burst(o.x, o.y, o.color, 34, 6.5);
        burst(o.x, o.y, "#ffffff", 12, 3);
        state.orbs.forEach(oo => { if (!oo.dead && !oo.correct) { oo.dead = true; burst(oo.x, oo.y, oo.color, 8, 2.5); } });
        applyCorrect(o.x, o.y + canvas.getBoundingClientRect().top);
      } else {
        o.dead = true;
        burst(o.x, o.y, "#555", 14, 3);
        const ans = state.orbs.find(oo => oo.correct);
        if (ans) { ans.highlight = true; burst(ans.x, ans.y, ans.color, 20, 4); }
        applyWrong(o.x, o.y + canvas.getBoundingClientRect().top);
      }
      return;
    }
  }
}

// ---------- クイズ: 回答判定 ----------
function onQuizAnswer(btn, ok) {
  if (state.locked) return;
  const box = $("quiz-choices");
  const r = btn.getBoundingClientRect();
  const fx = r.left + r.width / 2, fy = r.top;
  // 正解ボタンを光らせる
  [...box.children].forEach(b => {
    const isAns = b.textContent.slice(1) === state.current.a || b.innerText.includes(state.current.a);
    if (isAns) b.classList.add("reveal-correct");
    else if (b === btn && !ok) b.classList.add("reveal-wrong");
    else b.classList.add("dimmed");
    b.onclick = null;
  });
  if (ok) applyCorrect(fx, fy);
  else applyWrong(fx, fy);
}

function handleTimeout() {
  if (state.locked) return;
  if (state.mode === "color") {
    const ans = state.orbs.find(o => o.correct);
    if (ans) { ans.highlight = true; burst(ans.x, ans.y, ans.color, 20, 4); }
  } else {
    [...$("quiz-choices").children].forEach(b => {
      if (b.innerText.includes(state.current.a)) b.classList.add("reveal-correct");
      else b.classList.add("dimmed");
      b.onclick = null;
    });
  }
  applyWrong(window.innerWidth / 2, window.innerHeight / 2, true);
}

// ---------- フィーバー ----------
function enterFever() {
  state.fever = true;
  state.feverEnd = performance.now() + 12000;
  document.body.classList.add("fever");
  const b = $("fever-banner");
  b.classList.remove("hidden");
  SFX.fever();
  confettiRain(60);
  setTimeout(() => b.classList.add("hidden"), 2000);
}
function exitFever() {
  state.fever = false;
  state.feverGauge = 0;
  document.body.classList.remove("fever");
  $("fever-banner").classList.add("hidden");
  updateHUD();
}

// ---------- ランク ----------
function calcRank() {
  const total = state.correct + state.miss;
  const rate = total ? state.correct / total : 0;
  if (rate >= 0.95 && state.correct >= 15) return "S";
  if (rate >= 0.85 && state.correct >= 10) return "A";
  if (rate >= 0.7) return "B";
  if (rate >= 0.5) return "C";
  return "D";
}
const RANK_MSG = { S: "化学の神！", A: "入試も余裕！", B: "いい調子！", C: "伸びしろ十分！", D: "図鑑で復習しよう！" };

// ---------- ゲームオーバー ----------
function gameOver() {
  state.locked = true;
  exitFever();

  const rank = calcRank();
  const rk = $("result-rank");
  rk.className = "rank-" + rank;
  rk.innerHTML = `${rank}<span class="rank-caption">${RANK_MSG[rank]}</span>`;
  if (rank === "S") SFX.rankS(); else SFX.gameover();

  $("result-correct").textContent = state.correct;
  $("result-miss").textContent = state.miss;
  $("result-maxcombo").textContent = state.maxCombo;
  const total = state.correct + state.miss;
  $("result-rate").textContent = total ? Math.round(state.correct / total * 100) + "%" : "0%";

  const hs = getHiscore();
  if (state.score > hs) {
    localStorage.setItem(HS_KEY, String(state.score));
    $("result-newrecord").classList.remove("hidden");
  } else $("result-newrecord").classList.add("hidden");
  $("title-hiscore").textContent = getHiscore();

  // 復習リスト
  const rv = $("result-review");
  rv.innerHTML = "";
  if (state.missedItems.length) {
    const h = document.createElement("div");
    h.className = "review-review-title";
    h.textContent = "📚 間違えた問題を復習しよう！";
    rv.appendChild(h);
    state.missedItems.forEach(it => {
      const d = document.createElement("div");
      d.className = "review-item";
      if (it.type === "color") {
        d.innerHTML = `<div class="review-swatch" style="background:${PALETTE[it.color]}"></div>
          <div><b>${it.q}</b>（${it.sub || ""}）→ <b style="color:#ffd54f">${it.color}</b>${it.memo ? `<br><span style="color:#9a90c8">💡${it.memo}</span>` : ""}</div>`;
      } else {
        d.innerHTML = `<div class="review-swatch" style="background:#7c4dff; display:flex;align-items:center;justify-content:center;font-size:14px">🧠</div>
          <div><b>${it.q}</b><br>→ <b style="color:#69f0ae">${it.a}</b>${it.memo ? `<br><span style="color:#9a90c8">💡${it.memo}</span>` : ""}</div>`;
      }
      rv.appendChild(d);
    });
  }
  showScreen("result");

  // スコアカウントアップ演出
  const el = $("result-score");
  const target = state.score;
  const dur = Math.min(1600, 400 + target / 3);
  const t0 = performance.now();
  (function tick() {
    const p = Math.min(1, (performance.now() - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.floor(target * eased).toLocaleString();
    if (p < 1) { if (Math.random() < 0.3) SFX.count(); requestAnimationFrame(tick); }
    else el.textContent = target.toLocaleString();
  })();
}

// ---------- メインループ ----------
let lastT = 0;
function loop(t) {
  if (state.screen === "game") {
    const dt = Math.min(32, t - lastT) / 16.67;
    lastT = t;
    update(dt, t);
    draw(t);
  } else lastT = t;
  requestAnimationFrame(loop);
}

function update(dt, now) {
  if (!state.locked && state.current) {
    const remain = state.qDeadline - now;
    const frac = Math.max(0, remain / state.qTimeLimit);
    const fill = $("hud-timerfill");
    fill.style.width = (frac * 100) + "%";
    fill.classList.toggle("warn", frac < 0.3);
    if (remain <= 0) handleTimeout();
  }
  if (state.fever && now > state.feverEnd) exitFever();

  for (const o of state.orbs) {
    if (o.dead) continue;
    o.r += (o.targetR - o.r) * 0.15 * dt;
    o.x += o.vx * dt; o.y += o.vy * dt;
    o.phase += 0.04 * dt;
    if (o.x < o.targetR) { o.x = o.targetR; o.vx *= -1; }
    if (o.x > cw - o.targetR) { o.x = cw - o.targetR; o.vx *= -1; }
    if (o.y < o.targetR) { o.y = o.targetR; o.vy *= -1; }
    if (o.y > ch - o.targetR) { o.y = ch - o.targetR; o.vy *= -1; }
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.grav * dt;
    p.life -= p.decay * dt;
    if (p.rot !== undefined) p.rot += p.vr * dt;
    if (p.life <= 0 || p.y > ch + 20) state.particles.splice(i, 1);
  }
  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const w = state.shockwaves[i];
    w.r += (w.maxR - w.r) * 0.12 * dt;
    w.life -= 0.04 * dt;
    if (w.life <= 0) state.shockwaves.splice(i, 1);
  }
  if (state.shakeT > 0) state.shakeT -= dt;
}

function draw(t) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  if (state.shakeT > 0) ctx.translate(rand(-5, 5), rand(-5, 5));

  // 衝撃波
  for (const w of state.shockwaves) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, w.life) * 0.7;
    ctx.strokeStyle = w.color;
    ctx.lineWidth = 5 * w.life;
    ctx.beginPath(); ctx.arc(w.x, w.y - canvas.getBoundingClientRect().top, w.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // オーブ
  for (const o of state.orbs) {
    if (o.dead) continue;
    const bob = Math.sin(o.phase) * 4;
    const x = o.x, y = o.y + bob, r = o.r;
    if (r < 1) continue;

    ctx.save();
    ctx.shadowColor = o.color;
    ctx.shadowBlur = o.highlight ? 40 : (state.fever ? 28 : 18);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    const light = o.name === "黒" || o.name === "黒紫" ? "#666" : "#ffffff";
    g.addColorStop(0, light);
    g.addColorStop(0.25, o.color);
    g.addColorStop(1, shade(o.color, -35));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = o.highlight ? 5 : 2.5;
    ctx.strokeStyle = o.highlight ? "#fff176" : "rgba(255,255,255,.65)";
    ctx.stroke();
    ctx.restore();

    if (o.highlight) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,241,118,${0.5 + 0.5 * Math.sin(t / 100)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    const fs = Math.max(13, r * 0.34);
    ctx.font = `900 ${fs}px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const dark = ["白", "淡黄", "黄", "無色", "淡青", "青白", "緑白", "淡緑", "淡赤(桃)", "銀白", "黄緑", "金(黄金)"].includes(o.name);
    ctx.lineWidth = 4;
    ctx.strokeStyle = dark ? "rgba(255,255,255,.9)" : "rgba(0,0,0,.75)";
    ctx.fillStyle = dark ? "#222" : "#fff";
    ctx.strokeText(o.name, x, y);
    ctx.fillText(o.name, x, y);
    ctx.restore();
  }

  // パーティクル
  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    if (p.type === "rect") {
      ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    } else if (p.type === "star") {
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
      }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + pct, g = ((n >> 8) & 255) + pct, b = (n & 255) + pct;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

// ---------- 入力 ----------
canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  onTap(e.clientX - r.left, e.clientY - r.top);
});

// ---------- 図鑑 ----------
function buildZukan() {
  const list = $("zukan-list");
  list.innerHTML = "";
  let total = 0;
  Object.entries(CATEGORIES).forEach(([key, c]) => {
    const colorItems = COLOR_DB.filter(it => it.cat === key);
    const quizItems = QUIZ_DB.filter(it => it.cat === key);
    const n = colorItems.length + quizItems.length;
    if (!n) return;
    const h = document.createElement("div");
    h.className = "zukan-cat-head";
    h.textContent = `${c.icon} ${c.name}（${n}項目）`;
    list.appendChild(h);
    colorItems.forEach(it => {
      total++;
      const d = document.createElement("div");
      d.className = "zukan-item";
      d.innerHTML = `
        <div class="zukan-swatch" style="background:${PALETTE[it.color]}"></div>
        <div class="zukan-info">
          <div class="zukan-q">${it.q}</div>
          <div class="zukan-sub">${it.sub || ""}</div>
          ${it.memo ? `<div class="zukan-memo">💡 ${it.memo}</div>` : ""}
        </div>
        <div class="zukan-colorname" style="color:${PALETTE[it.color]}; text-shadow:0 0 6px rgba(0,0,0,.8), 0 0 2px #fff;">${it.color}</div>`;
      list.appendChild(d);
    });
    quizItems.forEach(it => {
      total++;
      const d = document.createElement("div");
      d.className = "zukan-item";
      d.innerHTML = `
        <div class="zukan-swatch" style="background:linear-gradient(135deg,#7c4dff,#e040fb); display:flex;align-items:center;justify-content:center;">🧠</div>
        <div class="zukan-info">
          <div class="zukan-q">${it.q} ${it.sub ? `<span style="color:#ffd54f;font-weight:400">${it.sub}</span>` : ""}</div>
          <div class="zukan-sub" style="color:#69f0ae">✔ ${it.a}</div>
          ${it.memo ? `<div class="zukan-memo">💡 ${it.memo}</div>` : ""}
        </div>`;
      list.appendChild(d);
    });
  });
  $("zukan-count").textContent = `全${total}項目`;
}

// ---------- ボタン ----------
$("btn-start").onclick = () => { ac().resume && ac().resume(); startGame(); };
$("btn-retry").onclick = () => startGame();
$("btn-to-title").onclick = () => showScreen("title");
$("btn-zukan").onclick = () => { buildZukan(); showScreen("zukan"); };
$("btn-zukan-back").onclick = () => showScreen("title");

// ---------- 自動スモークテスト (?autotest=1) ----------
if (new URLSearchParams(location.search).get("autotest") === "1") {
  console.log("[autotest] COLOR_DB:", COLOR_DB.length, "QUIZ_DB:", QUIZ_DB.length, "cats:", Object.keys(CATEGORIES).length);
  startGame();
  const step = (n) => {
    if (n <= 0) {
      buildZukan();
      console.log("[autotest] zukan entries:", document.querySelectorAll(".zukan-item").length);
      console.log("[autotest] final score:", state.score, "level:", state.level, "combo:", state.combo);
      console.log("[autotest] PASS");
      return;
    }
    setTimeout(() => {
      console.log(`[autotest] Q(${state.mode}):`, state.current && state.current.q);
      if (state.mode === "color") {
        const ans = state.orbs.find(o => o.correct);
        if (ans) onTap(ans.x, ans.y);
      } else {
        const btns = [...document.querySelectorAll(".quiz-btn")];
        const ok = btns.find(b => b.innerText.includes(state.current.a));
        if (ok) ok.click();
      }
      console.log("[autotest] score:", state.score, "combo:", state.combo, "fever gauge:", state.feverGauge.toFixed(2));
      step(n - 1);
    }, 1300);
  };
  setTimeout(() => step(6), 700);
}

})();
