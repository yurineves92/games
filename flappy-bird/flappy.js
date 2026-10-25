// Flappy Bird: física em passo fixo, cenário desenhado no canvas e canos infinitos.
(() => {
  const H = 512, GROUND = 400;
  let W = 288;
  const STEP = 1 / 120;
  const GRAV = 1300, FLAP = -360, MAX_FALL = 540;
  const PW = 52, CAP = 24, BX = 80, BR = 11;
  const DIFF = {
    easy: { gap: 132, speed: 110, space: 180 },
    normal: { gap: 108, speed: 125, space: 168 },
    hard: { gap: 96, speed: 142, space: 160 },
  };
  const BIRDS = {
    yellow: { body: '#f8c51c', belly: '#fbe48e', wing: '#fdf6d8' },
    blue: { body: '#4fb3e8', belly: '#b5e2f7', wing: '#e6f6ff' },
    red: { body: '#f0533a', belly: '#f9b1a1', wing: '#fff0ea' },
  };
  const OUTLINE = '#543847';

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };

  const settings = { bird: 'yellow', sky: 'day', diff: 'normal' };
  Arcade.bindSettings(panels.menu, settings, 'flappy_', key => { if (key === 'sky') { night = settings.sky === 'night'; buildBackground(); } });

  /* ---------- cenário ---------- */
  const seeded = s => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const TW = 288;
  let k = 1, night = settings.sky === 'night';
  const bgTile = document.createElement('canvas');

  // Uma faixa de 288 de largura que se repete: céu, nuvens, prédios e arbustos.
  function buildBackground() {
    bgTile.width = Math.ceil(TW * k); bgTile.height = Math.ceil(GROUND * k);
    const g = bgTile.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const rnd = seeded(night ? 77 : 7);
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    if (night) { sky.addColorStop(0, '#071a33'); sky.addColorStop(1, '#16577a'); }
    else { sky.addColorStop(0, '#4ec0ca'); sky.addColorStop(1, '#7fd4dc'); }
    g.fillStyle = sky; g.fillRect(0, 0, TW, GROUND);
    if (night) {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
        const s = rnd() < 0.2 ? 2 : 1;
        g.fillRect((rnd() * TW) | 0, (rnd() * 240) | 0, s, s);
      }
    }
    // Repete nas bordas para a faixa emendar sem costura.
    const wrapDraw = (x, fn) => { fn(x); if (x < 40) fn(x + TW); if (x > TW - 40) fn(x - TW); };
    const circle = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };

    g.fillStyle = night ? '#2c6a88' : '#e9fcd9';
    for (let x = 0; x < TW; x += 18) {
      const r = 14 + rnd() * 16, y = 300 - rnd() * 22;
      wrapDraw(x, xx => circle(xx, y, r));
    }
    g.fillRect(0, 300, TW, 80);

    for (let x = -4; x < TW; ) {
      const bw = 20 + ((rnd() * 18) | 0), bh = 26 + ((rnd() * 44) | 0);
      const top = 372 - bh;
      const draw = xx => {
        g.fillStyle = night ? '#1d4a63' : '#a9e1b9';
        g.fillRect(xx, top, bw, bh);
        g.fillStyle = night ? '#163a4e' : '#93d2a6';
        g.fillRect(xx, top, bw, 3);
        for (let wy = top + 7; wy < 368; wy += 8) {
          for (let wx = xx + 4; wx < xx + bw - 4; wx += 6) {
            g.fillStyle = night ? (rnd() < 0.55 ? '#ffe27a' : '#22556f') : '#c8f0d4';
            g.fillRect(wx, wy, 3, 4);
          }
        }
      };
      wrapDraw(x, draw);
      x += bw - 2;
    }

    g.fillStyle = night ? '#1f6b3a' : '#5ee270';
    for (let x = 0; x < TW; x += 14) {
      const r = 10 + rnd() * 10;
      wrapDraw(x, xx => circle(xx, 384 - rnd() * 6, r));
    }
    g.fillRect(0, 384, TW, 16);
    g.fillStyle = night ? '#184f2c' : '#4fc160';
    for (let x = 0; x < TW; x += 9) wrapDraw(x, xx => circle(xx, 396, 6));
  }

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    W = Math.round(Math.max(288, Math.min(480, (H * w) / Math.max(1, h))));
    k = Arcade.fit(canvas, W, H, wrap);
    buildBackground();
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let bird, pipes, score, bgX = 0, groundX = 0, time = 0, flashT = 0, overT = 0, diff = DIFF.normal;
  let hi = +Arcade.store.get('flappy_hi', 0) || 0;

  function reset() {
    diff = DIFF[settings.diff] || DIFF.normal;
    bird = { y: 236, vy: 0, rot: 0, frame: 0, ft: 0 };
    pipes = []; score = 0; flashT = 0;
    updateHud();
  }

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function start() {
    Sfx.ensure();
    night = settings.sky === 'night' || (settings.sky === 'random' && Math.random() < 0.5);
    buildBackground();
    reset();
    state = 'ready';
    show(null);
    Sfx.tone(520, 0.15, 'sine', 0.08, 900);
  }

  function toMenu() { state = 'menu'; reset(); show('menu'); }

  function togglePause() {
    if (state === 'play' || state === 'ready') { pausedFrom = state; state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
  }

  function flap() {
    if (state === 'ready') state = 'play';
    if (state !== 'play') return;
    bird.vy = FLAP;
    Sfx.noise(0.09, 0.12, 2200, 0, 'bandpass', 500);
    Sfx.tone(420, 0.06, 'triangle', 0.05, 640);
  }

  function crash(onGround) {
    flashT = 0.25;
    Sfx.noise(0.18, 0.4, 3000);
    Sfx.tone(150, 0.2, 'square', 0.1, 70);
    if (onGround) return finish();
    state = 'dying';
    bird.vy = Math.max(bird.vy, 0);
    Sfx.tone(600, 0.45, 'sine', 0.1, 140, 0.15);
  }

  function finish() {
    state = 'over'; overT = 0;
    bird.y = GROUND - BR;
    const rec = score > hi;
    if (rec) { hi = score; Arcade.store.set('flappy_hi', hi); }
    setTimeout(() => {
      if (state !== 'over') return;
      $('overScore').textContent = score;
      $('overBest').textContent = hi;
      $('overRecord').hidden = !rec;
      $('medal').innerHTML = medal(score);
      show('over');
      if (rec && score > 0) Sfx.win();
    }, 550);
    updateHud();
  }

  function medal(s) {
    const tiers = [[40, 'PLATINA', '#e6fbff', '#7cc9dc'], [30, 'OURO', '#ffd84a', '#b88a00'], [20, 'PRATA', '#ececec', '#8e8e8e'], [10, 'BRONZE', '#e09a5c', '#9a5626']];
    const t = tiers.find(m => s >= m[0]);
    if (!t) return '';
    const star = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 6 : 14, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      return `${(32 + Math.cos(a) * r).toFixed(1)},${(32 + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
    return `<svg class="medal" width="72" height="72" viewBox="0 0 64 64" role="img" aria-label="Medalha de ${t[1].toLowerCase()}">
      <circle cx="32" cy="32" r="28" fill="${t[2]}" stroke="${t[3]}" stroke-width="4"/>
      <circle cx="32" cy="32" r="20" fill="none" stroke="${t[3]}" stroke-width="2" opacity=".5"/>
      <polygon points="${star}" fill="#fff" opacity=".85"/></svg>
      <div class="score-col">${t[1]}</div>`;
  }

  function updateHud() {
    $('hScore').textContent = score || 0;
    $('hHi').textContent = hi;
  }

  /* ---------- física ---------- */
  function rectHit(x, y, w, h) {
    const cx = Math.max(x, Math.min(BX, x + w)), cy = Math.max(y, Math.min(bird.y, y + h));
    return Math.hypot(BX - cx, bird.y - cy) < BR;
  }

  function tick(dt) {
    time += dt;
    const scrolling = state === 'menu' || state === 'ready' || state === 'play';
    if (scrolling) {
      groundX = (groundX + diff.speed * dt) % 14;
      bgX = (bgX + diff.speed * 0.15 * dt) % TW;
    }
    // asas
    bird.ft += dt;
    const flapRate = state === 'play' ? 0.07 : 0.12;
    if (bird.ft > flapRate) { bird.ft = 0; bird.frame = (bird.frame + 1) % 4; }

    if (state === 'menu' || state === 'ready') {
      bird.y = 236 + Math.sin(time * 7) * 5;
      bird.rot = 0;
      return;
    }
    if (state === 'play' || state === 'dying') {
      bird.vy = Math.min(MAX_FALL, bird.vy + GRAV * dt);
      bird.y += bird.vy * dt;
      if (bird.vy < 160 && state === 'play') bird.rot = Math.max(-0.45, bird.rot - 10 * dt);
      else bird.rot = Math.min(Math.PI / 2, bird.rot + (state === 'dying' ? 9 : 5.5) * dt);
      if (bird.y < -40) { bird.y = -40; bird.vy = 0; }
      if (bird.y + BR >= GROUND) { if (state === 'play') crash(true); else finish(); return; }
    }
    if (state !== 'play') return;

    for (const p of pipes) p.x -= diff.speed * dt;
    while (pipes.length && pipes[0].x < -PW - 10) pipes.shift();
    const lastP = pipes[pipes.length - 1];
    if (!lastP || lastP.x < W + 40 - diff.space) {
      const lo = 60 + diff.gap / 2, hiY = GROUND - 50 - diff.gap / 2;
      const prevY = lastP ? lastP.gy : (lo + hiY) / 2;
      const gy = Math.max(lo, Math.min(hiY, prevY + Arcade.rand(-150, 150)));
      pipes.push({ x: lastP ? lastP.x + diff.space : W + 40, gy, scored: false });
    }
    for (const p of pipes) {
      if (!p.scored && p.x + PW / 2 < BX) {
        p.scored = true; score++;
        Sfx.tone(988, 0.07, 'square', 0.07); Sfx.tone(1319, 0.14, 'square', 0.07, null, 0.07);
        updateHud();
      }
      const top = p.gy - diff.gap / 2, bot = p.gy + diff.gap / 2;
      if (rectHit(p.x, -200, PW, top + 200) || rectHit(p.x, bot, PW, GROUND - bot)) { crash(false); break; }
    }
  }

  /* ---------- desenho ---------- */
  let pipeGrad = null;
  function drawPipe(x, y1, y2, capAtTop) {
    if (!pipeGrad) {
      pipeGrad = ctx.createLinearGradient(-3, 0, PW + 3, 0);
      pipeGrad.addColorStop(0, '#5f9e2a'); pipeGrad.addColorStop(0.12, '#9ce659'); pipeGrad.addColorStop(0.3, '#8bd64c');
      pipeGrad.addColorStop(0.7, '#73bf2e'); pipeGrad.addColorStop(1, '#4f7d20');
    }
    ctx.save();
    ctx.translate(Math.round(x), 0);
    ctx.fillStyle = pipeGrad; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
    ctx.fillRect(0, y1, PW, y2 - y1); ctx.strokeRect(0, y1, PW, y2 - y1);
    const cy = capAtTop ? y1 : y2 - CAP;
    ctx.fillRect(-3, cy, PW + 6, CAP); ctx.strokeRect(-3, cy, PW + 6, CAP);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(4, y1 + (capAtTop ? CAP : 0), 4, y2 - y1 - CAP);
    ctx.fillRect(1, cy + 3, 4, CAP - 6);
    ctx.restore();
  }

  function drawGround() {
    ctx.fillStyle = '#ded895'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = OUTLINE; ctx.fillRect(0, GROUND, W, 2);
    ctx.fillStyle = '#73bf2e'; ctx.fillRect(0, GROUND + 2, W, 12);
    ctx.fillStyle = '#9ce659';
    for (let x = -groundX - 14; x < W + 14; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND + 14); ctx.lineTo(x + 7, GROUND + 2); ctx.lineTo(x + 14, GROUND + 2); ctx.lineTo(x + 7, GROUND + 14);
      ctx.fill();
    }
    ctx.fillStyle = '#558022'; ctx.fillRect(0, GROUND + 14, W, 3);
    ctx.fillStyle = '#d0c874'; ctx.fillRect(0, GROUND + 17, W, 4);
  }

  function ellipse(x, y, rx, ry, fill, stroke = true) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawBird() {
    const c = BIRDS[settings.bird] || BIRDS.yellow;
    ctx.save();
    ctx.translate(BX, bird.y);
    ctx.rotate(bird.rot);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
    ellipse(0, 0, 17, 12.5, c.body);
    ellipse(-1, 5.5, 10, 5, c.belly, false);
    ellipse(7, -4.5, 6, 6, '#fff');
    ctx.fillStyle = '#111'; ctx.fillRect(8.5, -6.5, 3, 5);
    ellipse(13.5, 1.5, 8, 3.2, '#f0612b');
    ellipse(12.5, 5.5, 6.5, 2.6, '#e04a1e');
    const wy = [-4, 0, 4, 0][state === 'dying' || state === 'over' ? 1 : bird.frame];
    ctx.save(); ctx.translate(-8, wy); ctx.rotate(wy * -0.06);
    ellipse(0, 0, 8.5, 5.5, c.wing);
    ctx.restore();
    ctx.restore();
  }

  function bigText(text, x, y, size, color = '#fff') {
    ctx.save();
    ctx.font = `900 ${size}px 'Arial Black', 'Segoe UI Black', Impact, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = size / 5; ctx.strokeStyle = OUTLINE;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    for (let x = -bgX; x < W; x += TW) ctx.drawImage(bgTile, Math.floor(x), 0, TW + 0.5, GROUND);
    if (night) {
      ctx.fillStyle = '#fdf6c8';
      ctx.beginPath(); ctx.arc(W * 0.74, 72, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a2140';
      ctx.beginPath(); ctx.arc(W * 0.74 + 7, 66, 14, 0, Math.PI * 2); ctx.fill();
    }
    for (const p of pipes) {
      drawPipe(p.x, -10, p.gy - diff.gap / 2, false);
      drawPipe(p.x, p.gy + diff.gap / 2, GROUND, true);
    }
    drawGround();
    drawBird();

    if (state === 'play' || state === 'dying') bigText(String(score), W / 2, 62, 40);
    if (state === 'ready') {
      bigText('PREPARE-SE', W / 2, 120, 26, '#f8c51c');
      ctx.save();
      ctx.globalAlpha = 0.85 + Math.sin(time * 6) * 0.15;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(BX + 60, 222); ctx.lineTo(BX + 72, 206); ctx.lineTo(BX + 84, 222); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(BX + 67, 222, 10, 22); ctx.strokeRect(BX + 67, 222, 10, 22);
      ctx.restore();
      bigText('TOQUE PARA VOAR', W / 2, 300, 14);
    }
    if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT * 3})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- entrada ---------- */
  screen.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sfx.ensure();
    flap();
  });
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    const flapKey = key === ' ' || key === 'arrowup' || key === 'w';
    if (flapKey || key === 'arrowdown') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    if (e.repeat) return;
    const onButton = e.target.closest && e.target.closest('button');
    if ((state === 'menu' || (state === 'over' && overT > 0.6)) && (flapKey || key === 'enter') && !onButton) { start(); return; }
    if (flapKey) flap();
  });
  let padA = false, padStart = false;
  function pollPad() {
    const g = Arcade.gamepad(0);
    if (!g) return;
    const a = g.a || g.rt || g.ly < -0.6;
    if (a && !padA) {
      if (state === 'menu' || (state === 'over' && overT > 0.6)) start(); else flap();
    }
    if (g.start && !padStart) togglePause();
    padA = a; padStart = g.start;
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'play' || state === 'ready')) togglePause(); });

  /* ---------- laço principal ---------- */
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pollPad();
    if (state !== 'pause') {
      acc += dt;
      while (acc >= STEP) { tick(STEP); acc -= STEP; }
      flashT = Math.max(0, flashT - dt);
      if (state === 'over') overT += dt;
    }
    draw();
    requestAnimationFrame(frame);
  }

  Arcade.bindMute($('muteBtn'));
  addEventListener('resize', resize);
  resize();
  reset();
  show('menu');
  requestAnimationFrame(frame);
})();
