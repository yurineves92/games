// Joias: tabuleiro 8×8, troque vizinhas para alinhar 3 ou mais iguais.
// 4 em linha vira RAIO, L/T vira BOMBA, 5 em linha vira ESTRELA. Cascatas sobem o combo.
// Modo clássico (níveis com meta de pontos e jogadas contadas) e contra o relógio (90 s).
(() => {
  const N = 8, C = 80, BX = 20, BY = 20;            // casas, lado da casa, origem do tabuleiro
  const W = 680, H = 720;                           // resolução lógica (tabuleiro + barra embaixo)
  const BAR_Y = BY + N * C + 30, BAR_H = 16;
  const TAU = Math.PI * 2;
  const MOVES = 20, MOVES_EXTRA = 10;               // jogadas por nível no clássico (+10 com TEMPO)
  const TIME = 90, TIME_CHEAT = 180;                // segundos no contra o relógio
  const HINT_DELAY = 6;                             // segundos parado até a dica piscar
  const GRAV = 46, VMAX = 20;                       // queda: aceleração (casas/s²) e velocidade máx.
  const POP = 0.24, BORN = 0.35;                    // duração do estouro e do surgimento de especial
  const MAX_PARTS = 320;

  const GEMS = [
    { name: 'BRASA', color: '#ff7a1a' },            // quadrado lapidado
    { name: 'SAFIRA', color: '#2f7bff' },           // losango
    { name: 'ESMERALDA', color: '#2bff6a' },        // redonda (brilhante)
    { name: 'CITRINO', color: '#ffd400' },          // triângulo
    { name: 'AMETISTA', color: '#a65bff' },         // hexágono
    { name: 'QUARTZO-ROSA', color: '#ff3fc8' },     // coração
    { name: 'ÁGUA-MARINHA', color: '#19e6ff' },     // gota
  ];
  const T = GEMS.length;

  // Cenários do modo clássico: um por nível (depois do 8º recomeçam com II, III...).
  const THEMES = [
    { name: 'CAVERNA DE QUARTZO', a: '#1c0b33', b: '#07030f', line: '#b26bff' },
    { name: 'RIO ESMERALDA', a: '#062b1c', b: '#020c08', line: '#39ff14' },
    { name: 'VULCÃO DE RUBI', a: '#330a12', b: '#0c0204', line: '#ff3b5c' },
    { name: 'GELEIRA DE SAFIRA', a: '#0a1c38', b: '#020610', line: '#4dd2ff' },
    { name: 'DESERTO DE CITRINO', a: '#2e2306', b: '#0c0902', line: '#ffd400' },
    { name: 'NEBULOSA ROSA', a: '#330a2b', b: '#0c020a', line: '#ff2bd6' },
    { name: 'ABISMO ÁGUA-MARINHA', a: '#032a30', b: '#010a0c', line: '#00e5ff' },
    { name: 'NÚCLEO NEON', a: '#22222a', b: '#050507', line: '#ffffff' },
  ];
  const CLOCK_THEME = 4;
  const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  const themeOf = lvl => (lvl - 1) % THEMES.length;
  const themeName = lvl => { const lap = Math.floor((lvl - 1) / THEMES.length); return THEMES[themeOf(lvl)].name + (lap < ROMAN.length ? ROMAN[lap] : ' +'); };
  const goalFor = lvl => 1000 + 500 * (lvl - 1);

  // Pontos: cada joia estourada, criar especial e detonar especial. Tudo × combo.
  const PTS = {
    gem: 20,
    make: { rh: 100, rv: 100, bomb: 200, star: 300 },
    boom: { rh: 100, rv: 100, bomb: 150, star: 250, cross: 300, big: 400, mega: 500, starspec: 600, all: 1000 },
  };
  const COMBO_TEXT = { 3: 'INCRÍVEL!', 4: 'ANIMAL!' };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), lvlLabel: $('hLvlLabel'), lvl: $('hLvl'), combo: $('hCombo'), status: $('hStatus') };

  /* ---------- configurações e códigos ---------- */
  const settings = { mode: 'classico' };
  Arcade.bindSettings(panels.menu, settings, 'joias_', () => syncMode());
  const codes = Arcade.codes('joias', {
    KONAMI: 'Toda cascata de 3+ cria uma joia especial',
    DICA: 'A dica aparece na hora, sempre',
    TEMPO: 'Relógio com 180 s e clássico com 30 jogadas por nível',
  }, $('codeMount'), () => syncMode());

  const hiKey = () => 'joias_hi_' + settings.mode;
  let hi = 0;
  function syncMode() {
    hi = +Arcade.store.get(hiKey(), 0) || 0;
    const tempo = codes.has('TEMPO');
    $('modeInfo').textContent = settings.mode === 'classico'
      ? `Bata a meta de pontos de cada nível em ${MOVES + (tempo ? MOVES_EXTRA : 0)} jogadas. A meta sobe a cada nível e o cenário muda.`
      : `${tempo ? TIME_CHEAT : TIME} segundos para fazer o máximo de pontos. Combos dão segundos extras.`;
    if (state === 'menu') { timeLeft = settings.mode === 'relogio' ? (tempo ? TIME_CHEAT : TIME) : 0; moves = MOVES + (tempo ? MOVES_EXTRA : 0); }
    updateHud();
  }

  /* ---------- utilidades de cor ---------- */
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (h, to, a) => { const c = rgb(h); return `rgb(${c.map((v, i) => Math.round(v + (to[i] - v) * a)).join(',')})`; };
  const lighten = (h, a) => mix(h, [255, 255, 255], a);
  const darken = (h, a) => mix(h, [0, 0, 0], a);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOutBack = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  /* ---------- formatos das joias (raio 1, centro 0,0; cx/cy = centro das facetas) ---------- */
  function poly(n, r, a0) {
    const p = [];
    for (let i = 0; i < n; i++) { const a = a0 + (i * TAU) / n; p.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return p;
  }
  const SHAPES = [
    { pts: [[-0.84, -0.6], [-0.6, -0.84], [0.6, -0.84], [0.84, -0.6], [0.84, 0.6], [0.6, 0.84], [-0.6, 0.84], [-0.84, 0.6]], cx: 0, cy: 0 },
    { pts: [[0, -1.04], [0.8, 0], [0, 1.04], [-0.8, 0]], cx: 0, cy: 0 },
    { pts: poly(12, 0.92, -Math.PI / 2 + TAU / 24), cx: 0, cy: 0 },
    { pts: [[0, -0.98], [0.98, 0.74], [-0.98, 0.74]], cx: 0, cy: 0.17 },
    { pts: poly(6, 0.95, -Math.PI / 2), cx: 0, cy: 0 },
    { pts: (() => {                                  // coração (curva clássica amostrada)
      const p = [];
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * TAU, s = Math.sin(t);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        p.push([(16 * s * s * s) / 16.5, (y - 2.5) / 15.5]);
      }
      return p;
    })(), cx: 0, cy: 0.1 },
    { pts: (() => {                                  // gota: ponta em cima, barriga redonda embaixo
      const p = [[0, -1]], cy = 0.32, r = 0.64;
      const a0 = (-28 * Math.PI) / 180, a1 = (208 * Math.PI) / 180;
      for (let i = 0; i <= 12; i++) { const a = a0 + ((a1 - a0) * i) / 12; p.push([Math.cos(a) * r, cy + Math.sin(a) * r]); }
      return p;
    })(), cx: 0, cy: 0.3 },
  ];

  // Joia lapidada: contorno com brilho, facetas sombreadas pela luz (vinda do alto à esquerda), mesa clara e reflexo.
  function drawFacetGem(g, R, color, shape) {
    const P = shape.pts.map(([x, y]) => [x * R, y * R]);
    const cx = shape.cx * R, cy = shape.cy * R;
    const path = pts => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    g.save();
    g.shadowColor = color; g.shadowBlur = R * 0.4;
    path(P); g.fillStyle = color; g.fill();
    g.restore();
    const Q = P.map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5 - R * 0.04]);
    for (let i = 0; i < P.length; i++) {
      const j = (i + 1) % P.length;
      const mx = (P[i][0] + P[j][0]) / 2 - cx, my = (P[i][1] + P[j][1]) / 2 - cy;
      const len = Math.hypot(mx, my) || 1;
      const l = (-0.55 * mx - 0.83 * my) / len;
      g.fillStyle = l > 0 ? lighten(color, l * 0.5) : darken(color, -l * 0.5);
      g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[j][0], P[j][1]); g.lineTo(Q[j][0], Q[j][1]); g.lineTo(Q[i][0], Q[i][1]); g.closePath();
      g.fill();
    }
    const tg = g.createLinearGradient(-R * 0.4, -R * 0.5, R * 0.4, R * 0.5);
    tg.addColorStop(0, lighten(color, 0.55)); tg.addColorStop(1, lighten(color, 0.1));
    path(Q); g.fillStyle = tg; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = R * 0.03;
    g.beginPath();
    for (let i = 0; i < P.length; i++) { g.moveTo(P[i][0], P[i][1]); g.lineTo(Q[i][0], Q[i][1]); }
    g.stroke();
    path(P); g.strokeStyle = lighten(color, 0.6); g.lineWidth = R * 0.05; g.stroke();
    sparkle(g, cx - R * 0.22, cy - R * 0.3, R * 0.2);
  }
  function sparkle(g, x, y, s) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s);
    g.fill();
    g.globalAlpha = 0.7; g.beginPath(); g.arc(x + s * 0.9, y + s * 0.9, s * 0.18, 0, TAU); g.fill(); g.globalAlpha = 1;
  }

  /* ---------- sprites pré-desenhados (refeitos a cada redimensionamento) ---------- */
  let spr = [], sprStar = null, ovRH = null, ovRV = null, ovBomb = null;
  const mk = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  function buildSprites(k) {
    const px = Math.max(16, Math.ceil(C * k)), R = px * 0.36;
    const make = fn => { const cv = mk(px), g = cv.getContext('2d'); g.translate(px / 2, px / 2); fn(g); return cv; };
    spr = GEMS.map((gm, t) => make(g => drawFacetGem(g, R, gm.color, SHAPES[t])));
    // ESTRELA: oito pontas com as sete cores
    sprStar = make(g => {
      const pts = [];
      for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i * TAU) / 16; const rr = i % 2 ? R * 0.48 : R * 1.05; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      let fill;
      if (g.createConicGradient) {
        fill = g.createConicGradient(0, 0, 0);
        GEMS.forEach((gm, i) => fill.addColorStop(i / T, gm.color));
        fill.addColorStop(1, GEMS[0].color);
      } else {
        fill = g.createRadialGradient(0, 0, 0, 0, 0, R);
        fill.addColorStop(0, '#ffffff'); fill.addColorStop(1, '#ffd400');
      }
      g.save(); g.shadowColor = '#ffffff'; g.shadowBlur = R * 0.5;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = fill; g.fill(); g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = R * 0.06; g.stroke();
      const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
      core.addColorStop(0, '#ffffff'); core.addColorStop(0.5, 'rgba(255,255,255,0.8)'); core.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = core; g.beginPath(); g.arc(0, 0, R * 0.5, 0, TAU); g.fill();
    });
    // RAIO: relâmpago branco atravessando a joia, com setas nas pontas
    const bolt = g => {
      const p = [[-1.08, 0], [-0.55, -0.22], [-0.18, 0.2], [0.18, -0.2], [0.55, 0.22], [1.08, 0]].map(([x, y]) => [x * R, y * R]);
      const line = () => {
        g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        for (const s of [-1, 1]) { g.moveTo(s * R * 0.82, -R * 0.24); g.lineTo(s * R * 1.12, 0); g.lineTo(s * R * 0.82, R * 0.24); }
      };
      g.lineJoin = 'round'; g.lineCap = 'round';
      line(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = R * 0.26; g.stroke();
      g.save(); g.shadowColor = '#ffffff'; g.shadowBlur = R * 0.35;
      line(); g.strokeStyle = '#ffffff'; g.lineWidth = R * 0.11; g.stroke(); g.restore();
    };
    ovRH = make(bolt);
    ovRV = make(g => { g.rotate(Math.PI / 2); bolt(g); });
    // BOMBA: anel tracejado escuro e brilhante em volta, com núcleo aceso
    ovBomb = make(g => {
      g.beginPath(); g.arc(0, 0, R * 1.08, 0, TAU); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = R * 0.22; g.stroke();
      g.save(); g.shadowColor = '#ffffff'; g.shadowBlur = R * 0.3;
      g.setLineDash([R * 0.32, R * 0.2]);
      g.beginPath(); g.arc(0, 0, R * 1.08, 0, TAU); g.strokeStyle = '#ffffff'; g.lineWidth = R * 0.09; g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(0, 0, R * 0.26, 0, TAU); g.fillStyle = 'rgba(10,0,20,0.8)'; g.fill();
      g.beginPath(); g.arc(0, 0, R * 0.14, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      g.restore();
    });
  }

  /* ---------- tela ---------- */
  let k = 1, themeIdx = 0, bgFade = 0;
  const bg = document.createElement('canvas'), bgOld = document.createElement('canvas');
  const scan = document.createElement('canvas');

  function resize() {
    k = Arcade.fit(canvas, W, H, wrap);
    buildBg(bg, THEMES[themeIdx]);
    bgFade = 0;
    buildScan();
    buildSprites(k);
  }

  function buildBg(cv, th) {
    cv.width = canvas.width; cv.height = canvas.height;
    const g = cv.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const grad = g.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.45, W * 0.8);
    grad.addColorStop(0, th.a); grad.addColorStop(1, th.b);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // poeira de cristal (sempre no mesmo lugar)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = th.line;
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.08 + rnd() * 0.25; const s = 1 + rnd() * 2; g.fillRect(rnd() * W, rnd() * H, s, s); }
    g.globalAlpha = 1;
    // casas em xadrez bem discreto
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      g.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.28)';
      g.fillRect(BX + c * C, BY + r * C, C, C);
    }
    // moldura do tabuleiro
    g.save();
    g.shadowColor = th.line; g.shadowBlur = 14;
    g.strokeStyle = th.line; g.globalAlpha = 0.85; g.lineWidth = 3;
    g.strokeRect(BX - 5, BY - 5, N * C + 10, N * C + 10);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.strokeRect(BX - 0.5, BY - 0.5, N * C + 1, N * C + 1);
    // trilho da barra
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(BX, BAR_Y, N * C, BAR_H);
    g.strokeStyle = th.line; g.globalAlpha = 0.45; g.strokeRect(BX - 0.5, BAR_Y - 0.5, N * C + 1, BAR_H + 1);
    g.globalAlpha = 1;
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.13)';
    const step = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 220));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.35, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  function setTheme(i, instant) {
    if (i === themeIdx && !instant) return;
    if (!instant) {
      bgOld.width = bg.width; bgOld.height = bg.height;
      bgOld.getContext('2d').drawImage(bg, 0, 0);
      bgFade = 1;
    } else bgFade = 0;
    themeIdx = i;
    buildBg(bg, THEMES[i]);
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let grid = [], phase = 'idle', phaseT = 0, phaseDur = 0;
  let swapPair = null, pendingBorn = [], konamiPending = false;
  let score = 0, level = 1, levelPts = 0, goal = goalFor(1), moves = MOVES;
  let timeLeft = TIME, timeMax = TIME, timeUp = false, lastSec = 0;
  let combo = 0, bestCombo = 0, specialsMade = 0, movesMade = 0;
  let sel = null, cursor = { r: 3, c: 3 }, showCursor = false, hint = null, idleT = 0;
  let particles = [], popups = [], beams = [], rings = [], zaps = [], bigText = null;
  let shakeT = 0, flashT = 0, time = 0, endT = 0, overT = 0, endMsg = '', barShown = 0, lastTick = 0;
  let demoT = 1.2, demoMove = null;

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  /* ---------- tabuleiro ---------- */
  const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
  const same = (a, b) => a && b && a.r === b.r && a.c === b.c;
  const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  function newGem(t, r, c, sp = null) {
    return { t: sp === 'star' ? -1 : t, sp, r, c, x: c, y: r, vy: 0, fx: c, fy: r, dying: false, delay: 0, burst: false, born: 0, land: 0 };
  }
  function put(r, c, g) { grid[r][c] = g; if (g) { g.r = r; g.c = c; } }
  // Cor da casa (-1 = vazia, estrela ou estourando).
  function typeAt(r, c) {
    const g = inB(r, c) && grid[r][c];
    return g && g.sp !== 'star' && !g.dying ? g.t : -1;
  }
  const eachGem = fn => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) fn(grid[r][c], r, c); };
  const randType = () => (Math.random() * T) | 0;

  // Ao gerar, evita trincas prontas.
  function safeType(r, c) {
    let t, n = 0;
    do { t = randType(); n++; } while (n < 30 && ((c >= 2 && typeAt(r, c - 1) === t && typeAt(r, c - 2) === t) || (r >= 2 && typeAt(r - 1, c) === t && typeAt(r - 2, c) === t)));
    return t;
  }

  function newBoard() {
    for (let tries = 0; tries < 60; tries++) {
      grid = Array.from({ length: N }, () => Array(N).fill(null));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) put(r, c, newGem(safeType(r, c), r, c));
      if (!findRuns().length && findMoves().length >= 3) break;
    }
    // entrada: as joias despencam de cima, coluna por coluna
    eachGem(g => { g.y = g.r - N - 0.6 - g.c * 0.28; g.vy = 0; });
    swapPair = null; pendingBorn = []; konamiPending = false;
    setPhase('fall');
  }

  function setPhase(p, dur = 0) { phase = p; phaseT = 0; phaseDur = dur; }
  function snapFrom() { eachGem(g => { g.fx = g.x; g.fy = g.y; }); }

  // Sequências de 3+ iguais na horizontal e na vertical.
  function findRuns() {
    const runs = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
      const t = typeAt(r, c); let e = c + 1;
      if (t >= 0) {
        while (e < N && typeAt(r, e) === t) e++;
        if (e - c >= 3) { const cells = []; for (let i = c; i < e; i++) cells.push([r, i]); runs.push({ dir: 'h', t, cells }); }
      }
      c = e;
    }
    for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
      const t = typeAt(r, c); let e = r + 1;
      if (t >= 0) {
        while (e < N && typeAt(e, c) === t) e++;
        if (e - r >= 3) { const cells = []; for (let i = r; i < e; i++) cells.push([i, c]); runs.push({ dir: 'v', t, cells }); }
      }
      r = e;
    }
    return runs;
  }

  // Junta sequências que se cruzam (L, T, +) num mesmo grupo.
  function groupRuns(runs) {
    const parent = runs.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map();
    runs.forEach((run, i) => {
      for (const [r, c] of run.cells) {
        const key = r * N + c;
        if (owner.has(key)) parent[find(i)] = find(owner.get(key)); else owner.set(key, i);
      }
    });
    const groups = new Map();
    runs.forEach((run, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, { t: run.t, runs: [] });
      groups.get(root).runs.push(run);
    });
    return [...groups.values()];
  }

  function groupSpecial(gr) {
    const longest = gr.runs.reduce((m, r) => (r.cells.length > m.cells.length ? r : m));
    const hasH = gr.runs.some(r => r.dir === 'h'), hasV = gr.runs.some(r => r.dir === 'v');
    if (longest.cells.length >= 5) return { sp: 'star', run: longest };
    if (hasH && hasV) return { sp: 'bomb', run: longest };
    if (longest.cells.length === 4) return { sp: longest.dir === 'h' ? 'rh' : 'rv', run: longest };
    return null;
  }

  // Onde nasce a especial: na casa da troca, senão no cruzamento (bomba) ou no meio da sequência.
  function spawnCell(gr, spec) {
    const cells = gr.runs.flatMap(r => r.cells);
    if (swapPair) for (const g of [swapPair.a, swapPair.b]) if (cells.some(([r, c]) => r === g.r && c === g.c)) return [g.r, g.c];
    if (spec.sp === 'bomb') {
      const h = new Set(), v = new Set();
      for (const run of gr.runs) for (const [r, c] of run.cells) (run.dir === 'h' ? h : v).add(r * N + c);
      for (const key of h) if (v.has(key)) return [Math.floor(key / N), key % N];
    }
    return spec.run.cells[Math.floor(spec.run.cells.length / 2)];
  }

  // Jogadas possíveis (para a dica, para a demo e para saber quando embaralhar).
  function lineAt(r, c) {
    const t = typeAt(r, c);
    if (t < 0) return false;
    let n = 1;
    for (let i = c - 1; typeAt(r, i) === t; i--) n++;
    for (let i = c + 1; typeAt(r, i) === t; i++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let i = r - 1; typeAt(i, c) === t; i--) n++;
    for (let i = r + 1; typeAt(i, c) === t; i++) n++;
    return n >= 3;
  }
  function findMoves() {
    const res = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (!inB(r2, c2)) continue;
        const a = grid[r][c], b = grid[r2][c2];
        if (!a || !b) continue;
        const m = { a: { r, c }, b: { r: r2, c: c2 } };
        if (a.sp === 'star' || b.sp === 'star' || (a.sp && b.sp)) { res.push(m); continue; }
        if (a.t === b.t) continue;
        grid[r][c] = b; grid[r2][c2] = a;
        const ok = lineAt(r, c) || lineAt(r2, c2);
        grid[r][c] = a; grid[r2][c2] = b;
        if (ok) res.push(m);
      }
    }
    return res;
  }

  /* ---------- estouros e especiais ---------- */
  const cellX = c => BX + c * C + C / 2, cellY = r => BY + r * C + C / 2;

  function makeBlast() { return { kill: new Map(), trig: new Set(), q: [], pts: 0, kinds: new Set() }; }
  // Marca uma casa para estourar; especial atingida entra na fila de detonação.
  function mark(B, r, c, delay = 0) {
    if (!inB(r, c)) return;
    const g = grid[r][c];
    if (!g) return;
    const key = r * N + c;
    if (B.kill.has(key)) return;
    B.kill.set(key, g);
    g.dying = true; g.delay = delay; g.burst = false;
    if (g.sp && !B.trig.has(g)) { B.trig.add(g); B.q.push({ kind: g.sp, r, c, t: g.t, delay: delay + 0.04 }); }
  }
  function commonType() {
    const n = Array(T).fill(0);
    eachGem(g => { if (!g.dying && g.t >= 0) n[g.t]++; });
    let best = 0;
    for (let t = 1; t < T; t++) if (n[t] > n[best]) best = t;
    return best;
  }

  function runBlasts(B) {
    while (B.q.length) {
      const e = B.q.shift();
      B.pts += PTS.boom[e.kind] || 0;
      B.kinds.add(e.kind);
      const at = (r, c) => mark(B, r, c, e.delay + 0.03 * Math.hypot(r - e.r, c - e.c));
      const wait = e.delay, x = cellX(e.c), y = cellY(e.r);
      const beam = (h, i) => beams.push({ h, i, life: 0.42, max: 0.42, wait });
      const ring = (r1, color) => rings.push({ x, y, r1, life: 0.45, max: 0.45, wait, color });
      switch (e.kind) {
        case 'rh': for (let c = 0; c < N; c++) at(e.r, c); beam(true, e.r); shakeT = Math.max(shakeT, 0.15); break;
        case 'rv': for (let r = 0; r < N; r++) at(r, e.c); beam(false, e.c); shakeT = Math.max(shakeT, 0.15); break;
        case 'cross':
          for (let i = 0; i < N; i++) { at(e.r, i); at(i, e.c); }
          beam(true, e.r); beam(false, e.c); shakeT = Math.max(shakeT, 0.3);
          break;
        case 'big':
          for (let d = -1; d <= 1; d++) {
            for (let i = 0; i < N; i++) { at(e.r + d, i); at(i, e.c + d); }
            if (inB(e.r + d, 0)) beam(true, e.r + d);
            if (inB(0, e.c + d)) beam(false, e.c + d);
          }
          shakeT = Math.max(shakeT, 0.4);
          break;
        case 'bomb':
          for (let r = e.r - 1; r <= e.r + 1; r++) for (let c = e.c - 1; c <= e.c + 1; c++) at(r, c);
          ring(C * 1.9, e.t >= 0 ? GEMS[e.t].color : '#ffffff'); shakeT = Math.max(shakeT, 0.28);
          break;
        case 'mega':
          for (let r = e.r - 2; r <= e.r + 2; r++) for (let c = e.c - 2; c <= e.c + 2; c++) at(r, c);
          ring(C * 3.2, '#ffffff'); ring(C * 2.2, '#ffd400'); shakeT = Math.max(shakeT, 0.45);
          break;
        case 'star': case 'starspec': {
          const t = e.t >= 0 ? e.t : commonType();
          const targets = [];
          eachGem((g, r, c) => {
            if (g.dying || g.t !== t) return;
            // estrela + raio/bomba: toda joia daquela cor vira especial e detona junto
            if (e.kind === 'starspec' && !g.sp) g.sp = e.spk === 'bomb' ? 'bomb' : (Math.random() < 0.5 ? 'rh' : 'rv');
            targets.push([cellX(c), cellY(r)]);
          });
          eachGem((g, r, c) => { if (!g.dying && g.t === t) at(r, c); });
          zaps.push({ x, y, targets: targets.map(([tx, ty]) => [tx, ty, Arcade.rand(-18, 18), Arcade.rand(-18, 18)]), color: GEMS[t].color, life: 0.5, max: 0.5, wait });
          flashT = Math.max(flashT, 0.25); shakeT = Math.max(shakeT, 0.3);
          break;
        }
        case 'all':
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) at(r, c);
          ring(C * 6, '#ffffff'); flashT = 0.7; shakeT = 0.6;
          break;
      }
    }
  }

  // Estouro normal: sequências que se formaram (na troca ou na cascata).
  function resolveStep(runs) {
    const B = makeBlast();
    const groups = groupRuns(runs);
    const born = [];
    for (const gr of groups) {
      const spec = groupSpecial(gr);
      if (spec) {
        const [r, c] = spawnCell(gr, spec);
        born.push({ r, c, t: gr.t, sp: spec.sp });
        B.pts += PTS.make[spec.sp];
      }
      for (const run of gr.runs) for (const [r, c] of run.cells) mark(B, r, c, 0);
    }
    runBlasts(B);
    finishStep(B, born, GEMS[groups[0].t].color);
  }

  // Troca envolvendo especiais: estrela com qualquer joia, ou duas especiais vizinhas.
  function specialSwap(a, b) {
    const B = makeBlast();
    let kind, t = -1, spk = null, r = a.r, c = a.c, color = '#ffffff', text = null;
    const sa = a.sp, sb = b.sp;
    if (sa === 'star' && sb === 'star') { kind = 'all'; text = 'SUPER NEON!'; }
    else if (sa === 'star' || sb === 'star') {
      const star = sa === 'star' ? a : b, other = star === a ? b : a;
      r = star.r; c = star.c; t = other.t; color = GEMS[t].color;
      if (other.sp) { kind = 'starspec'; spk = other.sp; text = other.sp === 'bomb' ? 'CHUVA DE BOMBAS!' : 'TEMPESTADE!'; }
      else kind = 'star';
      B.trig.add(star);
      B.q.push({ kind, r, c, t, spk, delay: 0 });
      mark(B, star.r, star.c, 0);
      if (kind === 'starspec') mark(B, other.r, other.c, 0.05);
      runBlasts(B);
      finishStep(B, [], color, text);
      return;
    } else {
      const raios = [sa, sb].filter(s => s === 'rh' || s === 'rv').length;
      kind = raios === 2 ? 'cross' : raios === 1 ? 'big' : 'mega';
      text = raios === 2 ? 'CRUZ DE RAIOS!' : raios === 1 ? 'SUPER RAIO!' : 'MEGABOMBA!';
      color = GEMS[a.t].color;
    }
    B.trig.add(a); B.trig.add(b);
    B.q.push({ kind, r, c, t, delay: 0 });
    mark(B, a.r, a.c, 0); mark(B, b.r, b.c, 0);
    runBlasts(B);
    finishStep(B, [], color, text);
  }

  function finishStep(B, born, color, text = null) {
    B.pts += B.kill.size * PTS.gem;
    const pts = B.pts * combo;
    score += pts;
    if (state === 'play' && settings.mode === 'classico') levelPts += pts;
    bestCombo = Math.max(bestCombo, combo);
    // placar flutuante no centro do estouro
    let sx = 0, sy = 0, maxDelay = 0;
    for (const g of B.kill.values()) { sx += g.c; sy += g.r; maxDelay = Math.max(maxDelay, g.delay); }
    const n = Math.max(1, B.kill.size);
    popups.push({ x: cellX(sx / n), y: cellY(sy / n), text: `+${pts}` + (combo > 1 ? ` x${combo}` : ''), color, life: 1, max: 1, size: combo > 2 ? 28 : 22 });
    // contra o relógio: combo dá segundos extras
    if (state === 'play' && settings.mode === 'relogio' && combo >= 2 && !timeUp) {
      timeLeft += combo - 1;
      popups.push({ x: cellX(3.5), y: BY + N * C - 30, text: `+${combo - 1} s`, color: '#39ff14', life: 1.1, max: 1.1, size: 24 });
    }
    // gritos de combo
    const shout = text || COMBO_TEXT[combo] || (combo >= 5 ? 'SUPER NEON!' : null);
    if (shout) {
      bigText = { text: shout, sub: combo >= 3 ? `COMBO x${combo}` : '', color: combo >= 5 || shout === 'SUPER NEON!' ? '#ff2bd6' : '#ffd400', life: 1.3, max: 1.3 };
      [523, 659, 784, 1047].forEach((f, i) => tone(f * (1 + Math.min(combo, 8) * 0.03), 0.12, 'square', 0.06, null, i * 0.05));
    }
    if (codes.has('KONAMI') && combo >= 3) konamiPending = true;
    // sons: o tom do estouro sobe com o combo
    const f = 330 * Math.pow(2, (Math.min(combo, 14) - 1) * 2 / 12);
    tone(f, 0.14, 'triangle', 0.15); tone(f * 1.5, 0.1, 'square', 0.05, null, 0.03); tone(f * 2, 0.09, 'sine', 0.06, null, 0.06);
    noise(0.12, 0.06, 5000, 0, 'highpass', 1500);
    const ks = B.kinds;
    if (ks.has('rh') || ks.has('rv') || ks.has('cross') || ks.has('big')) { tone(1500, 0.35, 'sawtooth', 0.07, 140); noise(0.3, 0.12, 4000, 0, 'highpass', 500); }
    if (ks.has('bomb') || ks.has('mega')) { noise(0.55, 0.38, 1400); tone(120, 0.45, 'sawtooth', 0.1, 40); }
    if (ks.has('star') || ks.has('starspec') || ks.has('all')) [784, 988, 1175, 1568, 1976].forEach((ff, i) => tone(ff, 0.12, 'square', 0.05, null, i * 0.05));
    if (born.length) tone(880, 0.12, 'square', 0.06, 1760, 0.1);
    pendingBorn = born;
    swapPair = null;
    setPhase('clear', POP + maxDelay + 0.02);
    updateHud();
  }

  // Fim do estouro: tira as joias, põe as especiais novas e faz tudo cair.
  function finishClear() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] && grid[r][c].dying) grid[r][c] = null;
    for (const b of pendingBorn) {
      const g = newGem(b.t, b.r, b.c, b.sp);
      g.born = BORN;
      put(b.r, b.c, g);
      if (state === 'play') specialsMade++;
      burst(cellX(b.c), cellY(b.r), '#ffffff', 10, 220, 3);
    }
    pendingBorn = [];
    gravity();
    // KONAMI: cascata de 3+ transforma uma joia qualquer em especial
    if (konamiPending) {
      konamiPending = false;
      const pool = [];
      eachGem(g => { if (!g.sp) pool.push(g); });
      if (pool.length) {
        const g = Arcade.pick(pool), roll = Math.random();
        g.sp = roll < 0.2 ? 'star' : roll < 0.6 ? 'bomb' : Math.random() < 0.5 ? 'rh' : 'rv';
        if (g.sp === 'star') g.t = -1;
        g.born = BORN;
        popups.push({ x: cellX(g.c), y: cellY(Math.max(0, g.r)), text: '★', color: '#ffd400', life: 0.9, max: 0.9, size: 30 });
        tone(1320, 0.15, 'square', 0.06, 2640);
      }
    }
    setPhase('fall');
  }

  function gravity() {
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        const g = grid[r][c];
        if (g) { if (r !== w) { grid[r][c] = null; put(w, c, g); } w--; }
      }
      const missing = w + 1;
      for (let r = w; r >= 0; r--) { const g = newGem(randType(), r, c); g.y = r - missing - 0.3; put(r, c, g); }
    }
  }

  function afterFall() {
    const runs = findRuns();
    if (runs.length) { combo++; resolveStep(runs); return; }
    settle();
  }

  // Tabuleiro parado: confere nível, fim de jogo e se ainda existe jogada.
  function settle() {
    swapPair = null;
    combo = 0;
    if (state === 'play') {
      if (settings.mode === 'classico') {
        if (levelPts >= goal) levelUp();
        else if (moves <= 0) finish('ACABARAM AS JOGADAS!');
      } else if (timeUp) finish('TEMPO ESGOTADO!');
    }
    const mv = findMoves();
    if (!mv.length) { startShuffle(); return; }
    hint = Arcade.pick(mv);
    idleT = 0;
    setPhase('idle');
    updateHud();
  }

  function startShuffle() {
    const gems = [];
    eachGem(g => gems.push(g));
    snapFrom();
    let ok = false;
    for (let tries = 0; tries < 300 && !ok; tries++) {
      for (let i = gems.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [gems[i], gems[j]] = [gems[j], gems[i]]; }
      gems.forEach((g, i) => put(Math.floor(i / N), i % N, g));
      if (tries > 100) for (const g of gems) if (!g.sp) g.t = randType();   // tabuleiro teimoso: troca as cores
      ok = !findRuns().length && findMoves().length > 0;
    }
    bigText = { text: 'SEM JOGADAS!', sub: 'EMBARALHANDO...', color: '#4dd2ff', life: 1.2, max: 1.2 };
    noise(0.6, 0.18, 600, 0, 'bandpass', 3000);
    tone(300, 0.5, 'triangle', 0.06, 900);
    setPhase('shuffle', 0.7);
  }

  function levelUp() {
    const bonus = moves * 50 * level;
    score += bonus;
    level++;
    goal = goalFor(level); levelPts = 0;
    moves = MOVES + (codes.has('TEMPO') ? MOVES_EXTRA : 0);
    setTheme(themeOf(level));
    bigText = { text: `NÍVEL ${level}!`, sub: themeName(level) + (bonus ? ` · BÔNUS +${bonus}` : ''), color: THEMES[themeOf(level)].line, life: 2, max: 2 };
    for (let i = 0; i < 6; i++) burst(Arcade.rand(BX, BX + N * C), Arcade.rand(BY, BY + N * C), THEMES[themeOf(level)].line, 12, 300, 4);
    flashT = 0.35;
    Sfx.win();
    updateHud();
  }

  /* ---------- partida ---------- */
  function canSwap() {
    if (phase !== 'idle') return false;
    if (state === 'menu') return true;
    return state === 'play' && !timeUp && (settings.mode !== 'classico' || moves > 0);
  }

  function requestSwap(a, b) {
    if (!canSwap() || !inB(b.r, b.c) || !adjacent(a, b)) return false;
    const ga = grid[a.r][a.c], gb = grid[b.r][b.c];
    if (!ga || !gb) return false;
    snapFrom();
    put(b.r, b.c, ga); put(a.r, a.c, gb);
    swapPair = { a: ga, b: gb };
    setPhase('swap', 0.16);
    tone(520, 0.06, 'square', 0.05, 760);
    idleT = 0;
    return true;
  }

  function afterSwap() {
    const { a, b } = swapPair;
    const special = a.sp === 'star' || b.sp === 'star' || (a.sp && b.sp);
    const runs = special ? null : findRuns();
    if (special || runs.length) {
      movesMade++;
      if (state === 'play' && settings.mode === 'classico') moves--;
      combo = 1;
      if (special) specialSwap(a, b); else resolveStep(runs);
      return;
    }
    // não formou nada: volta
    snapFrom();
    const ra = a.r, ca = a.c;
    put(b.r, b.c, a); put(ra, ca, b);
    setPhase('swapback', 0.18);
    tone(200, 0.14, 'sawtooth', 0.07, 130);
  }

  function resetGame(demo) {
    const tempo = !demo && codes.has('TEMPO');
    score = 0; level = 1; levelPts = 0; goal = goalFor(1);
    moves = MOVES + (tempo ? MOVES_EXTRA : 0);
    timeMax = settings.mode === 'relogio' ? (tempo ? TIME_CHEAT : TIME) : 0;
    timeLeft = timeMax; timeUp = false; lastSec = Math.ceil(timeLeft);
    combo = 0; bestCombo = 0; specialsMade = 0; movesMade = 0;
    sel = null; hint = null; idleT = 0; showCursor = false; cursor = { r: 3, c: 3 };
    particles = []; popups = []; beams = []; rings = []; zaps = []; bigText = null;
    shakeT = 0; flashT = 0; endT = 0; barShown = 0;
    demoT = 1.5; demoMove = null;
    setTheme(demo ? 0 : settings.mode === 'relogio' ? CLOCK_THEME : 0, true);
    newBoard();
  }

  function start() {
    Sfx.ensure();
    state = 'play';
    resetGame(false);
    hi = +Arcade.store.get(hiKey(), 0) || 0;
    show(null);
    bigText = { text: 'VALENDO!', sub: settings.mode === 'classico' ? `META: ${goal} PONTOS` : `${timeMax} SEGUNDOS`, color: '#ffd400', life: 1.4, max: 1.4 };
    Sfx.beep(true);
    updateHud();
  }

  function toMenu() {
    state = 'menu';
    resetGame(true);
    syncMode();
    show('menu');
  }

  function togglePause() {
    if (state === 'play') { pausedFrom = state; state = 'pause'; drag = null; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
  }

  function finish(msg) {
    state = 'ending'; endT = 1.6; endMsg = msg; sel = null;
    Sfx.lose();
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set(hiKey(), hi); }
    $('overTitle').textContent = endMsg || 'FIM DE JOGO';
    $('overScore').textContent = score;
    $('overInfo').textContent = settings.mode === 'classico'
      ? `Chegou ao nível ${level} (${themeName(level)}) · Maior combo x${Math.max(1, bestCombo)} · ${specialsMade} especiais`
      : `${movesMade} jogadas · Maior combo x${Math.max(1, bestCombo)} · ${specialsMade} especiais`;
    $('overRecord').hidden = !rec;
    Ranking.gameOver($('rankBox'), { board: 'joias-' + settings.mode, score, cheated });
    show('over');
    if (rec) Sfx.win();
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    if (settings.mode === 'classico') { hud.lvlLabel.textContent = 'NÍVEL'; hud.lvl.textContent = demo ? 1 : level; }
    else { hud.lvlLabel.textContent = 'TEMPO'; hud.lvl.textContent = Math.ceil(timeLeft); }
    hud.combo.textContent = 'x' + Math.max(1, demo ? 1 : combo);
    hud.status.textContent = settings.mode === 'classico' ? `JOGADAS ${moves}` : 'CONTRA O RELÓGIO';
  }

  /* ---------- efeitos ---------- */
  function burst(x, y, color, n, power = 200, size = 3) {
    for (let i = 0; i < n && particles.length < MAX_PARTS; i++) {
      const a = Math.random() * TAU, s = Arcade.rand(power * 0.25, power);
      const life = Arcade.rand(0.3, 0.75);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life, max: life, color, size: Arcade.rand(size * 0.6, size * 1.5) });
    }
  }

  /* ---------- entrada ---------- */
  const DIRS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };

  function selectSound() { tone(660, 0.05, 'square', 0.05); }

  // Seta: com joia pega no cursor, troca; senão, anda com o cursor.
  function moveDir(d) {
    if (sel && same(sel, cursor)) {
      const t = { r: cursor.r + d[0], c: cursor.c + d[1] };
      if (!inB(t.r, t.c)) { tone(150, 0.06, 'square', 0.04); return; }
      if (requestSwap(sel, t)) { cursor = t; sel = null; }
      return;
    }
    cursor = { r: Math.max(0, Math.min(N - 1, cursor.r + d[0])), c: Math.max(0, Math.min(N - 1, cursor.c + d[1])) };
    tone(440, 0.03, 'square', 0.03);
  }
  function pickAtCursor() {
    if (sel && same(sel, cursor)) { sel = null; return; }
    if (sel && adjacent(sel, cursor)) { if (requestSwap(sel, cursor)) { sel = null; return; } }
    sel = { ...cursor };
    selectSound();
  }

  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    const onButton = e.target.closest && e.target.closest('button, a, input');
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !onButton && !e.repeat && (state === 'menu' || overT > 0.8)) start();
      return;
    }
    if (state !== 'play') return;
    const d = DIRS[key];
    if (d) { showCursor = true; moveDir(d); return; }
    if ((key === ' ' || key === 'enter') && !e.repeat) { e.preventDefault(); showCursor = true; pickAtCursor(); }
  });

  // Posição do ponteiro em unidades lógicas e casa do tabuleiro.
  function pointAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const c = Math.floor((x - BX) / C), rr = Math.floor((y - BY) / C);
    return { x, y, cell: inB(rr, c) ? { r: rr, c } : null };
  }
  let drag = null;
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    if (state !== 'play') return;
    const p = pointAt(e);
    showCursor = false;
    if (!p.cell) { sel = null; return; }
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    cursor = { ...p.cell };
    drag = { id: e.pointerId, cell: p.cell, x0: p.x, y0: p.y, done: false, same: false };
    if (sel && adjacent(sel, p.cell) && requestSwap(sel, p.cell)) { sel = null; drag.done = true; return; }
    if (same(sel, p.cell)) drag.same = true;
    else { sel = p.cell; selectSound(); }
  });
  screen.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || drag.done || state !== 'play') return;
    const p = pointAt(e);
    const dx = p.x - drag.x0, dy = p.y - drag.y0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < C * 0.36) return;
    const d = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    const t = { r: drag.cell.r + d[0], c: drag.cell.c + d[1] };
    drag.done = true;
    if (inB(t.r, t.c) && requestSwap(drag.cell, t)) sel = null;
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.done && drag.same) sel = null;     // tocou de novo na mesma: solta
    drag = null;
  };
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);
  screen.addEventListener('contextmenu', e => e.preventDefault());

  const padPrev = { a: false, b: false, start: false };
  const padDir = { key: null, rep: 0 };
  function pollPad(dt) {
    const g = Arcade.gamepad(0);
    if (!g) return;
    if (g.start && !padPrev.start) togglePause();
    if (g.a && !padPrev.a) {
      if (state === 'menu' || (state === 'over' && overT > 0.8)) start();
      else if (state === 'play') { showCursor = true; pickAtCursor(); }
    }
    if (g.b && !padPrev.b && state === 'play') sel = null;
    padPrev.a = g.a; padPrev.b = g.b; padPrev.start = g.start;
    let d = null;
    if (g.ly < -0.5) d = [-1, 0]; else if (g.ly > 0.5) d = [1, 0]; else if (g.lx < -0.5) d = [0, -1]; else if (g.lx > 0.5) d = [0, 1];
    const key = d ? d.join() : null;
    if (key !== padDir.key) {
      padDir.key = key; padDir.rep = 0.3;
      if (d && state === 'play') { showCursor = true; moveDir(d); }
    } else if (d && state === 'play') {
      padDir.rep -= dt;
      // segurando: repete só o movimento do cursor (a troca é um toque por vez)
      if (padDir.rep <= 0) { padDir.rep = 0.12; if (!(sel && same(sel, cursor))) moveDir(d); }
    }
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
  $('pauseBtn').addEventListener('click', e => { Sfx.ensure(); togglePause(); e.currentTarget.blur(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

  /* ---------- atualização ---------- */
  function updateBoard(dt) {
    phaseT += dt;
    eachGem(g => {
      if (g.born > 0) g.born = Math.max(0, g.born - dt);
      if (g.land > 0) g.land = Math.max(0, g.land - dt);
    });
    if (phase === 'swap' || phase === 'swapback' || phase === 'shuffle') {
      const e = easeInOut(clamp01(phaseT / phaseDur));
      eachGem(g => { g.x = g.fx + (g.c - g.fx) * e; g.y = g.fy + (g.r - g.fy) * e; });
      if (phaseT >= phaseDur) {
        eachGem(g => { g.x = g.c; g.y = g.r; });
        if (phase === 'swap') afterSwap();
        else if (phase === 'swapback') { swapPair = null; setPhase('idle'); }
        else settle();
      }
    } else if (phase === 'clear') {
      eachGem(g => {
        if (g.dying && !g.burst && phaseT >= g.delay) {
          g.burst = true;
          burst(cellX(g.c), cellY(g.r), g.t >= 0 ? GEMS[g.t].color : '#ffffff', 6, 240, 3.5);
        }
      });
      if (phaseT >= phaseDur) finishClear();
    } else if (phase === 'fall') {
      let moving = false;
      eachGem(g => {
        g.x = g.c;
        if (g.y < g.r) {
          g.vy = Math.min(VMAX, g.vy + GRAV * dt);
          g.y += g.vy * dt;
          if (g.y >= g.r) {
            g.y = g.r; g.vy = 0; g.land = 0.14;
            if (time - lastTick > 0.05) { lastTick = time; tone(170 + Math.random() * 40, 0.035, 'triangle', 0.035); }
          } else moving = true;
        }
      });
      if (!moving) afterFall();
    }
  }

  function update(dt) {
    time += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    bgFade = Math.max(0, bgFade - dt * 1.2);
    if (state === 'over') overT += dt;

    if (state === 'play' && settings.mode === 'relogio' && !timeUp) {
      timeLeft -= dt;
      const s = Math.ceil(Math.max(0, timeLeft));
      if (s !== lastSec) {
        lastSec = s;
        if (s <= 10 && s > 0) tone(s <= 3 ? 1100 : 880, 0.06, 'square', 0.06);
        updateHud();
      }
      if (timeLeft <= 0) { timeLeft = 0; timeUp = true; sel = null; updateHud(); }
    }
    // tempo acabou com o tabuleiro parado (com cascata rolando, quem encerra é o settle)
    if (state === 'play' && timeUp && phase === 'idle') finish('TEMPO ESGOTADO!');

    if (state === 'play' || state === 'menu' || state === 'ending') updateBoard(dt);
    if (state === 'play' && phase === 'idle') idleT += dt;

    // demonstração atrás do menu
    if (state === 'menu' && phase === 'idle') {
      demoT -= dt;
      if (demoMove) {
        if (demoT <= 0) { requestSwap(demoMove.a, demoMove.b); demoMove = null; sel = null; demoT = 1.1; }
      } else if (demoT <= 0) {
        const mv = findMoves();
        if (mv.length) {
          const fancy = mv.filter(m => grid[m.a.r][m.a.c].sp || grid[m.b.r][m.b.c].sp);
          demoMove = fancy.length && Math.random() < 0.6 ? Arcade.pick(fancy) : Arcade.pick(mv);
          sel = { ...demoMove.a }; demoT = 0.45;
        }
      }
    }

    if (state === 'ending') { endT -= dt; if (endT <= 0) gameOver(); }

    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + 420 * dt; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 34 * dt; }
    popups = popups.filter(p => p.life > 0);
    for (const list of [beams, rings, zaps]) for (const f of list) { if (f.wait > 0) f.wait -= dt; else f.life -= dt; }
    beams = beams.filter(f => f.life > 0); rings = rings.filter(f => f.life > 0); zaps = zaps.filter(f => f.life > 0);
    if (bigText) { bigText.life -= dt; if (bigText.life <= 0) bigText = null; }

    let frac;
    if (state === 'menu') frac = 0.5 + 0.5 * Math.sin(time * 0.8);
    else if (settings.mode === 'classico') frac = clamp01(levelPts / goal);
    else frac = clamp01(timeLeft / timeMax);
    barShown += (frac - barShown) * Math.min(1, dt * 6);
  }

  /* ---------- desenho ---------- */
  function drawText(text, x, y, size, color, alpha = 1, glow = true) {
    ctx.globalAlpha = clamp01(alpha);
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawGem(g) {
    const x = BX + g.x * C + C / 2, y = BY + g.y * C + C / 2;
    let s = 1, a = 1, sx = 1, sy = 1, p = 0;
    if (g.dying && phase === 'clear') { p = clamp01((phaseT - g.delay) / POP); s = 1 + 0.45 * p; a = 1 - p; }
    if (g.born > 0) s *= Math.max(0.05, easeOutBack(1 - g.born / BORN));
    if (g.land > 0) { const q = g.land / 0.14; sx = 1 + 0.12 * q; sy = 1 - 0.12 * q; }
    if (sel && sel.r === g.r && sel.c === g.c && !g.dying) s *= 1.07 + 0.05 * Math.sin(time * 12);
    const w = C * s * sx, h = C * s * sy, oy = (C * s - h) * 0.45;
    if (a > 0.01) {
      ctx.globalAlpha = a;
      if (g.sp === 'star') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(time * 1.6);
        const ps = 1 + 0.06 * Math.sin(time * 6);
        ctx.drawImage(sprStar, (-w * ps) / 2, (-h * ps) / 2, w * ps, h * ps);
        ctx.restore();
      } else {
        ctx.drawImage(spr[g.t], x - w / 2, y - h / 2 + oy, w, h);
        if (g.sp === 'rh' || g.sp === 'rv') {
          ctx.globalAlpha = a * (0.8 + 0.2 * Math.sin(time * 9 + g.c));
          ctx.drawImage(g.sp === 'rh' ? ovRH : ovRV, x - w / 2, y - h / 2 + oy, w, h);
        } else if (g.sp === 'bomb') {
          ctx.save(); ctx.translate(x, y + oy); ctx.rotate(time * 2);
          const ps = 1 + 0.07 * Math.sin(time * 7);
          ctx.drawImage(ovBomb, (-w * ps) / 2, (-h * ps) / 2, w * ps, h * ps);
          ctx.restore();
        }
      }
    }
    if (p > 0 && p < 1) {
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, C * 0.32 * (0.5 + p), 0, TAU); ctx.fill();
    }
    if (g.born > 0) {
      const q = g.born / BORN;
      ctx.globalAlpha = q; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, C * (0.55 - 0.2 * q), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBar() {
    const th = THEMES[themeIdx];
    let left, right, col = th.line, rightCol = '#f1e9ff', mid = '';
    if (state === 'menu') { left = 'DEMONSTRAÇÃO'; right = 'APERTE INICIAR'; }
    else if (settings.mode === 'classico') {
      left = `NÍVEL ${level} · ${themeName(level)}`;
      right = `JOGADAS ${moves}`;
      mid = `${levelPts}/${goal}`;
      if (moves <= 3) rightCol = Math.floor(time * 4) % 2 ? '#ff3b5c' : '#ffffff';
    } else {
      left = 'CONTRA O RELÓGIO';
      right = `TEMPO ${Math.ceil(timeLeft)}`;
      if (timeLeft <= 10) { col = '#ff3b5c'; rightCol = Math.floor(time * 4) % 2 ? '#ff3b5c' : '#ffffff'; }
    }
    ctx.font = '20px "Share Tech Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#cbbfe0'; ctx.textAlign = 'left'; ctx.fillText(left, BX, BAR_Y - 13);
    ctx.fillStyle = rightCol; ctx.textAlign = 'right'; ctx.fillText(right, BX + N * C, BAR_Y - 13);
    const w = N * C * barShown;
    if (w > 0) {
      const g = ctx.createLinearGradient(BX, 0, BX + N * C, 0);
      g.addColorStop(0, darken(col, 0.35)); g.addColorStop(1, col);
      ctx.fillStyle = g;
      ctx.fillRect(BX, BAR_Y, w, BAR_H);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(BX, BAR_Y, w, 3);
    }
    if (mid) {
      ctx.font = '13px "Share Tech Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.fillText(mid, BX + (N * C) / 2, BAR_Y + BAR_H / 2 + 1);
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    if (bgFade > 0) { ctx.globalAlpha = bgFade; ctx.drawImage(bgOld, 0, 0); ctx.globalAlpha = 1; }
    const sx = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 18 : 0, sy = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 18 : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    // dica: a jogada possível pulsa de leve
    const hintOn = state === 'play' && phase === 'idle' && hint && (codes.has('DICA') || (!sel && idleT > HINT_DELAY));
    if (hintOn) {
      const al = 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(time * 5));
      ctx.fillStyle = `rgba(255,255,255,${al})`;
      for (const h of [hint.a, hint.b]) { roundRect(BX + h.c * C + 4, BY + h.r * C + 4, C - 8, C - 8, 10); ctx.fill(); }
    }

    // joias (o que ainda está acima do tabuleiro fica escondido)
    ctx.save();
    ctx.beginPath(); ctx.rect(BX, BY, N * C, N * C); ctx.clip();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c]) drawGem(grid[r][c]);
    ctx.restore();

    // seleção e cursor
    if (sel && state !== 'ending') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 10);
      roundRect(BX + sel.c * C + 3, BY + sel.r * C + 3, C - 6, C - 6, 10); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (showCursor && state === 'play') {
      ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 3; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -time * 30;
      roundRect(BX + cursor.c * C + 7, BY + cursor.r * C + 7, C - 14, C - 14, 8); ctx.stroke();
      ctx.setLineDash([]);
    }

    // raios, anéis e relâmpagos das especiais
    ctx.globalCompositeOperation = 'lighter';
    for (const b of beams) {
      if (b.wait > 0) continue;
      const q = b.life / b.max, th = C * (0.25 + 0.75 * q);
      ctx.fillStyle = `rgba(255,255,255,${0.75 * q})`;
      if (b.h) ctx.fillRect(BX, cellY(b.i) - th / 2, N * C, th); else ctx.fillRect(cellX(b.i) - th / 2, BY, th, N * C);
      ctx.fillStyle = `rgba(255,212,0,${0.5 * q})`;
      if (b.h) ctx.fillRect(BX, cellY(b.i) - th, N * C, th * 2); else ctx.fillRect(cellX(b.i) - th, BY, th * 2, N * C);
    }
    for (const f of rings) {
      if (f.wait > 0) continue;
      const q = f.life / f.max;
      ctx.globalAlpha = q; ctx.strokeStyle = f.color; ctx.lineWidth = 10 * q + 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r1 * (1 - q * 0.85), 0, TAU); ctx.stroke();
    }
    for (const z of zaps) {
      if (z.wait > 0) continue;
      const q = z.life / z.max;
      ctx.globalAlpha = q; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (const [tx, ty, jx, jy] of z.targets) {
        ctx.moveTo(z.x, z.y);
        ctx.lineTo((z.x + tx) / 2 + jx, (z.y + ty) / 2 + jy);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      ctx.strokeStyle = z.color; ctx.lineWidth = 7; ctx.globalAlpha = q * 0.5; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of particles) {
      ctx.globalAlpha = clamp01(p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, flashT)})`; ctx.fillRect(BX, BY, N * C, N * C); }

    for (const p of popups) drawText(p.text, p.x, p.y, p.size, p.color, Math.min(1, (p.life / p.max) * 2.5), false);

    drawBar();

    if (bigText) {
      const q = bigText.life / bigText.max, inT = clamp01((1 - q) * 6);
      const size = 54 * (0.6 + 0.4 * easeOutBack(inT));
      drawText(bigText.text, W / 2, BY + N * C * 0.42, size, bigText.color, Math.min(1, q * 3));
      if (bigText.sub) drawText(bigText.sub, W / 2, BY + N * C * 0.42 + 50, 20, '#ffffff', Math.min(1, q * 3), false);
    }

    if (state === 'ending') {
      ctx.fillStyle = 'rgba(5,2,12,0.45)'; ctx.fillRect(BX, BY, N * C, N * C);
      drawText(endMsg, W / 2, BY + (N * C) / 2, 40, '#ff3b5c', 1);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scan, 0, 0);
  }

  /* ---------- laço principal ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    pollPad(dt);
    if (state !== 'pause') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  Arcade.bindMute($('muteBtn'));
  addEventListener('resize', resize);
  resize();
  resetGame(true);
  syncMode();
  show('menu');
  requestAnimationFrame(frame);
})();
