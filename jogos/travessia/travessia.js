// Travessia: atravesse a estrada e o rio pulando em grade até encher as 5 tocas.
(() => {
  const COLS = 13, ROWS = 14, CELL = 40;
  const W = COLS * CELL, H = ROWS * CELL;
  const START_ROW = 12, MEDIAN_ROW = 6;
  const HOMES = [1.5, 4, 6.5, 9, 11.5];   // centro de cada toca (em casas)
  const JUMP_T = 0.14;                     // duração do pulo (s)
  const isRiver = r => r >= 1 && r <= 5;
  const isRoad = r => r >= 7 && r <= 11;

  // Faixas na fase 1. v em casas por segundo (sinal = sentido), len em casas, n = quantidade.
  const LANES = {
    11: { type: 'car', color: '#ffe600', v: -1.3, len: 1, n: 3 },
    10: { type: 'moto', color: '#ff8c1a', v: 2.6, len: 1, n: 2 },
    9: { type: 'car', color: '#ff2bd6', v: -1.8, len: 1, n: 3 },
    8: { type: 'sport', color: '#00e5ff', v: 2.2, len: 1, n: 2 },
    7: { type: 'truck', color: '#b04bff', v: -1.1, len: 2, n: 2 },
    5: { type: 'turtle', v: -1.4, len: 3, n: 4 },
    4: { type: 'log', v: 1.0, len: 3, n: 3 },
    3: { type: 'log', v: 2.0, len: 5, n: 2 },
    2: { type: 'turtle', v: -1.6, len: 2, n: 4 },
    1: { type: 'log', v: 1.4, len: 4, n: 3 },
  };
  const DEATHS = {
    carro: 'ATROPELADO!', agua: 'TCHIBUM!', borda: 'LEVADO PELA CORRENTEZA!',
    tempo: 'TEMPO ESGOTADO!', cerca: 'BATEU NA CERCA!', jacare: 'NHAC! JACARÉ!',
  };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), stage = $('stage');
  const overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), level: $('hLevel'), lives: $('hLives'), status: $('hStatus') };

  /* ---------- configurações ---------- */
  const settings = { tap: 'on' };
  Arcade.bindSettings(panels.menu, settings, 'travessia_', () => {});
  const codes = Arcade.codes('travessia', {
    KONAMI: 'Vidas infinitas',
    PARADO: 'Trânsito em câmera lenta',
    NADADOR: 'O sapo nada e não se afoga',
  }, $('codeMount'), () => updateHud());
  const timeLimit = () => (level >= 5 ? 25 : 30);

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');
  function resize() {
    k = Arcade.fit(canvas, W, H, wrap);
    buildBg();
  }
  // Cenário fixo (calçadas, asfalto, canteiro, cerca das tocas), desenhado uma vez por tamanho.
  function buildBg() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#04030c'; g.fillRect(0, 0, W, H);
    // rio
    const rv = g.createLinearGradient(0, CELL, 0, 6 * CELL);
    rv.addColorStop(0, '#04103a'); rv.addColorStop(1, '#061a4a');
    g.fillStyle = rv; g.fillRect(0, CELL, W, 5 * CELL);
    // cerca viva com as tocas
    g.fillStyle = '#062a12'; g.fillRect(0, 0, W, CELL);
    for (let x = 0; x < W; x += 10) {
      g.fillStyle = (x / 10) % 2 ? '#0b3d1a' : '#0f4a20';
      g.beginPath(); g.arc(x + 5, CELL - 4, 9, Math.PI, 0); g.fill();
    }
    g.save();
    g.strokeStyle = '#39ff14'; g.shadowColor = '#39ff14'; g.shadowBlur = 10; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, CELL); g.lineTo(W, CELL); g.stroke();
    for (const hx of HOMES) {
      const x = hx * CELL;
      g.fillStyle = '#041438';
      g.beginPath(); g.moveTo(x - CELL * 0.62, CELL); g.lineTo(x - CELL * 0.62, CELL * 0.3);
      g.quadraticCurveTo(x - CELL * 0.62, 2, x, 2); g.quadraticCurveTo(x + CELL * 0.62, 2, x + CELL * 0.62, CELL * 0.3);
      g.lineTo(x + CELL * 0.62, CELL); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
    // canteiro (meio) e calçada (largada)
    for (const r of [MEDIAN_ROW, START_ROW]) {
      const y = r * CELL;
      g.fillStyle = r === MEDIAN_ROW ? '#1b0b2e' : '#160a26';
      g.fillRect(0, y, W, CELL);
      g.strokeStyle = 'rgba(255,43,214,0.18)'; g.lineWidth = 1;
      for (let x = 0; x <= W; x += CELL / 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + CELL); g.stroke(); }
      g.beginPath(); g.moveTo(0, y + CELL / 2); g.lineTo(W, y + CELL / 2); g.stroke();
      g.save();
      g.strokeStyle = '#ff2bd6'; g.shadowColor = '#ff2bd6'; g.shadowBlur = 8; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, y + 1); g.lineTo(W, y + 1); g.moveTo(0, y + CELL - 1); g.lineTo(W, y + CELL - 1); g.stroke();
      g.restore();
      if (r === MEDIAN_ROW) {
        // tufos de grama neon
        g.strokeStyle = 'rgba(57,255,20,0.55)'; g.lineWidth = 1.5;
        for (let i = 0; i < 26; i++) {
          const gx = (i * 53 + 17) % W, gy = y + 10 + ((i * 37) % 22);
          g.beginPath(); g.moveTo(gx, gy + 6); g.lineTo(gx - 3, gy); g.moveTo(gx, gy + 6); g.lineTo(gx, gy - 2); g.moveTo(gx, gy + 6); g.lineTo(gx + 3, gy); g.stroke();
        }
      }
    }
    // estrada
    g.fillStyle = '#0a0912'; g.fillRect(0, 7 * CELL, W, 5 * CELL);
    for (let r = 8; r <= 11; r++) {
      const y = r * CELL;
      g.save();
      g.strokeStyle = r === 9 || r === 10 ? 'rgba(255,230,0,0.6)' : 'rgba(255,255,255,0.35)';
      g.lineWidth = 2; g.setLineDash([18, 16]);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      g.restore();
    }
    // faixa de baixo (tempo e vidas)
    g.fillStyle = '#07040f'; g.fillRect(0, 13 * CELL, W, CELL);
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let level = 1, score = 0, lives = 3, timeLeft = 30;
  let hi = +Arcade.store.get('travessia_hi', 0) || 0;
  let lanes = {}, homes = [], frog = null, queued = null;
  let particles = [], popups = [], ripples = [], time = 0, stateT = 0, eventT = 4, tickT = 0, hornT = 3;
  let filledTotal = 0, fliesEaten = 0, banner = null;

  function buildLanes() {
    lanes = {};
    const mul = Math.min(2.1, 1 + 0.13 * (level - 1));
    for (const [rs, d] of Object.entries(LANES)) {
      const r = +rs;
      let n = d.n, len = d.len;
      if (isRoad(r) && level >= 3 && d.type !== 'truck') n++;
      if (d.type === 'log' && level >= 4) len = Math.max(2, len - 1);
      const P = COLS + len + 3;
      const off = Math.random() * P;
      const objs = [];
      for (let i = 0; i < n; i++) {
        objs.push({
          x: ((off + (i * P) / n) % P) - len - 1.5, len,
          diver: d.type === 'turtle' && (i === 0 || (level >= 3 && i === 2)),
          t: Math.random() * 7, depth: 0, seed: Math.random(),
        });
      }
      lanes[r] = { r, type: d.type, color: d.color, len, n, P, v: d.v * mul, objs };
    }
  }
  function resetHomes() { homes = HOMES.map(x => ({ x, filled: false, fly: 0, croc: 0, crocPhase: '' })); }

  function resetFrog() {
    frog = { x: 6.5, row: START_ROW, face: { x: 0, y: -1 }, jumping: false, jt: 0, fx: 6.5, fr: START_ROW, tx: 6.5, tr: START_ROW, best: START_ROW, dead: null, swim: false };
    queued = null;
    timeLeft = timeLimit();
  }

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function start() {
    if (state !== 'menu' && state !== 'over') return;
    Sfx.ensure();
    level = 1; score = 0; lives = 3; filledTotal = 0; fliesEaten = 0;
    particles = []; popups = []; ripples = [];
    buildLanes(); resetHomes(); resetFrog();
    state = 'ready'; stateT = 0; eventT = 5;
    banner = { text: 'FASE 1', t: 1.4 };
    show(null);
    [392, 523, 659, 784].forEach((f, i) => Sfx.tone(f, 0.12, 'square', 0.07, null, i * 0.1));
    updateHud();
  }

  function toMenu() {
    state = 'menu'; level = 1;
    buildLanes(); resetHomes(); frog = null;
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (['ready', 'play', 'dying', 'levelup'].includes(state)) {
      pausedFrom = state; state = 'pause'; show('pause');
    } else if (state === 'pause') {
      state = pausedFrom; show(null);
    }
  }

  function gameOver() {
    state = 'over';
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set('travessia_hi', hi); }
    Ranking.gameOver($('rankBox'), { board: 'travessia', score, cheated });
    $('overScore').textContent = score;
    $('overInfo').textContent = `Fase ${level} · ${filledTotal} ${filledTotal === 1 ? 'toca' : 'tocas'} · ${fliesEaten} ${fliesEaten === 1 ? 'mosca' : 'moscas'}`;
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.level.textContent = demo ? 1 : level;
    hud.lives.textContent = codes.has('KONAMI') ? '∞' : demo ? 3 : lives;
    const tags = [];
    if (codes.has('PARADO')) tags.push('CÂMERA LENTA');
    if (codes.has('NADADOR')) tags.push('NADADOR');
    hud.status.textContent = tags.join(' · ');
  }

  /* ---------- efeitos ---------- */
  function burst(px, py, color, n, power = 120, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Arcade.rand(power * 0.25, power);
      const life = Arcade.rand(0.35, 0.9);
      particles.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * Arcade.rand(0.6, 1.3), g: 160 });
    }
  }
  function popup(text, x, y, color, size = 16, life = 1.2) { popups.push({ text, x, y, color, size, life, max: life }); }

  /* ---------- mundo ---------- */
  const slowRoad = () => (codes.has('PARADO') ? 0.45 : 1);
  function updateLanes(dt) {
    for (const lane of Object.values(lanes)) {
      const v = lane.v * (isRoad(lane.r) ? slowRoad() : 1);
      for (const o of lane.objs) {
        o.x += v * dt;
        if (o.x >= COLS + 1.5) o.x -= lane.P;
        else if (o.x < -lane.len - 1.5) o.x += lane.P;
        if (o.diver) {
          // ciclo do mergulho: boia 4 s, afunda 0,8 s, fica submersa 1,4 s, sobe 0,8 s
          o.t = (o.t + dt) % 7;
          o.depth = o.t < 4 ? 0 : o.t < 4.8 ? (o.t - 4) / 0.8 : o.t < 6.2 ? 1 : 1 - (o.t - 6.2) / 0.8;
        }
      }
    }
  }
  // Plataforma (tronco ou tartaruga) sob o ponto x da faixa r, ou null.
  function platformAt(r, x) {
    const lane = lanes[r];
    if (!lane) return null;
    for (const o of lane.objs) {
      if (o.depth >= 0.7) continue;
      if (x >= o.x - 0.12 && x <= o.x + o.len + 0.12) return lane;
    }
    return null;
  }
  function hitVehicle(r, x) {
    const lane = lanes[r];
    if (!lane) return false;
    const half = lane.type === 'moto' ? 0.3 : 0.34;
    for (const o of lane.objs) {
      const a = o.x + (lane.type === 'moto' ? 0.15 : 0.06), b = o.x + o.len - (lane.type === 'moto' ? 0.15 : 0.06);
      if (x + half > a && x - half < b) return true;
    }
    return false;
  }

  // Eventos das tocas: mosca bônus ou jacaré (a partir da fase 2).
  function updateHomes(dt) {
    for (const h of homes) {
      if (h.fly > 0) h.fly -= dt;
      if (h.croc > 0) {
        h.croc -= dt;
        if (h.crocPhase === 'olhos' && h.croc <= 0) { h.crocPhase = 'bote'; h.croc = 2.6; }
        else if (h.croc <= 0) h.crocPhase = '';
      }
    }
    eventT -= dt;
    if (eventT > 0) return;
    eventT = Arcade.rand(4, 8);
    const free = homes.filter(h => !h.filled && h.fly <= 0 && h.croc <= 0);
    if (!free.length) return;
    const h = Arcade.pick(free);
    if (level >= 2 && Math.random() < Math.min(0.55, 0.3 + level * 0.05)) { h.crocPhase = 'olhos'; h.croc = 1.6; } else h.fly = 5;
  }

  /* ---------- sapo ---------- */
  function tryJump(dx, dy) {
    if (state !== 'play' || !frog || frog.dead) return;
    if (frog.jumping) { queued = { dx, dy }; return; }
    const tr = frog.row + dy;
    if (tr > START_ROW || tr < 0) return;
    let tx = frog.x + dx;
    if (!isRiver(tr) && tr !== 0) tx = Math.floor(tx) + 0.5; // em terra firme o sapo volta para a grade
    tx = Math.max(0.5, Math.min(COLS - 0.5, tx));
    if (tr === 0) {
      const h = HOMES.find(hx => Math.abs(hx - tx) < 0.62);
      if (h !== undefined) tx = h;
    }
    if (dx && Math.abs(tx - frog.x) < 0.05) return; // encostado na borda
    frog.face = { x: dx, y: dy };
    frog.jumping = true; frog.jt = 0;
    frog.fx = frog.x; frog.fr = frog.row; frog.tx = tx; frog.tr = tr;
    Sfx.tone(frog.swim ? 300 : 520, 0.06, 'square', 0.05, frog.swim ? 420 : 780);
  }

  function land() {
    frog.jumping = false;
    frog.x = frog.tx; frog.row = frog.tr;
    if (frog.row < frog.best) { frog.best = frog.row; score += 10; }
    if (frog.row === 0) { reachHome(); return; }
    if (isRiver(frog.row) && !platformAt(frog.row, frog.x)) {
      if (!codes.has('NADADOR')) { die('agua'); return; }
      ripples.push({ x: frog.x * CELL, y: (frog.row + 0.5) * CELL, t: 0 });
    }
    if (queued) { const q = queued; queued = null; tryJump(q.dx, q.dy); }
  }

  function reachHome() {
    const h = homes.find(o => Math.abs(o.x - frog.x) < 0.05);
    if (!h || h.filled) { die('cerca'); return; }
    if (h.crocPhase === 'bote') { die('jacare'); return; }
    h.filled = true; filledTotal++;
    const bonus = Math.ceil(timeLeft) * 10;
    let pts = 50 + bonus;
    const px = h.x * CELL, py = CELL / 2;
    if (h.fly > 0) { pts += 200; fliesEaten++; h.fly = 0; popup('MOSCA +200', px, py + 34, '#ffe600', 13, 1.6); }
    h.crocPhase = ''; h.croc = 0;
    score += pts;
    popup(`+${pts}`, px, py + 14, '#39ff14', 16, 1.4);
    burst(px, py, '#39ff14', 22, 140);
    [659, 784, 988, 1319].forEach((f, i) => Sfx.tone(f, 0.1, 'square', 0.07, null, i * 0.07));
    if (homes.every(o => o.filled)) {
      score += 1000;
      state = 'levelup'; stateT = 0;
      banner = { text: 'FASE COMPLETA! +1000', t: 2.6 };
      setTimeout(() => Sfx.win(), 300);
      for (let i = 0; i < 60; i++) burst(Math.random() * W, Math.random() * H * 0.5, Arcade.pick(['#39ff14', '#ffe600', '#ff2bd6', '#00e5ff']), 1, 90, 4);
      frog = null;
      return;
    }
    resetFrog();
  }

  function die(type) {
    if (frog.dead) return;
    frog.dead = { type, t: 0 };
    frog.jumping = false;
    state = 'dying'; stateT = 0;
    const px = frog.x * CELL, py = (frog.row + 0.5) * CELL;
    popup(DEATHS[type], W / 2, H / 2 - 20, '#ff3b5c', type === 'borda' ? 16 : 22, 1.4);
    if (type === 'carro') {
      burst(px, py, '#39ff14', 26, 160); burst(px, py, '#ff3b5c', 10, 120);
      Sfx.noise(0.25, 0.4, 2500, 0, 'lowpass', 200); Sfx.tone(140, 0.3, 'sawtooth', 0.1, 60);
    } else if (type === 'agua' || type === 'borda') {
      for (let i = 0; i < 3; i++) ripples.push({ x: px, y: py, t: -i * 0.15 });
      burst(px, py, '#7ad7ff', 20, 110);
      Sfx.noise(0.5, 0.35, 1800, 0, 'bandpass', 300); Sfx.tone(400, 0.4, 'sine', 0.08, 90);
    } else if (type === 'jacare') {
      burst(px, py, '#39ff14', 20, 140);
      Sfx.tone(90, 0.2, 'sawtooth', 0.14, 50); Sfx.tone(90, 0.2, 'sawtooth', 0.14, 50, 0.22);
    } else {
      burst(px, py, '#ffe600', 16, 100);
      Sfx.lose();
    }
  }

  function updateFrog(dt) {
    if (!frog || frog.dead) return;
    if (frog.jumping) {
      frog.jt += dt;
      if (frog.jt >= JUMP_T) land();
    } else if (isRiver(frog.row)) {
      const lane = platformAt(frog.row, frog.x);
      frog.swim = !lane;
      if (lane) frog.x += lane.v * dt;
      else if (!codes.has('NADADOR')) { die('agua'); return; } // a tartaruga mergulhou
      if (frog.x < 0 || frog.x > COLS) { die('borda'); return; }
    } else frog.swim = false;
    if (!frog || frog.dead || state !== 'play') return; // pode ter chegado na toca ou morrido no pouso
    // atropelamento: confere a faixa em que o sapo está (no meio do pulo vale a de destino)
    const p = frog.jumping ? frog.jt / JUMP_T : 1;
    const r = frog.jumping ? (p < 0.5 ? frog.fr : frog.tr) : frog.row;
    const x = frog.jumping ? frog.fx + (frog.tx - frog.fx) * p : frog.x;
    if (isRoad(r) && hitVehicle(r, x)) { frog.x = x; frog.row = r; die('carro'); return; }
    timeLeft -= dt;
    if (timeLeft <= 8 && Math.ceil(timeLeft) !== tickT) { tickT = Math.ceil(timeLeft); if (tickT > 0) Sfx.tone(tickT <= 3 ? 1200 : 900, 0.05, 'square', 0.05); }
    if (timeLeft <= 0) { timeLeft = 0; die('tempo'); }
    // buzina de vez em quando com o sapo na pista
    if (isRoad(frog.row)) {
      hornT -= dt;
      if (hornT <= 0) { hornT = Arcade.rand(3, 7); Sfx.tone(392, 0.12, 'square', 0.04); Sfx.tone(494, 0.14, 'square', 0.04, null, 0.15); }
    }
  }

  /* ---------- entrada ---------- */
  const KEYS = {
    arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
    arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  };
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !(e.target.closest && e.target.closest('button'))) start();
      return;
    }
    const m = KEYS[key];
    if (!m || e.repeat) return;
    tryJump(m[0], m[1]);
  });

  // Toque: deslizar escolhe a direção; um toque simples pula para o lado em que tocou (em relação ao sapo).
  let touch = null;
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    e.preventDefault();
  });
  screen.addEventListener('pointermove', e => {
    if (!touch || e.pointerId !== touch.id || touch.used) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    if (Math.hypot(dx, dy) < 24) return;
    touch.used = true;
    if (Math.abs(dx) > Math.abs(dy)) tryJump(Math.sign(dx), 0); else tryJump(0, Math.sign(dy));
  });
  screen.addEventListener('pointerup', e => {
    if (!touch || e.pointerId !== touch.id) return;
    if (!touch.used && frog && settings.tap === 'on') {
      const r = canvas.getBoundingClientRect();
      const lx = (e.clientX - r.left) / r.width * W, ly = (e.clientY - r.top) / r.height * H;
      const dx = lx - frog.x * CELL, dy = ly - (frog.row + 0.5) * CELL;
      if (Math.abs(dx) > Math.abs(dy)) tryJump(Math.sign(dx), 0); else tryJump(0, Math.sign(dy) || -1);
    }
    touch = null;
  });
  screen.addEventListener('pointercancel', () => { touch = null; });

  // Botões direcionais na tela (🎮).
  for (const b of document.querySelectorAll('.dpad button')) {
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); Sfx.ensure();
      const [dx, dy] = b.dataset.dir.split(',').map(Number);
      b.classList.add('on');
      tryJump(dx, dy);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('on'));
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Controle de videogame: um pulo por toque no direcional (borda de subida).
  let padDir = '', padStart = false, padA = false;
  function pollInputs() {
    const g = Arcade.gamepad(0);
    if (!g) return;
    let d = '';
    if (Math.hypot(g.lx, g.ly) > 0.5) d = Math.abs(g.lx) > Math.abs(g.ly) ? `${Math.sign(g.lx)},0` : `0,${Math.sign(g.ly)}`;
    if (d && d !== padDir) { const [dx, dy] = d.split(',').map(Number); tryJump(dx, dy); }
    padDir = d;
    if (g.start && !padStart) togglePause();
    if (g.a && !padA && (state === 'menu' || state === 'over')) start();
    padStart = g.start; padA = g.a;
  }

  overlay.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'start') start();
    else if (a === 'resume') togglePause();
    else if (a === 'menu') toMenu();
    b.blur();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state !== 'pause') togglePause(); });

  /* ---------- desenho ---------- */
  function drawText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawWater() {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.16)'; ctx.lineWidth = 1.5;
    for (let r = 1; r <= 5; r++) {
      for (let j = 0; j < 2; j++) {
        const y = r * CELL + 12 + j * 16;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 10) {
          const yy = y + Math.sin(x * 0.05 + time * 2 * (r % 2 ? 1 : -1) + j * 2) * 2.5;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLog(o, y) {
    const x = o.x * CELL, w = o.len * CELL, h = CELL * 0.72, top = y + (CELL - h) / 2;
    ctx.save();
    ctx.shadowColor = '#ff8c1a'; ctx.shadowBlur = 8;
    const g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, '#a8642a'); g.addColorStop(0.5, '#6e3b16'); g.addColorStop(1, '#3d1f0a');
    ctx.fillStyle = g;
    rrect(x + 2, top, w - 4, h, h / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,170,90,0.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < o.len * 2; i++) {
      const bx = x + 10 + i * (w - 20) / (o.len * 2), off = ((i * 7 + o.seed * 10) % 6) - 3;
      ctx.beginPath(); ctx.moveTo(bx, top + 7 + off); ctx.lineTo(bx + 12, top + 7 + off); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + 6, top + h - 8 - off); ctx.lineTo(bx + 16, top + h - 8 - off); ctx.stroke();
    }
    // ponta com anéis
    ctx.fillStyle = '#d9a066';
    ctx.beginPath(); ctx.ellipse(x + w - h / 2 + 2, top + h / 2, h * 0.28, h * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a5527'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x + w - h / 2 + 2, top + h / 2, h * 0.15, h * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawTurtles(o, y, dir) {
    ctx.save();
    const a = 1 - o.depth * 0.8;
    for (let i = 0; i < o.len; i++) {
      const cx = (o.x + i + 0.5) * CELL, cy = y + CELL / 2;
      ctx.globalAlpha = a;
      // nadadeiras animadas
      const fl = Math.sin(time * 8 + i) * 3;
      ctx.fillStyle = '#2bbf5a';
      for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath(); ctx.ellipse(cx + fx * 11 + (fy > 0 ? fl : -fl) * 0.5, cy + fy * 11, 5, 3.5, fx * fy * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx + dir * 15, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(cx + dir * 17 - 1, cy - 3, 2, 2);
      const shell = o.depth > 0.05 ? '#1f6f8f' : '#39d353';
      ctx.shadowColor = o.diver ? '#ff2bd6' : '#39ff14'; ctx.shadowBlur = o.depth > 0 ? 4 : 10;
      ctx.fillStyle = shell;
      ctx.beginPath(); ctx.ellipse(cx, cy, 13, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,40,10,0.7)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) { const an = j * Math.PI / 3; ctx.lineTo(cx + Math.cos(an) * 6, cy + Math.sin(an) * 6); }
      ctx.closePath(); ctx.stroke();
      for (let j = 0; j < 6; j++) { const an = j * Math.PI / 3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * 6, cy + Math.sin(an) * 6); ctx.lineTo(cx + Math.cos(an) * 12, cy + Math.sin(an) * 11); ctx.stroke(); }
      if (o.depth > 0.3) {
        ctx.globalAlpha = 0.7; ctx.strokeStyle = '#bfefff';
        ctx.beginPath(); ctx.arc(cx - 6 + Math.sin(time * 5 + i) * 3, cy - 4 - ((time * 20 + i * 7) % 12), 2, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawVehicle(lane, o, y) {
    const dir = Math.sign(lane.v) || 1;
    const x = o.x * CELL, w = lane.len * CELL, cy = y + CELL / 2;
    ctx.save();
    // farol (cone de luz à frente)
    const fx = dir > 0 ? x + w - 4 : x + 4;
    const beam = ctx.createLinearGradient(fx, 0, fx + dir * 60, 0);
    beam.addColorStop(0, 'rgba(255,250,200,0.28)'); beam.addColorStop(1, 'rgba(255,250,200,0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(fx, cy - 6); ctx.lineTo(fx + dir * 60, cy - 16); ctx.lineTo(fx + dir * 60, cy + 16); ctx.lineTo(fx, cy + 6); ctx.fill();
    ctx.shadowColor = lane.color; ctx.shadowBlur = 12;
    if (lane.type === 'moto') {
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(x + 8, cy + 8, 5, 0, Math.PI * 2); ctx.arc(x + w - 8, cy + 8, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lane.color;
      rrect(x + 6, cy - 2, w - 12, 9, 4); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a1640'; rrect(x + w / 2 - 6 - dir * 3, cy - 14, 12, 12, 4); ctx.fill();
      ctx.fillStyle = lane.color; ctx.beginPath(); ctx.arc(x + w / 2 + dir * 2, cy - 15, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9ff'; ctx.fillRect(x + w / 2 + dir * 4 - 2, cy - 17, 4, 3);
    } else if (lane.type === 'truck') {
      const cab = CELL * 0.62;
      const cabX = dir > 0 ? x + w - cab - 3 : x + 3;
      const trX = dir > 0 ? x + 3 : x + cab + 6;
      ctx.fillStyle = '#1d1030'; ctx.strokeStyle = lane.color; ctx.lineWidth = 2;
      rrect(trX, cy - 15, w - cab - 9, 30, 3); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '900 10px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff2bd6'; ctx.fillText('NEON', trX + (w - cab - 9) / 2, cy, w - cab - 14);
      ctx.shadowBlur = 10;
      ctx.fillStyle = lane.color; rrect(cabX, cy - 13, cab, 26, 5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#9fe8ff'; ctx.fillRect(dir > 0 ? cabX + cab - 9 : cabX + 3, cy - 10, 6, 20);
    } else {
      const bodyH = lane.type === 'sport' ? 22 : 26;
      ctx.fillStyle = lane.color;
      rrect(x + 4, cy - bodyH / 2, w - 8, bodyH, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0d0518';
      for (const s of [-1, 1]) for (const wx of [x + 10, x + w - 16]) ctx.fillRect(wx, cy + s * bodyH / 2 - (s > 0 ? 1 : 3), 7, 4);
      ctx.fillStyle = 'rgba(160,240,255,0.85)';
      const wsx = dir > 0 ? x + w - 17 : x + 10;
      rrect(wsx, cy - bodyH / 2 + 4, 7, bodyH - 8, 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rrect(x + w / 2 - 8, cy - bodyH / 2 + 4, 16, bodyH - 8, 3); ctx.fill();
      if (lane.type === 'sport') { ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, cy - 1.5, w - 12, 3); }
      ctx.fillStyle = '#fffbd0';
      ctx.fillRect(dir > 0 ? x + w - 6 : x + 4, cy - bodyH / 2 + 3, 2, 4); ctx.fillRect(dir > 0 ? x + w - 6 : x + 4, cy + bodyH / 2 - 7, 2, 4);
      ctx.fillStyle = '#ff2040';
      ctx.fillRect(dir > 0 ? x + 4 : x + w - 6, cy - bodyH / 2 + 3, 2, 4); ctx.fillRect(dir > 0 ? x + 4 : x + w - 6, cy + bodyH / 2 - 7, 2, 4);
    }
    ctx.restore();
  }

  // Sapo visto de cima. face = direção do último pulo; s = esticada do pulo (0 a 1).
  function drawFrog(px, py, face, s, opts = {}) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(face.y, face.x) + Math.PI / 2);
    const sc = (opts.scale || 1) * (1 + s * 0.15);
    ctx.scale(sc, sc);
    const body = opts.color || '#39ff14';
    ctx.shadowColor = body; ctx.shadowBlur = 14;
    ctx.fillStyle = '#1fae2a';
    // pernas (esticadas no meio do pulo)
    const leg = 4 + s * 9;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(sx * 11, 7 + leg * 0.5, 4, 5 + leg * 0.4, sx * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx * 10, -8 - s * 3, 3.5, 5, -sx * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,80,10,0.55)';
    for (const [sx, sy, r] of [[-4, 3, 2.5], [4, 5, 2], [0, 8, 1.8], [-3, -2, 1.5]]) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); }
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#eaffd8';
      ctx.beginPath(); ctx.arc(sx * 6, -9, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#05160a';
      if (opts.dead) {
        ctx.strokeStyle = '#05160a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx * 6 - 2.5, -11.5); ctx.lineTo(sx * 6 + 2.5, -6.5); ctx.moveTo(sx * 6 + 2.5, -11.5); ctx.lineTo(sx * 6 - 2.5, -6.5); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(sx * 6, -10, 2, 0, Math.PI * 2); ctx.fill(); }
    }
    if (opts.happy) {
      ctx.strokeStyle = '#05160a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -2, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHomes() {
    for (const h of homes) {
      const px = h.x * CELL, py = CELL * 0.55;
      if (h.filled) {
        const bob = state === 'levelup' ? Math.sin(time * 12 + h.x) * 4 : Math.sin(time * 3 + h.x) * 1.2;
        drawFrog(px, py + bob, { x: 0, y: 1 }, 0, { happy: true, scale: 0.9 });
      } else if (h.fly > 0) {
        if (h.fly > 1.2 || Math.floor(time * 10) % 2) {
          ctx.save();
          ctx.translate(px + Math.sin(time * 9) * 3, py + Math.cos(time * 7) * 2);
          ctx.fillStyle = 'rgba(200,240,255,0.7)';
          const fl = Math.abs(Math.sin(time * 40)) * 4 + 2;
          ctx.beginPath(); ctx.ellipse(-4, -3, fl, 3, -0.5, 0, Math.PI * 2); ctx.ellipse(4, -3, fl, 3, 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffe600'; ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      } else if (h.crocPhase) {
        ctx.save();
        ctx.translate(px, py + 2);
        const bite = h.crocPhase === 'bote';
        ctx.fillStyle = '#1f8a3a'; ctx.shadowColor = '#39ff14'; ctx.shadowBlur = bite ? 12 : 4;
        if (bite) {
          const open = 0.35 + Math.abs(Math.sin(time * 6)) * 0.35;
          ctx.save(); ctx.rotate(-open); ctx.beginPath(); ctx.ellipse(0, -2, 14, 6, 0, Math.PI, 0); ctx.fill(); ctx.restore();
          ctx.save(); ctx.rotate(open); ctx.beginPath(); ctx.ellipse(0, 2, 14, 6, 0, 0, Math.PI); ctx.fill(); ctx.restore();
          ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
          for (let i = -2; i <= 2; i++) ctx.fillRect(i * 4 - 1, -2, 2, 3);
        } else {
          ctx.beginPath(); ctx.ellipse(0, 8, 14, 5, 0, Math.PI, 0); ctx.fill();
        }
        ctx.shadowBlur = 0;
        for (const sx of [-1, 1]) {
          ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.arc(sx * 6, bite ? -9 : 5, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#000'; ctx.fillRect(sx * 6 - 0.6, (bite ? -9 : 5) - 2, 1.2, 4);
        }
        ctx.restore();
      }
    }
  }

  function drawBottom() {
    const y = 13 * CELL;
    // vidas
    if (codes.has('KONAMI')) { drawFrog(22, y + CELL / 2, { x: 0, y: -1 }, 0, { scale: 0.6 }); drawText('∞', 46, y + CELL / 2, 16, '#39ff14'); } else {
      const spare = state === 'menu' ? 2 : Math.max(0, lives - 1);
      for (let i = 0; i < Math.min(spare, 5); i++) drawFrog(22 + i * 26, y + CELL / 2, { x: 0, y: -1 }, 0, { scale: 0.6 });
    }
    // barra de tempo
    const max = timeLimit();
    const frac = state === 'menu' ? 1 : Math.max(0, timeLeft / max);
    const bw = W * 0.5, bx = W - bw - 14, by = y + CELL / 2 - 6;
    ctx.save();
    ctx.font = '700 11px Orbitron, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9a8bb8'; ctx.fillText('TEMPO', bx - 8, by + 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 12);
    const c = frac > 0.5 ? '#39ff14' : frac > 0.25 ? '#ffe600' : '#ff3b5c';
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 10;
    const blink = frac <= 0.25 && Math.floor(time * 6) % 2;
    if (!blink) ctx.fillRect(bx + 1, by + 1, (bw - 2) * frac, 10);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    drawWater();
    for (const r of [1, 2, 3, 4, 5]) {
      const lane = lanes[r];
      for (const o of lane.objs) {
        if (o.x > COLS + 0.5 || o.x + o.len < -0.5) continue;
        if (lane.type === 'log') drawLog(o, r * CELL); else drawTurtles(o, r * CELL, Math.sign(lane.v));
      }
    }
    for (const rp of ripples) {
      if (rp.t < 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - rp.t / 0.9);
      ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, 4 + rp.t * 30, 2 + rp.t * 14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    drawHomes();
    for (const r of [7, 8, 9, 10, 11]) {
      const lane = lanes[r];
      for (const o of lane.objs) {
        if (o.x > COLS + 0.5 || o.x + o.len < -0.5) continue;
        drawVehicle(lane, o, r * CELL);
      }
    }
    // sapo
    const st = state === 'pause' ? pausedFrom : state;
    if (frog && st !== 'menu') {
      if (frog.dead) {
        const t = frog.dead.t, px = frog.x * CELL, py = (frog.row + 0.5) * CELL;
        if (frog.dead.type === 'carro') {
          // achatado no asfalto
          ctx.save(); ctx.translate(px, py); ctx.scale(1.5, 0.35); ctx.translate(-px, -py);
          drawFrog(px, py, frog.face, 0, { dead: true, color: '#2a8a2a' });
          ctx.restore();
        } else if (frog.dead.type === 'agua' || frog.dead.type === 'borda') {
          if (t < 0.6) { ctx.save(); ctx.globalAlpha = 1 - t / 0.6; drawFrog(px, py + t * 10, frog.face, 0, { dead: true, scale: 1 - t }); ctx.restore(); }
        } else {
          drawFrog(px, py, frog.face, 0, { dead: true });
        }
        // anjinho subindo
        if (t > 0.3) {
          ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (t - 0.3) / 1.1);
          drawFrog(px, py - (t - 0.3) * 50, { x: 0, y: -1 }, 0, { scale: 0.55, color: '#bfffe0' });
          ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 2; ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.ellipse(px, py - (t - 0.3) * 50 - 12, 7, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      } else {
        const p = frog.jumping ? frog.jt / JUMP_T : 0;
        const x = frog.jumping ? frog.fx + (frog.tx - frog.fx) * p : frog.x;
        const r = frog.jumping ? frog.fr + (frog.tr - frog.fr) * p : frog.row;
        const lift = Math.sin(p * Math.PI);
        if (frog.swim) {
          ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(x * CELL, (r + 0.5) * CELL, 16 + Math.sin(time * 6) * 2, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        drawFrog(x * CELL, (r + 0.5) * CELL - lift * 6, frog.face, lift, { color: codes.has('NADADOR') && frog.swim ? '#00e5ff' : '#39ff14' });
      }
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(p.text, p.x, p.y - (1 - p.life / p.max) * 24, p.size, p.color, Math.min(1, p.life * 2));
    if (banner && banner.t > 0) drawText(banner.text, W / 2, 6.5 * CELL, banner.text.length > 10 ? 22 : 34, '#39ff14', Math.min(1, banner.t * 2));
    if (st === 'ready') drawText(stateT < 0.9 ? 'PRONTO?' : 'VAI!', W / 2, 12.5 * CELL, 22, '#ffe600');
    if (st === 'gameover') drawText('FIM DE JOGO', W / 2, H / 2, 34, '#ff3b5c');
    drawBottom();
  }

  /* ---------- laço principal ---------- */
  function update(dt) {
    time += dt;
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    updateLanes(dt);
    if (state !== 'over') updateHomes(dt);
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.97; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) p.life -= dt;
    popups = popups.filter(p => p.life > 0);
    for (const r of ripples) r.t += dt;
    ripples = ripples.filter(r => r.t < 0.9);

    if (state === 'ready') {
      stateT += dt;
      if (stateT > 1.4) { state = 'play'; Sfx.beep(true); }
    } else if (state === 'play') {
      updateFrog(dt);
    } else if (state === 'dying') {
      stateT += dt;
      frog.dead.t += dt;
      if (stateT > 1.5) {
        if (!codes.has('KONAMI')) lives--;
        if (lives <= 0) { state = 'gameover'; stateT = 0; Sfx.lose(); } else { resetFrog(); state = 'ready'; stateT = 0.5; }
      }
    } else if (state === 'levelup') {
      stateT += dt;
      if (stateT > 2.8) {
        level++;
        buildLanes(); resetHomes(); resetFrog();
        state = 'ready'; stateT = 0; eventT = 5;
        banner = { text: `FASE ${level}`, t: 1.4 };
        updateHud();
      }
    } else if (state === 'gameover') {
      stateT += dt;
      if (stateT > 1.4) gameOver();
    }
  }

  let last = performance.now(), hudT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollInputs();
    if (state !== 'pause') update(dt);
    hudT -= dt;
    if (hudT <= 0 && state !== 'menu') { hudT = 0.1; updateHud(); }
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => { if (lanes[1]) resize(); });
  addEventListener('resize', resize);
  buildLanes();
  resetHomes();
  resize();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
