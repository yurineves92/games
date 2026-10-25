// Campo Minado: Windows 95 reimaginado em neon. Tudo desenhado no canvas, inclusive o painel com a carinha.
(() => {
  const CELL = 24, PAD = 10, HEAD_H = 44, GAP = 8;
  const DIFFS = {
    iniciante: { rows: 9, cols: 9, mines: 10, name: 'Iniciante' },
    intermediario: { rows: 16, cols: 16, mines: 40, name: 'Intermediário' },
    expert: { rows: 16, cols: 30, mines: 99, name: 'Expert' },
  };
  const NUM_COLORS = ['', '#4da3ff', '#39ff14', '#ff3b5c', '#b04bff', '#ff8c1a', '#00e5ff', '#ff2bd6', '#e8e8ff'];
  const LONG_PRESS = 0.4;

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap');
  const overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { mines: $('hMines'), time: $('hTime'), best: $('hBest'), status: $('hStatus') };
  const modeBtn = $('modeBtn'), xrayBtn = $('xrayBtn');

  /* ---------- configurações ---------- */
  const settings = { diff: 'iniciante' };
  Arcade.bindSettings(panels.menu, settings, 'campo-minado_', () => { if (state === 'menu') { newDemo(); resize(); updateHud(); } });
  const codes = Arcade.codes('campo-minado', {
    KONAMI: 'O primeiro clique abre uma área enorme',
    RAIOX: 'Mostra as minas por 2 segundos, uma vez por partida (tecla X ou botão 👁)',
    SORTE: 'A primeira mina que você pisar é perdoada',
  }, $('codeMount'), () => { updateHud(); syncButtons(); });

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let R = 9, C = 9, M = 10, W = 0, H = 0;
  let mine, open, mark, count, openAt, boomAt;
  let opened = 0, flags = 0, elapsed = 0, firstDone = false, luckUsed = false, xrayUsed = false, xrayT = 0;
  let face = 'smile', facePressed = false, cursor = null, hover = -1, pressed = null;
  let particles = [], popups = [], time = 0, endT = 0, hit = -1, demoT = 0, lastBoom = 0;
  let touchMode = 'open';
  let lp = null; // toque longo em andamento

  const best = d => ({
    score: +Arcade.store.get('campo-minado_hi_' + d, 0) || 0,
    time: +Arcade.store.get('campo-minado_tempo_' + d, 0) || 0,
  });

  /* ---------- tabuleiro ---------- */
  // Em tela retrato o Expert fica de pé (30 linhas x 16 colunas) para caber.
  function dims() {
    const d = DIFFS[settings.diff] || DIFFS.iniciante;
    const { w, h } = Arcade.innerSize(wrap);
    if (settings.diff === 'expert' && h > w) return { rows: d.cols, cols: d.rows, mines: d.mines };
    return { rows: d.rows, cols: d.cols, mines: d.mines };
  }
  function setup() {
    const d = dims();
    R = d.rows; C = d.cols; M = d.mines;
    W = PAD * 2 + C * CELL;
    H = PAD + HEAD_H + GAP + R * CELL + PAD;
    const n = R * C;
    mine = new Uint8Array(n); open = new Uint8Array(n); mark = new Uint8Array(n); count = new Uint8Array(n);
    openAt = new Float32Array(n); boomAt = new Float32Array(n).fill(-1);
    opened = 0; flags = 0; elapsed = 0; firstDone = false; luckUsed = false; xrayUsed = false; xrayT = 0;
    face = 'smile'; hit = -1; pressed = null; particles = []; popups = [];
    if (cursor) cursor = { r: Math.min(cursor.r, R - 1), c: Math.min(cursor.c, C - 1) };
  }
  const BX = PAD, BY = PAD + HEAD_H + GAP;
  const idx = (r, c) => r * C + c;
  function neighbors(i) {
    const r = (i / C) | 0, c = i % C, out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < R && cc >= 0 && cc < C) out.push(rr * C + cc);
      }
    }
    return out;
  }
  // Espalha as minas longe do primeiro clique. KONAMI reserva um círculo grande em volta.
  function placeMines(first) {
    const fr = (first / C) | 0, fc = first % C;
    const radius = codes.has('KONAMI') ? 3.3 : 1.5;
    const pool = [];
    for (let i = 0; i < R * C; i++) {
      const r = (i / C) | 0, c = i % C;
      if (Math.hypot(r - fr, c - fc) > radius) pool.push(i);
    }
    // se não couber (não acontece nas dificuldades atuais), libera só a casa do clique
    if (pool.length < M) { pool.length = 0; for (let i = 0; i < R * C; i++) if (i !== first) pool.push(i); }
    for (let k = 0; k < M; k++) {
      const j = k + ((Math.random() * (pool.length - k)) | 0);
      [pool[k], pool[j]] = [pool[j], pool[k]];
      mine[pool[k]] = 1;
    }
    for (let i = 0; i < R * C; i++) count[i] = neighbors(i).reduce((s, j) => s + mine[j], 0);
  }

  // Abre uma casa; se for zero, abre em cascata (com animação em onda a partir do clique).
  function reveal(start) {
    if (open[start] || mark[start] === 1) return 0;
    if (mine[start]) { stepOnMine(start); return 0; }
    const q = [start], dist = new Map([[start, 0]]);
    let n = 0;
    while (q.length) {
      const i = q.shift();
      if (open[i] || mark[i] === 1 || mine[i]) continue;
      open[i] = 1; opened++; n++;
      if (mark[i] === 2) mark[i] = 0;
      openAt[i] = time + dist.get(i) * 0.018;
      if (count[i] === 0) {
        for (const j of neighbors(i)) {
          if (!open[j] && !dist.has(j)) { dist.set(j, dist.get(i) + 1); q.push(j); }
        }
      }
    }
    return n;
  }

  function stepOnMine(i) {
    if (codes.has('SORTE') && !luckUsed && state === 'play') {
      // SORTE: a primeira mina vira bandeira e a partida segue
      luckUsed = true;
      mark[i] = 1; flags++;
      const { x, y } = cellCenter(i);
      popups.push({ x, y: y - 10, text: 'UFA! SORTE!', color: '#ffe600', life: 1.6, size: 13 });
      burst(x, y, '#ffe600', 24, 140);
      [880, 660, 880, 1320].forEach((f, k) => Sfx.tone(f, 0.1, 'triangle', 0.08, null, k * 0.08));
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
      return;
    }
    lose(i);
  }

  function clickOpen(i) {
    if (state === 'ready') {
      placeMines(i); firstDone = true;
      state = 'play';
    }
    if (state !== 'play') return;
    if (open[i]) { chord(i); return; }
    if (mark[i] === 1) return;
    const n = reveal(i);
    if (n > 0) {
      if (n > 1) Sfx.tone(300, 0.16, 'triangle', 0.08, 900); else Sfx.tone(700, 0.04, 'square', 0.05, 900);
      if (n > 25) popups.push({ ...cellCenter(i), text: `+${n}`, color: '#8aa0ff', life: 1, size: 12 });
    }
    checkWin();
  }

  // Chording: número com bandeiras suficientes em volta abre os vizinhos restantes.
  function chord(i) {
    if (!open[i] || !count[i] || state !== 'play') return;
    const nb = neighbors(i);
    const fl = nb.reduce((s, j) => s + (mark[j] === 1 ? 1 : 0), 0);
    if (fl !== count[i]) { Sfx.tone(160, 0.06, 'square', 0.04); return; }
    let n = 0;
    for (const j of nb) {
      if (open[j] || mark[j] === 1) continue;
      if (mine[j]) { stepOnMine(j); if (state !== 'play') return; continue; }
      n += reveal(j);
    }
    if (n) Sfx.tone(420, 0.1, 'triangle', 0.07, 980);
    checkWin();
  }

  function toggleMark(i) {
    if (state !== 'play' && state !== 'ready') return;
    if (open[i]) return;
    // bandeira → ? → nada
    if (mark[i] === 0) { mark[i] = 1; flags++; Sfx.tone(980, 0.05, 'square', 0.05, 1400); }
    else if (mark[i] === 1) { mark[i] = 2; flags--; Sfx.tone(620, 0.05, 'square', 0.04); }
    else { mark[i] = 0; Sfx.tone(400, 0.04, 'square', 0.03); }
    updateHud();
  }

  function checkWin() {
    if (state !== 'play' || opened !== R * C - M) return;
    state = 'won'; endT = 0; face = 'cool';
    for (let i = 0; i < R * C; i++) if (mine[i] && mark[i] !== 1) { mark[i] = 1; flags++; }
    for (let k = 0; k < 70; k++) burst(Math.random() * W, BY + Math.random() * R * CELL, Arcade.pick(['#8aa0ff', '#39ff14', '#ffe600', '#ff2bd6', '#00e5ff']), 1, 160, 4);
    Sfx.win();
    updateHud();
  }

  function lose(i) {
    state = 'lost'; endT = 0; face = 'dead'; hit = i;
    const hr = (i / C) | 0, hc = i % C;
    for (let j = 0; j < R * C; j++) {
      if (!mine[j]) continue;
      boomAt[j] = j === i ? time : time + 0.25 + Math.hypot(((j / C) | 0) - hr, (j % C) - hc) * 0.05;
    }
    lastBoom = 0;
    Sfx.explode();
    if (navigator.vibrate) navigator.vibrate(200);
    const { x, y } = cellCenter(i);
    burst(x, y, '#ff3b5c', 40, 220, 4); burst(x, y, '#ffe600', 20, 160, 3);
    updateHud();
  }

  function score() { return Math.max(1, Math.round((M * 1000) / Math.max(elapsed, 0.001))); }

  function finish(won) {
    state = 'over';
    const d = settings.diff, cheated = codes.any();
    const b = best(d);
    const sc = won ? score() : 0;
    const rec = won && !cheated && sc > b.score;
    if (won && !cheated) {
      if (rec) Arcade.store.set('campo-minado_hi_' + d, sc);
      if (!b.time || elapsed < b.time) Arcade.store.set('campo-minado_tempo_' + d, elapsed.toFixed(2));
    }
    Ranking.gameOver($('rankBox'), { board: 'campo-minado-' + d, score: sc, cheated });
    $('overTitle').textContent = won ? 'CAMPO LIMPO!' : 'BUM!';
    $('overScore').textContent = won ? sc : '0';
    const t = fmt(elapsed);
    const nb = best(d);
    $('overInfo').textContent = won
      ? `${DIFFS[d].name} · tempo ${t} s · ${M} minas` + (nb.time ? ` · melhor tempo ${fmt(nb.time)} s` : '')
      : `Você pisou numa mina aos ${t} s. Faltavam ${R * C - M - opened} casas.`;
    $('overRecord').hidden = !rec;
    show('over');
    updateHud();
  }
  const fmt = s => s.toFixed(1).replace('.', ',');

  /* ---------- telas ---------- */
  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }
  function newGame() {
    Sfx.ensure();
    setup(); resize();
    state = 'ready';
    show(null);
    syncButtons();
    updateHud();
  }
  function toMenu() {
    state = 'menu';
    newDemo(); resize();
    show('menu');
    syncButtons();
    updateHud();
  }
  function togglePause() {
    if (state === 'play' || state === 'ready') { pausedFrom = state; state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
    else if (state === 'over' && overlay.hidden) show('over'); // volta ao placar depois de "VER CAMPO"
  }
  function updateHud() {
    const demo = state === 'menu';
    hud.mines.textContent = demo ? DIFFS[settings.diff].mines : M - flags;
    hud.time.textContent = demo ? '0' : Math.floor(elapsed);
    const b = best(settings.diff);
    hud.best.textContent = b.time ? fmt(b.time) + ' s' : '—';
    const tags = [];
    if (codes.has('KONAMI')) tags.push('KONAMI');
    if (codes.has('SORTE')) tags.push(luckUsed && !demo ? 'SORTE (usada)' : 'SORTE');
    if (codes.has('RAIOX')) tags.push(xrayUsed && !demo ? 'RAIO-X (usado)' : 'RAIO-X');
    hud.status.textContent = tags.join(' · ');
  }
  function syncButtons() {
    modeBtn.textContent = touchMode === 'flag' ? '🚩' : '⛏';
    modeBtn.setAttribute('aria-pressed', touchMode === 'flag' ? 'true' : 'false');
    modeBtn.title = touchMode === 'flag' ? 'Toque marca bandeira (clique para abrir casas)' : 'Toque abre casas (clique para marcar bandeiras)';
    xrayBtn.hidden = !codes.has('RAIOX');
    xrayBtn.disabled = xrayUsed || state !== 'play';
  }
  function xray() {
    if (!codes.has('RAIOX') || xrayUsed) return;
    if (state !== 'play') { if (state === 'ready') popups.push({ x: W / 2, y: BY + 20, text: 'ABRA UMA CASA ANTES', color: '#8aa0ff', life: 1.4, size: 11 }); return; }
    xrayUsed = true; xrayT = 2;
    Sfx.tone(200, 0.6, 'sawtooth', 0.06, 2400);
    syncButtons(); updateHud();
  }

  /* ---------- demonstração atrás do menu ---------- */
  let demo = null;
  function newDemo() {
    setup();
    placeMines(idx(R >> 1, C >> 1));
    demo = { wait: 0.6, done: 0 };
  }
  function demoStep() {
    // o "robô" sabe onde estão as minas: abre casas seguras na beirada da área aberta e marca algumas minas
    const frontier = [];
    for (let i = 0; i < R * C; i++) {
      if (open[i] || mark[i]) continue;
      if (opened === 0 || neighbors(i).some(j => open[j])) frontier.push(i);
    }
    if (!frontier.length) return false;
    const i = Arcade.pick(frontier);
    if (mine[i]) { mark[i] = 1; flags++; } else if (opened === 0) reveal(idx(R >> 1, C >> 1)); else reveal(i);
    return opened < R * C - M;
  }

  /* ---------- tela ---------- */
  let k = 1;
  function resize() {
    if (state === 'menu' || state === 'ready') {
      const d = dims();
      if (d.rows !== R || d.cols !== C) { if (state === 'menu') newDemo(); else setup(); }
    }
    k = Arcade.fit(canvas, W, H, wrap);
  }
  function cellAt(lx, ly) {
    const c = Math.floor((lx - BX) / CELL), r = Math.floor((ly - BY) / CELL);
    if (r < 0 || r >= R || c < 0 || c >= C) return -1;
    return idx(r, c);
  }
  function cellCenter(i) { return { x: BX + (i % C) * CELL + CELL / 2, y: BY + ((i / C) | 0) * CELL + CELL / 2 }; }
  const FACE = () => ({ x: W / 2 - 18, y: PAD + 4, w: 36, h: 36 });
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  const inFace = p => { const f = FACE(); return p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h; };

  /* ---------- entrada: mouse e toque ---------- */
  let mouse = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    const p = toLogical(e);
    if (inFace(p)) { facePressed = true; mouse = { face: true, id: e.pointerId }; return; }
    if (state !== 'ready' && state !== 'play') return;
    const i = cellAt(p.x, p.y);
    if (i < 0) return;
    cursor = null;
    if (e.pointerType === 'mouse') {
      if (e.button === 2 && !(e.buttons & 1)) { toggleMark(i); mouse = { id: e.pointerId, right: true }; return; }
      const both = (e.buttons & 3) === 3 || e.button === 1;
      mouse = { id: e.pointerId, chord: both };
      pressed = i;
    } else {
      // toque: segurar 400 ms marca bandeira
      mouse = { id: e.pointerId, touch: true, x: e.clientX, y: e.clientY };
      lp = { i, t: 0, done: false, id: e.pointerId };
      pressed = i;
    }
  });
  canvas.addEventListener('pointermove', e => {
    const p = toLogical(e);
    if (e.pointerType === 'mouse') hover = cellAt(p.x, p.y);
    if (!mouse || e.pointerId !== mouse.id) return;
    if (mouse.face) { facePressed = inFace(p); return; }
    if (mouse.touch) {
      if (Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y) > 12) { lp = null; pressed = null; mouse.cancel = true; }
      return;
    }
    if (!mouse.right) {
      pressed = cellAt(p.x, p.y);
      if ((e.buttons & 3) === 3) mouse.chord = true;
    }
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; });
  function release(e, cancel) {
    if (!mouse || e.pointerId !== mouse.id) return;
    const m = mouse; mouse = null;
    const p = toLogical(e);
    if (m.face) {
      facePressed = false;
      if (!cancel && inFace(p)) { Sfx.tone(520, 0.06, 'square', 0.06); newGame(); }
      return;
    }
    const i = pressed; pressed = null;
    if (cancel || m.right || m.cancel || i === null || i < 0) { lp = null; return; }
    if (m.touch) {
      const done = lp && lp.done; lp = null;
      if (done) return;
      if (touchMode === 'flag' && !open[i]) toggleMark(i); else clickOpen(i);
      return;
    }
    if (m.chord) { if (state === 'play') chord(i); return; }
    clickOpen(i);
  }
  canvas.addEventListener('pointerup', e => release(e, false));
  canvas.addEventListener('pointercancel', e => release(e, true));

  modeBtn.addEventListener('click', () => {
    touchMode = touchMode === 'flag' ? 'open' : 'flag';
    Sfx.tone(touchMode === 'flag' ? 980 : 520, 0.06, 'square', 0.05);
    syncButtons(); modeBtn.blur();
  });
  xrayBtn.addEventListener('click', () => { xray(); xrayBtn.blur(); });

  /* ---------- entrada: teclado e controle ---------- */
  function moveCursor(dr, dc) {
    if (!cursor) cursor = { r: R >> 1, c: C >> 1 };
    else cursor = { r: (cursor.r + dr + R) % R, c: (cursor.c + dc + C) % C };
    Sfx.tone(1200, 0.015, 'square', 0.02);
  }
  const cursorIdx = () => (cursor ? idx(cursor.r, cursor.c) : -1);
  function actOpen() {
    if (!cursor) { moveCursor(0, 0); return; }
    if (state === 'won' || state === 'lost') return;
    clickOpen(cursorIdx());
  }
  function actFlag() { if (cursor) toggleMark(cursorIdx()); else moveCursor(0, 0); }

  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    if (state === 'menu') {
      if ((key === 'enter' || key === ' ') && !(e.target.closest && e.target.closest('button'))) newGame();
      return;
    }
    if (state === 'over') {
      if ((key === 'enter' || key === ' ') && !(e.target.closest && e.target.closest('button'))) newGame();
      return;
    }
    if (key === 'f2' || key === 'n') { e.preventDefault(); newGame(); return; }
    if (state !== 'ready' && state !== 'play') return;
    const mv = { arrowup: [-1, 0], w: [-1, 0], arrowdown: [1, 0], s: [1, 0], arrowleft: [0, -1], a: [0, -1], arrowright: [0, 1], d: [0, 1] }[key];
    if (mv) { moveCursor(mv[0], mv[1]); return; }
    if (key === ' ' || key === 'enter') actOpen();
    else if (key === 'f') actFlag();
    else if (key === 'x') xray();
  });

  let padPrev = {}, padHold = 0, padRep = 0;
  function pollInputs(dt) {
    const g = Arcade.gamepad(0);
    if (!g) return;
    const edge = n => g[n] && !padPrev[n];
    let dr = 0, dc = 0;
    if (Math.abs(g.ly) > 0.5) dr = Math.sign(g.ly);
    if (Math.abs(g.lx) > 0.5) dc = Math.sign(g.lx);
    const dirKey = `${dr},${dc}`;
    if (dr || dc) {
      if (dirKey !== padPrev.dir) { padHold = 0; padRep = 0; if (state === 'ready' || state === 'play') moveCursor(dr, dc); }
      else {
        padHold += dt;
        if (padHold > 0.35) { padRep -= dt; if (padRep <= 0) { padRep = 0.08; if (state === 'ready' || state === 'play') moveCursor(dr, dc); } }
      }
    }
    if (edge('start')) togglePause();
    if (edge('a')) {
      if (state === 'menu' || state === 'over' || state === 'won' || state === 'lost') newGame();
      else if (state === 'ready' || state === 'play') actOpen();
    }
    if (edge('x') || edge('b')) { if (state === 'ready' || state === 'play') actFlag(); }
    if (edge('y')) xray();
    padPrev = { ...g, dir: dr || dc ? dirKey : '' };
  }

  overlay.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'start') newGame();
    else if (a === 'resume') togglePause();
    else if (a === 'menu') toMenu();
    else if (a === 'view') show(null);
    b.blur();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'play' || state === 'ready')) togglePause(); });

  /* ---------- desenho ---------- */
  function burst(x, y, color, n, power = 120, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Arcade.rand(power * 0.25, power);
      const life = Arcade.rand(0.4, 1);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * Arcade.rand(0.6, 1.3) });
    }
  }
  function drawText(text, x, y, size, color, alpha = 1, glow = 12) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = glow;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }
  // Moldura em relevo estilo Windows 95 (raised = saltada, senão afundada).
  function bevel(x, y, w, h, raised, t = 3, fill = null) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    const lt = raised ? 'rgba(170,185,255,0.75)' : 'rgba(5,3,15,0.9)';
    const dk = raised ? 'rgba(5,3,15,0.9)' : 'rgba(170,185,255,0.45)';
    ctx.fillStyle = lt;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - t, y + t); ctx.lineTo(x + t, y + t); ctx.lineTo(x + t, y + h - t); ctx.lineTo(x, y + h); ctx.fill();
    ctx.fillStyle = dk;
    ctx.beginPath(); ctx.moveTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x + t, y + h - t); ctx.lineTo(x + w - t, y + h - t); ctx.lineTo(x + w - t, y + t); ctx.lineTo(x + w, y); ctx.fill();
  }

  // Display de 7 segmentos. Segmentos: a (topo), b, c, d, e, f, g (meio).
  const SEG = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
  };
  function draw7(x, y, w, h, ch, color) {
    const t = Math.max(2, w * 0.18), on = SEG[ch] || '';
    const seg = {
      a: [x + t * 0.6, y, w - t * 1.2, t, true], d: [x + t * 0.6, y + h - t, w - t * 1.2, t, true], g: [x + t * 0.6, y + h / 2 - t / 2, w - t * 1.2, t, true],
      f: [x, y + t * 0.6, t, h / 2 - t * 0.9, false], b: [x + w - t, y + t * 0.6, t, h / 2 - t * 0.9, false],
      e: [x, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9, false], c: [x + w - t, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9, false],
    };
    for (const [s, [sx, sy, sw, sh, horiz]] of Object.entries(seg)) {
      const lit = on.includes(s);
      ctx.fillStyle = lit ? color : 'rgba(255,43,92,0.08)';
      ctx.shadowColor = color; ctx.shadowBlur = lit ? 8 : 0;
      ctx.beginPath();
      if (horiz) { ctx.moveTo(sx, sy + sh / 2); ctx.lineTo(sx + sh / 2, sy); ctx.lineTo(sx + sw - sh / 2, sy); ctx.lineTo(sx + sw, sy + sh / 2); ctx.lineTo(sx + sw - sh / 2, sy + sh); ctx.lineTo(sx + sh / 2, sy + sh); }
      else { ctx.moveTo(sx + sw / 2, sy); ctx.lineTo(sx + sw, sy + sw / 2); ctx.lineTo(sx + sw, sy + sh - sw / 2); ctx.lineTo(sx + sw / 2, sy + sh); ctx.lineTo(sx, sy + sh - sw / 2); ctx.lineTo(sx, sy + sw / 2); }
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  function drawLed(x, y, value) {
    const v = Math.max(-99, Math.min(999, value | 0));
    const s = v < 0 ? '-' + String(-v).padStart(2, '0') : String(v).padStart(3, '0');
    bevel(x, y, 54, 34, false, 2, '#050208');
    for (let i = 0; i < 3; i++) draw7(x + 5 + i * 16, y + 5, 12, 24, s[i], '#ff2b5c');
  }

  function drawFlag(cx, cy, s = 1) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.fillStyle = '#d8d8ff';
    ctx.fillRect(-1, -8, 2, 15);
    ctx.fillRect(-6, 6, 12, 2.5);
    ctx.fillStyle = '#ff2b4a'; ctx.shadowColor = '#ff2b4a'; ctx.shadowBlur = 10;
    const wv = Math.sin(time * 6 + cx) * 1.2;
    ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(8, -4.5 + wv * 0.4); ctx.lineTo(1, -1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawMine(cx, cy, s = 1) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s, s);
    ctx.strokeStyle = '#c9ccff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9); ctx.stroke();
    }
    ctx.fillStyle = '#14122a'; ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(-3, -3, 2.2, 2.2);
    ctx.restore();
  }

  function drawFace() {
    const f = FACE();
    const down = facePressed;
    bevel(f.x, f.y, f.w, f.h, !down, 3, down ? '#141033' : '#1d1846');
    const st = state === 'pause' ? pausedFrom : state;
    let emoji = '😀';
    if (face === 'cool') emoji = '😎';
    else if (face === 'dead') emoji = '😵';
    else if (pressed !== null && pressed >= 0 && (st === 'play' || st === 'ready')) emoji = '😮';
    ctx.save();
    ctx.font = '22px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, f.x + f.w / 2 + (down ? 1 : 0), f.y + f.h / 2 + 1 + (down ? 1 : 0));
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // fundo do "programa"
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#16123a'); g.addColorStop(1, '#0c0a24');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    bevel(0, 0, W, H, true, 3);
    // painel de cima
    bevel(PAD - 2, PAD - 2, W - PAD * 2 + 4, HEAD_H + 2, false, 2, '#0f0c2a');
    const st = state === 'pause' ? pausedFrom : state;
    const demoMode = st === 'menu';
    drawLed(PAD + 5, PAD + 5, demoMode ? M : M - flags);
    drawLed(W - PAD - 59, PAD + 5, demoMode ? 0 : Math.floor(elapsed));
    drawFace();
    // tabuleiro
    bevel(BX - 3, BY - 3, C * CELL + 6, R * CELL + 6, false, 3, '#0a0818');
    if (state === 'pause') {
      ctx.fillStyle = '#0a0818'; ctx.fillRect(BX, BY, C * CELL, R * CELL);
      drawText('PAUSADO', W / 2, BY + (R * CELL) / 2, 18, '#8aa0ff');
    } else drawBoard(st);
    // cursor do teclado/controle
    if (cursor && (st === 'ready' || st === 'play')) {
      const x = BX + cursor.c * CELL, y = BY + cursor.r * CELL;
      ctx.save();
      ctx.strokeStyle = '#ffe600'; ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 10; ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]); ctx.lineDashOffset = -time * 20;
      ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      ctx.restore();
    }
    // anel do toque longo
    if (lp && !lp.done && lp.t > 0.08) {
      const { x, y } = cellCenter(lp.i);
      ctx.save();
      ctx.strokeStyle = '#ff2b4a'; ctx.shadowColor = '#ff2b4a'; ctx.shadowBlur = 8; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, lp.t / LONG_PRESS)); ctx.stroke();
      ctx.restore();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(p.text, p.x, p.y - (1 - Math.min(1, p.life)) * 18, p.size, p.color, Math.min(1, p.life * 2));
    if (xrayT > 0) {
      ctx.fillStyle = `rgba(0,229,255,${0.05 + 0.04 * Math.sin(time * 20)})`;
      ctx.fillRect(BX, BY, C * CELL, R * CELL);
      drawText(`RAIO-X ${xrayT.toFixed(1)}`, W / 2, BY + 12, 10, '#00e5ff');
    }
  }

  function drawBoard(st) {
    const showMines = st === 'lost' || st === 'over' || xrayT > 0;
    const pressing = (st === 'play' || st === 'ready') && pressed !== null && pressed >= 0;
    const pressSet = new Set();
    if (pressing) {
      if (open[pressed] || (mouse && mouse.chord)) for (const j of neighbors(pressed)) { if (!open[j] && mark[j] !== 1) pressSet.add(j); }
      else if (mark[pressed] !== 1) pressSet.add(pressed);
    }
    for (let i = 0; i < R * C; i++) {
      const x = BX + (i % C) * CELL, y = BY + ((i / C) | 0) * CELL;
      const visOpen = open[i] && time >= openAt[i];
      if (visOpen || pressSet.has(i)) {
        ctx.fillStyle = i === hit ? '#8a0f2a' : '#0d0b22';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = 'rgba(138,160,255,0.16)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        if (visOpen && count[i]) {
          const pop = Math.min(1, (time - openAt[i]) / 0.15);
          drawText(String(count[i]), x + CELL / 2, y + CELL / 2 + 1, Math.round(CELL * 0.6 * (0.6 + 0.4 * pop)), NUM_COLORS[count[i]], 1, 8);
        }
      } else {
        const hov = i === hover && (st === 'play' || st === 'ready') && !mark[i];
        bevel(x, y, CELL, CELL, true, 3, hov ? '#2a2466' : '#1d1846');
        if (mark[i] === 1) drawFlag(x + CELL / 2, y + CELL / 2 + 1);
        else if (mark[i] === 2) drawText('?', x + CELL / 2, y + CELL / 2 + 1, 13, '#8aa0ff', 1, 8);
      }
      if (showMines && mine[i] && mark[i] !== 1) {
        const lost = st === 'lost' || st === 'over';
        if (!lost || boomAt[i] < 0 || time >= boomAt[i]) {
          if (xrayT > 0 && !lost) ctx.globalAlpha = 0.85;
          drawMine(x + CELL / 2, y + CELL / 2);
          ctx.globalAlpha = 1;
        }
      }
      // bandeira errada no fim: mina riscada
      if ((st === 'lost' || st === 'over') && hit >= 0 && mark[i] === 1 && !mine[i]) {
        ctx.save(); ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + CELL - 4, y + CELL - 4); ctx.moveTo(x + CELL - 4, y + 4); ctx.lineTo(x + 4, y + CELL - 4); ctx.stroke(); ctx.restore();
      }
    }
  }

  /* ---------- laço principal ---------- */
  function update(dt) {
    time += dt;
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.vx *= 0.97; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) p.life -= dt;
    popups = popups.filter(p => p.life > 0);
    if (xrayT > 0) { xrayT -= dt; if (xrayT <= 0) { xrayT = 0; syncButtons(); } }
    if (lp && !lp.done) {
      lp.t += dt;
      if (lp.t >= LONG_PRESS) {
        lp.done = true; pressed = null;
        if (!open[lp.i]) { toggleMark(lp.i); if (navigator.vibrate) navigator.vibrate(30); } else chord(lp.i);
      }
    }
    if (state === 'play') elapsed += dt;
    if (state === 'menu') {
      demoT -= dt;
      if (demoT <= 0) {
        if (demo && demo.wait > 0) { demo.wait -= 0.1; demoT = 0.1; }
        else if (!demoStep()) {
          for (let k2 = 0; k2 < 30; k2++) burst(Math.random() * W, BY + Math.random() * R * CELL, Arcade.pick(['#8aa0ff', '#39ff14', '#ff2bd6']), 1, 120, 3);
          newDemo(); demo.wait = 1.4; demoT = 0.1;
        } else demoT = 0.14;
      }
    }
    if (state === 'lost') {
      endT += dt;
      // explosões em cadeia a partir da mina pisada
      let n = 0;
      for (let i = 0; i < R * C; i++) {
        if (boomAt[i] > 0 && boomAt[i] <= time && boomAt[i] > lastBoom) {
          const { x, y } = cellCenter(i);
          burst(x, y, Arcade.pick(['#ff3b5c', '#ffe600', '#ff8c1a']), 6, 110, 3);
          if (n++ < 2) Sfx.noise(0.18, 0.12, 1400, 0, 'lowpass', 80);
        }
      }
      lastBoom = time;
      if (endT > 1.8) { Sfx.lose(); finish(false); }
    } else if (state === 'won') {
      endT += dt;
      if (endT > 1.4) finish(true);
    }
  }

  let last = performance.now(), hudT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollInputs(dt);
    if (state !== 'pause') update(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; if (state !== 'menu') updateHud(); syncButtons(); }
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  Arcade.bindMute($('muteBtn'));
  addEventListener('resize', resize);
  newDemo();
  resize();
  show('menu');
  syncButtons();
  updateHud();
  requestAnimationFrame(frame);
})();
