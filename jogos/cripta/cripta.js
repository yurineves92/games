// CRIPTA NEON: dungeon crawler de ação com vista de cima, em 10 andares desenhados à mão (andares.js).
// O andar vira uma grade de casas de 16×16; paredes e chão são pintados uma vez num canvas fora da tela
// e o resto (portas, armadilhas, bichos) é desenhado por cima a cada quadro. A escuridão é uma máscara
// em resolução lógica: enche de preto e "fura" com brilhos pré-renderizados (lanterna, tochas, fogo).
// A lógica roda em passo fixo de 1/60 s. Os inimigos seguem um mapa de distâncias (BFS) até o herói.
// O herói é uma homenagem de fã ao streamer solfat_guy (não é um produto oficial dele).
(() => {
  'use strict';

  /* ---------- o herói: troque aqui o nome e as cores do sprite ---------- */
  const HEROI = {
    nome: 'SOLFAT',
    pele: '#c68a5e', sombraPele: '#9a6440',
    cabelo: '#2a1a14',
    roupa: '#2a6ad8', roupaSombra: '#1a4a9a',   // moletom
    calca: '#2b2a3e',
    detalhe: '#b26bff',                         // cor do boné
    bone: true,                                 // false = cabelo à mostra
    fone: '#e8e8f0',                            // fone de ouvido (null = sem fone)
  };

  /* ---------- constantes ---------- */
  const T = 16;                       // tamanho da casa
  const TAU = Math.PI * 2;
  const STEP = 1 / 60;
  const ANDARES = window.CRIPTA_ANDARES || [];
  const SPEED = 74, ROLL_V = 178, ROLL_T = 0.3, ROLL_INV = 0.26, ROLL_CD = 0.5;
  const SWING_T = 0.2, SPIN_T = 0.3, COMBO_WIN = 0.32, REACH = 19;
  const HURT_INV = 1.0, FALL_DMG = 2;
  const MAX_PART = 260;
  const LIVES = 3;
  const PTS = { moeda: 10, bau: 50, segredo: 500, andar: 500, semDano: 2000, mini: 1500, mula: 3000, cuca: 10000, vitoria: 20000, vida: 5000, emboscada: 1000 };
  const SHOP_STOCK = [
    { id: 'garrafada', nome: 'Garrafada do Boto (cura 3 corações)', preco: 15 },
    { id: 'bombas', nome: '4 bombas', preco: 12 },
    { id: 'pedras', nome: '10 pedrinhas de bodoque', preco: 8, precisa: 'bodoque' },
    { id: 'sal', nome: '2 punhados de sal grosso', preco: 10, precisa: 'sal' },
    { id: 'coracao', nome: 'Coração extra (um por loja)', preco: 60 },
  ];
  const ITEM_NAME = { bombas: 'BOMBA', bodoque: 'BODOQUE', sal: 'SAL GROSSO' };
  const FACAO_NAME = ['', 'FACÃO', 'FACÃO AFIADO', 'FACÃO DE PRATA NEON'];

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const wrap = $('gameWrap'), stage = $('stage'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), shop: $('shopPanel'), over: $('overPanel') };
  const hud = { floor: $('hFloor'), floorName: $('hFloorName'), lives: $('hLives'), score: $('hScore'), hi: $('hHi'), status: $('hStatus') };

  /* ---------- utilitários ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = Arcade.rand, pick = Arcade.pick;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

  /* ---------- configurações e códigos ---------- */
  const settings = { dif: 'normal', musica: 'on' };
  const codes = Arcade.codes('cripta', {
    KONAMI: 'Vidas infinitas',
    LANTERNA: 'Tudo iluminado, sem escuridão',
    FACAO: 'Facão com dano triplicado',
  }, $('codeMount'), () => updateModeInfo());
  const hiKey = () => 'cripta_hi_' + settings.dif;
  let hi = 0;
  function updateModeInfo() {
    $('modeInfo').textContent = settings.dif === 'pesadelo'
      ? 'PESADELO: os bichos batem o dobro, as garrafinhas curam a metade e o Seu Boto fechou a venda. Boa sorte.'
      : 'NORMAL: já é difícil de verdade. Use o rolamento e leia os avisos de ataque.';
    hi = Number(Arcade.store.get(hiKey(), 0)) || 0;
    updateHud();
  }

  /* =====================================================================
     SONS (a demonstração do menu é muda)
     ===================================================================== */
  let state = 'menu';
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };
  let stepT = 0;
  const S = {
    step() { noise(0.04, 0.035, 900, 0, 'bandpass', 400); },
    swing(n) { noise(0.09, 0.09, 3200 + n * 600, 0, 'highpass', 1200); tone(240 + n * 60, 0.06, 'triangle', 0.04, 120); },
    spin() { noise(0.2, 0.12, 4000, 0, 'bandpass', 900); tone(300, 0.2, 'sawtooth', 0.04, 600); },
    hit() { tone(180, 0.08, 'square', 0.1, 70); noise(0.06, 0.12, 2500); },
    tink() { tone(1500, 0.06, 'square', 0.06, 1800); tone(2200, 0.05, 'triangle', 0.05, null, 0.03); },
    kill() { tone(420, 0.1, 'square', 0.08, 120); noise(0.18, 0.12, 1800); },
    roll() { noise(0.18, 0.08, 700, 0, 'bandpass', 250); },
    hurt() { tone(330, 0.12, 'sawtooth', 0.13, 110); tone(160, 0.2, 'square', 0.08, 60, 0.05); },
    fall() { tone(500, 0.5, 'triangle', 0.1, 80); },
    splash() { noise(0.35, 0.18, 1600, 0, 'bandpass', 300); },
    coin() { tone(988, 0.05, 'square', 0.06); tone(1319, 0.12, 'square', 0.06, null, 0.05); },
    key() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.08, 'triangle', 0.08, null, i * 0.05)); },
    door() { tone(110, 0.25, 'square', 0.08, 70); noise(0.3, 0.12, 600); },
    gate() { tone(90, 0.3, 'sawtooth', 0.06, 60); noise(0.4, 0.1, 400); },
    lever() { tone(600, 0.05, 'square', 0.07); tone(300, 0.08, 'square', 0.06, null, 0.05); },
    chest() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, null, i * 0.07)); },
    heal() { [660, 880, 1100].forEach((f, i) => tone(f, 0.1, 'sine', 0.08, null, i * 0.06)); },
    secret() { [784, 740, 622, 440, 415, 659, 831, 1047].forEach((f, i) => tone(f, 0.1, 'square', 0.06, null, i * 0.09)); },
    bombSet() { tone(200, 0.06, 'square', 0.06); },
    fuse() { noise(0.05, 0.03, 5000, 0, 'highpass', 3000); },
    boom() { Sfx.explode && state !== 'menu' && Sfx.explode(); },
    pellet() { tone(700, 0.05, 'triangle', 0.06, 300); },
    salt() { noise(0.3, 0.09, 6000, 0, 'highpass', 2500); },
    arrow() { noise(0.12, 0.06, 4000, 0, 'bandpass', 1500); },
    spike() { tone(900, 0.03, 'square', 0.03); },
    fire() { noise(0.5, 0.08, 1200, 0, 'lowpass', 300); },
    hiss() { noise(0.25, 0.03, 6000, 0, 'highpass', 4000); },
    crumble() { noise(0.2, 0.08, 900, 0, 'lowpass', 120); },
    rumble() { noise(0.5, 0.1, 300, 0, 'lowpass', 60); },
    teleport() { tone(300, 0.3, 'sine', 0.08, 1200); noise(0.3, 0.06, 2000, 0, 'bandpass', 600); },
    squeak() { tone(1800, 0.05, 'square', 0.04, 2400); },
    bat() { tone(2400, 0.06, 'triangle', 0.03, 1700); },
    frog() { tone(110, 0.12, 'square', 0.06, 80); tone(95, 0.1, 'square', 0.05, 70, 0.12); },
    shot() { noise(0.25, 0.2, 2500); tone(90, 0.2, 'square', 0.08, 40); },
    aim() { tone(1200, 0.04, 'sine', 0.04); },
    growl() { tone(80, 0.35, 'sawtooth', 0.08, 55); },
    howl() { tone(300, 0.5, 'sine', 0.07, 600); tone(600, 0.4, 'sine', 0.05, 420, 0.45); },
    whistle() { tone(1600, 0.12, 'sine', 0.07, 2300); tone(2300, 0.2, 'sine', 0.06, 1500, 0.13); },
    neigh() { [700, 900, 760, 980, 640, 420].forEach((f, i) => tone(f, 0.08, 'sawtooth', 0.06, f * 0.8, i * 0.06)); },
    chant() { [196, 233, 220, 175].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, null, i * 0.2)); tone(98, 0.9, 'sine', 0.05); },
    laugh() { [520, 470, 520, 470, 430].forEach((f, i) => tone(f, 0.09, 'square', 0.05, f * 0.9, i * 0.11)); },
    song() { [659, 784, 880, 784, 659, 587].forEach((f, i) => tone(f, 0.25, 'sine', 0.06, null, i * 0.22)); },
    roar() { noise(0.7, 0.2, 500, 0, 'lowpass', 80); tone(70, 0.6, 'sawtooth', 0.1, 45); },
    stomp() { noise(0.4, 0.25, 400, 0, 'lowpass', 40); },
    warn() { tone(880, 0.07, 'square', 0.05); tone(880, 0.07, 'square', 0.05, null, 0.12); },
    buy() { tone(1047, 0.06, 'square', 0.06); tone(1568, 0.1, 'square', 0.06, null, 0.06); },
    nope() { tone(150, 0.18, 'sawtooth', 0.07); },
    stairs() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'triangle', 0.08, null, i * 0.08)); },
    boss() { [110, 117, 110, 98].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.07, null, i * 0.3)); },
    tick() { tone(1400, 0.03, 'square', 0.03); },
    tally() { tone(1200, 0.03, 'square', 0.03); },
  };

  // Musiquinha ambiente: 3 notas por andar, bem baixinho (desliga no menu de opções).
  const Music = {
    t: 0, i: 0, notes: null,
    set(notes) { this.notes = notes; this.i = 0; this.t = 0.5; },
    update(dt, fast) {
      if (!this.notes || settings.musica !== 'on' || Sfx.isMuted()) return;
      this.t -= dt;
      if (this.t > 0) return;
      const n = this.notes[this.i % this.notes.length];
      this.i++;
      const beat = fast ? 0.42 : 1.1;
      this.t = beat;
      tone(n, beat * 1.4, 'triangle', 0.025);
      if (this.i % 3 === 1) tone(n / 2, beat * 2.6, 'sine', 0.03);
    },
  };

  /* =====================================================================
     PIXEL ART (tudo desenhado por código em canvas pequenos, uma vez só)
     ===================================================================== */
  function mk(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    fn(g, c);
    return c;
  }
  const px = (g, x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const rect = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  function disc(g, cx, cy, r, col) {
    g.fillStyle = col;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) g.fillRect(x, y, 1, 1);
      }
    }
  }
  function oval(g, cx, cy, rx, ry, col) {
    g.fillStyle = col;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) g.fillRect(x, y, 1, 1);
      }
    }
  }
  const fromStrings = (rows, pal) => mk(rows[0].length, rows.length, g => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) px(g, x, y, pal[ch]); })));
  const mirrorRows = rows => rows.map(r => r + [...r].reverse().join(''));
  // Versão toda branca do sprite (piscada de dano).
  function whiteOf(c) {
    return mk(c.width, c.height, g => { g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); });
  }
  // Brilho radial (usado na máscara de luz e nos halos coloridos).
  function makeGlow(r, gr, b, size = 64, plateau = 0) {
    return mk(size, size, g => {
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
      if (plateau) grad.addColorStop(plateau, `rgba(${r},${gr},${b},0.92)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, size, size);
    });
  }
  const GLOW = {
    light: makeGlow(255, 255, 255, 128, 0.5),
    soft: makeGlow(255, 255, 255, 64),
    warm: makeGlow(255, 170, 70), cyan: makeGlow(0, 229, 255), pink: makeGlow(255, 43, 214),
    purple: makeGlow(178, 107, 255), red: makeGlow(255, 59, 92), lava: makeGlow(255, 110, 30),
    green: makeGlow(125, 255, 58), wisp: makeGlow(90, 255, 220), white: makeGlow(255, 255, 255),
    yellow: makeGlow(255, 212, 0),
  };

  /* ---------- o herói (cores e acessórios vêm do objeto HEROI, lá no topo) ---------- */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), ch = s => clamp(Math.round(((n >> s) & 255) * f), 0, 255);
    return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
  }
  const HERO_PAL = {
    k: '#120818', h: HEROI.cabelo, H: shade(HEROI.cabelo, 1.6), s: HEROI.pele, S: HEROI.sombraPele, e: '#120818',
    c: HEROI.detalhe, C: shade(HEROI.detalhe, 1.35), b: shade(HEROI.detalhe, 0.6), f: HEROI.fone || '#120818',
    j: HEROI.roupa, J: HEROI.roupaSombra, w: '#d9a441', y: '#00e5ff', p: HEROI.calca, B: '#2a1a14',
  };
  // sem boné, o topo da cabeça vira cabelo
  const capOff = r => (HEROI.bone ? r : r.replace(/c/g, 'h').replace(/C/g, 'H').replace(/b/g, 'h'));
  const HERO_FRONT = mirrorRows(['...kkk', '..kccc', '.kcccC', '.kbbbb', '.fhsss', '.fhses', '..ksss', '..kkSS', '.kjjjj', 'ksjjjj', 'ksjJjj', '.kwwww', '.kpppp'].map(capOff));
  const HERO_BACK = mirrorRows(['...kkk', '..kccc', '.kcccc', '.kcccc', '.fhhhh', '.fhhhh', '..khhh', '..kkSS', '.kjjjj', 'ksjjjj', 'ksjjjj', '.kwwww', '.kpppp'].map(capOff));
  const HERO_SIDE = ['...kkkkk....', '..kccccCk...', '.kcccccccbbb', '.kcccccck...', '.fhhhsssssk.', '.fhhhssseSk.', '..khhsssssk.', '...kkSSSkk..',
    '...kjjjjk...', '..kjjjjjsk..', '..kjjjjJsk..', '...kwwwyk...', '...kppppk...'].map(r => (HEROI.bone ? r : capOff(r).replace('hhhh...', 'hhk....')));
  const LEGS_FB = { i: ['..kppkkppk..', '..kBBkkBBk..', '..kkk..kkk..'], a: ['..kppkkppk..', '..kBBkkppk..', '..kkk.kBBk..'], b: ['..kppkkppk..', '..kppkkBBk..', '..kBBk.kkk..'] };
  const LEGS_S = { i: ['...kpkkpk...', '...kBkkBk...', '...kk..kk...'], a: ['..kpk..kpk..', '..kBk..kBBk.', '..kk....kk..'], b: ['....kpkpk...', '....kBkBk...', '....kkkk....'] };
  const HSPR = {};
  for (const fr of ['i', 'a', 'b']) {
    const front = HERO_FRONT.concat(LEGS_FB[fr]).map((r, y) => (y === 11 ? r.slice(0, 8) + 'y' + r.slice(9) : r));
    HSPR['down' + fr] = fromStrings(front, HERO_PAL);
    HSPR['up' + fr] = fromStrings(HERO_BACK.concat(LEGS_FB[fr]), HERO_PAL);
    HSPR['side' + fr] = fromStrings(HERO_SIDE.concat(LEGS_S[fr]), HERO_PAL);
  }
  HSPR.white = whiteOf(HSPR.downi);

  /* ---------- criaturas (2 quadros cada, viradas para a direita) ---------- */
  const DARK = '#120818';
  const ART = {};
  const two = fn => [0, 1].map(f => fn(f));
  ART.r = two(f => mk(14, 9, g => {
    rect(g, 0, 5 + f, 1, 1, '#ff9ab8'); rect(g, 1, 6 - f, 2, 1, '#e07a9a'); rect(g, 3, 6, 1, 1, '#e07a9a');
    oval(g, 7, 5, 4, 3, '#5e5468'); oval(g, 8, 4.5, 3, 2.4, '#7d7388'); disc(g, 11, 5, 2.2, '#8a8096');
    px(g, 10, 2, '#ff9ab8'); px(g, 11, 2, '#c86a8a'); px(g, 12, 4, '#ff3b5c'); px(g, 13, 5, '#ff9ab8');
    rect(g, 5 + f, 8, 1, 1, '#2a2030'); rect(g, 9 - f, 8, 1, 1, '#2a2030');
  }));
  ART.b = two(f => mk(16, 10, g => {
    const wy = f ? 5 : 1;
    for (let i = 0; i < 5; i++) { rect(g, 2 + i, wy + (f ? i * 0.4 : 4 - i) | 0, 1, 3, '#3a1f52'); rect(g, 13 - i, wy + (f ? i * 0.4 : 4 - i) | 0, 1, 3, '#3a1f52'); }
    rect(g, 0, f ? 7 : 1, 2, 2, '#2a1440'); rect(g, 14, f ? 7 : 1, 2, 2, '#2a1440');
    oval(g, 8, 5, 2.6, 3, '#4a2a66'); px(g, 6, 1, '#4a2a66'); px(g, 9, 1, '#4a2a66');
    px(g, 7, 4, '#ffe066'); px(g, 9, 4, '#ffe066'); px(g, 8, 7, '#ff9ab8');
  }));
  ART.a = two(f => mk(16, 13, g => {
    for (let i = 0; i < 4; i++) {
      const y = 3 + i * 2, o = (i + f) % 2;
      rect(g, 1 + o, y, 4, 1, '#2a1a12'); rect(g, 0 + o, y + 1, 1, 2, '#2a1a12');
      rect(g, 11 - o, y, 4, 1, '#2a1a12'); rect(g, 15 - o, y + 1, 1, 2, '#2a1a12');
    }
    disc(g, 8, 4.5, 3, '#4a2e1e'); oval(g, 8, 9, 4, 3.6, '#2e1c12');
    for (const [x, y] of [[6, 8], [10, 9], [8, 11], [7, 3]]) px(g, x, y, '#7a5236');
    px(g, 8, 9, '#ff7a1a'); px(g, 7, 3, '#ff3b5c'); px(g, 9, 3, '#ff3b5c'); px(g, 6, 2, '#ffd0a0'); px(g, 10, 2, '#ffd0a0');
  }));
  const sapo = big => mk(16, 13, g => {
    const r = big ? 6 : 4.6;
    oval(g, 8, 7.5, r + 0.6, r, '#5a6a2a'); oval(g, 8, 9, r - 1.2, r - 2, '#c8b46a');
    for (const [x, y] of [[5, 5], [10, 6], [7, 4], [12, 8], [4, 8]]) px(g, x, y, '#3a4a1a');
    disc(g, 5, 3.5, 1.7, '#e8d040'); disc(g, 11, 3.5, 1.7, '#e8d040'); px(g, 5, 3, DARK); px(g, 11, 3, DARK);
    rect(g, 3, 12, 3, 1, '#3a4a1a'); rect(g, 10, 12, 3, 1, '#3a4a1a');
  });
  ART.c = [sapo(false), sapo(false), sapo(true)];
  const skel = (f, musket) => mk(14, 17, g => {
    rect(g, 2, 2, 10, 1, '#6a4a2a'); rect(g, 4, 0, 6, 2, '#7a5a32'); rect(g, 4, 1, 6, 1, '#a07a42');
    disc(g, 7, 5, 2.8, '#e8e0c8'); px(g, 6, 5, DARK); px(g, 8, 5, DARK); rect(g, 6, 7, 3, 1, '#b8b098');
    rect(g, 6, 8, 2, 1, '#e8e0c8'); for (let i = 0; i < 3; i++) rect(g, 5, 9 + i * 1.5 | 0, 5, 1, '#d8d0b8');
    rect(g, 7, 9, 1, 5, '#e8e0c8'); rect(g, 5, 13, 5, 1, '#d8d0b8');
    rect(g, 5, 14, 1, 3 - f, '#e8e0c8'); rect(g, 9, 14, 1, 2 + f, '#e8e0c8');
    rect(g, 3, 9, 1, 4, '#d8d0b8');
    if (musket) { rect(g, 7, 10, 7, 1, '#6a4a2a'); rect(g, 10, 9, 4, 1, '#9aa4b0'); rect(g, 10, 10, 1, 2, '#6a4a2a'); }
    else { rect(g, 11, 4, 1, 8, '#c8d0dc'); rect(g, 10, 11, 3, 1, '#d9a441'); rect(g, 11, 12, 1, 2, '#6a4a2a'); }
  });
  ART.z = two(f => skel(f, false));
  ART.q = two(f => skel(f, true));
  ART.h = two(f => mk(20, 15, g => {
    rect(g, 5, 12, 2, 3 - f, '#2a1c16'); rect(g, 13, 12, 2, 2 + f, '#2a1c16'); rect(g, 8, 12, 2, 2 + f, '#2a1c16');
    oval(g, 9, 10, 6, 3.6, '#3a2a22'); oval(g, 9, 9, 5, 2.4, '#4e3a2e'); disc(g, 15, 10, 3, '#4a3428');
    rect(g, 17, 10, 3, 2, '#6a4a3a'); px(g, 18, 12, '#f0e8d0'); px(g, 19, 11, '#f0e8d0'); px(g, 15, 9, '#ff7a1a');
    for (let x = 4; x < 14; x += 2) px(g, x, 7, '#2a1c16');
    // a Caipora montada
    rect(g, 7, 0, 4, 2, '#ff5a1a'); px(g, 6, 1, '#ffd400'); disc(g, 9, 3, 1.6, '#a8653f'); px(g, 10, 3, DARK);
    rect(g, 8, 5, 3, 2, '#2a8a3a'); px(g, 11, 5, '#a8653f');
  }));
  ART.e = two(f => mk(12, 17, g => {
    disc(g, 6, 3.5, 2.7, '#8a7a62'); px(g, 5, 3, '#ffcc33'); px(g, 7, 3, '#ffcc33'); rect(g, 5, 5, 3, 1, '#4a3a2a');
    rect(g, 4, 7, 4, 6, '#6a5a46'); for (let y = 8; y < 12; y += 2) rect(g, 4, y, 4, 1, '#4a3a2a');
    rect(g, 2, 7, 1, 6 + f, '#7a6a52'); rect(g, 9, 7, 1, 7 - f, '#7a6a52'); px(g, 2, 13 + f, '#c8b898'); px(g, 9, 14 - f, '#c8b898');
    rect(g, 4, 13, 1, 4, '#6a5a46'); rect(g, 7, 13, 1, 4, '#6a5a46');
  }));
  ART.mound = mk(14, 6, g => { oval(g, 7, 4, 6, 2.5, '#3a2a1a'); oval(g, 7, 3.5, 4, 1.6, '#4e3a24'); px(g, 5, 3, '#ffcc33'); px(g, 8, 3, '#ffcc33'); });
  ART.l = two(f => mk(18, 19, g => {
    rect(g, 5, 14, 3, 5 - f, '#2e2a38'); rect(g, 11, 14, 3, 4 + f, '#2e2a38');
    oval(g, 9, 10, 5, 5, '#4a4458'); oval(g, 9, 9, 3.6, 3.4, '#5c566c');
    rect(g, 2, 8, 3, 6, '#4a4458'); rect(g, 13, 8, 3, 6, '#4a4458'); px(g, 2, 14, '#f0f0f0'); px(g, 4, 14, '#f0f0f0'); px(g, 13, 14, '#f0f0f0'); px(g, 15, 14, '#f0f0f0');
    disc(g, 10, 4, 3.2, '#4a4458'); rect(g, 12, 4, 4, 3, '#5c566c'); px(g, 15, 4, DARK);
    rect(g, 7, 0, 2, 2, '#2e2a38'); rect(g, 11, 0, 2, 2, '#2e2a38'); px(g, 11, 3, '#ff3b5c'); px(g, 9, 3, '#ff3b5c');
    rect(g, 13, 6, 3, 1, '#f0f0f0');
  }));
  ART.s = two(f => mk(12, 17, g => {
    rect(g, 4, 0, 3, 1, '#ff2b4a'); rect(g, 3, 1, 5, 1, '#ff2b4a'); rect(g, 3, 2, 6, 1, '#d01a38'); px(g, 7, 0, '#ff2b4a'); px(g, 8, 0, '#ff6a7a');
    disc(g, 6, 5, 2.6, '#5a3220'); px(g, 7, 4, '#ffffff'); px(g, 5, 4, '#ffffff'); rect(g, 5, 6, 3, 1, '#ffb0a0');
    rect(g, 8, 6, 3, 1, '#8a5a2a'); px(g, 10, 5, '#d9a441'); px(g, 11, 4 - f, '#c8c8d8');
    rect(g, 4, 8, 4, 4, '#5a3220'); rect(g, 4, 11, 4, 2, '#ff2b4a'); rect(g, 2, 8, 2, 1, '#5a3220'); rect(g, 8, 8, 2, 1, '#5a3220');
    rect(g, 5, 13, 2, 3 + f, '#5a3220'); rect(g, 4, 15 + f, 3, 1, '#3a2010');
  }));
  ART.boto = mk(12, 19, g => {
    rect(g, 1, 3, 10, 1, '#f4f4fa'); rect(g, 3, 0, 6, 3, '#f4f4fa'); rect(g, 3, 2, 6, 1, '#ff2bd6');
    disc(g, 6, 5.5, 2.6, '#ffb0c0'); px(g, 5, 5, DARK); px(g, 7, 5, DARK); rect(g, 5, 7, 3, 1, '#d07a90');
    rect(g, 3, 9, 6, 6, '#e8e8f2'); rect(g, 5, 9, 2, 4, '#ff2bd6'); rect(g, 1, 9, 2, 5, '#e8e8f2'); rect(g, 9, 9, 2, 5, '#e8e8f2');
    rect(g, 3, 15, 2, 4, '#d8d8e4'); rect(g, 7, 15, 2, 4, '#d8d8e4'); rect(g, 9, 13, 3, 3, '#7a4a2a'); px(g, 10, 12, '#39ff14');
  });

  /* ---------- chefes ---------- */
  ART.iara = mk(22, 22, g => {
    for (let i = 0; i < 9; i++) rect(g, 3 + i, 2 + (i % 3), 1, 14 + (i % 4), '#0e3a2a');
    disc(g, 11, 6, 4.2, '#c8865a'); rect(g, 6, 2, 10, 3, '#13523b'); rect(g, 5, 3, 2, 12, '#13523b'); rect(g, 15, 3, 2, 12, '#13523b');
    px(g, 9, 6, '#39ff14'); px(g, 13, 6, '#39ff14'); rect(g, 10, 8, 3, 1, '#a04a5a');
    rect(g, 8, 10, 7, 6, '#c8865a'); rect(g, 8, 11, 7, 2, '#1fd3c0'); rect(g, 5, 11, 3, 2, '#c8865a'); rect(g, 15, 11, 3, 2, '#c8865a');
    rect(g, 7, 16, 9, 6, '#1fd3c0'); for (let x = 8; x < 16; x += 2) px(g, x, 18, '#7affea');
    px(g, 12, 3, '#ffd400'); px(g, 10, 3, '#ff2bd6');
  });
  ART.curu = two(f => mk(14, 19, g => {
    for (let i = 0; i < 7; i++) rect(g, 3 + i, f ? (i % 2) : ((i + 1) % 2), 1, 4, i % 2 ? '#ffd400' : '#ff5a1a');
    disc(g, 7, 6, 3, '#a8653f'); px(g, 6, 6, '#ffffff'); px(g, 8, 6, '#ffffff'); rect(g, 6, 8, 3, 1, '#7c4527');
    rect(g, 4, 10, 6, 5, '#2a8a3a'); for (let x = 4; x < 10; x += 2) px(g, x, 14, '#7dff3a');
    rect(g, 2, 10, 2, 4, '#a8653f'); rect(g, 10, 10, 2, 4, '#a8653f');
    rect(g, 5, 15, 1, 3, '#a8653f'); rect(g, 8, 15, 1, 3, '#a8653f');
    rect(g, 3, 18, 3, 1, '#7c4527'); rect(g, 6, 18, 3, 1, '#7c4527');   // pés virados para trás
  }));
  ART.mula = two(f => mk(36, 24, g => {
    rect(g, 6, 15, 3, 9 - f * 2, '#3a2416'); rect(g, 12, 15, 3, 7 + f * 2, '#3a2416'); rect(g, 22, 15, 3, 9 - f * 2, '#3a2416'); rect(g, 27, 15, 3, 7 + f * 2, '#3a2416');
    for (const x of [6, 12, 22, 27]) rect(g, x, 22 - (x % 2 ? 0 : 0), 3, 2, '#d9a441');
    oval(g, 17, 12, 13, 6, '#5a3a24'); oval(g, 17, 10, 11, 3.6, '#6e4a30');
    rect(g, 1, 6, 4, 9, '#2a1a10'); rect(g, 0, 8, 2, 8, '#2a1a10');
    rect(g, 27, 5, 6, 8, '#5a3a24'); rect(g, 29, 3, 5, 4, '#4a2e1c');
    rect(g, 12, 7, 12, 2, '#8a2a1a'); rect(g, 16, 6, 2, 5, '#d9a441');
  }));
  ART.mapi = two(f => mk(36, 40, g => {
    rect(g, 9, 32, 7, 8 - f, '#4a2418'); rect(g, 21, 32, 7, 7 + f, '#4a2418');
    oval(g, 18, 22, 14, 13, '#6a3a2a'); oval(g, 18, 20, 11, 11, '#7e4a34');
    for (let i = 0; i < 14; i++) px(g, 6 + ((i * 7) % 24), 12 + ((i * 5) % 20), '#4a2418');
    rect(g, 1, 14, 5, 16, '#6a3a2a'); rect(g, 30, 14, 5, 16, '#6a3a2a');
    for (const x of [1, 3, 5, 30, 32, 34]) rect(g, x, 30, 1, 3, '#f0e8d0');
    oval(g, 18, 8, 8, 7, '#6a3a2a'); disc(g, 18, 7, 3, '#ffe066'); disc(g, 18, 7, 1.4, '#ff3b5c');
    rect(g, 11, 23, 14, 3, '#2a0a0a'); for (let x = 12; x < 25; x += 2) px(g, x, 23, '#f0e8d0');
  }));
  ART.mapiOpen = mk(36, 40, g => {
    g.drawImage(ART.mapi[0], 0, 0);
    oval(g, 18, 24, 8, 6, '#2a0a0a'); oval(g, 18, 25, 6, 4, '#a01a2a');
    for (let x = 11; x < 26; x += 2) { px(g, x, 18 + ((x * 3) % 2), '#f0e8d0'); px(g, x, 30 - ((x * 3) % 2), '#f0e8d0'); }
  });
  ART.boiHead = mk(18, 16, g => {
    oval(g, 9, 8, 8, 6.5, '#ff5a1a'); oval(g, 9, 8, 6, 4.6, '#ffb000');
    disc(g, 5, 6, 2.8, '#ffffff'); disc(g, 13, 6, 2.8, '#ffffff'); disc(g, 5, 6, 1.4, '#00e5ff'); disc(g, 13, 6, 1.4, '#00e5ff');
    rect(g, 6, 12, 6, 1, '#7a1a0a'); px(g, 8, 14, '#ff2b4a'); px(g, 9, 15, '#ff2b4a');
  });
  ART.saciBoss = two(f => mk(16, 21, g => {
    rect(g, 5, 0, 4, 1, '#ff2b4a'); rect(g, 4, 1, 7, 2, '#ff2b4a'); rect(g, 3, 3, 9, 1, '#d01a38'); rect(g, 9, 0, 3, 1, '#ff6a7a');
    disc(g, 8, 6.5, 3.4, '#5a3220'); px(g, 7, 6, '#ffffff'); px(g, 10, 6, '#ffffff'); rect(g, 7, 8, 4, 1, '#ffb0a0');
    rect(g, 11, 8, 4, 1, '#8a5a2a'); rect(g, 14, 6, 2, 2, '#d9a441'); px(g, 15, 5 - f, '#ffd400');
    rect(g, 5, 10, 6, 5, '#5a3220'); rect(g, 5, 14, 6, 3, '#ff2b4a'); rect(g, 2, 10, 3, 2, '#5a3220'); rect(g, 11, 10, 3, 2, '#5a3220');
    rect(g, 7, 17, 2, 3 + f, '#5a3220'); rect(g, 6, 20, 4, 1, '#3a2010');
  }));
  ART.cuca = two(f => mk(26, 30, g => {
    rect(g, 6, 16, 14, 14, '#4a1a6a'); rect(g, 4, 22 + f, 18, 8 - f, '#6a2a8a'); for (let x = 5; x < 21; x += 3) px(g, x, 28, '#b26bff');
    rect(g, 2, 16, 4, 8, '#4a1a6a'); rect(g, 20, 16, 4, 8, '#4a1a6a'); rect(g, 1, 23, 3, 2, '#3a8a3a'); rect(g, 22, 23, 3, 2, '#3a8a3a');
    for (let i = 0; i < 10; i++) rect(g, 3 + i * 2, 4 + (i % 3), 2, 12 + (i % 2) * 3, i % 2 ? '#ffd84a' : '#e8b830');
    oval(g, 13, 9, 7, 5.6, '#3a8a3a'); rect(g, 13, 9, 11, 5, '#3a8a3a'); rect(g, 13, 13, 11, 1, '#245a24');
    for (let x = 15; x < 24; x += 2) px(g, x, 12, '#f0e8d0');
    disc(g, 11, 6, 2, '#ffe066'); px(g, 11, 6, DARK); disc(g, 16, 6, 2, '#ffe066'); px(g, 16, 6, DARK);
    rect(g, 7, 2, 12, 2, '#245a24');
  }));
  ART.jacare = two(f => mk(52, 26, g => {
    for (let i = 0; i < 14; i++) rect(g, i, 12 - (i >> 2) + (f && i < 6 ? 1 : 0), 2, 4 + (i >> 2), '#2e6e2e');
    oval(g, 26, 14, 16, 8, '#3a8a3a'); oval(g, 26, 12, 13, 5, '#4aa04a');
    for (let x = 16; x < 38; x += 4) { rect(g, x, 6, 2, 2, '#245a24'); }
    rect(g, 38, 10, 14, 7, '#3a8a3a'); rect(g, 40, 15, 12, 2, '#245a24'); for (let x = 41; x < 52; x += 2) { px(g, x, 14, '#f0e8d0'); px(g, x + 1, 17, '#f0e8d0'); }
    disc(g, 41, 9, 2.2, '#ffe066'); px(g, 41, 9, DARK);
    rect(g, 18, 20, 4, 6 - f, '#2e6e2e'); rect(g, 31, 20, 4, 5 + f, '#2e6e2e');
    for (let i = 0; i < 8; i++) px(g, 15 + i * 3, 8 + (i % 2), '#ffd84a');
  }));

  /* ---------- itens e ícones ---------- */
  const ICON = {
    heart: mk(8, 7, g => { rect(g, 1, 0, 2, 1, '#ff3b5c'); rect(g, 5, 0, 2, 1, '#ff3b5c'); rect(g, 0, 1, 8, 3, '#ff3b5c'); rect(g, 1, 4, 6, 1, '#ff3b5c'); rect(g, 2, 5, 4, 1, '#ff3b5c'); rect(g, 3, 6, 2, 1, '#ff3b5c'); px(g, 1, 1, '#ffb0c0'); }),
    heartE: mk(8, 7, g => { rect(g, 1, 0, 2, 1, '#4a2a3a'); rect(g, 5, 0, 2, 1, '#4a2a3a'); rect(g, 0, 1, 8, 3, '#4a2a3a'); rect(g, 1, 4, 6, 1, '#4a2a3a'); rect(g, 2, 5, 4, 1, '#4a2a3a'); rect(g, 3, 6, 2, 1, '#4a2a3a'); }),
    coin: [0, 1, 2, 3].map(f => mk(8, 8, g => { const w = [3, 2, 1, 2][f]; oval(g, 4, 4, w + 0.4, 3.4, '#ffb000'); oval(g, 4, 4, Math.max(0.6, w - 0.6), 2.4, '#ffe066'); })),
    key: mk(9, 9, g => { disc(g, 2.5, 2.5, 2.4, '#ffd400'); px(g, 2, 2, '#4a3a00'); rect(g, 3, 3, 5, 1, '#ffd400'); rect(g, 4, 4, 1, 1, '#ffd400'); rect(g, 4, 3, 1, 4, '#ffd400'); rect(g, 6, 4, 1, 2, '#ffd400'); rect(g, 7, 4, 1, 3, '#ffd400'); }),
    potion: mk(8, 10, g => { rect(g, 3, 0, 2, 1, '#c89a5a'); rect(g, 3, 1, 2, 2, '#c8f0ff'); oval(g, 4, 6.5, 3.4, 3.4, '#c8f0ff'); oval(g, 4, 7, 2.6, 2.4, '#ff3b5c'); px(g, 3, 5, '#ffffff'); }),
    bomb: mk(10, 10, g => { disc(g, 4.5, 6, 3.6, '#2a2a3a'); disc(g, 3.6, 5, 1.2, '#5a5a7a'); rect(g, 5, 1, 1, 2, '#c89a5a'); px(g, 6, 0, '#ffd400'); px(g, 7, 1, '#ff7a1a'); }),
    bodoque: mk(10, 10, g => { rect(g, 4, 5, 2, 5, '#7a4a2a'); rect(g, 1, 1, 2, 5, '#7a4a2a'); rect(g, 7, 1, 2, 5, '#7a4a2a'); rect(g, 2, 4, 6, 1, '#d9a441'); px(g, 5, 3, '#c8c8d8'); }),
    sal: mk(10, 10, g => { rect(g, 2, 3, 6, 7, '#e8e8f0'); rect(g, 2, 3, 6, 1, '#b26bff'); rect(g, 3, 1, 4, 2, '#d8d8e8'); px(g, 4, 6, '#b8b8c8'); px(g, 6, 7, '#b8b8c8'); }),
    pack: mk(10, 10, g => { disc(g, 3, 6, 2.6, '#2a2a3a'); disc(g, 7, 6, 2.6, '#2a2a3a'); disc(g, 5, 4, 2.6, '#3a3a4e'); px(g, 5, 1, '#ffd400'); }),
    sack: mk(10, 10, g => { oval(g, 5, 6.5, 4, 3.4, '#a07a42'); rect(g, 4, 1, 2, 3, '#a07a42'); rect(g, 3, 3, 4, 1, '#ff2b4a'); }),
    chest: mk(14, 12, g => { rect(g, 0, 3, 14, 9, '#6a3a1a'); rect(g, 0, 0, 14, 4, '#8a5226'); rect(g, 0, 4, 14, 1, '#d9a441'); rect(g, 6, 3, 2, 4, '#ffd400'); rect(g, 0, 11, 14, 1, '#3a1e0a'); rect(g, 1, 0, 12, 1, '#b8783a'); }),
    chestOpen: mk(14, 12, g => { rect(g, 0, 4, 14, 8, '#6a3a1a'); rect(g, 1, 5, 12, 3, '#1a0a04'); rect(g, 0, 0, 14, 3, '#5a3214'); rect(g, 0, 3, 14, 1, '#d9a441'); rect(g, 0, 11, 14, 1, '#3a1e0a'); }),
    up: mk(10, 12, g => { rect(g, 3, 0, 4, 2, '#ff3b5c'); rect(g, 1, 2, 8, 4, '#ff3b5c'); rect(g, 3, 6, 4, 6, '#ff3b5c'); px(g, 2, 3, '#ffb0c0'); }),
    lamp: mk(10, 12, g => { rect(g, 3, 0, 4, 2, '#7a7a8a'); rect(g, 2, 2, 6, 7, '#00e5ff'); rect(g, 3, 3, 4, 5, '#d6fdff'); rect(g, 2, 9, 6, 2, '#7a7a8a'); }),
    blade: mk(12, 12, g => { for (let i = 0; i < 8; i++) rect(g, 3 + i, 8 - i, 2, 2, '#e8fbff'); rect(g, 1, 9, 3, 3, '#7a4a2a'); px(g, 10, 0, '#ffffff'); }),
    bag: mk(10, 10, g => { oval(g, 5, 6, 4, 3.6, '#5a3a8a'); rect(g, 3, 1, 4, 2, '#5a3a8a'); px(g, 5, 6, '#ffd400'); }),
  };
  ICON.chestW = whiteOf(ICON.chest);
  const ITEM_ICON = { bombas: ICON.bomb, bodoque: ICON.bodoque, sal: ICON.sal };
  const WHITE = new Map();
  const white = c => { let w = WHITE.get(c); if (!w) { w = whiteOf(c); WHITE.set(c, w); } return w; };

  /* =====================================================================
     ANDARES: temas, leitura do mapa e a camada fixa (paredes e chão)
     ===================================================================== */
  const THEMES = {
    velas: { floor: ['#2a2032', '#30253a', '#251c2c'], top: '#140d1c', face: ['#3d3050', '#332844'], edge: '#ffb347', dark: [8, 4, 14] },
    esgoto: { floor: ['#1c2826', '#22302d', '#192321'], top: '#0c1414', face: ['#2c3e3a', '#243431'], edge: '#39ff14', dark: [3, 8, 6] },
    agua: { floor: ['#1a2238', '#1f2842', '#171e32'], top: '#0b0f1e', face: ['#27355a', '#202c4c'], edge: '#00e5ff', dark: [2, 5, 14] },
    mata: { floor: ['#1d2a1a', '#22321e', '#1a2617'], top: '#0c140a', face: ['#2c3f24', '#24341e'], edge: '#7dff3a', dark: [3, 8, 3] },
    curral: { floor: ['#2e2218', '#35281c', '#291e15'], top: '#160e08', face: ['#4a3320', '#3e2a1a'], edge: '#ff7a1a', dark: [10, 5, 2] },
    ossos: { floor: ['#272422', '#2d2a27', '#23201e'], top: '#110f0e', face: ['#3e3a36', '#34312d'], edge: '#e8e0c8', dark: [6, 5, 6] },
    toca: { floor: ['#1f1a16', '#241e19', '#1b1713'], top: '#0c0907', face: ['#30271f', '#29211a'], edge: '#ff3b5c', dark: [4, 2, 2] },
    fogo: { floor: ['#2a1712', '#311b15', '#251410'], top: '#140806', face: ['#45221a', '#3a1c15'], edge: '#ff5a1a', dark: [12, 3, 2] },
    saci: { floor: ['#2a1a26', '#311e2c', '#251722'], top: '#140a12', face: ['#43243a', '#391e31'], edge: '#ff2b4a', dark: [8, 2, 6] },
    cuca: { floor: ['#1f1529', '#251a31', '#1b1224'], top: '#0c0612', face: ['#33204a', '#2a1a3e'], edge: '#b26bff', dark: [6, 2, 12] },
  };
  const ENEMY_CH = 'rbaczqheld s'.replace(' ', '');
  const BOSS_CH = { I: 'iara', U: 'curupira', M: 'mula', N: 'mapinguari', B: 'boitata', P: 'saci', K: 'cuca' };
  const SOLID_CH = new Set('#%tTf*?$=m&'.split(''));
  const WALL_CH = new Set('#%tTf'.split(''));
  const HOLE_CH = new Set('OLW'.split(''));

  let L = null;   // andar atual
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= L.W || y >= L.H ? '#' : L.t[y * L.W + x]);
  const setTile = (x, y, c) => { L.t[y * L.W + x] = c; };
  const isWall = (x, y) => WALL_CH.has(tileAt(x, y));
  const crumbGone = (x, y) => { const c = L.crumb.get(y * L.W + x); return !!(c && c.gone > 0); };
  // mode: 0 herói, 1 bicho que anda, 2 bicho que voa, 3 projétil
  function blocked(x, y, mode) {
    const c = tileAt(x, y);
    if (SOLID_CH.has(c)) return true;
    if (c === 'D') return true;
    if (c === 'G') return !L.gatesOpen;
    if (c === 'H') return L.plateT <= 0;
    if (c === 'X') return L.arenaClosed;
    if (c === '"') return mode < 2;
    if (mode === 1 && (HOLE_CH.has(c) || (c === '_' && crumbGone(x, y)))) return true;
    return false;
  }
  const holeAt = (x, y) => { const c = tileAt(x, y); return HOLE_CH.has(c) || (c === '_' && crumbGone(x, y)); };

  function loadFloor(idx) {
    const def = ANDARES[idx];
    const H = def.mapa.length, W = def.mapa[0].length;
    L = {
      idx, def, W, H, t: [], theme: THEMES[def.tema] || THEMES.velas, start: { x: 0, y: 0 },
      items: [], chests: [], signs: [], enemies: [], bosses: [], boulders: [], emit: [], lights: [], ys: [], tp: new Map(),
      crumb: new Map(), seen: new Uint8Array(W * H), flow: new Int16Array(W * H).fill(-1), flowAt: -1, flowT: 0,
      gatesOpen: false, plateT: 0, arenaClosed: false, arena: null, arenaKind: null, arenaDone: false, tombs: [], waves: 0, waveT: 0,
      cluster: new Int16Array(W * H).fill(-1), found: new Set(), wTiles: [], foot: new Map(), fires: [],
      exitOpen: true, shopHeart: false, time: 0, damaged: false, kills: 0, coins: 0, secrets: 0, killPts: 0, bossPts: 0,
      songT: 9, songOn: 0, songWarn: 0,
    };
    const pesadelo = settings.dif === 'pesadelo';
    let chestI = 0, signI = 0;
    const bossSpots = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c = def.mapa[y][x];
        const cx = x * T + 8, cy = y * T + 8;
        if (c === 'S') { L.start = { x: cx, y: cy + 2 }; c = '.'; }
        else if (ENEMY_CH.includes(c)) { L.enemies.push(newEnemy(c, cx, cy)); c = '.'; }
        else if (BOSS_CH[c]) { bossSpots.push({ kind: BOSS_CH[c], x, y }); c = c === 'I' ? 'W' : '.'; }
        else if (c === 'k') { L.items.push({ type: 'key', x: cx, y: cy }); c = '.'; }
        else if (c === 'o') { L.items.push({ type: 'coin', x: cx, y: cy }); c = '.'; }
        else if (c === '+') { L.items.push({ type: 'potion', x: cx, y: cy }); c = '.'; }
        else if (c === '!') { L.items.push({ type: 'pack', x: cx, y: cy }); c = '.'; }
        else if (c === '@') { L.boulders.push({ x: cx, y: cy, ox: cx, oy: cy, state: 'rest', t: 0, dx: 0, dy: 0 }); c = '.'; }
        else if (c === '$') L.chests.push({ x, y, what: def.baus[chestI++] || 'moedas', open: false });
        else if (c === '?') L.signs.push({ x, y, text: def.placas[signI++] || '' });
        else if (c === 'm' && pesadelo) c = '.';
        else if (c === 'Y') L.ys.push({ x, y });
        else if (c === '&') L.tombs.push({ x, y });
        L.t.push(c);
      }
    }
    // redemoinhos em pares, na ordem de leitura
    for (let i = 0; i + 1 < L.ys.length; i += 2) {
      const a = L.ys[i], b = L.ys[i + 1];
      L.tp.set(a.y * W + a.x, b); L.tp.set(b.y * W + b.x, a);
    }
    // paredes rachadas agrupadas: cada grupo é uma sala secreta
    let nc = 0;
    for (let i = 0; i < W * H; i++) {
      if (L.t[i] !== '%' || L.cluster[i] >= 0) continue;
      const q = [i]; L.cluster[i] = nc;
      while (q.length) {
        const j = q.pop(), x = j % W, y = (j / W) | 0;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const k = ny * W + nx;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && L.t[k] === '%' && L.cluster[k] < 0) { L.cluster[k] = nc; q.push(k); }
        }
      }
      nc++;
    }
    // luzes fixas, bicos de fogo e setas
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = L.t[y * W + x], cx = x * T + 8, cy = y * T + 8;
        if (c === 't') L.lights.push({ x: cx, y: cy + 10, r: 54, glow: GLOW.warm, flick: 1, kind: 'torch' });
        else if (c === '*') L.lights.push({ x: cx, y: cy, r: 46, glow: (x + y) % 2 ? GLOW.cyan : GLOW.pink, flick: 0.3, kind: 'crystal' });
        else if (c === 'i') L.lights.push({ x: cx, y: cy, r: 34, glow: GLOW.warm, flick: 1.4, kind: 'candle' });
        else if (c === 'm') L.lights.push({ x: cx + 6, y: cy + 4, r: 44, glow: GLOW.warm, flick: 0.8, kind: 'boto' });
        else if (c === 'E') L.lights.push({ x: cx, y: cy, r: 26, glow: GLOW.green, flick: 0.2, kind: 'exit' });
        else if (c === 'W') L.wTiles.push(y * W + x);
        else if (c === 'T' || c === 'f') {
          let best = null;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let n = 0;
            while (n < 30) {
              const tx = x + dx * (n + 1), ty = y + dy * (n + 1), cc = tileAt(tx, ty);
              if (SOLID_CH.has(cc) || cc === 'D' || (c === 'f' && HOLE_CH.has(cc))) break;
              n++;
            }
            if (!best || n > best.n) best = { dx, dy, n };
          }
          const ph = c === 'T' ? ((x + y) % 4) * 0.6 : ((x + y) % 3) * 1.0;
          L.emit.push({ kind: c, x, y, dx: best.dx, dy: best.dy, len: c === 'f' ? Math.min(3, best.n) : best.n, ph, fired: false });
        }
      }
    }
    // pegadas do Curupira: os dedos sempre apontam para longe da saída
    let ex = 0, ey = 0;
    for (let i = 0; i < W * H; i++) if (L.t[i] === 'E') { ex = i % W; ey = (i / W) | 0; }
    const dE = bfs(ex, ey, (x, y) => !SOLID_CH.has(tileAt(x, y)) && !HOLE_CH.has(tileAt(x, y)), 999);
    for (let i = 0; i < W * H; i++) {
      if (L.t[i] !== ':') continue;
      const x = i % W, y = (i / W) | 0;
      let bd = -1, ba = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const d = dE[(y + dy) * W + x + dx];
        if (d > bd) { bd = d; ba = Math.atan2(dy, dx); }
      }
      L.foot.set(i, ba + (hash(x, y) - 0.5) * 0.5);
    }
    // arena: chefe ou emboscada, cercada pelos portões X
    if (bossSpots.length) {
      const b = bossSpots[0];
      L.arena = floodArena(b.x, b.y);
      L.arenaKind = 'boss';
      for (const s of bossSpots) L.bosses.push(newBoss(s.kind, s.x * T + 8, s.y * T + 8));
      L.exitOpen = false;
    } else if (L.tombs.length) {
      const t0 = L.tombs[0];
      L.arena = floodArena(t0.x + 1, t0.y);
      L.arenaKind = 'ambush';
    }
    if (pesadelo) for (const e of L.enemies) { e.hp = Math.ceil(e.hp * 1.25); e.max = e.hp; }
    buildLayer();
    Music.set(def.musica);
  }

  // BFS genérica em casas: devolve a distância (−1 = não alcança).
  function bfs(sx, sy, ok, maxD) {
    const W = L.W, H = L.H, d = new Int16Array(W * H).fill(-1);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return d;
    const q = new Int32Array(W * H); let qh = 0, qt = 0;
    d[sy * W + sx] = 0; q[qt++] = sy * W + sx;
    while (qh < qt) {
      const j = q[qh++], x = j % W, y = (j / W) | 0, nd = d[j] + 1;
      if (nd > maxD) continue;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nj = ny * W + nx;
        if (d[nj] >= 0 || !ok(nx, ny)) continue;
        d[nj] = nd; q[qt++] = nj;
      }
    }
    return d;
  }
  function floodArena(x, y) {
    const a = new Uint8Array(L.W * L.H);
    const d = bfs(x, y, (tx, ty) => { const c = tileAt(tx, ty); return c !== 'X' && !SOLID_CH.has(c) && c !== 'D'; }, 999);
    for (let i = 0; i < d.length; i++) if (d[i] >= 0) a[i] = 1;
    return a;
  }
  // Mapa de distâncias até o herói, usado pelos bichos para achar caminho.
  function updateFlow(dt) {
    L.flowT -= dt;
    const tx = Math.floor(player.x / T), ty = Math.floor(player.y / T), at = ty * L.W + tx;
    if (L.flowT > 0 && at === L.flowAt) return;
    L.flowT = 0.4; L.flowAt = at;
    L.flow = bfs(tx, ty, (x, y) => !blocked(x, y, 1), 34);
  }

  /* ---------- camada fixa: paredes, chão, água, lava ---------- */
  function paintTile(g, x, y) {
    const th = L.theme, c = tileAt(x, y), X = x * T, Y = y * T;
    const h = hash(x, y), h2 = hash(y + 17, x + 3);
    if (WALL_CH.has(c)) {
      const below = isWall(x, y + 1);
      rect(g, X, Y, T, T, th.top);
      for (let i = 0; i < 3; i++) px(g, X + ((hash(x * 3 + i, y) * 15) | 0), Y + ((hash(x, y * 3 + i) * 9) | 0), th.face[1]);
      if (!below) {
        // face da parede virada para a câmera, com tijolos
        rect(g, X, Y + 6, T, 10, th.face[0]);
        for (let r = 0; r < 3; r++) {
          const yy = Y + 6 + r * 3 + 2;
          rect(g, X, yy, T, 1, th.face[1]);
          for (let bx = (r % 2) * 4; bx < T; bx += 8) rect(g, X + bx, yy - 2, 1, 2, th.face[1]);
        }
        g.globalAlpha = 0.55; rect(g, X, Y + 6, T, 1, th.edge); g.globalAlpha = 1;
        rect(g, X, Y + 15, T, 1, '#05020a');
      }
      g.globalAlpha = 0.35;
      if (!isWall(x - 1, y)) rect(g, X, Y, 1, below ? T : 6, th.edge);
      if (!isWall(x + 1, y)) rect(g, X + T - 1, Y, 1, below ? T : 6, th.edge);
      if (!isWall(x, y - 1)) rect(g, X, Y, T, 1, th.edge);
      g.globalAlpha = 1;
      if (c === '%') {
        // rachaduras bem visíveis: a dica da sala secreta
        const cy = below ? Y + 4 : Y + 9;
        g.globalAlpha = 0.9;
        rect(g, X + 7, cy - 4, 1, 3, '#9a8ab0'); rect(g, X + 6, cy - 1, 1, 2, '#9a8ab0'); rect(g, X + 8, cy, 1, 3, '#9a8ab0');
        rect(g, X + 4, cy + 1, 2, 1, '#9a8ab0'); rect(g, X + 9, cy - 2, 3, 1, '#9a8ab0'); rect(g, X + 11, cy - 3, 1, 1, '#9a8ab0');
        g.globalAlpha = 1;
      }
      if (c === 't') { rect(g, X + 7, Y + 9, 2, 5, '#5a3a20'); rect(g, X + 5, Y + 8, 6, 2, '#7a5a30'); }
      if (c === 'T' || c === 'f') { rect(g, X + 5, Y + 8, 6, 5, '#1a1020'); rect(g, X + 6, Y + 9, 4, 3, c === 'f' ? '#5a2a10' : '#2a2a3a'); }
      return;
    }
    // chão
    const fl = th.floor[(h * 3) | 0];
    rect(g, X, Y, T, T, fl);
    rect(g, X, Y, T, 1, th.floor[2]); rect(g, X, Y, 1, T, th.floor[2]);
    if (h > 0.6) rect(g, X + ((h2 * 10) | 0) + 2, Y + ((h * 10) | 0) + 2, 2, 1, th.floor[2]);
    if (h2 > 0.7) px(g, X + ((h * 13) | 0) + 1, Y + ((h2 * 13) | 0) + 1, th.floor[1]);
    if (L.def.tema === 'ossos' && h > 0.82) { rect(g, X + 4, Y + 9, 6, 1, '#cfc6ae'); px(g, X + 3, Y + 8, '#cfc6ae'); px(g, X + 10, Y + 10, '#cfc6ae'); }
    if (L.def.tema === 'mata' && h2 > 0.55) { px(g, X + 3, Y + 5, '#2f5a22'); px(g, X + 11, Y + 12, '#2f5a22'); px(g, X + 4, Y + 4, '#3f7a2a'); }
    // sombra embaixo da parede de cima
    if (isWall(x, y - 1)) { g.globalAlpha = 0.45; rect(g, X, Y, T, 3, '#000000'); g.globalAlpha = 1; }
    if (c === '~') {
      g.globalAlpha = 0.65; rect(g, X, Y, T, T, '#155a8a'); g.globalAlpha = 1;
      rect(g, X + ((h * 8) | 0) + 1, Y + 4, 5, 1, '#5ab8e8'); rect(g, X + ((h2 * 8) | 0) + 2, Y + 11, 4, 1, '#3a90c8');
    } else if (c === 'W') {
      rect(g, X, Y, T, T, '#05162e');
      if (tileAt(x, y - 1) !== 'W') { rect(g, X, Y, T, 2, '#3ab8ff'); rect(g, X, Y + 2, T, 2, '#0a3a66'); }
      rect(g, X + ((h * 8) | 0) + 2, Y + 8, 5, 1, '#0e3a64');
    } else if (c === 'L') {
      rect(g, X, Y, T, T, '#8a1e06');
      disc(g, X + 4 + h * 8, Y + 4 + h2 * 8, 3, '#d8480e'); disc(g, X + 3 + h2 * 9, Y + 10, 2, '#ff7a1a');
      if (tileAt(x, y - 1) !== 'L') rect(g, X, Y, T, 2, '#ffb000');
    } else if (c === 'O') {
      rect(g, X, Y, T, T, '#000000');
      if (tileAt(x, y - 1) !== 'O') { rect(g, X, Y, T, 4, fl); rect(g, X, Y + 4, T, 2, '#1a1020'); }
    } else if (c === '*') {
      rect(g, X + 3, Y + 12, 10, 3, '#1a1a2a');
      const col = (x + y) % 2 ? ['#00e5ff', '#bff8ff'] : ['#ff2bd6', '#ffc2f2'];
      for (let i = 0; i < 5; i++) rect(g, X + 7 - i, Y + 3 + i, 2 + i * 2, 9 - i, col[0]);
      rect(g, X + 7, Y + 2, 2, 8, col[1]);
    } else if (c === '?') {
      rect(g, X + 7, Y + 10, 2, 5, '#5a3a20'); rect(g, X + 2, Y + 3, 12, 8, '#8a6232'); rect(g, X + 3, Y + 4, 10, 6, '#a07a42');
      for (let i = 0; i < 3; i++) rect(g, X + 4, Y + 5 + i * 2, 8 - i * 2, 1, '#5a3a20');
    } else if (c === '&') {
      rect(g, X + 2, Y + 2, 12, 13, '#4a4640'); rect(g, X + 3, Y + 3, 10, 11, '#5e5a52');
      rect(g, X + 7, Y + 4, 2, 8, '#2a2620'); rect(g, X + 5, Y + 6, 6, 2, '#2a2620');
    } else if (c === 'm') {
      rect(g, X, Y + 6, T, 10, '#5a1a4a'); for (let i = 0; i < T; i += 4) rect(g, X + i, Y + 8, 2, 6, '#ff2bd6');
    } else if (c === 'E') {
      rect(g, X + 1, Y + 1, 14, 14, '#05020a');
      for (let i = 0; i < 4; i++) rect(g, X + 2 + i, Y + 3 + i * 3, 12 - i * 2, 2, ['#5a4a70', '#463a5a', '#342a44', '#221a2e'][i]);
      g.globalAlpha = 0.7; rect(g, X + 1, Y + 1, 14, 1, '#39ff14'); rect(g, X + 1, Y + 1, 1, 14, '#39ff14'); rect(g, X + 14, Y + 1, 1, 14, '#39ff14'); g.globalAlpha = 1;
    } else if (c === 'p') {
      rect(g, X + 2, Y + 2, 12, 12, '#1a1424'); rect(g, X + 3, Y + 3, 10, 10, '#6a5a80'); rect(g, X + 3, Y + 3, 10, 1, '#9a8ab0');
    } else if (c === ':') {
      const a = L.foot.get(y * L.W + x) || 0;
      g.save(); g.translate(X + 8, Y + 8); g.rotate(a);
      g.fillStyle = 'rgba(255,90,26,0.55)';
      for (const s of [-1, 1]) { g.fillRect(-4, s * 3 - 1, 5, 3); g.fillRect(2, s * 3 - 2, 2, 1); g.fillRect(2, s * 3, 2, 1); g.fillRect(2, s * 3 + 2, 1, 1); }
      g.restore();
    } else if (c === 'i') {
      rect(g, X + 6, Y + 8, 4, 6, '#f0e0c0'); rect(g, X + 5, Y + 13, 6, 2, '#d8c8a0'); rect(g, X + 7, Y + 6, 1, 2, DARK);
    } else if (c === '"') {
      for (let i = 0; i < 7; i++) {
        const gx = X + 1 + i * 2, gh = 8 + ((hash(x * 7 + i, y) * 6) | 0);
        rect(g, gx, Y + 16 - gh, 1, gh, i % 2 ? '#3f8a2a' : '#2f6a20'); px(g, gx, Y + 16 - gh, '#7dff3a');
      }
    }
  }
  function buildLayer() {
    L.layer = mk(L.W * T, L.H * T, () => {});
    const g = L.layer.getContext('2d');
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) paintTile(g, x, y);
  }
  // Redesenha uma casa (e as vizinhas, por causa das bordas) depois que ela muda.
  function repaint(x, y) {
    const g = L.layer.getContext('2d');
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx >= 0 && yy >= 0 && xx < L.W && yy < L.H) paintTile(g, xx, yy);
    }
  }

  /* =====================================================================
     HERÓI, INVENTÁRIO E AÇÕES
     ===================================================================== */
  let inv = null, snapshot = null, player = null;
  let score = 0, lives = LIVES, cheatedRun = false;
  let particles = [], popups = [], shots = [], bombs = [], warns = [], fxs = [];
  let shake = 0, flash = 0, time = 0, stateT = 0, findT = 0, found = null, banner = null, msg = null;
  let pausedFrom = null, demo = null;
  const pes = () => settings.dif === 'pesadelo';
  const dmgMul = () => (pes() ? 2 : 1);

  function newInv() {
    return { maxHearts: 3, hp: 6, facao: 1, lanterna: 0, bombCap: 8, bombs: 0, hasBombs: false, hasBodoque: false, pedras: 0, hasSal: false, sal: 0, coins: 0, keys: 0, item: 'bombas', stolen: 0 };
  }
  // Equipamento padrão de quem começa por senha: tudo o que os baús e chefes dos andares anteriores dão.
  function invForFloor(idx) {
    const v = newInv();
    for (let i = 0; i < idx; i++) {
      for (const w of ANDARES[i].baus) {
        if (w === 'coracao') v.maxHearts++;
        else if (w === 'facao') v.facao++;
        else if (w === 'lanterna') v.lanterna++;
        else if (w === 'bolsa') v.bombCap += 4;
        else if (w === 'bodoque') v.hasBodoque = true;
        else if (w === 'sal') v.hasSal = true;
        else if (w === 'bombas') v.hasBombs = true;
      }
      if (ANDARES[i].chefe === 'MULA SEM CABEÇA') v.maxHearts++;
    }
    v.maxHearts = Math.min(10, v.maxHearts);
    v.facao = Math.min(3, v.facao);
    v.hp = v.maxHearts * 2;
    if (v.hasBombs) v.bombs = 6;
    if (v.hasBodoque) v.pedras = 15;
    if (v.hasSal) v.sal = 3;
    return v;
  }
  const ownedItems = () => [inv.hasBombs && 'bombas', inv.hasBodoque && 'bodoque', inv.hasSal && 'sal'].filter(Boolean);
  const itemCount = it => (it === 'bombas' ? inv.bombs : it === 'bodoque' ? inv.pedras : it === 'sal' ? inv.sal : 0);

  function newPlayer(x, y) {
    return {
      x, y, vx: 0, vy: 0, fx: 0, fy: 1, face: 'down', flip: false, anim: 0, moving: false,
      atk: 0, atkMax: 0, atkN: 0, atkAng: 0, comboT: 0, atkBuf: 0, atkRec: 0, hitSet: new Set(),
      roll: 0, rollInv: 0, rollCd: 0, rdx: 0, rdy: 1, inv: 0, kbx: 0, kby: 0,
      falling: 0, safeX: x, safeY: y, tpLock: -1, itemCd: 0, shopLock: true, signNear: null, doorMsg: 0,
      dead: false, pullX: 0, pullY: 0, spin: 0,
    };
  }
  const invulnerable = () => player.inv > 0 || player.rollInv > 0 || player.dead || player.falling > 0;

  /* ---------- colisão de caixas com a grade ---------- */
  function boxHits(x, y, hw, hh, mode) {
    const x0 = Math.floor((x - hw) / T), x1 = Math.floor((x + hw - 0.001) / T);
    const y0 = Math.floor((y - hh) / T), y1 = Math.floor((y + hh - 0.001) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (blocked(tx, ty, mode)) return true;
    if (mode === 0) for (const b of L.boulders) if (b.state !== 'gone' && Math.abs(b.x - x) < 7 + hw && Math.abs(b.y - y) < 7 + hh) return true;
    return false;
  }
  function moveBox(e, dx, dy, mode, hw, hh, nudge) {
    let hitX = false, hitY = false;
    if (dx) {
      const nx = e.x + dx;
      if (!boxHits(nx, e.y, hw, hh, mode)) e.x = nx;
      else {
        hitX = true;
        let ok = false;
        if (nudge && !dy) {
          for (let n = 1; n <= 6 && !ok; n++) for (const s of [1, -1]) {
            if (!ok && !boxHits(nx, e.y + s * n, hw, hh, mode) && !boxHits(e.x, e.y + s * n, hw, hh, mode)) { e.y += s * Math.min(n, 1.2); ok = true; }
          }
        }
        const st = Math.sign(dx) * 0.25;
        for (let k = 0; k < 16 && !boxHits(e.x + st, e.y, hw, hh, mode); k++) e.x += st;
      }
    }
    if (dy) {
      const ny = e.y + dy;
      if (!boxHits(e.x, ny, hw, hh, mode)) e.y = ny;
      else {
        hitY = true;
        let ok = false;
        if (nudge && !dx) {
          for (let n = 1; n <= 6 && !ok; n++) for (const s of [1, -1]) {
            if (!ok && !boxHits(e.x + s * n, ny, hw, hh, mode) && !boxHits(e.x + s * n, e.y, hw, hh, mode)) { e.x += s * Math.min(n, 1.2); ok = true; }
          }
        }
        const st = Math.sign(dy) * 0.25;
        for (let k = 0; k < 16 && !boxHits(e.x, e.y + st, hw, hh, mode); k++) e.y += st;
      }
    }
    return { hitX, hitY };
  }
  // Linha de visão entre dois pontos (amostrando a cada meia casa).
  function los(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by), n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) {
      const x = lerp(ax, bx, i / n), y = lerp(ay, by, i / n);
      if (blocked(Math.floor(x / T), Math.floor(y / T), 3)) return false;
    }
    return true;
  }

  /* ---------- efeitos ---------- */
  function burst(x, y, n, colors, sp = 70, life = 0.5, size = 2, grav = 0) {
    for (let i = 0; i < n && particles.length < MAX_PART; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, color: pick(colors), size, grav });
    }
  }
  const popup = (x, y, text, color = '#ffffff') => popups.push({ x, y, text, color, t: 1 });
  function addScore(n, x, y, color = '#ffd400') { score += n; if (x !== undefined) popup(x, y - 10, String(n), color); }
  const say = (text, t = 2.2, color = '#ffffff') => { msg = { text, t, color }; };

  /* ---------- dano, quedas e cura ---------- */
  function hurtPlayer(d, sx, sy, kb = 150) {
    if (state !== 'play' || invulnerable()) return false;
    const p = player;
    d *= dmgMul();
    inv.hp -= d;
    L.damaged = true;
    p.inv = HURT_INV;
    const a = Math.atan2(p.y - sy, p.x - sx);
    p.kbx = Math.cos(a) * kb; p.kby = Math.sin(a) * kb;
    p.atk = 0; p.atkBuf = 0;
    shake = Math.max(shake, 0.35); flash = 0.25;
    S.hurt();
    burst(p.x, p.y - 6, 10, ['#ff3b5c', '#ffffff', '#ff9ab8'], 80, 0.4);
    if (inv.hp <= 0) { inv.hp = 0; killPlayer(); }
    return true;
  }
  function heal(halves) {
    const before = inv.hp;
    inv.hp = Math.min(inv.maxHearts * 2, inv.hp + halves);
    if (inv.hp > before) { S.heal(); burst(player.x, player.y - 8, 10, ['#ff3b5c', '#ffb0c0', '#ffffff'], 40, 0.6); }
  }
  function startFall(why) {
    const p = player;
    if (p.falling > 0 || p.dead) return;
    p.falling = 0.55; p.roll = 0; p.atk = 0; p.fallWhy = why;
    if (why === 'agua') { S.splash(); burst(p.x, p.y, 14, ['#3ab8ff', '#d6fdff', '#155a8a'], 60, 0.5); }
    else if (why === 'lava') { S.fire(); burst(p.x, p.y, 16, ['#ff7a1a', '#ffd400', '#ff3b5c'], 70, 0.6); }
    else S.fall();
  }
  function endFall() {
    const p = player;
    p.x = p.safeX; p.y = p.safeY; p.kbx = p.kby = 0;
    const d = FALL_DMG * dmgMul();
    inv.hp -= d; L.damaged = true;
    S.hurt(); flash = 0.2;
    p.inv = 1.3;
    if (inv.hp <= 0) { inv.hp = 0; killPlayer(); }
  }
  function killPlayer() {
    const p = player;
    if (p.dead) return;
    p.dead = true; p.roll = 0; p.atk = 0;
    state = 'dying'; stateT = 0;
    Sfx.lose();
    shake = 0.6;
    burst(p.x, p.y - 6, 30, ['#b26bff', '#ff3b5c', '#ffffff', '#00e5ff'], 110, 0.9);
  }

  /* ---------- golpe, rolamento e itens ---------- */
  const facAng = () => Math.atan2(player.fy, player.fx);
  function startSwing() {
    const p = player;
    if (p.dead || p.falling > 0) return;
    if (p.roll > 0 || p.atkRec > 0 || p.atk > 0) { p.atkBuf = 0.22; return; }
    const n = p.comboT > 0 && p.atkN < 3 ? p.atkN + 1 : 1;
    p.atkN = n; p.atk = p.atkMax = n === 3 ? SPIN_T : SWING_T; p.hitSet = new Set(); p.comboT = 0; p.atkBuf = 0;
    p.atkAng = facAng();
    if (n === 3) S.spin(); else S.swing(n);
  }
  function swingHits() {
    const p = player;
    const prog = 1 - p.atk / p.atkMax;
    if (prog < 0.15 || prog > 0.9) return;
    const spin = p.atkN === 3;
    const reach = spin ? 23 : REACH;
    const dmg = [0, 2, 3, 4][inv.facao] * (spin ? 2 : 1) * (codes.has('FACAO') ? 3 : 1);
    const cx = p.x, cy = p.y - 5;
    const inArc = (x, y, r) => {
      const d = dist(cx, cy, x, y);
      if (d > reach + r) return false;
      return spin || d < r + 4 || Math.abs(angDiff(p.atkAng, Math.atan2(y - cy, x - cx))) < 1.35;
    };
    for (const e of L.enemies) {
      if (e.dead || p.hitSet.has(e) || !e.hittable()) continue;
      if (inArc(e.x, e.y - e.r * 0.5, e.r)) { p.hitSet.add(e); hitEnemy(e, dmg, cx, cy); }
    }
    for (const b of L.bosses) {
      if (b.dead || !b.active || p.hitSet.has(b)) continue;
      for (const part of b.parts()) {
        if (inArc(part.x, part.y, part.r)) { p.hitSet.add(b); hitBoss(b, dmg, part, 'facao'); break; }
      }
    }
    // projéteis pequenos são rebatidos pelo facão
    for (const s of shots) {
      if (s.owner === 'enemy' && s.small && !s.dead && inArc(s.x, s.y, 3)) { s.dead = true; S.tink(); burst(s.x, s.y, 5, ['#ffffff', '#00e5ff'], 60, 0.25); addScore(5); }
    }
    // capim e alavancas
    const a0 = spin ? 0 : p.atkAng - 1.1, a1 = spin ? TAU : p.atkAng + 1.1;
    for (let a = a0; a <= a1 + 0.01; a += spin ? 0.5 : 0.55) {
      for (const rr of [8, 17]) {
        const tx = Math.floor((cx + Math.cos(a) * rr) / T), ty = Math.floor((cy + 3 + Math.sin(a) * rr) / T);
        const c = tileAt(tx, ty);
        if (c === '"') cutGrass(tx, ty);
        else if (c === '=') pullLever(tx, ty);
      }
    }
  }
  function cutGrass(tx, ty) {
    setTile(tx, ty, '.'); repaint(tx, ty);
    burst(tx * T + 8, ty * T + 8, 10, ['#3f8a2a', '#7dff3a', '#2f6a20'], 60, 0.5);
    tone(800, 0.04, 'triangle', 0.03, 400);
    const r = Math.random();
    if (r < 0.12) L.items.push({ type: 'coin', x: tx * T + 8, y: ty * T + 8, drop: 0.3 });
    else if (r < 0.15) L.items.push({ type: 'potion', x: tx * T + 8, y: ty * T + 8, drop: 0.3 });
  }
  let leverCd = 0;
  function pullLever(tx, ty) {
    if (leverCd > 0) return;
    leverCd = 0.5;
    L.gatesOpen = !L.gatesOpen;
    L.leverOn = L.gatesOpen;
    S.lever(); S.gate();
    burst(tx * T + 8, ty * T + 6, 8, ['#ffd400', '#ffffff'], 50, 0.3);
    say(L.gatesOpen ? 'UM PORTÃO SE ABRIU EM ALGUM LUGAR!' : 'UM PORTÃO SE FECHOU...', 2);
  }
  function startRoll() {
    const p = player;
    if (p.roll > 0 || p.rollCd > 0 || p.dead || p.falling > 0) return;
    if (tileAt(Math.floor(p.x / T), Math.floor(p.y / T)) === '~') { say('NA ÁGUA NÃO DÁ PARA ROLAR!', 1.2); return; }
    let dx = inp.mx, dy = inp.my;
    if (Math.hypot(dx, dy) < 0.2) { dx = p.fx; dy = p.fy; }
    const m = Math.hypot(dx, dy) || 1;
    p.rdx = dx / m; p.rdy = dy / m;
    p.roll = ROLL_T; p.rollInv = ROLL_INV; p.atk = 0; p.atkBuf = 0; p.comboT = 0;
    S.roll();
  }
  function useItem() {
    const p = player;
    if (p.dead || p.falling > 0 || p.roll > 0 || p.itemCd > 0) return;
    const it = inv.item;
    if (!ownedItems().includes(it)) { say('VOCÊ AINDA NÃO TEM NENHUM ITEM.', 1.4); return; }
    if (it === 'bombas') {
      if (inv.bombs <= 0) { S.nope(); say('SEM BOMBAS!', 1); return; }
      if (bombs.length >= 3) return;
      inv.bombs--;
      bombs.push({ x: p.x + p.fx * 6, y: p.y + p.fy * 4, t: 1.6 });
      p.itemCd = 0.25;
      S.bombSet();
    } else if (it === 'bodoque') {
      if (inv.pedras <= 0) { S.nope(); say('SEM PEDRINHAS!', 1); return; }
      inv.pedras--;
      const a = facAng();
      shots.push({ owner: 'player', kind: 'pellet', x: p.x + Math.cos(a) * 6, y: p.y - 6 + Math.sin(a) * 6, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 2, dmg: 1, life: 1.2 });
      p.itemCd = 0.32;
      S.pellet();
    } else if (it === 'sal') {
      if (inv.sal <= 0) { S.nope(); say('ACABOU O SAL!', 1); return; }
      inv.sal--;
      p.itemCd = 0.6;
      S.salt();
      const a = facAng(), cx = p.x, cy = p.y - 5;
      for (let i = 0; i < 26 && particles.length < MAX_PART; i++) {
        const aa = a + rand(-0.6, 0.6), v = rand(60, 150);
        particles.push({ x: cx, y: cy, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v, life: 0.35, max: 0.35, color: pick(['#ffffff', '#e8e8f0', '#b26bff']), size: 2, grav: 0 });
      }
      for (const e of L.enemies) {
        if (e.dead) continue;
        const d = dist(cx, cy, e.x, e.y - 4);
        if (d < 44 && Math.abs(angDiff(a, Math.atan2(e.y - 4 - cy, e.x - cx))) < 0.75) {
          e.stun = Math.max(e.stun, 2.5);
          if (e.type === 'e') { e.st = 'up'; e.t = 1.6; }
          hitEnemy(e, 'sdel'.includes(e.type) ? 6 : 1, cx, cy, true);
        }
      }
      for (const b of L.bosses) {
        if (!b.active || b.dead) continue;
        const pp = b.parts()[0];
        if (dist(cx, cy, pp.x, pp.y) < 44 + pp.r && Math.abs(angDiff(a, Math.atan2(pp.y - cy, pp.x - cx))) < 0.8) b.salt();
      }
    }
  }
  function swapItem() {
    const own = ownedItems();
    if (own.length < 2) return;
    inv.item = own[(own.indexOf(inv.item) + 1) % own.length];
    tone(660, 0.05, 'square', 0.05); tone(990, 0.05, 'square', 0.05, null, 0.05);
  }

  /* ---------- bombas ---------- */
  function explode(x, y) {
    S.boom();
    shake = Math.max(shake, 0.55);
    fxs.push({ kind: 'boom', x, y, t: 0.35, max: 0.35 });
    burst(x, y, 34, ['#ffd400', '#ff7a1a', '#ff3b5c', '#ffffff'], 140, 0.6, 3);
    const R = 26;
    for (const e of L.enemies) if (!e.dead && dist(x, y, e.x, e.y - 4) < R + e.r) { if (e.type === 'e' && e.st !== 'up') { e.st = 'up'; e.t = 1.6; } hitEnemy(e, 6, x, y); }
    for (const b of L.bosses) if (b.active && !b.dead) { for (const pp of b.parts()) if (dist(x, y, pp.x, pp.y) < R + pp.r) { hitBoss(b, 6, pp, 'bomba'); break; } }
    if (dist(x, y, player.x, player.y - 4) < R) hurtPlayer(2, x, y, 190);
    const tx0 = Math.floor((x - R) / T), tx1 = Math.floor((x + R) / T), ty0 = Math.floor((y - R) / T), ty1 = Math.floor((y + R) / T);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const c = tileAt(tx, ty);
      if (dist(x, y, tx * T + 8, ty * T + 8) > R + 4) continue;
      if (c === '%') breakWall(tx, ty);
      else if (c === '"') cutGrass(tx, ty);
    }
  }
  function breakWall(tx, ty) {
    const cl = L.cluster[ty * L.W + tx];
    setTile(tx, ty, '.'); repaint(tx, ty);
    burst(tx * T + 8, ty * T + 8, 18, ['#9a8ab0', '#5a4a70', '#ffffff'], 90, 0.6, 3);
    if (cl >= 0 && !L.found.has(cl)) {
      L.found.add(cl); L.secrets++;
      S.secret();
      say('PASSAGEM SECRETA!', 2.5, '#ffd400');
    }
  }
  function updateBombs(dt) {
    for (const b of bombs) {
      b.t -= dt;
      if (Math.random() < 0.5) particles.length < MAX_PART && particles.push({ x: b.x + 1, y: b.y - 8, vx: rand(-15, 15), vy: rand(-40, -10), life: 0.25, max: 0.25, color: pick(['#ffd400', '#ff7a1a']), size: 1, grav: 0 });
      if (((b.t * 8) | 0) !== (((b.t + dt) * 8) | 0)) S.fuse();
      if (b.t <= 0) { b.dead = true; explode(b.x, b.y - 4); }
    }
    bombs = bombs.filter(b => !b.dead);
  }

  /* ---------- armadilhas: ciclos ---------- */
  function spikeState(x, y) {
    const ph = L.def.ritmo === 'onda' ? (x * 0.2 + y * 0.07) % 2.4 : 0;
    const t = (L.time + 24 - ph) % 2.4;
    return t < 1.2 ? 0 : t < 1.6 ? 1 : 2;
  }
  function brasaState(x, y) {
    const ph = L.def.ritmo === 'onda' ? ((x + y) * 0.25) % 3.2 : ((x + y) % 2) * 1.6;
    const t = (L.time + 32 - ph) % 3.2;
    return t < 1.6 ? 0 : t < 2.4 ? 1 : 2;
  }
  // bico de fogo: 0 parado, 1 chiando (aviso), 2 cuspindo fogo
  function jetState(e) { const t = (L.time + 30 - e.ph) % 3; return t < 1.6 ? 0 : t < 2.2 ? 1 : 2; }
  function arrowWarn(e) { const t = (L.time + 24 - e.ph) % 2.4; return t > 2.0; }
  function updateEmitters() {
    const p = player;
    for (const e of L.emit) {
      if (e.kind === 'T') {
        const t = (L.time + 24 - e.ph) % 2.4;
        const fire = t < 0.1;
        if (fire && !e.fired) {
          e.fired = true;
          const sx = e.x * T + 8 + e.dx * 9, sy = e.y * T + 8 + e.dy * 9;
          if (dist(sx, sy, p.x, p.y) < 15 * T) {
            shots.push({ owner: 'enemy', kind: 'arrow', x: sx, y: sy, vx: e.dx * 150, vy: e.dy * 150, r: 2.5, dmg: 1, life: 4, small: true });
            if (dist(sx, sy, p.x, p.y) < 8 * T) S.arrow();
          }
        } else if (!fire) e.fired = false;
      } else {
        const st = jetState(e);
        if (st !== e.last) {
          e.last = st;
          const near = dist(e.x * T, e.y * T, p.x, p.y) < 7 * T;
          if (near && st === 1) S.hiss();
          if (near && st === 2) S.fire();
        }
        if (st === 2) {
          const x0 = e.x * T + 8 + e.dx * 8, y0 = e.y * T + 8 + e.dy * 8;
          const x1 = x0 + e.dx * e.len * T, y1 = y0 + e.dy * e.len * T;
          const bx0 = Math.min(x0, x1) - (e.dx ? 0 : 6), bx1 = Math.max(x0, x1) + (e.dx ? 0 : 6);
          const by0 = Math.min(y0, y1) - (e.dy ? 0 : 6), by1 = Math.max(y0, y1) + (e.dy ? 0 : 6);
          if (p.x + 5 > bx0 && p.x - 5 < bx1 && p.y + 4 > by0 && p.y - 10 < by1) hurtPlayer(2, p.x - e.dx * 8, p.y - e.dy * 8);
          for (const en of L.enemies) if (!en.dead && en.x > bx0 && en.x < bx1 && en.y > by0 && en.y < by1 && Math.random() < 0.1) hitEnemy(en, 1, en.x - e.dx, en.y - e.dy, true);
          if (Math.random() < 0.6 && particles.length < MAX_PART) {
            const k = Math.random();
            particles.push({ x: lerp(x0, x1, k) + rand(-3, 3), y: lerp(y0, y1, k) + rand(-3, 3), vx: e.dx * 40 + rand(-10, 10), vy: e.dy * 40 - 20, life: 0.3, max: 0.3, color: pick(['#ffd400', '#ff7a1a', '#ff3b5c']), size: 2, grav: 0 });
          }
        }
      }
    }
  }
  function updateCrumbs(dt) {
    for (const [i, c] of L.crumb) {
      if (c.shake > 0) {
        c.shake -= dt;
        if (c.shake <= 0) { c.gone = 3.5; S.crumble(); burst((i % L.W) * T + 8, ((i / L.W) | 0) * T + 8, 8, ['#5a4a3a', '#3a2a1a', '#7a6a5a'], 40, 0.5, 2, 120); }
      } else if (c.gone > 0) {
        c.gone -= dt;
        if (c.gone <= 0) L.crumb.delete(i);
      }
    }
  }
  function updateBoulders(dt) {
    const p = player;
    for (const b of L.boulders) {
      if (b.state === 'rest') {
        const tx = Math.floor(b.x / T), ty = Math.floor(b.y / T);
        const ptx = Math.floor(p.x / T), pty = Math.floor(p.y / T);
        if ((ptx === tx || pty === ty) && dist(b.x, b.y, p.x, p.y) < 12 * T && !p.dead && los(b.x, b.y, p.x, p.y)) {
          b.state = 'shake'; b.t = 0.55;
          if (ptx === tx) { b.dx = 0; b.dy = Math.sign(p.y - b.y); } else { b.dx = Math.sign(p.x - b.x); b.dy = 0; }
          S.rumble();
        }
      } else if (b.state === 'shake') {
        b.t -= dt;
        if (b.t <= 0) { b.state = 'roll'; b.rot = 0; }
      } else if (b.state === 'roll') {
        const sp = 165 * dt;
        b.rot = (b.rot || 0) + sp / 7;
        const nx = b.x + b.dx * sp, ny = b.y + b.dy * sp;
        const ftx = Math.floor((nx + b.dx * 7) / T), fty = Math.floor((ny + b.dy * 7) / T);
        if (blocked(ftx, fty, 3)) {
          b.state = 'gone';
          S.stomp(); shake = Math.max(shake, 0.3);
          burst(b.x, b.y, 22, ['#7a6a5a', '#5a4a3a', '#a89a8a'], 90, 0.7, 3, 100);
          continue;
        }
        b.x = nx; b.y = ny;
        if (Math.abs(p.x - b.x) < 12 && Math.abs(p.y - 4 - b.y) < 11) hurtPlayer(2, b.x, b.y, 200);
        for (const e of L.enemies) if (!e.dead && dist(e.x, e.y - 4, b.x, b.y) < 9 + e.r) hitEnemy(e, 20, b.x, b.y);
        if (Math.random() < 0.3) burst(b.x - b.dx * 6, b.y + 6, 1, ['#7a6a5a'], 20, 0.3);
      }
    }
  }

  /* =====================================================================
     INIMIGOS
     ===================================================================== */
  const EN = {
    r: { hp: 2, r: 5, dmg: 1, pts: 10, speed: 58, nome: 'RATO' },
    b: { hp: 2, r: 5, dmg: 1, pts: 15, speed: 52, fly: true, nome: 'MORCEGO' },
    a: { hp: 6, r: 6, dmg: 1, pts: 30, speed: 34, nome: 'CARANGUEJEIRA' },
    c: { hp: 4, r: 6, dmg: 1, pts: 25, speed: 0, nome: 'SAPO-CURURU' },
    z: { hp: 8, r: 6, dmg: 1, pts: 40, speed: 32, nome: 'ESQUELETO DE BANDEIRANTE' },
    q: { hp: 6, r: 6, dmg: 1, pts: 50, speed: 28, nome: 'BANDEIRANTE ARCABUZEIRO' },
    h: { hp: 8, r: 7, dmg: 2, pts: 45, speed: 30, nome: 'QUEIXADA DA CAIPORA' },
    e: { hp: 10, r: 6, dmg: 2, pts: 60, speed: 42, nome: 'CORPO-SECO' },
    l: { hp: 14, r: 7, dmg: 2, pts: 100, speed: 56, nome: 'LOBISOMEM' },
    d: { hp: 4, r: 5, dmg: 1, pts: 35, speed: 30, fly: true, nome: 'FOGO-FÁTUO' },
    s: { hp: 6, r: 5, dmg: 1, pts: 60, speed: 62, nome: 'SACI' },
  };
  function newEnemy(type, x, y) {
    const d = EN[type];
    const e = {
      type, x, y: y + 3, hx: x, hy: y + 3, vx: 0, vy: 0, hp: d.hp, max: d.hp, r: d.r, dmg: d.dmg, pts: d.pts, speed: d.speed, fly: !!d.fly,
      st: type === 'e' ? 'under' : 'idle', t: rand(0.3, 1.5), cd: rand(1, 2.5), flash: 0, stun: 0, kbx: 0, kby: 0, awake: false, dead: false,
      dir: 1, anim: Math.random() * 3, ang: 0, tel: 0, loot: null, wx: 0, wy: 0, hop: 0, howled: false,
    };
    e.hittable = () => e.type !== 'e' || e.st === 'up' || e.st === 'rise' || e.st === 'dig';
    return e;
  }
  function chaseAng(e) {
    const p = player;
    const direct = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.fly) return direct;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d < 40 && los(e.x, e.y - 3, p.x, p.y - 3)) return direct;
    const W = L.W, tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
    const here = L.flow[ty * W + tx];
    if (here < 0) return direct;
    let best = here, bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= L.H) continue;
      const v = L.flow[ny * W + nx];
      if (v < 0 || v >= best) continue;
      if (dx && dy && (blocked(tx + dx, ty, 1) || blocked(tx, ty + dy, 1))) continue;
      best = v; bx = dx; by = dy;
    }
    if (!bx && !by) return direct;
    return Math.atan2((ty + by) * T + 8 - e.y, (tx + bx) * T + 8 - e.x);
  }
  const moveEnemy = (e, ang, sp, dt) => moveBox(e, Math.cos(ang) * sp * dt, Math.sin(ang) * sp * dt, e.fly ? 2 : 1, e.r * 0.8, e.r * 0.6, true);
  function hitEnemy(e, dmg, sx, sy, quiet) {
    if (e.dead || !e.hittable()) return;
    e.hp -= dmg; e.flash = 0.12; e.awake = true;
    const a = Math.atan2(e.y - sy, e.x - sx), kb = e.type === 'h' || e.type === 'l' ? 70 : 150;
    e.kbx = Math.cos(a) * kb; e.kby = Math.sin(a) * kb;
    if ('rbdas'.includes(e.type) && (e.st === 'prep' || e.st === 'dash')) { e.st = 'chase'; e.cd = 0.9; e.tel = 0; }
    if (!quiet) S.hit();
    burst(e.x, e.y - 5, 6, e.type === 'd' ? ['#5affdc', '#ffffff'] : ['#ffffff', '#ff3b5c', '#ffd400'], 70, 0.3);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.dead = true;
    addScore(e.pts, e.x, e.y - 8);
    L.kills++; L.killPts += e.pts;
    S.kill();
    const col = { r: '#8a8096', b: '#4a2a66', a: '#4a2e1e', c: '#5a6a2a', z: '#e8e0c8', q: '#e8e0c8', h: '#4e3a2e', e: '#8a7a62', l: '#5c566c', d: '#5affdc', s: '#ff2b4a' }[e.type];
    burst(e.x, e.y - 5, 16, [col, '#ffffff', '#b26bff'], 90, 0.6, 2);
    if (e.loot) L.items.push({ type: 'sack', x: e.x, y: e.y, loot: e.loot, drop: 0.3 });
    if (e.summoned) return;
    const r = Math.random();
    if (r < 0.32) L.items.push({ type: 'coin', x: e.x, y: e.y, drop: 0.3 });
    else if (r < (pes() ? 0.34 : 0.37)) L.items.push({ type: 'potion', x: e.x, y: e.y, drop: 0.3 });
    else if (r < 0.41 && inv.hasBombs) L.items.push({ type: 'pack', x: e.x, y: e.y, drop: 0.3 });
  }
  function enemyShoot(e, kind, ang, sp, extra = {}) {
    shots.push(Object.assign({ owner: 'enemy', kind, x: e.x + Math.cos(ang) * 6, y: e.y - 6 + Math.sin(ang) * 6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 3, dmg: 1, life: 4, small: true }, extra));
  }
  // Ponto de chão aleatório a uma certa distância (em casas) do herói.
  function spotNear(dmin, dmax, inArena) {
    for (let k = 0; k < 80; k++) {
      const a = Math.random() * TAU, d = rand(dmin, dmax) * T;
      const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (blocked(tx, ty, 1)) continue;
      if (inArena && L.arena && !L.arena[ty * L.W + tx]) continue;
      if (holeAt(tx, ty)) continue;
      return { x: tx * T + 8, y: ty * T + 10 };
    }
    return null;
  }

  function updateEnemy(e, dt) {
    const p = player;
    e.anim += dt; e.flash -= dt; e.tel = Math.max(0, e.tel - dt);
    if (Math.abs(e.kbx) + Math.abs(e.kby) > 4) {
      moveBox(e, e.kbx * dt, e.kby * dt, e.fly ? 2 : 1, e.r * 0.8, e.r * 0.6, false);
      e.kbx *= 1 - Math.min(1, dt * 9); e.kby *= 1 - Math.min(1, dt * 9);
    }
    if (e.stun > 0) { e.stun -= dt; return; }
    const d = dist(e.x, e.y, p.x, p.y);
    const ang = Math.atan2(p.y - e.y, p.x - e.x);
    if (!e.awake && !p.dead && d < 7 * T && (los(e.x, e.y - 3, p.x, p.y - 3) || d < 3 * T)) {
      e.awake = true;
      if (e.type === 'l' && !e.howled) { e.howled = true; S.howl(); }
      if (e.type === 's') S.whistle();
      if (e.st === 'idle') e.st = 'chase';
    }
    if (e.awake && d > 18 * T) { e.awake = false; e.st = e.type === 'e' ? 'under' : 'idle'; }
    if (Math.abs(Math.cos(ang)) > 0.2 && e.st !== 'dash' && e.st !== 'leap' && e.st !== 'charge' && e.st !== 'lunge') e.dir = Math.cos(ang) < 0 ? -1 : 1;
    const ps = pes() ? 1.1 : 1;
    const tel = (st, t) => { e.st = st; e.t = t / ps; e.tel = t / ps; };
    let harmful = true;
    switch (e.type) {
      case 'r': case 'b': case 'd': {
        if (e.st === 'idle') {
          e.t -= dt;
          if (e.t <= 0) { e.t = rand(0.8, 2); e.ang = Math.random() * TAU; }
          if (e.fly) { e.x = e.hx + Math.sin(e.anim * 1.3) * 10; e.y = e.hy + Math.sin(e.anim * 2.1) * 5; }
          else moveEnemy(e, e.ang, 18, dt);
        } else if (e.st === 'chase') {
          e.cd -= dt;
          let a = chaseAng(e);
          if (e.fly) a += Math.sin(e.anim * 3) * 0.9;
          moveEnemy(e, a, e.speed * ps, dt);
          if (e.cd <= 0 && d < (e.type === 'r' ? 4 : 5) * T && los(e.x, e.y - 3, p.x, p.y - 3)) {
            tel('prep', e.type === 'r' ? 0.3 : e.type === 'b' ? 0.42 : 0.5);
            e.ang = ang;
            if (e.type === 'r') S.squeak(); else if (e.type === 'b') S.bat(); else tone(500, 0.3, 'sine', 0.04, 1200);
          }
        } else if (e.st === 'prep') {
          e.t -= dt;
          if (e.t > 0.12) e.ang = ang;
          if (e.t <= 0) { e.st = 'dash'; e.t = e.type === 'r' ? 0.28 : 0.38; }
        } else if (e.st === 'dash') {
          e.t -= dt;
          const h = moveEnemy(e, e.ang, e.type === 'r' ? 135 : 148, dt);
          if (e.t <= 0 || h.hitX || h.hitY) { e.st = e.fly ? 'back' : 'chase'; e.t = 0.5; e.cd = rand(1.3, 2.4); }
        } else if (e.st === 'back') {
          e.t -= dt; moveEnemy(e, ang + Math.PI, 60, dt);
          if (e.t <= 0) e.st = 'chase';
        }
        break;
      }
      case 'a': {
        if (e.st === 'idle') { if (e.awake) e.st = 'chase'; }
        else if (e.st === 'chase') {
          e.cd -= dt;
          moveEnemy(e, chaseAng(e), e.speed * ps, dt);
          if (e.cd <= 0 && d < 3.3 * T && los(e.x, e.y - 3, p.x, p.y - 3)) { tel('prep', 0.55); e.wx = p.x; e.wy = p.y; tone(220, 0.4, 'sawtooth', 0.03, 440); }
        } else if (e.st === 'prep') {
          e.t -= dt; if (e.t > 0.15) { e.wx = p.x; e.wy = p.y; }
          if (e.t <= 0) { e.st = 'leap'; e.t = 0.38; e.ang = Math.atan2(e.wy - e.y, e.wx - e.x); }
        } else if (e.st === 'leap') {
          e.t -= dt;
          const h = moveEnemy(e, e.ang, 185, dt);
          if (e.t <= 0 || h.hitX || h.hitY || dist(e.x, e.y, e.wx, e.wy) < 4) { e.st = 'rest'; e.t = 0.8; }
        } else if (e.st === 'rest') { e.t -= dt; if (e.t <= 0) { e.st = 'chase'; e.cd = 1.4; } }
        break;
      }
      case 'c': {
        e.cd -= dt;
        if (e.st === 'prep') {
          e.t -= dt;
          if (e.t <= 0) { e.st = 'idle'; e.t = 0.8; e.cd = 2.6; enemyShoot(e, 'poison', ang, pes() ? 115 : 95); tone(300, 0.1, 'square', 0.05, 150); }
          break;
        }
        e.t -= dt;
        if (e.hop > 0) { e.hop -= dt; moveEnemy(e, e.ang, 50, dt); }
        else if (e.t <= 0) {
          e.t = rand(0.9, 1.4); e.hop = 0.25;
          e.ang = e.awake && d > 4 * T ? chaseAng(e) + rand(-0.6, 0.6) : Math.random() * TAU;
        }
        if (e.awake && e.cd <= 0 && e.hop <= 0 && d < 7 * T && los(e.x, e.y - 4, p.x, p.y - 4)) { tel('prep', 0.6); S.frog(); }
        break;
      }
      case 'z': {
        if (e.st === 'idle') { if (e.awake) e.st = 'chase'; }
        else if (e.st === 'chase') {
          moveEnemy(e, chaseAng(e), e.speed * ps, dt);
          if (d < 24 && !p.dead) { tel('prep', 0.5); e.ang = ang; tone(180, 0.2, 'square', 0.04, 260); }
        } else if (e.st === 'prep') {
          e.t -= dt; if (e.t > 0.15) e.ang = ang;
          if (e.t <= 0) {
            e.st = 'slash'; e.t = 0.16; S.swing(1);
            const hx = e.x + Math.cos(e.ang) * 10, hy = e.y - 4 + Math.sin(e.ang) * 10;
            fxs.push({ kind: 'eslash', x: e.x, y: e.y - 5, a: e.ang, t: 0.16, max: 0.16 });
            if (dist(hx, hy, p.x, p.y - 4) < 17) hurtPlayer(2, e.x, e.y);
          }
        } else if (e.st === 'slash') { e.t -= dt; if (e.t <= 0) { e.st = 'rest'; e.t = 0.6; } }
        else if (e.st === 'rest') { e.t -= dt; if (e.t <= 0) e.st = 'chase'; }
        break;
      }
      case 'q': {
        if (e.st === 'idle') { if (e.awake) e.st = 'chase'; break; }
        e.cd -= dt;
        if (e.st === 'chase') {
          if (d < 3.5 * T) moveEnemy(e, ang + Math.PI, e.speed, dt);
          else if (d > 6.5 * T) moveEnemy(e, chaseAng(e), e.speed, dt);
          else moveEnemy(e, ang + Math.PI / 2 * (Math.sin(e.anim * 0.7) > 0 ? 1 : -1), 16, dt);
          if (e.cd <= 0 && d < 9 * T && los(e.x, e.y - 6, p.x, p.y - 4)) { tel('aim', 0.95); e.ang = ang; S.aim(); }
        } else if (e.st === 'aim') {
          e.t -= dt; if (e.t > 0.3) e.ang = Math.atan2(p.y - 4 - (e.y - 6), p.x - e.x);
          if (e.t <= 0) { e.st = 'chase'; e.cd = rand(2.5, 3.2); enemyShoot(e, 'bullet', e.ang, pes() ? 240 : 210, { dmg: 2, r: 2.5 }); S.shot(); burst(e.x + Math.cos(e.ang) * 8, e.y - 6 + Math.sin(e.ang) * 8, 8, ['#ffd400', '#ffffff', '#7a7a8a'], 60, 0.3); }
        }
        break;
      }
      case 'h': {
        e.cd -= dt;
        if (e.st === 'idle' || e.st === 'chase') {
          e.t -= dt;
          if (e.t <= 0) { e.t = rand(0.8, 1.6); e.ang = e.awake ? chaseAng(e) + rand(-0.5, 0.5) : Math.random() * TAU; }
          moveEnemy(e, e.ang, e.awake ? 30 : 14, dt);
          if (e.awake && e.cd <= 0 && d < 8 * T && los(e.x, e.y - 4, p.x, p.y - 4)) { tel('prep', 0.65); e.ang = ang; S.growl(); }
        } else if (e.st === 'prep') {
          e.t -= dt; if (e.t > 0.2) e.ang = ang;
          if (Math.random() < 0.4) burst(e.x - e.dir * 6, e.y, 1, ['#7a6a5a'], 30, 0.3);
          if (e.t <= 0) { e.st = 'charge'; e.t = 1.4; e.dir = Math.cos(e.ang) < 0 ? -1 : 1; }
        } else if (e.st === 'charge') {
          e.t -= dt;
          const h = moveEnemy(e, e.ang, 165 * ps, dt);
          if (h.hitX || h.hitY) { e.st = 'stun'; e.t = 1.2; S.stomp(); burst(e.x, e.y - 6, 10, ['#ffd400', '#ffffff'], 60, 0.4); }
          else if (e.t <= 0) { e.st = 'chase'; e.cd = 1.5; }
        } else if (e.st === 'stun') { e.t -= dt; if (e.t <= 0) { e.st = 'chase'; e.cd = 1.6; } }
        break;
      }
      case 'e': {
        if (e.st === 'under') {
          harmful = false;
          e.cd -= dt;
          if (e.awake) moveEnemy(e, chaseAng(e), e.speed * ps, dt);
          if (e.awake && e.cd <= 0 && d < 22 && !p.dead) { e.st = 'rise'; e.t = 0.6 / ps; e.tel = e.t; warns.push({ kind: 'circle', x: e.x, y: e.y, r: 16, t: e.t, max: e.t, color: '#ffcc33' }); noise(0.5, 0.08, 500, 0, 'lowpass', 80); }
        } else if (e.st === 'rise') {
          harmful = false;
          e.t -= dt;
          if (e.t <= 0) { e.st = 'up'; e.t = 1.8; S.growl(); if (dist(e.x, e.y, p.x, p.y) < 18) hurtPlayer(2, e.x, e.y); burst(e.x, e.y, 10, ['#4e3a24', '#8a7a62'], 60, 0.5); }
        } else if (e.st === 'up') {
          e.t -= dt; moveEnemy(e, chaseAng(e), 22, dt);
          if (e.t <= 0) { e.st = 'dig'; e.t = 0.5; }
        } else if (e.st === 'dig') {
          e.t -= dt; if (e.t <= 0) { e.st = 'under'; e.cd = 1.2; }
        }
        break;
      }
      case 'l': {
        if (e.st === 'idle') { if (e.awake) e.st = 'chase'; break; }
        e.cd -= dt;
        if (e.st === 'chase') {
          moveEnemy(e, chaseAng(e), e.speed * ps, dt);
          const see = los(e.x, e.y - 5, p.x, p.y - 5);
          if (e.cd <= 0 && d < 22 && see) { tel('prep2', 0.38); e.ang = ang; S.growl(); }
          else if (e.cd <= 0 && d > 26 && d < 4.2 * T && see) { tel('prep', 0.45); e.wx = p.x; e.wy = p.y; S.growl(); }
        } else if (e.st === 'prep') {
          e.t -= dt; if (e.t > 0.15) { e.wx = p.x; e.wy = p.y; }
          if (e.t <= 0) { e.st = 'lunge'; e.t = 0.32; e.ang = Math.atan2(e.wy - e.y, e.wx - e.x); e.dir = Math.cos(e.ang) < 0 ? -1 : 1; }
        } else if (e.st === 'lunge') {
          e.t -= dt;
          const h = moveEnemy(e, e.ang, 215 * ps, dt);
          if (e.t <= 0 || h.hitX || h.hitY) { e.st = 'rest'; e.t = 0.6; }
        } else if (e.st === 'prep2') {
          e.t -= dt; if (e.t > 0.12) e.ang = ang;
          if (e.t <= 0) {
            e.st = 'rest'; e.t = 0.55; S.swing(2);
            fxs.push({ kind: 'eslash', x: e.x, y: e.y - 6, a: e.ang, t: 0.16, max: 0.16, big: true });
            if (dist(e.x + Math.cos(e.ang) * 10, e.y - 5 + Math.sin(e.ang) * 10, p.x, p.y - 4) < 19) hurtPlayer(2, e.x, e.y, 200);
          }
        } else if (e.st === 'rest') { e.t -= dt; if (e.t <= 0) { e.st = 'chase'; e.cd = rand(0.9, 1.4); } }
        break;
      }
      case 's': {
        if (e.st === 'idle') { if (e.awake) e.st = 'chase'; break; }
        e.cd -= dt;
        if (e.st === 'chase') {
          e.hop += dt * 9;
          if (e.loot) moveEnemy(e, ang + Math.PI, e.speed, dt);
          else moveEnemy(e, chaseAng(e), e.speed * ps * (0.6 + Math.abs(Math.sin(e.hop)) * 0.8), dt);
          if (e.cd <= 0 && e.awake) { e.st = 'swirl'; e.t = 0.55; e.tel = 0.55; S.whistle(); }
          if (!e.loot && d < e.r + 7 && !invulnerable()) steal(e);
        } else if (e.st === 'swirl') {
          harmful = false;
          e.t -= dt;
          if (Math.random() < 0.7) burst(e.x, e.y - 6, 1, ['#c8c8d8', '#ffffff'], 50, 0.3);
          if (e.t <= 0) {
            const sp = e.loot ? spotNear(7, 11, false) : spotNear(1.6, 2.4, false);
            if (sp) { e.x = sp.x; e.y = sp.y; }
            S.teleport(); e.st = 'appear'; e.t = 0.45; e.cd = rand(4.5, 7);
          }
        } else if (e.st === 'appear') { harmful = false; e.t -= dt; if (e.t <= 0) e.st = 'chase'; }
        break;
      }
    }
    // contato
    if (harmful && !p.dead && dist(e.x, e.y - 3, p.x, p.y - 3) < e.r + 5) {
      const heavy = e.st === 'dash' || e.st === 'leap' || e.st === 'charge' || e.st === 'lunge';
      if (e.type !== 's' || e.loot) hurtPlayer(heavy ? Math.max(2, e.dmg) : e.dmg, e.x, e.y);
    }
  }
  // O Saci passa a mão no item atual (ou nas moedas) e some num redemoinho.
  function steal(e) {
    let it = inv.item, n = 0;
    if (ownedItems().includes(it) && itemCount(it) > 0) {
      n = Math.min(3, itemCount(it));
      if (it === 'bombas') inv.bombs -= n; else if (it === 'bodoque') inv.pedras -= n; else inv.sal -= n;
    } else if (inv.coins > 0) { it = 'moedas'; n = Math.min(5, inv.coins); inv.coins -= n; }
    hurtPlayer(1, e.x, e.y, 120);
    if (n) {
      e.loot = { it, n };
      const nome = it === 'moedas' ? 'MOEDAS' : it === 'bombas' ? 'BOMBAS' : it === 'bodoque' ? 'PEDRINHAS' : 'PUNHADOS DE SAL';
      say(`O SACI PASSOU A MÃO EM ${n} ${nome}! PEGUE DE VOLTA!`, 2.6, '#ff2b4a');
    }
    e.st = 'swirl'; e.t = 0.35; S.whistle();
  }

  /* ---------- projéteis ---------- */
  function updateShots(dt) {
    const p = player;
    for (const s of shots) {
      if (s.dead) continue;
      s.life -= dt;
      if (s.kind === 'tornado') {
        const a = Math.atan2(p.y - 4 - s.y, p.x - s.x), cur = Math.atan2(s.vy, s.vx);
        const na = cur + clamp(angDiff(cur, a), -1.2 * dt, 1.2 * dt), sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        if (Math.random() < 0.5) burst(s.x, s.y, 1, ['#c8c8d8', '#ffffff'], 30, 0.3);
      } else if (s.kind === 'spiral') {
        s.a += s.w * dt;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) { s.dead = true; continue; }
      const tx = Math.floor(s.x / T), ty = Math.floor(s.y / T);
      if (s.kind !== 'tornado' && blocked(tx, ty, 3)) {
        if (s.owner === 'player' && tileAt(tx, ty) === '=') pullLever(tx, ty);
        s.dead = true; burst(s.x - s.vx * dt, s.y - s.vy * dt, 4, ['#ffffff', '#c8c8d8'], 40, 0.2);
        if (s.owner === 'player') S.tink();
        continue;
      }
      if (s.owner === 'enemy') {
        if (!p.dead && dist(s.x, s.y, p.x, p.y - 5) < s.r + 5 && !invulnerable()) {
          hurtPlayer(s.dmg, s.x - s.vx, s.y - s.vy, 130);
          s.dead = true;
          if (s.kind === 'tornado') { p.spin = 0.6; stealBombs(2); }
        }
      } else {
        for (const e of L.enemies) {
          if (!e.dead && e.hittable() && dist(s.x, s.y, e.x, e.y - 5) < e.r + s.r + 1) { hitEnemy(e, s.dmg, s.x - s.vx, s.y - s.vy); e.stun = Math.max(e.stun, 0.4); s.dead = true; break; }
        }
        if (!s.dead) for (const b of L.bosses) {
          if (!b.active || b.dead) continue;
          for (const pp of b.parts()) if (dist(s.x, s.y, pp.x, pp.y) < pp.r + 2) { hitBoss(b, s.dmg, pp, 'pedra'); s.dead = true; break; }
          if (s.dead) break;
        }
      }
    }
    shots = shots.filter(s => !s.dead);
  }
  function stealBombs(n) {
    const boss = L.bosses.find(b => b.kind === 'saci');
    const k = Math.min(n, inv.bombs);
    if (!k || !boss) return;
    inv.bombs -= k; boss.loot = (boss.loot || 0) + k;
    say(`O REDEMOINHO LEVOU ${k} BOMBAS! ACERTE O SACI PARA RECUPERAR.`, 2.4, '#ff2b4a');
  }

  /* ---------- itens no chão ---------- */
  function updateItems(dt) {
    const p = player;
    for (const it of L.items) {
      if (it.drop > 0) { it.drop -= dt; continue; }
      if (it.taken || p.dead || p.falling > 0) continue;
      if (dist(it.x, it.y, p.x, p.y - 2) > 11) continue;
      it.taken = true;
      if (it.type === 'coin') { inv.coins++; L.coins++; addScore(PTS.moeda); S.coin(); burst(it.x, it.y, 5, ['#ffd400', '#ffffff'], 40, 0.3); }
      else if (it.type === 'key') { inv.keys++; S.key(); say('PEGOU UMA CHAVE!', 1.4, '#ffd400'); }
      else if (it.type === 'potion') { heal(pes() ? 2 : 4); popup(it.x, it.y - 8, '+♥', '#ff3b5c'); }
      else if (it.type === 'pack') {
        if (!inv.hasBombs) { inv.hasBombs = true; inv.item = 'bombas'; }
        inv.bombs = Math.min(inv.bombCap, inv.bombs + 3); S.coin(); popup(it.x, it.y - 8, '+3 BOMBAS', '#ffd400');
      } else if (it.type === 'sack') {
        const { it: what, n } = it.loot;
        if (what === 'moedas') inv.coins += n; else if (what === 'bombas') inv.bombs = Math.min(inv.bombCap, inv.bombs + n);
        else if (what === 'bodoque') inv.pedras += n; else inv.sal += n;
        S.key(); say('RECUPEROU O QUE O SACI LEVOU!', 1.8, '#39ff14');
      } else if (it.type === 'heart') {
        inv.maxHearts = Math.min(10, inv.maxHearts + 1); inv.hp = inv.maxHearts * 2;
        found = { icon: ICON.up, title: 'CORAÇÃO EXTRA!', text: 'Mais um coração no peito do herói.' }; findT = 1.4; S.chest();
      }
    }
    L.items = L.items.filter(it => !it.taken);
  }

  /* ---------- baús, portas, loja, placas ---------- */
  const CHEST_TEXT = {
    moedas: [ICON.coin[0], '20 MOEDAS!', 'O Seu Boto vai gostar de saber.'],
    bombas: [ICON.bomb, 'BOMBAS!', 'Use o ITEM para soltar uma. Abre paredes rachadas.'],
    lanterna: [ICON.lamp, 'LANTERNA MAIOR!', 'A luz neon agora vai mais longe.'],
    coracao: [ICON.up, 'CORAÇÃO EXTRA!', 'Mais um coração, e já vem cheio.'],
    facao: [ICON.blade, 'FACÃO MAIS FORTE!', 'Cada golpe tira mais vida dos bichos.'],
    bodoque: [ICON.bodoque, 'BODOQUE!', 'Atira pedrinhas longe e aciona alavancas. TROCA escolhe o item.'],
    sal: [ICON.sal, 'SAL GROSSO!', 'Atordoa tudo na frente. Assombração odeia sal!'],
    bolsa: [ICON.bag, 'BOLSA DE BOMBAS!', 'Cabem mais 4 bombas, e a bolsa já veio cheia.'],
    garrafa: [ICON.potion, 'GARRAFADA!', 'Corações cheios de novo.'],
  };
  function openChest(ch) {
    ch.open = true;
    addScore(PTS.bau, ch.x * T + 8, ch.y * T);
    const w = ch.what;
    if (w === 'moedas') { inv.coins += 20; addScore(200); }
    else if (w === 'bombas') { if (!inv.hasBombs) { inv.hasBombs = true; inv.item = 'bombas'; } inv.bombs = Math.min(inv.bombCap, inv.bombs + 6); }
    else if (w === 'lanterna') inv.lanterna++;
    else if (w === 'coracao') { inv.maxHearts = Math.min(10, inv.maxHearts + 1); inv.hp = Math.min(inv.maxHearts * 2, inv.hp + 2); }
    else if (w === 'facao') {
      inv.facao = Math.min(3, inv.facao + 1);
      CHEST_TEXT.facao[1] = FACAO_NAME[inv.facao] + '!';
    }
    else if (w === 'bodoque') { inv.hasBodoque = true; inv.pedras += 20; inv.item = 'bodoque'; }
    else if (w === 'sal') { inv.hasSal = true; inv.sal += 4; inv.item = 'sal'; }
    else if (w === 'bolsa') { inv.bombCap += 4; inv.bombs = inv.bombCap; }
    else if (w === 'garrafa') inv.hp = inv.maxHearts * 2;
    const [icon, title, text] = CHEST_TEXT[w] || CHEST_TEXT.moedas;
    found = { icon, title, text }; findT = 1.3;
    S.chest();
    burst(ch.x * T + 8, ch.y * T + 6, 16, ['#ffd400', '#ffffff', '#ffb000'], 70, 0.6);
  }
  function interact() {
    const p = player;
    const near = (tx, ty, pad) => p.x + 5 + pad > tx * T && p.x - 5 - pad < tx * T + T && p.y + 4 + pad > ty * T && p.y - 4 - pad < ty * T + T;
    for (const ch of L.chests) if (!ch.open && near(ch.x, ch.y, 3)) openChest(ch);
    // portas trancadas
    const x0 = Math.floor((p.x - 9) / T), x1 = Math.floor((p.x + 9) / T), y0 = Math.floor((p.y - 8) / T), y1 = Math.floor((p.y + 8) / T);
    p.doorMsg -= STEP;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(tx, ty) !== 'D' || !near(tx, ty, 2)) continue;
      if (inv.keys > 0) { inv.keys--; setTile(tx, ty, '.'); repaint(tx, ty); S.door(); burst(tx * T + 8, ty * T + 8, 12, ['#ffd400', '#7a5a30'], 60, 0.5); }
      else if (p.doorMsg <= 0) { p.doorMsg = 2.5; say('PORTA TRANCADA. FALTA UMA CHAVE.', 1.6); S.nope(); }
    }
    // Seu Boto
    let shopNear = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tileAt(tx, ty) === 'm' && near(tx, ty, 3)) shopNear = true;
    if (shopNear && !p.shopLock) { p.shopLock = true; openShop(); }
    if (!shopNear) {
      let far = true;
      for (let ty = y0 - 1; ty <= y1 + 1; ty++) for (let tx = x0 - 1; tx <= x1 + 1; tx++) if (tileAt(tx, ty) === 'm') far = false;
      if (far) p.shopLock = false;
    }
    // placas
    p.signNear = null;
    for (const s of L.signs) if (dist(s.x * T + 8, s.y * T + 10, p.x, p.y) < 24) p.signNear = s.text;
  }

  /* =====================================================================
     ATUALIZAÇÃO DO HERÓI E DO ANDAR
     ===================================================================== */
  const lanternR = () => (58 + 16 * inv.lanterna) * (L.def.lanterna || 1);
  function updatePlayer(dt) {
    const p = player;
    p.inv = Math.max(0, p.inv - dt); p.rollInv = Math.max(0, p.rollInv - dt); p.rollCd = Math.max(0, p.rollCd - dt);
    p.itemCd = Math.max(0, p.itemCd - dt); p.atkBuf = Math.max(0, p.atkBuf - dt); p.spin = Math.max(0, p.spin - dt);
    if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.atkN = 0; }
    if (p.atkRec > 0) { p.atkRec -= dt; if (p.atkRec <= 0 && p.atkBuf > 0) startSwing(); }
    if (p.dead) return;
    if (p.falling > 0) { p.falling -= dt; if (p.falling <= 0) { p.falling = 0; endFall(); } return; }
    if (inp.atkEdge) startSwing();
    if (inp.rollEdge) startRoll();
    if (inp.itemEdge) useItem();
    if (inp.swapEdge) swapItem();
    const ftx = Math.floor(p.x / T), fty = Math.floor(p.y / T);
    const under = tileAt(ftx, fty);
    let mx = inp.mx, my = inp.my;
    if (p.spin > 0) { mx *= 0.3; my *= 0.3; }
    const mag = Math.hypot(mx, my);
    let vx, vy;
    if (p.roll > 0) {
      p.roll -= dt;
      vx = p.rdx * ROLL_V; vy = p.rdy * ROLL_V;
      if (p.roll <= 0) p.rollCd = ROLL_CD;
    } else {
      const sp = SPEED * (under === '~' ? 0.6 : 1) * (p.atk > 0 ? 0.35 : 1);
      vx = mx * sp; vy = my * sp;
    }
    if (mag > 0.25 && p.atk <= 0 && p.roll <= 0) {
      const a = Math.round(Math.atan2(my, mx) / (Math.PI / 4)) * (Math.PI / 4);
      p.fx = Math.cos(a); p.fy = Math.sin(a);
      if (Math.abs(p.fx) > 0.6) { p.face = 'side'; p.flip = p.fx < 0; } else p.face = p.fy < 0 ? 'up' : 'down';
    }
    p.moving = mag > 0.25 || p.roll > 0;
    vx += p.kbx + p.pullX; vy += p.kby + p.pullY;
    p.kbx *= 1 - Math.min(1, dt * 10); p.kby *= 1 - Math.min(1, dt * 10);
    p.pullX = p.pullY = 0;
    moveBox(p, vx * dt, vy * dt, 0, 5, 4, true);
    if (p.atk > 0) {
      p.atk -= dt;
      swingHits();
      if (p.atk <= 0) {
        p.atk = 0;
        if (p.atkN < 3) { p.comboT = COMBO_WIN; if (p.atkBuf > 0) startSwing(); }
        else { p.atkRec = 0.28; p.atkN = 0; p.comboT = 0; }
      }
    }
    if (p.moving && p.roll <= 0) { p.anim += dt; stepT -= dt; if (stepT <= 0) { stepT = 0.3; S.step(); } }
    // o chão embaixo dos pés
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), c = tileAt(tx, ty), i = ty * L.W + tx;
    if (holeAt(tx, ty)) { startFall(c === 'W' ? 'agua' : c === 'L' ? 'lava' : 'buraco'); return; }
    if (c === '_' && !L.crumb.has(i)) { L.crumb.set(i, { shake: 0.5, gone: 0 }); noise(0.15, 0.04, 1200, 0, 'bandpass', 300); }
    if (c === '^' && spikeState(tx, ty) === 2) hurtPlayer(1, p.x, p.y, 0);
    if (c === ';' && brasaState(tx, ty) === 2) hurtPlayer(1, p.x, p.y, 0);
    for (const f of L.fires) if (dist(f.x, f.y, p.x, p.y) < 9) { hurtPlayer(1, f.x, f.y, 60); break; }
    if (c === 'p') { if (L.plateT <= 0) { S.gate(); say('CLIQUE! UM PORTÃO SE ABRIU POR 6 SEGUNDOS!', 2, '#ffd400'); } L.plateT = 6; }
    if (c === 'Y') {
      if (p.tpLock !== i) {
        const dst = L.tp.get(i);
        if (dst) {
          burst(p.x, p.y - 6, 14, ['#c8c8d8', '#ffffff', '#00e5ff'], 70, 0.5);
          p.x = dst.x * T + 8; p.y = dst.y * T + 10; p.tpLock = dst.y * L.W + dst.x; p.roll = 0;
          S.teleport(); flash = 0.15;
          burst(p.x, p.y - 6, 14, ['#c8c8d8', '#ffffff', '#00e5ff'], 70, 0.5);
        }
      }
    } else p.tpLock = -1;
    if (c === 'E') {
      if (L.exitOpen) { floorClear(); return; }
      if (p.doorMsg <= 0) { p.doorMsg = 2.5; say('A ESCADA ESTÁ LACRADA. O DONO DO ANDAR AINDA ESTÁ DE PÉ.', 2); }
    }
    let safe = '.:~ipY'.includes(c);
    for (const [ox, oy] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) {
      const ax = Math.floor((p.x + ox) / T), ay = Math.floor((p.y + oy) / T), cc = tileAt(ax, ay);
      if (holeAt(ax, ay) || cc === '_' || cc === '^' || cc === ';') safe = false;
    }
    if (safe && c !== 'Y') { p.safeX = p.x; p.safeY = p.y; }
    interact();
  }

  function updateFloor(dt) {
    L.time += dt;
    leverCd = Math.max(0, leverCd - dt);
    if (L.plateT > 0) {
      const before = Math.ceil(L.plateT);
      L.plateT -= dt;
      if (Math.ceil(L.plateT) !== before) { S.tick(); if (L.plateT <= 0) S.gate(); }
    }
    updateEmitters();
    updateCrumbs(dt);
    updateBoulders(dt);
    for (const f of L.fires) f.t -= dt;
    L.fires = L.fires.filter(f => f.t > 0);
    const p = player;
    // Canto da Iara pelo andar: puxa para a água funda mais próxima
    const iara = L.bosses.find(b => b.kind === 'iara');
    if (iara && !iara.dead && !iara.active && !p.dead) {
      if (L.songOn > 0) {
        L.songOn -= dt;
        let best = null, bd = 5.5 * T;
        for (const j of L.wTiles) {
          const wx = (j % L.W) * T + 8, wy = ((j / L.W) | 0) * T + 8;
          const d = dist(wx, wy, p.x, p.y);
          if (d < bd) { bd = d; best = { x: wx, y: wy }; }
        }
        if (best && L.songWarn <= 0) { const a = Math.atan2(best.y - p.y, best.x - p.x), f = pes() ? 36 : 30; p.pullX += Math.cos(a) * f; p.pullY += Math.sin(a) * f; }
        if (L.songWarn > 0) L.songWarn -= dt;
        if (Math.random() < 0.15 && particles.length < MAX_PART) particles.push({ x: p.x + rand(-30, 30), y: p.y - 20, vx: 0, vy: -20, life: 0.8, max: 0.8, color: '#7affea', size: 2, grav: 0, note: true });
      } else {
        L.songT -= dt;
        if (L.songT <= 0) { L.songT = 10; L.songOn = 3.8; L.songWarn = 1.2; S.song(); say('♪ A IARA ESTÁ CANTANDO... ♪', 3.6, '#7affea'); }
      }
    }
    // arena: fecha os portões quando o herói entra
    if (L.arena && !L.arenaClosed && !L.arenaDone && !p.dead) {
      const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
      let onGate = false;
      for (const [ox, oy] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) if (tileAt(Math.floor((p.x + ox) / T), Math.floor((p.y + oy) / T)) === 'X') onGate = true;
      if (L.arena[ty * L.W + tx] && !onGate) startArena();
    }
    if (L.arenaKind === 'ambush' && L.arenaClosed) {
      const alive = L.enemies.some(e => e.ambush && !e.dead);
      if (!alive) {
        L.waveT -= dt;
        if (L.waveT <= 0) {
          if (L.waves < 3) spawnWave();
          else {
            L.arenaClosed = false; L.arenaDone = true; S.gate(); Sfx.win();
            addScore(PTS.emboscada, p.x, p.y - 10, '#39ff14'); L.bossPts += PTS.emboscada;
            say('EMBOSCADA VENCIDA! OS TÚMULOS SE CALARAM.', 2.6, '#39ff14');
          }
        }
      }
    }
    // o que a lanterna já mostrou vai para o mapa
    L.seenT = (L.seenT || 0) - dt;
    if (L.seenT <= 0) {
      L.seenT = 0.15;
      const R = Math.ceil((codes.has('LANTERNA') ? 150 : lanternR()) / T) + 1;
      const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
      for (let y = ty - R; y <= ty + R; y++) for (let x = tx - R; x <= tx + R; x++) {
        if (x < 0 || y < 0 || x >= L.W || y >= L.H) continue;
        if ((x - tx) ** 2 + (y - ty) ** 2 <= R * R) L.seen[y * L.W + x] = 1;
      }
    }
  }
  function startArena() {
    L.arenaClosed = true;
    S.gate();
    shake = 0.3;
    // empurra para dentro quem estiver em cima de um portão
    if (L.arenaKind === 'boss') {
      for (const b of L.bosses) b.active = true;
      const b = L.bosses[0];
      banner = { title: b.name, sub: b.sub, t: 3 };
      S.boss();
      if (b.kind === 'mula') S.neigh(); else if (b.kind === 'cuca') S.chant(); else if (b.kind === 'saci') S.whistle(); else if (b.kind === 'iara') S.song(); else S.roar();
      bossBounds(b);
    } else {
      L.waves = 0; L.waveT = 0.6;
      banner = { title: 'EMBOSCADA!', sub: 'OS TÚMULOS SE ABREM', t: 2.4 };
      S.boss();
    }
  }
  function spawnWave() {
    const sets = [['z', 'z', 'z', 'z'], ['q', 'z', 'z', 'q'], ['e', 'z', 'q', 'e']];
    const set = sets[L.waves];
    L.tombs.forEach((tb, i) => {
      const e = newEnemy(set[i % set.length], tb.x * T + 8, tb.y * T + 8 + T);
      e.ambush = true; e.awake = true; e.st = e.type === 'e' ? 'under' : 'chase';
      if (pes()) { e.hp = Math.ceil(e.hp * 1.25); e.max = e.hp; }
      L.enemies.push(e);
      burst(e.x, e.y - 4, 12, ['#e8e0c8', '#b26bff', '#4a4640'], 70, 0.6);
    });
    L.waves++; L.waveT = 1.2;
    S.growl();
    say(`ONDA ${L.waves} DE 3`, 1.6, '#e8e0c8');
  }

  /* =====================================================================
     CHEFES E MINI-CHEFES
     ===================================================================== */
  const BOSS_DEF = {
    iara: { name: 'IARA', sub: 'A MÃE-D\'ÁGUA', hp: 30, r: 9, pts: PTS.mini },
    curupira: { name: 'CURUPIRA', sub: 'O GUARDIÃO DE PÉS VIRADOS', hp: 40, r: 8, pts: PTS.mini },
    mula: { name: 'MULA SEM CABEÇA', sub: 'A ASSOMBRAÇÃO DO CURRAL', hp: 70, r: 13, pts: PTS.mula },
    mapinguari: { name: 'MAPINGUARI', sub: 'O GIGANTE DA BOCA NA BARRIGA', hp: 80, r: 15, pts: PTS.mini },
    boitata: { name: 'BOITATÁ', sub: 'A COBRA DE FOGO', hp: 54, r: 9, pts: PTS.mini },
    saci: { name: 'SACI PERERÊ', sub: 'O DONO DO REDEMOINHO', hp: 48, r: 8, pts: PTS.mini },
    cuca: { name: 'CUCA', sub: 'A BRUXA-JACARÉ', hp: 135, r: 11, pts: PTS.cuca },
  };
  function newBoss(kind, x, y) {
    const d = BOSS_DEF[kind];
    const hp = Math.ceil(d.hp * (settings.dif === 'pesadelo' ? 1.25 : 1));
    const b = {
      kind, name: d.name, sub: d.sub, x, y: y + 4, hx: x, hy: y + 4, hp, max: hp, r: d.r, pts: d.pts, st: 'wait', t: 1.2, active: false, dead: false,
      flash: 0, anim: 0, ang: 0, dir: 1, stun: 0, cd: {}, n: 0, phase: 1, trail: [], deathT: 0, loot: 0, minions: 0, summon: [0.66, 0.33],
    };
    if (kind === 'boitata') { for (let i = 0; i < 60; i++) b.trail.push({ x, y: y + 4 - i * 2 }); b.ang = Math.PI / 2; }
    if (kind === 'iara') { b.st = 'under'; b.t = 1.4; }
    if (kind === 'curupira') { b.st = 'hide'; b.t = 1.4; }
    b.parts = () => bossParts(b);
    b.salt = () => { b.stun = b.kind === 'saci' ? 2.5 : b.kind === 'cuca' && b.phase < 3 ? 0 : 0.8; if (b.stun) { S.hit(); popup(b.x, b.y - 30, 'ATORDOADO!', '#e8e8f0'); } if (b.kind === 'saci') hitBoss(b, 2, b.parts()[0], 'sal'); };
    return b;
  }
  function bossBounds(b) {
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 0; i < L.arena.length; i++) if (L.arena[i]) { const x = i % L.W, y = (i / L.W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    b.box = { x0: x0 * T, x1: (x1 + 1) * T, y0: y0 * T, y1: (y1 + 1) * T };
    b.cx = (b.box.x0 + b.box.x1) / 2; b.cy = (b.box.y0 + b.box.y1) / 2;
    if (b.kind === 'iara') {
      b.shore = [];
      for (let i = 0; i < L.arena.length; i++) {
        if (!L.arena[i] || L.t[i] !== 'W') continue;
        const x = i % L.W, y = (i / L.W) | 0;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const c = tileAt(x + dx, y + dy); return c !== 'W' && !SOLID_CH.has(c); })) b.shore.push({ x: x * T + 8, y: y * T + 9 });
      }
    }
    if (b.kind === 'saci') {
      const ix = 3 * T, iy = 3 * T;
      b.spots = [{ x: b.box.x0 + ix, y: b.box.y0 + iy }, { x: b.box.x1 - ix, y: b.box.y0 + iy }, { x: b.box.x0 + ix, y: b.box.y1 - iy }, { x: b.box.x1 - ix, y: b.box.y1 - iy }, { x: b.cx, y: b.cy }];
    }
  }
  function bossParts(b) {
    if (b.dead) return [];
    switch (b.kind) {
      case 'iara': return b.st === 'under' || b.st === 'rise' ? [] : [{ x: b.x, y: b.y - 8, r: 10 }];
      case 'curupira': return b.st === 'hide' ? [] : [{ x: b.x, y: b.y - 8, r: 8 }];
      case 'mula': return [{ x: b.x, y: b.y - 11, r: 14 }];
      case 'mapinguari': return [{ x: b.x, y: b.y - 13, r: 9, id: 'belly' }, { x: b.x, y: b.y - 24, r: 15, id: 'body' }];
      case 'boitata': {
        const parts = [{ x: b.x, y: b.y, r: 9, id: 'head' }];
        for (let i = 1; i <= 12; i++) { const tp = b.trail[Math.min(b.trail.length - 1, i * 4)]; parts.push({ x: tp.x, y: tp.y, r: 6, id: 'seg' }); }
        return parts;
      }
      case 'saci': return b.st === 'swirl' ? [] : [{ x: b.x, y: b.y - 9, r: 8 }];
      case 'cuca': return b.phase === 3 ? [{ x: b.x, y: b.y - 10, r: 17 }] : [{ x: b.x, y: b.y - 15, r: 11 }];
    }
    return [];
  }
  // Multiplicador de dano: 0 = o golpe resvala (TINK)
  function bossVuln(b, part, src) {
    if (b.stun > 0) return 1.5;
    switch (b.kind) {
      case 'iara': return b.st === 'under' || b.st === 'rise' ? 0 : 1;
      case 'curupira': return b.st === 'dizzy' ? 1.5 : b.st === 'aim' ? 1 : 0;
      case 'mula': return b.st === 'stun' ? 2 : 1;
      case 'mapinguari': return part.id === 'belly' && (b.st === 'inhale' || b.st === 'open') ? 2 : 1;
      case 'boitata': return part.id !== 'head' ? 0 : b.st === 'tired' ? 1.5 : b.st === 'coil' ? 1 : src === 'bomba' ? 1 : 0;
      case 'saci': return 1;
      case 'cuca': return b.st === 'transform' ? 0 : b.phase === 3 ? (b.st === 'stun' ? 1.5 : 1) : b.st === 'laugh' ? 1 : 0;
    }
    return 1;
  }
  function hitBoss(b, dmg, part, src) {
    if (!b.active || b.dead) return;
    const m = bossVuln(b, part, src);
    if (!m) { S.tink(); burst(part.x, part.y, 6, ['#ffffff', '#b26bff', '#00e5ff'], 70, 0.25); popup(part.x, part.y - 10, 'TINK!', '#9a8bb8'); return; }
    b.hp -= dmg * m; b.flash = 0.12;
    S.hit();
    burst(part.x, part.y, 8, ['#ffffff', '#ff3b5c', '#ffd400'], 80, 0.35);
    if (b.loot && src !== 'sal') { L.items.push({ type: 'sack', x: b.x, y: b.y, loot: { it: 'bombas', n: b.loot }, drop: 0.4 }); b.loot = 0; }
    if (b.kind === 'saci' && b.st !== 'smoke' && b.stun <= 0) { b.st = 'swirl'; b.t = 0.3; b.dest = pick(b.spots); }
    if (b.hp <= 0) killBoss(b);
  }
  function killBoss(b) {
    b.dead = true; b.hp = 0; b.deathT = 2;
    addScore(b.pts, b.x, b.y - 30, '#ffd400');
    L.bossPts += b.pts;
    S.roar(); Sfx.explode();
    shake = 1;
    for (const e of L.enemies) if (e.summoned && !e.dead) { e.dead = true; burst(e.x, e.y, 8, ['#b26bff', '#ffffff'], 60, 0.4); }
    shots = shots.filter(s => s.owner === 'player');
    warns = [];
    setTimeout(() => {
      if (!L || state === 'menu') return;
      L.arenaClosed = false; L.arenaDone = true; L.exitOpen = true;
      S.gate(); Sfx.win();
      if (b.kind === 'mula') L.items.push({ type: 'heart', x: b.x, y: b.y });
      else if (b.kind !== 'cuca') { L.items.push({ type: 'potion', x: b.x, y: b.y }); }
      for (let i = 0; i < 6; i++) L.items.push({ type: 'coin', x: b.x + rand(-20, 20), y: b.y + rand(-14, 14), drop: 0.2 });
      banner = b.kind === 'cuca'
        ? { title: 'A CUCA CAIU!', sub: 'A ESCADA PARA A SUPERFÍCIE SE ABRIU', t: 4 }
        : { title: b.name + ' VENCIDO!', sub: 'A ESCADA ESTÁ LIBERADA', t: 3 };
    }, 1600);
  }
  const bossTel = (b, st, t) => { b.st = st; b.t = t / (pes() ? 1.25 : 1); b.tmax = b.t; };
  function fan(x, y, a, n, spread, sp, kind, extra) {
    for (let i = 0; i < n; i++) {
      const aa = a + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * (n - 1));
      shots.push(Object.assign({ owner: 'enemy', kind, x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, r: 3.5, dmg: 2, life: 5, small: kind === 'orb' || kind === 'water' }, extra || {}));
    }
  }
  function summonMinion(type, x, y) {
    if (L.enemies.filter(e => e.summoned && !e.dead).length >= 4) return;
    const e = newEnemy(type, x, y - 3);
    e.summoned = true; e.awake = true; e.st = 'chase'; e.hp = Math.min(e.hp, 4); e.max = e.hp;
    L.enemies.push(e);
    burst(x, y, 12, ['#7dff3a', '#b26bff', '#ffffff'], 60, 0.5);
  }
  function lob(x0, y0, x1, y1, t, onLand) {
    warns.push({ kind: 'circle', x: x1, y: y1, r: 14, t, max: t, color: '#7dff3a', then: onLand, lob: { x0, y0 } });
  }
  function moveBoss(b, ang, sp, dt, mode = 1, hw = 8, hh = 6) {
    return moveBox(b, Math.cos(ang) * sp * dt, Math.sin(ang) * sp * dt, mode, hw, hh, false);
  }

  function updateBoss(b, dt) {
    const p = player;
    b.anim += dt; b.flash -= dt;
    if (b.dead) { b.deathT -= dt; if (b.deathT > 0 && Math.random() < 0.5) burst(b.x + rand(-14, 14), b.y - rand(0, 24), 4, ['#ffd400', '#ff7a1a', '#ffffff'], 80, 0.4); return; }
    if (!b.active) { if (b.kind === 'boitata') b.trail.unshift({ x: b.x, y: b.y }), b.trail.length = 60; return; }
    if (b.stun > 0) { b.stun -= dt; return; }
    const d = dist(b.x, b.y, p.x, p.y), ang = Math.atan2(p.y - b.y, p.x - b.x);
    const fast = pes() ? 1.15 : 1;
    let touch = 0;   // dano de contato neste quadro
    b.t -= dt;
    switch (b.kind) {
      case 'iara': {
        if (b.hp < b.max * b.summon[0]) { b.summon.shift(); b.summon.push(-1); const sp = spotNear(2, 5, true); if (sp) summonMinion('c', sp.x, sp.y); }
        if (b.st === 'under') {
          if (b.t <= 0) {
            const opts = b.shore.filter(s => { const dd = dist(s.x, s.y, p.x, p.y); return dd > 2 * T && dd < 7 * T; });
            const s = pick(opts.length ? opts : b.shore);
            b.x = s.x; b.y = s.y; bossTel(b, 'rise', 0.8);
            warns.push({ kind: 'ripple', x: b.x, y: b.y - 2, r: 14, t: b.t, max: b.t, color: '#7affea' });
          }
        } else if (b.st === 'rise') { if (b.t <= 0) { b.st = 'up'; b.t = 0.45; S.splash(); burst(b.x, b.y, 12, ['#3ab8ff', '#d6fdff'], 60, 0.5); } }
        else if (b.st === 'up') {
          if (b.t <= 0) { b.n++; if (b.n % 2) { bossTel(b, 'song', 3.1); S.song(); } else { bossTel(b, 'jets', 0.5); b.vol = b.hp < b.max / 2 ? 2 : 1; } }
        } else if (b.st === 'song') {
          if (b.t < b.tmax - 0.6) {
            const f = pes() ? 52 : 42, a = Math.atan2(b.y - p.y, b.x - p.x);
            p.pullX += Math.cos(a) * f; p.pullY += Math.sin(a) * f;
            if (Math.random() < 0.3) particles.length < MAX_PART && particles.push({ x: b.x + rand(-6, 6), y: b.y - 18, vx: Math.cos(-a) * -40, vy: -25, life: 0.9, max: 0.9, color: '#7affea', size: 2, grav: 0, note: true });
            if (d < 17) hurtPlayer(2, b.x, b.y, 240);
          }
          if (b.t <= 0) { bossTel(b, 'dive', 0.4); }
        } else if (b.st === 'jets') {
          if (b.t <= 0) {
            fan(b.x, b.y - 10, Math.atan2(p.y - 4 - (b.y - 10), p.x - b.x), b.hp < b.max / 2 ? 5 : 3, 0.32, 115, 'water');
            S.splash();
            b.vol--;
            if (b.vol > 0) b.t = 0.55; else bossTel(b, 'dive', 0.6);
          }
        } else if (b.st === 'dive') { if (b.t <= 0) { b.st = 'under'; b.t = rand(1, 1.6); S.splash(); } }
        break;
      }
      case 'curupira': {
        if (b.st === 'hide') {
          if (b.t <= 0) {
            const back = Math.atan2(-p.fy, -p.fx);
            let s = null;
            for (let k = 0; k < 40 && !s; k++) {
              const a = back + rand(-0.9, 0.9), r = rand(4, 6.5) * T;
              const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r, tx = Math.floor(x / T), ty = Math.floor(y / T);
              if (L.arena[ty * L.W + tx] && !blocked(tx, ty, 2)) s = { x: tx * T + 8, y: ty * T + 10 };
            }
            if (!s) s = spotNear(3, 6, true) || { x: b.cx, y: b.cy };
            b.x = s.x; b.y = s.y; b.dash = 0;
            bossTel(b, 'aim', 0.75); S.whistle();
            burst(b.x, b.y - 8, 12, ['#7dff3a', '#3f8a2a', '#ff5a1a'], 60, 0.4);
          }
        } else if (b.st === 'aim') {
          if (b.t > 0.22) b.ang = ang;
          if (b.t <= 0) { b.st = 'dash'; b.t = 2; b.dir = Math.cos(b.ang) < 0 ? -1 : 1; noise(0.3, 0.1, 3000, 0, 'bandpass', 800); }
        } else if (b.st === 'dash') {
          const h = moveBoss(b, b.ang, 235 * fast, dt, 2, 6, 5);
          touch = 2;
          if (Math.random() < 0.6) burst(b.x, b.y - 2, 1, ['#ff5a1a', '#ffd400'], 20, 0.3);
          if (h.hitX || h.hitY || b.t <= 0) {
            b.dash++;
            S.stomp(); shake = Math.max(shake, 0.3);
            if (b.hp < b.max * 0.3 && b.dash < 2) bossTel(b, 'aim', 0.5);
            else { b.st = 'dizzy'; b.t = 1.7; }
          }
        } else if (b.st === 'dizzy') {
          if (b.t <= 0) {
            const qs = L.enemies.filter(e => e.summoned && !e.dead).length;
            b.n++;
            if (b.hp < b.max * 0.6 && b.n % 2 === 0 && qs < 2) { bossTel(b, 'call', 0.8); S.whistle(); }
            else { b.st = 'hide'; b.t = rand(1.1, 1.7); burst(b.x, b.y - 8, 14, ['#7dff3a', '#3f8a2a'], 60, 0.4); }
          }
        } else if (b.st === 'call') {
          if (b.t <= 0) { const s = spotNear(3, 5, true); if (s) summonMinion('h', s.x, s.y); b.st = 'hide'; b.t = 1.4; }
        }
        break;
      }
      case 'mula': {
        if (b.st === 'wait') b.st = 'idle';
        const ph2 = b.hp <= b.max / 2;
        if (Math.cos(ang) && b.st === 'idle') b.dir = Math.cos(ang) < 0 ? -1 : 1;
        if (b.st === 'idle') {
          moveBoss(b, ang, 26, dt, 1, 12, 7);
          touch = 1;
          if (b.t <= 0) {
            if (d < 38 && Math.random() < 0.7) { bossTel(b, 'rear', 0.55); warns.push({ kind: 'circle', x: b.x, y: b.y - 4, r: 36, t: b.t, max: b.t, color: '#ff3b5c' }); }
            else if (ph2 && (b.cd.br || 0) <= 0) { bossTel(b, 'brasas', 0.7); b.cd.br = 3; S.fire(); }
            else { bossTel(b, 'scrape', 0.85); b.charges = 0; S.neigh(); }
          }
        } else if (b.st === 'rear') {
          if (b.t <= 0) { S.stomp(); shake = 0.4; fxs.push({ kind: 'ring', x: b.x, y: b.y - 4, t: 0.3, max: 0.3, r: 36, color: '#ff7a1a' }); if (d < 38) hurtPlayer(2, b.x, b.y, 230); b.st = 'idle'; b.t = 0.7; }
        } else if (b.st === 'scrape') {
          if (b.t > 0.25) { b.ang = ang; b.dir = Math.cos(ang) < 0 ? -1 : 1; }
          if (Math.random() < 0.5) burst(b.x - b.dir * 10, b.y, 1, ['#7a6a5a', '#ff7a1a'], 40, 0.3);
          if (b.t <= 0) { b.st = 'charge'; b.t = 3; b.trailD = 0; b.charges++; }
        } else if (b.st === 'charge') {
          const sp = (ph2 ? 235 : 195) * fast;
          const h = moveBoss(b, b.ang, sp, dt, 1, 12, 7);
          touch = 2;
          b.trailD += sp * dt;
          if (b.trailD > 10) { b.trailD = 0; L.fires.push({ x: b.x, y: b.y, t: 2.2 }); }
          if (h.hitX || h.hitY || b.t <= 0) {
            S.stomp(); shake = 0.5;
            burst(b.x + Math.cos(b.ang) * 14, b.y - 8, 16, ['#ffd400', '#ff7a1a', '#ffffff'], 90, 0.5);
            if (ph2 && b.charges < 2) { bossTel(b, 'scrape', 0.5); S.neigh(); }
            else { b.st = 'stun'; b.t = 1.7; }
          }
        } else if (b.st === 'stun') { if (b.t <= 0) { b.st = 'idle'; b.t = 0.6; } }
        else if (b.st === 'brasas') {
          if (b.t <= 0) { for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + b.anim; shots.push({ owner: 'enemy', kind: 'fire', x: b.x + b.dir * 12, y: b.y - 18, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, r: 3.5, dmg: 2, life: 4 }); } S.fire(); b.st = 'idle'; b.t = 0.9; }
        }
        if (b.cd.br > 0 && b.st === 'idle') b.cd.br -= dt;
        break;
      }
      case 'mapinguari': {
        if (b.st === 'wait') { b.st = 'walk'; b.t = 1; }
        for (const k of ['claw', 'inh', 'stomp']) b.cd[k] = (b.cd[k] === undefined ? (k === 'inh' ? 4 : k === 'stomp' ? 7 : 0) : b.cd[k]) - dt;
        const ph2 = b.hp <= b.max / 2;
        if (b.st === 'walk') {
          moveBoss(b, ang, (pes() ? 30 : 26), dt, 1, 12, 8);
          b.dir = Math.cos(ang) < 0 ? -1 : 1;
          touch = 1;
          if (d < 40 && b.cd.claw <= 0) { bossTel(b, 'raise', ph2 ? 0.45 : 0.6); b.ang = ang; b.swipes = ph2 ? 2 : 1; S.growl(); warns.push({ kind: 'arc', x: b.x, y: b.y - 10, r: 42, a: ang, t: b.t, max: b.t, color: '#ff3b5c' }); }
          else if (b.cd.inh <= 0 && d < 8 * T) { bossTel(b, 'open', 0.8); b.cd.inh = 7; S.roar(); }
          else if (b.cd.stomp <= 0) { bossTel(b, 'lift', 0.7); b.cd.stomp = 7.5; }
        } else if (b.st === 'raise') {
          if (b.t <= 0) {
            S.swing(3); fxs.push({ kind: 'eslash', x: b.x, y: b.y - 12, a: b.ang, t: 0.2, max: 0.2, big: true, huge: true });
            if (d < 44 && Math.abs(angDiff(b.ang, ang)) < 1.4) hurtPlayer(2, b.x, b.y, 240);
            b.swipes--;
            if (b.swipes > 0) { bossTel(b, 'raise', 0.35); b.ang = ang; warns.push({ kind: 'arc', x: b.x, y: b.y - 10, r: 42, a: ang, t: b.t, max: b.t, color: '#ff3b5c' }); }
            else { b.st = 'walk'; b.cd.claw = 1.1; }
          }
        } else if (b.st === 'open') { if (b.t <= 0) { b.st = 'inhale'; b.t = 2; } }
        else if (b.st === 'inhale') {
          const f = pes() ? 56 : 46, a = Math.atan2(b.y - 12 - p.y, b.x - p.x);
          p.pullX += Math.cos(a) * f; p.pullY += Math.sin(a) * f;
          if (Math.random() < 0.6) particles.length < MAX_PART && particles.push({ x: b.x + rand(-60, 60), y: b.y - 12 + rand(-40, 40), vx: 0, vy: 0, life: 0.5, max: 0.5, color: '#9a8bb8', size: 1, grav: 0, suck: { x: b.x, y: b.y - 12 } });
          if (d < 24 && !invulnerable()) {
            hurtPlayer(4, b.x, b.y, 280); S.roar(); shake = 0.6;
            b.st = 'tired'; b.t = 1.4;
          } else if (b.t <= 0) { b.st = 'tired'; b.t = 1.4; }
        } else if (b.st === 'tired') { if (b.t <= 0) { b.st = 'walk'; } }
        else if (b.st === 'lift') {
          if (b.t <= 0) {
            S.stomp(); shake = 0.7;
            fxs.push({ kind: 'shock', x: b.x, y: b.y, t: 0.75, max: 0.75, r0: 14, r1: 96, hit: false });
            for (let i = 0; i < (ph2 ? 5 : 3); i++) {
              const rx = p.x + rand(-40, 40), ry = p.y + rand(-34, 34);
              warns.push({ kind: 'circle', x: rx, y: ry, r: 12, t: 1.05, max: 1.05, color: '#ffd400', then: () => { S.stomp(); burst(rx, ry, 14, ['#7a6a5a', '#a89a8a', '#4a3a2a'], 70, 0.5, 3, 120); if (dist(rx, ry, player.x, player.y - 3) < 14) hurtPlayer(2, rx, ry, 120); } });
            }
            b.st = 'walk';
          }
        }
        break;
      }
      case 'boitata': {
        if (b.st === 'wait') { b.st = 'chase'; b.t = 3; }
        const ph2 = b.hp <= b.max / 2;
        const steer = (sp, turn) => {
          b.ang += clamp(angDiff(b.ang, ang), -turn * dt, turn * dt);
          const nx = b.x + Math.cos(b.ang) * sp * dt, ny = b.y + Math.sin(b.ang) * sp * dt;
          const tx = Math.floor(nx / T), ty = Math.floor(ny / T);
          if (SOLID_CH.has(tileAt(tx, ty)) || tileAt(tx, ty) === 'X' || tileAt(tx, ty) === 'D') b.ang += Math.PI * 0.6;
          else { b.x = nx; b.y = ny; }
        };
        if (b.st === 'chase') {
          steer((ph2 ? 70 : 60) * fast, 2.6);
          if (ph2) { b.cd.f = (b.cd.f || 1.6) - dt; if (b.cd.f <= 0) { b.cd.f = 1.6; fan(b.x, b.y, ang, 1, 0, 110, 'fire'); S.fire(); } }
          if (b.t <= 0 && d < 7 * T) { bossTel(b, 'coil', 0.8); S.growl(); warns.push({ kind: 'line', x: b.x, y: b.y, a: ang, len: 90, t: b.t, max: b.t, color: '#ff7a1a', follow: b }); }
        } else if (b.st === 'coil') {
          if (b.t > 0.2) b.ang = ang;
          if (b.t <= 0) { b.st = 'bote'; b.t = 0.38; S.fire(); }
        } else if (b.st === 'bote') {
          const nx = b.x + Math.cos(b.ang) * 255 * dt, ny = b.y + Math.sin(b.ang) * 255 * dt;
          const c = tileAt(Math.floor(nx / T), Math.floor(ny / T));
          if (!SOLID_CH.has(c) && c !== 'X') { b.x = nx; b.y = ny; } else b.t = 0;
          if (b.t <= 0) { b.st = 'tired'; b.t = 1.6; shake = 0.3; S.stomp(); }
        } else if (b.st === 'tired') { if (b.t <= 0) { b.st = 'chase'; b.t = rand(3.2, 4.4); } }
        const last = b.trail[0];
        if (!last || dist(last.x, last.y, b.x, b.y) > 1.5) { b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 60) b.trail.length = 60; }
        if (!invulnerable()) for (const pp of bossParts(b)) if (dist(pp.x, pp.y, p.x, p.y - 4) < pp.r + 4) { hurtPlayer(2, pp.x, pp.y, 200); break; }
        break;
      }
      case 'saci': {
        if (b.st === 'wait') { b.st = 'hop'; b.t = 2.4; b.cd.f = 0.8; b.cd.tor = 4; }
        b.cd.tor -= dt;
        if (b.st === 'hop') {
          b.hop = (b.hop || 0) + dt * 9;
          const want = d < 3.5 * T ? ang + Math.PI : d > 5 * T ? ang : ang + Math.PI / 2;
          moveBoss(b, want, 70 * fast * (0.5 + Math.abs(Math.sin(b.hop))), dt, 1, 6, 5);
          b.dir = Math.cos(ang) < 0 ? -1 : 1;
          b.cd.f -= dt;
          if (b.cd.f <= 0) { b.cd.f = 0.75; fan(b.x + b.dir * 8, b.y - 10, Math.atan2(p.y - 4 - (b.y - 10), p.x - b.x), 1, 0, 105, 'fire', { r: 3, dmg: 1 }); tone(400, 0.08, 'triangle', 0.04, 200); }
          if (b.cd.tor <= 0) { b.cd.tor = 8; for (const s of [-1, 1]) shots.push({ owner: 'enemy', kind: 'tornado', x: b.x + s * 10, y: b.y - 6, vx: Math.cos(ang + s * 0.8) * 52, vy: Math.sin(ang + s * 0.8) * 52, r: 6, dmg: 1, life: 5 }); S.whistle(); }
          if (b.t <= 0) { b.st = 'swirl'; b.t = 0.6; b.dest = pick(b.spots.filter(s => dist(s.x, s.y, b.x, b.y) > 3 * T)); S.whistle(); }
        } else if (b.st === 'swirl') {
          if (b.dest && Math.random() < 0.8) burst(b.dest.x + rand(-6, 6), b.dest.y - rand(0, 14), 1, ['#c8c8d8', '#ffffff'], 40, 0.4);
          if (b.t <= 0) {
            b.x = b.dest.x; b.y = b.dest.y; S.teleport(); b.n++;
            if (b.n % 2 === 0) { b.st = 'smoke'; b.t = 1.8; S.laugh(); }
            else { b.st = 'hop'; b.t = 2.4; }
          }
        } else if (b.st === 'smoke') {
          if (Math.random() < 0.3) burst(b.x + b.dir * 10, b.y - 16, 1, ['#c8c8d8'], 15, 0.8);
          if (b.t <= 0) { b.st = 'hop'; b.t = 2.4; }
        }
        if (b.st === 'hop') touch = 1;
        break;
      }
      case 'cuca': {
        if (b.st === 'wait') { b.st = 'float'; b.t = 1; b.pat = 0; }
        const ph = b.phase;
        if (ph < 3 && b.hp <= b.max * (ph === 1 ? 2 / 3 : 1 / 3) && b.st !== 'transform') {
          if (ph === 1) { b.phase = 2; b.st = 'tocenter'; b.t = 1.2; b.pat = 0; S.laugh(); say('A CUCA FOI MEXER O CALDEIRÃO!', 2, '#7dff3a'); }
          else { b.phase = 3; b.st = 'transform'; b.t = 2.2; S.roar(); shake = 1; shots = shots.filter(s => s.owner === 'player'); say('A CUCA VIROU UM JACARÉ GIGANTE!', 2.4, '#7dff3a'); }
        }
        if (b.phase === 1) {
          if (b.st === 'float') {
            b.x += Math.cos(b.anim * 0.9) * 12 * dt; b.y += Math.sin(b.anim * 1.3) * 8 * dt;
            if (b.t <= 0) {
              const k = b.pat++ % 3;
              if (k === 1) { bossTel(b, 'potions', 0.45); }
              else { bossTel(b, 'spell', 0.65); S.chant(); b.vol = 2; }
            }
          } else if (b.st === 'spell') {
            if (b.t <= 0) {
              fan(b.x, b.y - 16, Math.atan2(p.y - 5 - (b.y - 16), p.x - b.x), pes() ? 5 : 3, 0.3, 100, 'orb');
              tone(700, 0.2, 'sine', 0.05, 300);
              b.vol--;
              if (b.vol > 0) b.t = 0.55; else { bossTel(b, 'laugh', 1.4); S.laugh(); }
            }
          } else if (b.st === 'potions') {
            if (b.t <= 0) { throwPotions(b, 3); bossTel(b, 'laugh', 1.4); S.laugh(); }
          } else if (b.st === 'laugh') {
            if (b.t <= 0) { b.st = 'tele'; b.t = 0.55; b.dest = spotNear(3.5, 6, true) || { x: b.cx, y: b.cy }; }
          } else if (b.st === 'tele') {
            if (Math.random() < 0.7) burst(b.dest.x + rand(-8, 8), b.dest.y - rand(0, 20), 1, ['#b26bff', '#7dff3a'], 30, 0.4);
            if (b.t <= 0) { b.x = b.dest.x; b.y = b.dest.y; S.teleport(); b.st = 'float'; b.t = 0.7; }
          }
        } else if (b.phase === 2) {
          if (b.st === 'tocenter') {
            b.x = lerp(b.x, b.cx, Math.min(1, dt * 3)); b.y = lerp(b.y, b.cy - 6, Math.min(1, dt * 3));
            if (b.t <= 0) { b.st = 'stir'; b.t = 0.8; }
          } else if (b.st === 'stir') {
            if (b.t <= 0) {
              const k = b.pat++ % 3;
              if (k === 0) { bossTel(b, 'bubble', 0.7); b.next = 'spiral'; }
              else if (k === 1) { bossTel(b, 'bubble', 0.55); b.next = 'ring'; b.vol = 3; b.gap = Math.atan2(p.y - b.cy, p.x - b.cx); }
              else { bossTel(b, 'potions', 0.45); }
              tone(150, 0.5, 'sine', 0.05, 90);
            }
          } else if (b.st === 'bubble') {
            if (Math.random() < 0.5) burst(b.cx + rand(-8, 8), b.cy + 4, 1, ['#7dff3a', '#39ff14'], 40, 0.5);
            if (b.t <= 0) { b.st = b.next; b.t = b.next === 'spiral' ? 3.4 : 0.01; b.emitT = 0; b.spin = Math.random() * TAU; }
          } else if (b.st === 'spiral') {
            b.emitT -= dt; b.spin += 1.5 * dt;
            if (b.emitT <= 0) {
              b.emitT = 0.14;
              for (let k = 0; k < (pes() ? 4 : 3); k++) { const a = b.spin + (k / (pes() ? 4 : 3)) * TAU; shots.push({ owner: 'enemy', kind: 'orb', x: b.cx, y: b.cy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, r: 3.5, dmg: 2, life: 5, small: true }); }
            }
            if (b.t <= 0) { bossTel(b, 'laugh', 1.5); S.laugh(); }
          } else if (b.st === 'ring') {
            if (b.t <= 0) {
              const n = 20;
              for (let k = 0; k < n; k++) {
                const a = (k / n) * TAU;
                if (Math.abs(angDiff(a, b.gap)) < 0.55) continue;
                shots.push({ owner: 'enemy', kind: 'orb', x: b.cx, y: b.cy, vx: Math.cos(a) * 75, vy: Math.sin(a) * 75, r: 3.5, dmg: 2, life: 5, small: true });
              }
              tone(500, 0.15, 'sine', 0.05, 250);
              b.vol--; b.gap += rand(-0.7, 0.7);
              if (b.vol > 0) b.t = 0.75; else { bossTel(b, 'laugh', 1.5); S.laugh(); }
            }
          } else if (b.st === 'potions') {
            if (b.t <= 0) { throwPotions(b, 4); bossTel(b, 'laugh', 1.5); S.laugh(); }
          } else if (b.st === 'laugh') {
            if (b.t <= 0) { b.st = 'stir'; b.t = 0.5; }
          }
          // o caldeirão é sólido
          const cdx = p.x - b.cx, cdy = p.y - (b.cy + 6), cd2 = Math.hypot(cdx, cdy);
          if (cd2 < 16 && cd2 > 0.01) { p.x = b.cx + (cdx / cd2) * 16; p.y = b.cy + 6 + (cdy / cd2) * 16; }
        } else {
          if (b.st === 'transform') {
            if (Math.random() < 0.6) burst(b.x + rand(-16, 16), b.y - rand(0, 24), 2, ['#7dff3a', '#b26bff', '#ffd84a'], 70, 0.5);
            if (b.t <= 0) { b.st = 'jidle'; b.t = 0.6; b.r = 16; S.roar(); }
          } else if (b.st === 'jidle') {
            moveBoss(b, ang, 40 * fast, dt, 1, 14, 7);
            b.dir = Math.cos(ang) < 0 ? -1 : 1;
            touch = 2;
            if (b.t <= 0) {
              if (d < 40) { bossTel(b, 'tailup', 0.6); warns.push({ kind: 'circle', x: b.x, y: b.y - 4, r: 38, t: b.t, max: b.t, color: '#ff3b5c' }); }
              else if (d < 60 && Math.abs(Math.cos(ang)) > 0.6) { bossTel(b, 'jaws', 0.45); b.ang = ang; S.growl(); }
              else { bossTel(b, 'jaim', 0.7); S.roar(); }
            }
          } else if (b.st === 'tailup') {
            if (b.t <= 0) { fxs.push({ kind: 'ring', x: b.x, y: b.y - 4, t: 0.3, max: 0.3, r: 38, color: '#7dff3a' }); S.swing(3); if (d < 40) hurtPlayer(3, b.x, b.y, 250); b.st = 'jidle'; b.t = 0.6; }
          } else if (b.st === 'jaws') {
            if (b.t <= 0) {
              fxs.push({ kind: 'eslash', x: b.x + b.dir * 18, y: b.y - 8, a: b.ang, t: 0.2, max: 0.2, big: true, huge: true });
              S.stomp();
              if (d < 58 && Math.abs(angDiff(b.ang, ang)) < 0.7) hurtPlayer(3, b.x, b.y, 260);
              b.st = 'jidle'; b.t = 0.5;
            }
          } else if (b.st === 'jaim') {
            if (b.t > 0.22) { b.ang = ang; b.dir = Math.cos(ang) < 0 ? -1 : 1; }
            if (!b.lineOn) { b.lineOn = true; warns.push({ kind: 'line', x: b.x, y: b.y - 6, a: ang, len: 140, t: b.t, max: b.t, color: '#ff3b5c', follow: b }); }
            if (b.t <= 0) { b.st = 'jcharge'; b.t = 3; b.lineOn = false; }
          } else if (b.st === 'jcharge') {
            const h = moveBoss(b, b.ang, 240 * fast, dt, 1, 14, 7);
            touch = 3;
            if (h.hitX || h.hitY || b.t <= 0) { S.stomp(); shake = 0.6; b.st = 'stun'; b.t = 1.4; burst(b.x + Math.cos(b.ang) * 18, b.y - 8, 16, ['#ffd84a', '#ffffff'], 90, 0.5); }
          } else if (b.st === 'stun') { if (b.t <= 0) { b.st = 'jidle'; b.t = 0.5; } }
        }
        break;
      }
    }
    if (touch && !p.dead) for (const pp of bossParts(b)) if (dist(pp.x, pp.y, p.x, p.y - 4) < pp.r + 5) { hurtPlayer(touch, pp.x, pp.y, 220); break; }
  }
  function throwPotions(b, n) {
    for (let i = 0; i < n; i++) {
      const tx = player.x + rand(-34, 34), ty = player.y + rand(-28, 28);
      const ok = !blocked(Math.floor(tx / T), Math.floor(ty / T), 1);
      const x = ok ? tx : player.x, y = ok ? ty : player.y;
      lob(b.x, b.y - 18, x, y, 0.95, () => {
        S.splash(); burst(x, y, 14, ['#7dff3a', '#39ff14', '#b26bff'], 70, 0.5);
        if (dist(x, y, player.x, player.y - 3) < 15) hurtPlayer(2, x, y, 150);
        if (Math.random() < 0.5) summonMinion(pick(['c', 'b', 'r']), x, y);
      });
    }
    tone(600, 0.15, 'triangle', 0.05, 900);
  }
  function updateWarns(dt) {
    for (const w of warns) {
      w.t -= dt;
      if (w.follow) { w.x = w.follow.x; w.y = w.follow.y - (w.follow.kind === 'cuca' ? 6 : 0); if (w.follow.st === 'coil' || w.follow.st === 'jaim') w.a = w.follow.ang; }
      if (w.t <= 0 && w.then) { const f = w.then; w.then = null; f(); }
    }
    warns = warns.filter(w => w.t > 0);
    for (const f of fxs) {
      f.t -= dt;
      if (f.kind === 'shock' && !f.hit) {
        const r = lerp(f.r0, f.r1, 1 - f.t / f.max), d = dist(f.x, f.y, player.x, player.y);
        if (Math.abs(d - r) < 6 && !invulnerable() && state === 'play') { f.hit = true; hurtPlayer(2, f.x, f.y, 200); }
      }
    }
    fxs = fxs.filter(f => f.t > 0);
  }

  /* =====================================================================
     DESENHO
     ===================================================================== */
  let W = 240, H = 176, k = 1;
  let camX = 0, camY = 0;
  const lightC = document.createElement('canvas'), lg = lightC.getContext('2d');
  const scan = document.createElement('canvas');
  const FONT = '"Share Tech Mono", ui-monospace, monospace', FONT2 = 'Orbitron, sans-serif';
  function text(s, x, y, size, color, align = 'left', font = FONT, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.font = `${font === FONT2 ? 900 : 400} ${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#05020a'; ctx.fillText(s, x + 0.6, y + 0.6);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
    ctx.globalAlpha = 1;
  }
  function wrapText(s, maxW, size) {
    ctx.font = `${size}px ${FONT}`;
    const words = s.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function sprite(img, x, y, flip, wht, alpha = 1) {
    // âncora: base central
    ctx.globalAlpha = alpha;
    const im = wht ? white(img) : img;
    if (flip) { ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); ctx.drawImage(im, -Math.round(img.width / 2), Math.round(y - img.height)); ctx.restore(); }
    else ctx.drawImage(im, Math.round(x - img.width / 2), Math.round(y - img.height));
    ctx.globalAlpha = 1;
  }
  function shadow(x, y, rx, ry = rx * 0.4) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  }
  const keyName = { kb: { ANDAR: 'WASD/setas', GOLPE: 'J/Espaço', ROLAR: 'K/Shift', ITEM: 'L/E', TROCA: 'Q', MAPA: 'Tab' }, touch: { ANDAR: 'o joystick', GOLPE: 'GOLPE', ROLAR: 'ROLAR', ITEM: 'ITEM', TROCA: 'TROCA', MAPA: 'o botão 🗺️' }, pad: { ANDAR: 'o analógico', GOLPE: 'A', ROLAR: 'B', ITEM: 'X', TROCA: 'Y', MAPA: 'Select' } };
  let lastInput = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb';
  const fillTokens = s => s.replace(/\{(\w+)\}/g, (m, kk) => keyName[lastInput][kk] || m);

  function updateCamera(dt, snap) {
    const p = player;
    let tx = p.x - W / 2 + p.fx * 10, ty = p.y - 8 - H / 2 + p.fy * 8;
    const mw = L.W * T, mh = L.H * T;
    tx = mw <= W ? (mw - W) / 2 : clamp(tx, 0, mw - W);
    ty = mh <= H - 14 ? (mh - H) / 2 : clamp(ty, -14, mh - H);
    if (snap) { camX = tx; camY = ty; } else { camX += (tx - camX) * Math.min(1, dt * 7); camY += (ty - camY) * Math.min(1, dt * 7); }
  }

  function drawTiles(cx, cy) {
    const tx0 = Math.max(0, Math.floor(cx / T)), ty0 = Math.max(0, Math.floor(cy / T));
    const tx1 = Math.min(L.W - 1, Math.floor((cx + W) / T)), ty1 = Math.min(L.H - 1, Math.floor((cy + H) / T) + 1);
    const tm = L.time;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const c = L.t[ty * L.W + tx], X = tx * T, Y = ty * T;
      switch (c) {
        case '~': ctx.fillStyle = 'rgba(120,210,255,0.35)'; ctx.fillRect(X + ((tm * 6 + tx * 5) % 16), Y + 7 + Math.sin(tm * 2 + tx) * 2, 4, 1); break;
        case 'W': ctx.fillStyle = 'rgba(80,170,255,0.25)'; ctx.fillRect(X + ((tm * 4 + ty * 7) % 16), Y + 5 + Math.sin(tm * 1.5 + tx + ty) * 3, 5, 1); break;
        case 'L': ctx.globalAlpha = 0.35 + 0.25 * Math.sin(tm * 3 + tx * 1.7 + ty); ctx.fillStyle = '#ffb000'; ctx.fillRect(X + 3 + Math.sin(tm + ty) * 3, Y + 5 + Math.cos(tm * 1.3 + tx) * 3, 6, 4); ctx.globalAlpha = 1; break;
        case '^': {
          const s = spikeState(tx, ty);
          ctx.fillStyle = '#120818'; for (const [a, b] of [[3, 3], [10, 3], [6, 9], [12, 11], [2, 11]]) ctx.fillRect(X + a, Y + b, 2, 2);
          if (s) {
            const hgt = s === 1 ? 2 : 5, col = s === 1 ? '#7a7a8a' : '#e8e8f4';
            for (const [a, b] of [[3, 3], [10, 3], [6, 9], [12, 11], [2, 11]]) { ctx.fillStyle = col; ctx.fillRect(X + a, Y + b + 2 - hgt, 2, hgt); if (s === 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(X + a, Y + b + 2 - hgt, 1, 1); } }
          }
          break;
        }
        case ';': {
          const s = brasaState(tx, ty);
          ctx.fillStyle = s === 0 ? '#2a1410' : s === 1 ? '#7a2a0e' : '#c8400e'; ctx.fillRect(X + 1, Y + 1, 14, 14);
          ctx.fillStyle = s === 0 ? '#5a1a0a' : '#ffb000';
          for (let i = 0; i < 4; i++) ctx.fillRect(X + 2 + ((hash(tx + i, ty) * 11) | 0), Y + 2 + ((hash(tx, ty + i) * 11) | 0), 2, 2);
          if (s === 2) { ctx.fillStyle = '#ffd400'; for (let i = 0; i < 3; i++) { const fx = X + 3 + i * 5, fh = 4 + Math.sin(tm * 18 + i + tx) * 2; ctx.fillRect(fx, Y + 9 - fh, 2, fh); } }
          break;
        }
        case '_': {
          const cr = L.crumb.get(ty * L.W + tx);
          if (cr && cr.gone > 0) { ctx.fillStyle = '#000'; ctx.fillRect(X, Y, T, T); ctx.fillStyle = '#1a1020'; ctx.fillRect(X, Y, T, 3); break; }
          const j = cr && cr.shake > 0 ? (Math.random() - 0.5) * 2 : 0;
          ctx.fillStyle = '#5a4030'; ctx.fillRect(X + 1 + j, Y + 1, 14, 14);
          ctx.fillStyle = '#3a2818'; ctx.fillRect(X + 1 + j, Y + 5, 14, 1); ctx.fillRect(X + 1 + j, Y + 10, 14, 1); ctx.fillRect(X + 7 + j, Y + 1, 1, 14);
          ctx.fillStyle = '#7a5a40'; ctx.fillRect(X + 2 + j, Y + 2, 4, 1);
          break;
        }
        case 'D':
          ctx.fillStyle = '#4a2a14'; ctx.fillRect(X, Y, T, T); ctx.fillStyle = '#6a3e1e'; ctx.fillRect(X + 1, Y + 1, 14, 14);
          ctx.fillStyle = '#3a1e0a'; ctx.fillRect(X + 5, Y + 1, 1, 14); ctx.fillRect(X + 10, Y + 1, 1, 14);
          ctx.fillStyle = '#ffd400'; ctx.fillRect(X + 6, Y + 6, 4, 4); ctx.fillStyle = '#120818'; ctx.fillRect(X + 7, Y + 7, 2, 2);
          break;
        case 'G': case 'H': case 'X': {
          const closed = c === 'G' ? !L.gatesOpen : c === 'H' ? L.plateT <= 0 : L.arenaClosed;
          const col = c === 'X' ? '#ff3b5c' : c === 'H' ? '#ffd400' : '#00e5ff';
          if (closed) {
            ctx.fillStyle = '#1a1424'; ctx.fillRect(X, Y, T, T);
            ctx.fillStyle = '#6a6a7e'; for (let i = 1; i < T; i += 4) ctx.fillRect(X + i, Y, 2, T);
            ctx.fillStyle = col; ctx.globalAlpha = 0.8; ctx.fillRect(X, Y + 2, T, 1); ctx.fillRect(X, Y + 13, T, 1); ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = col; ctx.globalAlpha = 0.35; ctx.fillRect(X, Y, 1, T); ctx.fillRect(X + 15, Y, 1, T); ctx.globalAlpha = 1;
            if (c === 'H' && L.plateT > 0) { ctx.fillStyle = col; ctx.fillRect(X + 2, Y + 1, (L.plateT / 6) * 12, 1); }
          }
          break;
        }
        case '=': {
          ctx.fillStyle = '#3a3448'; ctx.fillRect(X + 3, Y + 10, 10, 5); ctx.fillStyle = '#5a5470'; ctx.fillRect(X + 4, Y + 10, 8, 1);
          const on = L.gatesOpen;
          ctx.fillStyle = '#9a8ab0'; ctx.save(); ctx.translate(X + 8, Y + 11); ctx.rotate(on ? 0.6 : -0.6); ctx.fillRect(-1, -9, 2, 9); ctx.fillStyle = on ? '#39ff14' : '#ff3b5c'; ctx.fillRect(-2, -11, 4, 3); ctx.restore();
          break;
        }
        case 'p': if (L.plateT > 0) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(X + 3, Y + 3, 10, 10); } break;
        case 'Y': {
          ctx.strokeStyle = '#c8c8d8'; ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5 + i * 0.15; ctx.beginPath(); ctx.ellipse(X + 8, Y + 12 - i * 4, 7 - i * 1.5, 2.5, 0, tm * 6 + i, tm * 6 + i + 4.4); ctx.stroke(); }
          ctx.globalAlpha = 1;
          break;
        }
        case 'i': { const fl = Math.sin(tm * 14 + tx * 3) > 0; ctx.fillStyle = '#ffd400'; ctx.fillRect(X + 7, Y + 3 + (fl ? 0 : 1), 2, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(X + 7, Y + 5, 1, 1); break; }
        case 't': { const f = Math.sin(tm * 12 + tx * 2) * 1.5; ctx.fillStyle = '#ff7a1a'; ctx.fillRect(X + 5, Y + 3 - f, 6, 6 + f); ctx.fillStyle = '#ffd400'; ctx.fillRect(X + 6, Y + 5 - f * 0.5, 4, 4); ctx.fillStyle = '#ffffff'; ctx.fillRect(X + 7, Y + 6, 2, 2); break; }
        case 'E':
          if (!L.exitOpen) {
            if (L.def.n === 10) { ctx.fillStyle = L.theme.floor[0]; ctx.fillRect(X, Y, T, T); }
            else { ctx.strokeStyle = '#b26bff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X + 2, Y + 2); ctx.lineTo(X + 14, Y + 14); ctx.moveTo(X + 14, Y + 2); ctx.lineTo(X + 2, Y + 14); ctx.stroke(); }
          }
          break;
        case 'm': {
          sprite(ART.boto, X + 8, Y + 15, false, false);
          ctx.fillStyle = '#6a4a2a'; ctx.fillRect(X + 14, Y + 6, 8, 9); ctx.fillStyle = '#39ff14'; ctx.fillRect(X + 15, Y + 7, 2, 3); ctx.fillStyle = '#ff3b5c'; ctx.fillRect(X + 18, Y + 7, 2, 3); ctx.fillStyle = '#00e5ff'; ctx.fillRect(X + 15, Y + 11, 2, 3);
          break;
        }
      }
    }
    // baús e emissores
    for (const ch of L.chests) sprite(ch.open ? ICON.chestOpen : ICON.chest, ch.x * T + 8, ch.y * T + 14, false, false);
    for (const e of L.emit) {
      const X = e.x * T, Y = e.y * T;
      if (X < cx - T || X > cx + W || Y < cy - T || Y > cy + H) continue;
      if (e.kind === 'f') {
        const s = jetState(e);
        if (s === 2) {
          const len = e.len * T;
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) {
            const w = 8 - i * 2, col = ['#ff3b5c', '#ff7a1a', '#ffd400'][i];
            ctx.fillStyle = col; ctx.globalAlpha = 0.75;
            const fl = Math.sin(L.time * 30 + i) * 2;
            if (e.dx) ctx.fillRect(e.dx > 0 ? X + 16 : X - len, Y + 8 - w / 2 + fl * 0.3, len, w);
            else ctx.fillRect(X + 8 - w / 2 + fl * 0.3, e.dy > 0 ? Y + 16 : Y - len, w, len);
          }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    for (const f of L.fires) {
      const fh = 5 + Math.sin(L.time * 20 + f.x) * 2;
      ctx.globalAlpha = Math.min(1, f.t * 2);
      ctx.fillStyle = '#ff3b5c'; ctx.fillRect(f.x - 4, f.y - fh, 8, fh);
      ctx.fillStyle = '#ffd400'; ctx.fillRect(f.x - 2, f.y - fh + 2, 4, fh - 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawItems() {
    const tm = time;
    for (const it of L.items) {
      const bob = Math.sin(tm * 4 + it.x) * 1.5;
      shadow(it.x, it.y + 4, 3);
      if (it.type === 'coin') sprite(ICON.coin[((tm * 8 + it.x) | 0) % 4], it.x, it.y + 3 + bob, false, false);
      else if (it.type === 'key') sprite(ICON.key, it.x, it.y + 3 + bob, false, false);
      else if (it.type === 'potion') sprite(ICON.potion, it.x, it.y + 4 + bob, false, false);
      else if (it.type === 'pack') sprite(ICON.pack, it.x, it.y + 4 + bob, false, false);
      else if (it.type === 'sack') sprite(ICON.sack, it.x, it.y + 4 + bob, false, false);
      else if (it.type === 'heart') sprite(ICON.up, it.x, it.y + 4 + bob, false, false);
    }
    for (const b of bombs) {
      shadow(b.x, b.y + 1, 4);
      const blink = b.t < 0.6 ? ((b.t * 20) | 0) % 2 : ((b.t * 6) | 0) % 2;
      sprite(blink ? white(ICON.bomb) : ICON.bomb, b.x, b.y + 2, false, false);
    }
  }

  function drawPlayer() {
    const p = player;
    if (p.dead && state === 'dying' && stateT > 0.9) return;
    const fr = p.moving ? (((p.anim * 8) | 0) % 2 ? 'a' : 'b') : 'i';
    const img = HSPR[p.face + fr] || HSPR.downi;
    const blink = p.inv > 0 && ((p.inv * 14) | 0) % 2 === 0;
    let sc = 1;
    if (p.falling > 0) sc = p.falling / 0.55;
    if (p.falling <= 0) shadow(p.x, p.y + 3, 5);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y + 3 - 8 * (1 - sc)));
    if (p.roll > 0) { ctx.translate(0, -7); ctx.rotate((1 - p.roll / ROLL_T) * TAU * (p.rdx < 0 ? -1 : 1)); ctx.translate(0, 7); }
    if (p.dead) ctx.rotate(Math.min(1.5, stateT * 3));
    if (p.spin > 0) ctx.scale(Math.cos(p.spin * 20), 1);
    ctx.scale(sc * (p.face === 'side' && p.flip ? -1 : 1), sc);
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.drawImage(p.inv > HURT_INV - 0.1 ? HSPR.white : img, -6, -16);
    ctx.globalAlpha = 1;
    ctx.restore();
    // facão
    if (p.atk > 0 && !p.dead) {
      const prog = 1 - p.atk / p.atkMax, cx = p.x, cy = p.y - 5;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      if (p.atkN === 3) {
        const a = p.atkAng + prog * TAU * 1.1;
        ctx.strokeStyle = 'rgba(178,107,255,0.55)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, cy, 17, a - 2.2, a); ctx.stroke();
        ctx.strokeStyle = 'rgba(232,251,255,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 18, a - 1.2, a); ctx.stroke();
      } else {
        const dir = p.atkN === 2 ? -1 : 1;
        const a0 = p.atkAng - 1.2 * dir, a = a0 + 2.4 * dir * Math.min(1, prog * 1.3);
        ctx.strokeStyle = 'rgba(0,229,255,0.45)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, cy, 14, Math.min(a0, a), Math.max(a0, a)); ctx.stroke();
        ctx.strokeStyle = 'rgba(232,251,255,0.95)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); ctx.lineTo(cx + Math.cos(a) * 19, cy + Math.sin(a) * 19); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (!p.dead && p.roll <= 0 && p.falling <= 0) {
      // facão na mão
      const side = p.face === 'side' ? (p.flip ? -1 : 1) : 1;
      ctx.fillStyle = '#c8d8e8'; ctx.fillRect(Math.round(p.x + side * 5), Math.round(p.y - 9), 1, 5);
      ctx.fillStyle = '#7a4a2a'; ctx.fillRect(Math.round(p.x + side * 5), Math.round(p.y - 4), 1, 2);
    }
  }

  function drawEnemy(e) {
    const fr = ((e.anim * (e.fly ? 10 : 6)) | 0) % 2;
    const jit = e.tel > 0 ? Math.round(Math.sin(time * 60)) : 0;
    const wht = e.flash > 0;
    if (e.type === 'e') {
      if (e.st === 'under' || e.st === 'rise') {
        if (e.awake || e.st === 'rise') sprite(ART.mound, e.x + jit, e.y + 2, false, false);
        if (e.st === 'rise') sprite(ART.e[0], e.x, e.y + 2 - (1 - e.t / 0.6) * 10, false, wht, 0.6);
        return;
      }
      if (e.st === 'dig') { sprite(ART.mound, e.x, e.y + 2, false, false); sprite(ART.e[0], e.x, e.y + 2 + (1 - e.t / 0.5) * 8, false, wht, 1 - (1 - e.t / 0.5)); return; }
    }
    let img = e.type === 'd' ? null : ART[e.type][fr];
    if (e.type === 'c' && e.st === 'prep') img = ART.c[2];
    let y = e.y + 2, alpha = 1;
    if (e.fly) { shadow(e.x, e.y + 4, 4); y -= 6 + Math.sin(e.anim * 5) * 2; }
    else shadow(e.x, e.y + 2, e.r);
    if (e.type === 's') {
      y -= Math.abs(Math.sin(e.hop || 0)) * 3;
      if (e.st === 'swirl' || e.st === 'appear') alpha = 0.3 + Math.random() * 0.4;
    }
    if (e.type === 'a' && e.st === 'leap') y -= Math.sin((1 - e.t / 0.38) * Math.PI) * 6;
    if (e.type === 'd') {
      ctx.globalCompositeOperation = 'lighter';
      const r = 5 + Math.sin(e.anim * 8) * 1 + (e.tel > 0 ? 2 : 0);
      ctx.drawImage(GLOW.wisp, e.x - r * 2, y - 8 - r * 2, r * 4, r * 4);
      ctx.fillStyle = '#e8fffa'; ctx.beginPath(); ctx.arc(e.x, y - 8, r * 0.45, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    if (e.stun > 0 && e.st !== 'stun') alpha *= 0.85;
    sprite(img, e.x + jit, y, e.dir < 0, wht, alpha);
    if (e.st === 'stun' || e.stun > 0.3) for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; ctx.fillStyle = '#ffd400'; ctx.fillRect(e.x + Math.cos(a) * 6, y - img.height - 2 + Math.sin(a) * 2, 2, 2); }
  }

  function drawBoss(b) {
    if (b.dead && b.deathT <= 0) return;
    const wht = b.flash > 0, fr = ((b.anim * 6) | 0) % 2;
    const jit = b.st === 'scrape' || b.st === 'coil' || b.st === 'transform' || b.st === 'lift' ? Math.round(Math.sin(time * 50)) : 0;
    const alpha = b.dead ? Math.max(0, b.deathT / 2) : 1;
    switch (b.kind) {
      case 'iara': {
        if (b.st === 'under') return;
        const up = b.st === 'rise' ? 1 - b.t / b.tmax : 1;
        const h = Math.round(16 * up);
        ctx.globalAlpha = alpha;
        ctx.drawImage(wht ? white(ART.iara) : ART.iara, 0, 0, 22, h, Math.round(b.x - 11), Math.round(b.y - h + 2), 22, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(160,240,255,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(b.x, b.y + 2, 10 + Math.sin(time * 4) * 1.5, 3, 0, 0, TAU); ctx.stroke();
        break;
      }
      case 'curupira': {
        if (b.st === 'hide') {
          // só as pegadas viradas denunciam
          if (((time * 3) | 0) % 2) { ctx.fillStyle = 'rgba(255,90,26,0.4)'; ctx.fillRect(b.x - 3, b.y, 2, 1); }
          return;
        }
        shadow(b.x, b.y + 2, 6);
        sprite(ART.curu[b.st === 'dash' ? fr : 0], b.x + jit, b.y + 2, b.dir < 0, wht, alpha);
        if (b.st === 'dizzy') for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; ctx.fillStyle = '#ffd400'; ctx.fillRect(b.x + Math.cos(a) * 7, b.y - 21 + Math.sin(a) * 2, 2, 2); }
        break;
      }
      case 'mula': {
        shadow(b.x, b.y + 2, 15, 4);
        const img = ART.mula[b.st === 'charge' || b.st === 'idle' ? fr : 0];
        sprite(img, b.x + jit, b.y + 3 - (b.st === 'rear' ? 4 : 0), b.dir < 0, wht, alpha);
        // fogo no lugar da cabeça
        const nx = b.x + b.dir * 14, ny = b.y - 19, big = b.st === 'brasas' ? 1.8 : 1;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const fh = (8 + Math.sin(time * 20 + i * 1.7) * 3) * big, fx = nx + (i - 2) * 2 * big;
          ctx.fillStyle = ['#ff3b5c', '#ff7a1a', '#ffd400', '#ff7a1a', '#ff3b5c'][i];
          ctx.fillRect(fx - 1.5, ny - fh, 3, fh);
        }
        ctx.globalCompositeOperation = 'source-over';
        if (b.st === 'stun') for (let i = 0; i < 4; i++) { const a = time * 5 + i * 1.6; ctx.fillStyle = '#ffd400'; ctx.fillRect(b.x + Math.cos(a) * 12, b.y - 28 + Math.sin(a) * 3, 2, 2); }
        break;
      }
      case 'mapinguari': {
        shadow(b.x, b.y + 2, 16, 5);
        const open = b.st === 'open' || b.st === 'inhale';
        sprite(open ? ART.mapiOpen : ART.mapi[b.st === 'walk' ? fr : 0], b.x + jit, b.y + 3 - (b.st === 'lift' ? 3 : 0), false, wht, alpha);
        if (b.st === 'tired') for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; ctx.fillStyle = '#ffd400'; ctx.fillRect(b.x + Math.cos(a) * 10, b.y - 42 + Math.sin(a) * 3, 2, 2); }
        break;
      }
      case 'boitata': {
        ctx.globalAlpha = alpha;
        for (let i = 12; i >= 1; i--) {
          const tp = b.trail[Math.min(b.trail.length - 1, i * 4)];
          const r = 6.5 - i * 0.18;
          ctx.fillStyle = i % 2 ? '#c8400e' : '#ff5a1a'; ctx.beginPath(); ctx.arc(tp.x, tp.y, r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(tp.x, tp.y - 1, r * 0.5, 0, TAU); ctx.fill();
        }
        ctx.save(); ctx.translate(b.x + jit, b.y); ctx.rotate(b.ang + Math.PI / 2);
        ctx.drawImage(wht ? white(ART.boiHead) : ART.boiHead, -9, -8);
        ctx.restore();
        ctx.globalAlpha = 1;
        if (b.st === 'tired') for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x + Math.cos(a) * 8, b.y - 12 + Math.sin(a) * 2, 2, 2); }
        break;
      }
      case 'saci': {
        const a = b.st === 'swirl' ? 0.25 + Math.random() * 0.3 : alpha;
        shadow(b.x, b.y + 2, 5);
        sprite(ART.saciBoss[fr], b.x + jit, b.y + 2 - Math.abs(Math.sin(b.hop || 0)) * 4, b.dir < 0, wht || b.stun > 0, a);
        if (b.stun > 0 || b.st === 'smoke') for (let i = 0; i < 3; i++) { const aa = time * 6 + i * 2.1; ctx.fillStyle = b.stun > 0 ? '#ffffff' : '#c8c8d8'; ctx.fillRect(b.x + Math.cos(aa) * 7, b.y - 24 + Math.sin(aa) * 2, 2, 2); }
        break;
      }
      case 'cuca': {
        if (b.phase === 2 || (b.phase === 3 && b.st === 'transform')) {
          // o caldeirão
          const X = b.cx, Y = b.cy + 6;
          ctx.fillStyle = '#1a1424'; ctx.beginPath(); ctx.ellipse(X, Y + 2, 14, 10, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2e2440'; ctx.beginPath(); ctx.ellipse(X, Y, 13, 8, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = b.st === 'bubble' ? '#7dff3a' : '#39a01a'; ctx.beginPath(); ctx.ellipse(X, Y - 4, 11, 3.5, 0, 0, TAU); ctx.fill();
          for (let i = 0; i < 3; i++) { ctx.fillStyle = '#b8ff8a'; ctx.fillRect(X - 6 + i * 5, Y - 6 - ((time * 8 + i * 3) % 4), 2, 2); }
        }
        if (b.phase === 3 && b.st !== 'transform') {
          shadow(b.x, b.y + 2, 20, 5);
          sprite(ART.jacare[b.st === 'jcharge' || b.st === 'jidle' ? fr : 0], b.x + jit, b.y + 4, b.dir < 0, wht, alpha);
          if (b.st === 'stun') for (let i = 0; i < 4; i++) { const a = time * 5 + i * 1.6; ctx.fillStyle = '#ffd400'; ctx.fillRect(b.x + Math.cos(a) * 14, b.y - 28 + Math.sin(a) * 3, 2, 2); }
        } else {
          const fy = b.st === 'transform' ? 0 : Math.sin(time * 2.5) * 2;
          shadow(b.x, b.y + 2, 9);
          const showJ = b.st === 'transform' && ((time * 10) | 0) % 2;
          if (showJ) sprite(ART.jacare[0], b.x, b.y + 4, b.dir < 0, true, 0.8);
          else sprite(ART.cuca[fr], b.x + jit, b.y + 2 + fy - 4, false, wht, alpha);
          if (b.st === 'spell' || b.st === 'bubble') {
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + Math.sin(time * 20) * 0.3;
            ctx.drawImage(GLOW.green, b.x - 22, b.y - 22, 14, 14); ctx.drawImage(GLOW.green, b.x + 8, b.y - 22, 14, 14);
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          }
        }
        break;
      }
    }
  }

  function drawLight(cx, cy) {
    if (codes.has('LANTERNA')) return;
    if (lightC.width !== W || lightC.height !== H) { lightC.width = W; lightC.height = H; }
    const [r0, g0, b0] = L.theme.dark;
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, W, H);
    lg.fillStyle = `rgba(${r0},${g0},${b0},${state === 'menu' ? Math.min(0.85, L.def.escuro) : L.def.escuro})`;
    lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a = 1, img = GLOW.light) => {
      if (x + r < cx || x - r > cx + W || y + r < cy || y - r > cy + H) return;
      lg.globalAlpha = a; lg.drawImage(img, x - cx - r, y - cy - r, r * 2, r * 2);
    };
    const p = player;
    if (!(p.dead && stateT > 1)) {
      const r = lanternR() + Math.sin(time * 9) * 1.5 + Math.sin(time * 23) * 0.8;
      hole(p.x + p.fx * 8, p.y - 6 + p.fy * 6, r, 1);
      hole(p.x, p.y - 6, 22, 1, GLOW.soft);
    }
    for (const l of L.lights) hole(l.x, l.y, l.r + Math.sin(time * 7 * l.flick + l.x) * 2 * l.flick, 0.9);
    const tx0 = Math.max(0, Math.floor(cx / T)), ty0 = Math.max(0, Math.floor(cy / T));
    const tx1 = Math.min(L.W - 1, Math.floor((cx + W) / T)), ty1 = Math.min(L.H - 1, Math.floor((cy + H) / T) + 1);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const c = L.t[ty * L.W + tx];
      if (c === 'L' && (tx + ty) % 2 === 0) hole(tx * T + 8, ty * T + 8, 26, 0.55, GLOW.soft);
      else if (c === ';') { const s = brasaState(tx, ty); if (s) hole(tx * T + 8, ty * T + 8, s === 2 ? 22 : 14, 0.7, GLOW.soft); }
      else if (c === 'Y') hole(tx * T + 8, ty * T + 8, 18, 0.6, GLOW.soft);
      else if (c === '%') hole(tx * T + 8, ty * T + 8, 9, 0.25, GLOW.soft);
    }
    for (const e of L.emit) {
      if (e.kind === 'f' && jetState(e) === 2) hole(e.x * T + 8 + e.dx * T * 2, e.y * T + 8 + e.dy * T * 2, 40, 0.9);
      else if (e.kind === 'f' && jetState(e) === 1) hole(e.x * T + 8 + e.dx * 10, e.y * T + 8 + e.dy * 10, 12, 0.8, GLOW.soft);
    }
    for (const f of L.fires) hole(f.x, f.y - 3, 18, 0.7, GLOW.soft);
    for (const s of shots) hole(s.x, s.y, s.kind === 'pellet' ? 10 : 18, 0.8, GLOW.soft);
    for (const bm of bombs) hole(bm.x, bm.y - 6, 14, 0.7, GLOW.soft);
    for (const f of fxs) if (f.kind === 'boom') hole(f.x, f.y, 70 * (f.t / f.max) + 20, 1);
    for (const b of L.boulders) if (b.state === 'shake' || b.state === 'roll') hole(b.x, b.y, 22, 0.8, GLOW.soft);
    for (const e of L.enemies) if (!e.dead && e.type === 'd') hole(e.x, e.y - 14, 30, 0.9);
    for (const b of L.bosses) {
      if (b.dead && b.deathT <= 0) continue;
      if (b.kind === 'boitata') { hole(b.x, b.y, 40, 1); for (let i = 3; i <= 12; i += 3) { const tp = b.trail[Math.min(b.trail.length - 1, i * 4)]; hole(tp.x, tp.y, 26, 0.8, GLOW.soft); } }
      else if (b.kind === 'mula') hole(b.x + b.dir * 14, b.y - 22, 40, 0.9);
      else if (b.kind === 'curupira' && b.st !== 'hide') hole(b.x, b.y - 16, 22, 0.8, GLOW.soft);
      else if (b.active && b.kind === 'cuca') hole(b.x, b.y - 12, 34, 0.7, GLOW.soft);
      else if (b.active && b.kind === 'saci') hole(b.x + b.dir * 10, b.y - 12, 16, 0.7, GLOW.soft);
    }
    if (flash > 0) { lg.globalAlpha = Math.min(1, flash * 2); lg.fillRect(0, 0, W, H); }
    lg.globalAlpha = 1;
    lg.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightC, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.restore();
  }
  // Halos coloridos por cima da escuridão (poucos por quadro).
  function drawGlows(cx, cy) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of L.lights) {
      if (l.x < cx - 40 || l.x > cx + W + 40 || l.y < cy - 40 || l.y > cy + H + 40) continue;
      const r = l.kind === 'candle' ? 14 : 22;
      ctx.globalAlpha = 0.35 + Math.sin(time * 8 * l.flick + l.y) * 0.1;
      ctx.drawImage(l.glow, l.x - r, l.y - r - (l.kind === 'torch' ? 14 : 4), r * 2, r * 2);
    }
    for (const b of L.bosses) if (b.kind === 'boitata' && !(b.dead && b.deathT <= 0)) { ctx.globalAlpha = 0.5; ctx.drawImage(GLOW.lava, b.x - 30, b.y - 30, 60, 60); }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const EYES = {
    r: [[5], -5, '#ff3b5c'], b: [[-1, 1], -6, '#ffe066'], a: [[-1, 1], -10, '#ff3b5c'], c: [[-3, 3], -10, '#e8d040'],
    z: [[-1, 1], -12, '#b26bff'], q: [[-1, 1], -12, '#b26bff'], h: [[5], -6, '#ff7a1a'], e: [[-1, 1], -14, '#ffcc33'],
    l: [[0, 2], -16, '#ff3b5c'], s: [[-1, 1], -13, '#ffffff'],
  };
  // Avisos de ataque, olhos e projéteis: desenhados por cima da escuridão para o jogo ser justo.
  function drawMarks() {
    const tm = time;
    for (const w of warns) {
      const prog = 1 - w.t / w.max, blink = 0.45 + 0.35 * Math.sin(tm * 30);
      ctx.strokeStyle = w.color; ctx.fillStyle = w.color;
      if (w.kind === 'circle') {
        ctx.globalAlpha = 0.18 + prog * 0.25; ctx.beginPath(); ctx.arc(w.x, w.y, w.r * prog, 0, TAU); ctx.fill();
        ctx.globalAlpha = blink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
        if (w.lob) {
          const x = lerp(w.lob.x0, w.x, prog), y = lerp(w.lob.y0, w.y, prog) - Math.sin(prog * Math.PI) * 40;
          ctx.globalAlpha = 1; ctx.drawImage(ICON.potion, x - 4, y - 5);
        }
      } else if (w.kind === 'line') {
        ctx.globalAlpha = blink; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(w.a) * w.len, w.y + Math.sin(w.a) * w.len); ctx.stroke(); ctx.setLineDash([]);
      } else if (w.kind === 'arc') {
        ctx.globalAlpha = 0.15 + prog * 0.3; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.arc(w.x, w.y, w.r, w.a - 1.4, w.a + 1.4); ctx.closePath(); ctx.fill();
      } else if (w.kind === 'ripple') {
        ctx.globalAlpha = blink; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(w.x, w.y, ((prog * 3 + i) % 3) * 5 + 3, ((prog * 3 + i) % 3) * 2 + 1, 0, 0, TAU); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }
    for (const f of fxs) {
      const pr = 1 - f.t / f.max;
      if (f.kind === 'ring') { ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - pr; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + pr * 0.5), 0, TAU); ctx.stroke(); }
      else if (f.kind === 'shock') { const r = lerp(f.r0, f.r1, pr); ctx.strokeStyle = '#ffd400'; ctx.globalAlpha = 0.9 * (1 - pr * 0.6); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.6, 0, 0, TAU); ctx.stroke(); }
      else if (f.kind === 'eslash') {
        const R = f.huge ? 30 : f.big ? 18 : 14;
        ctx.strokeStyle = '#ff3b5c'; ctx.globalAlpha = 1 - pr; ctx.lineWidth = f.huge ? 4 : 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, R, f.a - 1.1, f.a + 1.1); ctx.stroke();
      } else if (f.kind === 'boom') {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f.t / f.max;
        ctx.drawImage(GLOW.warm, f.x - 34, f.y - 34, 68, 68);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    // olhos e "!" de aviso
    for (const e of L.enemies) {
      if (e.dead || (e.type === 'e' && e.st === 'under')) continue;
      const y = e.y - (e.fly ? 6 + Math.sin(e.anim * 5) * 2 : 0);
      const eye = EYES[e.type];
      if (eye) {
        // olhos acesos no escuro (posição relativa à base do sprite, virada para a direita)
        ctx.fillStyle = eye[2]; ctx.globalAlpha = 0.9;
        for (const ex of eye[0]) ctx.fillRect(Math.round(e.x + (e.dir < 0 ? -ex - 1 : ex)), Math.round(y + 2 + eye[1]), 1, 1);
        ctx.globalAlpha = 1;
      }
      if (e.tel > 0) text('!', e.x, y - e.r * 2 - 9 + Math.sin(tm * 30), 9, '#ff3b5c', 'center', FONT2);
      if (e.type === 'q' && e.st === 'aim') {
        ctx.strokeStyle = '#ff3b5c'; ctx.globalAlpha = e.t < 0.3 ? 0.9 : 0.4; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(e.x, e.y - 6); ctx.lineTo(e.x + Math.cos(e.ang) * 160, e.y - 6 + Math.sin(e.ang) * 160); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if ((e.type === 'h' || e.type === 'l') && e.st === 'prep') {
        const a = e.type === 'l' ? Math.atan2(e.wy - e.y, e.wx - e.x) : e.ang;
        ctx.strokeStyle = '#ff3b5c'; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(e.x, e.y - 3); ctx.lineTo(e.x + Math.cos(a) * 60, e.y - 3 + Math.sin(a) * 60); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    for (const b of L.bosses) {
      if (!b.active || b.dead) continue;
      if ((b.kind === 'mula' && b.st === 'scrape') || (b.kind === 'curupira' && b.st === 'aim')) {
        ctx.strokeStyle = '#ff3b5c'; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(tm * 30); ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.moveTo(b.x, b.y - 6); ctx.lineTo(b.x + Math.cos(b.ang) * 170, b.y - 6 + Math.sin(b.ang) * 170); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        text('!', b.x, b.y - 34, 11, '#ff3b5c', 'center', FONT2);
      }
      if (b.kind === 'saci' && b.st === 'swirl' && b.dest) {
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(b.dest.x, b.dest.y - i * 5, 8 - i * 2, 3, 0, tm * 8 + i, tm * 8 + i + 4); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      if (b.kind === 'cuca' && b.st === 'tele' && b.dest) { ctx.globalAlpha = 0.6; ctx.drawImage(GLOW.purple, b.dest.x - 14, b.dest.y - 24, 28, 28); ctx.globalAlpha = 1; }
      if (b.kind === 'cuca' && b.st === 'laugh') text('HA HA HA!', b.x, b.y - 38 + Math.sin(tm * 12) * 2, 8, '#7dff3a', 'center', FONT2);
      if (b.kind === 'mapinguari' && (b.st === 'open' || b.st === 'raise' || b.st === 'lift')) text('!', b.x, b.y - 46, 12, '#ff3b5c', 'center', FONT2);
      if ((b.kind === 'iara' && (b.st === 'jets' || (b.st === 'song' && b.t > b.tmax - 0.6))) || (b.kind === 'cuca' && (b.st === 'spell' || b.st === 'potions' || b.st === 'tailup' || b.st === 'jaws'))) text('!', b.x, b.y - 32, 11, '#ff3b5c', 'center', FONT2);
      if (b.kind === 'mula' && b.st === 'brasas') text('!', b.x, b.y - 34, 11, '#ff3b5c', 'center', FONT2);
    }
    for (const bo of L.boulders) if (bo.state === 'shake') text('!', bo.x, bo.y - 16, 10, '#ff3b5c', 'center', FONT2);
    // setas e bicos prestes a disparar
    for (const em of L.emit) {
      const X = em.x * T + 8, Y = em.y * T + 8;
      const warn = em.kind === 'T' ? arrowWarn(em) : jetState(em) === 1;
      if (warn) { ctx.fillStyle = em.kind === 'T' ? '#ff3b5c' : '#ffd400'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tm * 40); ctx.fillRect(X + em.dx * 7 - 2, Y + em.dy * 7 - 2, 4, 4); ctx.globalAlpha = 1; }
    }
    // projéteis
    ctx.globalCompositeOperation = 'lighter';
    for (const s of shots) {
      const col = { arrow: '#e8e0c8', poison: '#7dff3a', bullet: '#ffd400', fire: '#ff7a1a', water: '#7affea', orb: '#b26bff', tornado: '#ffffff', pellet: '#c8d8e8' }[s.kind] || '#ffffff';
      if (s.kind === 'arrow') {
        const a = Math.atan2(s.vy, s.vx);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s.x - Math.cos(a) * 6, s.y - Math.sin(a) * 6); ctx.lineTo(s.x + Math.cos(a) * 2, s.y + Math.sin(a) * 2); ctx.stroke();
        ctx.fillStyle = '#ff3b5c'; ctx.fillRect(s.x - Math.cos(a) * 6 - 1, s.y - Math.sin(a) * 6 - 1, 2, 2);
      } else if (s.kind === 'tornado') {
        ctx.strokeStyle = col; ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(s.x, s.y + 4 - i * 4, 7 - i * 1.5, 2.5, 0, tm * 10 + i, tm * 10 + i + 4.5); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else {
        const r = s.r + 3;
        ctx.globalAlpha = 0.7; ctx.drawImage(s.kind === 'orb' ? GLOW.purple : s.kind === 'poison' ? GLOW.green : s.kind === 'water' ? GLOW.wisp : s.kind === 'pellet' ? GLOW.white : GLOW.lava, s.x - r * 2, s.y - r * 2, r * 4, r * 4);
        ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.75, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 0.5, s.y - 0.5, 1, 1);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const pp of popups) text(pp.text, pp.x, pp.y - (1 - pp.t) * 14, 7, pp.color, 'center', FONT, Math.min(1, pp.t * 3));
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      if (p.note) text('♪', p.x, p.y, 8, p.color, 'center');
      else { ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    }
    ctx.globalAlpha = 1;
  }

  function drawWorld() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    let cx = Math.round(camX), cy = Math.round(camY);
    if (shake > 0) { cx += Math.round((Math.random() - 0.5) * shake * 8); cy += Math.round((Math.random() - 0.5) * shake * 6); }
    // camada fixa (só o pedaço visível)
    const sx = Math.max(0, cx), sy = Math.max(0, cy);
    const sw = Math.min(L.layer.width - sx, W - (sx - cx)), sh = Math.min(L.layer.height - sy, H - (sy - cy));
    if (sw > 0 && sh > 0) ctx.drawImage(L.layer, sx, sy, sw, sh, sx - cx, sy - cy, sw, sh);
    ctx.save();
    ctx.translate(-cx, -cy);
    drawTiles(cx, cy);
    drawItems();
    // tudo o que fica de pé, ordenado pela altura na tela
    const list = [];
    for (const e of L.enemies) if (!e.dead && e.x > cx - 30 && e.x < cx + W + 30 && e.y > cy - 30 && e.y < cy + H + 40) list.push([e.y, 0, e]);
    for (const b of L.bosses) list.push([b.kind === 'boitata' ? 1e6 : b.y, 1, b]);
    for (const bo of L.boulders) if (bo.state !== 'gone') list.push([bo.y + 6, 2, bo]);
    list.push([player.y, 3, player]);
    list.sort((a, b) => a[0] - b[0]);
    for (const [, kind, o] of list) {
      if (kind === 0) drawEnemy(o);
      else if (kind === 1) drawBoss(o);
      else if (kind === 2) {
        const j = o.state === 'shake' ? Math.sin(time * 60) : 0;
        shadow(o.x, o.y + 6, 7);
        ctx.save(); ctx.translate(o.x + j, o.y); ctx.rotate(o.rot || 0);
        ctx.fillStyle = '#5a5048'; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7a6e62'; ctx.beginPath(); ctx.arc(-2, -2, 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#b26bff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(0, -3); ctx.lineTo(4, 2); ctx.stroke();
        ctx.restore();
      } else drawPlayer();
    }
    drawParticles();
    ctx.restore();
    drawLight(cx, cy);
    ctx.save();
    ctx.translate(-cx, -cy);
    drawGlows(cx, cy);
    drawMarks();
    ctx.restore();
  }

  /* ---------- HUD dentro da tela ---------- */
  function drawHearts(x, y) {
    const n = inv.maxHearts;
    for (let i = 0; i < n; i++) {
      const hx = x + (i % 10) * 9, hp = inv.hp - i * 2;
      ctx.drawImage(ICON.heartE, hx, y);
      if (hp >= 2) ctx.drawImage(ICON.heart, hx, y);
      else if (hp === 1) ctx.drawImage(ICON.heart, 0, 0, 4, 7, hx, y, 4, 7);
    }
    if (inv.hp <= 2 && state === 'play' && ((time * 4) | 0) % 2) { ctx.globalAlpha = 0.5; ctx.drawImage(white(ICON.heart), x, y); ctx.globalAlpha = 1; }
  }
  function drawHud() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = 'rgba(5,2,12,0.72)'; ctx.fillRect(0, 0, W, 22);
    ctx.fillStyle = 'rgba(178,107,255,0.4)'; ctx.fillRect(0, 22, W, 1);
    drawHearts(3, 3);
    ctx.drawImage(ICON.key, 3, 12); text('×' + inv.keys, 13, 17, 7, '#ffd400');
    ctx.drawImage(ICON.coin[0], 28, 13); text('×' + inv.coins, 37, 17, 7, '#ffd400');
    ctx.drawImage(HSPR.downi, 0, 0, 12, 9, 58, 13, 8, 6);
    text('×' + (codes.has('KONAMI') ? '∞' : lives), 67, 17, 7, '#ffffff');
    // item atual
    const own = ownedItems();
    const bx = W - 46;
    ctx.strokeStyle = 'rgba(178,107,255,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, 2.5, 16, 16);
    if (own.includes(inv.item)) {
      ctx.drawImage(ITEM_ICON[inv.item], bx + 3, 5);
      text(String(itemCount(inv.item)), bx + 20, 7, 7, itemCount(inv.item) ? '#ffffff' : '#ff3b5c');
      text(ITEM_NAME[inv.item], bx + 20, 16, 5, '#9a8bb8');
    } else text('—', bx + 8, 11, 7, '#5a4a70', 'center');
    text(`${L.def.n}F`, W - 4, 7, 7, L.theme.edge, 'right', FONT2);
    // barra de recarga do rolamento
    if (player.rollCd > 0 && state === 'play') {
      ctx.fillStyle = 'rgba(0,229,255,0.7)';
      const px0 = player.x - Math.round(camX) - 6, py0 = player.y - Math.round(camY) + 7;
      ctx.fillRect(px0, py0, 12 * (1 - player.rollCd / ROLL_CD), 1);
    }
    // vida do chefe
    const b = L.bosses.find(bb => bb.active && !bb.dead);
    if (b) {
      const bw = Math.min(W - 40, 180), x0 = (W - bw) / 2, y0 = H - 12;
      text(b.name, W / 2, y0 - 5, 7, '#ff3b5c', 'center', FONT2);
      ctx.fillStyle = '#1a0f24'; ctx.fillRect(x0 - 1, y0 - 1, bw + 2, 6);
      ctx.fillStyle = '#ff3b5c'; ctx.fillRect(x0, y0, bw * Math.max(0, b.hp / b.max), 4);
      ctx.fillStyle = '#ffb0c0'; ctx.fillRect(x0, y0, bw * Math.max(0, b.hp / b.max), 1);
      if (b.kind === 'cuca') { ctx.fillStyle = '#05020a'; ctx.fillRect(x0 + bw / 3, y0, 1, 4); ctx.fillRect(x0 + (bw * 2) / 3, y0, 1, 4); }
    }
    // placa, mensagem e faixa
    if (player.signNear && state === 'play') {
      const lines = wrapText(fillTokens(player.signNear), W - 30, 7);
      const bh = lines.length * 9 + 8, by = H - bh - (b ? 22 : 6);
      ctx.fillStyle = 'rgba(20,10,4,0.9)'; ctx.fillRect(10, by, W - 20, bh);
      ctx.strokeStyle = '#d9a441'; ctx.strokeRect(10.5, by + 0.5, W - 21, bh - 1);
      lines.forEach((l, i) => text(l, W / 2, by + 8 + i * 9, 7, '#f0e0c0', 'center'));
    } else if (msg) {
      const lines = wrapText(msg.text, W - 24, 7);
      lines.forEach((l, i) => text(l, W / 2, H - (b ? 30 : 14) - (lines.length - 1 - i) * 9, 7, msg.color, 'center', FONT, Math.min(1, msg.t * 2)));
    }
    if (banner) {
      const a = Math.min(1, banner.t * 2, (3.2 - banner.t) * 3);
      ctx.fillStyle = `rgba(5,2,12,${0.7 * a})`; ctx.fillRect(0, H * 0.32, W, 34);
      text(banner.title, W / 2, H * 0.32 + 12, 11, '#ff3b5c', 'center', FONT2, a);
      text(banner.sub, W / 2, H * 0.32 + 25, 7, '#ffffff', 'center', FONT, a);
    }
    if (findT > 0 && found) {
      const p = player, x = p.x - Math.round(camX), y = p.y - Math.round(camY) - 24;
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(GLOW.yellow, x - 14, y - 14, 28, 28); ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(found.icon, Math.round(x - found.icon.width / 2), Math.round(y - found.icon.height / 2));
    }
    if (found && findT > -1.8) {
      const a = Math.min(1, 1.8 + findT);
      ctx.fillStyle = `rgba(5,2,12,${0.8 * a})`; ctx.fillRect(14, 28, W - 28, 26);
      text(found.title, W / 2, 36, 9, '#ffd400', 'center', FONT2, a);
      wrapText(found.text, W - 36, 6).slice(0, 2).forEach((l, i) => text(l, W / 2, 45 + i * 7, 6, '#ffffff', 'center', FONT, a));
    }
    if (L.songOn > 0 && L.songWarn > 0) text('♪ ♪ ♪', W / 2, 32, 10, '#7affea', 'center');
  }

  function drawMap() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = 'rgba(5,2,12,0.97)'; ctx.fillRect(0, 0, W, H);
    text(`MAPA · ANDAR ${L.def.n} · ${L.def.nome}`, W / 2, 9, 7, '#b26bff', 'center', FONT2);
    const cs = Math.max(1, Math.min((W - 12) / L.W, (H - 30) / L.H));
    const ox = Math.round((W - L.W * cs) / 2), oy = Math.round(18 + (H - 26 - L.H * cs) / 2);
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      const i = y * L.W + x;
      if (!L.seen[i] && !codes.has('LANTERNA')) continue;
      const c = L.t[i];
      let col = null;
      if (WALL_CH.has(c)) col = c === '%' ? '#7a6a90' : '#3d2f52';
      else if (c === 'W' || c === '~') col = c === 'W' ? '#0e3a64' : '#1a5a8a';
      else if (c === 'L') col = '#a8300a';
      else if (c === 'O') col = '#000';
      else if (c === 'D') col = '#ffd400';
      else if (c === 'G' || c === 'H' || c === 'X') col = '#00e5ff';
      else if (c === 'E') col = L.exitOpen ? '#39ff14' : '#b26bff';
      else if (c === '$') col = L.chests.find(ch => ch.x === x && ch.y === y && !ch.open) ? '#ffb000' : '#5a4a30';
      else if (c === 'm') col = '#ff2bd6';
      else if (c === 'Y') col = '#ffffff';
      else if (SOLID_CH.has(c)) col = '#5a4a70';
      else col = '#1e1630';
      ctx.fillStyle = col; ctx.fillRect(ox + x * cs, oy + y * cs, Math.ceil(cs), Math.ceil(cs));
    }
    for (const b of L.bosses) if (!b.dead && L.seen[Math.floor(b.y / T) * L.W + Math.floor(b.x / T)]) { ctx.fillStyle = '#ff3b5c'; ctx.fillRect(ox + (b.x / T) * cs - 2, oy + (b.y / T) * cs - 2, 4, 4); }
    if (((time * 4) | 0) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + (player.x / T) * cs - 1.5, oy + (player.y / T) * cs - 1.5, 3, 3); }
    text(`CHAVES ${inv.keys} · SEGREDOS ${L.secrets} · ${lastInput === 'touch' ? 'TOQUE NO 🗺️' : lastInput === 'pad' ? 'SELECT' : 'TAB'} FECHA`, W / 2, H - 5, 6, '#9a8bb8', 'center');
  }

  function drawCard() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#07030f'; ctx.fillRect(0, 0, W, H);
    const d = L.def;
    if (state === 'intro') {
      const a = Math.min(1, stateT * 3);
      text(`ANDAR ${d.n}`, W / 2, H * 0.24, 9, '#9a8bb8', 'center', FONT2, a);
      text(d.nome, W / 2, H * 0.36, d.nome.length > 18 ? 9 : 12, L.theme.edge, 'center', FONT2, a);
      ctx.globalAlpha = a; ctx.drawImage(HSPR.downi, W / 2 - 6, H * 0.46); ctx.globalAlpha = 1;
      text(`× ${codes.has('KONAMI') ? '∞' : lives}`, W / 2 + 10, H * 0.46 + 8, 8, '#ffffff', 'left', FONT, a);
      text(`${HEROI.nome} DESCE PARA O ANDAR ${d.n}...`, W / 2, H * 0.62, 7, '#cbbfe0', 'center', FONT, a);
      text('SENHA', W / 2, H * 0.74, 7, '#9a8bb8', 'center', FONT, a);
      text(d.senha, W / 2, H * 0.83, 14, '#ffd400', 'center', FONT2, a);
    } else if (state === 'tally') {
      text(`ANDAR ${d.n} CONCLUÍDO!`, W / 2, 16, 10, '#39ff14', 'center', FONT2);
      text(d.nome, W / 2, 28, 7, L.theme.edge, 'center', FONT);
      const rows = tally.rows, n = Math.min(rows.length, Math.floor(stateT / 0.45));
      const y0 = 42, step = Math.min(13, (H - 70) / Math.max(1, rows.length));
      for (let i = 0; i < n; i++) {
        const r = rows[i];
        text(r[0], 18, y0 + i * step, 7, '#cbbfe0', 'left');
        text(r[1], W - 18, y0 + i * step, 7, r[2] || '#ffffff', 'right');
      }
      if (n >= rows.length) {
        text(`PONTOS: ${score}`, W / 2, H - 22, 10, '#ffd400', 'center', FONT2);
        if (((time * 2) | 0) % 2) text(lastInput === 'touch' ? 'TOQUE EM GOLPE PARA DESCER' : lastInput === 'pad' ? 'APERTE A PARA DESCER' : 'APERTE J OU ESPAÇO PARA DESCER', W / 2, H - 8, 6, '#ffffff', 'center');
      }
    }
  }
  function drawScan() {
    if (scan.width !== canvas.width || scan.height !== canvas.height) {
      scan.width = canvas.width; scan.height = canvas.height;
      const g = scan.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,0.16)';
      const st = Math.max(2, Math.round(canvas.height / 220));
      for (let y = 0; y < scan.height; y += st) g.fillRect(0, y, scan.width, Math.max(1, st >> 1));
      const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.3, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scan, 0, 0);
  }
  function render() {
    if (!L) return;
    if (state === 'intro' || state === 'tally') { drawCard(); drawScan(); return; }
    drawWorld();
    if (state !== 'menu') drawHud();
    if (state === 'map') drawMap();
    if (state === 'dying') { ctx.setTransform(k, 0, 0, k, 0, 0); ctx.fillStyle = `rgba(40,0,10,${Math.min(0.7, stateT * 0.5)})`; ctx.fillRect(0, 0, W, H); if (stateT > 0.6) text(lives > 1 || codes.has('KONAMI') ? 'VOCÊ CAIU!' : 'FIM DA LINHA...', W / 2, H / 2, 12, '#ff3b5c', 'center', FONT2); }
    if (state === 'menu') {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = 'rgba(5,2,12,0.25)'; ctx.fillRect(0, 0, W, H);
    }
    drawScan();
  }

  /* =====================================================================
     FLUXO DO JOGO
     ===================================================================== */
  let tally = { rows: [] };
  const cloneInv = v => JSON.parse(JSON.stringify(v));
  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }
  function resetWorldFx() { particles = []; popups = []; shots = []; bombs = []; warns = []; fxs = []; found = null; findT = -3; banner = null; msg = null; flash = 0; shake = 0; }
  function enterFloor(idx) {
    resetWorldFx();
    loadFloor(idx);
    inv.keys = 0;
    player = newPlayer(L.start.x, L.start.y);
    snapshot = { score, inv: cloneInv(inv) };
    updateCamera(0, true);
    state = 'intro'; stateT = 0;
    show(null);
    updateHud();
  }
  function startGame(idx = 0, viaPassword = false) {
    Sfx.ensure();
    score = 0; lives = LIVES;
    cheatedRun = viaPassword;
    inv = viaPassword ? invForFloor(idx) : newInv();
    demo = null;
    enterFloor(idx);
  }
  function restartFloor() {
    score = snapshot.score;
    inv = cloneInv(snapshot.inv);
    inv.hp = inv.maxHearts * 2;
    const idx = L.idx;
    resetWorldFx();
    loadFloor(idx);
    inv.keys = 0;
    player = newPlayer(L.start.x, L.start.y);
    updateCamera(0, true);
    state = 'intro'; stateT = 0;
  }
  function floorClear() {
    const d = L.def;
    state = 'tally'; stateT = 0;
    S.stairs();
    const secretsTotal = new Set([...L.cluster].filter(c => c >= 0)).size;
    const tbonus = Math.max(0, Math.round((d.tempo - L.time) * 5));
    const noDmg = !L.damaged ? PTS.semDano : 0;
    const sec = L.secrets * PTS.segredo, fl = PTS.andar * d.n;
    const mm = Math.floor(L.time / 60), ss = String(Math.floor(L.time % 60)).padStart(2, '0');
    const rows = [
      ['INIMIGOS', `${L.kills}  (+${L.killPts})`],
      ['MOEDAS', `${L.coins}  (+${L.coins * PTS.moeda})`],
    ];
    if (L.bossPts) rows.push([L.arenaKind === 'ambush' ? 'EMBOSCADA' : 'CHEFE', `+${L.bossPts}`, '#ff3b5c']);
    rows.push([`TEMPO ${mm}:${ss} (META ${Math.floor(d.tempo / 60)}:${String(d.tempo % 60).padStart(2, '0')})`, tbonus ? `+${tbonus}` : '—', '#00e5ff']);
    rows.push(['SEM DANO', noDmg ? `+${noDmg}` : '—', '#39ff14']);
    rows.push([`SALAS SECRETAS ${L.secrets}/${secretsTotal}`, sec ? `+${sec}` : '—', '#ffd400']);
    rows.push([`ANDAR ${d.n} CONCLUÍDO`, `+${fl}`, '#b26bff']);
    let add = tbonus + noDmg + sec + fl;
    if (d.n === ANDARES.length) {
      const lv = codes.has('KONAMI') ? 0 : lives;
      rows.push([`VIDAS QUE SOBRARAM ${lv} × ${PTS.vida}`, `+${lv * PTS.vida}`, '#ff3b5c']);
      rows.push(['VITÓRIA SOBRE A CUCA', `+${PTS.vitoria}`, '#7dff3a']);
      add += lv * PTS.vida + PTS.vitoria;
    }
    score += add;
    tally = { rows };
  }
  function nextFloor() {
    if (L.idx + 1 >= ANDARES.length) { gameOver(true); return; }
    enterFloor(L.idx + 1);
  }
  function gameOver(won) {
    state = 'over';
    const cheated = cheatedRun || codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set(hiKey(), hi); }
    Ranking.gameOver($('rankBox'), { board: 'cripta-' + settings.dif, score, cheated });
    $('overTitle').textContent = won ? 'A CRIPTA FOI VENCIDA!' : 'GAME OVER';
    $('overScore').textContent = score;
    const d = L.def;
    $('overInfo').textContent = won
      ? `${HEROI.nome} derrotou a Cuca e voltou para a superfície! Dificuldade ${settings.dif === 'pesadelo' ? 'PESADELO' : 'NORMAL'}.`
      : `${HEROI.nome} parou no andar ${d.n}: ${d.nome}.${cheated ? ' (Partida com senha ou código: fora do recorde.)' : ''}`;
    $('overPassWrap').hidden = won;
    $('overPass').textContent = d.senha;
    $('overRecord').hidden = !rec;
    const st = [
      ['Dificuldade', settings.dif === 'pesadelo' ? 'PESADELO' : 'NORMAL'],
      ['Andar alcançado', `${d.n}/${ANDARES.length}`],
      ['Facão', FACAO_NAME[inv.facao]],
      ['Corações', String(inv.maxHearts)],
    ];
    $('overStats').innerHTML = st.map(([a, b]) => `<li>${a}: <b>${b}</b></li>`).join('');
    show('over');
    if (won || rec) Sfx.win(); else Sfx.lose();
    updateHud();
  }
  function toMenu() {
    state = 'menu';
    startDemo();
    show('menu');
    updateHud();
  }
  function togglePause() {
    if (['play', 'intro', 'tally', 'dying', 'map'].includes(state)) {
      pausedFrom = state === 'map' ? 'play' : state; state = 'pause';
      $('pauseInfo').textContent = `Andar ${L.def.n}: ${L.def.nome}. Senha deste andar: ${L.def.senha}.`;
      show('pause');
    } else if (state === 'pause') { state = pausedFrom; show(null); }
  }
  function toggleMap() {
    if (state === 'play') { state = 'map'; tone(520, 0.06, 'triangle', 0.05); }
    else if (state === 'map') state = 'play';
  }

  /* ---------- lojinha do Seu Boto ---------- */
  const BOTO_TALK = [
    'Ô, freguês! Garrafada fresquinha, bomba de primeira e coração de segunda mão!',
    'Pode olhar, pode escolher. O chapéu não está à venda, e eu não tiro ele não.',
    'Moeda de cripta vale o dobro aqui embaixo. Quer dizer... vale o mesmo. Mas compre!',
    'Dizem que eu apareço em festa junina. Bobagem! Eu só apareço onde tem freguês.',
  ];
  let shopSel = 0, shopItems = [];
  function openShop() {
    state = 'shop';
    shopSel = 0;
    $('shopTalk').textContent = pick(BOTO_TALK);
    renderShop();
    show('shop');
    tone(523, 0.08, 'triangle', 0.06); tone(659, 0.1, 'triangle', 0.06, null, 0.08);
  }
  function renderShop() {
    shopItems = SHOP_STOCK.filter(s => !s.precisa || (s.precisa === 'bodoque' ? inv.hasBodoque : inv.hasSal));
    shopSel = clamp(shopSel, 0, shopItems.length - 1);
    $('shopList').innerHTML = shopItems.map((s, i) => {
      const sold = s.id === 'coracao' && L.shopHeart;
      const off = sold || inv.coins < s.preco || (s.id === 'coracao' && inv.maxHearts >= 10);
      return `<button type="button" data-buy="${s.id}" class="${i === shopSel ? 'sel' : ''}" ${off ? 'disabled' : ''}><span>${s.nome}${sold ? ' (VENDIDO)' : ''}</span><span class="pr">${s.preco} 🪙</span></button>`;
    }).join('');
    $('shopCoins').textContent = `SUAS MOEDAS: ${inv.coins}  ·  BOMBAS ${inv.bombs}/${inv.bombCap}  ·  CORAÇÕES ${(inv.hp / 2).toFixed(1).replace('.0', '').replace('.', ',')}/${inv.maxHearts}`;
  }
  function buy(id) {
    const s = SHOP_STOCK.find(x => x.id === id);
    if (!s || inv.coins < s.preco || (id === 'coracao' && (L.shopHeart || inv.maxHearts >= 10))) { S.nope(); return; }
    inv.coins -= s.preco;
    if (id === 'garrafada') inv.hp = Math.min(inv.maxHearts * 2, inv.hp + 6);
    else if (id === 'bombas') { if (!inv.hasBombs) { inv.hasBombs = true; inv.item = 'bombas'; } inv.bombs = Math.min(inv.bombCap, inv.bombs + 4); }
    else if (id === 'pedras') inv.pedras += 10;
    else if (id === 'sal') inv.sal += 2;
    else if (id === 'coracao') { inv.maxHearts++; inv.hp = Math.min(inv.maxHearts * 2, inv.hp + 2); L.shopHeart = true; }
    S.buy();
    $('shopTalk').textContent = pick(['Negócio fechado!', 'Bom gosto, freguês!', 'Volte sempre... se voltar.', 'Esse aí é dos bons!']);
    renderShop();
  }
  function closeShop() {
    if (state !== 'shop') return;
    state = 'play'; show(null);
    player.shopLock = true;
  }

  /* ---------- demonstração no menu: o herói passeia sozinho pelo andar 1 ---------- */
  function startDemo() {
    resetWorldFx();
    inv = newInv();
    loadFloor(0);
    player = newPlayer(L.start.x, L.start.y);
    demo = { target: null, dmap: null, t: 0, life: 50, swing: 0, stuck: 0, lx: 0, ly: 0 };
    updateCamera(0, true);
  }
  function demoInput(dt) {
    const p = player, dm = demo;
    dm.t -= dt; dm.life -= dt; dm.swing -= dt;
    if (dm.life <= 0) { startDemo(); return; }
    inp.atkEdge = inp.rollEdge = inp.itemEdge = inp.swapEdge = false;
    const ok = (x, y) => !blocked(x, y, 1) && !'^;_'.includes(tileAt(x, y));
    if (!dm.dmap || dm.t <= 0) {
      for (let k2 = 0; k2 < 30; k2++) {
        const x = (Math.random() * L.W) | 0, y = (Math.random() * L.H) | 0;
        if (!ok(x, y)) continue;
        const dmap = bfs(x, y, ok, 300);
        if (dmap[Math.floor(p.y / T) * L.W + Math.floor(p.x / T)] > 4) { dm.dmap = dmap; dm.t = 14; break; }
      }
    }
    let mx = 0, my = 0;
    if (dm.dmap) {
      const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), here = dm.dmap[ty * L.W + tx];
      let best = here, bx = 0, by = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = dm.dmap[(ty + dy) * L.W + tx + dx];
        if (v >= 0 && v < best) { best = v; bx = dx; by = dy; }
      }
      if (here <= 0) dm.t = 0;
      const gx = (tx + bx) * T + 8, gy = (ty + by) * T + 10;
      mx = gx - p.x; my = gy - p.y;
      const m = Math.hypot(mx, my) || 1; mx /= m; my /= m;
    }
    for (const e of L.enemies) {
      if (!e.dead && dist(e.x, e.y, p.x, p.y) < 24 && dm.swing <= 0) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        mx = Math.cos(a) * 0.3; my = Math.sin(a) * 0.3;
        p.fx = Math.cos(a); p.fy = Math.sin(a);
        inp.atkEdge = true; dm.swing = 0.3;
      }
    }
    if (dist(p.x, p.y, dm.lx, dm.ly) < 0.3) { dm.stuck += dt; if (dm.stuck > 1.5) { dm.stuck = 0; dm.t = 0; } } else dm.stuck = 0;
    dm.lx = p.x; dm.ly = p.y;
    inp.mx = mx; inp.my = my;
  }

  /* =====================================================================
     ENTRADA: teclado, toque e controle
     ===================================================================== */
  const keys = {};
  const inp = { mx: 0, my: 0, atkEdge: false, rollEdge: false, itemEdge: false, swapEdge: false, mapEdge: false };
  const edges = { atk: false, roll: false, item: false, swap: false, map: false };
  addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ' || key === 'tab') e.preventDefault();
    lastInput = 'kb';
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (state === 'shop') {
      if (key === 'arrowup' || key === 'w') { shopSel--; renderShop(); }
      else if (key === 'arrowdown' || key === 's') { shopSel++; renderShop(); }
      else if ((key === 'j' || key === 'enter' || key === ' ') && !e.repeat) { e.preventDefault(); if (shopItems[shopSel]) buy(shopItems[shopSel].id); }
      else if (key === 'k' || key === 'escape' || key === 'shift' || key === 'p') closeShop();
      return;
    }
    if (key === 'p' || key === 'escape') { if (state === 'map' && key === 'escape') toggleMap(); else togglePause(); return; }
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !(e.target.closest && e.target.closest('button'))) startGame(0, false);
      return;
    }
    if (key === 'tab' && !e.repeat) { edges.map = true; return; }
    if (!e.repeat) {
      if (key === 'j' || key === ' ') edges.atk = true;
      if (key === 'k' || key === 'shift') edges.roll = true;
      if (key === 'l' || key === 'e') edges.item = true;
      if (key === 'q') edges.swap = true;
    }
    keys[key] = true;
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const kk of Object.keys(keys)) keys[kk] = false; });

  const joy = new VJoy($('joy'));
  function tapButton(el, name) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      Sfx.ensure();
      lastInput = 'touch';
      edges[name] = true;
      el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    });
    const up = () => el.classList.remove('down');
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  tapButton($('bAtk'), 'atk'); tapButton($('bRoll'), 'roll'); tapButton($('bItem'), 'item'); tapButton($('bSwap'), 'swap');
  $('mapBtn').addEventListener('click', () => { lastInput = matchMedia('(pointer: coarse)').matches ? 'touch' : lastInput; edges.map = true; $('mapBtn').blur(); });
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); Sfx.ensure(); if (state === 'tally') edges.atk = true; });

  const padPrev = {};
  function readInput() {
    let mx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    let my = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    if (joy.active && joy.mag > 0.18) { mx = joy.x; my = joy.y; lastInput = 'touch'; }
    const g = Arcade.gamepad(0);
    if (g) {
      if (Math.abs(g.lx) > 0.25 || Math.abs(g.ly) > 0.25) { mx = g.lx; my = g.ly; lastInput = 'pad'; }
      const raw = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean)[0] : null;
      const sel = !!(raw && raw.buttons[8] && raw.buttons[8].pressed);
      const now = { a: g.a, b: g.b, x: g.x, y: g.y, start: g.start, sel, up: g.ly < -0.5, down: g.ly > 0.5 };
      const pressed = n => now[n] && !padPrev[n];
      if (Object.keys(now).some(pressed)) lastInput = 'pad';
      if (state === 'shop') {
        if (pressed('up')) { shopSel--; renderShop(); }
        if (pressed('down')) { shopSel++; renderShop(); }
        if (pressed('a') && shopItems[shopSel]) buy(shopItems[shopSel].id);
        if (pressed('b') || pressed('start')) closeShop();
      } else if (state === 'menu' || state === 'over') {
        if (pressed('a') || pressed('start')) startGame(0, false);
      } else {
        if (pressed('a')) edges.atk = true;
        if (pressed('b')) edges.roll = true;
        if (pressed('x')) edges.item = true;
        if (pressed('y')) edges.swap = true;
        if (pressed('sel')) edges.map = true;
        if (pressed('start')) togglePause();
      }
      Object.assign(padPrev, now);
    }
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    inp.mx = mx; inp.my = my;
    inp.atkEdge = edges.atk; inp.rollEdge = edges.roll; inp.itemEdge = edges.item; inp.swapEdge = edges.swap; inp.mapEdge = edges.map;
    edges.atk = edges.roll = edges.item = edges.swap = edges.map = false;
  }

  overlay.addEventListener('click', e => {
    const bb = e.target.closest('[data-buy]');
    if (bb) { buy(bb.dataset.buy); return; }
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'start') startGame(0, false);
    else if (a === 'resume') togglePause();
    else if (a === 'menu') toMenu();
    else if (a === 'shopExit') closeShop();
    b.blur();
  });
  $('passInput').addEventListener('keydown', e => e.stopPropagation());
  $('passForm').addEventListener('submit', e => {
    e.preventDefault();
    Sfx.ensure();
    const v = norm($('passInput').value);
    const idx = ANDARES.findIndex(d => d.senha === v);
    const m = $('passMsg');
    $('passInput').value = ''; $('passInput').blur();
    if (idx < 0) { m.textContent = 'SENHA INVÁLIDA. Confira o que você anotou!'; m.classList.remove('ok'); Sfx.tone(140, 0.25, 'sawtooth', 0.1); return; }
    m.textContent = `SENHA ACEITA: ANDAR ${idx + 1}, ${ANDARES[idx].nome}. Partida por senha não vale recorde.`;
    m.classList.add('ok');
    [523, 784, 1047].forEach((f, i) => Sfx.tone(f, 0.1, 'square', 0.08, null, i * 0.07));
    setTimeout(() => startGame(idx, true), 500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ['play', 'intro', 'tally', 'dying', 'map'].includes(state)) togglePause();
  });

  /* =====================================================================
     LAÇO PRINCIPAL
     ===================================================================== */
  function update(dt) {
    if (state === 'menu' && demo) demoInput(dt);
    if (inp.mapEdge && (state === 'play' || state === 'map')) toggleMap();
    if (state === 'play' || state === 'menu') {
      if (findT > 0 && state === 'play') { findT -= dt; return; }
      if (findT > -3) findT -= dt;
      updateFloor(dt);
      updateFlow(dt);
      updatePlayer(dt);
      if (state !== 'play' && state !== 'menu') return;
      const p = player;
      for (const e of L.enemies) if (!e.dead && (e.awake || dist(e.x, e.y, p.x, p.y) < 22 * T)) updateEnemy(e, dt);
      for (const b of L.bosses) updateBoss(b, dt);
      updateShots(dt);
      updateBombs(dt);
      updateItems(dt);
      updateWarns(dt);
      L.enemies = L.enemies.filter(e => !e.dead);
      Music.update(dt, L.bosses.some(b => b.active && !b.dead));
    } else if (state === 'dying') {
      stateT += dt;
      if (stateT > 2.1) {
        if (!codes.has('KONAMI')) lives--;
        if (lives <= 0) gameOver(false);
        else restartFloor();
      }
    } else if (state === 'intro') {
      stateT += dt;
      if (stateT > 3) { state = 'play'; say(`SENHA DO ANDAR: ${L.def.senha}`, 2.5, '#ffd400'); }
    } else if (state === 'tally') {
      stateT += dt;
      const done = stateT > tally.rows.length * 0.45 + 0.3;
      if (((stateT / 0.45) | 0) !== (((stateT - dt) / 0.45) | 0) && stateT < tally.rows.length * 0.45 + 0.1) S.tally();
      if (done && (inp.atkEdge || stateT > 14)) nextFloor();
    }
  }
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function updateHud() {
    const inGame = state !== 'menu' && L;
    setText(hud.floor, inGame ? String(L.def.n) : '—');
    setText(hud.floorName, inGame ? L.def.nome : '');
    setText(hud.lives, codes.has('KONAMI') ? '∞' : String(lives));
    setText(hud.score, String(score));
    setText(hud.hi, String(hi));
    const st = [];
    if (settings.dif === 'pesadelo') st.push('PESADELO');
    if (cheatedRun && inGame) st.push('SENHA');
    if (codes.any()) st.push('★ ' + codes.list().join(' '));
    setText(hud.status, st.join(' · '));
  }

  let last = performance.now(), acc = 0, hudT = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    readInput();
    if (state !== 'pause' && state !== 'over' && state !== 'shop') {
      time += dt;
      acc += dt;
      let n = 0;
      while (acc >= STEP && n++ < 4) { acc -= STEP; update(STEP); inp.atkEdge = inp.rollEdge = inp.itemEdge = inp.swapEdge = inp.mapEdge = false; }
      if (!n) { edges.atk ||= inp.atkEdge; edges.roll ||= inp.rollEdge; edges.item ||= inp.itemEdge; edges.swap ||= inp.swapEdge; edges.map ||= inp.mapEdge; }
      if (acc > STEP) acc = 0;
      if (L && player && state !== 'intro' && state !== 'tally') updateCamera(dt, false);
      shake = Math.max(0, shake - dt * 1.6);
      flash = Math.max(0, flash - dt);
      for (const p of particles) {
        if (p.suck) { p.x = lerp(p.x, p.suck.x, dt * 5); p.y = lerp(p.y, p.suck.y, dt * 5); }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.grav || 0) * dt; p.life -= dt;
      }
      particles = particles.filter(p => p.life > 0);
      for (const pp of popups) pp.t -= dt;
      popups = popups.filter(pp => pp.t > 0);
      if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
      if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    }
    render();
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; updateHud(); }
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    if (w < 10 || h < 10) return;
    if (w >= h) { H = 176; W = Math.round(clamp((176 * w) / h, 176, 288)); }
    else { W = 176; H = Math.round(clamp((176 * h) / w, 176, 300)); }
    k = Arcade.fit(canvas, W, H, wrap);
  }
  Arcade.bindSettings(panels.menu, settings, 'cripta_', key => { if (key === 'dif') updateModeInfo(); });
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  resize();
  updateModeInfo();
  startDemo();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
