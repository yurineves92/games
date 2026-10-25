// Snake: lógica em grade + desenho 2D no canvas.
(() => {
  const COLS = 20, ROWS = 20, CELL = 28;
  const W = COLS * CELL, H = ROWS * CELL;
  const SPEEDS = { slow: 150, normal: 112, fast: 80 };
  const BONUS_TIME = 6;

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), stage = $('stage');
  const overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), len: $('hLen'), status: $('hStatus') };

  /* ---------- configurações ---------- */
  const settings = { speed: 'normal', walls: 'solid' };
  Arcade.bindSettings(panels.menu, settings, 'snake_', key => { if (key === 'walls') buildBoard(); });

  /* ---------- tela ---------- */
  let k = 1;
  const board = document.createElement('canvas');
  function resize() {
    k = Arcade.fit(canvas, W, H, wrap);
    buildBoard();
  }
  // Fundo do tabuleiro 2D, desenhado uma vez por tamanho de tela.
  function buildBoard() {
    board.width = canvas.width; board.height = canvas.height;
    const g = board.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#050c07'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2) { g.fillStyle = '#08130b'; g.fillRect(x * CELL, y * CELL, CELL, CELL); }
      }
    }
    g.strokeStyle = 'rgba(57,255,20,0.08)'; g.lineWidth = 1;
    for (let i = 1; i < COLS; i++) { g.beginPath(); g.moveTo(i * CELL, 0); g.lineTo(i * CELL, H); g.stroke(); }
    for (let i = 1; i < ROWS; i++) { g.beginPath(); g.moveTo(0, i * CELL); g.lineTo(W, i * CELL); g.stroke(); }
    g.save();
    g.strokeStyle = '#39ff14'; g.shadowColor = '#39ff14'; g.shadowBlur = 12;
    if (settings.walls === 'solid') { g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4); }
    else { g.lineWidth = 2; g.setLineDash([10, 8]); g.globalAlpha = 0.6; g.strokeRect(1, 1, W - 2, H - 2); }
    g.restore();
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let body, prev, dir, queue = [], food, bonus, score, eaten, grow, interval, acc;
  let particles = [], popups = [], deadT = -1, countT = 0, goT = 0, lastBeat = 0, sinceBonus = 0, time = 0;
  let hi = +Arcade.store.get('snake_hi', 0) || 0;

  function reset() {
    const cy = ROWS >> 1;
    body = [{ x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy }];
    prev = body.map(p => ({ x: p.x, y: p.y }));
    dir = { x: 1, y: 0 }; queue = [];
    score = 0; eaten = 0; grow = 0; acc = 0; sinceBonus = 0;
    interval = SPEEDS[settings.speed] || SPEEDS.normal;
    particles = []; popups = []; bonus = null; deadT = -1;
    food = freeCell();
  }

  function freeCell() {
    const taken = new Set(body.map(p => p.y * COLS + p.x));
    if (food) taken.add(food.y * COLS + food.x);
    if (bonus) taken.add(bonus.y * COLS + bonus.x);
    const free = [];
    for (let i = 0; i < COLS * ROWS; i++) if (!taken.has(i)) free.push(i);
    if (!free.length) return null;
    const i = Arcade.pick(free);
    return { x: i % COLS, y: (i / COLS) | 0 };
  }

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function start() {
    if (state === 'play' || state === 'count') return;
    Sfx.ensure();
    reset();
    state = 'count'; countT = 1.8; lastBeat = 0;
    show(null);
    updateHud();
  }

  function toMenu() {
    state = 'menu';
    reset();
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (state === 'play' || state === 'count') {
      pausedFrom = state; state = 'pause'; show('pause');
    } else if (state === 'pause') {
      state = pausedFrom; show(null);
    }
  }

  function gameOver() {
    state = 'over';
    const rec = score > hi;
    if (rec) { hi = score; Arcade.store.set('snake_hi', hi); }
    $('overScore').textContent = score;
    $('overInfo').textContent = `Tamanho ${body.length} · ${eaten} ${eaten === 1 ? 'maçã' : 'maçãs'}`;
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.len.textContent = demo ? 3 : body.length;
    hud.status.textContent = bonus && !demo ? `★ ${Math.ceil(bonus.t)}s` : '';
  }

  /* ---------- movimento ---------- */
  const lastDir = () => (queue.length ? queue[queue.length - 1] : dir);
  function setDir(x, y) {
    if (state !== 'play' && state !== 'count') return;
    const l = lastDir();
    if ((x === l.x && y === l.y) || (x === -l.x && y === -l.y)) return;
    if (queue.length < 3) { queue.push({ x, y }); Sfx.tone(560, 0.03, 'square', 0.03); }
  }

  const blocked = (x, y, ignoreTail) => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
    const n = ignoreTail ? body.length - 1 : body.length;
    for (let i = 0; i < n; i++) if (body[i].x === x && body[i].y === y) return true;
    return false;
  };
  const wrapPos = (x, y) => (settings.walls === 'wrap' ? [(x + COLS) % COLS, (y + ROWS) % ROWS] : [x, y]);

  // Piloto automático do modo demonstração (atrás do menu).
  function autopilot() {
    const opts = [dir, { x: dir.y, y: -dir.x }, { x: -dir.y, y: dir.x }];
    let best = null, bs = -Infinity;
    for (const d of opts) {
      const [nx, ny] = wrapPos(body[0].x + d.x, body[0].y + d.y);
      if (blocked(nx, ny, grow === 0)) continue;
      const space = flood(nx, ny, body.length + 8);
      let s = -(Math.abs(nx - food.x) + Math.abs(ny - food.y)) + Math.random() * 0.5;
      if (space < body.length + 2) s -= 1000;
      if (s > bs) { bs = s; best = d; }
    }
    if (best) dir = best;
  }
  function flood(sx, sy, limit) {
    const seen = new Set([sy * COLS + sx]), st = [[sx, sy]];
    while (st.length && seen.size < limit) {
      const [x, y] = st.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [nx, ny] = wrapPos(x + dx, y + dy);
        const id = ny * COLS + nx;
        if (seen.has(id) || blocked(nx, ny, true)) continue;
        seen.add(id); st.push([nx, ny]);
      }
    }
    return seen.size;
  }

  function step() {
    const demo = state === 'menu';
    if (demo) autopilot();
    else if (queue.length) dir = queue.shift();
    const h = body[0];
    let [nx, ny] = wrapPos(h.x + dir.x, h.y + dir.y);
    if (blocked(nx, ny, grow === 0)) return demo ? reset() : die();

    prev = body.map(p => ({ x: p.x, y: p.y }));
    body.unshift({ x: nx, y: ny });
    if (grow > 0) { grow--; prev.push({ x: prev[prev.length - 1].x, y: prev[prev.length - 1].y }); }
    else body.pop();

    if (food && nx === food.x && ny === food.y) eat(demo);
    if (bonus && nx === bonus.x && ny === bonus.y) eatBonus(demo);
    if (!food) food = freeCell();
  }

  function burst(x, y, color, n, power = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Arcade.rand(1, power);
      const life = Arcade.rand(0.35, 0.8);
      particles.push({ x: x + 0.5, y: y + 0.5, z: 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: Arcade.rand(2, 6), life, max: life, color });
    }
  }

  function eat(demo) {
    grow++; eaten++;
    burst(food.x, food.y, Arcade.pick(['#ff3355', '#ff7a7a', '#ffd0d0']), 14);
    const f = food;
    food = null;
    food = freeCell();
    if (demo) return;
    score += 10;
    interval = Math.max(SPEEDS[settings.speed] * 0.55, interval - 1.6);
    popups.push({ x: f.x + 0.5, y: f.y + 0.5, text: '+10', color: '#ff6b81', life: 0.9 });
    Sfx.tone(660, 0.06, 'square', 0.09); Sfx.tone(990, 0.08, 'square', 0.08, null, 0.05);
    if (!bonus && ++sinceBonus >= 5 && Math.random() < 0.7) {
      sinceBonus = 0;
      const c = freeCell();
      if (c) { bonus = { x: c.x, y: c.y, t: BONUS_TIME }; Sfx.tone(1200, 0.25, 'triangle', 0.08, 1800); }
    }
  }

  function eatBonus(demo) {
    burst(bonus.x, bonus.y, '#ffd400', 24, 7);
    const pts = 30 + Math.ceil(bonus.t) * 10;
    if (!demo) {
      score += pts; grow += 2;
      popups.push({ x: bonus.x + 0.5, y: bonus.y + 0.5, text: `★ +${pts}`, color: '#ffd400', life: 1.2 });
      [784, 988, 1175, 1568].forEach((f, i) => Sfx.tone(f, 0.12, 'square', 0.08, null, i * 0.06));
    }
    bonus = null;
  }

  function die() {
    state = 'dying'; deadT = 0;
    prev = body.map(p => ({ x: p.x, y: p.y }));
    queue.length = 0;
    body.forEach((p, i) => { if (i % 2 === 0) burst(p.x, p.y, i === 0 ? '#ff3355' : '#39ff14', 4, 4); });
    Sfx.explode();
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
    setDir(m[0], m[1]);
  });

  // Deslizar o dedo (ou arrastar o mouse) sobre o jogo.
  let swipe = null;
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    e.preventDefault();
  });
  screen.addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.hypot(dx, dy) < 22) return;
    const horiz = Math.abs(dx) > Math.abs(dy);
    if (horiz) setDir(Math.sign(dx), 0);
    else setDir(0, Math.sign(dy));
    swipe.x = e.clientX; swipe.y = e.clientY;
  });
  const endSwipe = e => { if (swipe && e.pointerId === swipe.id) swipe = null; };
  screen.addEventListener('pointerup', endSwipe);
  screen.addEventListener('pointercancel', endSwipe);

  const joy = new VJoy($('joy'));
  let padStart = false, padA = false;
  // Analógico/joystick: vale a direção dominante.
  function stick(x, y, mem) {
    if (Math.hypot(x, y) < 0.5) { mem.dir = ''; return; }
    const d = Math.abs(x) > Math.abs(y) ? [Math.sign(x), 0] : [0, Math.sign(y)];
    const id = d.join();
    if (id !== mem.dir) { mem.dir = id; setDir(d[0], d[1]); }
  }
  const joyMem = { dir: '' }, padMem = { dir: '' };
  function pollInputs() {
    stick(joy.x, joy.y, joyMem);
    const g = Arcade.gamepad(0);
    if (!g) return;
    stick(g.lx, g.ly, padMem);
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'play' || state === 'count')) togglePause(); });

  /* ---------- desenho ---------- */
  // Posição interpolada de cada segmento entre o passo anterior e o atual.
  function positions(a) {
    return body.map((c, i) => {
      const p = prev[i] || c;
      let dx = c.x - p.x, dy = c.y - p.y;
      if (Math.abs(dx) > 1) dx = -Math.sign(dx); // atravessou a borda
      if (Math.abs(dy) > 1) dy = -Math.sign(dy);
      return { x: p.x + dx * a, y: p.y + dy * a };
    });
  }

  const HEAD = [139, 255, 92], TAIL = [13, 122, 51], DEAD = [58, 48, 48];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  function drawApple(x, y) {
    const cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL;
    const s = 1 + 0.07 * Math.sin(time * 6);
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.shadowColor = '#ff2a40'; ctx.shadowBlur = 16;
    const gr = ctx.createRadialGradient(-4, -4, 1, 0, 0, CELL * 0.42);
    gr.addColorStop(0, '#ff8a95'); gr.addColorStop(0.45, '#ff2238'); gr.addColorStop(1, '#a3001a');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 1, CELL * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#6b3a17'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -CELL * 0.26); ctx.lineTo(1.5, -CELL * 0.44); ctx.stroke();
    ctx.fillStyle = '#3bd13b';
    ctx.beginPath(); ctx.ellipse(5, -CELL * 0.38, 5, 2.4, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawStar(b) {
    if (b.t < 2 && Math.floor(time * 8) % 2) return;
    const cx = (b.x + 0.5) * CELL, cy = (b.y + 0.5) * CELL;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,212,0,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, CELL * 0.6, -Math.PI / 2, -Math.PI / 2 + (b.t / BONUS_TIME) * Math.PI * 2); ctx.stroke();
    ctx.rotate(time * 2);
    ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd400';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? CELL * 0.18 : CELL * 0.44, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawSnake(pts) {
    const n = pts.length;
    const dead = deadT >= 0;
    const flash = dead && deadT < 0.25;
    const fade = dead ? Math.min(1, deadT * 2) : 0;
    const C = i => {
      if (flash) return '#ff3355';
      const c = mix(TAIL, HEAD, 1 - i / n);
      return rgb(dead ? mix(c, DEAD, fade) : c);
    };
    const near = (a, b) => Math.abs(a.x - b.x) <= 1.01 && Math.abs(a.y - b.y) <= 1.01;
    const P = p => [(p.x + 0.5) * CELL, (p.y + 0.5) * CELL];

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // brilho embaixo do corpo
    ctx.shadowColor = dead ? '#ff3355' : '#39ff14'; ctx.shadowBlur = 18;
    ctx.strokeStyle = dead ? 'rgba(80,40,40,0.5)' : 'rgba(57,255,20,0.35)';
    ctx.lineWidth = CELL * 0.8;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = P(p);
      if (i === 0 || !near(p, pts[i - 1])) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    // corpo, do rabo para a cabeça
    for (let i = n - 1; i >= 1; i--) {
      const a = pts[i], b = pts[i - 1];
      ctx.strokeStyle = C(i);
      ctx.lineWidth = CELL * (0.56 + 0.2 * (1 - i / n));
      ctx.beginPath();
      const [ax, ay] = P(a);
      ctx.moveTo(ax, ay);
      if (near(a, b)) { const [bx, by] = P(b); ctx.lineTo(bx, by); } else ctx.lineTo(ax + 0.01, ay);
      ctx.stroke();
    }
    // escamas
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 2; i < n; i += 1) {
      const [x, y] = P(pts[i]);
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    // cabeça
    const [hx, hy] = P(pts[0]);
    ctx.translate(hx, hy);
    ctx.rotate(Math.atan2(dir.y, dir.x));
    if (!dead && time % 2.2 < 0.22) {
      ctx.strokeStyle = '#ff2a55'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(CELL * 0.4, 0); ctx.lineTo(CELL * 0.68, 0);
      ctx.lineTo(CELL * 0.78, -4); ctx.moveTo(CELL * 0.68, 0); ctx.lineTo(CELL * 0.78, 4); ctx.stroke();
    }
    ctx.fillStyle = flash ? '#ff3355' : rgb(dead ? mix(HEAD, DEAD, fade) : HEAD);
    ctx.shadowColor = '#39ff14'; ctx.shadowBlur = dead ? 0 : 12;
    ctx.beginPath(); ctx.ellipse(0, 0, CELL * 0.5, CELL * 0.44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(CELL * 0.12, s * CELL * 0.2, CELL * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#050505';
      if (dead) {
        ctx.strokeStyle = '#050505'; ctx.lineWidth = 2;
        const ex = CELL * 0.12, ey = s * CELL * 0.2, r = CELL * 0.08;
        ctx.beginPath(); ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(CELL * 0.17, s * CELL * 0.2, CELL * 0.07, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function draw(alpha) {
    const pts = positions(alpha);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.drawImage(board, 0, 0, W, H);
    if (food) drawApple(food.x, food.y);
    if (bonus) drawStar(bonus);
    drawSnake(pts);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const s = 3 + p.z;
      ctx.fillRect(p.x * CELL - s / 2, p.y * CELL - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(p.text, p.x * CELL, p.y * CELL - (0.9 - p.life) * 30, 16, p.color, Math.min(1, p.life * 2));
    if (state === 'count') {
      const n = Math.ceil(countT / 0.6);
      drawText(String(n), W / 2, H / 2, 96, '#39ff14', 0.4 + (countT % 0.6) / 0.6 * 0.6);
    } else if (goT > 0) {
      drawText('VAI!', W / 2, H / 2, 72, '#39ff14', goT / 0.5);
    }
    if (deadT >= 0 && deadT < 0.4) {
      ctx.fillStyle = `rgba(255,40,70,${0.35 * (1 - deadT / 0.4)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- laço principal ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollInputs();

    if (state !== 'pause') {
      time += dt;
      goT = Math.max(0, goT - dt);
      if (state === 'count') {
        const beat = Math.ceil(countT / 0.6);
        if (beat !== lastBeat) { lastBeat = beat; Sfx.beep(false); }
        countT -= dt;
        if (countT <= 0) { state = 'play'; acc = 0; goT = 0.5; Sfx.beep(true); }
      } else if (state === 'play' || state === 'menu') {
        acc += dt * 1000;
        const iv = state === 'menu' ? 120 : interval;
        while (acc >= iv && (state === 'play' || state === 'menu')) { acc -= iv; step(); }
        if (bonus) { bonus.t -= dt; if (bonus.t <= 0) bonus = null; }
        if (state === 'play') updateHud();
      } else if (state === 'dying' || state === 'over') {
        deadT += dt;
        if (state === 'dying' && deadT > 1.1) gameOver();
      }
      for (const p of particles) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 18 * dt;
        p.vx *= 0.96; p.vy *= 0.96;
        if (p.z < 0) { p.z = 0; p.vz *= -0.4; }
      }
      particles = particles.filter(p => p.life > 0);
      for (const p of popups) p.life -= dt;
      popups = popups.filter(p => p.life > 0);
    }

    const iv = state === 'menu' ? 120 : interval;
    const alpha = state === 'play' || state === 'menu' ? Math.min(1, acc / iv) : state === 'count' ? 0 : 1;
    draw(state === 'dying' || state === 'over' ? 1 : alpha);
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => { if (body) resize(); });
  addEventListener('resize', resize);
  reset();
  resize();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
