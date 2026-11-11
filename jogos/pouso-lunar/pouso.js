// Pouso Lunar: módulo de pouso com gravidade, inércia e vento. Cinco astros com relevo gerado,
// plataformas ×2 / ×3 / ×5 e um tanque de combustível que faz o papel das vidas.
// Mundo em "metros" com y para cima; a câmera segue o módulo e dá zoom perto do chão.
(() => {
  const S0 = 420;                                    // lado menor da tela lógica
  let W = S0, H = 640;                               // o lado maior acompanha o formato da tela
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const SEG = 10;                                    // distância entre os pontos do relevo
  const ROT = 1.75;                                  // velocidade de giro (rad/s)
  const BURN = 12;                                   // combustível por segundo de motor ligado
  const FOOT_X = 10, FOOT_Y = -9;                    // pés do módulo (em relação ao centro)
  const HULL = [[0, 10], [-7.5, 3], [7.5, 3], [-7, -5], [7, -5]];   // casco: se encostar, explode
  const PAD_W = { 2: 100, 3: 66, 5: 40 };
  const PAD_COLOR = { 2: '#39ff14', 3: '#ffd400', 5: '#ff2bd6' };
  const PERF = 0.35;                                 // fração da tolerância que conta como pouso perfeito
  const ACC = '#9ad0ff';
  const GREEN = '#39ff14', YELLOW = '#ffd400', RED = '#ff3b5c';

  // Tanque inicial, tolerâncias de pouso (m/s, m/s, graus) e combustível perdido ao bater.
  const DIFF = {
    treino: { name: 'TREINO', fuel: 1500, vy: 16, vx: 10, ang: 14, pen: 100 },
    missao: { name: 'MISSÃO', fuel: 1000, vy: 11, vx: 7, ang: 9, pen: 150 },
    heroico: { name: 'HEROICO', fuel: 750, vy: 7.5, vx: 5, ang: 6, pen: 200 },
  };

  // Os cinco astros da rota. g = gravidade, wind/gust = vento fixo e rajadas, drag = ar grosso.
  const ASTROS = [
    { id: 'lua', name: 'LUA', sub: 'Sem vento, gravidade camarada. Ótima para treinar.',
      g: 9, wind: 0, gust: 0, drag: 0, tw: 2400, base: 160, amp: 70, rough: 1, craters: 8, canyons: 0, volcanoes: 0, spikes: 0,
      pads: [2, 2, 3, 5], sky: ['#000003', '#071028'], line: '#bfe3ff', fill: '#0a1628', deco: 'terra' },
    { id: 'marte', name: 'MARTE', sub: 'Rajadas de vento e cânions bem fundos.',
      g: 13, wind: 1.2, gust: 3.2, drag: 0.02, tw: 2600, base: 200, amp: 85, rough: 0.95, craters: 3, canyons: 2, volcanoes: 0, spikes: 0,
      pads: [2, 3, 3, 5], sky: ['#140302', '#45160a'], line: '#ff6a3d', fill: '#250b05', deco: 'fobos' },
    { id: 'io', name: 'IO', sub: 'Vulcões de enxofre cuspindo fogo. Júpiter vigia.',
      g: 11, wind: 0, gust: 0, drag: 0, tw: 2400, base: 150, amp: 75, rough: 1, craters: 2, canyons: 0, volcanoes: 4, spikes: 0,
      pads: [2, 3, 5, 2], sky: ['#060600', '#221d04'], line: '#ffe14d', fill: '#181300', deco: 'jupiter' },
    { id: 'tita', name: 'TITÃ', sub: 'Ar grosso que freia e vento que empurra de lado.',
      g: 6.5, wind: 1.6, gust: 1, drag: 0.16, tw: 2600, base: 150, amp: 55, rough: 1.1, craters: 2, canyons: 1, volcanoes: 0, spikes: 0,
      pads: [2, 3, 5, 3], sky: ['#1c0e03', '#5a330c'], line: '#ffb347', fill: '#241605', deco: 'saturno' },
    { id: 'neonia', name: 'NEÔNIA', sub: 'Asteroide de cristal: quase sem peso e cheio de espinhos.',
      g: 3.5, wind: 0, gust: 0, drag: 0, tw: 1800, base: 230, amp: 110, rough: 0.7, craters: 3, canyons: 0, volcanoes: 0, spikes: 14,
      pads: [3, 5, 2, 5], sky: ['#0b0016', '#27003f'], line: '#ff4fe0', fill: '#16002a', deco: 'nebulosa' },
  ];

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay'), stage = $('stage');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), fuel: $('hFuel'), astro: $('hAstro'), status: $('hStatus') };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mod = (a, n) => ((a % n) + n) % n;

  /* ---------- configurações e códigos ---------- */
  const settings = { diff: 'missao' };
  Arcade.bindSettings(panels.menu, settings, 'pouso-lunar_', () => syncDiff());
  const codes = Arcade.codes('pouso-lunar', {
    KONAMI: 'Combustível infinito',
    PENA: 'Gravidade pela metade',
    RADAR: 'Mostra a trajetória prevista',
  }, $('codeMount'));

  const hiKey = () => 'pouso-lunar_hi_' + settings.diff;
  let hi = 0;
  function syncDiff() {
    hi = +Arcade.store.get(hiKey(), 0) || 0;
    const d = DIFF[settings.diff];
    $('diffInfo').textContent = `Tanque de ${d.fuel} · pouso seguro até ${d.vy} m/s na descida, ${d.vx} m/s de lado e ${d.ang}° de inclinação · batida custa ${d.pen}.`;
    updateHud();
  }

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');
  const scan = document.createElement('canvas');
  let streaks = [];

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    if (w >= h) { H = S0; W = Math.round(clamp((S0 * w) / Math.max(1, h), S0, S0 * 2.2)); }
    else { W = S0; H = Math.round(clamp((S0 * h) / Math.max(1, w), S0, S0 * 2)); }
    k = Arcade.fit(canvas, W, H, wrap);
    streaks = [];
    for (let i = 0; i < 26; i++) streaks.push({ x: Math.random() * W, y: Math.random() * H, s: Arcade.rand(0.5, 1.4) });
    if (A) buildBackground();
    buildScan();
  }

  // Números pseudoaleatórios com semente (o céu não muda a cada resize).
  function seeded(s) {
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, A.sky[0]); sky.addColorStop(1, A.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const rnd = seeded(A.seed);
    const stars = A.id === 'tita' ? 25 : A.id === 'marte' ? 70 : 170;
    for (let i = 0; i < stars; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.7})`;
      const s = rnd() < 0.1 ? 2 : 1;
      g.fillRect(rnd() * W, rnd() * H * 0.95, s, s);
    }
    const glow = (x, y, r, c) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const px = W * 0.78, py = Math.min(H * 0.2, 120);
    g.save();
    if (A.deco === 'terra') {
      // a Terra no céu da Lua, meio iluminada
      glow(px, py, 60, 'rgba(77,160,255,0.25)');
      g.fillStyle = '#1d5fd1'; g.beginPath(); g.arc(px, py, 24, 0, TAU); g.fill();
      g.save(); g.clip();
      g.fillStyle = '#39c46a';
      g.beginPath(); g.ellipse(px - 6, py - 5, 9, 6, 0.5, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(px + 8, py + 8, 6, 4, -0.3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(px - 24, py - 22, 48, 4);
      g.fillStyle = 'rgba(0,0,10,0.6)'; g.beginPath(); g.arc(px + 12, py + 4, 26, 0, TAU); g.fill();
      g.restore();
    } else if (A.deco === 'fobos') {
      glow(W * 0.5, H * 0.95, H * 0.7, 'rgba(255,106,61,0.12)');
      g.fillStyle = '#9c6b55'; g.beginPath(); g.ellipse(px, py, 11, 8, 0.4, 0, TAU); g.fill();
      g.fillStyle = 'rgba(40,10,0,0.5)'; g.beginPath(); g.arc(px + 3, py - 1, 3, 0, TAU); g.fill();
      g.fillStyle = '#7b5444'; g.beginPath(); g.arc(W * 0.24, py * 0.6, 4, 0, TAU); g.fill();
    } else if (A.deco === 'jupiter') {
      glow(px, py, 120, 'rgba(255,200,120,0.18)');
      g.beginPath(); g.arc(px, py, 64, 0, TAU); g.save(); g.clip();
      const bands = ['#c98a4b', '#e8c48f', '#a8643a', '#f0d6a8', '#b8743f', '#e2b47a', '#9c5a33'];
      for (let i = 0; i < 14; i++) { g.fillStyle = bands[i % bands.length]; g.fillRect(px - 64, py - 64 + i * 9.2, 128, 10); }
      g.fillStyle = '#c0442a'; g.beginPath(); g.ellipse(px - 18, py + 16, 11, 6, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(px - 30, py + 12, 70, 0, TAU); g.fill();
      g.restore();
    } else if (A.deco === 'saturno') {
      g.globalAlpha = 0.5;
      g.fillStyle = '#e7c98a'; g.beginPath(); g.arc(px, py, 30, 0, TAU); g.fill();
      g.strokeStyle = '#f3dfae'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(px, py, 56, 12, -0.25, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      // névoa laranja de Titã
      const haze = g.createLinearGradient(0, H * 0.3, 0, H);
      haze.addColorStop(0, 'rgba(255,170,60,0)'); haze.addColorStop(1, 'rgba(255,150,40,0.22)');
      g.fillStyle = haze; g.fillRect(0, 0, W, H);
    } else if (A.deco === 'nebulosa') {
      glow(W * 0.25, H * 0.25, 220, 'rgba(255,43,214,0.16)');
      glow(W * 0.8, H * 0.45, 200, 'rgba(0,229,255,0.11)');
      g.strokeStyle = 'rgba(255,79,224,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px, py - 22); g.lineTo(px + 14, py); g.lineTo(px, py + 22); g.lineTo(px - 14, py); g.closePath(); g.stroke();
    }
    g.restore();
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.14)';
    const step = Math.max(2, Math.round(canvas.height / 300));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.35, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  /* ---------- relevo ---------- */
  // Soma de senoides com frequências inteiras (assim o mundo dá a volta sem emenda),
  // mais crateras, cânions, vulcões e espinhos, e as plataformas achatadas por cima.
  function genTerrain(a, c) {
    const n = Math.round(a.tw / SEG), tw = n * SEG, h = new Float32Array(n);
    const amp = a.amp * (1 + 0.12 * c);
    const waves = [1, 2, 3, 5, 8, 13, 21, 34].map(f => ({ f, A: amp * Math.pow(f, -a.rough) * Arcade.rand(0.5, 1.1), p: Math.random() * TAU }));
    for (let i = 0; i < n; i++) {
      let y = a.base;
      for (const w of waves) y += w.A * Math.sin((TAU * w.f * i) / n + w.p);
      h[i] = y;
    }
    const shape = (center, r, fn) => {
      const m = Math.ceil((r * 1.6) / SEG);
      for (let j = -m; j <= m; j++) h[mod(center + j, n)] += fn(Math.abs(j * SEG) / r);
    };
    const any = () => (Math.random() * n) | 0;
    for (let i = 0; i < a.craters; i++) {
      const r = Arcade.rand(35, 100), dep = r * Arcade.rand(0.3, 0.45);
      shape(any(), r, d => (d < 1 ? -dep * (1 - d * d) : d < 1.5 ? dep * 0.4 * Math.sin((d - 1) * 2 * Math.PI) : 0));
    }
    for (let i = 0; i < a.canyons; i++) {
      const r = Arcade.rand(110, 160), dep = Arcade.rand(90, 130);
      shape(any(), r, d => (d < 0.55 ? -dep : d < 1 ? -dep * (1 - (d - 0.55) / 0.45) : 0));
    }
    const vents = [];
    for (let i = 0; i < a.volcanoes; i++) {
      const r = Arcade.rand(80, 120), ht = Arcade.rand(110, 160), at = Math.floor((i + Arcade.rand(0.2, 0.8)) * (n / a.volcanoes));
      shape(at, r, d => (d < 1 ? ht * Math.pow(1 - d, 1.3) - (d < 0.12 ? ht * 0.25 * (1 - d / 0.12) : 0) : 0));
      vents.push(at);
    }
    if (a.spikes) for (let i = 0; i < n; i++) h[i] += Arcade.rand(-1, 1) * a.spikes * (Math.random() < 0.25 ? 2 : 0.5);

    // plataformas: uma por fatia do mundo; a ×5 vai para o ponto mais baixo e ganha paredões
    const mults = a.pads.slice().sort(() => Math.random() - 0.5);
    const slot = n / mults.length, pads = [];
    const shrink = Math.max(0.75, 1 - 0.08 * c);
    mults.forEach((m, s) => {
      const segs = Math.max(3, Math.ceil((PAD_W[m] * shrink) / SEG));
      const lo = Math.floor(s * slot) + 14, hiI = Math.floor((s + 1) * slot) - segs - 14;
      let i0 = lo + Math.floor(Math.random() * Math.max(1, hiI - lo));
      if (m === 5) {
        let best = 1e9;
        for (let i = lo; i <= hiI; i++) {
          let sum = 0;
          for (let j = 0; j <= segs; j++) sum += h[mod(i + j, n)];
          if (sum < best) { best = sum; i0 = i; }
        }
      }
      let y = 0;
      for (let j = 0; j <= segs; j++) y += h[mod(i0 + j, n)];
      y = Math.max(30, y / (segs + 1));
      for (let j = 0; j <= segs; j++) h[mod(i0 + j, n)] = y;
      if (m === 5) {
        const wh = Arcade.rand(70, 100) * (1 + 0.1 * c);
        for (let j = 1; j <= 12; j++) {
          const top = y + wh * (j <= 6 ? Math.min(1, j / 2) : 1 - (j - 6) / 6);
          for (const i of [i0 - j, i0 + segs + j]) { const q = mod(i, n); h[q] = Math.max(h[q], top); }
        }
      }
      pads.push({ x0: i0 * SEG, x1: (i0 + segs) * SEG, y, m });
    });
    let maxH = 0;
    for (let i = 0; i < n; i++) { h[i] = Math.max(15, h[i]); maxH = Math.max(maxH, h[i]); }
    return { n, tw, h, pads, maxH, vents: vents.map(i => ({ x: i * SEG, y: h[mod(i, n)] })) };
  }

  function ground(x) {
    const u = x / SEG, i = Math.floor(u), f = u - i;
    return T.h[mod(i, T.n)] * (1 - f) + T.h[mod(i + 1, T.n)] * f;
  }
  // Plataforma que tem os dois pés em cima (ou null).
  function padAt(xa, xb) {
    for (const p of T.pads) {
      const w = p.x1 - p.x0;
      if (mod(xa - p.x0, T.tw) <= w && mod(xb - p.x0, T.tw) <= w) return p;
    }
    return null;
  }
  // Cópia de x (o mundo dá a volta) mais perto de ref.
  const near = (x, ref) => x + T.tw * Math.round((ref - x) / T.tw);

  /* ---------- estado ---------- */
  let state = 'menu';                                // menu (demonstração), play, pause, over
  let phase = 'intro', phaseT = 0;                   // voo: intro, fly, landed, crash
  let A = null, T = null, L = null, tol = null;      // astro, relevo, módulo, tolerâncias
  let score = 0, fuel = 0, maxFuel = 0, astroIdx = 0, cycle = 1, attempt = 1;
  let landings = 0, perfects = 0, crashes = 0, visited = 1;
  let result = null, windNow = 0, hintT = 0;
  let particles = [];
  let time = 0, shakeT = 0, flashT = 0, overT = 0;
  const cam = { x: 0, y: 0, z: 1 };
  const snd = { thr: 0, rcs: 0, low: 0, warn: 0 };

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };
  const infinite = () => state === 'menu' || codes.has('KONAMI');

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function newGame(demo) {
    score = 0; cycle = 1; landings = perfects = crashes = 0; visited = 1;
    astroIdx = demo ? (Math.random() * ASTROS.length) | 0 : 0;
    maxFuel = DIFF[settings.diff].fuel; fuel = maxFuel;
    particles = [];
    hintT = demo ? 0 : 5;
    loadAstro();
  }

  // Monta o astro atual já com o peso do ciclo (depois da Neônia tudo recomeça mais difícil).
  function loadAstro() {
    const base = ASTROS[astroIdx], c = cycle - 1;
    A = Object.assign({}, base);
    A.g = base.g * (1 + 0.15 * c);
    A.thr = 22 + A.g * 1.4;                          // motor um pouco mais forte onde pesa mais
    A.gEff = A.g * (codes.has('PENA') && state !== 'menu' ? 0.5 : 1);
    A.wind = base.wind * (1 + 0.35 * c);
    A.gust = base.gust * (1 + 0.35 * c);
    A.windDir = Math.random() < 0.5 ? -1 : 1;
    A.ph = Math.random() * TAU;
    A.seed = (Math.random() * 1e9) | 0;
    const d = DIFF[settings.diff], f = Math.max(0.6, 1 - 0.1 * c);
    tol = { vy: d.vy * f, vx: d.vx * f, ang: d.ang * f };
    T = genTerrain(A, c);
    buildBackground();
    attempt = 1;
    spawn();
  }

  function spawn() {
    L = { x: Math.random() * T.tw, y: T.maxH + 290, vx: (Math.random() < 0.5 ? -1 : 1) * Arcade.rand(8, 16), vy: -2, a: 0, thrust: false, rotating: false };
    phase = 'intro'; phaseT = 0; result = null;
    ap.pad = null; ap.acc = 0; ap.down = false;
    const t = camTarget();
    cam.x = t.x; cam.y = t.y; cam.z = t.z;
    if (state === 'play') { tone(660, 0.12, 'triangle', 0.08); tone(990, 0.2, 'triangle', 0.08, null, 0.12); }
  }

  function start() {
    Sfx.ensure();
    state = 'play';
    newGame(false);
    show(null);
    updateHud();
  }

  function toMenu() {
    state = 'menu';
    newGame(true);
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (state === 'play') { state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = 'play'; show(null); }
  }

  function windAt(t) {
    if (!A.wind && !A.gust) return 0;
    return A.wind * A.windDir + A.gust * (0.6 * Math.sin(t * 0.9 + A.ph) + 0.4 * Math.sin(t * 2.3 + A.ph * 2));
  }

  /* ---------- física ---------- */
  function step(dt, inp) {
    const r = clamp(inp.rot, -1, 1);
    if (r) L.a += r * ROT * dt;
    // estabilizador: solto e quase reto, o módulo se endireita sozinho bem devagar
    else if (Math.abs(L.a) < 7 * DEG) L.a -= Math.sign(L.a) * Math.min(Math.abs(L.a), 0.3 * dt);
    L.a = clamp(L.a, -95 * DEG, 95 * DEG);
    L.rotating = !!r;
    const inf = infinite();
    L.thrust = !!inp.thrust && (fuel > 0 || inf);
    let ax = windNow, ay = -A.gEff;
    if (L.thrust) {
      ax += Math.sin(L.a) * A.thr; ay += Math.cos(L.a) * A.thr;
      if (!inf) fuel = Math.max(0, fuel - BURN * dt);
    }
    ax -= A.drag * L.vx; ay -= A.drag * L.vy;
    L.vx += ax * dt; L.vy += ay * dt;
    L.x += L.vx * dt; L.y += L.vy * dt;
    contact();
  }

  // Pés no chão: pouso (se plataforma + velocidades e ângulo dentro da tolerância) ou explosão.
  function contact() {
    const c = Math.cos(L.a), s = Math.sin(L.a);
    for (const [px, py] of HULL) {
      const wx = L.x + px * c + py * s, wy = L.y - px * s + py * c;
      if (wy <= ground(wx)) { crash('BATEU NO RELEVO!'); return; }
    }
    const lx = L.x - FOOT_X * c + FOOT_Y * s, ly = L.y + FOOT_X * s + FOOT_Y * c;
    const rx = L.x + FOOT_X * c + FOOT_Y * s, ry = L.y - FOOT_X * s + FOOT_Y * c;
    if (ly > ground(lx) && ry > ground(rx)) return;
    const p = padAt(lx, rx);
    const rv = Math.max(0, -L.vy) / tol.vy, rh = Math.abs(L.vx) / tol.vx, ra = Math.abs(L.a) / DEG / tol.ang;
    if (!p) crash('FORA DA PLATAFORMA!');
    else if (rv > 1 || rh > 1 || ra > 1) crash(rv >= rh && rv >= ra ? 'DESCEU RÁPIDO DEMAIS!' : rh >= ra ? 'DERRAPOU DE LADO!' : 'POUSOU TORTO!');
    else land(p, rv <= PERF && rh <= PERF && ra <= PERF);
  }

  // Pouso: metade do combustível que sobrou vira pontos, a outra metade fica no tanque
  // e a plataforma reabastece 100 × multiplicador (+100 no pouso perfeito).
  function land(p, perfect) {
    phase = 'landed'; phaseT = 0;
    L.y = p.y - FOOT_Y; L.vx = 0; L.vy = 0; L.a = 0; L.thrust = false;
    const base = 100 * p.m * cycle;
    const bonus = perfect ? base : 0;
    const inf = infinite();
    const half = Math.round((inf ? maxFuel : fuel) / 2);
    const refill = 100 * p.m + (perfect ? 100 : 0);
    if (!inf) fuel = Math.min(maxFuel, fuel - half + refill);
    if (state === 'play') { score += base + bonus + half; landings++; if (perfect) perfects++; }
    result = { kind: 'land', m: p.m, base, bonus, half, refill, perfect };
    for (let i = 0; i < 24; i++) spark(L.x + Arcade.rand(-14, 14), p.y + 1, Arcade.rand(-50, 50), Arcade.rand(5, 30), Arcade.rand(0.4, 0.9), A.line, 2, 0.6);
    tone(110, 0.25, 'triangle', 0.18, 60);
    noise(0.25, 0.12, 900);
    if (state === 'play') {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.09, null, 0.15 + i * 0.1));
      if (perfect) [1319, 1568, 2093].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, null, 0.6 + i * 0.09));
    }
  }

  function crash(reason) {
    phase = 'crash'; phaseT = 0; shakeT = 0.6; flashT = 0.5;
    const inf = infinite();
    const lost = inf ? 0 : Math.min(fuel, DIFF[settings.diff].pen);
    fuel -= lost;
    if (state === 'play') crashes++;
    result = { kind: 'crash', reason, lost, empty: !inf && fuel <= 0 };
    const cols = [ACC, '#ffffff', '#ffb347', '#ff6a3d', A.line];
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * TAU, s = Arcade.rand(20, 140);
      spark(L.x, L.y, Math.cos(a) * s + L.vx * 0.3, Math.sin(a) * s + Math.abs(L.vy) * 0.2, Arcade.rand(0.6, 1.6), Arcade.pick(cols), Arcade.rand(1.5, 4.5), 1);
    }
    if (state === 'play') Sfx.explode();
  }

  function nextAstro() {
    astroIdx++;
    if (astroIdx >= ASTROS.length) { astroIdx = 0; if (state === 'play') cycle++; }
    if (state === 'play') visited++;
    loadAstro();
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set(hiKey(), hi); }
    $('overTitle').textContent = landings ? 'TANQUE SECO!' : 'MISSÃO FRACASSADA';
    $('overScore').textContent = score;
    $('overInfo').textContent = `${DIFF[settings.diff].name} · ${landings} ${landings === 1 ? 'pouso' : 'pousos'} (${perfects} ${perfects === 1 ? 'perfeito' : 'perfeitos'}) · ${crashes} ${crashes === 1 ? 'batida' : 'batidas'} · parou em ${A.name}${cycle > 1 ? `, ciclo ${cycle}` : ''}`;
    $('overRecord').hidden = !rec;
    Ranking.gameOver($('rankBox'), { board: 'pouso-lunar-' + settings.diff, score, cheated });
    show('over');
    Sfx.lose();
    updateHud();
  }

  /* ---------- câmera ---------- */
  // Centro entre o módulo e o chão; quanto mais perto do chão, mais zoom.
  function camTarget() {
    let gmax = -1e9;
    for (let i = -3; i <= 3; i++) gmax = Math.max(gmax, ground(L.x + i * 15));
    const alt = Math.max(0, L.y - gmax);
    const z = clamp((S0 * 0.72) / (alt + 70), S0 / 1150, S0 / 150);
    return { x: L.x + clamp(L.vx * 0.6, -60, 60), y: (L.y + gmax) / 2, z };
  }
  function updateCamera(dt) {
    const t = camTarget();
    cam.z += (t.z - cam.z) * Math.min(1, dt * 2.2);
    const b = Math.min(1, dt * 4);
    cam.x += (t.x - cam.x) * b; cam.y += (t.y - cam.y) * b;
    // o módulo nunca sai da tela (nem fica embaixo dos instrumentos)
    const mx = (W / 2 - 50) / cam.z;
    cam.x = clamp(cam.x, L.x - mx, L.x + mx);
    cam.y = clamp(cam.y, L.y - (H / 2 - 40) / cam.z, L.y + (H / 2 - 115) / cam.z);
  }
  const sxOf = x => W / 2 + (x - cam.x) * cam.z;
  const syOf = y => H / 2 - (y - cam.y) * cam.z;

  /* ---------- piloto automático (demonstração) ---------- */
  // Escolhe uma plataforma, ajusta a velocidade desejada e liga o motor na medida certa
  // (modulação: acumula a fração de empuxo necessária e dispara quando passa de 1).
  const ap = { pad: null, acc: 0, down: false };
  function autopilot() {
    if (!ap.pad) {
      let best = 1e9;
      for (const p of T.pads) {
        const d = Math.abs(near((p.x0 + p.x1) / 2, L.x) - L.x) * (p.m === 5 ? 1.6 : 1);
        if (d < best) { best = d; ap.pad = p; }
      }
    }
    const p = ap.pad, cx = near((p.x0 + p.x1) / 2, L.x), dx = cx - L.x;
    const alt = L.y + FOOT_Y - p.y, halfW = (p.x1 - p.x0) / 2;
    // desce quando está em cima da plataforma (com folga para não ficar indo e voltando)
    ap.down = Math.abs(dx) < (ap.down ? halfW + 6 : Math.max(8, halfW - 8));
    let vyT;
    if (ap.down) vyT = -clamp(alt * 0.22, 2.2, 30);
    else {
      // altura segura: acima do ponto mais alto entre o módulo e a plataforma
      let top = p.y;
      const n = Math.ceil(Math.abs(dx) / SEG) + 3, sg = Math.sign(dx);
      for (let i = -1; i <= n; i++) top = Math.max(top, ground(L.x + sg * i * SEG));
      vyT = clamp((top + 45 - FOOT_Y - L.y) * 0.5, -18, 14);
    }
    const vxT = clamp(dx * 0.22, -24, 24);
    const axN = (vxT - L.vx) * 1.2 - windNow + A.drag * L.vx;
    const ayN = (vyT - L.vy) * 1.5 + A.gEff + A.drag * L.vy;
    let aT = clamp(Math.atan2(axN, Math.max(ayN, A.gEff * 0.5)), -0.8, 0.8);
    if (alt < 25) { const lim = tol.ang * 0.6 * DEG; aT = clamp(aT, -lim, lim); }
    const diff = aT - L.a;
    const rot = Math.abs(diff) < 0.01 ? 0 : clamp(diff * 6, -1, 1);
    // empuxo necessário na direção para onde o módulo aponta
    const need = axN * Math.sin(L.a) + ayN * Math.cos(L.a);
    let thrust = false;
    if (need > 0) {
      ap.acc = Math.min(2, ap.acc + need / A.thr);
      if (ap.acc >= 1) { ap.acc -= 1; thrust = true; }
    } else ap.acc = 0;
    return { rot, thrust };
  }

  /* ---------- entrada ---------- */
  const keys = { left: false, right: false, thrust: false };
  const pads = { left: false, right: false, thrust: false };
  const gp = { rot: 0, thrust: false };
  let drag = null;                                   // dedo/mouse segurando no jogo

  function readInput() {
    if (state === 'menu') return autopilot();
    let rot = (keys.right || pads.right ? 1 : 0) - (keys.left || pads.left ? 1 : 0);
    if (!rot && gp.rot) rot = gp.rot;
    if (!rot && drag && drag.target !== null) {
      const d = drag.target - L.a;
      rot = Math.abs(d) < 0.01 ? 0 : clamp(d * 6, -1, 1);
    }
    return { rot, thrust: keys.thrust || pads.thrust || gp.thrust || !!drag };
  }

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
    if (key === 'arrowleft' || key === 'a') keys.left = true;
    if (key === 'arrowright' || key === 'd') keys.right = true;
    if (key === 'arrowup' || key === 'w' || key === ' ') keys.thrust = true;
  });
  addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') keys.left = false;
    if (key === 'arrowright' || key === 'd') keys.right = false;
    if (key === 'arrowup' || key === 'w' || key === ' ') keys.thrust = false;
  });
  addEventListener('blur', () => {
    keys.left = keys.right = keys.thrust = false;
    pads.left = pads.right = pads.thrust = false;
    drag = null;
  });

  // Botões na tela (vários dedos ao mesmo tempo).
  function bindPadButton(el, name) {
    const down = e => {
      e.preventDefault(); Sfx.ensure();
      pads[name] = true; el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    };
    const up = () => { pads[name] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindPadButton($('btnLeft'), 'left');
  bindPadButton($('btnRight'), 'right');
  bindPadButton($('btnThrust'), 'thrust');

  // Segurar no jogo liga o motor; arrastar para os lados inclina o módulo.
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    if (drag || state !== 'play' || !L) return;
    drag = { id: e.pointerId, x0: e.clientX, a0: L.a, target: null };
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
  });
  screen.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const r = canvas.getBoundingClientRect();
    const dx = (e.clientX - drag.x0) / Math.max(1, Math.min(r.width, r.height));
    if (drag.target !== null || Math.abs(dx) > 0.02) drag.target = clamp(drag.a0 + dx * 3.2, -90 * DEG, 90 * DEG);
  });
  const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);
  screen.addEventListener('contextmenu', e => e.preventDefault());

  let padA = false, padStart = false;
  function pollPad() {
    const g = Arcade.gamepad(0);
    gp.rot = 0; gp.thrust = false;
    if (!g) return;
    gp.rot = g.lx;
    gp.thrust = g.a || g.rt;
    if (g.a && !padA && (state === 'menu' || (state === 'over' && overT > 0.8))) start();
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

  /* ---------- efeitos ---------- */
  function spark(x, y, vx, vy, life, color, size, grav = 1) {
    if (particles.length >= 420) return;
    particles.push({ x, y, vx, vy, life, max: life, color, size, grav });
  }

  function effects(dt) {
    const c = Math.cos(L.a), s = Math.sin(L.a);
    if (L.thrust) {
      // fogo saindo do bocal, na direção oposta ao empuxo
      const nx = L.x - 9 * s, ny = L.y - 9 * c;
      for (let i = 0; i < 2; i++) {
        const sp = Arcade.rand(50, 90), a = L.a + Arcade.rand(-0.25, 0.25);
        spark(nx, ny, L.vx - Math.sin(a) * sp, L.vy - Math.cos(a) * sp, Arcade.rand(0.2, 0.45), Arcade.pick(['#ffffff', '#ffd27a', '#ff9a3d', '#ffb347']), Arcade.rand(1.5, 3), 0);
      }
      // poeira levantada perto do chão
      const gx = L.x - s * 20, gy = ground(gx);
      if (L.y - gy < 60 && Math.random() < 0.8) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        spark(gx + Arcade.rand(-6, 6), gy + 1, dir * Arcade.rand(30, 90), Arcade.rand(4, 20), Arcade.rand(0.4, 0.8), A.line, Arcade.rand(1, 2.5), 0.3);
      }
    }
    if (L.rotating && Math.random() < 0.5) {
      const side = Math.random() < 0.5 ? -1 : 1;
      spark(L.x + side * 8 * c + 6 * s, L.y - side * 8 * s + 6 * c, side * 30 * c + L.vx, -side * 30 * s + L.vy, 0.2, '#ffffff', 1.5, 0);
    }
    // vulcões de Io (só os que estão por perto)
    for (const v of T.vents) {
      const vx = near(v.x, cam.x);
      if (Math.abs(vx - cam.x) < W / cam.z && Math.random() < dt * 30) {
        spark(vx + Arcade.rand(-4, 4), v.y, Arcade.rand(-12, 12), Arcade.rand(35, 75), Arcade.rand(1, 1.8), Arcade.pick(['#ffe14d', '#ff9a3d', '#fff7b0']), Arcade.rand(1.5, 3), 0.35);
      }
    }
  }

  function sounds(dt) {
    if (state !== 'play') return;
    if (L.thrust && (snd.thr -= dt) <= 0) { snd.thr = 0.075; noise(0.16, 0.09, 520, 0, 'lowpass', 140); }
    if (L.rotating && (snd.rcs -= dt) <= 0) { snd.rcs = 0.16; noise(0.05, 0.025, 5000, 0, 'highpass', 3000); }
    if (!infinite() && fuel < maxFuel * 0.15 && (snd.low -= dt) <= 0) { snd.low = 0.7; tone(1250, 0.07, 'square', 0.05); }
    const alt = L.y + FOOT_Y - ground(L.x);
    if (alt < 70 && -L.vy > tol.vy && (snd.warn -= dt) <= 0) { snd.warn = 0.22; tone(520, 0.06, 'square', 0.06); }
  }

  /* ---------- atualização ---------- */
  function update(dt) {
    time += dt; phaseT += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    hintT = Math.max(0, hintT - (phase === 'fly' ? dt : 0));
    if (state === 'over') overT += dt;
    windNow = windAt(time);

    if (state === 'play' || state === 'menu') {
      if (phase === 'intro') {
        if (phaseT >= (state === 'menu' ? 1.2 : 1.8)) { phase = 'fly'; phaseT = 0; }
      } else if (phase === 'fly') {
        const inp = readInput();
        for (let i = 0; i < 2 && phase === 'fly'; i++) step(dt / 2, inp);
        if (phase === 'fly') { effects(dt); sounds(dt); }
      } else if (phase === 'landed') {
        const skip = state === 'play' && phaseT > 1.4 && readInput().thrust;
        if (phaseT > (state === 'menu' ? 2.5 : 3.8) || skip) nextAstro();
      } else if (phase === 'crash') {
        if (phaseT > 2.4) {
          if (result && result.empty && state === 'play') { gameOver(); return; }
          attempt++;
          spawn();
        }
      }
    }
    updateCamera(dt);

    for (const p of particles) {
      p.life -= dt;
      p.vy -= A.gEff * p.grav * dt;
      p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav && p.y < ground(p.x)) { p.y = ground(p.x); p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.6; }
    }
    particles = particles.filter(p => p.life > 0);
    for (const s of streaks) {
      s.x += windNow * 45 * s.s * dt;
      if (s.x > W + 30) s.x -= W + 60; else if (s.x < -30) s.x += W + 60;
    }
    updateHud();
  }

  let hudKey = '';
  function updateHud() {
    if (!A) return;
    const demo = state === 'menu';
    const s = demo ? 0 : score;
    const f = demo ? DIFF[settings.diff].fuel : codes.has('KONAMI') ? '∞' : Math.ceil(fuel);
    const astro = demo ? '—' : cycle > 1 ? `${A.name} ×${cycle}` : A.name;
    const status = DIFF[settings.diff].name + (!demo && codes.any() ? ' · CÓDIGO' : '');
    const key = `${s}|${hi}|${f}|${astro}|${status}`;
    if (key === hudKey) return;
    hudKey = key;
    hud.score.textContent = s;
    hud.hi.textContent = hi;
    hud.fuel.textContent = f;
    hud.astro.textContent = astro;
    hud.status.textContent = status;
  }

  /* ---------- desenho ---------- */
  function txt(str, x, y, size, color, align = 'center', alpha = 1, mono = false) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = mono ? `${size}px "Share Tech Mono", monospace` : `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (!mono) {
      ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }
  function glowTxt(str, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    txt(str, x, y, size, color, 'center', alpha);
    ctx.restore();
  }
  // Quebra o texto em linhas que cabem na largura dada.
  function wrapLines(str, size, maxW) {
    ctx.font = `${size}px "Share Tech Mono", monospace`;
    const out = [];
    let line = '';
    for (const w of str.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  const pts = [];
  function drawTerrain() {
    const left = cam.x - W / 2 / cam.z, right = cam.x + W / 2 / cam.z;
    const i0 = Math.floor(left / SEG) - 1, i1 = Math.ceil(right / SEG) + 1;
    pts.length = 0;
    for (let i = i0; i <= i1; i++) pts.push(sxOf(i * SEG), syOf(T.h[mod(i, T.n)]));
    // preenchimento
    ctx.beginPath();
    ctx.moveTo(pts[0], H + 10);
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineTo(pts[pts.length - 2], H + 10);
    ctx.closePath();
    const top = syOf(T.maxH);
    const gr = ctx.createLinearGradient(0, Math.min(top, H - 40), 0, H);
    gr.addColorStop(0, A.fill); gr.addColorStop(1, '#000000');
    ctx.fillStyle = gr; ctx.fill();
    // segunda linha apagada, um pouco abaixo (dá profundidade)
    const off = Math.max(4, 7 * cam.z);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1] + off) : ctx.moveTo(pts[i], pts[i + 1] + off);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = A.line; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    // contorno neon
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1]);
    ctx.save();
    ctx.shadowColor = A.line; ctx.shadowBlur = 10;
    ctx.strokeStyle = A.line; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function drawPads() {
    const half = W / 2 / cam.z + 120;
    for (const p of T.pads) {
      const mid = (p.x0 + p.x1) / 2, base = near(mid, cam.x) - mid;
      for (let d = -1; d <= 1; d++) {
        const o = base + d * T.tw;
        if (Math.abs(mid + o - cam.x) > half) continue;
        const x0 = sxOf(p.x0 + o), x1 = sxOf(p.x1 + o), y = syOf(p.y), col = PAD_COLOR[p.m];
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.restore();
        // luzinhas piscando nas pontas
        const on = Math.floor(time * 3 + p.m) % 2 === 0;
        ctx.fillStyle = on ? '#ffffff' : col;
        ctx.fillRect(x0 - 2, y - 7, 4, 4); ctx.fillRect(x1 - 2, y - 7, 4, 4);
        txt('×' + p.m, (x0 + x1) / 2, y - 18, 15, col);
      }
    }
  }

  function drawLander() {
    const ls = Math.max(cam.z, 0.9);
    ctx.save();
    ctx.translate(sxOf(L.x), syOf(L.y));
    ctx.rotate(L.a);
    ctx.scale(ls, ls);
    if (L.thrust && phase === 'fly') {
      const len = 9 + Math.random() * 10;
      ctx.save();
      ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#ff9a3d';
      ctx.beginPath(); ctx.moveTo(-3.4, 8); ctx.lineTo(3.4, 8); ctx.lineTo(0, 8 + len); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.moveTo(-1.8, 8); ctx.lineTo(1.8, 8); ctx.lineTo(0, 8 + len * 0.55); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // cabine e estágio de descida (preenchidos)
    ctx.fillStyle = '#0b1a2e';
    ctx.beginPath();
    ctx.moveTo(-6, 1); ctx.lineTo(-7.5, -3); ctx.lineTo(-4, -10); ctx.lineTo(4, -10); ctx.lineTo(7.5, -3); ctx.lineTo(6, 1); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2108'; ctx.fillRect(-7, 1, 14, 4);
    // contorno neon num traço só
    ctx.shadowColor = ACC; ctx.shadowBlur = 8;
    ctx.strokeStyle = ACC; ctx.lineWidth = 1.5 / ls; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 1); ctx.lineTo(-7.5, -3); ctx.lineTo(-4, -10); ctx.lineTo(4, -10); ctx.lineTo(7.5, -3); ctx.lineTo(6, 1); ctx.closePath();
    ctx.rect(-7, 1, 14, 4);
    ctx.moveTo(-5, 4); ctx.lineTo(-10, 9); ctx.moveTo(5, 4); ctx.lineTo(10, 9);
    ctx.moveTo(-12.5, 9); ctx.lineTo(-7.5, 9); ctx.moveTo(7.5, 9); ctx.lineTo(12.5, 9);
    ctx.moveTo(-2.5, 5); ctx.lineTo(-3.5, 8); ctx.lineTo(3.5, 8); ctx.lineTo(2.5, 5);
    ctx.moveTo(3, -10); ctx.lineTo(5, -13.5);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(-7, 2, 14, 1.2);
    ctx.fillStyle = 'rgba(154,208,255,0.85)';
    ctx.beginPath(); ctx.arc(0, -5, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    const zs = clamp(cam.z, 0.7, 2.2);
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      const s = p.size * zs;
      ctx.fillRect(sxOf(p.x) - s / 2, syOf(p.y) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawStreaks() {
    if (!A.wind && !A.gust) return;
    ctx.strokeStyle = A.line; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    for (const s of streaks) {
      const len = (6 + Math.abs(windNow) * 6) * s.s;
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.sign(windNow || 1) * len, s.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Código RADAR: simula os próximos 4 s com o motor do jeito que está agora.
  function drawRadar() {
    let x = L.x, y = L.y, vx = L.vx, vy = L.vy;
    const dt = 0.05, ax0 = L.thrust ? Math.sin(L.a) * A.thr : 0, ay0 = L.thrust ? Math.cos(L.a) * A.thr : 0;
    ctx.fillStyle = '#ffffff';
    let hit = null;
    for (let i = 1; i <= 80; i++) {
      const ax = ax0 + windAt(time + i * dt) - A.drag * vx, ay = ay0 - A.gEff - A.drag * vy;
      vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt;
      if (y + FOOT_Y <= ground(x)) { hit = { x, y: ground(x), vx, vy }; break; }
      if (i % 2 === 0) { ctx.globalAlpha = 0.75 - i / 130; ctx.fillRect(sxOf(x) - 1.5, syOf(y + FOOT_Y) - 1.5, 3, 3); }
    }
    ctx.globalAlpha = 1;
    if (hit) {
      const p = padAt(hit.x - FOOT_X, hit.x + FOOT_X);
      const ok = p && -hit.vy <= tol.vy && Math.abs(hit.vx) <= tol.vx;
      const sx = sxOf(hit.x), sy = syOf(hit.y), col = ok ? GREEN : RED;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, TAU); ctx.moveTo(sx - 10, sy); ctx.lineTo(sx + 10, sy); ctx.stroke();
    }
  }

  // Setas na borda apontando as plataformas fora da tela (empilhadas sem encavalar).
  function drawPadArrows() {
    const list = [];
    for (const p of T.pads) {
      const mid = near((p.x0 + p.x1) / 2, cam.x), sx = sxOf(mid);
      if (sx < 0 || sx > W) list.push({ p, mid, right: sx > W, y: clamp(syOf(p.y), 130, H - 30) });
    }
    list.sort((a, b) => a.y - b.y);
    const lastY = { true: -1e9, false: -1e9 };
    for (const it of list) {
      it.y = Math.max(it.y, lastY[it.right] + 40);
      lastY[it.right] = it.y;
    }
    for (const { p, mid, right, y } of list) {
      const col = PAD_COLOR[p.m], x = right ? W - 12 : 12;
      ctx.fillStyle = col; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      if (right) { ctx.moveTo(x + 6, y); ctx.lineTo(x - 4, y - 7); ctx.lineTo(x - 4, y + 7); }
      else { ctx.moveTo(x - 6, y); ctx.lineTo(x + 4, y - 7); ctx.lineTo(x + 4, y + 7); }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      const dist = Math.round(Math.abs(mid - L.x));
      txt('×' + p.m, right ? x - 10 : x + 10, y - 9, 13, col, right ? 'right' : 'left');
      txt(dist + 'm', right ? x - 10 : x + 10, y + 9, 12, col, right ? 'right' : 'left', 0.85, true);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,4,12,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(154,208,255,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  const zoneColor = r => (r <= 0.7 ? GREEN : r <= 1 ? YELLOW : RED);
  function gauge(x, y, label, value, r) {
    const col = zoneColor(r);
    txt(label, x, y, 13, '#8fa6c4', 'left', 1, true);
    txt(value, x + 100, y, 15, col, 'right', 1, true);
    const bx = x + 106, bw = 40;
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(bx, y - 3, bw, 7);
    ctx.fillStyle = col; ctx.fillRect(bx, y - 3, bw * Math.min(1, r / 1.5), 7);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + bw / 1.5, y - 5, 1, 11);
    if (r <= PERF) txt('★', x + 156, y, 13, GREEN, 'center', 1, true);
  }

  function drawInstruments() {
    const down = Math.max(0, -L.vy), side = Math.abs(L.vx), ang = Math.abs(L.a) / DEG;
    panel(8, 8, 172, 96);
    const vArrow = L.vy < -0.05 ? '▼' : L.vy > 0.05 ? '▲' : ' ';
    const hArrow = L.vx < -0.05 ? '◄' : L.vx > 0.05 ? '►' : ' ';
    gauge(16, 24, 'V.VERT', vArrow + Math.abs(L.vy).toFixed(1), down / tol.vy);
    gauge(16, 46, 'V.HORIZ', hArrow + side.toFixed(1), side / tol.vx);
    gauge(16, 68, 'ÂNGULO', Math.round(ang) + '°', ang / tol.ang);
    const alt = Math.max(0, Math.round(L.y + FOOT_Y - ground(L.x)));
    txt('ALTITUDE', 16, 90, 13, '#8fa6c4', 'left', 1, true);
    txt(alt + ' m', 116, 90, 15, '#ffffff', 'right', 1, true);

    // combustível, gravidade e vento
    const w = 156, x = W - 8 - w;
    panel(x, 8, w, 74);
    const inf = infinite();
    const frac = inf ? 1 : fuel / maxFuel;
    const fcol = frac > 0.4 ? GREEN : frac > 0.15 ? YELLOW : RED;
    txt('COMBUSTÍVEL', x + 8, 22, 13, '#8fa6c4', 'left', 1, true);
    txt(codes.has('KONAMI') && state !== 'menu' ? '∞' : String(Math.ceil(fuel)), x + w - 8, 22, 15, fcol, 'right', 1, true);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + 8, 32, w - 16, 8);
    ctx.fillStyle = fcol; ctx.fillRect(x + 8, 32, (w - 16) * clamp(frac, 0, 1), 8);
    txt('GRAVIDADE', x + 8, 54, 13, '#8fa6c4', 'left', 1, true);
    txt(A.gEff.toFixed(1), x + w - 8, 54, 15, '#ffffff', 'right', 1, true);
    txt('VENTO', x + 8, 72, 13, '#8fa6c4', 'left', 1, true);
    const wv = Math.abs(windNow) < 0.05 ? 'CALMO' : (windNow < 0 ? '◄ ' : '► ') + Math.abs(windNow).toFixed(1);
    txt(wv, x + w - 8, 72, 15, Math.abs(windNow) > 4 ? YELLOW : '#ffffff', 'right', 1, true);
  }

  function drawMessages() {
    const cx = W / 2, y0 = H * 0.36;
    if (phase === 'intro') {
      const a = Math.min(1, phaseT * 3);
      txt(`ASTRO ${astroIdx + 1} DE ${ASTROS.length}${cycle > 1 ? ` · CICLO ${cycle}` : ''}`, cx, y0 - 40, 14, '#cfe6ff', 'center', a, true);
      glowTxt(A.name, cx, y0, 42, A.line, a);
      const lines = wrapLines(A.sub, 15, W - 60);
      lines.forEach((l, i) => txt(l, cx, y0 + 38 + i * 20, 15, '#ffffff', 'center', a, true));
      if (attempt > 1) txt(`TENTATIVA ${attempt}`, cx, y0 + 46 + lines.length * 20, 16, YELLOW, 'center', a);
    } else if (phase === 'landed' && result) {
      const r = result;
      glowTxt(r.perfect ? 'POUSO PERFEITO!' : 'POUSOU!', cx, y0 - 10, r.perfect ? 30 : 36, r.perfect ? GREEN : PAD_COLOR[r.m]);
      if (state === 'play') {
        const rows = [
          [`PLATAFORMA ×${r.m}${cycle > 1 ? ` · CICLO ×${cycle}` : ''}`, '+' + r.base],
          r.perfect ? ['BÔNUS PERFEITO ★', '+' + r.bonus] : null,
          ['METADE DO TANQUE', '+' + r.half],
          ['REABASTECIMENTO', '+' + r.refill + ' COMB'],
        ].filter(Boolean);
        rows.forEach((row, i) => {
          const a = clamp((phaseT - 0.35 - i * 0.3) * 4, 0, 1);
          txt(row[0], cx - 120, y0 + 32 + i * 22, 14, '#cfe6ff', 'left', a, true);
          txt(row[1], cx + 120, y0 + 32 + i * 22, 15, i === rows.length - 1 ? ACC : '#ffffff', 'right', a, true);
        });
        if (phaseT > 1.4) txt('MOTOR = PRÓXIMO ASTRO', cx, y0 + 46 + rows.length * 22, 12, '#8fa6c4', 'center', 0.5 + 0.5 * Math.sin(time * 6), true);
      }
    } else if (phase === 'crash' && result) {
      glowTxt('KABUM!', cx, y0 - 10, 40, RED);
      txt(result.reason, cx, y0 + 30, 17, '#ffffff');
      if (result.lost) txt(`-${Math.round(result.lost)} DE COMBUSTÍVEL`, cx, y0 + 56, 15, YELLOW, 'center', 1, true);
      if (result.empty && state !== 'menu') txt('O TANQUE SECOU...', cx, y0 + 80, 15, RED, 'center', 1, true);
    } else if (phase === 'fly' && state === 'play') {
      if (!infinite() && fuel <= 0 && Math.floor(time * 3) % 2) glowTxt('SEM COMBUSTÍVEL!', cx, H * 0.3, 22, RED);
      else if (!infinite() && fuel < maxFuel * 0.15 && Math.floor(time * 2) % 2) txt('COMBUSTÍVEL BAIXO', cx, 122, 14, RED, 'center', 1, true);
      if (hintT > 0 && astroIdx === 0 && cycle === 1 && attempt === 1) {
        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        txt(coarse ? 'SEGURE MOTOR PARA FREAR A QUEDA' : 'SEGURE ↑ PARA FREAR A QUEDA', cx, H - 60, 14, '#ffffff', 'center', Math.min(1, hintT), true);
        txt('MIRE NUMA PLATAFORMA ×2 ×3 ×5', cx, H - 40, 14, ACC, 'center', Math.min(1, hintT), true);
      }
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0, sy = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);
    drawStreaks();
    drawTerrain();
    drawPads();
    drawParticles();
    if (phase !== 'crash') drawLander();
    else if (flashT > 0) {
      // clarão da explosão
      const r = (0.5 - flashT) * 160 * Math.max(1, cam.z);
      ctx.strokeStyle = `rgba(255,220,160,${flashT * 1.6})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sxOf(L.x), syOf(L.y), Math.max(1, r), 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,240,200,${flashT * 0.35})`; ctx.fillRect(0, 0, W, H);
    }
    if (phase === 'fly' && state === 'play' && codes.has('RADAR')) drawRadar();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawPadArrows();
    drawInstruments();
    drawMessages();
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
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  resize();
  newGame(true);
  syncDiff();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
