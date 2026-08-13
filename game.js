/* ============================================================
   ケミカラ！ 〜無機化学 色マスター〜  ゲーム本体
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
const SFX = {
  correct(combo) {
    const base = 523.25 * Math.pow(1.059463, Math.min(combo, 12)); // コンボで音程UP
    tone(base, 0.12, "square", 0.12);
    tone(base * 1.25, 0.14, "square", 0.10, 0.06);
    tone(base * 1.5, 0.22, "square", 0.10, 0.12);
  },
  wrong() { tone(196, 0.25, "sawtooth", 0.14); tone(147, 0.35, "sawtooth", 0.12, 0.08); },
  fever() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, "square", 0.12, i * 0.07)); },
  gameover() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "triangle", 0.14, i * 0.18)); },
  tick() { tone(880, 0.05, "sine", 0.06); },
  start() { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.15, "square", 0.1, i * 0.09)); },
};

// ---------- 状態 ----------
const state = {
  screen: "title",
  activeCats: new Set(Object.keys(CATEGORIES)),
  deck: [], deckIdx: 0,
  current: null,
  orbs: [],
  particles: [],
  score: 0, combo: 0, maxCombo: 0,
  correct: 0, miss: 0,
  lives: 3,
  fever: false, feverEnd: 0,
  qTimeLimit: 9000, qDeadline: 0,
  locked: false,
  missedItems: [],
  running: false,
  shakeT: 0,
};

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
  const wrap = $("cat-buttons");
  wrap.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, c]) => {
    const b = document.createElement("button");
    b.className = "cat-btn" + (state.activeCats.has(key) ? " on" : "");
    b.textContent = `${c.icon} ${c.name}`;
    b.onclick = () => {
      if (state.activeCats.has(key)) {
        if (state.activeCats.size === 1) return; // 最低1つ
        state.activeCats.delete(key);
      } else state.activeCats.add(key);
      b.classList.toggle("on");
      tone(660, 0.06, "sine", 0.08);
    };
    wrap.appendChild(b);
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

// ---------- ゲーム開始 ----------
function startGame() {
  const pool = COLOR_DB.filter(it => state.activeCats.has(it.cat));
  state.deck = shuffle(pool);
  state.deckIdx = 0;
  state.score = 0; state.combo = 0; state.maxCombo = 0;
  state.correct = 0; state.miss = 0;
  state.lives = 3;
  state.fever = false;
  state.missedItems = [];
  state.particles = [];
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
  if (state.deckIdx >= state.deck.length) { // 全問一巡したら再シャッフル
    state.deck = shuffle(state.deck);
    state.deckIdx = 0;
  }
  const item = state.deck[state.deckIdx++];
  state.current = item;
  state.locked = false;

  const cat = CATEGORIES[item.cat];
  $("q-cat").textContent = `${cat.icon} ${cat.name}`;
  $("q-text").textContent = item.q;
  $("q-sub").textContent = item.sub || "";

  // 選択肢の色を作る（正解 + ダミー）
  const allNames = Object.keys(PALETTE);
  const decoys = shuffle(allNames.filter(n => n !== item.color));
  const n = state.fever ? 4 : 4; // オーブ数
  const names = shuffle([item.color, ...decoys.slice(0, n - 1)]);

  // オーブ配置（重ならないように）
  state.orbs = [];
  const R = Math.min(cw, ch) * 0.115 + 14;
  const placed = [];
  names.forEach((name) => {
    let x, y, tries = 0;
    do {
      x = rand(R + 8, cw - R - 8);
      y = rand(R + 8, ch - R - 8);
      tries++;
    } while (tries < 200 && placed.some(p => Math.hypot(p.x - x, p.y - y) < R * 2.25));
    placed.push({ x, y });
    state.orbs.push({
      name, color: PALETTE[name],
      x, y, r: 0, targetR: R,
      vx: rand(-0.35, 0.35), vy: rand(-0.35, 0.35),
      phase: rand(0, Math.PI * 2),
      pop: 0, dead: false,
      correct: name === item.color,
    });
  });

  // 制限時間（フィーバー中は短くしてスリルUP）
  state.qTimeLimit = state.fever ? 6500 : 9000;
  state.qDeadline = performance.now() + state.qTimeLimit;
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
}

// ---------- パーティクル ----------
function burst(x, y, color, count = 26, speed = 5) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(1, speed);
    state.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
      life: 1, decay: rand(0.012, 0.03),
      size: rand(2, 6), color,
      grav: 0.08, type: Math.random() < 0.3 ? "star" : "dot",
    });
  }
}
function confettiRain() {
  for (let i = 0; i < 40; i++) {
    state.particles.push({
      x: rand(0, cw), y: -10, vx: rand(-1, 1), vy: rand(1, 3),
      life: 1, decay: rand(0.004, 0.01),
      size: rand(3, 7), color: `hsl(${rand(0, 360)},90%,60%)`,
      grav: 0.02, type: "rect", rot: rand(0, 6), vr: rand(-0.2, 0.2),
    });
  }
}

// ---------- フィードバック表示 ----------
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
  const head = isCorrect ? "" : `正解は「${item.color}」！ `;
  el.textContent = head + (item.memo ? `💡 ${item.memo}` : `${item.sub || item.q} = ${item.color}`);
  $("feedback-layer").appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// ---------- 判定 ----------
function onTap(x, y) {
  if (state.screen !== "game" || state.locked || !state.current) return;
  for (const o of state.orbs) {
    if (o.dead) continue;
    if (Math.hypot(o.x - x, o.y - y) <= o.r + 12) {
      if (o.correct) handleCorrect(o); else handleWrong(o);
      return;
    }
  }
}
function handleCorrect(orb) {
  state.locked = true;
  orb.dead = true;
  state.correct++;
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);

  const timeLeft = Math.max(0, state.qDeadline - performance.now());
  const speedBonus = Math.floor(timeLeft / 100);
  let pts = 100 + speedBonus + state.combo * 20;
  if (state.fever) pts *= 2;
  state.score += pts;

  SFX.correct(state.combo);
  burst(orb.x, orb.y, orb.color, 34, 6.5);
  burst(orb.x, orb.y, "#ffffff", 12, 3);
  const msgs = ["ナイス！", "正解！", "その調子！", "完璧！", "天才！", "スゴイ！"];
  floatText(orb.x, orb.y - 30 + canvas.offsetTop, `+${pts}`, "#ffeb3b", 30);
  floatText(orb.x, orb.y - 66 + canvas.offsetTop, msgs[(Math.random() * msgs.length) | 0], "#69f0ae", 22);
  if (state.current.memo) showMemo(state.current, true);
  $("screen-game").classList.remove("flash-correct");
  void $("screen-game").offsetWidth;
  $("screen-game").classList.add("flash-correct");

  // フィーバー突入判定
  if (!state.fever && state.combo >= 8) enterFever();
  if (state.fever) confettiRain();

  // 他のオーブも弾け飛ばす演出
  state.orbs.forEach(o => { if (!o.dead && !o.correct) { o.dead = true; burst(o.x, o.y, o.color, 8, 2.5); } });

  updateHUD();
  setTimeout(nextQuestion, state.current.memo ? 900 : 550);
}
function handleWrong(orb) {
  state.locked = true;
  state.miss++;
  state.combo = 0;
  state.lives--;
  if (state.fever) exitFever();

  SFX.wrong();
  state.shakeT = 12;
  $("question-panel").classList.remove("shake");
  void $("question-panel").offsetWidth;
  $("question-panel").classList.add("shake");
  floatText(orb.x, orb.y - 30 + canvas.offsetTop, "MISS...", "#ff5252", 28);
  burst(orb.x, orb.y, "#555", 14, 3);
  orb.dead = true;

  // 正解を光らせて記憶に残す
  const ans = state.orbs.find(o => o.correct);
  if (ans) { ans.highlight = true; burst(ans.x, ans.y, ans.color, 20, 4); }
  showMemo(state.current, false);
  if (!state.missedItems.some(m => m === state.current)) state.missedItems.push(state.current);

  updateHUD();
  if (state.lives <= 0) { setTimeout(gameOver, 1600); }
  else setTimeout(nextQuestion, 1700);
}
function handleTimeout() {
  if (state.locked) return;
  state.locked = true;
  state.miss++;
  state.combo = 0;
  state.lives--;
  if (state.fever) exitFever();
  SFX.wrong();
  floatText(cw / 2, ch / 2 + canvas.offsetTop, "時間切れ！", "#ff5252", 30);
  const ans = state.orbs.find(o => o.correct);
  if (ans) { ans.highlight = true; burst(ans.x, ans.y, ans.color, 20, 4); }
  showMemo(state.current, false);
  if (!state.missedItems.some(m => m === state.current)) state.missedItems.push(state.current);
  updateHUD();
  if (state.lives <= 0) { setTimeout(gameOver, 1600); }
  else setTimeout(nextQuestion, 1700);
}

// ---------- フィーバー ----------
function enterFever() {
  state.fever = true;
  state.feverEnd = performance.now() + 12000;
  document.body.classList.add("fever");
  const b = $("fever-banner");
  b.classList.remove("hidden");
  SFX.fever();
  confettiRain(); confettiRain();
  setTimeout(() => b.classList.add("hidden"), 2000);
}
function exitFever() {
  state.fever = false;
  document.body.classList.remove("fever");
  $("fever-banner").classList.add("hidden");
}

// ---------- ゲームオーバー ----------
function gameOver() {
  state.locked = true;
  SFX.gameover();
  exitFever();

  $("result-score").textContent = state.score.toLocaleString();
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

  // 間違えた問題の復習リスト
  const rv = $("result-review");
  rv.innerHTML = "";
  if (state.missedItems.length) {
    const h = document.createElement("div");
    h.className = "review-review-title";
    h.textContent = "📚 間違えた色を復習しよう！";
    rv.appendChild(h);
    state.missedItems.forEach(it => {
      const d = document.createElement("div");
      d.className = "review-item";
      d.innerHTML = `<div class="review-swatch" style="background:${PALETTE[it.color]}"></div>
        <div><b>${it.q}</b>（${it.sub || ""}）→ <b style="color:#ffd54f">${it.color}</b>${it.memo ? `<br><span style="color:#9a90c8">💡${it.memo}</span>` : ""}</div>`;
      rv.appendChild(d);
    });
  }
  showScreen("result");
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
  // タイマー
  if (!state.locked && state.current) {
    const remain = state.qDeadline - now;
    const frac = Math.max(0, remain / state.qTimeLimit);
    const fill = $("hud-timerfill");
    fill.style.width = (frac * 100) + "%";
    fill.classList.toggle("warn", frac < 0.3);
    if (remain <= 0) handleTimeout();
  }
  // フィーバー終了
  if (state.fever && now > state.feverEnd) exitFever();

  // オーブ
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
  // パーティクル
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.grav * dt;
    p.life -= p.decay * dt;
    if (p.rot !== undefined) p.rot += p.vr * dt;
    if (p.life <= 0 || p.y > ch + 20) state.particles.splice(i, 1);
  }
  if (state.shakeT > 0) state.shakeT -= dt;
}

function draw(t) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  if (state.shakeT > 0) ctx.translate(rand(-5, 5), rand(-5, 5));

  // オーブ
  for (const o of state.orbs) {
    if (o.dead) continue;
    const bob = Math.sin(o.phase) * 4;
    const x = o.x, y = o.y + bob, r = o.r;
    if (r < 1) continue;

    // グロー
    ctx.save();
    ctx.shadowColor = o.color;
    ctx.shadowBlur = o.highlight ? 40 : (state.fever ? 28 : 18);

    // 本体（放射グラデ）
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    const light = o.name === "黒" || o.name === "黒紫" ? "#666" : "#ffffff";
    g.addColorStop(0, light);
    g.addColorStop(0.25, o.color);
    g.addColorStop(1, shade(o.color, -35));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    // リング
    ctx.lineWidth = o.highlight ? 5 : 2.5;
    ctx.strokeStyle = o.highlight ? "#fff176" : "rgba(255,255,255,.65)";
    ctx.stroke();
    ctx.restore();

    // ハイライト（正解表示時）
    if (o.highlight) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,241,118,${0.5 + 0.5 * Math.sin(t / 100)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 色名ラベル
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
    const items = COLOR_DB.filter(it => it.cat === key);
    if (!items.length) return;
    const h = document.createElement("div");
    h.className = "zukan-cat-head";
    h.textContent = `${c.icon} ${c.name}（${items.length}項目）`;
    list.appendChild(h);
    items.forEach(it => {
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
  console.log("[autotest] items:", COLOR_DB.length, "categories:", Object.keys(CATEGORIES).length);
  startGame();
  setTimeout(() => {
    console.log("[autotest] question:", state.current && state.current.q, "->", state.current && state.current.color);
    console.log("[autotest] orbs:", state.orbs.map(o => o.name).join(","));
    const ans = state.orbs.find(o => o.correct);
    if (ans) { onTap(ans.x, ans.y); console.log("[autotest] tapped correct orb. score:", state.score, "combo:", state.combo); }
    setTimeout(() => {
      console.log("[autotest] next question:", state.current && state.current.q);
      buildZukan();
      console.log("[autotest] zukan entries:", document.querySelectorAll(".zukan-item").length);
      console.log("[autotest] PASS");
    }, 1500);
  }, 800);
}

})();
