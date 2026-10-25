// Come-Come: labirinto em grade com movimento suave, curvas antecipadas e 4 fantasmas com IAs diferentes.
(() => {
  const COLS = 28, ROWS = 31, CELL = 16;
  const W = COLS * CELL, H = (ROWS + 2) * CELL; // 2 linhas extras embaixo: vidas e frutas
  const UNIT = 8;            // velocidade de referência (casas por segundo)
  const CORNER = 0.34;       // dá para virar até esta distância antes do centro da casa
  const DOOR_X = 14, OUT_Y = 10.5, HOUSE_Y = 13.5;
  const PAC_START = { x: 14, y: 22.5 };
  const FRUIT_POS = { x: 14, y: 16.5 };
  const EXTRA_LIFE = 10000;
  const INTER_LEN = 6.6;     // duração do intervalo entre fases

  // Metade esquerda do labirinto (colunas 0 a 13); a direita é o espelho.
  // # parede · . pastilha · o pastilha de energia · espaço = corredor vazio · - porta da casa dos fantasmas
  const HALF = [
    '##############',
    '#.............',
    '#.###.####.###',
    '#o###.####.###',
    '#.............',
    '#.###.########',
    '#.###.########',
    '#...........##',
    '#####.#####.##',
    '#####.#####.##',
    '#####.        ',
    '#####.### ###-',
    '#####.### #   ',
    '     .    #   ',
    '#####.### #   ',
    '#####.### ####',
    '#####.        ',
    '#####.### ####',
    '#####.### ####',
    '#.............',
    '#.###.####.###',
    '#.###.####.###',
    '#o............',
    '###.###.##.###',
    '###.###.##.###',
    '#.............',
    '#.####.#####.#',
    '#.####.#####.#',
    '#.####.#####.#',
    '#.............',
    '##############',
  ];
  const MAP = HALF.map(r => r + [...r].reverse().join(''));
  const WALL = 1, DOOR = 2;
  const tiles = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = MAP[y][x];
      tiles[y * COLS + x] = c === '#' ? WALL : c === '-' ? DOOR : 0;
    }
  }
  const wrapX = x => ((x % COLS) + COLS) % COLS;
  // Casa livre para andar. A porta conta como bloqueada: os fantasmas passam por ela num roteiro próprio.
  const open = (x, y) => y >= 0 && y < ROWS && tiles[y * COLS + wrapX(x)] === 0;

  const DIRS = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }]; // ordem de desempate: cima, esq., baixo, dir.
  const GHOSTS = [
    { name: 'BRASA', color: '#ff2a3d', scatter: { x: 25, y: -3 }, homeX: DOOR_X },
    { name: 'CHICLETE', color: '#ff7ad9', scatter: { x: 2, y: -3 }, homeX: DOOR_X },
    { name: 'GELADO', color: '#22e8ff', scatter: { x: 27, y: 31 }, homeX: 12 },
    { name: 'MOLENGA', color: '#ffa53a', scatter: { x: 0, y: 31 }, homeX: 16 },
  ];
  const FRUITS = [
    { kind: 'cereja', name: 'CEREJA', pts: 100 },
    { kind: 'morango', name: 'MORANGO', pts: 300 },
    { kind: 'laranja', name: 'LARANJA', pts: 500 },
    { kind: 'laranja', name: 'LARANJA', pts: 500 },
    { kind: 'maca', name: 'MAÇÃ', pts: 700 },
    { kind: 'maca', name: 'MAÇÃ', pts: 700 },
    { kind: 'uva', name: 'UVA', pts: 1000 },
    { kind: 'uva', name: 'UVA', pts: 1000 },
    { kind: 'melancia', name: 'MELANCIA', pts: 2000 },
    { kind: 'melancia', name: 'MELANCIA', pts: 2000 },
    { kind: 'abacaxi', name: 'ABACAXI', pts: 3000 },
    { kind: 'abacaxi', name: 'ABACAXI', pts: 3000 },
    { kind: 'estrela', name: 'ESTRELA', pts: 5000 },
  ];
  const fruitFor = lv => FRUITS[Math.min(lv - 1, FRUITS.length - 1)];
  const WALL_COLORS = ['#2f6bff', '#ff2bd6', '#00e5ff', '#39ff14', '#ff8c1a', '#b04bff', '#ff3b5c'];

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), stage = $('stage');
  const overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), level: $('hLevel'), lives: $('hLives'), status: $('hStatus') };

  /* ---------- configurações ---------- */
  const settings = { walls: 'cycle', siren: 'on' };
  Arcade.bindSettings(panels.menu, settings, 'come-come_', key => { if (key === 'walls') buildBoards(); });
  const codes = Arcade.codes('come-come', {
    KONAMI: 'Vidas infinitas',
    TURBO: 'Come-Come mais rápido',
    CEGO: 'Fantasmas andam sem rumo',
  }, $('codeMount'), () => updateHud());

  /* ---------- curvas de dificuldade por fase ---------- */
  const pacMul = lv => (lv === 1 ? 0.8 : lv < 5 ? 0.9 : 1);
  const ghostMul = lv => (lv === 1 ? 0.75 : lv < 5 ? 0.85 : lv < 10 ? 0.95 : 1.02);
  const frightTime = lv => Math.max(1.5, 6.5 - (lv - 1) * 0.6);
  // Tempos alternados: índices pares = dispersar, ímpares = perseguir.
  function modeTable(lv) {
    if (lv === 1) return [7, 20, 7, 20, 5, 20, 5, Infinity];
    if (lv < 5) return [7, 20, 7, 20, 5, 33, 3, Infinity];
    return [5, 20, 5, 20, 5, 40, 2, Infinity];
  }
  const dotLimit = (lv, i) => (lv === 1 ? [0, 0, 30, 60][i] : lv === 2 ? [0, 0, 0, 50][i] : 0);

  /* ---------- tela ---------- */
  let k = 1;
  const board = document.createElement('canvas'), boardFlash = document.createElement('canvas');
  let wallPath = null;
  function resize() {
    k = Arcade.fit(canvas, W, H, wrap);
    buildBoards();
  }
  // Contorno neon das paredes: linhas recuadas de cada lado que encosta num corredor,
  // com cantos arredondados (convexos e côncavos). Calculado uma vez em unidades lógicas.
  function buildWallPath() {
    const p = new Path2D();
    const I = 0.3, R = 0.2, PI = Math.PI;
    const solid = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS && tiles[y * COLS + x] === WALL;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!solid(x, y)) continue;
        const X = x * CELL, Y = y * CELL;
        const line = (x1, y1, x2, y2) => { p.moveTo(X + x1 * CELL, Y + y1 * CELL); p.lineTo(X + x2 * CELL, Y + y2 * CELL); };
        const arc = (cx, cy, r, a1, a2) => {
          p.moveTo(X + (cx + Math.cos(a1) * r) * CELL, Y + (cy + Math.sin(a1) * r) * CELL);
          p.arc(X + cx * CELL, Y + cy * CELL, r * CELL, a1, a2);
        };
        const t = solid(x, y - 1), b = solid(x, y + 1), l = solid(x - 1, y), r = solid(x + 1, y);
        if (!t) line(l ? 0 : I + R, I, r ? 1 : 1 - I - R, I);
        if (!b) line(l ? 0 : I + R, 1 - I, r ? 1 : 1 - I - R, 1 - I);
        if (!l) line(I, t ? 0 : I + R, I, b ? 1 : 1 - I - R);
        if (!r) line(1 - I, t ? 0 : I + R, 1 - I, b ? 1 : 1 - I - R);
        if (!t && !l) arc(I + R, I + R, R, PI, 1.5 * PI);
        if (!t && !r) arc(1 - I - R, I + R, R, 1.5 * PI, 2 * PI);
        if (!b && !r) arc(1 - I - R, 1 - I - R, R, 0, 0.5 * PI);
        if (!b && !l) arc(I + R, 1 - I - R, R, 0.5 * PI, PI);
        if (t && l && !solid(x - 1, y - 1)) arc(0, 0, I, 0, 0.5 * PI);
        if (t && r && !solid(x + 1, y - 1)) arc(1, 0, I, 0.5 * PI, PI);
        if (b && r && !solid(x + 1, y + 1)) arc(1, 1, I, PI, 1.5 * PI);
        if (b && l && !solid(x - 1, y + 1)) arc(0, 1, I, 1.5 * PI, 2 * PI);
      }
    }
    return p;
  }
  const wallColor = () => (settings.walls === 'cycle' ? WALL_COLORS[(level - 1) % WALL_COLORS.length] : WALL_COLORS[0]);
  function buildBoards() {
    if (!wallPath) wallPath = buildWallPath();
    paintBoard(board, wallColor());
    paintBoard(boardFlash, '#ffffff');
  }
  function paintBoard(cv, color) {
    cv.width = canvas.width; cv.height = canvas.height;
    const g = cv.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#03020a'; g.fillRect(0, 0, W, H);
    // grade bem fraquinha no fundo, estilo tela de fliperama
    g.fillStyle = 'rgba(120,120,255,0.05)';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (tiles[y * COLS + x] !== WALL) g.fillRect(x * CELL + CELL / 2 - 0.5, y * CELL + CELL / 2 - 0.5, 1, 1);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 10; g.lineWidth = 2.6;
    g.stroke(wallPath);
    g.shadowBlur = 4; g.lineWidth = 2.6; g.globalAlpha = 0.5; g.stroke(wallPath);
    g.globalAlpha = 1; g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.8;
    g.stroke(wallPath);
    // porta da casa dos fantasmas
    g.fillStyle = '#ff9be8'; g.shadowColor = '#ff2bd6'; g.shadowBlur = 8;
    g.fillRect(13 * CELL, 11 * CELL + CELL * 0.42, 2 * CELL, CELL * 0.16);
    g.shadowBlur = 0;
    // faixa de baixo (vidas e frutas)
    g.strokeStyle = 'rgba(255,230,0,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(8, ROWS * CELL + 1); g.lineTo(W - 8, ROWS * CELL + 1); g.stroke();
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let level = 1, score = 0, lives = 3;
  let hi = +Arcade.store.get('come-come_hi', 0) || 0;
  const dots = new Uint8Array(COLS * ROWS);
  let dotsLeft = 0, dotsTotal = 1, dotsEaten = 0;
  let pac = null, ghosts = [], fruit = null;
  let modeIdx = 0, modeT = 0, frightT = 0, frightMax = 1, chain = 0;
  let stateT = 0, readyLen = 2, idleT = 0, dotsSinceDeath = 0, afterDeath = false, extraGiven = false;
  let particles = [], popups = [], time = 0, sirenT = 0, wakaFlip = false, demoTile = -1;
  let eatenGhost = null, deathSound = false, bannerT = 0, ghostsEatenTotal = 0, fruitsEaten = 0, shake = 0;

  function fillDots() {
    dotsLeft = 0;
    for (let i = 0; i < COLS * ROWS; i++) {
      const c = MAP[(i / COLS) | 0][i % COLS];
      dots[i] = c === '.' ? 1 : c === 'o' ? 2 : 0;
      if (dots[i]) dotsLeft++;
    }
    dotsTotal = dotsLeft; dotsEaten = 0; fruit = null;
  }

  function resetActors() {
    pac = { x: PAC_START.x, y: PAC_START.y, dir: { x: -1, y: 0 }, want: null, anim: 0, moving: false };
    ghosts = GHOSTS.map((d, i) => ({
      i, x: d.homeX, y: i === 0 ? OUT_Y : HOUSE_Y,
      dir: i === 0 ? { x: -1, y: 0 } : { x: 0, y: i === 2 ? 1 : -1 },
      state: i === 0 ? 'out' : 'house', fright: false, decided: -1, dots: 0,
    }));
    modeIdx = 0; modeT = 0; frightT = 0; chain = 0; idleT = 0; demoTile = -1; eatenGhost = null;
  }

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function start() {
    if (state !== 'menu' && state !== 'over') return;
    Sfx.ensure();
    level = 1; score = 0; lives = 3; extraGiven = false; afterDeath = false;
    ghostsEatenTotal = 0; fruitsEaten = 0;
    particles = []; popups = [];
    fillDots(); resetActors(); buildBoards();
    state = 'ready'; stateT = 0; readyLen = 3.4; bannerT = 0;
    show(null);
    jingle();
    updateHud();
  }

  function toMenu() {
    state = 'menu';
    level = 1;
    fillDots(); resetActors(); buildBoards();
    particles = []; popups = [];
    show('menu');
    updateHud();
  }

  function togglePause() {
    const live = ['ready', 'play', 'eat', 'dying', 'clear', 'inter'];
    if (live.includes(state)) {
      pausedFrom = state; state = 'pause'; show('pause');
    } else if (state === 'pause') {
      state = pausedFrom; show(null);
    }
  }

  function gameOver() {
    state = 'over';
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set('come-come_hi', hi); }
    Ranking.gameOver($('rankBox'), { board: 'come-come', score, cheated });
    $('overScore').textContent = score;
    $('overInfo').textContent = `Fase ${level} · ${ghostsEatenTotal} ${ghostsEatenTotal === 1 ? 'fantasma comido' : 'fantasmas comidos'} · ${fruitsEaten} ${fruitsEaten === 1 ? 'fruta' : 'frutas'}`;
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win();
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.level.textContent = demo ? 1 : level;
    hud.lives.textContent = codes.has('KONAMI') ? '∞' : demo ? 3 : lives;
    const tags = [];
    if (codes.has('TURBO')) tags.push('TURBO');
    if (codes.has('CEGO')) tags.push('CEGO');
    if (!demo && frightT > 0) tags.unshift(`⚡ ${Math.ceil(frightT)}s`);
    hud.status.textContent = tags.join(' · ');
  }

  /* ---------- sons ---------- */
  const playing = () => state !== 'menu';
  function jingle() {
    // melodia original de abertura (~3 s)
    const N = [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 988, 880, 784, 1047];
    N.forEach((f, i) => {
      Sfx.tone(f, 0.16, 'square', 0.06, null, i * 0.19);
      if (i % 4 === 0) Sfx.tone(f / 4, 0.32, 'triangle', 0.12, null, i * 0.19);
    });
  }
  function waka() {
    wakaFlip = !wakaFlip;
    Sfx.tone(wakaFlip ? 520 : 330, 0.075, 'triangle', 0.09, wakaFlip ? 330 : 520);
  }
  function siren(dt) {
    sirenT -= dt;
    if (sirenT > 0 || settings.siren !== 'on') return;
    if (ghosts.some(g => g.state === 'eaten' || g.state === 'entering')) {
      sirenT = 0.12; Sfx.tone(1100, 0.1, 'sine', 0.025, 1700); return;
    }
    if (frightT > 0) { sirenT = 0.2; Sfx.tone(210, 0.18, 'square', 0.018, 140); return; }
    const prog = 1 - dotsLeft / dotsTotal;
    sirenT = 0.36 - prog * 0.12;
    const f = 300 + prog * 240;
    Sfx.tone(f, sirenT * 0.95, 'sine', 0.022, f * 1.35);
  }

  /* ---------- pontuação e efeitos ---------- */
  function addScore(n) {
    score += n;
    if (!extraGiven && score >= EXTRA_LIFE) {
      extraGiven = true; lives++;
      popups.push({ x: W / 2, y: 19.5 * CELL, text: 'VIDA EXTRA!', color: '#39ff14', life: 2, size: 14 });
      [784, 988, 1175, 1568, 1175, 1568].forEach((f, i) => Sfx.tone(f, 0.1, 'square', 0.07, null, i * 0.08));
    }
  }
  function burst(px, py, color, n, power = 90, size = 2.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Arcade.rand(power * 0.25, power);
      const life = Arcade.rand(0.35, 0.9);
      particles.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: size * Arcade.rand(0.6, 1.3), g: 0 });
    }
  }

  /* ---------- pastilhas, frutas, fantasmas ---------- */
  function eatAt(tx, ty) {
    const i = ty * COLS + tx, v = dots[i];
    if (!v) return;
    dots[i] = 0; dotsLeft--; dotsEaten++;
    const demo = state === 'menu';
    if (v === 2) energize(demo);
    if (demo) {
      if (dotsLeft <= 0) { fillDots(); resetActors(); }
      return;
    }
    idleT = 0; dotsSinceDeath++;
    const inHouse = ghosts.find(g => g.state === 'house');
    if (inHouse) inHouse.dots++;
    if (v === 1) { addScore(10); waka(); } else {
      addScore(50);
      burst((tx + 0.5) * CELL, (ty + 0.5) * CELL, '#ffe9a8', 22, 120);
      Sfx.tone(180, 0.35, 'sawtooth', 0.09, 900);
    }
    if (dotsEaten === 70 || dotsEaten === 170) fruit = { t: Arcade.rand(9, 10), ...fruitFor(level) };
    if (dotsLeft <= 0) levelClear();
  }

  function energize(demo) {
    frightMax = frightTime(level); frightT = frightMax; chain = 0;
    for (const g of ghosts) if (g.state !== 'eaten' && g.state !== 'entering') g.fright = true;
    reverseAll();
    if (!demo) updateHud();
  }
  function reverseAll() {
    for (const g of ghosts) if (g.state === 'out') { g.dir = { x: -g.dir.x, y: -g.dir.y }; g.decided = -1; }
  }

  function eatGhost(g) {
    const pts = 200 << Math.min(chain, 3);
    chain++;
    g.state = 'eaten'; g.fright = false; g.decided = -1;
    const px = g.x * CELL, py = g.y * CELL;
    burst(px, py, GHOSTS[g.i].color, 26, 140, 2.6);
    burst(px, py, '#2233ff', 14, 100);
    if (state === 'menu') return;
    addScore(pts); ghostsEatenTotal++;
    popups.push({ x: px, y: py, text: String(pts), color: '#00e5ff', life: 1.1, size: 12 });
    eatenGhost = g;
    state = 'eat'; stateT = 0;
    Sfx.tone(300, 0.35, 'square', 0.08, 1500);
    Sfx.tone(600, 0.25, 'triangle', 0.06, 2400, 0.08);
    if (chain === 4) {
      popups.push({ x: W / 2, y: 7.5 * CELL, text: 'BANQUETE!', color: '#ff2bd6', life: 1.6, size: 16 });
    }
  }

  function eatFruit() {
    addScore(fruit.pts); fruitsEaten++;
    const px = FRUIT_POS.x * CELL, py = FRUIT_POS.y * CELL;
    popups.push({ x: px, y: py, text: String(fruit.pts), color: '#ff7ad9', life: 1.6, size: 12 });
    burst(px, py, '#ff7ad9', 20, 110);
    burst(px, py, '#39ff14', 10, 80);
    [880, 1109, 1319, 1760].forEach((f, i) => Sfx.tone(f, 0.08, 'square', 0.07, null, i * 0.05));
    fruit = null;
  }

  function levelClear() {
    state = 'clear'; stateT = 0; fruit = null;
    for (let i = 0; i < 40; i++) burst(Math.random() * W, Math.random() * ROWS * CELL, Arcade.pick(WALL_COLORS), 1, 60, 3);
  }

  function nextLevel() {
    level++;
    fillDots(); resetActors(); buildBoards();
    afterDeath = false;
    state = 'ready'; stateT = 0; readyLen = 2; bannerT = 1.6;
    Sfx.win();
    updateHud();
  }

  function die() {
    state = 'dying'; stateT = 0; deathSound = false; fruit = null; shake = 0.35;
    Sfx.tone(160, 0.12, 'square', 0.1);
  }

  /* ---------- alvos dos fantasmas (a personalidade de cada um) ---------- */
  function targetOf(g) {
    if (g.state === 'eaten') return { x: 13, y: 10 };
    const d = GHOSTS[g.i];
    const p = { x: Math.floor(pac.x), y: Math.floor(pac.y) };
    const elroy = g.i === 0 && dotsLeft <= 20 + level * 2;
    if (modeIdx % 2 === 0 && !elroy) return d.scatter;
    switch (g.i) {
      case 0: // BRASA: vai direto no Come-Come
        return p;
      case 1: // CHICLETE: mira 4 casas à frente para emboscar
        return { x: p.x + pac.dir.x * 4, y: p.y + pac.dir.y * 4 };
      case 2: { // GELADO: dobra o vetor que vai do BRASA até 2 casas à frente do Come-Come
        const b = ghosts[0];
        const ax = p.x + pac.dir.x * 2, ay = p.y + pac.dir.y * 2;
        return { x: ax * 2 - Math.floor(b.x), y: ay * 2 - Math.floor(b.y) };
      }
      default: { // MOLENGA: persegue de longe, foge para o canto quando chega perto
        const dx = g.x - pac.x, dy = g.y - pac.y;
        return dx * dx + dy * dy > 64 ? p : d.scatter;
      }
    }
  }

  function chooseDir(g, tx, ty) {
    const opts = DIRS.filter(d => !(d.x === -g.dir.x && d.y === -g.dir.y) && open(tx + d.x, ty + d.y));
    if (!opts.length) return { x: -g.dir.x, y: -g.dir.y };
    const wander = g.state === 'out' && (g.fright || codes.has('CEGO') || state === 'menu');
    if (wander) return Arcade.pick(opts);
    const t = targetOf(g);
    let best = opts[0], bd = Infinity;
    for (const d of opts) {
      const dx = tx + d.x - t.x, dy = ty + d.y - t.y, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  function ghostSpeed(g) {
    if (g.state === 'eaten' || g.state === 'entering') return UNIT * 1.9;
    if (g.state === 'house' || g.state === 'leaving') return UNIT * 0.5;
    const tx = Math.floor(g.x), ty = Math.floor(g.y);
    if (ty === 13 && (tx < 5 || tx > 22)) return UNIT * 0.4; // túnel
    if (g.fright) return UNIT * 0.5;
    let s = UNIT * ghostMul(level);
    if (g.i === 0 && dotsLeft <= 20 + level * 2) s *= dotsLeft <= 10 + level ? 1.1 : 1.05; // BRASA se irrita no fim da fase
    return s;
  }
  function pacSpeed() {
    let s = UNIT * pacMul(level);
    if (frightT > 0) s *= 1.1;
    if (codes.has('TURBO')) s *= 1.3;
    return s;
  }

  const approach = (v, t, s) => (Math.abs(t - v) <= s ? t : v + Math.sign(t - v) * s);

  function moveGhost(g, d) {
    if (g.state === 'house') {
      // sobe e desce esperando a vez
      g.y += (g.dir.y || 1) * d;
      if (g.y < HOUSE_Y - 0.45) { g.y = HOUSE_Y - 0.45; g.dir = { x: 0, y: 1 }; }
      if (g.y > HOUSE_Y + 0.45) { g.y = HOUSE_Y + 0.45; g.dir = { x: 0, y: -1 }; }
      return;
    }
    if (g.state === 'leaving') {
      // centraliza na altura da casa, vai até a porta e sobe
      for (let n = 0; d > 1e-6 && n < 4; n++) {
        if (g.x !== DOOR_X) {
          if (g.y !== HOUSE_Y) {
            const s = Math.min(d, Math.abs(HOUSE_Y - g.y)); g.dir = { x: 0, y: Math.sign(HOUSE_Y - g.y) };
            g.y = approach(g.y, HOUSE_Y, s); d -= s; continue;
          }
          const s = Math.min(d, Math.abs(DOOR_X - g.x)); g.dir = { x: Math.sign(DOOR_X - g.x), y: 0 };
          g.x = approach(g.x, DOOR_X, s); d -= s; continue;
        }
        const s = Math.min(d, g.y - OUT_Y); g.dir = { x: 0, y: -1 };
        g.y = approach(g.y, OUT_Y, s); d -= s;
        if (g.y === OUT_Y) {
          g.state = 'out'; g.decided = -1;
          g.dir = { x: Math.random() < 0.5 ? -1 : 1, y: 0 };
          return;
        }
      }
      return;
    }
    if (g.state === 'entering') {
      // olhos voltando: alinha na porta e desce até o meio da casa
      for (let n = 0; d > 1e-6 && n < 3; n++) {
        if (g.x !== DOOR_X) {
          const s = Math.min(d, Math.abs(DOOR_X - g.x)); g.dir = { x: Math.sign(DOOR_X - g.x), y: 0 };
          g.x = approach(g.x, DOOR_X, s); d -= s; continue;
        }
        const s = Math.min(d, Math.abs(HOUSE_Y - g.y)); g.dir = { x: 0, y: 1 };
        g.y = approach(g.y, HOUSE_Y, s); d -= s;
        if (g.y === HOUSE_Y) { g.state = 'leaving'; g.fright = false; return; }
      }
      return;
    }
    // fora da casa: anda de centro em centro de casa, decidindo o caminho em cada centro
    for (let n = 0; d > 1e-6 && n < 8; n++) {
      const tx = Math.floor(g.x), ty = Math.floor(g.y), cx = tx + 0.5, cy = ty + 0.5;
      const along = g.dir.x ? (cx - g.x) * g.dir.x : (cy - g.y) * g.dir.y;
      const id = ty * COLS + tx;
      if (Math.abs(along) < 1e-6 && g.decided !== id) {
        g.x = cx; g.y = cy; g.decided = id;
        if (g.state === 'eaten' && ty === 10 && (tx === 13 || tx === 14)) { g.state = 'entering'; moveGhost(g, d); return; }
        g.dir = chooseDir(g, tx, ty);
        continue;
      }
      const dist = along > 1e-6 ? along : along + 1;
      const s = Math.min(d, dist);
      g.x += g.dir.x * s; g.y += g.dir.y * s; d -= s;
      if (g.dir.x) g.y = cy; else g.x = cx;
      if (g.x < 0) g.x += COLS; else if (g.x >= COLS) g.x -= COLS;
    }
  }

  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
  function movePac(d) {
    let moved = 0;
    for (let n = 0; d > 1e-6 && n < 8; n++) {
      const tx = Math.floor(pac.x), ty = Math.floor(pac.y), cx = tx + 0.5, cy = ty + 0.5;
      const w = pac.want;
      if (w && !same(w, pac.dir)) {
        if (w.x === -pac.dir.x && w.y === -pac.dir.y) pac.dir = w; // meia-volta vale a qualquer momento
        else {
          // curva antecipada (ou um tiquinho atrasada): o eixo antigo é corrigido em diagonal
          const along = pac.dir.x ? (cx - pac.x) * pac.dir.x : (cy - pac.y) * pac.dir.y;
          if (along > -CORNER * 0.6 && along <= CORNER && open(tx + w.x, ty + w.y)) pac.dir = w;
        }
      }
      const dir = pac.dir;
      const along = dir.x ? (cx - pac.x) * dir.x : (cy - pac.y) * dir.y;
      let dist;
      if (along > 1e-6) dist = along;
      else if (open(tx + dir.x, ty + dir.y)) dist = along + 1;
      else { if (dir.x) pac.x = cx; else pac.y = cy; break; } // parede: para no centro
      const s = Math.min(d, dist);
      pac.x += dir.x * s; pac.y += dir.y * s;
      if (dir.x) pac.y = approach(pac.y, cy, s); else pac.x = approach(pac.x, cx, s);
      if (pac.x < 0) pac.x += COLS; else if (pac.x >= COLS) pac.x -= COLS;
      d -= s; moved += s;
      eatAt(Math.floor(pac.x), Math.floor(pac.y));
      if (state !== 'play' && state !== 'menu') break;
    }
    pac.moving = moved > 0;
    pac.anim += moved;
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.state !== 'out') continue;
      let dx = Math.abs(g.x - pac.x);
      if (dx > COLS / 2) dx = COLS - dx;
      const dy = g.y - pac.y;
      if (dx * dx + dy * dy > 0.36) continue;
      if (g.fright) { eatGhost(g); if (state === 'eat') return; } else if (state === 'play') { die(); return; }
    }
  }

  function releaseCheck(dt) {
    idleT += dt;
    const next = ghosts.find(g => g.state === 'house');
    if (!next) { afterDeath = false; return; }
    let go = afterDeath ? dotsSinceDeath >= [0, 7, 17, 32][next.i] : next.dots >= dotLimit(level, next.i);
    if (idleT > (level < 5 ? 4 : 3)) { go = true; idleT = 0; }
    if (go) next.state = 'leaving';
  }

  function updateMode(dt) {
    if (frightT > 0) {
      frightT -= dt;
      if (frightT <= 0) { frightT = 0; for (const g of ghosts) g.fright = false; }
      return; // o relógio de dispersar/perseguir para enquanto os fantasmas estão azuis
    }
    const tab = modeTable(level);
    modeT += dt;
    if (modeT >= tab[modeIdx]) { modeT = 0; modeIdx = Math.min(modeIdx + 1, tab.length - 1); reverseAll(); }
  }

  // Piloto automático do modo demonstração (atrás do menu): busca em largura até a pastilha mais próxima.
  function autopilot() {
    const tx = Math.floor(pac.x), ty = Math.floor(pac.y), startId = ty * COLS + tx;
    if (startId === demoTile) return;
    demoTile = startId;
    const danger = new Uint8Array(COLS * ROWS), prey = new Uint8Array(COLS * ROWS);
    for (const g of ghosts) {
      if (g.state !== 'out') continue;
      const gx = Math.floor(g.x), gy = Math.floor(g.y);
      if (g.fright) { prey[gy * COLS + gx] = 1; continue; }
      for (const d of [{ x: 0, y: 0 }, ...DIRS]) {
        const ny = gy + d.y;
        if (ny >= 0 && ny < ROWS) danger[ny * COLS + wrapX(gx + d.x)] = 1;
      }
    }
    // 1ª tentativa sem dar meia-volta (evita o vaivém); se não achar nada, libera a meia-volta.
    for (const allowBack of [false, true]) {
      const first = new Int8Array(COLS * ROWS).fill(-1);
      const q = [startId]; first[startId] = 4;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], cx = c % COLS, cy = (c / COLS) | 0;
        if (c !== startId && (dots[c] || prey[c])) { pac.want = DIRS[first[c]]; return; }
        for (let di = 0; di < 4; di++) {
          const d = DIRS[di], nx = wrapX(cx + d.x), ny = cy + d.y;
          if (c === startId && !allowBack && d.x === -pac.dir.x && d.y === -pac.dir.y) continue;
          if (!open(nx, ny)) continue;
          const nid = ny * COLS + nx;
          if (first[nid] !== -1 || danger[nid]) continue;
          first[nid] = c === startId ? di : first[c];
          q.push(nid);
        }
      }
    }
    const opts = DIRS.filter(d => open(tx + d.x, ty + d.y));
    if (opts.length) pac.want = Arcade.pick(opts);
  }

  function updateWorld(dt) {
    const demo = state === 'menu';
    updateMode(dt);
    releaseCheck(dt);
    if (demo) autopilot();
    movePac(pacSpeed() * dt);
    if (state !== 'play' && state !== 'menu') return;
    checkCollisions();
    if (state !== 'play' && state !== 'menu') return;
    for (const g of ghosts) moveGhost(g, ghostSpeed(g) * dt);
    checkCollisions();
    if (fruit && state === 'play') {
      fruit.t -= dt;
      if (fruit.t <= 0) fruit = null;
      else if (Math.abs(pac.x - FRUIT_POS.x) < 0.7 && Math.abs(pac.y - FRUIT_POS.y) < 0.5) eatFruit();
    }
    if (state === 'play') siren(dt);
  }

  /* ---------- entrada ---------- */
  function setWant(x, y) {
    if (state === 'inter') { skipInter(); return; }
    if (!pac || !['ready', 'play', 'eat'].includes(state)) return;
    pac.want = { x, y };
  }
  function skipInter() { if (state === 'inter' && stateT > 0.6) nextLevel(); }

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
    if (state === 'inter' && (key === 'enter' || key === ' ')) { skipInter(); return; }
    const m = KEYS[key];
    if (!m) return;
    setWant(m[0], m[1]);
  });

  // Deslizar o dedo (ou arrastar o mouse) sobre o jogo.
  let swipe = null;
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    if (state === 'inter') skipInter();
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    e.preventDefault();
  });
  screen.addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (Math.hypot(dx, dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) setWant(Math.sign(dx), 0);
    else setWant(0, Math.sign(dy));
    swipe.x = e.clientX; swipe.y = e.clientY;
  });
  const endSwipe = e => { if (swipe && e.pointerId === swipe.id) swipe = null; };
  screen.addEventListener('pointerup', endSwipe);
  screen.addEventListener('pointercancel', endSwipe);

  const joy = new VJoy($('joy'));
  let padStart = false, padA = false;
  // Analógico/joystick: vale a direção dominante; ao soltar, o Come-Come mantém a última escolha.
  function stick(x, y, mem) {
    if (Math.hypot(x, y) < 0.45) { mem.dir = ''; return; }
    const d = Math.abs(x) > Math.abs(y) ? [Math.sign(x), 0] : [0, Math.sign(y)];
    const id = d.join();
    if (id !== mem.dir) { mem.dir = id; setWant(d[0], d[1]); }
  }
  const joyMem = { dir: '' }, padMem = { dir: '' };
  function pollInputs() {
    stick(joy.x, joy.y, joyMem);
    const g = Arcade.gamepad(0);
    if (!g) return;
    stick(g.lx, g.ly, padMem);
    if (g.start && !padStart) togglePause();
    if (g.a && !padA) {
      if (state === 'menu' || state === 'over') start();
      else if (state === 'inter') skipInter();
    }
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
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Come-Come: círculo com boca. mouth = meio ângulo da boca (radianos).
  function drawPac(px, py, dir, mouth, R, color = '#ffe600') {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(dir.y, dir.x));
    if (dir.x < 0) ctx.scale(1, -1); // olhando para a esquerda: espelha para o olho ficar em cima
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    const gr = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R);
    gr.addColorStop(0, '#fffbd6'); gr.addColorStop(0.45, color); gr.addColorStop(1, '#c79c00');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, mouth, Math.PI * 2 - mouth); ctx.closePath(); ctx.fill();
    if (mouth < Math.PI * 0.75) {
      ctx.shadowBlur = 0; ctx.fillStyle = '#1a1200';
      ctx.beginPath(); ctx.arc(R * 0.12, -R * 0.52, R * 0.13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // mode: 'normal' | 'fright' | 'flash' | 'eyes'
  function drawGhost(px, py, R, color, dir, mode, phase) {
    ctx.save();
    ctx.translate(px, py);
    if (mode !== 'eyes') {
      const body = mode === 'fright' ? '#2a3bff' : mode === 'flash' ? '#f2f2ff' : color;
      ctx.shadowColor = body; ctx.shadowBlur = 14;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -R * 0.12, R, Math.PI, 0);
      const bottom = R * 0.92;
      ctx.lineTo(R, bottom);
      const n = 6;
      for (let i = 1; i <= n; i++) ctx.lineTo(R - (2 * R * i) / n, (i + phase) % 2 ? bottom - R * 0.3 : bottom);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.ellipse(-R * 0.45, -R * 0.62, R * 0.22, R * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
    }
    if (mode === 'fright' || mode === 'flash') {
      const c = mode === 'fright' ? '#ffd2c2' : '#ff2040';
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, R * 0.12);
      for (const s of [-1, 1]) ctx.fillRect(s * R * 0.36 - R * 0.11, -R * 0.38, R * 0.22, R * 0.22);
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(-R * 0.6 + (i * R * 1.2) / 6, R * 0.35 + (i % 2 ? -R * 0.13 : 0));
      ctx.stroke();
    } else {
      for (const s of [-1, 1]) {
        const ex = s * R * 0.36, ey = -R * 0.2;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(ex + dir.x * R * 0.06, ey + dir.y * R * 0.06, R * 0.27, R * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1b2cff';
        ctx.beginPath(); ctx.arc(ex + dir.x * R * 0.16, ey + dir.y * R * 0.18, R * 0.14, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFruit(kind, px, py, R) {
    ctx.save();
    ctx.translate(px, py);
    ctx.shadowBlur = 10;
    const circ = (x, y, r, c) => { ctx.fillStyle = c; ctx.shadowColor = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    if (kind === 'cereja') {
      ctx.strokeStyle = '#4fdc3a'; ctx.lineWidth = R * 0.14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-R * 0.45, R * 0.15); ctx.quadraticCurveTo(-R * 0.1, -R * 0.6, R * 0.5, -R * 0.85);
      ctx.moveTo(R * 0.4, R * 0.35); ctx.quadraticCurveTo(R * 0.4, -R * 0.4, R * 0.5, -R * 0.85); ctx.stroke();
      circ(-R * 0.45, R * 0.35, R * 0.42, '#ff2040'); circ(R * 0.4, R * 0.5, R * 0.42, '#ff2040');
      circ(-R * 0.58, R * 0.2, R * 0.1, '#ffb0b8');
    } else if (kind === 'morango') {
      ctx.fillStyle = '#ff2a4a'; ctx.shadowColor = '#ff2a4a';
      ctx.beginPath(); ctx.moveTo(0, R * 0.95); ctx.bezierCurveTo(-R * 1.1, R * 0.1, -R * 0.8, -R * 0.75, 0, -R * 0.5);
      ctx.bezierCurveTo(R * 0.8, -R * 0.75, R * 1.1, R * 0.1, 0, R * 0.95); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffe9a8';
      for (const [x, y] of [[-0.35, -0.1], [0.3, -0.15], [0, 0.2], [-0.25, 0.45], [0.25, 0.45], [0, -0.3]]) ctx.fillRect(x * R - 1, y * R - 1, 2, 2);
      ctx.fillStyle = '#39ff14';
      ctx.beginPath(); ctx.moveTo(-R * 0.5, -R * 0.55); ctx.lineTo(0, -R * 0.35); ctx.lineTo(R * 0.5, -R * 0.55); ctx.lineTo(0, -R * 0.85); ctx.fill();
    } else if (kind === 'laranja') {
      circ(0, R * 0.1, R * 0.8, '#ff9a1a');
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(-R * 0.3, -R * 0.15, R * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#39d13a'; ctx.beginPath(); ctx.ellipse(R * 0.3, -R * 0.75, R * 0.35, R * 0.15, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'maca') {
      circ(-R * 0.3, R * 0.15, R * 0.62, '#ff2238'); circ(R * 0.3, R * 0.15, R * 0.62, '#ff2238');
      ctx.shadowBlur = 0; ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = R * 0.14;
      ctx.beginPath(); ctx.moveTo(0, -R * 0.35); ctx.lineTo(R * 0.1, -R * 0.8); ctx.stroke();
      ctx.fillStyle = '#39d13a'; ctx.beginPath(); ctx.ellipse(R * 0.4, -R * 0.7, R * 0.3, R * 0.13, -0.5, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'uva') {
      for (const [x, y] of [[-0.45, -0.35], [0, -0.35], [0.45, -0.35], [-0.22, 0.05], [0.22, 0.05], [0, 0.45]]) circ(x * R, y * R, R * 0.3, '#b04bff');
      ctx.shadowBlur = 0; ctx.strokeStyle = '#39d13a'; ctx.lineWidth = R * 0.14;
      ctx.beginPath(); ctx.moveTo(0, -R * 0.6); ctx.lineTo(R * 0.2, -R * 0.95); ctx.stroke();
    } else if (kind === 'melancia') {
      ctx.fillStyle = '#2bd13a'; ctx.shadowColor = '#2bd13a';
      ctx.beginPath(); ctx.arc(0, -R * 0.2, R, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(0, -R * 0.2, R * 0.8, 0, Math.PI); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#111';
      for (const x of [-0.45, -0.15, 0.15, 0.45]) ctx.fillRect(x * R - 1, R * (0.1 + Math.abs(x) * -0.2) + R * 0.1, 2, 3);
    } else if (kind === 'abacaxi') {
      ctx.fillStyle = '#39d13a'; ctx.shadowColor = '#39d13a';
      ctx.beginPath(); ctx.moveTo(-R * 0.4, -R * 0.4); ctx.lineTo(-R * 0.3, -R * 1); ctx.lineTo(0, -R * 0.55); ctx.lineTo(R * 0.3, -R * 1.05); ctx.lineTo(R * 0.4, -R * 0.4); ctx.fill();
      ctx.fillStyle = '#ffc21a'; ctx.shadowColor = '#ffc21a';
      ctx.beginPath(); ctx.ellipse(0, R * 0.2, R * 0.55, R * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(120,60,0,0.6)'; ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * R * 0.25 - R * 0.4, -R * 0.4); ctx.lineTo(i * R * 0.25 + R * 0.4, R * 0.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * R * 0.25 + R * 0.4, -R * 0.4); ctx.lineTo(i * R * 0.25 - R * 0.4, R * 0.9); ctx.stroke();
      }
    } else {
      ctx.rotate(time * 1.5);
      ctx.fillStyle = '#ffe600'; ctx.shadowColor = '#ffe600';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? R * 0.42 : R, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Desenha algo que pode estar atravessando o túnel (aparece dos dois lados).
  function wrapDraw(x, fn) {
    fn(x * CELL);
    if (x < 1) fn((x + COLS) * CELL);
    else if (x > COLS - 1) fn((x - COLS) * CELL);
  }

  const R_ACTOR = CELL * 0.66;
  function ghostMode(g) {
    if (g.state === 'eaten' || g.state === 'entering') return 'eyes';
    if (!g.fright) return 'normal';
    const warn = Math.min(2, frightMax * 0.4);
    if (frightT < warn && Math.floor(time * 6) % 2) return 'flash';
    return 'fright';
  }

  function drawDots() {
    ctx.fillStyle = '#ffd9b0';
    for (let i = 0; i < COLS * ROWS; i++) {
      if (dots[i] !== 1) continue;
      const x = (i % COLS) * CELL + CELL / 2, y = ((i / COLS) | 0) * CELL + CELL / 2;
      ctx.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
    }
    const blink = state === 'play' || state === 'menu' ? Math.floor(time * 4) % 2 === 0 : true;
    if (!blink) return;
    ctx.save();
    ctx.fillStyle = '#ffe9c8'; ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 12;
    for (let i = 0; i < COLS * ROWS; i++) {
      if (dots[i] !== 2) continue;
      const x = (i % COLS) * CELL + CELL / 2, y = ((i / COLS) | 0) * CELL + CELL / 2;
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.38, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawBottom() {
    const y = (ROWS + 1) * CELL;
    if (codes.has('KONAMI')) {
      drawPac(1.6 * CELL, y, { x: 1, y: 0 }, 0.5, CELL * 0.55);
      drawText('∞', 3.2 * CELL, y, 14, '#ffe600');
    } else {
      const spare = state === 'menu' ? 2 : Math.max(0, lives - 1);
      for (let i = 0; i < Math.min(spare, 6); i++) drawPac((1.6 + i * 1.6) * CELL, y, { x: 1, y: 0 }, 0.5, CELL * 0.55);
    }
    const lv = state === 'menu' ? 1 : level;
    for (let i = 0; i < Math.min(lv, 7); i++) drawFruit(fruitFor(lv - i).kind, W - (1.6 + i * 1.7) * CELL, y, CELL * 0.55);
  }

  function drawInter() {
    ctx.fillStyle = '#03020a'; ctx.fillRect(0, 0, W, H);
    // piso neon
    const fy = H * 0.5 + 26;
    ctx.save();
    ctx.strokeStyle = wallColor(); ctx.shadowColor = wallColor(); ctx.shadowBlur = 10; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 48 - time * 60) % (W + 48) + W + 48) % (W + 48) - 24;
      ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(W / 2 + (x - W / 2) * 2.2, H); ctx.stroke();
    }
    ctx.restore();
    const t = stateT, variant = (level - 1) % 2;
    drawText('INTERVALO', W / 2, 60, 26, '#ffe600');
    drawText(variant === 0 ? 'O TROCO' : 'CARNAVAL NO LABIRINTO', W / 2, 92, 13, '#ff7ad9');
    drawText(`FASE ${level} COMPLETA!`, W / 2, H - 70, 14, '#39ff14');
    if (t > 1) drawText('toque ou aperte uma tecla para pular', W / 2, H - 44, 8, '#9a8bb8', 0.8);
    const y = H * 0.5;
    const chomp = 0.1 + 0.6 * Math.abs(Math.sin(time * 14));
    const ph = Math.floor(time * 8) % 2;
    if (variant === 0) {
      const half = INTER_LEN / 2;
      if (t < half) {
        const v = (W + 200) / half, x = W + 40 - v * t;
        drawPac(x, y, { x: -1, y: 0 }, chomp, 18);
        drawGhost(x + 52, y, 18, GHOSTS[0].color, { x: -1, y: 0 }, 'normal', ph);
      } else {
        const t2 = t - half, v = (W + 260) / half, x = -40 + v * t2;
        drawGhost(x, y, 18, GHOSTS[0].color, { x: -1, y: 0 }, Math.floor(time * 5) % 2 ? 'fright' : 'flash', ph);
        drawPac(x - 110, y - 32, { x: 1, y: 0 }, chomp, 56);
      }
    } else {
      const v = (W + 300) / INTER_LEN, x0 = -30 + v * t;
      drawPac(x0, y + Math.sin(time * 10) * 5, { x: 1, y: 0 }, chomp, 16);
      for (let i = 0; i < 4; i++) {
        const gx = x0 - 42 * (i + 1), gy = y + Math.sin(time * 10 + i * 1.3) * 7;
        drawGhost(gx, gy, 15, GHOSTS[i].color, { x: 1, y: 0 }, 'normal', ph);
        // chapeuzinho de carnaval
        ctx.save(); ctx.fillStyle = HATS[i];
        ctx.beginPath(); ctx.moveTo(gx - 6, gy - 16); ctx.lineTo(gx + 6, gy - 16); ctx.lineTo(gx, gy - 30); ctx.fill(); ctx.restore();
      }
      for (let i = 0; i < 3; i++) {
        const nx = x0 - 60 * i + 30, ny = y - 50 - ((time * 40 + i * 20) % 40);
        drawText('♪', nx, ny, 14, i % 2 ? '#ff7ad9' : '#ffe600', 0.8);
      }
    }
  }

  const HATS = ['#ffe600', '#39ff14', '#00e5ff', '#ff2bd6'];
  function interMusic(variant) {
    if (variant === 0) {
      const N = [784, 659, 523, 659, 784, 1047, 988, 784, 698, 587, 494, 587, 698, 880, 784, 0, 523, 659, 784, 1047, 784, 659, 523, 392];
      N.forEach((f, i) => { if (f) Sfx.tone(f, 0.18, 'square', 0.05, null, i * 0.26); });
      for (let i = 0; i < 12; i++) Sfx.tone(i % 2 ? 196 : 131, 0.24, 'triangle', 0.1, null, i * 0.52);
    } else {
      // batucada: surdo, chocalho e uma melodia
      for (let i = 0; i < 24; i++) {
        if (i % 4 === 0) Sfx.tone(90, 0.25, 'sine', 0.2, 50, i * 0.26);
        if (i % 4 === 3) Sfx.tone(120, 0.18, 'sine', 0.14, 70, i * 0.26);
        Sfx.noise(0.08, 0.06, 6000, i * 0.26 + 0.13, 'highpass', 3000);
      }
      const M = [659, 659, 784, 659, 587, 523, 587, 659, 880, 784, 659, 587, 523, 587, 523, 0];
      M.forEach((f, i) => { if (f) Sfx.tone(f, 0.2, 'square', 0.05, null, 0.26 + i * 0.39); });
    }
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (state === 'inter' || (state === 'pause' && pausedFrom === 'inter')) {
      drawInter();
      drawParticles();
      return;
    }
    let sx = 0, sy = 0;
    if (shake > 0) { sx = Arcade.rand(-2, 2) * shake * 4; sy = Arcade.rand(-2, 2) * shake * 4; }
    const st = state === 'pause' ? pausedFrom : state;
    const flash = st === 'clear' && stateT > 1 && Math.floor(stateT * 5) % 2 === 0;
    ctx.drawImage(flash ? boardFlash : board, 0, 0, W, H);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.beginPath(); ctx.rect(0, 0, W, ROWS * CELL); ctx.clip();
    drawDots();
    if (fruit) drawFruit(fruit.kind, FRUIT_POS.x * CELL, FRUIT_POS.y * CELL, CELL * 0.62);

    const ph = Math.floor(time * 7) % 2;
    const ghostsVisible = !(st === 'dying' && stateT > 0.9) && st !== 'clear' && st !== 'gameover';
    if (ghostsVisible) {
      for (const g of ghosts) {
        if (st === 'eat' && g === eatenGhost) continue;
        const mode = ghostMode(g);
        wrapDraw(g.x, px => drawGhost(px, g.y * CELL, R_ACTOR, GHOSTS[g.i].color, g.dir, mode, ph));
      }
    }
    // Come-Come
    if (st === 'dying') {
      if (stateT > 0.9) {
        const p = Math.min(1, (stateT - 0.9) / 1.3);
        if (p < 1) drawPac(pac.x * CELL, pac.y * CELL, { x: 0, y: -1 }, 0.2 + p * (Math.PI - 0.2), R_ACTOR);
      } else drawPac(pac.x * CELL, pac.y * CELL, pac.dir, 0.35, R_ACTOR);
    } else if (st !== 'gameover') {
      const mouth = st === 'ready' ? 0.5 : pac.moving || st === 'menu' ? 0.06 + 0.72 * Math.abs(Math.sin(pac.anim * Math.PI * 1.5)) : 0.45;
      if (st !== 'eat') wrapDraw(pac.x, px => drawPac(px, pac.y * CELL, pac.dir, mouth, R_ACTOR, codes.has('TURBO') ? '#fff04a' : '#ffe600'));
      if (codes.has('TURBO') && st === 'play' && pac.moving && Math.random() < 0.5) {
        particles.push({ x: pac.x * CELL - pac.dir.x * 8, y: pac.y * CELL - pac.dir.y * 8, vx: -pac.dir.x * 30, vy: -pac.dir.y * 30, life: 0.3, max: 0.3, color: '#ffe600', size: 2, g: 0 });
      }
    }
    ctx.restore();

    drawParticles();
    for (const p of popups) drawText(p.text, p.x, p.y - (1 - Math.min(1, p.life)) * 14, p.size || 11, p.color, Math.min(1, p.life * 2));

    if (st === 'ready') {
      drawText('PRONTO!', W / 2, FRUIT_POS.y * CELL, 15, '#ffe600', 0.6 + 0.4 * Math.abs(Math.sin(time * 4)));
    }
    if (bannerT > 0) drawText(`FASE ${level}`, W / 2, 7.5 * CELL, 26, '#ff2bd6', Math.min(1, bannerT * 2));
    if (st === 'gameover') drawText('FIM DE JOGO', W / 2, FRUIT_POS.y * CELL, 18, '#ff3b5c');
    if (st === 'dying' && stateT < 0.25) {
      ctx.fillStyle = `rgba(255,40,70,${0.3 * (1 - stateT / 0.25)})`;
      ctx.fillRect(0, 0, W, ROWS * CELL);
    }
    drawBottom();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- laço principal ---------- */
  function update(dt) {
    time += dt;
    shake = Math.max(0, shake - dt);
    bannerT = Math.max(0, bannerT - dt);
    for (const p of particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      p.vx *= 0.97; p.vy *= 0.97;
    }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) p.life -= dt;
    popups = popups.filter(p => p.life > 0);

    switch (state) {
      case 'menu':
        updateWorld(dt);
        break;
      case 'ready':
        stateT += dt;
        if (stateT >= readyLen) { state = 'play'; stateT = 0; sirenT = 0; }
        break;
      case 'play':
        updateWorld(dt);
        break;
      case 'eat':
        stateT += dt;
        // durante a pausa da pontuação só os olhos que já voltavam continuam andando
        for (const g of ghosts) if (g !== eatenGhost && (g.state === 'eaten' || g.state === 'entering')) moveGhost(g, ghostSpeed(g) * dt);
        if (stateT >= 0.75) { state = 'play'; eatenGhost = null; }
        break;
      case 'dying':
        stateT += dt;
        if (stateT > 0.9 && !deathSound) {
          deathSound = true;
          for (let i = 0; i < 9; i++) Sfx.tone(880 - i * 70, 0.14, 'square', 0.07, 700 - i * 70, i * 0.13);
        }
        if (stateT > 2.2 && stateT - dt <= 2.2) {
          burst(pac.x * CELL, pac.y * CELL, '#ffe600', 30, 110, 2.4);
          Sfx.noise(0.3, 0.2, 3000, 0, 'bandpass', 400);
        }
        if (stateT > 2.8) {
          if (!codes.has('KONAMI')) lives--;
          if (lives <= 0) { state = 'gameover'; stateT = 0; Sfx.lose(); } else {
            resetActors(); afterDeath = true; dotsSinceDeath = 0;
            state = 'ready'; stateT = 0; readyLen = 2;
          }
        }
        break;
      case 'clear':
        stateT += dt;
        if (stateT > 2.8) { state = 'inter'; stateT = 0; particles = []; interMusic((level - 1) % 2); }
        break;
      case 'inter':
        stateT += dt;
        if ((level - 1) % 2 === 1 && Math.random() < 0.6) {
          // confete do carnaval
          particles.push({ x: Math.random() * W, y: -4, vx: Arcade.rand(-20, 20), vy: Arcade.rand(40, 90), life: 3, max: 3, color: Arcade.pick(WALL_COLORS), size: 3, g: 10 });
        }
        if (stateT > INTER_LEN) nextLevel();
        break;
      case 'gameover':
        stateT += dt;
        if (stateT > 1.6) gameOver();
        break;
      default:
        break;
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
  Arcade.setupPads(stage, $('padBtn'), () => { if (pac) resize(); });
  addEventListener('resize', resize);
  fillDots();
  resetActors();
  resize();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
