// Quadrix: blocos que caem num poço 10x20, com rotação estilo SRS, HOLD, peça fantasma e fila de próximas.
(() => {
  /* ---------- constantes ---------- */
  const COLS = 10, VIS = 20, HIDDEN = 2, ROWS = VIS + HIDDEN; // 2 linhas escondidas acima do poço
  const CELL = 30, BW = COLS * CELL, BH = VIS * CELL;
  const DAS = 0.167, ARR = 0.033;       // atraso até repetir o movimento lateral e intervalo da repetição (s)
  const SOFT = 0.025;                   // tempo por linha no soft drop (s)
  const LOCK_DELAY = 0.5, LOCK_RESETS = 15;
  const LINE_PTS = [0, 100, 300, 500, 800];
  const ULTRA_TIME = 120;
  const GLOW = 7;                       // margem do brilho em volta de cada bloco (unidades lógicas)

  // Peças: I J L O S T Z. Cada uma com sua cor neon.
  const NAMES = 'IJLOSTZ';
  const COLORS = ['#00f0ff', '#2f7bff', '#ff9320', '#ffe600', '#3dff5a', '#d040ff', '#ff2d55'];
  const GREY = '#4a4560';
  const BASE = [
    ['....', 'XXXX', '....', '....'],
    ['X..', 'XXX', '...'],
    ['..X', 'XXX', '...'],
    ['.XX.', '.XX.', '....', '....'],
    ['.XX', 'XX.', '...'],
    ['.X.', 'XXX', '...'],
    ['XX.', '.XX', '...'],
  ];
  const I = 0, O = 3;

  // As 4 rotações de cada peça, girando a caixa NxN no sentido horário (o O não gira).
  const SHAPES = BASE.map((rows, t) => {
    const N = rows.length;
    let m = rows.map(r => [...r].map(c => c === 'X'));
    const out = [];
    for (let r = 0; r < 4; r++) {
      const cells = [];
      m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
      out.push(cells);
      if (t !== O) m = m.map((row, y) => row.map((_, x) => m[N - 1 - x][y]));
    }
    return out;
  });

  // Tabelas de "wall kick" do SRS. Lá o y cresce para cima; aqui cresce para baixo, por isso o sinal invertido.
  const K = s => s.split(' ').map(p => { const [x, y] = p.split(',').map(Number); return [x, -y]; });
  const KICKS = {
    '01': K('0,0 -1,0 -1,1 0,-2 -1,-2'), '10': K('0,0 1,0 1,-1 0,2 1,2'),
    '12': K('0,0 1,0 1,-1 0,2 1,2'), '21': K('0,0 -1,0 -1,1 0,-2 -1,-2'),
    '23': K('0,0 1,0 1,1 0,-2 1,-2'), '32': K('0,0 -1,0 -1,-1 0,2 -1,2'),
    '30': K('0,0 -1,0 -1,-1 0,2 -1,2'), '03': K('0,0 1,0 1,1 0,-2 1,-2'),
  };
  const KICKS_I = {
    '01': K('0,0 -2,0 1,0 -2,-1 1,2'), '10': K('0,0 2,0 -1,0 2,1 -1,-2'),
    '12': K('0,0 -1,0 2,0 -1,2 2,-1'), '21': K('0,0 1,0 -2,0 1,-2 -2,1'),
    '23': K('0,0 2,0 -1,0 2,1 -1,-2'), '32': K('0,0 -2,0 1,0 -2,-1 1,2'),
    '30': K('0,0 1,0 -2,0 1,-2 -2,1'), '03': K('0,0 -1,0 2,0 -1,2 2,-1'),
  };

  // Dois arranjos da tela: largo (HOLD à esquerda, próximas à direita) e alto (tudo em cima do poço).
  const LAYOUTS = {
    wide: {
      W: 600, H: 624, bx: 150, by: 12,
      hold: { x: 12, y: 12, w: 126, h: 108 }, stats: { x: 12, y: 132, w: 126, h: 300 },
      next: { x: 462, y: 12, w: 126, h: 300 },
    },
    tall: {
      W: 320, H: 718, bx: 10, by: 108,
      hold: { x: 10, y: 8, w: 84, h: 90 }, stats: null,
      next: { x: 102, y: 8, w: 208, h: 90 },
    },
  };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), stage = $('stage');
  const overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), level: $('hLevel'), lines: $('hLines'), status: $('hStatus') };

  /* ---------- configurações ---------- */
  const settings = { mode: 'maratona' };
  const MODE_INFO = {
    maratona: 'Jogue até o poço encher. A cada 10 linhas o nível sobe e as peças caem mais rápido.',
    ultra: 'Você tem 2 minutos. Faça o máximo de pontos antes que o tempo acabe!',
  };
  Arcade.bindSettings(panels.menu, settings, 'quadrix_', () => { syncModeInfo(); updateHud(); });
  const codes = Arcade.codes('quadrix', {
    KONAMI: 'Peças arco-íris piscantes',
    PALITO: 'Só vem a peça reta (I)',
    ZEN: 'A velocidade não aumenta',
  }, $('codeMount'));
  const hiKey = () => 'quadrix_hi_' + settings.mode;
  const getHi = () => +Arcade.store.get(hiKey(), 0) || 0;
  function syncModeInfo() { $('modeInfo').textContent = MODE_INFO[settings.mode] || ''; }

  /* ---------- tela ---------- */
  let k = 1, L = LAYOUTS.wide, W = L.W, H = L.H;
  const layer = document.createElement('canvas'); // painéis e poço vazio (estáticos)
  let bgGrad = null;
  const sprites = new Map();

  function resize() {
    // Escolhe o arranjo que deixa as casas maiores no espaço disponível.
    const { w, h } = Arcade.innerSize(wrap);
    const sW = Math.min(w / LAYOUTS.wide.W, h / LAYOUTS.wide.H);
    const sT = Math.min(w / LAYOUTS.tall.W, h / LAYOUTS.tall.H);
    L = sT > sW * 1.04 ? LAYOUTS.tall : LAYOUTS.wide;
    W = L.W; H = L.H;
    k = Arcade.fit(canvas, W, H, wrap);
    sprites.clear();
    buildLayer();
  }

  // Bloco neon pré-desenhado (com brilho) para não recalcular sombra a cada quadro.
  function sprite(color) {
    let s = sprites.get(color);
    if (s) return s;
    s = document.createElement('canvas');
    const size = CELL + GLOW * 2;
    s.width = s.height = Math.max(4, Math.ceil(size * k));
    const g = s.getContext('2d');
    g.scale(s.width / size, s.height / size);
    g.translate(GLOW, GLOW);
    g.shadowColor = color; g.shadowBlur = 9 * k;
    g.fillStyle = color;
    roundRect(g, 1.5, 1.5, CELL - 3, CELL - 3, 4); g.fill();
    g.shadowBlur = 0;
    // volume: luz em cima à esquerda, sombra embaixo à direita
    const gr = g.createLinearGradient(0, 0, CELL, CELL);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    gr.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = gr;
    roundRect(g, 1.5, 1.5, CELL - 3, CELL - 3, 4); g.fill();
    // miolo escuro com filete claro: cara de "vidro" neon
    g.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(g, 7, 7, CELL - 14, CELL - 14, 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(5, CELL - 9); g.lineTo(5, 5); g.lineTo(CELL - 9, 5); g.stroke();
    sprites.set(color, s);
    return s;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function panelBox(g, b, label) {
    g.save();
    g.fillStyle = 'rgba(6,4,20,0.82)';
    roundRect(g, b.x, b.y, b.w, b.h, 6); g.fill();
    g.strokeStyle = 'rgba(0,229,255,0.55)'; g.lineWidth = 1.5;
    g.shadowColor = '#00e5ff'; g.shadowBlur = 8 * k;
    roundRect(g, b.x, b.y, b.w, b.h, 6); g.stroke();
    g.restore();
    if (label) {
      g.font = `700 ${L === LAYOUTS.tall ? 10 : 12}px Orbitron, sans-serif`;
      g.fillStyle = '#7fefff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, b.x + b.w / 2, b.y + 14);
    }
  }

  function buildLayer() {
    layer.width = canvas.width; layer.height = canvas.height;
    const g = layer.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, W, H);
    panelBox(g, L.hold, 'HOLD');
    panelBox(g, L.next, 'PRÓXIMAS');
    if (L.stats) panelBox(g, L.stats, null);
    // poço
    g.fillStyle = 'rgba(2,5,14,0.94)';
    g.fillRect(L.bx, L.by, BW, BH);
    for (let x = 0; x < COLS; x += 2) { g.fillStyle = 'rgba(0,229,255,0.018)'; g.fillRect(L.bx + x * CELL, L.by, CELL, BH); }
    g.strokeStyle = 'rgba(0,229,255,0.07)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < COLS; x++) { g.moveTo(L.bx + x * CELL, L.by); g.lineTo(L.bx + x * CELL, L.by + BH); }
    for (let y = 1; y < VIS; y++) { g.moveTo(L.bx, L.by + y * CELL); g.lineTo(L.bx + BW, L.by + y * CELL); }
    g.stroke();
    bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0b0424'); bgGrad.addColorStop(0.6, '#05020f'); bgGrad.addColorStop(1, '#100318');
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let G = null;            // partida atual (ou a demonstração do menu)
  let time = 0, countT = 0, lastBeat = 0, goT = 0, deathT = 0, endReason = 'topout';
  let particles = [], popups = [], trails = [], flashes = [], floaters = [];
  let shakeT = 0, shakeMag = 0, whiteT = 0, levelT = 0, lastSec = -1;
  const das = { dir: 0, t: 0, arr: 0 };

  function newGame() {
    return {
      grid: Array.from({ length: ROWS }, () => new Array(COLS).fill(0)),
      cur: null, hold: null, canHold: true, queue: [],
      score: 0, lines: 0, level: 1, combo: -1, maxCombo: 0, quads: 0, pieces: 0,
      time: 0, left: ULTRA_TIME,
      fallT: 0, lockT: 0, resets: 0, lowest: 0,
      clearRows: [], clearT: 0, clearDur: 0,
      plan: null, demoT: 0,
    };
  }

  // Saco de 7: cada peça aparece uma vez a cada 7 (com PALITO, só a reta).
  function fillQueue() {
    while (G.queue.length < 7) {
      if (codes.has('PALITO')) { for (let i = 0; i < 7; i++) G.queue.push(I); continue; }
      const bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; }
      G.queue.push(...bag);
    }
  }
  function takeNext() {
    fillQueue();
    const t = G.queue.shift();
    fillQueue();
    return t;
  }

  // Curva clássica de velocidade: segundos por linha em cada nível.
  function gravity() {
    const lv = state === 'menu' || codes.has('ZEN') ? 1 : Math.min(G.level, 20);
    return Math.pow(0.8 - (lv - 1) * 0.007, lv - 1);
  }

  function fits(t, r, x, y, grid = G.grid) {
    for (const [cx, cy] of SHAPES[t][r]) {
      const gx = x + cx, gy = y + cy;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
      if (gy >= 0 && grid[gy][gx]) return false;
    }
    return true;
  }
  const onGround = () => !fits(G.cur.t, G.cur.r, G.cur.x, G.cur.y + 1);
  function ghostY() {
    const c = G.cur;
    let y = c.y;
    while (fits(c.t, c.r, c.x, y + 1)) y++;
    return y;
  }

  // Sons só durante a partida (a demonstração do menu joga calada).
  const snd = f => { if (state !== 'menu') f(); };

  // Coloca uma peça no topo. Se não couber nem nas linhas escondidas, o poço encheu.
  function setPiece(t) {
    const y0 = t === I ? HIDDEN - 1 : HIDDEN;
    for (let dy = 0; dy <= 2; dy++) {
      if (fits(t, 0, 3, y0 - dy)) {
        G.cur = { t, r: 0, x: 3, y: y0 - dy };
        G.fallT = 0; G.lockT = 0; G.resets = 0; G.lowest = G.cur.y;
        if (state === 'menu') { G.plan = plan(t); G.demoT = 0.25; }
        return true;
      }
    }
    G.cur = null;
    topOut();
    return false;
  }
  function spawn() { G.canHold = true; setPiece(takeNext()); }

  // Movimento ou rotação bem-sucedidos renovam o lock delay (até LOCK_RESETS vezes).
  function afterShift() {
    if (G.lockT > 0 && G.resets < LOCK_RESETS) { G.lockT = 0; G.resets++; }
  }
  function descended() {
    if (G.cur.y > G.lowest) { G.lowest = G.cur.y; G.resets = 0; G.lockT = 0; }
  }

  function shift(dir) {
    const c = G && G.cur;
    if (!c || G.clearT > 0) return false;
    if (!fits(c.t, c.r, c.x + dir, c.y)) return false;
    c.x += dir;
    afterShift();
    snd(() => Sfx.tone(240, 0.03, 'square', 0.035));
    return true;
  }

  function rotate(dir) {
    const c = G && G.cur;
    if (!c || G.clearT > 0) return false;
    if (c.t === O) { snd(() => Sfx.tone(480, 0.04, 'triangle', 0.05, 560)); return true; }
    const to = (c.r + dir + 4) % 4;
    const table = (c.t === I ? KICKS_I : KICKS)[`${c.r}${to}`];
    for (const [dx, dy] of table) {
      if (fits(c.t, to, c.x + dx, c.y + dy)) {
        c.x += dx; c.y += dy; c.r = to;
        afterShift();
        descended();
        snd(() => Sfx.tone(dir > 0 ? 480 : 420, 0.05, 'triangle', 0.07, dir > 0 ? 760 : 300));
        return true;
      }
    }
    return false;
  }

  function softStep() {
    const c = G.cur;
    if (!c || G.clearT > 0 || !fits(c.t, c.r, c.x, c.y + 1)) return false;
    c.y++; G.score += 1; G.fallT = 0;
    descended();
    return true;
  }

  function hardDrop() {
    const c = G && G.cur;
    if (!c || G.clearT > 0) return;
    const gy = ghostY(), d = gy - c.y;
    if (state === 'play') G.score += 2 * d;
    // rastro de luz em cada coluna da peça
    if (d > 0) {
      const cols = new Map();
      for (const [cx, cy] of SHAPES[c.t][c.r]) {
        const x = c.x + cx;
        const top = Math.min(cols.has(x) ? cols.get(x)[0] : 99, c.y + cy);
        const bot = Math.max(cols.has(x) ? cols.get(x)[1] : -99, gy + cy);
        cols.set(x, [top, bot]);
      }
      for (const [x, [top, bot]] of cols) trails.push({ x, top, bot, color: COLORS[c.t], life: 0.28 });
    }
    c.y = gy;
    shake(0.12, 2.5);
    snd(() => { Sfx.noise(0.16, 0.25, 1400, 0, 'lowpass', 90); Sfx.tone(170, 0.12, 'square', 0.09, 60); });
    lockPiece(true);
  }

  function holdPiece() {
    const c = G && G.cur;
    if (!c || !G.canHold || G.clearT > 0) return;
    const t = c.t;
    G.canHold = false;
    snd(() => Sfx.tone(700, 0.08, 'sine', 0.09, 350));
    if (G.hold === null) { G.hold = t; setPiece(takeNext()); }
    else { const h = G.hold; G.hold = t; setPiece(h); }
  }

  function lockPiece(hard) {
    const c = G.cur;
    let above = true;
    const cells = [];
    for (const [cx, cy] of SHAPES[c.t][c.r]) {
      const x = c.x + cx, y = c.y + cy;
      if (y >= 0) G.grid[y][x] = c.t + 1;
      if (y >= HIDDEN) above = false;
      cells.push([x, y]);
    }
    flashes.push({ cells, life: 0.22 });
    G.cur = null;
    G.pieces++;
    if (!hard) snd(() => Sfx.tone(130, 0.06, 'square', 0.07, 90));
    if (above) { topOut(); return; } // travou inteira acima do poço

    const full = [];
    for (let y = 0; y < ROWS; y++) if (G.grid[y].every(Boolean)) full.push(y);
    if (!full.length) { G.combo = -1; spawn(); return; }

    const n = full.length, demo = state === 'menu';
    G.combo++;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    let pts = LINE_PTS[n] * G.level;
    if (G.combo > 0) pts += 50 * G.combo * G.level;
    if (!demo) G.score += pts;
    G.lines += n;
    if (n === 4) G.quads++;
    G.clearRows = full;
    G.clearDur = G.clearT = n === 4 ? 0.5 : 0.32;

    // partículas saindo de cada bloco apagado
    for (const y of full) {
      for (let x = 0; x < COLS; x++) {
        const color = cellColor(G.grid[y][x] - 1, x, y);
        for (let i = 0; i < (n === 4 ? 4 : 2); i++) {
          const a = Arcade.rand(-Math.PI, 0), s = Arcade.rand(60, n === 4 ? 420 : 260);
          particles.push({
            x: L.bx + (x + 0.5) * CELL, y: L.by + (y - HIDDEN + 0.5) * CELL,
            vx: Math.cos(a) * s + (x - 4.5) * 18, vy: Math.sin(a) * s,
            life: Arcade.rand(0.5, 1.1), max: 1.1, color, size: Arcade.rand(3, 7),
          });
        }
      }
    }
    if (particles.length > 900) particles.splice(0, particles.length - 900);

    if (!demo) {
      const names = ['', 'SIMPLES', 'DUPLA', 'TRIPLA', 'QUADRIX!'];
      const midY = L.by + (full[0] - HIDDEN + n / 2) * CELL;
      if (n === 4) {
        popup('QUADRIX!', 44, '#00f0ff', midY - 10, 1.4, true);
        shake(0.45, 9); whiteT = 0.3;
        Sfx.noise(0.6, 0.35, 3000, 0, 'highpass', 400);
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => Sfx.tone(f, 0.16, 'square', 0.1, null, i * 0.06));
        Sfx.tone(110, 0.5, 'sawtooth', 0.12, 40);
      } else {
        if (n > 1) popup(names[n], 30, '#7fefff', midY - 8, 1);
        [523, 659, 784].slice(0, n).forEach((f, i) => Sfx.tone(f, 0.12, 'square', 0.09, null, i * 0.05));
        Sfx.noise(0.25, 0.18, 2400, 0, 'bandpass', 600);
      }
      popup(`+${pts}`, 18, '#ffe600', midY + 24, 1);
      if (G.combo > 0) {
        popup(`COMBO ×${G.combo}`, 22, '#ff2bd6', midY + 52, 1.1);
        Sfx.tone(660 * Math.pow(2, Math.min(G.combo, 12) / 12), 0.14, 'triangle', 0.1, null, 0.12);
      }
    }
    const lv = Math.floor(G.lines / 10) + 1;
    if (lv > G.level) {
      G.level = lv;
      if (!demo) {
        popup(`NÍVEL ${lv}`, 32, '#3dff5a', L.by + BH * 0.3, 1.6);
        levelT = 1.2;
        [392, 523, 659, 784, 1047].forEach((f, i) => Sfx.tone(f, 0.12, 'triangle', 0.1, null, 0.25 + i * 0.07));
      }
    }
  }

  // Fim da animação de linha: remove as linhas e desce o resto.
  function finishClear() {
    const rows = new Set(G.clearRows);
    const kept = G.grid.filter((_, y) => !rows.has(y));
    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
    G.grid = kept;
    G.clearRows = [];
    spawn();
  }

  function topOut() {
    if (state === 'menu') { newDemo(); return; }
    if (state !== 'play') return;
    state = 'dying'; deathT = 0; endReason = 'topout';
    G.cur = null;
    shake(0.4, 6);
    Sfx.explode();
  }

  function timeUp() {
    state = 'dying'; deathT = 0; endReason = 'time';
    G.left = 0;
    popup('TEMPO!', 46, '#ffe600', L.by + BH * 0.45, 1.6, true);
    [784, 659, 523, 784, 1047].forEach((f, i) => Sfx.tone(f, 0.16, 'square', 0.1, null, i * 0.09));
  }

  /* ---------- demonstração do menu (piloto automático) ---------- */
  function newDemo() {
    G = newGame();
    particles = []; popups = []; trails = []; flashes = [];
    spawn();
  }

  // Testa todas as rotações e colunas e escolhe a que deixa o poço mais "limpo".
  function plan(t) {
    let best = null, bs = -Infinity;
    const rots = t === O ? 1 : 4;
    for (let r = 0; r < rots; r++) {
      for (let x = -2; x < COLS; x++) {
        if (!fits(t, r, x, 0)) continue;
        let y = 0;
        while (fits(t, r, x, y + 1)) y++;
        const g = G.grid.map(row => row.slice());
        for (const [cx, cy] of SHAPES[t][r]) if (y + cy >= 0) g[y + cy][x + cx] = 1;
        const kept = g.filter(row => !row.every(Boolean));
        const lines = ROWS - kept.length;
        while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
        let agg = 0, holes = 0, bump = 0, prevH = -1;
        for (let cx = 0; cx < COLS; cx++) {
          let h = 0;
          for (let cy = 0; cy < ROWS; cy++) {
            if (kept[cy][cx]) { if (!h) h = ROWS - cy; } else if (h) holes++;
          }
          agg += h;
          if (prevH >= 0) bump += Math.abs(h - prevH);
          prevH = h;
        }
        const s = -0.51 * agg + 0.76 * lines - 0.36 * holes - 0.18 * bump + Math.random() * 0.04;
        if (s > bs) { bs = s; best = { r, x }; }
      }
    }
    return best;
  }

  function demoStep(dt) {
    G.demoT -= dt;
    if (G.demoT > 0 || !G.cur) return;
    G.demoT = 0.075;
    const p = G.plan, c = G.cur;
    if (!p) { hardDrop(); return; }
    if (c.r !== p.r) { if (!rotate(p.r === (c.r + 3) % 4 ? -1 : 1)) hardDrop(); }
    else if (c.x < p.x) { if (!shift(1)) hardDrop(); }
    else if (c.x > p.x) { if (!shift(-1)) hardDrop(); }
    else { G.demoT = 0.12; hardDrop(); }
  }

  /* ---------- fluxo do jogo ---------- */
  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function start() {
    if (state === 'play' || state === 'count') return;
    Sfx.ensure();
    G = newGame();
    fillQueue(); // já mostra as próximas durante a contagem
    particles = []; popups = []; trails = []; flashes = [];
    das.dir = 0; lastSec = -1;
    state = 'count'; countT = 1.8; lastBeat = 0;
    show(null);
    updateHud();
  }

  function toMenu() {
    state = 'menu';
    newDemo();
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

  const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };
  const fmtNum = n => n.toLocaleString('pt-BR');

  function gameOver() {
    state = 'over';
    const cheated = codes.any();
    const rec = G.score > getHi() && !cheated;
    if (rec) Arcade.store.set(hiKey(), G.score);
    Ranking.gameOver($('rankBox'), { board: 'quadrix-' + settings.mode, score: G.score, cheated });
    $('overTitle').textContent = endReason === 'time' ? 'TEMPO!' : 'FIM DE JOGO';
    $('overScore').textContent = fmtNum(G.score);
    const parts = [`Nível ${G.level}`, `${G.lines} ${G.lines === 1 ? 'linha' : 'linhas'}`, `${G.quads} QUADRIX`];
    if (G.maxCombo > 0) parts.push(`combo máx. ×${G.maxCombo}`);
    parts.push(settings.mode === 'ultra' ? `${G.pieces} peças` : `tempo ${fmtTime(G.time)}`);
    $('overInfo').textContent = parts.join(' · ');
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && G.score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  const hudCache = {};
  function setHud(key, v) { if (hudCache[key] !== v) { hudCache[key] = v; hud[key].textContent = v; } }
  function updateHud() {
    const demo = state === 'menu';
    setHud('score', demo ? '0' : fmtNum(G.score));
    setHud('hi', fmtNum(getHi()));
    setHud('level', demo ? '1' : String(G.level));
    setHud('lines', demo ? '0' : String(G.lines));
    let st = '';
    if (!demo && settings.mode === 'ultra') st = '⏱ ' + fmtTime(G.left);
    else if (!demo && G.combo > 0) st = `COMBO ×${G.combo}`;
    setHud('status', st);
  }

  /* ---------- efeitos ---------- */
  function shake(t, mag) {
    if (shakeT <= 0) shakeMag = 0;
    shakeT = Math.max(shakeT, t); shakeMag = Math.max(shakeMag, mag);
  }
  function popup(text, size, color, y, life, big = false) { popups.push({ text, size, color, y, life, max: life, big }); }

  function initFloaters() {
    floaters = [];
    for (let i = 0; i < 9; i++) floaters.push(newFloater(Math.random() * 760 - 40));
  }
  function newFloater(y) {
    return {
      t: (Math.random() * 7) | 0, x: Math.random() * 640 - 20, y,
      vy: Arcade.rand(10, 26), a: Math.random() * 6.3, va: Arcade.rand(-0.4, 0.4), s: Arcade.rand(14, 30),
    };
  }

  function updateFx(dt) {
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.vx *= 0.985; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) p.life -= dt;
    popups = popups.filter(p => p.life > 0);
    for (const t of trails) t.life -= dt;
    trails = trails.filter(t => t.life > 0);
    for (const f of flashes) f.life -= dt;
    flashes = flashes.filter(f => f.life > 0);
    for (const f of floaters) {
      f.y += f.vy * dt; f.a += f.va * dt;
      if (f.y > 780) Object.assign(f, newFloater(-60));
    }
    shakeT = Math.max(0, shakeT - dt);
    whiteT = Math.max(0, whiteT - dt);
    levelT = Math.max(0, levelT - dt);
    goT = Math.max(0, goT - dt);
  }

  /* ---------- atualização ---------- */
  function update(dt) {
    updateFx(dt);
    if (state === 'count') {
      const beat = Math.ceil(countT / 0.6);
      if (beat !== lastBeat) { lastBeat = beat; Sfx.beep(false); }
      countT -= dt;
      if (countT <= 0) { state = 'play'; goT = 0.6; Sfx.beep(true); spawn(); }
    } else if (state === 'play' || state === 'menu') {
      stepGame(dt);
      if (state === 'play') updateHud();
    } else if (state === 'dying') {
      deathT += dt;
      if (deathT > (endReason === 'time' ? 1.8 : 1.4)) gameOver();
    }
  }

  function stepGame(dt) {
    if (state === 'play') {
      G.time += dt;
      if (settings.mode === 'ultra') {
        G.left -= dt;
        const s = Math.ceil(G.left);
        if (s <= 10 && s !== lastSec && s > 0) { lastSec = s; Sfx.tone(s <= 3 ? 1200 : 980, 0.06, 'square', 0.07); }
        if (G.left <= 0) { timeUp(); return; }
      }
      handleDas(dt);
    }
    if (G.clearT > 0) {
      G.clearT -= dt;
      if (G.clearT <= 0) finishClear();
      return;
    }
    if (!G.cur) return;
    if (state === 'menu') { demoStep(dt); if (!G.cur) return; }

    // gravidade (com soft drop segurando para baixo)
    const c = G.cur;
    const soft = state === 'play' && down('d');
    const g = gravity();
    const iv = soft ? Math.min(g, SOFT) : g;
    G.fallT += dt;
    let n = 0;
    while (G.fallT >= iv && n++ < ROWS) {
      G.fallT -= iv;
      if (fits(c.t, c.r, c.x, c.y + 1)) {
        c.y++;
        if (soft) G.score += 1;
        descended();
      } else { G.fallT = 0; break; }
    }
    // lock delay: meio segundo encostada antes de travar
    if (onGround()) {
      G.lockT += dt;
      if (G.lockT >= LOCK_DELAY) lockPiece(false);
    }
  }

  /* ---------- entrada ---------- */
  const kb = { l: false, r: false, d: false }, tb = { l: false, r: false, d: false }, gp = { l: false, r: false, d: false };
  const down = key => kb[key] || tb[key] || gp[key];
  const playing = () => state === 'play' && G && G.cur && G.clearT <= 0;

  // Ações do jogador (só valem durante a partida).
  const act = {
    left: () => press(-1), right: () => press(1),
    cw: () => { if (playing()) rotate(1); },
    ccw: () => { if (playing()) rotate(-1); },
    drop: () => { if (playing()) hardDrop(); },
    hold: () => { if (playing()) holdPiece(); },
  };

  // Primeiro toque move na hora; segurando, repete depois do DAS a cada ARR.
  function press(dir) {
    das.dir = dir; das.t = 0; das.arr = 0;
    if (state === 'play') shift(dir);
  }
  function handleDas(dt) {
    const l = down('l'), r = down('r');
    if (das.dir === -1 && !l) { das.dir = r ? 1 : 0; das.t = 0; }
    else if (das.dir === 1 && !r) { das.dir = l ? -1 : 0; das.t = 0; }
    if (!das.dir) return;
    const before = das.t;
    das.t += dt;
    if (das.t < DAS) return;
    das.arr = before < DAS ? ARR : das.arr + dt;
    while (das.arr >= ARR) {
      das.arr -= ARR;
      if (!shift(das.dir)) { das.arr = 0; break; }
    }
  }

  const HELD = { arrowleft: 'l', arrowright: 'r', arrowdown: 'd' };
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !(e.target.closest && e.target.closest('button'))) start();
      return;
    }
    if (e.repeat) return;
    const h = HELD[key];
    if (h) {
      kb[h] = true;
      if (h === 'l') act.left(); else if (h === 'r') act.right();
      return;
    }
    if (key === ' ') act.drop();
    else if (key === 'arrowup' || key === 'x') act.cw();
    else if (key === 'z' || key === 'control') act.ccw();
    else if (key === 'c' || key === 'shift') act.hold();
  });
  addEventListener('keyup', e => {
    const h = HELD[e.key.toLowerCase()];
    if (h) kb[h] = false;
  });
  addEventListener('blur', () => { kb.l = kb.r = kb.d = false; });

  // Botões na tela.
  for (const b of document.querySelectorAll('.tbtn')) {
    const key = b.dataset.k;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      Sfx.ensure();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
      b.classList.add('on');
      if (key in tb) {
        tb[key] = true;
        if (key === 'l') act.left(); else if (key === 'r') act.right();
      } else if (key === 'rot') act.cw();
      else if (key === 'drop') act.drop();
      else if (key === 'hold') act.hold();
    });
    const up = () => { b.classList.remove('on'); if (key in tb) tb[key] = false; };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Gestos sobre o poço: toque rápido gira, deslizar move/desce, peteleco p/ baixo derruba, p/ cima guarda.
  let swipe = null;
  const cellPx = () => (parseFloat(canvas.style.width) || W) / W * CELL;
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    swipe = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), axis: null, sx: 0, sy: 0 };
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    e.preventDefault();
  });
  screen.addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id || state !== 'play') return;
    const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
    if (!swipe.axis) {
      if (Math.hypot(dx, dy) < 12) return;
      swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    const cp = cellPx();
    if (swipe.axis === 'h') {
      const target = Math.trunc(dx / (cp * 0.85));
      while (swipe.sx < target) { swipe.sx++; shift(1); }
      while (swipe.sx > target) { swipe.sx--; shift(-1); }
    } else if (dy > 0) {
      const target = Math.trunc(dy / cp);
      while (swipe.sy < target) { swipe.sy++; if (G.cur && G.clearT <= 0) softStep(); }
    }
  });
  const endSwipe = e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s = swipe;
    swipe = null;
    if (state !== 'play' || e.type === 'pointercancel') return;
    const dt = Math.max(1, performance.now() - s.t0);
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.axis && dt < 320 && Math.hypot(dx, dy) < 14) act.cw();
    else if (s.axis === 'v') {
      if (dy > 36 && dy / dt > 0.55) act.drop();
      else if (dy < -40) act.hold();
    }
  };
  screen.addEventListener('pointerup', endSwipe);
  screen.addEventListener('pointercancel', endSwipe);

  // Controle de videogame: ações na borda de subida de cada botão.
  const padPrev = {};
  const edge = (name, v) => { const was = padPrev[name]; padPrev[name] = v; return v && !was; };
  function pollPad() {
    const g = Arcade.gamepad(0);
    if (!g) { gp.l = gp.r = gp.d = false; return; }
    const l = g.lx < -0.5, r = g.lx > 0.5, d = g.ly > 0.5, up = g.ly < -0.7;
    const eL = edge('l', l), eR = edge('r', r), eUp = edge('up', up);
    const eA = edge('a', g.a), eB = edge('b', g.b), eX = edge('x', g.x || g.lb), eRT = edge('rt', g.rt);
    const eStart = edge('start', g.start);
    gp.l = l; gp.r = r; gp.d = d;
    if (eStart) { if (state === 'menu' || state === 'over') start(); else togglePause(); return; }
    if (eA && (state === 'menu' || state === 'over')) { start(); return; }
    if (eL) act.left();
    if (eR) act.right();
    if (eA) act.cw();
    if (eB) act.ccw();
    if (eX) act.hold();
    if (eUp || eRT) act.drop();
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
  // Cor de um bloco: a da peça ou, com KONAMI, um arco-íris que corre pelo poço.
  function cellColor(t, x, y) {
    if (codes.has('KONAMI')) {
      const h = Math.floor(((time * 140 + x * 28 + y * 18) % 360) / 15) * 15;
      return `hsl(${h},100%,60%)`;
    }
    return COLORS[t];
  }
  // Com KONAMI os blocos também piscam, cada um num compasso.
  const blink = (x, y) => (codes.has('KONAMI') && Math.floor(time * 5 + (x + y) * 0.5) % 2 ? 0.45 : 1);

  function block(x, gy, color, alpha = 1) {
    const px = L.bx + x * CELL, py = L.by + (gy - HIDDEN) * CELL;
    ctx.globalAlpha = alpha * blink(x, gy);
    ctx.drawImage(sprite(color), px - GLOW, py - GLOW, CELL + GLOW * 2, CELL + GLOW * 2);
    ctx.globalAlpha = 1;
  }

  function drawMini(t, cx, cy, cs, alpha = 1) {
    const cells = SHAPES[t][0];
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const [x, y] of cells) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const ox = cx - (maxX - minX + 1) * cs / 2 - minX * cs, oy = cy - (maxY - minY + 1) * cs / 2 - minY * cs;
    const gl = GLOW * cs / CELL;
    for (const [x, y] of cells) {
      ctx.globalAlpha = alpha * blink(x, y);
      ctx.drawImage(sprite(cellColor(t, x, y)), ox + x * cs - gl, oy + y * cs - gl, cs + gl * 2, cs + gl * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawText(text, x, y, size, color, alpha = 1, scale = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, 0, 0);
    ctx.shadowColor = color; ctx.shadowBlur = 16 * k;
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // Fundo animado: grade que desce devagar e silhuetas de peças flutuando.
  function drawBackdrop() {
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,43,214,0.07)'; ctx.lineWidth = 1;
    const off = (time * 16) % 40;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = off - 40; y <= H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (const f of floaters) {
      ctx.save();
      ctx.translate(f.x, f.y); ctx.rotate(f.a);
      ctx.strokeStyle = COLORS[f.t]; ctx.globalAlpha = 0.16;
      for (const [x, y] of SHAPES[f.t][0]) ctx.strokeRect((x - 1.5) * f.s, (y - 1) * f.s, f.s - 2, f.s - 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function stackTop() {
    for (let y = HIDDEN; y < ROWS; y++) if (G.grid[y].some(Boolean)) return y - HIDDEN;
    return VIS;
  }

  function drawBoard() {
    const { bx, by } = L;
    const danger = state !== 'menu' && stackTop() < 5 && (state === 'play' || state === 'count');
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, BW, BH); ctx.clip();
    if (danger) {
      ctx.fillStyle = `rgba(255,45,85,${0.07 + 0.05 * Math.sin(time * 8)})`;
      ctx.fillRect(bx, by, BW, BH);
    }

    const dead = (state === 'dying' || state === 'over') && endReason === 'topout';
    const clearing = G.clearT > 0 ? new Set(G.clearRows) : null;
    const p = G.clearT > 0 ? 1 - G.clearT / G.clearDur : 0;
    for (let y = HIDDEN; y < ROWS; y++) {
      const row = G.grid[y];
      const greyed = dead && (ROWS - 1 - y) < deathT * 26;
      for (let x = 0; x < COLS; x++) {
        const v = row[x];
        if (!v) continue;
        if (clearing && clearing.has(y)) {
          // a linha some do centro para as pontas
          if (Math.abs(x + 0.5 - COLS / 2) / (COLS / 2) < p * 1.25) continue;
          block(x, y, cellColor(v - 1, x, y));
          ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - p)})`;
          ctx.fillRect(bx + x * CELL + 1, by + (y - HIDDEN) * CELL + 1, CELL - 2, CELL - 2);
        } else {
          block(x, y, greyed ? GREY : cellColor(v - 1, x, y));
        }
      }
    }
    // faixa de luz nas linhas que estão sumindo
    if (clearing) {
      for (const y of G.clearRows) {
        const h = CELL * (0.4 + p * 0.9);
        ctx.fillStyle = `rgba(200,255,255,${0.55 * (1 - p)})`;
        ctx.fillRect(bx, by + (y - HIDDEN + 0.5) * CELL - h / 2, BW, h);
      }
    }

    // rastro do hard drop
    for (const t of trails) {
      const x = bx + t.x * CELL, y0 = by + (t.top - HIDDEN) * CELL, y1 = by + (t.bot - HIDDEN + 1) * CELL;
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, t.color);
      ctx.globalAlpha = (t.life / 0.28) * 0.5;
      ctx.fillStyle = gr;
      ctx.fillRect(x + 3, y0, CELL - 6, y1 - y0);
    }
    ctx.globalAlpha = 1;

    const c = G.cur;
    if (c) {
      // peça fantasma
      const gy = ghostY();
      const col = cellColor(c.t, c.x, gy);
      if (gy !== c.y) {
        ctx.save();
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
        ctx.fillStyle = col;
        for (const [cx, cy] of SHAPES[c.t][c.r]) {
          if (gy + cy < HIDDEN) continue;
          const px = bx + (c.x + cx) * CELL, py = by + (gy + cy - HIDDEN) * CELL;
          ctx.globalAlpha = 0.12; ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
          ctx.globalAlpha = 0.6; ctx.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
        }
        ctx.restore();
      }
      // peça ativa (clareia enquanto o lock delay corre)
      const lockGlow = G.lockT > 0 ? Math.min(1, G.lockT / LOCK_DELAY) : 0;
      for (const [cx, cy] of SHAPES[c.t][c.r]) {
        const x = c.x + cx, y = c.y + cy;
        if (y < HIDDEN) continue;
        block(x, y, cellColor(c.t, x, y));
        if (lockGlow > 0) {
          ctx.fillStyle = `rgba(255,255,255,${0.35 * lockGlow})`;
          ctx.fillRect(bx + x * CELL + 2, by + (y - HIDDEN) * CELL + 2, CELL - 4, CELL - 4);
        }
      }
    }
    // brilho rápido nos blocos que acabaram de travar
    for (const f of flashes) {
      ctx.fillStyle = `rgba(255,255,255,${(f.life / 0.22) * 0.6})`;
      for (const [x, y] of f.cells) if (y >= HIDDEN) ctx.fillRect(bx + x * CELL + 1, by + (y - HIDDEN) * CELL + 1, CELL - 2, CELL - 2);
    }
    if (whiteT > 0) { ctx.fillStyle = `rgba(255,255,255,${whiteT / 0.3 * 0.35})`; ctx.fillRect(bx, by, BW, BH); }
    // contagem grande nos últimos 10 s do ULTRA
    if (state === 'play' && settings.mode === 'ultra' && G.left <= 10) {
      drawText(String(Math.ceil(G.left)), bx + BW / 2, by + BH / 2, 150, '#ff2d55', 0.18);
    }
    ctx.restore();

    // moldura do poço: ciano normal, verde ao subir de nível, vermelho no perigo
    ctx.save();
    let border = '#00e5ff';
    if (levelT > 0 && Math.floor(levelT * 10) % 2) border = '#3dff5a';
    else if (danger && Math.sin(time * 8) > 0) border = '#ff2d55';
    ctx.strokeStyle = border; ctx.lineWidth = 3;
    ctx.shadowColor = border; ctx.shadowBlur = (14 + 6 * Math.sin(time * 3)) * k;
    ctx.strokeRect(bx - 1.5, by - 1.5, BW + 3, BH + 3);
    ctx.restore();
  }

  function drawSide() {
    const tall = L === LAYOUTS.tall;
    // HOLD
    const h = L.hold;
    if (G.hold !== null) drawMini(G.hold, h.x + h.w / 2, h.y + (tall ? 54 : 62), tall ? 16 : 22, G.canHold ? 1 : 0.3);
    // PRÓXIMAS
    const n = L.next;
    const q = G.queue;
    if (tall) {
      const xs = [n.x + 44, n.x + 112, n.x + 170], sz = [17, 13, 13];
      for (let i = 0; i < 3 && i < q.length; i++) drawMini(q[i], xs[i], n.y + 54, sz[i], i ? 0.8 : 1);
    } else {
      const ys = [n.y + 72, n.y + 160, n.y + 238], sz = [22, 17, 17];
      for (let i = 0; i < 3 && i < q.length; i++) drawMini(q[i], n.x + n.w / 2, ys[i], sz[i], i ? 0.8 : 1);
      ctx.strokeStyle = 'rgba(0,229,255,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(n.x + 14, n.y + 118); ctx.lineTo(n.x + n.w - 14, n.y + 118); ctx.stroke();
    }
    // placar lateral (só no arranjo largo)
    const s = L.stats;
    if (!s) return;
    const demo = state === 'menu';
    const rows = [
      ['PONTOS', demo ? '0' : fmtNum(G.score)],
      ['NÍVEL', demo ? '1' : String(G.level)],
      ['LINHAS', demo ? '0' : String(G.lines)],
      settings.mode === 'ultra' ? ['TEMPO', fmtTime(demo ? ULTRA_TIME : G.left)] : ['TEMPO', fmtTime(demo ? 0 : G.time)],
      ['QUADRIX', demo ? '0' : String(G.quads)],
    ];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    rows.forEach(([label, val], i) => {
      const y = s.y + 26 + i * 52;
      ctx.font = '12px "Share Tech Mono", monospace';
      ctx.fillStyle = '#9a8bb8';
      ctx.fillText(label, s.x + s.w / 2, y);
      ctx.font = `900 ${val.length > 8 ? 15 : 19}px Orbitron, sans-serif`;
      ctx.fillStyle = label === 'TEMPO' && settings.mode === 'ultra' && !demo && G.left <= 10 ? '#ff2d55' : '#f1e9ff';
      ctx.fillText(val, s.x + s.w / 2, y + 20);
    });
    // códigos ligados
    const list = codes.list();
    if (list.length) {
      ctx.font = '700 10px Orbitron, sans-serif';
      ctx.fillStyle = '#ffd400';
      list.forEach((c, i) => ctx.fillText('★ ' + c, s.x + s.w / 2, s.y + s.h + 18 + i * 16));
    }
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawBackdrop();
    if (shakeT > 0) {
      const m = shakeMag * Math.min(1, shakeT / 0.2);
      ctx.translate(Arcade.rand(-m, m), Arcade.rand(-m, m));
    }
    ctx.drawImage(layer, 0, 0, W, H);
    drawBoard();
    drawSide();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    const cx = L.bx + BW / 2;
    for (const p of popups) {
      const t = 1 - p.life / p.max;
      const sc = t < 0.12 ? 0.5 + (t / 0.12) * 0.6 : 1.1 - Math.min(0.1, (t - 0.12) * 0.8);
      const wob = p.big ? Math.sin(time * 30) * 0.03 : 0;
      drawText(p.text, cx, p.y - t * 26, p.size, codes.has('KONAMI') && p.big ? `hsl(${(time * 400) % 360},100%,60%)` : p.color, Math.min(1, p.life * 3), sc + wob);
    }
    if (state === 'count') {
      const n = Math.ceil(countT / 0.6);
      drawText(String(n), cx, L.by + BH / 2, 110, '#00e5ff', 0.4 + (countT % 0.6) / 0.6 * 0.6);
    } else if (goT > 0) {
      drawText('VAI!', cx, L.by + BH / 2, 80, '#00e5ff', goT / 0.6, 1 + (0.6 - goT) * 0.6);
    }
  }

  /* ---------- laço principal ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollPad();
    if (state !== 'pause') { time += dt; update(dt); }
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  // A fonte do placar chega depois: redesenha os rótulos quando ela carregar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sprites.clear(); buildLayer(); });
  syncModeInfo();
  initFloaters();
  newDemo();
  resize();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
