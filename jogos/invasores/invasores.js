// Invasores: frota alienígena em pixel art que marcha em passos, bunkers destrutíveis pixel a pixel
// e um disco voador com pontuação "misteriosa" (que tem um macete, claro).
(() => {
  const W = 480;
  let H = 640;                                       // cresce em telas em pé (celular)
  let GROUND = H - 40, PLAYER_Y = H - 76, BUNKER_Y = H - 176;
  const PX = 2.4;                                    // tamanho de cada "pixel" dos sprites
  const COLS = 11, ROWS = 5, COLW = 33, ROWH = 30;
  const STEP_X = 7, DROP = 16, MARGIN = 14;
  const UFO_Y = 64;
  const TAU = Math.PI * 2;

  /* ---------- sprites (pixel art, 2 quadros cada) ---------- */
  const SPR = {
    squid: [[
      '...##...',
      '..####..',
      '.######.',
      '##.##.##',
      '########',
      '..#..#..',
      '.#.##.#.',
      '#.#..#.#',
    ], [
      '...##...',
      '..####..',
      '.######.',
      '##.##.##',
      '########',
      '.#.##.#.',
      '#......#',
      '.#....#.',
    ]],
    crab: [[
      '..#.....#..',
      '...#...#...',
      '..#######..',
      '.##.###.##.',
      '###########',
      '#.#######.#',
      '#.#.....#.#',
      '...##.##...',
    ], [
      '..#.....#..',
      '#..#...#..#',
      '#.#######.#',
      '###.###.###',
      '###########',
      '.#########.',
      '..#.....#..',
      '.#.......#.',
    ]],
    octo: [[
      '....####....',
      '.##########.',
      '############',
      '###..##..###',
      '############',
      '...##..##...',
      '..##.##.##..',
      '##........##',
    ], [
      '....####....',
      '.##########.',
      '############',
      '###..##..###',
      '############',
      '..###..###..',
      '.##..##..##.',
      '..##....##..',
    ]],
    ufo: [[
      '.....######.....',
      '...##########...',
      '..############..',
      '.##.##.##.##.##.',
      '################',
      '..###..##..###..',
      '...#........#...',
    ]],
    cannon: [[
      '......#......',
      '.....###.....',
      '.....###.....',
      '.###########.',
      '#############',
      '#############',
      '#############',
      '#############',
    ]],
    boom: [[
      '....#...#....',
      '.#...#.#...#.',
      '..#.......#..',
      '...#.....#...',
      '##.........##',
      '...#.....#...',
      '..#..#.#..#..',
      '.#..#...#..#.',
    ]],
  };
  // Tipos de alien: linha 0 = lula (30), 1-2 = caranguejo (20), 3-4 = polvo (10).
  const TYPES = [
    { spr: 'squid', pts: 30, color: '#ff5bf0' },
    { spr: 'crab', pts: 20, color: '#b26bff' },
    { spr: 'crab', pts: 20, color: '#b26bff' },
    { spr: 'octo', pts: 10, color: '#4dd2ff' },
    { spr: 'octo', pts: 10, color: '#4dd2ff' },
  ];
  const UFO_COLOR = '#ff3b5c', CANNON_COLOR = '#39ff14', BUNKER_COLOR = '#39ff14';
  const MARCH = [98, 87.3, 77.8, 73.4];             // as 4 notas graves da marcha

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), stage = $('stage'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), lives: $('hLives'), wave: $('hWave'), status: $('hStatus') };

  /* ---------- configurações e códigos ---------- */
  const settings = { look: 'neon' };
  Arcade.bindSettings(panels.menu, settings, 'invasores_', () => { cache.clear(); bunkers.forEach(b => (b.dirty = true)); });
  const codes = Arcade.codes('invasores', {
    KONAMI: 'Tiro triplo',
    INVENCIVEL: 'Começa com 9 vidas',
    LENTO: 'Invasores em câmera lenta',
  }, $('codeMount'));

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');
  const scan = document.createElement('canvas');
  const cache = new Map();                           // sprites já desenhados, por nome+quadro+cor

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    H = Math.round(Math.max(640, Math.min(860, (W * h) / Math.max(1, w))));
    const oldPlayerY = PLAYER_Y;
    GROUND = H - 40; PLAYER_Y = H - 76; BUNKER_Y = H - 176;
    k = Arcade.fit(canvas, W, H, wrap);
    cache.clear();
    buildBackground();
    buildScan();
    if (bunkers.length && oldPlayerY !== PLAYER_Y) for (const b of bunkers) b.y = BUNKER_Y;
    bunkers.forEach(b => (b.dirty = true));
  }

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05010d'); sky.addColorStop(0.7, '#0c0420'); sky.addColorStop(1, '#170630');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // nebulosas roxas
    const neb = (x, y, r, c) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    };
    neb(W * 0.2, H * 0.25, 200, 'rgba(178,107,255,0.12)');
    neb(W * 0.85, H * 0.5, 230, 'rgba(255,43,214,0.07)');
    neb(W * 0.5, H, 300, 'rgba(77,210,255,0.08)');
    // planeta no horizonte, bem discreto
    g.fillStyle = 'rgba(178,107,255,0.08)';
    g.beginPath(); g.arc(W * 0.78, H * 0.18, 46, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(178,107,255,0.14)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(W * 0.78, H * 0.18, 74, 14, -0.3, 0, TAU); g.stroke();
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.14)';
    const step = Math.max(2, Math.round(canvas.height / 280));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, scan.height * 0.3, scan.width / 2, scan.height / 2, scan.height * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  // Desenha um sprite (com brilho neon já embutido) e guarda no cache.
  const PAD = 5;
  function sprite(name, frame, color) {
    const key = name + frame + color;
    let c = cache.get(key);
    if (c) return c;
    const rows = SPR[name][frame];
    const w = rows[0].length * PX, h = rows.length * PX;
    c = document.createElement('canvas');
    c.width = Math.ceil((w + PAD * 2) * k); c.height = Math.ceil((h + PAD * 2) * k);
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.shadowColor = color; g.shadowBlur = 7;
    g.fillStyle = color;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(PAD + x * PX, PAD + y * PX, PX + 0.1, PX + 0.1);
    });
    c.lw = w; c.lh = h;
    cache.set(key, c);
    return c;
  }
  function drawSprite(name, frame, color, cx, cy, alpha = 1) {
    const c = sprite(name, frame, color);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(c, cx - c.lw / 2 - PAD, cy - c.lh / 2 - PAD, c.lw + PAD * 2, c.lh + PAD * 2);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  // Cor conforme o modo: neon (cada tipo uma cor) ou celofane (faixas coloridas como nos fliperamas de 1978).
  function tint(base, y) {
    if (settings.look !== 'cel') return base;
    if (y < UFO_Y + 22) return '#ff3b5c';
    if (y > BUNKER_Y - 30) return '#39ff14';
    return '#f4f4f4';
  }

  /* ---------- bunkers ---------- */
  const BC = 22, BRW = 16, CELL = 2.4;
  let bunkers = [];
  function makeBunkers() {
    bunkers = [];
    for (let i = 0; i < 4; i++) {
      const mask = new Uint8Array(BC * BRW);
      for (let r = 0; r < BRW; r++) {
        for (let c = 0; c < BC; c++) {
          let on = true;
          if (r < 4 && (c < 4 - r || c > BC - 1 - (4 - r))) on = false;          // cantos de cima
          if (r >= 11) { const hw = r === 11 ? 3 : r === 12 ? 4 : 5; if (Math.abs(c - (BC - 1) / 2) < hw) on = false; } // arco
          mask[r * BC + c] = on ? 1 : 0;
        }
      }
      const cx = (W * (i + 0.5)) / 4;
      bunkers.push({ x: cx - (BC * CELL) / 2, y: BUNKER_Y, mask, canvas: document.createElement('canvas'), dirty: true });
    }
  }
  function renderBunker(b) {
    b.canvas.width = Math.ceil(BC * CELL * k); b.canvas.height = Math.ceil(BRW * CELL * k);
    const g = b.canvas.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const color = settings.look === 'cel' ? '#39ff14' : BUNKER_COLOR;
    for (let r = 0; r < BRW; r++) {
      for (let c = 0; c < BC; c++) {
        if (!b.mask[r * BC + c]) continue;
        g.fillStyle = color;
        g.fillRect(c * CELL, r * CELL, CELL + 0.1, CELL + 0.1);
        // pixels de cima um pouco mais claros, dá volume
        if (r === 0 || !b.mask[(r - 1) * BC + c]) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(c * CELL, r * CELL, CELL + 0.1, CELL * 0.4); }
      }
    }
    b.dirty = false;
  }
  // Ponto (x, y) acerta algum pixel de bunker?
  function bunkerAt(x, y) {
    for (const b of bunkers) {
      if (x < b.x || y < b.y || x >= b.x + BC * CELL || y >= b.y + BRW * CELL) continue;
      const c = Math.floor((x - b.x) / CELL), r = Math.floor((y - b.y) / CELL);
      if (b.mask[r * BC + c]) return { b, c, r };
    }
    return null;
  }
  // Arranca um pedaço irregular do bunker.
  function erode(hit, big = 1) {
    const { b, c, r } = hit;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx, dy * 1.1);
        if (d > 1.6 * big && !(d <= 3.3 * big && Math.random() < 0.5)) continue;
        const cc = c + dx, rr = r + dy;
        if (cc < 0 || rr < 0 || cc >= BC || rr >= BRW) continue;
        b.mask[rr * BC + cc] = 0;
      }
    }
    b.dirty = true;
    burst(b.x + (c + 0.5) * CELL, b.y + (r + 0.5) * CELL, settings.look === 'cel' ? '#39ff14' : BUNKER_COLOR, 6, 90, 2);
  }
  // Aliens que descem por cima dos bunkers apagam o que tocam.
  function aliensEatBunkers() {
    for (const a of aliens) {
      if (!a.alive) continue;
      const { x, y, w, h } = alienBox(a);
      if (y + h / 2 < BUNKER_Y) continue;
      for (const b of bunkers) {
        const c0 = Math.floor((x - w / 2 - b.x) / CELL), c1 = Math.floor((x + w / 2 - b.x) / CELL);
        const r0 = Math.floor((y - h / 2 - b.y) / CELL), r1 = Math.floor((y + h / 2 - b.y) / CELL);
        for (let r = Math.max(0, r0); r <= Math.min(BRW - 1, r1); r++) {
          for (let c = Math.max(0, c0); c <= Math.min(BC - 1, c1); c++) {
            if (b.mask[r * BC + c]) { b.mask[r * BC + c] = 0; b.dirty = true; }
          }
        }
      }
    }
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let score = 0, lives = 3, wave = 1, extraGiven = false, kills = 0, shots = 0;
  let aliens = [], fx = 0, fy = 0, dir = 1, pendingDrop = false, frameIdx = 0, stepT = 0, note = 0;
  let player = { x: W / 2, alive: true };
  let bullets = [], bombs = [], booms = [], particles = [], popups = [], stars = [];
  let ufo = null, ufoT = 20, sirenT = 0, bombT = 1.5;
  let time = 0, stateT = 0, shakeT = 0, flashT = 0, overT = 0, invaded = false;
  let hi = +Arcade.store.get('invasores_hi', 0) || 0;

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function makeStars() {
    stars = [];
    for (let i = 0; i < 110; i++) stars.push({ x: Math.random() * W, y: Math.random() * 900, s: Math.random() < 0.15 ? 2 : 1, p: Math.random() * TAU, v: Arcade.rand(3, 12) });
  }

  // Monta a formação. Cada onda nova começa um degrau mais baixo (até 7 degraus).
  function newWave() {
    aliens = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) aliens.push({ r, c, t: TYPES[r], alive: true });
    fx = (W - COLS * COLW) / 2;
    fy = 100 + Math.min(wave - 1, 7) * 18;
    dir = 1; pendingDrop = false; frameIdx = 0; note = 0; stepT = 0.6;
    bullets = []; bombs = []; booms = [];
    ufo = null; ufoT = Arcade.rand(16, 24); bombT = 1.6;
    shots = 0;
    makeBunkers();
  }

  function newGame() {
    score = 0; wave = 1; extraGiven = false; kills = 0; invaded = false;
    lives = codes.has('INVENCIVEL') ? 9 : 3;
    particles = []; popups = [];
    player = { x: W / 2, alive: true };
    newWave();
  }

  function start() {
    Sfx.ensure();
    state = 'play';
    newGame();
    stateT = 0;
    show(null);
    updateHud();
    Sfx.tone(200, 0.3, 'square', 0.07, 800);
  }

  function toMenu() {
    state = 'menu';
    newGame();
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (state === 'play' || state === 'dying' || state === 'clear') { pausedFrom = state; state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set('invasores_hi', hi); }
    Ranking.gameOver($('rankBox'), { board: 'invasores', score, cheated });
    $('overTitle').textContent = invaded ? 'INVASÃO!' : 'FIM DE JOGO';
    $('overScore').textContent = score;
    $('overInfo').textContent = `Onda ${wave} · ${kills} ${kills === 1 ? 'invasor derrubado' : 'invasores derrubados'}` + (invaded ? ' · eles pousaram!' : '');
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.lives.textContent = demo ? (codes.has('INVENCIVEL') ? 9 : 3) : lives;
    hud.wave.textContent = demo ? 1 : wave;
    const st = [];
    if (codes.has('KONAMI')) st.push('TIRO TRIPLO');
    if (codes.has('LENTO')) st.push('CÂMERA LENTA');
    hud.status.textContent = st.join(' · ');
  }

  function addScore(n) {
    if (state === 'menu') return;
    score += n;
    if (!extraGiven && score >= 1500) {
      extraGiven = true; lives++;
      popups.push({ x: W / 2, y: GROUND - 40, text: 'VIDA EXTRA!', color: CANNON_COLOR, life: 1.8 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => Sfx.tone(f, 0.12, 'square', 0.07, null, i * 0.08));
    }
    updateHud();
  }

  /* ---------- formação ---------- */
  function alienBox(a) {
    const rows = SPR[a.t.spr][0];
    const w = rows[0].length * PX, h = rows.length * PX;
    return { x: fx + a.c * COLW + COLW / 2, y: fy + a.r * ROWH, w, h };
  }
  const aliveCount = () => aliens.reduce((n, a) => n + (a.alive ? 1 : 0), 0);

  // Intervalo entre passos: quanto menos aliens, mais rápido (e mais rápido a cada onda).
  function stepInterval() {
    const n = aliveCount();
    let iv = 0.045 + 0.6 * Math.pow(n / 55, 1.1);
    iv *= Math.max(0.6, 1 - (wave - 1) * 0.06);
    if (codes.has('LENTO')) iv *= 2.2;
    return iv;
  }

  function step() {
    if (pendingDrop) {
      fy += DROP; dir = -dir; pendingDrop = false;
    } else {
      fx += dir * STEP_X;
    }
    frameIdx ^= 1;
    tone(MARCH[note], Math.min(0.11, stepInterval() * 0.8), 'square', 0.16);
    note = (note + 1) % 4;
    // chegou na borda? o próximo passo é para baixo
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of aliens) {
      if (!a.alive) continue;
      const b = alienBox(a);
      minX = Math.min(minX, b.x - b.w / 2); maxX = Math.max(maxX, b.x + b.w / 2); maxY = Math.max(maxY, b.y + b.h / 2);
    }
    if ((dir > 0 && maxX + STEP_X > W - MARGIN) || (dir < 0 && minX - STEP_X < MARGIN)) pendingDrop = true;
    aliensEatBunkers();
    // pousaram: fim de jogo
    if (maxY >= PLAYER_Y && (state === 'play' || state === 'menu')) invasion();
  }

  function invasion() {
    if (state === 'menu') { newWave(); return; }
    invaded = true;
    lives = 0;
    killPlayer();
  }

  /* ---------- tiros ---------- */
  function tryFire() {
    if (state !== 'play' && state !== 'menu') return;
    if (!player.alive || bullets.length) return;
    shots++;
    const y = PLAYER_Y - 2;
    if (codes.has('KONAMI')) {
      for (const vx of [-110, 0, 110]) bullets.push({ x: player.x, y, vx, n: shots });
    } else bullets.push({ x: player.x, y, vx: 0, n: shots });
    tone(1200, 0.12, 'square', 0.05, 300);
    noise(0.08, 0.05, 6000, 0, 'highpass', 2000);
  }

  // Valor do disco voador: parece sorte, mas o 23º tiro (e depois a cada 15) vale sempre 300.
  function ufoValue(n) {
    if (n === 23 || (n > 23 && (n - 23) % 15 === 0)) return 300;
    return Arcade.pick([50, 100, 150]);
  }

  function spawnBomb() {
    const cols = new Map();
    for (const a of aliens) {
      if (!a.alive) continue;
      const cur = cols.get(a.c);
      if (!cur || a.r > cur.r) cols.set(a.c, a);   // o de baixo de cada coluna atira
    }
    if (!cols.size) return;
    const shooters = [...cols.values()];
    const type = Arcade.pick(['zig', 'cruz', 'raio']);
    let s;
    if (type === 'zig') {
      // o "rolante" mira na coluna mais perto do canhão
      s = shooters.reduce((best, a) => (Math.abs(alienBox(a).x - player.x) < Math.abs(alienBox(best).x - player.x) ? a : best));
    } else s = Arcade.pick(shooters);
    const b = alienBox(s);
    const speeds = { zig: 150, cruz: 170, raio: 225 };
    bombs.push({ x: b.x, y: b.y + b.h / 2 + 4, type, v: speeds[type] * (codes.has('LENTO') ? 0.6 : 1) * (1 + Math.min(0.4, (wave - 1) * 0.05)), t: 0 });
  }

  function burst(x, y, color, n, power = 150, size = 2.5) {
    for (let i = 0; i < n && particles.length < 600; i++) {
      const a = Math.random() * TAU, s = Arcade.rand(power * 0.2, power);
      const life = Arcade.rand(0.3, 0.8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: Arcade.rand(size * 0.6, size * 1.4) });
    }
  }

  function killAlien(a) {
    a.alive = false;
    const b = alienBox(a);
    const color = tint(a.t.color, b.y);
    booms.push({ x: b.x, y: b.y, t: 0.28, color });
    burst(b.x, b.y, color, 14, 170);
    tone(220, 0.16, 'square', 0.08, 50);
    noise(0.15, 0.12, 3000, 0, 'bandpass', 400);
    if (state === 'menu') return;
    kills++;
    addScore(a.t.pts);
  }

  function hitUfo(bullet) {
    const pts = ufoValue(bullet.n);
    burst(ufo.x, UFO_Y, UFO_COLOR, 30, 220, 3);
    booms.push({ x: ufo.x, y: UFO_Y, t: 0.4, color: UFO_COLOR });
    if (state !== 'menu') {
      addScore(pts);
      popups.push({ x: ufo.x, y: UFO_Y, text: String(pts), color: pts === 300 ? '#ffd400' : UFO_COLOR, life: 1.6, big: true });
    }
    [880, 660, 1320, 990].forEach((f, i) => tone(f, 0.09, 'square', 0.06, null, i * 0.06));
    ufo = null;
  }

  function killPlayer() {
    if (!player.alive) return;
    player.alive = false;
    if (state !== 'menu') { state = 'dying'; stateT = 0; lives = Math.max(0, lives - (invaded ? 0 : 1)); }
    else stateT = -1.2;   // na demonstração, renasce logo
    shakeT = 0.5; flashT = 0.25;
    burst(player.x, PLAYER_Y + 10, CANNON_COLOR, 36, 230, 3);
    burst(player.x, PLAYER_Y + 10, '#ffffff', 12, 160, 2);
    if (state !== 'menu') Sfx.explode();
    tone(300, 0.8, 'sawtooth', 0.07, 40, 0.05);
    updateHud();
  }

  /* ---------- entrada ---------- */
  const keys = { left: false, right: false, fire: false };
  const pads = { left: false, right: false, fire: false };
  let touch = null;

  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    const onButton = e.target.closest && e.target.closest('button');
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !onButton && !e.repeat && (state === 'menu' || overT > 0.6)) start();
      return;
    }
    if (key === 'arrowleft' || key === 'a') keys.left = true;
    if (key === 'arrowright' || key === 'd') keys.right = true;
    if (key === ' ' || key === 'arrowup' || key === 'w') { keys.fire = true; if (!e.repeat) tryFire(); }
  });
  addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') keys.left = false;
    if (key === 'arrowright' || key === 'd') keys.right = false;
    if (key === ' ' || key === 'arrowup' || key === 'w') keys.fire = false;
  });
  addEventListener('blur', () => { keys.left = keys.right = keys.fire = false; pads.left = pads.right = pads.fire = false; });

  // Botões na tela (vários dedos ao mesmo tempo).
  function bindPadButton(el, name) {
    const down = e => {
      e.preventDefault(); Sfx.ensure();
      pads[name] = true; el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
      if (name === 'fire') tryFire();
    };
    const up = () => { pads[name] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindPadButton($('btnLeft'), 'left');
  bindPadButton($('btnRight'), 'right');
  bindPadButton($('btnFire'), 'fire');

  // Arrastar no jogo move o canhão; toque rápido atira.
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    if (touch) return;
    touch = { id: e.pointerId, x: e.clientX, moved: 0, t: performance.now() };
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
  });
  screen.addEventListener('pointermove', e => {
    if (!touch || e.pointerId !== touch.id) return;
    const r = canvas.getBoundingClientRect();
    const dx = ((e.clientX - touch.x) / r.width) * W;
    touch.x = e.clientX;
    touch.moved += Math.abs(dx);
    if (state === 'play' && player.alive) player.x += dx * 1.3;
  });
  const endTouch = e => {
    if (!touch || e.pointerId !== touch.id) return;
    if (touch.moved < 8 && performance.now() - touch.t < 320) tryFire();
    touch = null;
  };
  screen.addEventListener('pointerup', endTouch);
  screen.addEventListener('pointercancel', endTouch);

  let padA = false, padStart = false, padAxis = 0, padFire = false;
  function pollPad() {
    const g = Arcade.gamepad(0);
    padAxis = 0; padFire = false;
    if (!g) return;
    padAxis = g.lx;
    if (g.a && !padA) {
      if (state === 'menu' || (state === 'over' && overT > 0.6)) start();
      else tryFire();
    }
    padFire = g.a || g.rt;
    if (g.start && !padStart) togglePause();
    padA = g.a; padStart = g.start;
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'play' || state === 'dying' || state === 'clear')) togglePause();
  });

  /* ---------- piloto automático (demonstração) ---------- */
  let demoTarget = W / 2, demoRetarget = 0;
  function autopilot(dt) {
    if (!player.alive) return 0;
    demoRetarget -= dt;
    if (demoRetarget <= 0) {
      demoRetarget = Arcade.rand(0.6, 1.4);
      const alive = aliens.filter(a => a.alive);
      if (alive.length) demoTarget = alienBox(Arcade.pick(alive)).x;
    }
    // desvia das bombas que vêm na direção do canhão
    for (const b of bombs) {
      if (b.y > PLAYER_Y - 170 && Math.abs(b.x - player.x) < 26) return b.x > player.x ? -1 : 1;
    }
    tryFire();
    const d = demoTarget - player.x;
    return Math.abs(d) < 4 ? 0 : Math.sign(d);
  }

  /* ---------- atualização ---------- */
  function update(dt) {
    time += dt; stateT += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    if (state === 'over') overT += dt;
    for (const s of stars) { s.y += s.v * dt; if (s.y > H) { s.y -= H; s.x = Math.random() * W; } }

    const live = state === 'play' || state === 'menu';
    if (live) {
      // canhão
      let v;
      if (state === 'menu') v = autopilot(dt);
      else {
        v = (keys.right || pads.right ? 1 : 0) - (keys.left || pads.left ? 1 : 0);
        if (padAxis) v = padAxis;
        if (keys.fire || pads.fire || padFire) tryFire();
      }
      if (player.alive) player.x = Math.max(MARGIN + 16, Math.min(W - MARGIN - 16, player.x + v * 210 * dt));
      else if (state === 'menu' && stateT > 0) { player = { x: W / 2, alive: true }; bombs = []; }

      // marcha da formação
      stepT -= dt;
      if (stepT <= 0) { step(); stepT += stepInterval(); if (stepT < 0) stepT = 0; }

      // bombas dos aliens
      bombT -= dt;
      const maxBombs = Math.min(5, 3 + Math.floor((wave - 1) / 2));
      if (bombT <= 0 && player.alive) {
        if (bombs.length < maxBombs) spawnBomb();
        bombT = Arcade.rand(0.45, 1.25) * Math.max(0.45, 1 - (wave - 1) * 0.07) * (codes.has('LENTO') ? 1.8 : 1);
      }

      // disco voador
      if (!ufo) {
        ufoT -= dt;
        if (ufoT <= 0 && aliveCount() >= 8) {
          const fromLeft = Math.random() < 0.5;
          ufo = { x: fromLeft ? -24 : W + 24, dir: fromLeft ? 1 : -1 };
          ufoT = Arcade.rand(18, 26);
        }
      } else {
        ufo.x += ufo.dir * 95 * (codes.has('LENTO') ? 0.6 : 1) * dt;
        sirenT -= dt;
        if (sirenT <= 0) { sirenT = 0.14; const hiNote = Math.floor(time / 0.14) % 2; tone(hiNote ? 1250 : 880, 0.13, 'sine', 0.035, hiNote ? 880 : 1250); }
        if (ufo.x < -40 || ufo.x > W + 40) ufo = null;
      }

      updateShots(dt);
      if (aliveCount() === 0 && (state === 'play' || state === 'menu')) {
        if (state === 'menu') newWave();
        else { state = 'clear'; stateT = 0; Sfx.win(); bombs = []; }
      }
    } else if (state === 'dying') {
      if (stateT > 1.8) {
        if (lives > 0) { player = { x: W / 2, alive: true }; bombs = []; bullets = []; state = 'play'; stateT = 0; updateHud(); }
        else gameOver();
      }
    } else if (state === 'clear') {
      if (stateT > 2) { wave++; newWave(); state = 'play'; stateT = 0; updateHud(); }
    }

    for (const b of bunkers) if (b.dirty) renderBunker(b);
    for (const b of booms) b.t -= dt;
    booms = booms.filter(b => b.t > 0);
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 14 * dt; }
    popups = popups.filter(p => p.life > 0);
  }

  function updateShots(dt) {
    // tiros do canhão, em passinhos de 4 unidades para não atravessar nada
    for (const s of bullets) {
      const dist = 640 * dt, n = Math.ceil(dist / 4);
      for (let i = 0; i < n && !s.dead; i++) {
        s.y -= dist / n; s.x += (s.vx * dt) / n;
        if (s.y < 40) { s.dead = true; burst(s.x, 40, '#ffffff', 4, 60, 2); break; }
        // contra aliens
        for (const a of aliens) {
          if (!a.alive) continue;
          const b = alienBox(a);
          if (Math.abs(s.x - b.x) < b.w / 2 && Math.abs(s.y - b.y) < b.h / 2) { killAlien(a); s.dead = true; break; }
        }
        if (s.dead) break;
        if (ufo && Math.abs(s.x - ufo.x) < 20 && Math.abs(s.y - UFO_Y) < 9) { hitUfo(s); s.dead = true; break; }
        const hit = bunkerAt(s.x, s.y);
        if (hit) { erode(hit, 0.9); s.dead = true; break; }
        // tiro contra bomba: os dois somem (a bomba "raio" às vezes aguenta)
        for (const b of bombs) {
          if (Math.abs(s.x - b.x) < 5 && Math.abs(s.y - b.y) < 10) {
            s.dead = true;
            if (b.type !== 'raio' || Math.random() < 0.5) b.dead = true;
            burst(b.x, b.y, '#ffd400', 6, 90, 2);
            tone(1800, 0.05, 'square', 0.04);
            break;
          }
        }
      }
    }
    bullets = bullets.filter(s => !s.dead);

    // bombas
    for (const b of bombs) {
      if (b.dead) continue;
      b.t += dt;
      const dist = b.v * dt, n = Math.ceil(dist / 3);
      for (let i = 0; i < n && !b.dead; i++) {
        b.y += dist / n;
        const tip = b.y + 6;
        const hit = bunkerAt(b.x, tip);
        if (hit) { erode(hit, 1); b.dead = true; break; }
        if (player.alive && Math.abs(b.x - player.x) < 15 && tip > PLAYER_Y + 2 && b.y - 6 < PLAYER_Y + 19) { b.dead = true; killPlayer(); break; }
        if (tip >= GROUND) { b.dead = true; burst(b.x, GROUND, '#b26bff', 5, 70, 2); break; }
      }
    }
    bombs = bombs.filter(b => !b.dead);
  }

  /* ---------- desenho ---------- */
  function drawText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawBomb(b) {
    const color = settings.look === 'cel' ? '#ffffff' : '#ffd9ff';
    ctx.save();
    ctx.shadowColor = settings.look === 'cel' ? '#fff' : '#ff2bd6'; ctx.shadowBlur = 8;
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
    const ph = Math.floor(b.t * 12) % 4;
    if (b.type === 'zig') {
      // rolante: zigue-zague que gira
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) { const x = b.x + ((i + ph) % 2 ? 2.5 : -2.5), y = b.y - 6 + i * 3; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    } else if (b.type === 'cruz') {
      // êmbolo: haste com uma barra que sobe e desce
      ctx.fillRect(b.x - 1, b.y - 6, 2, 12);
      ctx.fillRect(b.x - 3.5, b.y - 5 + ph * 3, 7, 2);
    } else {
      // raio: tremido e mais rápido
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 7);
      ctx.lineTo(b.x + (ph % 2 ? 3 : -3), b.y - 2); ctx.lineTo(b.x + (ph % 2 ? -3 : 3), b.y + 2); ctx.lineTo(b.x, b.y + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 12 : 0, sy = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 12 : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    // estrelas piscando
    for (const s of stars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.5 + s.p));
      ctx.fillStyle = `rgba(230,220,255,${a})`;
      ctx.fillRect(s.x, s.y % H, s.s, s.s);
    }

    // chão
    ctx.save();
    ctx.shadowColor = '#b26bff'; ctx.shadowBlur = 10;
    ctx.fillStyle = settings.look === 'cel' ? '#39ff14' : '#b26bff';
    ctx.fillRect(MARGIN, GROUND, W - MARGIN * 2, 2);
    ctx.restore();

    // bunkers
    ctx.save();
    ctx.shadowColor = BUNKER_COLOR; ctx.shadowBlur = 8;
    for (const b of bunkers) ctx.drawImage(b.canvas, b.x, b.y, BC * CELL, BRW * CELL);
    ctx.restore();

    // aliens
    for (const a of aliens) {
      if (!a.alive) continue;
      const b = alienBox(a);
      drawSprite(a.t.spr, frameIdx, tint(a.t.color, b.y), b.x, b.y);
    }
    for (const b of booms) drawSprite('boom', 0, b.color, b.x, b.y, Math.min(1, b.t * 6));

    if (ufo) drawSprite('ufo', 0, UFO_COLOR, ufo.x, UFO_Y);
    for (const b of bombs) drawBomb(b);

    // tiros do canhão
    ctx.save();
    ctx.shadowColor = CANNON_COLOR; ctx.shadowBlur = 10; ctx.fillStyle = '#eaffe0';
    for (const s of bullets) ctx.fillRect(s.x - 1, s.y - 6, 2, 12);
    ctx.restore();

    // canhão
    if (player.alive) drawSprite('cannon', 0, tint(CANNON_COLOR, PLAYER_Y + 40), player.x, PLAYER_Y + 10);
    else if (state === 'dying' || (state === 'menu' && stateT < 0) || state === 'over') {
      const blink = Math.floor(time * 12) % 2;
      if (stateT < 1.2 || state === 'menu') drawSprite('boom', 0, blink ? CANNON_COLOR : '#ffffff', player.x + (blink ? 1 : -1), PLAYER_Y + 10);
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(p.text, p.x, p.y, p.big ? 18 : 15, p.color, Math.min(1, p.life * 2));

    // vidas de reserva embaixo do chão, como no fliperama
    if (state !== 'menu') {
      ctx.font = '700 14px Orbitron, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = CANNON_COLOR;
      ctx.fillText(String(lives), MARGIN + 4, GROUND + 20);
      const show = Math.min(Math.max(0, lives - (player.alive ? 1 : 0)), 6);
      for (let i = 0; i < show; i++) drawSprite('cannon', 0, CANNON_COLOR, MARGIN + 40 + i * 36, GROUND + 20, 0.85);
    }

    // textos
    const mid = H * 0.5;
    if (state === 'play' && stateT < 1.6) {
      drawText(`ONDA ${wave}`, W / 2, mid, 40, '#b26bff', Math.min(1, (1.6 - stateT) * 2));
      if (wave === 1) drawText('PREPARE-SE!', W / 2, mid + 40, 16, '#fff', Math.min(1, (1.6 - stateT) * 2));
    } else if (state === 'clear') {
      drawText('ONDA DERROTADA!', W / 2, mid, 30, '#39ff14', Math.min(1, stateT * 3));
    } else if (state === 'dying' && stateT > 0.6) {
      const t = invaded ? 'INVASÃO!' : lives > 0 ? `${lives} ${lives === 1 ? 'VIDA' : 'VIDAS'}` : 'FIM DE JOGO';
      drawText(t, W / 2, mid, 32, lives > 0 && !invaded ? '#b26bff' : '#ff3b5c', (stateT - 0.6) * 3);
    }
    if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT})`; ctx.fillRect(-20, -20, W + 40, H + 40); }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scan, 0, 0);
  }

  // Tabela de pontos no menu, com os próprios sprites.
  function buildPointsTable() {
    const box = $('pointsTable');
    const rows = [['ufo', UFO_COLOR, '= ? MISTÉRIO'], ['squid', TYPES[0].color, '= 30 PONTOS'], ['crab', TYPES[1].color, '= 20 PONTOS'], ['octo', TYPES[3].color, '= 10 PONTOS']];
    for (const [name, color, text] of rows) {
      const spr = SPR[name][0], s = 3;
      const c = document.createElement('canvas');
      c.width = 16 * s; c.height = 8 * s;
      c.style.width = (16 * s) / 1.5 + 'px'; c.style.height = (8 * s) / 1.5 + 'px';
      const g = c.getContext('2d');
      g.fillStyle = color;
      const ox = Math.floor((16 - spr[0].length) / 2);
      spr.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect((ox + x) * s, y * s, s, s); });
      const label = document.createElement('span');
      label.textContent = text;
      box.append(c, label);
    }
  }

  /* ---------- laço principal ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    pollPad();
    if (state !== 'pause') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  buildPointsTable();
  makeStars();
  newGame();
  resize();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
