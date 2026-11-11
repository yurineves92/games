// Defesa Total: fogo cai do céu sobre seis cidades neon. Escolha um ponto e uma das três bases
// dispara um interceptor que explode ali; tudo que encosta na explosão explode junto, em cadeia.
(() => {
  const TAU = Math.PI * 2;
  let W = 800, H = 560, GROUND = H - 50;            // o céu se adapta à tela; o chão fica sempre 50 acima da borda
  const ACC = '#ff3b5c';
  const AMMO = 10;                                   // interceptores por base, por onda
  const BASE_FX = [0.065, 0.5, 0.935];               // posição das bases (fração da largura)
  const CITY_FX = [0.19, 0.29, 0.39, 0.61, 0.71, 0.81];
  const CITY_W = 46, CITY_H = 40, SPAD = 6;
  const R0 = 46;                                     // raio da explosão do interceptor
  const GROW = 0.34, HOLD = 0.3, SHRINK = 0.5;       // tempos da explosão: cresce, segura, some
  const CITY_COLORS = ['#4dd2ff', '#ff2bd6', '#ffd400', '#39ff14', '#b26bff', '#ff8a3d'];
  const CHAIN_COLORS = ['#7df9ff', '#ff2bd6', '#ffd400', '#39ff14', '#ffffff'];
  const TYPES = {
    meteoro: { pts: 25, color: '#ff9a2e', r: 4, spd: 1 },
    tridente: { pts: 50, color: '#ff2bd6', r: 5, spd: 0.85 },
    cometa: { pts: 100, color: '#7df9ff', r: 7, spd: 1.1 },
    bomba: { pts: 25, color: '#ffd400', r: 4, spd: 1.15 },
  };
  const BOMBER = { pts: 150, color: '#39ff14', r: 16 };
  const NEW_THREAT = {
    3: ['NOVA AMEAÇA: TRIDENTE', 'Se divide em 3 no meio do caminho. Pegue cedo!'],
    5: ['NOVA AMEAÇA: BOMBARDEIRO', 'Atravessa o céu soltando bombas. Vale 150!'],
    7: ['NOVA AMEAÇA: COMETA BLINDADO', 'A 1ª explosão só racha a casca. Acerte de novo!'],
  };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), wave: $('hWave'), mult: $('hMult'), status: $('hStatus') };
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = Arcade.rand;

  /* ---------- configurações e códigos ---------- */
  const settings = { speed: 'normal' };
  const codes = Arcade.codes('defesa-total', {
    KONAMI: 'Explosões gigantes',
    MUNICAO: 'Munição infinita',
    LENTO: 'Ameaças em câmera lenta',
  }, $('codeMount'), () => updateHud());
  Arcade.bindSettings(panels.menu, settings, 'defesa-total_', () => { loadHi(); updateHud(); });

  const hiKey = () => 'defesa-total_hi_' + settings.speed;
  let hi = 0;
  const loadHi = () => { hi = +Arcade.store.get(hiKey(), 0) || 0; };

  /* ---------- estado ---------- */
  // state: menu (demonstração atrás do menu), game, pause, over.
  // phase: andamento da onda: intro, play, bonus, dying (todas as cidades caíram).
  let state = 'menu', phase = 'intro', phaseT = 0, time = 0, overT = 0;
  let score = 0, wave = 1, spare = 0, nextBonus = 10000, kills = 0, maxChain = 1, shots = 0;
  let cities = [], bases = [], threats = [], interceptors = [], explosions = [], bombers = [];
  let particles = [], popups = [], queue = [], waveT = 0, endT = 0, bonus = null;
  let shakeT = 0, flashT = 0, flashColor = '255,59,92', smokeT = 0, humT = 0, lastBoom = 0, nextId = 1;
  const aim = { x: 400, y: 260, mode: 'mouse', t: 0 };

  const cheat = c => state !== 'menu' && codes.has(c);
  const slowF = () => (cheat('LENTO') ? 0.45 : 1);
  const fastF = () => (settings.speed === 'rapida' ? 1 / 0.72 : 1);
  const bigR = () => R0 * (cheat('KONAMI') ? 2 : 1);
  const mult = () => Math.min(6, 1 + Math.floor((wave - 1) / 2));
  const launchY = () => GROUND - 24;
  const vInterceptor = i => H * 1.55 * (i === 1 ? 1.5 : 1);    // a base central dispara mais rápido

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');
  const scan = document.createElement('canvas');
  let ruinImg = null;

  function layout() {
    GROUND = H - 50;
    bases.forEach((b, i) => { b.x = BASE_FX[i] * W; });
    cities.forEach((c, i) => { c.x = CITY_FX[i] * W; });
  }

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    const a = w / Math.max(1, h);
    let nW, nH;
    if (a >= 1) { nH = 560; nW = Math.round(clamp(560 * a, 640, 1000)); }
    else { nW = 540; nH = Math.round(clamp(540 / a, 620, 1150)); }
    if (nW !== W || nH !== H) rescale(nW / W, nH / H, nW, nH);
    k = Arcade.fit(canvas, W, H, wrap);
    buildBackground();
    buildScan();
    for (const c of cities) c.img = renderCity(c);
    ruinImg = renderRuin();
  }

  // Ajusta tudo que está em voo quando o tamanho lógico muda (girar o celular no meio da onda).
  function rescale(fx, fy, nW, nH) {
    const oldGround = GROUND;
    W = nW; H = nH;
    layout();
    for (const t of threats) {
      t.sx *= fx; t.sy *= fy; t.tx *= fx; t.ty = GROUND - (oldGround - t.ty);
      t.len = Math.hypot(t.tx - t.sx, t.ty - t.sy) || 1;
      placeThreat(t);
    }
    for (const m of interceptors) { m.sx *= fx; m.sy = launchY(); m.tx *= fx; m.ty *= fy; m.len = Math.hypot(m.tx - m.sx, m.ty - m.sy) || 1; }
    for (const e of explosions) { e.x *= fx; e.y = e.ground ? GROUND - (oldGround - e.y) : e.y * fy; }
    for (const b of bombers) { b.x *= fx; b.y *= fy; }
    for (const p of particles) { p.x *= fx; p.y *= fy; }
    for (const p of popups) { p.x *= fx; p.y *= fy; }
    aim.x = clamp(aim.x * fx, 6, W - 6); aim.y = clamp(aim.y * fy, 12, GROUND - 44);
  }

  // Gerador pseudoaleatório com semente (cada cidade tem sempre a mesma silhueta).
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#03010a'); sky.addColorStop(0.6, '#0b0420'); sky.addColorStop(1, '#2a0a2e');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const neb = (x, y, r, c) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    };
    neb(W * 0.25, H * 0.2, Math.max(W, H) * 0.35, 'rgba(178,107,255,0.10)');
    neb(W * 0.8, H * 0.45, Math.max(W, H) * 0.3, 'rgba(255,59,92,0.07)');
    neb(W * 0.5, GROUND, W * 0.6, 'rgba(255,43,214,0.16)');
    // estrelas fixas
    const r = seeded(7);
    for (let i = 0; i < 170; i++) {
      const x = r() * W, y = r() * GROUND * 0.95, s = r() < 0.12 ? 1.8 : 1;
      g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.55})`;
      g.fillRect(x, y, s, s);
    }
    // planeta anelado e uma lua (edição espacial!)
    const px = W * 0.8, py = H * 0.16, pr = Math.min(W, H) * 0.07;
    const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, 'rgba(255,140,170,0.35)'); pg.addColorStop(1, 'rgba(90,20,70,0.25)');
    g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,180,210,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(px, py, pr * 1.8, pr * 0.38, -0.35, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(77,210,255,0.16)';
    g.beginPath(); g.arc(W * 0.14, H * 0.1, pr * 0.32, 0, TAU); g.fill();
    // serra distante no horizonte
    g.fillStyle = '#15061f';
    g.beginPath(); g.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, GROUND - 14 - Math.abs(Math.sin(x * 0.013) * 22) - Math.abs(Math.sin(x * 0.041)) * 8);
    g.lineTo(W, GROUND); g.fill();
    // chão
    const gr = g.createLinearGradient(0, GROUND, 0, H);
    gr.addColorStop(0, '#1b0828'); gr.addColorStop(1, '#05020a');
    g.fillStyle = gr; g.fillRect(0, GROUND, W, H - GROUND);
    g.strokeStyle = 'rgba(255,59,92,0.12)'; g.lineWidth = 1;
    for (let x = -W; x <= W * 2; x += 40) { g.beginPath(); g.moveTo(W / 2 + (x - W / 2) * 0.35, GROUND); g.lineTo(x, H); g.stroke(); }
    for (const y of [GROUND + 14, GROUND + 30, GROUND + 47]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // colinas das bases
    for (const fx of BASE_FX) {
      const x = fx * W;
      g.fillStyle = '#220a30';
      g.beginPath(); g.moveTo(x - 34, GROUND); g.lineTo(x - 18, GROUND - 16); g.lineTo(x + 18, GROUND - 16); g.lineTo(x + 34, GROUND); g.fill();
      g.strokeStyle = 'rgba(255,59,92,0.55)'; g.lineWidth = 1.5; g.stroke();
    }
    g.save();
    g.shadowColor = ACC; g.shadowBlur = 10;
    g.strokeStyle = ACC; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, GROUND); g.lineTo(W, GROUND); g.stroke();
    g.restore();
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.14)';
    const step = Math.max(2, Math.round(canvas.height / 280));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.3, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  function spriteCanvas(lw, lh) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(lw * k)); c.height = Math.max(1, Math.ceil(lh * k));
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    return [c, g];
  }

  // Silhueta de prédios com janelinhas acesas, já com o brilho neon (desenhada uma vez por tamanho de tela).
  function renderCity(city) {
    const [c, g] = spriteCanvas(CITY_W + SPAD * 2, CITY_H + SPAD * 2);
    const r = seeded(city.seed);
    const base = SPAD + CITY_H;
    for (const b of city.shape) {
      const x = SPAD + b.x, y = base - b.h;
      g.fillStyle = '#0d0620';
      g.fillRect(x, y, b.w, b.h);
      g.save();
      g.shadowColor = city.color; g.shadowBlur = 6;
      g.strokeStyle = city.color; g.lineWidth = 1.2;
      g.strokeRect(x + 0.6, y + 0.6, b.w - 1.2, b.h - 0.6);
      if (b.ant) { g.beginPath(); g.moveTo(x + b.w / 2, y); g.lineTo(x + b.w / 2, y - 7); g.stroke(); }
      g.restore();
      for (let wy = y + 3; wy < base - 3; wy += 4) {
        for (let wx = x + 2; wx < x + b.w - 2.5; wx += 3) {
          if (r() < 0.45) { g.fillStyle = r() < 0.7 ? '#ffe9a0' : rgba(city.color, 0.9); g.fillRect(wx, wy, 1.4, 1.8); }
        }
      }
    }
    return c;
  }

  function renderRuin() {
    const [c, g] = spriteCanvas(CITY_W + SPAD * 2, CITY_H + SPAD * 2);
    const base = SPAD + CITY_H, r = seeded(99);
    g.fillStyle = '#250913';
    g.beginPath(); g.moveTo(SPAD, base);
    for (let x = 0; x <= CITY_W; x += 4) g.lineTo(SPAD + x, base - 2 - r() * 9);
    g.lineTo(SPAD + CITY_W, base); g.fill();
    g.strokeStyle = 'rgba(255,59,92,0.55)'; g.lineWidth = 1; g.stroke();
    for (let i = 0; i < 9; i++) { g.fillStyle = r() < 0.5 ? '#ff8a3d' : '#ff3b5c'; g.fillRect(SPAD + r() * CITY_W, base - 1 - r() * 6, 1.6, 1.6); }
    return c;
  }

  // Bolinhas de brilho prontas (no lugar de shadowBlur em dezenas de objetos por quadro).
  const glowCache = new Map();
  function glow(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.16, color); gr.addColorStop(0.45, rgba(color, 0.32)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }
  const discCache = new Map();
  function disc(color) {
    let c = discCache.get(color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, rgba(color, 0.85)); gr.addColorStop(0.8, rgba(color, 0.55)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    discCache.set(color, c);
    return c;
  }

  /* ---------- cidades, bases e ondas ---------- */
  function makeCities() {
    cities = CITY_FX.map((fx, i) => {
      const r = seeded(1234 + i * 977);
      const shape = [];
      let x = 0;
      while (x < CITY_W - 4) {
        const w = Math.min(CITY_W - x, 5 + Math.floor(r() * 6));
        const mid = 1 - Math.abs((x + w / 2) / CITY_W - 0.5) * 1.4;
        shape.push({ x, w, h: Math.round(9 + r() * 12 + mid * 16) });
        x += w + (r() < 0.3 ? 1 : 0);
      }
      shape.reduce((a, b) => (b.h > a.h ? b : a)).ant = true;
      return { x: fx * W, alive: true, color: CITY_COLORS[i], seed: 4321 + i * 131, shape, flash: 0, img: null };
    });
    bases = BASE_FX.map(fx => ({ x: fx * W, alive: true, ammo: AMMO, ang: -Math.PI / 2 }));
  }

  function newGame() {
    score = 0; wave = 1; spare = 0; nextBonus = 10000; kills = 0; maxChain = 1; shots = 0;
    for (const c of cities) c.alive = true;
    threats = []; interceptors = []; explosions = []; bombers = []; particles = []; popups = [];
    aim.x = W / 2; aim.y = GROUND * 0.5;
    startWave();
  }

  function startWave() {
    for (const b of bases) { b.alive = true; b.ammo = AMMO; }
    for (const c of cities) {
      if (!c.alive && spare > 0) {
        spare--; c.alive = true; c.flash = 1;
        popups.push({ x: c.x, y: GROUND - 56, text: 'RECONSTRUÍDA!', color: '#39ff14', life: 2, size: 12 });
      }
    }
    buildQueue();
    phase = 'intro'; phaseT = 0; waveT = 0; endT = 0; bonus = null;
    tone(440, 0.3, 'sawtooth', 0.05, 880); tone(880, 0.3, 'sawtooth', 0.05, 440, 0.3); tone(440, 0.3, 'sawtooth', 0.05, 880, 0.6);
    updateHud();
  }

  // Monta a onda: rajadas de ameaças com intervalos cada vez menores, mais bombardeiros nas ondas altas.
  function buildQueue() {
    const n = wave;
    const total = Math.min(40, 8 + 3 * (n - 1));
    const gap = Math.max(1, 3 - 0.18 * (n - 1)) / (settings.speed === 'rapida' ? 1.25 : 1);
    const salvoMax = Math.min(5, 2 + Math.floor(n / 3));
    queue = [];
    let t = 0.3, left = total;
    while (left > 0) {
      const s = Math.min(left, 1 + Math.floor(Math.random() * salvoMax));
      for (let i = 0; i < s; i++) queue.push({ at: t + rand(0, 0.35), type: pickType(n) });
      left -= s;
      t += gap * rand(0.75, 1.25);
    }
    const nb = n >= 5 ? Math.min(3, 1 + Math.floor((n - 5) / 3)) : 0;
    for (let i = 0; i < nb; i++) queue.push({ at: t * rand(0.2, 0.8), type: 'bombardeiro' });
    queue.sort((a, b) => a.at - b.at);
  }

  function pickType(n) {
    const pTri = n >= 3 ? Math.min(0.3, 0.12 + 0.03 * (n - 3)) : 0;
    const pCom = n >= 7 ? Math.min(0.2, 0.08 + 0.02 * (n - 7)) : 0;
    const r = Math.random();
    if (r < pCom) return 'cometa';
    if (r < pCom + pTri) return 'tridente';
    return 'meteoro';
  }

  // Tempo (s) que uma ameaça leva para cair a altura toda do céu.
  const fallTime = () => Math.max(5, 13 - 0.85 * (wave - 1));
  const threatSpeed = () => (H / fallTime()) * fastF();

  function pickTarget() {
    const live = [...cities.filter(c => c.alive), ...bases.filter(b => b.alive)];
    const all = [...cities, ...bases];
    const o = live.length && Math.random() > 0.25 ? Arcade.pick(live) : Arcade.pick(all);
    return { x: o.x + rand(-4, 4), y: GROUND - (bases.includes(o) ? 18 : 6) };
  }

  function spawnThreat(type, sx, sy, target, speed) {
    const tg = target || pickTarget();
    const t = {
      id: nextId++, type, sx, sy, tx: tg.x, ty: tg.y, p: 0, x: sx, y: sy,
      v: (speed || threatSpeed() * rand(0.9, 1.12)) * TYPES[type].spd,
      r: TYPES[type].r, color: TYPES[type].color, dead: false, lastHit: 0,
      splitAt: type === 'tridente' ? rand(0.35, 0.5) : 2, shell: type === 'cometa' ? 1 : 0, marked: false,
    };
    t.len = Math.hypot(t.tx - t.sx, t.ty - t.sy) || 1;
    threats.push(t);
    return t;
  }
  function placeThreat(t) {
    t.x = t.sx + (t.tx - t.sx) * t.p;
    t.y = t.sy + (t.ty - t.sy) * t.p;
  }

  function spawn(type) {
    if (type === 'bombardeiro') {
      const dir = Math.random() < 0.5 ? 1 : -1;
      bombers.push({
        id: nextId++, x: dir > 0 ? -30 : W + 30, y: GROUND * rand(0.2, 0.38), dir,
        v: (W / Math.max(6, 11 - 0.4 * (wave - 5))) * fastF(), drop: rand(0.8, 1.4), bombs: 4, dead: false, lastHit: 0, marked: false,
      });
      tone(180, 0.5, 'sawtooth', 0.05, 120);
      return;
    }
    spawnThreat(type, rand(0.03, 0.97) * W, -8);
  }

  function addScore(n) {
    if (state === 'menu') return;
    score += n;
    while (score >= nextBonus) {
      spare++; nextBonus += 10000;
      popups.push({ x: W / 2, y: GROUND * 0.62, text: 'CIDADE BÔNUS!', color: '#39ff14', life: 2.2, size: 22 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'square', 0.07, null, i * 0.08));
    }
    updateHud();
  }

  /* ---------- tiros e explosões ---------- */
  function nearestBase(x) {
    const inf = cheat('MUNICAO');
    let best = -1, bd = Infinity;
    bases.forEach((b, i) => {
      if (!b.alive || (b.ammo <= 0 && !inf)) return;
      const d = Math.abs(b.x - x);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // Dispara da base bi (-1 = a mais próxima do alvo com munição) até o ponto (tx, ty).
  function fire(bi, tx, ty) {
    if (state !== 'game' && state !== 'menu') return;
    if (phase === 'bonus') { if (bonus) bonus.fast = true; return; }
    if (phase !== 'play') return;
    tx = clamp(tx, 6, W - 6); ty = clamp(ty, 12, GROUND - 44);
    const inf = cheat('MUNICAO');
    if (bi < 0) bi = nearestBase(tx);
    const b = bases[bi];
    if (!b || !b.alive || (b.ammo <= 0 && !inf)) {
      const msg = !b ? 'SEM MUNIÇÃO!' : !b.alive ? 'BASE DESTRUÍDA!' : 'BASE VAZIA!';
      popups.push({ x: b ? b.x : tx, y: (b ? GROUND - 40 : ty - 20), text: msg, color: ACC, life: 0.9, size: 11 });
      tone(120, 0.08, 'square', 0.06);
      return;
    }
    if (!inf) b.ammo--;
    shots++;
    const sx = b.x, sy = launchY();
    interceptors.push({ base: bi, sx, sy, tx, ty, p: 0, len: Math.hypot(tx - sx, ty - sy) || 1, v: vInterceptor(bi) });
    b.ang = Math.atan2(ty - sy, tx - sx);
    tone(bi === 1 ? 420 : 320, 0.16, 'sawtooth', 0.05, bi === 1 ? 1600 : 1200);
    noise(0.12, 0.06, 3000, 0, 'highpass', 900);
  }

  function explode(x, y, level, max) {
    explosions.push({ id: nextId++, x, y, t: 0, level, max, ground: false, color: CHAIN_COLORS[Math.min(level, CHAIN_COLORS.length - 1)] });
    if (time - lastBoom > 0.05) {
      lastBoom = time;
      noise(0.45, 0.2 + Math.min(level, 4) * 0.03, 1400 + level * 400, 0, 'lowpass', 80);
    }
  }

  function groundBlast(x, y) {
    explosions.push({ id: nextId++, x, y, t: 0, level: 0, max: 30, ground: true, color: '#ff5a2e' });
    noise(0.6, 0.32, 900); tone(90, 0.4, 'sawtooth', 0.09, 40);
    shakeT = Math.max(shakeT, 0.25);
    burst(x, y, '#ff8a3d', 14, 180, 3, 260);
  }

  function expR(e) {
    if (e.t < GROW) return e.max * Math.sin((e.t / GROW) * Math.PI / 2);
    if (e.t < GROW + HOLD) return e.max;
    return e.max * Math.max(0, 1 - (e.t - GROW - HOLD) / SHRINK);
  }

  function burst(x, y, color, n, power = 200, size = 3, grav = 0) {
    for (let i = 0; i < n && particles.length < 350; i++) {
      const a = Math.random() * TAU, s = rand(power * 0.2, power), life = rand(0.3, 0.8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: rand(size * 0.6, size * 1.4), g: grav });
    }
  }

  // Algo foi pego por uma explosão: vira explosão também (um elo a mais na cadeia).
  function destroy(obj, level, pts, color) {
    obj.dead = true;
    kills++;
    const chain = Math.min(5, level + 1);
    maxChain = Math.max(maxChain, chain);
    const gain = pts * mult() * chain;
    addScore(gain);
    popups.push({ x: obj.x, y: obj.y - 14, text: chain > 1 ? `+${gain} CADEIA ×${chain}` : `+${gain}`, color: chain > 1 ? '#ffd400' : '#ffffff', life: 0.9, size: chain > 1 ? 13 : 11 });
    explode(obj.x, obj.y, level + 1, bigR() * 0.8);
    burst(obj.x, obj.y, color, 10, 220);
    tone(600 + Math.min(level, 6) * 120, 0.08, 'square', 0.05);
  }

  function hitThreat(t, e) {
    if (t.type === 'cometa' && t.shell > 0) {
      t.shell = 0; t.lastHit = e.id; t.v *= 1.3;
      burst(t.x, t.y, '#7df9ff', 14, 160, 2.5);
      popups.push({ x: t.x, y: t.y - 16, text: 'RACHOU!', color: '#7df9ff', life: 0.8, size: 12 });
      tone(2000, 0.08, 'triangle', 0.08, 900);
      return;
    }
    destroy(t, e.level, TYPES[t.type].pts, t.color);
  }

  function hitGround(t) {
    t.dead = true;
    groundBlast(t.x, t.y);
    for (const c of cities) {
      if (c.alive && Math.abs(c.x - t.x) < CITY_W / 2 + 6) {
        c.alive = false;
        burst(c.x, GROUND - 14, c.color, 30, 260, 3.5, 200);
        shakeT = 0.5; flashT = 0.35; flashColor = '255,59,92';
        tone(200, 0.6, 'triangle', 0.12, 50); noise(0.9, 0.4, 1500);
        popups.push({ x: c.x, y: GROUND - 50, text: 'CIDADE PERDIDA', color: ACC, life: 1.4, size: 11 });
      }
    }
    for (const b of bases) {
      if (b.alive && Math.abs(b.x - t.x) < 26) {
        b.alive = false; b.ammo = 0;
        burst(b.x, GROUND - 18, ACC, 24, 240, 3.5, 200);
        shakeT = 0.45;
        tone(150, 0.5, 'sawtooth', 0.1, 40);
        popups.push({ x: b.x, y: GROUND - 46, text: 'BASE FORA!', color: ACC, life: 1.4, size: 11 });
      }
    }
    if (cities.every(c => !c.alive) && spare === 0 && phase !== 'dying') {
      phase = 'dying'; phaseT = 0;
      flashT = 0.6;
    }
  }

  function split(t) {
    t.dead = true;
    const tg = [{ x: t.tx, y: t.ty }, pickTarget(), pickTarget()];
    for (const g of tg) spawnThreat('meteoro', t.x, t.y, g, t.v * 1.05 / TYPES.tridente.spd).child = true;
    burst(t.x, t.y, '#ff2bd6', 10, 140, 2.5);
    tone(1400, 0.12, 'square', 0.05, 500);
  }

  /* ---------- final da onda: contagem de bônus ---------- */
  function startBonus() {
    phase = 'bonus'; phaseT = 0;
    bonus = { step: cheat('MUNICAO') ? 'city' : 'ammo', t: 0.7, ammoN: 0, cityN: 0, idx: 0, total: 0, m: mult(), fast: false };
    [659, 784, 988].forEach((f, i) => tone(f, 0.12, 'square', 0.07, null, i * 0.09));
  }

  function updateBonus(dt) {
    const B = bonus;
    B.t -= dt * (B.fast ? 5 : 1);
    while (B.t <= 0) {
      if (B.step === 'ammo') {
        const b = bases.find(x => x.ammo > 0);
        if (b) {
          b.ammo--; B.ammoN++; B.total += 5 * B.m; addScore(5 * B.m);
          tone(1200, 0.03, 'square', 0.04);
          B.t += 0.055;
        } else { B.step = 'city'; B.t += 0.5; }
      } else if (B.step === 'city') {
        let c = null;
        while (B.idx < cities.length && !c) { if (cities[B.idx].alive) c = cities[B.idx]; B.idx++; }
        if (c) {
          B.cityN++; B.total += 100 * B.m; addScore(100 * B.m);
          c.flash = 1;
          tone(440 + B.cityN * 90, 0.14, 'square', 0.07);
          B.t += 0.3;
        } else { B.step = 'done'; B.t += 1.6; }
      } else {
        wave++;
        startWave();
        return;
      }
    }
  }

  /* ---------- fluxo ---------- */
  function start() {
    Sfx.ensure();
    state = 'game';
    newGame();
    show(null);
    updateHud();
  }

  function toMenu() {
    state = 'menu';
    newGame();
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (state === 'game') { state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = 'game'; show(null); }
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set(hiKey(), hi); }
    Ranking.gameOver($('rankBox'), { board: 'defesa-total-' + settings.speed, score, cheated });
    $('overTitle').textContent = 'CIDADES EM RUÍNAS';
    $('overScore').textContent = score;
    const eff = shots ? (kills / shots).toFixed(1).replace('.', ',') : '0';
    $('overInfo').textContent = `Velocidade ${settings.speed === 'rapida' ? 'RÁPIDA' : 'NORMAL'} · chegou à onda ${wave} · ${kills} ${kills === 1 ? 'ameaça derrubada' : 'ameaças derrubadas'}` +
      (maxChain > 1 ? ` · maior cadeia ×${maxChain}` : '') + (shots ? ` · ${eff} abate por tiro` : '');
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.wave.textContent = demo ? 1 : wave;
    hud.mult.textContent = '×' + (demo ? 1 : mult());
    const st = [];
    if (settings.speed === 'rapida') st.push('RÁPIDA');
    if (codes.has('KONAMI')) st.push('EXPLOSÕES GIGANTES');
    if (codes.has('MUNICAO')) st.push('MUNIÇÃO INFINITA');
    if (codes.has('LENTO')) st.push('CÂMERA LENTA');
    hud.status.textContent = st.join(' · ');
  }

  /* ---------- entrada ---------- */
  const keys = {};
  const FIRE_KEYS = { z: 0, 1: 0, x: 1, 2: 1, c: 2, 3: 2, ' ': -1, enter: -1 };

  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    const onButton = e.target.closest && e.target.closest('button');
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !onButton && !e.repeat && (state === 'menu' || overT > 0.8)) start();
      return;
    }
    if (state !== 'game') return;
    keys[key] = true;
    if (key.startsWith('arrow') || 'wasd'.includes(key)) aim.mode = 'keys';
    if (key in FIRE_KEYS && !e.repeat) { if (aim.mode === 'touch') aim.mode = 'keys'; fire(FIRE_KEYS[key], aim.x, aim.y); }
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const kk in keys) keys[kk] = false; });

  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  // Toque ou clique no céu: dispara exatamente ali da base mais próxima com munição.
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    if (state !== 'game') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toWorld(e);
    aim.x = clamp(p.x, 6, W - 6); aim.y = clamp(p.y, 12, GROUND - 44);
    aim.mode = e.pointerType === 'mouse' ? 'mouse' : 'touch'; aim.t = time;
    fire(-1, p.x, p.y);
  });
  screen.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const p = toWorld(e);
    aim.x = clamp(p.x, 6, W - 6); aim.y = clamp(p.y, 12, GROUND - 44);
    aim.mode = 'mouse';
  });
  screen.addEventListener('contextmenu', e => e.preventDefault());

  const prev = { a: false, b: false, x: false, rb: false, rt: false, start: false };
  let padX = 0, padY = 0;
  function pollPad() {
    const g = Arcade.gamepad(0);
    padX = 0; padY = 0;
    if (!g) return;
    padX = g.lx || g.rx; padY = g.ly || g.ry;
    if (padX || padY) aim.mode = 'keys';
    const edge = n => g[n] && !prev[n];
    if (edge('a') && (state === 'menu' || (state === 'over' && overT > 0.8))) start();
    else if (state === 'game') {
      if (edge('x')) fire(0, aim.x, aim.y);
      if (edge('a')) fire(1, aim.x, aim.y);
      if (edge('b')) fire(2, aim.x, aim.y);
      if (edge('rb') || edge('rt')) fire(-1, aim.x, aim.y);
    }
    if (edge('start')) togglePause();
    for (const n in prev) prev[n] = g[n];
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'game') togglePause(); });

  /* ---------- piloto automático (demonstração) ---------- */
  let demoT = 1;
  function autopilot(dt) {
    if (phase !== 'play') return;
    demoT -= dt;
    if (demoT > 0) return;
    demoT = rand(0.3, 0.75);
    const cand = [...threats.filter(t => !t.dead && !t.marked && t.y > 40), ...bombers.filter(b => !b.dead && !b.marked && b.x > 40 && b.x < W - 40)];
    cand.sort((a, b) => (b.p || 0.5) - (a.p || 0.5));
    const t = cand[0];
    if (!t) return;
    const bi = nearestBase(t.x);
    if (bi < 0) return;
    const b = bases[bi], vi = vInterceptor(bi);
    let px = t.x, py = t.y;
    for (let i = 0; i < 3; i++) {
      const ft = Math.hypot(px - b.x, py - launchY()) / vi + GROW * 0.6;
      if (t.len) {
        const q = Math.min(1, t.p + (t.v * slowF() * ft) / t.len);
        px = t.sx + (t.tx - t.sx) * q; py = t.sy + (t.ty - t.sy) * q;
      } else { px = t.x + t.dir * t.v * ft; py = t.y; }
    }
    if (py > GROUND - 50) return;
    t.marked = true;
    aim.x = px; aim.y = py;
    fire(bi, px + rand(-6, 6), py + rand(-6, 6));
  }

  /* ---------- atualização ---------- */
  function update(dt) {
    time += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    if (state === 'over') overT += dt;

    // mira por teclado/controle
    if (state === 'game') {
      let dx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
      let dy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
      if (padX || padY) { dx = padX; dy = padY; }
      const v = H * 1.15;
      aim.x = clamp(aim.x + dx * v * dt, 6, W - 6);
      aim.y = clamp(aim.y + dy * v * dt, 12, GROUND - 44);
    }
    if (state === 'menu') autopilot(dt);

    if (state === 'game' || state === 'menu') {
      phaseT += dt;
      if (phase === 'intro' && phaseT > (NEW_THREAT[wave] ? 2.6 : 1.8)) { phase = 'play'; phaseT = 0; }
      else if (phase === 'play') {
        waveT += dt * slowF();
        while (queue.length && queue[0].at <= waveT) spawn(queue.shift().type);
        const busy = queue.length || threats.length || bombers.length || interceptors.length || explosions.some(e => !e.ground);
        endT = busy ? 0 : endT + dt;
        if (endT > 0.6) startBonus();
      } else if (phase === 'bonus') updateBonus(dt);
      else if (phase === 'dying' && phaseT > 3.2) {
        if (state === 'menu') newGame(); else { gameOver(); return; }
      }
    }
    updateWorld(dt);
  }

  function updateWorld(dt) {
    const sf = slowF();
    // ameaças
    for (const t of threats) {
      if (t.dead) continue;
      t.p += (t.v * sf * dt) / t.len;
      if (t.p >= t.splitAt && t.y < GROUND * 0.65) { split(t); continue; }
      if (t.p >= 1) { t.p = 1; placeThreat(t); hitGround(t); continue; }
      placeThreat(t);
      if (t.type === 'cometa' && Math.random() < 0.5 && particles.length < 300) {
        particles.push({ x: t.x, y: t.y, vx: rand(-20, 20), vy: rand(-30, -5), life: 0.4, max: 0.4, color: '#7df9ff', size: 2, g: 0 });
      }
    }
    // bombardeiros
    for (const b of bombers) {
      if (b.dead) continue;
      b.x += b.dir * b.v * sf * dt;
      b.drop -= dt * sf;
      if (b.drop <= 0 && b.bombs > 0 && b.x > W * 0.08 && b.x < W * 0.92) {
        b.bombs--; b.drop = rand(1.3, 2.1);
        spawnThreat('bomba', b.x, b.y + 6, null, threatSpeed() * 1.05);
        tone(700, 0.1, 'triangle', 0.05, 300);
      }
      if ((b.dir > 0 && b.x > W + 40) || (b.dir < 0 && b.x < -40)) b.dead = true;
    }
    if (bombers.length) {
      humT -= dt;
      if (humT <= 0) { humT = 0.42; tone(110, 0.18, 'sawtooth', 0.025, 95); }
    }
    // interceptores
    for (const m of interceptors) {
      m.p += (m.v * dt) / m.len;
      if (m.p >= 1) { m.done = true; explode(m.tx, m.ty, 0, bigR()); }
    }
    interceptors = interceptors.filter(m => !m.done);
    // explosões: tudo que encosta explode também
    for (const e of explosions) {
      e.t += dt;
      if (e.ground) continue;
      const r = expR(e);
      if (r < 2) continue;
      for (const t of threats) {
        if (t.dead || t.lastHit === e.id) continue;
        const dx = t.x - e.x, dy = t.y - e.y, rr = r + t.r;
        if (dx * dx + dy * dy < rr * rr) hitThreat(t, e);
      }
      for (const b of bombers) {
        if (b.dead) continue;
        const dx = b.x - e.x, dy = b.y - e.y, rr = r + BOMBER.r;
        if (dx * dx + dy * dy < rr * rr) destroy(b, e.level, BOMBER.pts, BOMBER.color);
      }
    }
    explosions = explosions.filter(e => e.t < GROW + HOLD + SHRINK);
    threats = threats.filter(t => !t.dead);
    bombers = bombers.filter(b => !b.dead);

    // fumaça das ruínas
    smokeT -= dt;
    if (smokeT <= 0) {
      smokeT = 0.14;
      const ruins = [...cities.filter(c => !c.alive), ...bases.filter(b => !b.alive)];
      if (ruins.length && particles.length < 330) {
        const r = Arcade.pick(ruins);
        particles.push({ x: r.x + rand(-14, 14), y: GROUND - 8, vx: rand(-6, 6), vy: rand(-34, -18), life: 1.6, max: 1.6, color: 'rgba(150,120,170,0.5)', size: rand(4, 7), g: 0 });
      }
    }
    for (const c of cities) c.flash = Math.max(0, c.flash - dt * 1.6);
    for (const p of particles) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 22 * dt; }
    popups = popups.filter(p => p.life > 0);
    if (popups.length > 30) popups.splice(0, popups.length - 30);
  }

  /* ---------- desenho ---------- */
  function drawText(text, x, y, size, color, alpha = 1, glowOn = true) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    if (glowOn) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawThreats() {
    ctx.lineCap = 'round';
    for (const t of threats) {
      const dx = (t.tx - t.sx) / t.len, dy = (t.ty - t.sy) / t.len;
      const big = t.type === 'cometa';
      // rastro inteiro, apagado, e um trecho forte perto da cabeça
      ctx.strokeStyle = rgba(t.color, 0.32);
      ctx.lineWidth = big ? 2.6 : 1.5;
      ctx.beginPath(); ctx.moveTo(t.sx, t.sy); ctx.lineTo(t.x, t.y); ctx.stroke();
      const tl = Math.min(46, t.p * t.len);
      ctx.strokeStyle = rgba(t.color, 0.9);
      ctx.lineWidth = big ? 4 : 2.2;
      ctx.beginPath(); ctx.moveTo(t.x - dx * tl, t.y - dy * tl); ctx.lineTo(t.x, t.y); ctx.stroke();
      const gs = big ? 34 : t.type === 'tridente' ? 24 : 18;
      ctx.drawImage(glow(t.color), t.x - gs / 2, t.y - gs / 2, gs, gs);
      if (t.type === 'tridente') {
        // três pontas: avisa que vai se dividir
        ctx.fillStyle = '#fff';
        for (let i = -1; i <= 1; i++) ctx.fillRect(t.x + i * 4 - 1, t.y - 1 + Math.abs(i) * 2, 2, 2);
      }
      if (big) {
        ctx.strokeStyle = t.shell ? 'rgba(220,255,255,0.95)' : 'rgba(125,249,255,0.45)';
        ctx.lineWidth = t.shell ? 2 : 1;
        ctx.beginPath();
        if (t.shell) ctx.arc(t.x, t.y, 8, 0, TAU);
        else for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + time * 6; ctx.moveTo(t.x + Math.cos(a) * 6, t.y + Math.sin(a) * 6); ctx.lineTo(t.x + Math.cos(a) * 10, t.y + Math.sin(a) * 10); }
        ctx.stroke();
      }
    }
  }

  function drawBomber(b) {
    ctx.save();
    ctx.translate(b.x, b.y); ctx.scale(b.dir, 1);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(glow(BOMBER.color), -30, -30, 60, 60);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#082a12'; ctx.strokeStyle = BOMBER.color; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(6, -6); ctx.lineTo(-18, -6); ctx.lineTo(-24, -12); ctx.lineTo(-24, 6); ctx.lineTo(6, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(-12, 13); ctx.lineTo(-6, 4); ctx.stroke();
    ctx.fillStyle = '#c8ffd0'; ctx.fillRect(4, -3.5, 7, 3);
    if (Math.floor(time * 4) % 2) { ctx.fillStyle = ACC; ctx.fillRect(-23, -11, 3, 3); }
    ctx.restore();
  }

  function drawInterceptors() {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(230,240,255,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const m of interceptors) {
      const x = m.sx + (m.tx - m.sx) * m.p, y = m.sy + (m.ty - m.sy) * m.p;
      ctx.moveTo(m.sx, m.sy); ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const blink = Math.floor(time * 10) % 2;
    ctx.strokeStyle = blink ? '#ffffff' : ACC; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const m of interceptors) {
      ctx.moveTo(m.tx - 4, m.ty - 4); ctx.lineTo(m.tx + 4, m.ty + 4);
      ctx.moveTo(m.tx + 4, m.ty - 4); ctx.lineTo(m.tx - 4, m.ty + 4);
    }
    ctx.stroke();
    for (const m of interceptors) {
      const x = m.sx + (m.tx - m.sx) * m.p, y = m.sy + (m.ty - m.sy) * m.p;
      ctx.drawImage(glow('#ffffff'), x - 8, y - 8, 16, 16);
    }
    ctx.restore();
  }

  function drawExplosions() {
    for (const e of explosions) {
      const r = expR(e);
      if (r < 1) continue;
      const fl = 0.85 + 0.15 * Math.sin(time * 40 + e.id);
      ctx.globalAlpha = (e.ground ? 0.8 : 0.9) * fl;
      ctx.drawImage(disc(e.color), e.x - r, e.y - r, r * 2, r * 2);
      ctx.globalAlpha = Math.min(1, r / 10) * 0.8;
      ctx.strokeStyle = e.ground ? '#ffb27a' : '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCities() {
    for (const c of cities) {
      const x = c.x - CITY_W / 2 - SPAD, y = GROUND - CITY_H - SPAD;
      if (c.flash > 0) {
        ctx.globalAlpha = c.flash * 0.8;
        ctx.drawImage(glow(c.color), c.x - 50, GROUND - 60, 100, 100);
        ctx.globalAlpha = 1;
      }
      const img = c.alive ? c.img : ruinImg;
      if (img) ctx.drawImage(img, x, y, CITY_W + SPAD * 2, CITY_H + SPAD * 2);
    }
  }

  function drawBases() {
    const inf = cheat('MUNICAO');
    bases.forEach((b, i) => {
      const y = GROUND - 16;
      if (!b.alive) {
        ctx.fillStyle = '#1a0610'; ctx.strokeStyle = 'rgba(255,59,92,0.6)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(b.x - 12, y); ctx.lineTo(b.x - 7, y - 5); ctx.lineTo(b.x - 2, y - 2); ctx.lineTo(b.x + 4, y - 7); ctx.lineTo(b.x + 12, y); ctx.closePath();
        ctx.fill(); ctx.stroke();
        drawText('FORA', b.x, GROUND + 18, 10, ACC, 0.8, false);
        return;
      }
      // cano aponta para a mira
      const ang = state === 'menu' ? b.ang : Math.atan2(aim.y - (y - 4), aim.x - b.x);
      const a = clamp(ang, -Math.PI + 0.15, -0.15);
      ctx.save();
      ctx.translate(b.x, y - 4); ctx.rotate(a);
      ctx.fillStyle = '#ffd0da'; ctx.fillRect(0, -2.2, 15, 4.4);
      ctx.restore();
      ctx.fillStyle = '#2a0c22'; ctx.strokeStyle = ACC; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(b.x, y, 11, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ACC; ctx.fillRect(b.x - 2, y - 7, 4, 4);
      // munição: duas fileiras de 5
      if (inf) drawText('∞', b.x, GROUND + 19, 16, '#ffd400', 0.9, false);
      else {
        const low = b.ammo <= 3 && b.ammo > 0 && phase === 'play';
        ctx.fillStyle = low && Math.floor(time * 5) % 2 ? ACC : '#ffe3ea';
        for (let j = 0; j < b.ammo; j++) {
          const col = j % 5, row = Math.floor(j / 5);
          ctx.fillRect(b.x - 13 + col * 6, GROUND + 9 + row * 10, 3, 7);
        }
        if (b.ammo === 0 && phase === 'play') drawText('VAZIA', b.x, GROUND + 18, 10, ACC, 0.8, false);
      }
      if (!coarse && state === 'game') drawText('ZXC'[i], b.x, GROUND + 40, 9, 'rgba(255,255,255,0.45)', 1, false);
    });
  }

  function drawAim() {
    if (state !== 'game' && state !== 'menu') return;
    if (aim.mode === 'touch' && time - aim.t > 0.5) return;
    const x = aim.x, y = aim.y, r = 11;
    ctx.save();
    ctx.globalAlpha = state === 'menu' ? 0.5 : aim.mode === 'touch' ? 1 - (time - aim.t) * 2 : 1;
    ctx.strokeStyle = ACC; ctx.lineWidth = 2;
    ctx.shadowColor = ACC; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.moveTo(x - r - 6, y); ctx.lineTo(x - r + 4, y);
    ctx.moveTo(x + r - 4, y); ctx.lineTo(x + r + 6, y);
    ctx.moveTo(x, y - r - 6); ctx.lineTo(x, y - r + 4);
    ctx.moveTo(x, y + r - 4); ctx.lineTo(x, y + r + 6);
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.restore();
  }

  function drawBanners() {
    const cx = W / 2;
    if (phase === 'intro') {
      const a = Math.min(1, phaseT * 4) * Math.min(1, ((NEW_THREAT[wave] ? 2.6 : 1.8) - phaseT) * 3);
      const y = GROUND * 0.36;
      drawText(`ONDA ${wave}`, cx, y, 46, '#ffffff', a);
      drawText(`PONTOS ×${mult()}`, cx, y + 44, 18, '#ffd400', a);
      const nt = NEW_THREAT[wave];
      if (nt) {
        drawText(nt[0], cx, y + 84, 17, ACC, a);
        drawText(nt[1], cx, y + 108, 12, '#f1e9ff', a, false);
      } else if (wave === 1 && state === 'game') {
        drawText(coarse ? 'TOQUE NO CÉU PARA DISPARAR' : 'MIRE E CLIQUE PARA DISPARAR', cx, y + 84, 14, '#f1e9ff', a, false);
      }
    } else if (phase === 'bonus' && bonus) {
      const y = GROUND * 0.34, m = bonus.m;
      drawText(`ONDA ${wave} CONCLUÍDA!`, cx, y, 28, '#ffffff');
      drawText(cheat('MUNICAO') ? 'MUNIÇÃO INFINITA: SEM BÔNUS' : `MUNIÇÃO  ${bonus.ammoN} × ${5 * m}`, cx, y + 46, 16, '#ffe3ea', 1, false);
      if (bonus.step !== 'ammo') drawText(`CIDADES  ${bonus.cityN} × ${100 * m}`, cx, y + 74, 16, '#4dd2ff', 1, false);
      if (bonus.step === 'done') drawText(`BÔNUS +${bonus.total}`, cx, y + 114, 26, '#ffd400');
    } else if (phase === 'dying') {
      drawText('CIDADES EM RUÍNAS', cx, GROUND * 0.4, Math.min(34, W / 18), ACC, Math.min(1, phaseT * 2));
    }
    if (spare > 0 && state !== 'menu') drawText(`RESERVA ${'★'.repeat(Math.min(spare, 5))}`, 70, H - 12, 10, '#39ff14', 0.9, false);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? rand(-1, 1) * shakeT * 14 : 0, sy = shakeT > 0 ? rand(-1, 1) * shakeT * 14 : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    drawCities();
    drawBases();
    drawThreats();
    for (const b of bombers) drawBomber(b);
    drawInterceptors();
    drawExplosions();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(p.text, p.x, p.y, p.size || 12, p.color, Math.min(1, p.life * 2.5), false);
    drawAim();
    drawBanners();
    if (flashT > 0) { ctx.fillStyle = `rgba(${flashColor},${flashT * 0.5})`; ctx.fillRect(-20, -20, W + 40, H + 40); }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scan, 0, 0);
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
  makeCities();
  loadHi();
  resize();
  layout();
  newGame();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
