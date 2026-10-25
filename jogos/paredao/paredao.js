// Paredão: quebra-tijolos com fases desenhadas em texto, cápsulas de poder e bola que acelera.
(() => {
  const W = 480;
  let H = 640;                                      // cresce até 860 em telas em pé (celular)
  const WALL = 12;                                  // espessura das paredes laterais e do teto
  const COLS = 13, BW = (W - WALL * 2) / COLS, BH = 18, TOP = 66;
  const PH = 14;                                    // espessura da raquete
  let PY = H - 46;                                  // topo da raquete
  const BR = 6;                                     // raio da bola
  const PADDLE_W = 84, GIANT_W = 196, WIDE_K = 1.55;
  const MAX_BALLS = 9;
  const TAU = Math.PI * 2;

  // Tipos de tijolo. Letras minúsculas = 1 batida. S = prata (2), H = bronze (3), X = indestrutível.
  const BRICKS = {
    w: { color: '#f2f0ff', pts: 50 },
    o: { color: '#ff8a00', pts: 60 },
    c: { color: '#00e5ff', pts: 70 },
    g: { color: '#39ff14', pts: 80 },
    r: { color: '#ff3b5c', pts: 90 },
    b: { color: '#3b7bff', pts: 100 },
    m: { color: '#ff2bd6', pts: 110 },
    y: { color: '#ffd400', pts: 120 },
    S: { color: '#aab6cc', pts: 200, hp: 2 },
    H: { color: '#c8743a', pts: 300, hp: 3 },
    X: { color: '#e8b923', pts: 0, hp: Infinity },
  };

  // As fases: cada linha tem 13 colunas. '.' é espaço vazio.
  const LEVELS = [
    { name: 'ARCO-ÍRIS', rows: [
      '.............',
      'SSSSSSSSSSSSS',
      'rrrrrrrrrrrrr',
      'ooooooooooooo',
      'yyyyyyyyyyyyy',
      'ggggggggggggg',
      'ccccccccccccc',
      'bbbbbbbbbbbbb',
      'mmmmmmmmmmmmm',
    ] },
    { name: 'PIRÂMIDE', rows: [
      '......w......',
      '.....wyw.....',
      '....wyoyw....',
      '...wyoroyw...',
      '..wyormroyw..',
      '.wyormbmroyw.',
      'wyormbcbmroyw',
      'SSSSSSSSSSSSS',
      '.............',
      'X.....X.....X',
    ] },
    { name: 'INVASOR', rows: [
      'c.c.c.c.c.c.c',
      '.............',
      '...g.....g...',
      '....g...g....',
      '...ggggggg...',
      '..ggrgggrgg..',
      '.ggggggggggg.',
      '.g.ggggggg.g.',
      '.g.g.....g.g.',
      '....SS.SS....',
    ] },
    { name: 'FORTALEZA', rows: [
      '.............',
      '.mmmmmmmmmmm.',
      '.mSSSSSSSSSm.',
      '.mSbbbbbbbSm.',
      '.mSbHHHHHbSm.',
      '.mSbHyyyHbSm.',
      '.mSbHHHHHbSm.',
      '.mSbbbbbbbSm.',
      '.mSSSSSSSSSm.',
      '.............',
      'XXXX.....XXXX',
    ] },
    { name: 'XADREZ', rows: [
      'r.o.y.g.c.b.m',
      '.r.o.y.g.c.b.',
      'm.r.o.y.g.c.b',
      '.m.r.o.y.g.c.',
      'b.m.r.o.y.g.c',
      '.b.m.r.o.y.g.',
      'S.S.S.S.S.S.S',
      '.H.H.H.H.H.H.',
    ] },
    { name: 'CORAÇÃO', rows: [
      '..rrr...rrr..',
      '.rmmmr.rmmmr.',
      'rmwmmmrmmmmmr',
      'rmmmmmmmmmmmr',
      'rmmmmmmmmmmmr',
      '.rmmmmmmmmmr.',
      '..rmmmmmmmr..',
      '...rmmmmmr...',
      '....rmmmr....',
      '.....rHr.....',
      '......X......',
    ] },
    { name: 'COLUNAS', rows: [
      'HHHHHHHHHHHHH',
      'c.y.c.y.c.y.c',
      'c.y.c.y.c.y.c',
      'c.y.c.y.c.y.c',
      'S.S.S.S.S.S.S',
      'g.m.g.m.g.m.g',
      'g.m.g.m.g.m.g',
      'b.b.b.b.b.b.b',
      '.............',
      '.X.X.X.X.X.X.',
    ] },
    { name: 'CAVEIRA', rows: [
      'X...........X',
      '...wwwwwww...',
      '..wwwwwwwww..',
      '.wwwwwwwwwww.',
      '.wwrrwwwrrww.',
      '.wwrrwwwrrww.',
      '.wwwwwHwwwww.',
      '..wwwwwwwww..',
      '...wSwSwSw...',
      '...SSSSSSS...',
      '.............',
      'XX.XX.X.XX.XX',
    ] },
    { name: 'DIAMANTE', rows: [
      '......X......',
      '.....cbc.....',
      '....cbHbc....',
      '...cbHyHbc...',
      '..cbHyXyHbc..',
      '...cbHyHbc...',
      '....cbHbc....',
      '.....cbc.....',
      '......c......',
      'S...........S',
    ] },
    { name: 'MURALHA FINAL', rows: [
      'yyyyyyyyyyyyy',
      'HSHSHSHSHSHSH',
      'rrrrrrrrrrrrr',
      'SHSHSHSHSHSHS',
      'mmmmmmmmmmmmm',
      'XXX.XXXXX.XXX',
      'ccccccccccccc',
      '.............',
      '..X...X...X..',
    ] },
  ];

  // Cápsulas: cor, nome mostrado e peso no sorteio (V é a mais rara).
  const CAPS = {
    L: { color: '#ff3b5c', name: 'LASER!', w: 20 },
    E: { color: '#3b7bff', name: 'RAQUETE LARGA!', w: 22 },
    M: { color: '#00e5ff', name: 'MULTIBOLA!', w: 18 },
    S: { color: '#ff8a00', name: 'BOLA LENTA!', w: 22 },
    V: { color: '#c9c9dd', name: 'VIDA EXTRA!', w: 6 },
  };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), lives: $('hLives'), level: $('hLevel'), status: $('hStatus') };

  /* ---------- configurações e códigos ---------- */
  const settings = { sens: 'med', crt: 'on' };
  const SENS = { low: 1, med: 1.4, high: 1.9 };
  Arcade.bindSettings(panels.menu, settings, 'paredao_', key => { if (key === 'crt') buildScan(); });
  const codes = Arcade.codes('paredao', {
    KONAMI: 'Bola de fogo que atravessa os tijolos',
    GIGANTE: 'Raquete gigante',
    MULTIBOLA: 'Toda vida começa com 3 bolas',
  }, $('codeMount'));

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');      // fundo e paredes (estático)
  const layer = document.createElement('canvas');   // tijolos (refeito só quando algum muda)
  const scan = document.createElement('canvas');    // linhas de TV de tubo + vinheta
  let layerDirty = true;

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    H = Math.round(Math.max(640, Math.min(860, (W * h) / Math.max(1, w))));
    PY = H - 46;
    k = Arcade.fit(canvas, W, H, wrap);
    buildBackground();
    buildScan();
    layerDirty = true;
  }

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#12051f'); sky.addColorStop(0.6, '#0a0414'); sky.addColorStop(1, '#1a0710');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // padrão de losangos bem apagado, lembrando os fundos do fliperama
    g.strokeStyle = 'rgba(255,138,0,0.07)'; g.lineWidth = 1;
    for (let y = 0; y < H + 40; y += 32) {
      for (let x = 0; x < W + 40; x += 40) {
        const ox = (y / 32) % 2 ? 20 : 0;
        g.beginPath();
        g.moveTo(x + ox, y - 14); g.lineTo(x + ox + 18, y); g.lineTo(x + ox, y + 14); g.lineTo(x + ox - 18, y); g.closePath();
        g.stroke();
      }
    }
    // brilho no chão, perto da raquete
    const glow = g.createRadialGradient(W / 2, H + 40, 10, W / 2, H + 40, 320);
    glow.addColorStop(0, 'rgba(255,138,0,0.22)'); glow.addColorStop(1, 'rgba(255,138,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // paredes de metal com tubos neon
    const metal = (x, y, w, h, vertical) => {
      const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, '#3a3550'); gr.addColorStop(0.45, '#b9b4d0'); gr.addColorStop(0.55, '#8c87a6'); gr.addColorStop(1, '#2a2540');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    };
    metal(0, 0, WALL, H, true);
    metal(W - WALL, 0, WALL, H, true);
    metal(0, 0, W, WALL, false);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 40; y < H; y += 80) { g.fillRect(0, y, WALL, 3); g.fillRect(W - WALL, y, WALL, 3); }
    for (let x = 40; x < W; x += 80) g.fillRect(x, 0, 3, WALL);
    g.save();
    g.shadowColor = '#ff8a00'; g.shadowBlur = 12;
    g.strokeStyle = '#ff8a00'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(WALL + 1, H); g.lineTo(WALL + 1, WALL + 1); g.lineTo(W - WALL - 1, WALL + 1); g.lineTo(W - WALL - 1, H);
    g.stroke();
    g.restore();
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    if (settings.crt !== 'on') return;
    g.fillStyle = 'rgba(0,0,0,0.16)';
    const step = Math.max(2, Math.round(canvas.height / 260));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, scan.height * 0.3, scan.width / 2, scan.height / 2, scan.height * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let score = 0, lives = 3, levelIdx = 0, loop = 0, broken = 0;
  let bricks = [], grid = [], remaining = 0;
  let balls = [], capsules = [], lasers = [], particles = [], rings = [], popups = [];
  let paddle = { x: W / 2, w: PADDLE_W, mode: 'normal', glow: 0 };
  let speed = 300, baseSpeed = 300, maxSpeed = 500;
  let time = 0, stateT = 0, introT = 0, shakeT = 0, flashT = 0, laserCd = 0, overT = 0;
  let demoAim = 0, demoLaunchT = 0;
  let hi = +Arcade.store.get('paredao_hi', 0) || 0;

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function loadLevel() {
    const L = LEVELS[levelIdx];
    bricks = []; grid = []; remaining = 0;
    L.rows.forEach((row, r) => {
      grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        const ch = row[c] || '.';
        const t = BRICKS[ch];
        if (!t) { grid[r][c] = null; continue; }
        const hp = t.hp || 1;
        const b = { r, c, x: WALL + c * BW, y: TOP + r * BH, w: BW, h: BH, ch, color: t.color, pts: t.pts, hp, maxhp: hp, flash: 0, seed: r * 31 + c * 7 + 1 };
        grid[r][c] = b;
        bricks.push(b);
        if (hp !== Infinity) remaining++;
      }
    });
    capsules = []; lasers = [];
    baseSpeed = 300 * (1 + 0.15 * loop);
    maxSpeed = baseSpeed * 1.6;
    introT = 0;
    layerDirty = true;
  }

  const paddleTarget = () => (codes.has('GIGANTE') ? GIANT_W : PADDLE_W) * (paddle.mode === 'wide' ? WIDE_K : 1);

  // Nova vida: raquete no centro e bola(s) presa(s) nela.
  function resetLife() {
    paddle.mode = 'normal';
    paddle.x = W / 2;
    paddle.w = paddleTarget();
    speed = baseSpeed;
    balls = [];
    const offs = codes.has('MULTIBOLA') ? [-18, 0, 18] : [0];
    for (const o of offs) balls.push(makeBall(paddle.x + o, PY - BR, 0, -1, o));
    capsules = []; lasers = [];
    demoLaunchT = 0.9;
  }

  function makeBall(x, y, vx, vy, stuck = null) {
    return { x, y, vx, vy, stuck, trail: [] };
  }

  function newGame(demo) {
    score = 0; lives = 3; loop = 0; broken = 0;
    levelIdx = demo ? (Math.random() * LEVELS.length) | 0 : 0;
    particles = []; rings = []; popups = [];
    loadLevel();
    resetLife();
  }

  function start() {
    Sfx.ensure();
    newGame(false);
    state = 'play'; stateT = 0;
    show(null);
    updateHud();
    Sfx.tone(300, 0.25, 'square', 0.07, 900);
  }

  function toMenu() {
    state = 'menu';
    newGame(true);
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
    if (rec) { hi = score; Arcade.store.set('paredao_hi', hi); }
    Ranking.gameOver($('rankBox'), { board: 'paredao', score, cheated });
    $('overScore').textContent = score;
    const fase = levelIdx + 1 + loop * LEVELS.length;
    $('overInfo').textContent = `Chegou à fase ${fase} (${LEVELS[levelIdx].name}) · ${broken} ${broken === 1 ? 'tijolo derrubado' : 'tijolos derrubados'}`;
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.lives.textContent = demo ? 3 : lives;
    hud.level.textContent = demo ? 1 : levelIdx + 1 + loop * LEVELS.length;
    const st = [];
    if (!demo) {
      if (paddle.mode === 'laser') st.push('LASER');
      if (paddle.mode === 'wide') st.push('LARGA');
      if (balls.length > 1) st.push(`BOLAS ×${balls.length}`);
      if (codes.has('KONAMI')) st.push('🔥');
    }
    hud.status.textContent = st.join(' · ');
  }

  /* ---------- ações ---------- */
  function launch() {
    const stuck = balls.filter(b => b.stuck !== null);
    if (!stuck.length) return false;
    stuck.forEach((b, i) => {
      const a = stuck.length > 1 ? (i - (stuck.length - 1) / 2) * 0.5 : Arcade.rand(-0.35, 0.35);
      b.vx = Math.sin(a); b.vy = -Math.cos(a); b.stuck = null;
    });
    tone(520, 0.12, 'square', 0.07, 1040);
    return true;
  }

  function fireLaser() {
    if (paddle.mode !== 'laser' || laserCd > 0) return;
    laserCd = 0.24;
    const off = paddle.w / 2 - 8;
    lasers.push({ x: paddle.x - off, y: PY - 4 }, { x: paddle.x + off, y: PY - 4 });
    tone(1500, 0.09, 'sawtooth', 0.05, 400);
  }

  // Espaço / clique / toque rápido / botão A: lança a bola ou atira.
  function action() {
    if (state !== 'play') return;
    if (!launch()) fireLaser();
  }

  /* ---------- tijolos ---------- */
  function cellAt(x, y) {
    const c = Math.floor((x - WALL) / BW), r = Math.floor((y - TOP) / BH);
    if (r < 0 || c < 0 || c >= COLS || !grid[r]) return null;
    return grid[r][c] || null;
  }

  function burst(x, y, color, n, power = 160, size = 3) {
    for (let i = 0; i < n && particles.length < 700; i++) {
      const a = Math.random() * TAU, s = Arcade.rand(power * 0.2, power);
      const life = Arcade.rand(0.35, 0.9);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, max: life, color, size: Arcade.rand(size * 0.6, size * 1.4) });
    }
  }

  // Bate no tijolo. Retorna true se ele foi destruído.
  function damage(b, fire) {
    const demo = state === 'menu';
    if (b.hp === Infinity) {
      b.flash = 0.3;
      burst(b.x + b.w / 2, b.y + b.h / 2, '#fff3b0', 5, 120, 2);
      tone(1760, 0.08, 'triangle', 0.06); tone(2637, 0.1, 'sine', 0.04, null, 0.02);
      return false;
    }
    b.hp = fire ? 0 : b.hp - 1;
    b.flash = 0.22;
    layerDirty = true;
    if (b.hp > 0) {
      tone(1180 + b.hp * 200, 0.07, 'triangle', 0.08);
      burst(b.x + b.w / 2, b.y + b.h / 2, '#e8eef8', 4, 90, 2);
      return false;
    }
    grid[b.r][b.c] = null;
    const i = bricks.indexOf(b);
    if (i >= 0) bricks.splice(i, 1);
    remaining--;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    burst(cx, cy, b.color, 14, 200);
    burst(cx, cy, '#ffffff', 3, 120, 2);
    rings.push({ x: b.x, y: b.y, w: b.w, h: b.h, color: b.color, life: 0.35 });
    // nota mais aguda nas linhas de cima
    tone(Math.max(260, 900 - b.r * 45), 0.06, 'square', 0.06, null);
    if (!demo) {
      const pts = b.pts * (loop + 1);
      score += pts; broken++;
      if (b.maxhp > 1) popups.push({ x: cx, y: cy, text: `+${pts}`, color: b.color, life: 0.8 });
    }
    // chance de soltar uma cápsula
    if (capsules.length < 2 && Math.random() < 0.15) {
      const pool = Object.keys(CAPS).filter(t => !(t === 'M' && balls.length >= 6));
      let roll = Math.random() * pool.reduce((s, t) => s + CAPS[t].w, 0);
      let type = pool[0];
      for (const t of pool) { roll -= CAPS[t].w; if (roll <= 0) { type = t; break; } }
      capsules.push({ x: cx, y: cy, type, t: 0 });
    }
    if (!demo) updateHud();
    return true;
  }

  // Colisão da bola com tijolos num eixo. Retorna true se a bola quicou.
  function hitBricks(ball, axis, d) {
    const fire = codes.has('KONAMI');
    const c0 = Math.floor((ball.x - BR - WALL) / BW), c1 = Math.floor((ball.x + BR - WALL) / BW);
    const r0 = Math.floor((ball.y - BR - TOP) / BH), r1 = Math.floor((ball.y + BR - TOP) / BH);
    let best = null, bestD = Infinity, solid = false;
    const hits = [];
    for (let r = Math.max(0, r0); r <= r1; r++) {
      if (!grid[r]) continue;
      for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
        const b = grid[r][c];
        if (!b) continue;
        // ponto do tijolo mais próximo do centro da bola
        const nx = Math.max(b.x, Math.min(ball.x, b.x + b.w)), ny = Math.max(b.y, Math.min(ball.y, b.y + b.h));
        const dist = Math.hypot(ball.x - nx, ball.y - ny);
        if (dist >= BR) continue;
        hits.push(b);
        if (dist < bestD) { bestD = dist; best = b; }
      }
    }
    if (!best) return false;
    if (fire) {
      // bola de fogo: atravessa (e destrói) tudo, menos os indestrutíveis
      for (const b of hits) if (b.hp !== Infinity) damage(b, true);
      solid = hits.some(b => b.hp === Infinity);
      if (!solid) return false;
      for (const b of hits) if (b.hp === Infinity) damage(b, true);
    } else {
      damage(best, false);
    }
    if (axis === 'x') { ball.x -= ball.vx * d; ball.vx = -ball.vx; }
    else { ball.y -= ball.vy * d; ball.vy = -ball.vy; }
    return true;
  }

  /* ---------- bola ---------- */
  function moveBall(b, dt) {
    const dist = speed * dt;
    const steps = Math.max(1, Math.ceil(dist / 3));
    const d = dist / steps;
    for (let i = 0; i < steps; i++) {
      // eixo X
      b.x += b.vx * d;
      if (b.x < WALL + BR) { b.x = WALL + BR; b.vx = Math.abs(b.vx); wallTick(); }
      else if (b.x > W - WALL - BR) { b.x = W - WALL - BR; b.vx = -Math.abs(b.vx); wallTick(); }
      else hitBricks(b, 'x', d);
      // eixo Y
      const prevY = b.y;
      b.y += b.vy * d;
      if (b.y < WALL + BR) { b.y = WALL + BR; b.vy = Math.abs(b.vy); wallTick(); }
      else if (!hitBricks(b, 'y', d) && b.vy > 0) paddleHit(b, prevY);
      if (b.y - BR > H) { b.dead = true; return; }
    }
  }

  let wallSfxT = 0;
  function wallTick() {
    if (wallSfxT > 0) return;
    wallSfxT = 0.05;
    tone(240, 0.04, 'square', 0.035);
  }

  function paddleHit(b, prevY) {
    const half = paddle.w / 2;
    if (b.y + BR < PY || prevY + BR > PY + 4) return;
    if (b.x < paddle.x - half - BR || b.x > paddle.x + half + BR) return;
    // o ângulo depende do ponto de contato: centro = reto para cima, pontas = até 60°
    const t = Math.max(-1, Math.min(1, (b.x - paddle.x) / (half + BR * 0.5)));
    const a = t * 1.05 + Arcade.rand(-0.03, 0.03);
    b.vx = Math.sin(a); b.vy = -Math.cos(a);
    b.y = PY - BR;
    speed = Math.min(maxSpeed, speed + 4);
    paddle.glow = 1;
    tone(330 + Math.abs(t) * 220, 0.07, 'square', 0.07);
    if (state === 'menu') demoAim = Arcade.rand(-0.85, 0.85);
  }

  // Multibola: cada bola em jogo ganha duas irmãs, giradas 0,4 rad para cada lado.
  function split() {
    const add = [];
    for (const b of balls) {
      if (b.stuck !== null) continue;
      for (const da of [-0.4, 0.4]) {
        if (balls.length + add.length >= MAX_BALLS) break;
        const c = Math.cos(da), s = Math.sin(da);
        let vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c;
        // nunca deixa a bola andar quase na horizontal
        if (Math.abs(vy) < 0.45) { vy = Math.sign(vy || -1) * 0.45; vx = Math.sign(vx || 1) * Math.sqrt(1 - vy * vy); }
        add.push(makeBall(b.x, b.y, vx, vy));
      }
    }
    balls.push(...add);
  }

  function collect(cap) {
    const info = CAPS[cap.type];
    const demo = state === 'menu';
    if (cap.type === 'L') paddle.mode = 'laser';
    else if (cap.type === 'E') paddle.mode = 'wide';
    else if (cap.type === 'M') { launch(); split(); }
    else if (cap.type === 'S') speed = Math.max(baseSpeed * 0.62, speed * 0.6);
    else if (cap.type === 'V' && !demo) lives++;
    burst(cap.x, PY, info.color, 18, 180);
    rings.push({ x: paddle.x - paddle.w / 2, y: PY, w: paddle.w, h: PH, color: info.color, life: 0.4 });
    if (!demo) {
      score += 100 * (loop + 1);
      popups.push({ x: cap.x, y: PY - 24, text: info.name, color: info.color, life: 1.2 });
      updateHud();
    }
    [660, 880, 1320].forEach((f, i) => tone(f, 0.08, 'square', 0.06, null, i * 0.05));
    if (cap.type === 'V') tone(1760, 0.3, 'triangle', 0.06, 2637, 0.16);
  }

  function loseLife() {
    state = 'dying'; stateT = 0;
    shakeT = 0.45; flashT = 0.3;
    burst(paddle.x, PY + PH / 2, '#ff8a00', 30, 260, 4);
    burst(paddle.x, PY + PH / 2, '#ff3b5c', 20, 200, 3);
    burst(paddle.x, PY + PH / 2, '#ffffff', 10, 140, 2);
    capsules = []; lasers = [];
    Sfx.explode();
    Sfx.tone(440, 0.6, 'sawtooth', 0.06, 60, 0.1);
    lives--;
    updateHud();
  }

  function levelClear() {
    const demo = state === 'menu';
    if (demo) {
      levelIdx = (levelIdx + 1) % LEVELS.length;
      loadLevel(); resetLife();
      return;
    }
    state = 'clear'; stateT = 0;
    const bonus = 1000 * (loop + 1);
    score += bonus;
    popups.push({ x: W / 2, y: H * 0.62, text: `BÔNUS +${bonus}`, color: '#ffd400', life: 2 });
    for (const b of balls) burst(b.x, b.y, '#ffd400', 12, 160);
    Sfx.win();
    updateHud();
  }

  function nextLevel() {
    levelIdx++;
    if (levelIdx >= LEVELS.length) { levelIdx = 0; loop++; }
    loadLevel();
    resetLife();
    state = 'play'; stateT = 0;
    updateHud();
  }

  /* ---------- entrada ---------- */
  const keys = { left: false, right: false, fire: false };
  let mouseX = null;       // mouse: a raquete segue o ponteiro
  let touch = null;        // toque: arrastar move a raquete (movimento relativo)

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
    if (key === 'arrowleft' || key === 'a') { keys.left = true; mouseX = null; }
    if (key === 'arrowright' || key === 'd') { keys.right = true; mouseX = null; }
    if (key === ' ' || key === 'arrowup' || key === 'w') { if (!e.repeat) action(); keys.fire = true; }
  });
  addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') keys.left = false;
    if (key === 'arrowright' || key === 'd') keys.right = false;
    if (key === ' ' || key === 'arrowup' || key === 'w') keys.fire = false;
  });
  addEventListener('blur', () => { keys.left = keys.right = keys.fire = false; });

  const toLogicalX = clientX => {
    const r = canvas.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  };
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    if (e.pointerType === 'mouse') { mouseX = toLogicalX(e.clientX); action(); return; }
    if (touch) return;
    touch = { id: e.pointerId, x: e.clientX, moved: 0, t: performance.now() };
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
  });
  screen.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { mouseX = toLogicalX(e.clientX); return; }
    if (!touch || e.pointerId !== touch.id) return;
    const r = canvas.getBoundingClientRect();
    const dx = ((e.clientX - touch.x) / r.width) * W;
    touch.x = e.clientX;
    touch.moved += Math.abs(dx);
    if (state === 'play' || state === 'clear') paddle.x += dx * SENS[settings.sens];
  });
  const endTouch = e => {
    if (!touch || e.pointerId !== touch.id) return;
    // toque rápido sem arrastar = lançar/atirar
    if (touch.moved < 8 && performance.now() - touch.t < 320) action();
    touch = null;
  };
  screen.addEventListener('pointerup', endTouch);
  screen.addEventListener('pointercancel', endTouch);

  let padA = false, padStart = false, padAxis = 0;
  function pollPad() {
    const g = Arcade.gamepad(0);
    padAxis = 0;
    if (!g) return;
    padAxis = g.lx;
    if (Math.abs(g.lx) > 0) mouseX = null;
    if (g.a && !padA) {
      if (state === 'menu' || (state === 'over' && overT > 0.6)) start();
      else action();
    }
    if (g.a && state === 'play') fireLaser();   // segurar A mantém o laser disparando
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

  /* ---------- piloto automático (demonstração atrás do menu) ---------- */
  // Prevê onde a bola mais perigosa vai cruzar a altura da raquete, rebatendo nas paredes.
  function predictX(b) {
    if (b.vy <= 0) return b.x;
    const t = (PY - BR - b.y) / b.vy;
    let x = b.x + b.vx * t;
    const lo = WALL + BR, hi2 = W - WALL - BR, span = hi2 - lo;
    x -= lo;
    x = ((x % (2 * span)) + 2 * span) % (2 * span);
    if (x > span) x = 2 * span - x;
    return x + lo;
  }
  function autopilot(dt) {
    let target = null, bestY = -Infinity;
    for (const b of balls) if (b.stuck === null && b.vy > 0 && b.y > bestY) { bestY = b.y; target = b; }
    let tx = W / 2;
    if (target) tx = predictX(target) - demoAim * paddle.w * 0.4;
    else if (capsules.length) tx = capsules[0].x;
    else if (balls[0]) tx = balls[0].x;
    const dx = tx - paddle.x;
    paddle.x += Math.sign(dx) * Math.min(Math.abs(dx), 620 * dt);
    if (balls.some(b => b.stuck !== null)) {
      demoLaunchT -= dt;
      if (demoLaunchT <= 0) launch();
    }
    if (paddle.mode === 'laser' && Math.random() < 0.05) fireLaser();
  }

  /* ---------- atualização ---------- */
  function update(dt) {
    time += dt; stateT += dt;
    introT = Math.min(1, introT + dt * 1.4);
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    laserCd = Math.max(0, laserCd - dt);
    wallSfxT = Math.max(0, wallSfxT - dt);
    paddle.glow = Math.max(0, paddle.glow - dt * 4);
    if (state === 'over') overT += dt;

    const playing = state === 'play' || state === 'menu';
    if (playing) {
      // raquete
      if (state === 'menu') autopilot(dt);
      else {
        let v = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        if (padAxis) v = padAxis;
        paddle.x += v * 640 * dt;
        if (mouseX !== null) paddle.x = mouseX;
        if (keys.fire) fireLaser();
        if (touch && paddle.mode === 'laser') fireLaser();   // dedo na tela = laser contínuo
      }
      paddle.w += (paddleTarget() - paddle.w) * Math.min(1, dt * 10);
      paddle.x = Math.max(WALL + paddle.w / 2, Math.min(W - WALL - paddle.w / 2, paddle.x));

      // bolas
      const moving = balls.some(b => b.stuck === null);
      if (moving) speed = Math.min(maxSpeed, speed + 2.5 * dt);
      for (const b of balls) {
        if (b.stuck !== null) { b.x = paddle.x + b.stuck; b.y = PY - BR; }
        else moveBall(b, dt);
        b.trail.push(b.x, b.y);
        if (b.trail.length > 20) b.trail.splice(0, 2);
        if (codes.has('KONAMI') && Math.random() < 0.8) {
          particles.push({ x: b.x + Arcade.rand(-3, 3), y: b.y + Arcade.rand(-3, 3), vx: Arcade.rand(-20, 20), vy: Arcade.rand(-60, -10), life: 0.35, max: 0.35, color: Arcade.pick(['#ffd400', '#ff8a00', '#ff3b5c']), size: Arcade.rand(2, 4), fire: true });
        }
      }
      balls = balls.filter(b => !b.dead);
      if (!balls.length) {
        if (state === 'menu') resetLife(); else loseLife();
      } else if (remaining <= 0) levelClear();

      // tiros de laser
      for (const l of lasers) {
        l.y -= 820 * dt;
        const b = cellAt(l.x, l.y);
        if (b) { damage(b, false); l.dead = true; burst(l.x, l.y, '#ff3b5c', 4, 80, 2); }
        else if (l.y < WALL) { l.dead = true; burst(l.x, WALL, '#ff3b5c', 3, 60, 2); }
      }
      lasers = lasers.filter(l => !l.dead);
      if (remaining <= 0 && state === 'play') levelClear();

      // cápsulas caindo
      for (const c of capsules) {
        c.y += 115 * dt; c.t += dt;
        if (c.y + 7 >= PY && c.y - 7 <= PY + PH && Math.abs(c.x - paddle.x) <= paddle.w / 2 + 16) { c.dead = true; collect(c); }
        else if (c.y > H + 12) c.dead = true;
      }
      capsules = capsules.filter(c => !c.dead);
      if (state === 'play') updateHudLight();
    } else if (state === 'dying') {
      if (stateT > 1.6) {
        if (lives > 0) { resetLife(); state = 'play'; stateT = 0; updateHud(); }
        else gameOver();
      }
    } else if (state === 'clear') {
      for (const b of balls) { b.trail.push(b.x, b.y); if (b.trail.length > 20) b.trail.splice(0, 2); }
      if (stateT > 2.6) nextLevel();
    }

    for (const b of bricks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
    for (const p of particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.fire) { p.vy += 520 * dt; p.vx *= 0.985; }
    }
    particles = particles.filter(p => p.life > 0);
    for (const r of rings) r.life -= dt;
    rings = rings.filter(r => r.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 26 * dt; }
    popups = popups.filter(p => p.life > 0);
  }

  // Atualiza o texto de estado só quando muda (evita mexer no DOM todo quadro).
  let lastStatus = '';
  function updateHudLight() {
    const s = `${paddle.mode}|${balls.length}`;
    if (s !== lastStatus) { lastStatus = s; updateHud(); }
  }

  /* ---------- desenho ---------- */
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  const seeded = s => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

  function drawBrick(g, b) {
    const x = b.x + 1.5, y = b.y + 1.5, w = b.w - 3, h = b.h - 3;
    g.save();
    g.shadowColor = b.color; g.shadowBlur = 9;
    g.fillStyle = b.color; g.fillRect(x, y, w, h);
    g.restore();
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.06)');
    gr.addColorStop(0.58, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    // chanfro claro em cima/esquerda, escuro embaixo/direita
    g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(x, y, w, 1.5); g.fillRect(x, y, 1.5, h);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y + h - 1.5, w, 1.5); g.fillRect(x + w - 1.5, y, 1.5, h);
    if (b.hp === Infinity) {
      // rebites do bloco indestrutível
      g.fillStyle = 'rgba(90,50,0,0.8)';
      for (const [px, py] of [[4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4]]) { g.beginPath(); g.arc(x + px, y + py, 1.6, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(120,70,0,0.6)'; g.lineWidth = 1;
      g.strokeRect(x + 7.5, y + 4.5, w - 15, h - 9);
    } else if (b.maxhp > 1) {
      // listras de metal e rachaduras conforme o dano
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 3, y + h / 2); g.lineTo(x + w - 3, y + h / 2); g.stroke();
      const dmg = b.maxhp - b.hp;
      if (dmg > 0) {
        const rnd = seeded(b.seed * 97);
        g.strokeStyle = 'rgba(10,0,20,0.85)'; g.lineWidth = 1.2;
        for (let i = 0; i < dmg * 2; i++) {
          let px = x + 4 + rnd() * (w - 8), py = y + 2 + rnd() * (h - 4);
          g.beginPath(); g.moveTo(px, py);
          for (let j = 0; j < 3; j++) { px += (rnd() - 0.5) * 12; py += (rnd() - 0.5) * 8; g.lineTo(px, py); }
          g.stroke();
        }
      }
    }
  }

  function buildLayer() {
    layer.width = canvas.width; layer.height = canvas.height;
    const g = layer.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    for (const b of bricks) drawBrick(g, b);
    layerDirty = false;
  }

  function drawBricks() {
    if (layerDirty) buildLayer();
    // na entrada da fase os tijolos aparecem de cima para baixo, com uma linha de varredura
    const reveal = introT < 1 ? TOP - 10 + introT * (H * 0.55) : H;
    ctx.save();
    if (introT < 1) { ctx.beginPath(); ctx.rect(0, 0, W, reveal); ctx.clip(); }
    ctx.drawImage(layer, 0, 0, W, H);
    ctx.restore();
    if (introT < 1) {
      ctx.save();
      ctx.shadowColor = '#ff8a00'; ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(255,200,120,0.9)'; ctx.fillRect(WALL, reveal - 1, W - WALL * 2, 2);
      ctx.restore();
    }
    // brilho que passa sobre os tijolos de metal e piscadas das batidas
    for (const b of bricks) {
      if (b.y > reveal) continue;
      if (b.maxhp > 1) {
        const band = ((time * 160 + b.y * 3 - b.x * 0.4) % 520) - 60;
        const x0 = Math.max(b.x + 2, b.x + band), x1 = Math.min(b.x + b.w - 2, b.x + band + 7);
        if (x1 > x0) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x0, b.y + 2, x1 - x0, b.h - 4); }
      }
      if (b.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${b.flash * 3})`;
        ctx.fillRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      }
    }
  }

  function drawPaddle() {
    const w = paddle.w, x = paddle.x - w / 2, y = PY;
    const cap = Math.min(14, w * 0.18);
    ctx.save();
    // brilho no chão
    ctx.fillStyle = `rgba(255,138,0,${0.12 + paddle.glow * 0.2})`;
    ctx.beginPath(); ctx.ellipse(paddle.x, y + PH + 10, w * 0.6, 8, 0, 0, TAU); ctx.fill();
    ctx.shadowColor = paddle.mode === 'laser' ? '#ff3b5c' : paddle.mode === 'wide' ? '#3b7bff' : '#ff8a00';
    ctx.shadowBlur = 14 + paddle.glow * 16;
    // corpo de metal
    const gr = ctx.createLinearGradient(0, y, 0, y + PH);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#c9cfe0'); gr.addColorStop(0.7, '#7a8199'); gr.addColorStop(1, '#3d4258');
    ctx.fillStyle = gr;
    rr(ctx, x, y, w, PH, PH / 2); ctx.fill();
    ctx.shadowBlur = 0;
    // pontas coloridas
    const capColor = paddle.mode === 'laser' ? '#ff3b5c' : paddle.mode === 'wide' ? '#3b7bff' : '#ff8a00';
    const cg = ctx.createLinearGradient(0, y, 0, y + PH);
    cg.addColorStop(0, '#fff'); cg.addColorStop(0.3, capColor); cg.addColorStop(1, '#2a0a10');
    ctx.fillStyle = cg;
    ctx.save();
    rr(ctx, x, y, w, PH, PH / 2); ctx.clip();
    ctx.fillRect(x, y, cap, PH); ctx.fillRect(x + w - cap, y, cap, PH);
    ctx.restore();
    // faixa de energia no meio
    const pulse = 0.6 + 0.4 * Math.sin(time * 8);
    ctx.fillStyle = `rgba(255,${150 + pulse * 80},60,${0.7 + paddle.glow * 0.3})`;
    ctx.fillRect(x + cap + 4, y + PH / 2 - 1.5, w - cap * 2 - 8, 3);
    // canhões do laser
    if (paddle.mode === 'laser') {
      for (const s of [-1, 1]) {
        const cx = paddle.x + s * (w / 2 - 8);
        ctx.fillStyle = '#d9dcea'; ctx.fillRect(cx - 3, y - 6, 6, 7);
        ctx.fillStyle = laserCd > 0.15 ? '#fff' : '#ff3b5c'; ctx.fillRect(cx - 1.5, y - 8, 3, 3);
      }
    }
    ctx.restore();
  }

  function drawBalls() {
    const fire = codes.has('KONAMI');
    for (const b of balls) {
      // rastro
      const t = b.trail;
      for (let i = 0; i < t.length - 2; i += 2) {
        const a = (i / t.length);
        ctx.fillStyle = fire ? `rgba(255,${120 + a * 100},0,${a * 0.5})` : `rgba(255,190,120,${a * 0.35})`;
        ctx.beginPath(); ctx.arc(t[i], t[i + 1], BR * (0.3 + a * 0.6), 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.shadowColor = fire ? '#ff5a00' : '#ffcf8a'; ctx.shadowBlur = fire ? 22 : 14;
      const gr = ctx.createRadialGradient(b.x - 2, b.y - 2, 0.5, b.x, b.y, BR);
      if (fire) { gr.addColorStop(0, '#ffffe0'); gr.addColorStop(0.5, '#ffd400'); gr.addColorStop(1, '#ff3b00'); }
      else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#f4ecff'); gr.addColorStop(1, '#b7a8d8'); }
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawCapsule(c) {
    const info = CAPS[c.type];
    const w = 32, h = 14, x = c.x - w / 2, y = c.y - h / 2;
    ctx.save();
    ctx.shadowColor = info.color; ctx.shadowBlur = 12;
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, info.color); gr.addColorStop(1, '#1a0820');
    ctx.fillStyle = gr;
    rr(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.shadowBlur = 0;
    // a letra "rola" junto com a cápsula
    const roll = Math.cos(c.t * 7);
    ctx.save();
    rr(ctx, x, y, w, h, h / 2); ctx.clip();
    ctx.translate(c.x, c.y);
    ctx.scale(1, Math.max(0.15, Math.abs(roll)));
    ctx.font = '900 12px Orbitron, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0d0518';
    ctx.fillText(c.type, 0, 1);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2); ctx.stroke();
    ctx.restore();
  }

  function drawText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0, sy = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    drawBricks();
    for (const r of rings) {
      const g = (0.35 - r.life) * 30;
      ctx.strokeStyle = r.color; ctx.globalAlpha = r.life / 0.35; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - g, r.y - g * 0.5, r.w + g * 2, r.h + g);
    }
    ctx.globalAlpha = 1;
    for (const c of capsules) drawCapsule(c);
    ctx.save();
    ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffd0d8';
    for (const l of lasers) ctx.fillRect(l.x - 1.5, l.y - 10, 3, 14);
    ctx.restore();
    if (state !== 'dying' && !(state === 'over' && lives <= 0)) drawPaddle();
    if (state !== 'dying') drawBalls();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(p.text, p.x, p.y, 15, p.color, Math.min(1, p.life * 2));

    // textos grandes no meio da quadra
    const mid = H * 0.6;
    if (state === 'play' && balls.some(b => b.stuck !== null)) {
      const fase = levelIdx + 1 + loop * LEVELS.length;
      const a = Math.min(1, stateT * 3);
      drawText(`FASE ${fase}`, W / 2, mid - 34, 40, '#ff8a00', a);
      drawText(LEVELS[levelIdx].name, W / 2, mid + 4, 18, '#fff', a);
      if (loop > 0 && levelIdx === 0) drawText(`VOLTA ${loop + 1}: MAIS RÁPIDO!`, W / 2, mid + 30, 13, '#ff3b5c', a);
      if (Math.floor(time * 2.5) % 2) drawText('ESPAÇO OU TOQUE PARA LANÇAR', W / 2, mid + 56, 12, '#ffd400', a);
    } else if (state === 'clear') {
      drawText('FASE COMPLETA!', W / 2, mid - 20, 32, '#ffd400', Math.min(1, stateT * 3));
    } else if (state === 'dying' && stateT > 0.5) {
      drawText(lives > 0 ? `${lives} ${lives === 1 ? 'VIDA' : 'VIDAS'}` : 'FIM DE JOGO', W / 2, mid, 30, lives > 0 ? '#ff8a00' : '#ff3b5c', (stateT - 0.5) * 3);
    }
    if (flashT > 0) { ctx.fillStyle = `rgba(255,60,60,${flashT})`; ctx.fillRect(-20, -20, W + 40, H + 40); }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (settings.crt === 'on') ctx.drawImage(scan, 0, 0);
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
  addEventListener('resize', resize);
  resize();
  newGame(true);
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
