// SUPER PIXEL: plataforma 2D de rolagem lateral.
// Física em passo fixo (1/120 s) com aceleração, atrito, pulo de altura variável, coyote time e
// buffer de pulo. As fases são arrays de tiles (texto), montadas a partir de trechos.
(() => {
  'use strict';

  /* ---------- constantes ---------- */
  const TILE = 16, ROWS = 15, H = ROWS * TILE;   // 240 de altura lógica (a largura acompanha a tela)
  let W = 320;
  const TAU = Math.PI * 2;
  const STEP = 1 / 120;
  // física do herói (pixels por segundo)
  const PHYS = {
    maxVX: 100, accGround: 760, accAir: 520, friction: 900,
    grav: 1400, gravHold: 620, jumpV: 305, maxFall: 420,
    coyote: 0.1, buffer: 0.12, cut: 0.42,
  };
  const TIME = 300;
  const MAX_HEARTS = 3;

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const wrap = $('gameWrap'), stage = $('stage'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), stage: $('hStage'), status: $('hStatus') };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- configurações e códigos ---------- */
  const settings = { musica: 'on', crt: 'off' };
  Arcade.bindSettings(panels.menu, settings, 'superpixel_', key => { if (key === 'musica' && settings.musica === 'off') Music.stop(); });
  const codes = Arcade.codes('super-pixel', {
    KONAMI: 'Pulo duplo',
    LUA: 'Pulo bem mais alto',
    IMORTAL: 'Invencível',
  }, $('codeMount'));

  /* =====================================================================
     FASES
     Legenda dos tiles:
       .  vazio            #  chão / rocha       B  bloco sólido       ?  bloco com moeda
       H  bloco c/ coração  o  moeda              ^  espinhos           ~  lava
       =  plataforma fina (atravessa por baixo)   *  flor   c  cristal   t  tocha (enfeites)
       P  início           g  inimigo andarilho   f  inimigo voador
       m  plataforma móvel horizontal             v  plataforma móvel vertical
       C  checkpoint        F  bandeira final     K  chefe
       d  porta de entrada da arena (fecha atrás do herói)   D  porta de saída (abre com o chefe derrotado)
     Cada trecho informa a largura e só as linhas que têm algo (0 = topo, 14 = fundo).
     'chao' preenche as linhas 12, 13 e 14.
     ===================================================================== */
  const LEVELS = [
    {
      name: 'CAMPOS DE PIXEL', theme: 'campo', song: 'campo', ceiling: 0,
      chunks: [
        { w: 20, 8: '........?...?H?.....', 10: '...o.o..............', 11: '.P........*...g.....', chao: '####################' },
        { w: 20, 7: '......ooo...........', 8: '.....BBBBB..........', 11: '..*...........g.....', chao: '###########...######' },
        { w: 20, 9: '..............BB....', 10: '.............BBB....', 11: '..o.o.o.....BBBB^^^.', chao: '####################' },
        { w: 20, 6: '..........f.........', 7: '........ooo.........', 10: '.....m..............', chao: '####............####' },
        { w: 20, 8: '......?B?B?.........', 11: '..C.......g...g..*..', chao: '####################' },
        { w: 20, 4: '.............ooo....', 5: '............=====...', 7: '........====........', 9: '....====............', 11: '..g.............g...', chao: '####################' },
        { w: 20, 7: '..............f.....', 9: '....ooo.............', 11: '.........^^.........', chao: '####...######..#####' },
        { w: 20, 6: '......f.......f.....', 8: '...H................', 10: '..........BBBBBB....', 11: '.....g...BBBBBBBB...', chao: '####################' },
        { w: 20, 7: '.......BB...........', 8: '......BBB...........', 9: '.....BBBB...........', 10: '....BBBBB...........', 11: '...BBBBBB.......F...', chao: '####################' },
        { w: 12, 11: '..*....*....', chao: '############' },
      ],
    },
    {
      name: 'CAVERNAS DE CRISTAL', theme: 'caverna', song: 'caverna', ceiling: 2,
      chunks: [
        { w: 20, 2: '..c.......c.....c...', 8: '......?H?...........', 11: '.P.....c.....g......', chao: '####################' },
        { w: 20, 2: '####################', 3: '####################', 4: '####################', 5: '####################', 6: '####################', 7: 'c.........c.........', 10: '..oooo......oooo....', 11: '......g.........g...', chao: '####################' },
        { w: 20, 2: '.....c.........c....', 6: '..........ooo.......', 8: '....v....v..........', chao: '###...........######' },
        { w: 20, 6: '........ooo.........', 8: '.......=====........', 10: '..====.......====...', 11: '......^^^^^^^.......', chao: '####################' },
        { w: 20, 2: '...c.....c.....c....', 5: '......f.......f.....', 8: '.........?B?H?......', 11: '..C.........g.......', chao: '####################' },
        { w: 20, 6: '............oo......', 7: '........oo..BB......', 8: '....oo..BB..BB......', 9: '....BB..BB..BB......', 10: '....BB..BB..BB......', 11: '....BB..BB..BB...g..', chao: '######..##..########' },
        { w: 20, 2: '####################', 3: '####################', 4: '####################', 5: 'c....c.....c....c...', 8: '......?....H........', 11: '...g....g....g......', chao: '####################' },
        { w: 20, 2: '......c.......c.....', 7: '........ooo.........', 9: '.....m..............', chao: '###..............###' },
        { w: 20, 7: '.......BB...........', 8: '......BBB...........', 9: '.....BBBB...........', 10: '....BBBBB...........', 11: '...BBBBBB.c.....F...', chao: '####################' },
        { w: 12, 2: '...c....c...', 11: '.c......c...', chao: '############' },
      ],
    },
    {
      name: 'FORTALEZA NEON', theme: 'fortaleza', song: 'fortaleza', ceiling: 2,
      chunks: [
        { w: 20, 6: '...t.......t.......t', 8: '........?H?.........', 11: '.P...........g......', chao: '####################' },
        { w: 20, 7: '.......ooo..........', 10: '.....m..............', 12: '####............####', 13: '####~~~~~~~~~~~~####', 14: '####~~~~~~~~~~~~####' },
        { w: 20, 6: '..t.........t.......', 9: '..........BBB.......', 11: '....^^......g...^^..', chao: '####################' },
        { w: 20, 6: '........ooo.........', 9: '....v.....v.........', 12: '###..............###', 13: '###~~~~~~~~~~~~~~###', 14: '###~~~~~~~~~~~~~~###' },
        { w: 20, 5: '.....f.........f....', 8: '..........?B?B?.....', 11: '..C.....g.....g.....', chao: '####################' },
        { w: 20, 4: '..............ooo...', 5: '.............=====..', 7: '..........====......', 9: '......====..........', 11: '...^^^^^^^^^^^^^^...', chao: '####################' },
        { w: 20, 6: '....f.......f.......', 11: '......BB...BB...BB..', 12: '####..............##', 13: '####~~~~~~~~~~~~~~##', 14: '####~~~~~~~~~~~~~~##' },
        { w: 20, 8: '.....H..............', 10: '............BBB.....', 11: '..g....g...BBBBB..g.', chao: '####################' },
        { w: 20, 6: '...t.....t.....t....', 9: '...ooooooooo........', chao: '####################' },
        {
          w: 24,
          2: 'd......................D', 3: 'd......................D', 4: 'd...t..............t...D', 5: 'd......................D',
          6: 'd......................D', 7: 'd......................D', 8: 'd...====........====...D', 9: 'd......................D',
          10: 'd......................D', 11: 'd...........K..........D', chao: '########################',
        },
        { w: 16, 6: '....t...........', 11: '.....F..........', chao: '################' },
      ],
    },
  ];

  // Monta a grade da fase e separa as entidades (herói, inimigos, plataformas...).
  function parseLevel(def) {
    const rows = Array.from({ length: ROWS }, () => []);
    const ceil = def.theme === 'fortaleza' ? 'B' : '#';
    for (const ch of def.chunks) {
      for (let r = 0; r < ROWS; r++) {
        let s = ch[r];
        if (s === undefined && r >= 12 && ch.chao) s = ch.chao;
        if (s === undefined) s = (r < def.ceiling ? ceil : '.').repeat(ch.w);
        if (s.length !== ch.w) console.warn('Trecho com largura errada', def.name, r, s);
        rows[r].push(...s.padEnd(ch.w, '.').slice(0, ch.w));
      }
    }
    const L = { def, w: rows[0].length, grid: rows, enemies: [], platforms: [], decor: [], start: { x: 2, y: 11 }, checkpoint: null, flag: null, boss: null, arena: null };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < L.w; x++) {
        const c = rows[y][x];
        const px = x * TILE, py = y * TILE;
        if (c === 'P') L.start = { x, y };
        else if (c === 'g') L.enemies.push({ type: 'walker', x: px + 1, y: py + 4, w: 14, h: 12 });
        else if (c === 'f') L.enemies.push({ type: 'flyer', x: px + 1, y: py + 2, w: 14, h: 12 });
        else if (c === 'm') L.platforms.push({ kind: 'h', x0: px, y0: py, range: 6 * TILE, x: px, y: py });
        else if (c === 'v') L.platforms.push({ kind: 'v', x0: px, y0: py, range: 2.5 * TILE, x: px, y: py });
        else if (c === 'C') L.checkpoint = { x: px + 8, y: py + 16, on: false };
        else if (c === 'F') L.flag = { x: px + 8, y: py + 16, top: py + 16 - 9 * TILE };
        else if (c === 'K') L.boss = { x: px, y: py + 16 };
        else if (c === '*' || c === 'c' || c === 't') { L.decor.push({ c, x, y }); continue; }
        else if (c === 'd' && !L.arena) L.arena = { x0: x, x1: 0 };
        else if (c === 'D' && L.arena) L.arena.x1 = x;
        else continue;
        if (c !== 'd' && c !== 'D') rows[y][x] = '.';
      }
    }
    for (const d of L.decor) rows[d.y][d.x] = '.';
    return L;
  }

  /* =====================================================================
     PIXEL ART (tudo desenhado por código em canvas pequenos)
     ===================================================================== */
  function mk(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'));
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
  const fromStrings = (rows, pal) => mk(rows[0].length, rows.length, g => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) px(g, x, y, pal[ch]); })));
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

  /* ---------- o herói: Pixel, de capacete neon ---------- */
  const HERO_TOP = [
    '.....kkkkk......',
    '...kkhhhhHkk....',
    '..khhhhhhhHHk...',
    '..khhhhhhhhhhk..',
    '.khhhhhkkkkkkk..',
    '.khnhhkvvvvVVk..',
    '.khnhhkvvvvvVk..',
    '.khhhhkkkkkkkk..',
    '..khhhksssssk...',
    '...kkkkkkkkk....',
    '..kbbbbybbbk....',
    '.ksbbbbbbbBsk...',
    '.kkbbbbbbbBkk...',
  ];
  const HERO_LEGS = {
    idle: ['..kBBk..kBBk....', '..kggk..kggk....', '.kGGGk..kGGGk...'],
    runA: ['.kBBk....kBBk...', 'kggk......kggk..', 'kGGk.......kGGk.'],
    runB: ['...kBBkBBk......', '...kggkggk......', '..kGGGkGGGk.....'],
    jump: ['..kBBBBk.kBk....', '...kggk..kggk...', '....kk....kGk...'],
  };
  const HERO_PAL = {
    k: '#1a0f24', h: '#ffb000', H: '#ffe27a', n: '#00e5ff', v: '#00e5ff', V: '#d6fdff',
    s: '#ffcf9e', b: '#ff2bd6', B: '#a3127f', y: '#fff27a', g: '#3a2f5a', G: '#241a3a',
  };
  const HERO = {};
  for (const [name, legs] of Object.entries(HERO_LEGS)) HERO[name] = fromStrings(HERO_TOP.concat(legs), HERO_PAL);
  HERO.dead = fromStrings(HERO_TOP.concat(HERO_LEGS.jump), { ...HERO_PAL, v: '#ff3b5c', V: '#ffb0c0', n: '#ff3b5c' });
  HERO.white = fromStrings(HERO_TOP.concat(HERO_LEGS.idle), Object.fromEntries(Object.keys(HERO_PAL).map(c => [c, '#ffffff'])));

  /* ---------- temas (paletas de cada fase) ---------- */
  const THEMES = {
    campo: {
      sky: ['#3fa9ff', '#8fd3ff', '#d9f3ff'],
      enemy: { main: '#5ad65a', shade: '#2f8f3a', feet: '#1f4f2a', wing: '#fff3c4', eye: '#ffffff' },
      flyer: { main: '#ffcc33', shade: '#c98a00', feet: '#3a2a00', wing: '#e8fbff', eye: '#ffffff' },
      dark: false,
    },
    caverna: {
      sky: ['#0b0420', '#1a0b3a', '#2a0f4a'],
      enemy: { main: '#b46cff', shade: '#6a2fb0', feet: '#3a1a6a', wing: '#00e5ff', eye: '#ffffff' },
      flyer: { main: '#5a3a8a', shade: '#2e1a52', feet: '#1a0f24', wing: '#8a5ab8', eye: '#ffe27a' },
      dark: true,
    },
    fortaleza: {
      sky: ['#05030f', '#140828', '#2a0a2a'],
      enemy: { main: '#ff5a3a', shade: '#a8261a', feet: '#2b2340', wing: '#ffd400', eye: '#fff27a' },
      flyer: { main: '#8a8aa8', shade: '#4a4a66', feet: '#1a0f24', wing: '#00e5ff', eye: '#ff2bd6' },
      dark: false,
    },
  };

  // Tiles 16x16 de cada tema. top = tile exposto por cima (grama, borda neon...).
  const tileCache = {};
  function tileArt(theme, c, top) {
    const key = theme + c + (top ? 1 : 0);
    if (tileCache[key]) return tileCache[key];
    const art = mk(TILE, TILE, g => {
      if (c === '#') {
        if (theme === 'campo') {
          rect(g, 0, 0, 16, 16, '#a0612f');
          for (let i = 0; i < 10; i++) { const x = (hash(i, 3) * 15) | 0, y = (hash(i, 7) * 15) | 0; rect(g, x, y, 2, 1, i % 2 ? '#7a4520' : '#c88a50'); }
          if (top) { rect(g, 0, 0, 16, 4, '#3fbf3f'); rect(g, 0, 0, 16, 1, '#8af06a'); for (let x = 0; x < 16; x += 3) rect(g, x, 4, 2, 1 + (x % 2), '#2a8a2a'); }
        } else if (theme === 'caverna') {
          rect(g, 0, 0, 16, 16, '#3a1f58');
          for (let i = 0; i < 8; i++) { const x = (hash(i, 11) * 14) | 0, y = (hash(i, 5) * 14) | 0; rect(g, x, y, 2, 2, i % 3 ? '#2a1446' : '#4e2c72'); }
          px(g, 4, 10, '#00e5ff'); px(g, 11, 4, '#ff2bd6'); px(g, 12, 12, '#00e5ff');
          if (top) { rect(g, 0, 0, 16, 2, '#6a3a9a'); rect(g, 0, 0, 16, 1, '#9a6ad0'); }
        } else {
          rect(g, 0, 0, 16, 16, '#221c38');
          rect(g, 0, 0, 16, 1, '#2f2850'); rect(g, 0, 8, 16, 1, '#1a142c');
          rect(g, 7, 0, 1, 8, '#1a142c'); rect(g, 3, 8, 1, 8, '#1a142c'); rect(g, 12, 8, 1, 8, '#1a142c');
          if (top) { rect(g, 0, 0, 16, 2, '#ff2bd6'); rect(g, 0, 2, 16, 1, '#7a1466'); }
        }
      } else if (c === 'B') {
        if (theme === 'campo') {
          rect(g, 0, 0, 16, 16, '#d0702e');
          rect(g, 0, 0, 16, 1, '#ffb070'); rect(g, 0, 15, 16, 1, '#6a3010');
          rect(g, 0, 7, 16, 1, '#6a3010'); rect(g, 7, 0, 1, 7, '#6a3010'); rect(g, 3, 8, 1, 7, '#6a3010'); rect(g, 11, 8, 1, 7, '#6a3010');
        } else if (theme === 'caverna') {
          rect(g, 0, 0, 16, 16, '#1a6a8a');
          rect(g, 1, 1, 14, 14, '#2aa0c8');
          for (let i = 0; i < 4; i++) rect(g, 2 + i * 3, 12 - i * 3, 3, 3, '#7ae8ff');
          rect(g, 0, 0, 16, 1, '#c8faff'); rect(g, 0, 15, 16, 1, '#0a3a52');
        } else {
          rect(g, 0, 0, 16, 16, '#3a2a58');
          rect(g, 0, 7, 16, 1, '#00e5ff'); rect(g, 0, 15, 16, 1, '#00e5ff');
          rect(g, 7, 0, 1, 7, '#00e5ff'); rect(g, 3, 8, 1, 7, '#00e5ff'); rect(g, 11, 8, 1, 7, '#00e5ff');
          rect(g, 0, 0, 16, 1, '#5a4a80');
        }
      } else if (c === '?' || c === 'H') {
        rect(g, 0, 0, 16, 16, '#7a3a00');
        rect(g, 1, 1, 14, 14, '#ffb000'); rect(g, 1, 1, 14, 1, '#ffe27a'); rect(g, 1, 1, 1, 14, '#ffe27a');
        rect(g, 14, 2, 1, 13, '#c47a00'); rect(g, 2, 14, 13, 1, '#c47a00');
        for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(g, x, y, '#7a3a00');
        const Q = ['.kkkk.', 'kk..kk', '....kk', '...kk.', '..kk..', '......', '..kk..'];
        Q.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'k') px(g, 5 + x, 4 + y, '#5a2a00'); }));
      } else if (c === 'X') {
        rect(g, 0, 0, 16, 16, '#4a2a1a'); rect(g, 1, 1, 14, 14, '#8a5a3a'); rect(g, 1, 1, 14, 1, '#a87a5a');
        for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(g, x, y, '#4a2a1a');
      } else if (c === '=') {
        const [a, b, d] = theme === 'campo' ? ['#e0a060', '#a86a30', '#6a3a10'] : theme === 'caverna' ? ['#7ae8ff', '#2aa0c8', '#0a3a52'] : ['#ffd400', '#a08000', '#3a2a00'];
        rect(g, 0, 0, 16, 5, b); rect(g, 0, 0, 16, 1, a); rect(g, 0, 4, 16, 1, d);
        rect(g, 2, 5, 2, 2, d); rect(g, 12, 5, 2, 2, d);
      } else if (c === '^') {
        for (let i = 0; i < 4; i++) {
          for (let y = 0; y < 7; y++) {
            const half = Math.floor(y / 2);
            rect(g, i * 4 + 2 - half, 9 + y, half * 2 + 1, 1, y < 2 ? '#ffffff' : theme === 'fortaleza' ? '#ff2bd6' : '#b8c0d8');
          }
        }
        rect(g, 0, 15, 16, 1, '#5a5a70');
      } else if (c === 'd' || c === 'D') {
        rect(g, 0, 0, 16, 16, 'rgba(20,10,40,0.85)');
        for (let x = 2; x < 16; x += 5) rect(g, x, 0, 2, 16, '#ff2bd6');
        rect(g, 0, 0, 16, 1, '#ffb0f0');
      }
    });
    tileCache[key] = art;
    return art;
  }

  // Inimigos: o mesmo desenho com a paleta do tema (como nos cartuchos antigos).
  function walkerArt(p, frame, theme) {
    return mk(16, 16, g => {
      disc(g, 8, 9, 6.6, '#1a0f24');
      disc(g, 8, 9, 5.6, p.main);
      for (let x = 3; x < 14; x++) for (let y = 11; y < 15; y++) if ((x + 0.5 - 8) ** 2 + (y + 0.5 - 9) ** 2 <= 31) px(g, x, y, p.shade);
      if (theme === 'caverna') for (const x of [5, 8, 11]) { px(g, x, 2, '#7ae8ff'); rect(g, x - 1, 3, 3, 1, '#00e5ff'); }
      if (theme === 'fortaleza') { rect(g, 7, 0, 2, 3, '#2b2340'); rect(g, 6, 0, 4, 1, '#ffd400'); }
      for (const ex of [5, 10]) { rect(g, ex, 6, 2, 3, p.eye); px(g, ex + 1, 7, '#1a0f24'); px(g, ex + 1, 8, '#1a0f24'); }
      rect(g, 6, 11, 4, 1, '#1a0f24');
      const f = frame ? [[3, 14], [10, 15]] : [[4, 15], [9, 14]];
      for (const [x, y] of f) { rect(g, x - 1, y - 1, 5, 2, '#1a0f24'); rect(g, x, y - 1, 3, 1, p.feet); }
    });
  }
  function flyerArt(p, frame) {
    return mk(16, 16, g => {
      const wy = frame ? 3 : 9;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const x = 8 + s * (5 + i), y = wy + (frame ? i * 0.6 : -i * 0.4);
          rect(g, Math.min(x, x - s), Math.round(y), 2, 3 - (i > 3 ? 1 : 0), '#1a0f24');
          px(g, x, Math.round(y) + 1, p.wing);
        }
      }
      disc(g, 8, 8, 5.6, '#1a0f24');
      disc(g, 8, 8, 4.6, p.main);
      rect(g, 4, 11, 8, 1, p.shade);
      disc(g, 9, 7, 2.6, p.eye);
      rect(g, 9, 6, 2, 2, '#1a0f24');
      rect(g, 6, 13, 1, 2, '#1a0f24'); rect(g, 10, 13, 1, 2, '#1a0f24');
    });
  }

  // O chefe MEGA GLITCH (32x32), em dois quadros (normal e piscando branco).
  function bossArt(flash) {
    return mk(32, 32, g => {
      const C = flash ? { o: '#ffffff', a: '#ffffff', b: '#ffffff', c: '#ffffff', e: '#ffffff' } : { o: '#1a0f24', a: '#6a2fb0', b: '#9a5aff', c: '#ffd400', e: '#ff2bd6' };
      rect(g, 3, 7, 26, 21, C.o);
      rect(g, 4, 8, 24, 19, C.a);
      rect(g, 4, 8, 24, 3, C.b);
      for (let y = 12; y < 26; y += 4) rect(g, 4, y, 24, 1, flash ? '#fff' : '#4a1a8a');
      // coroa
      rect(g, 7, 2, 18, 6, C.o);
      rect(g, 8, 4, 16, 3, C.c);
      for (const x of [8, 14, 20]) { rect(g, x, 1, 4, 3, C.o); rect(g, x + 1, 2, 2, 2, C.c); }
      px(g, 16, 5, C.e); px(g, 10, 5, '#00e5ff'); px(g, 22, 5, '#39ff14');
      // olhos bravos
      for (const ex of [9, 19]) {
        rect(g, ex, 12, 5, 4, flash ? '#fff' : '#fff27a');
        rect(g, ex + (ex < 16 ? 2 : 0), 13, 3, 3, C.o);
      }
      rect(g, 8, 10, 6, 1, C.o); rect(g, 18, 10, 6, 1, C.o);
      px(g, 13, 11, C.o); px(g, 18, 11, C.o);
      // boca com dentes
      rect(g, 9, 19, 14, 5, C.o);
      for (let x = 10; x < 22; x += 3) rect(g, x, 19, 2, 2, '#ffffff');
      rect(g, 10, 22, 12, 1, C.e);
      // pés
      rect(g, 5, 27, 8, 4, C.o); rect(g, 19, 27, 8, 4, C.o);
      rect(g, 6, 28, 6, 2, C.b); rect(g, 20, 28, 6, 2, C.b);
    });
  }
  const BOSS = [bossArt(false), bossArt(true)];

  // Moeda girando: 4 quadros com larguras diferentes.
  const COIN = [5.5, 3.8, 1.6, 3.8].map(rx => mk(16, 16, g => {
    for (let y = 2; y < 14; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = (x + 0.5 - 8) / rx, dy = (y + 0.5 - 8) / 5.8;
        const d = dx * dx + dy * dy;
        if (d <= 1) px(g, x, y, d > 0.55 ? '#c47a00' : (x < 8 && y < 8 ? '#fff6b0' : '#ffd400'));
        else if (d <= 1.45 && rx > 2) px(g, x, y, '#7a3a00');
      }
    }
    if (rx > 3) rect(g, 7, 5, 2, 6, '#c47a00');
  }));
  const HEART = fromStrings([
    '................', '................', '...kkk...kkk....', '..krrrk.krrrk...', '.krwwrrkrrrrrk..', '.krwrrrrrrrrrk..',
    '.krrrrrrrrrrrk..', '..krrrrrrrrrk...', '...krrrrrrrk....', '....krrrrrk.....', '.....krrrk......', '......krk.......',
    '.......k........', '................', '................', '................',
  ], { k: '#1a0f24', r: '#ff2b5c', w: '#ffd0dc' });
  const FLOWER = [['#ff5fa8', '#ffe27a'], ['#ffffff', '#ffb000'], ['#00e5ff', '#ffffff']].map(([p, c]) => mk(16, 16, g => {
    rect(g, 7, 9, 2, 7, '#2a8a2a'); rect(g, 9, 12, 3, 2, '#3fbf3f');
    for (const [x, y] of [[7, 5], [5, 7], [9, 7], [7, 9]]) rect(g, x, y, 2, 2, p);
    rect(g, 7, 7, 2, 2, c);
  }));
  const CRYSTAL = [false, true].map(hang => mk(16, 16, g => {
    const shard = (x, h, w, col, hi) => {
      for (let i = 0; i < h; i++) {
        const ww = Math.max(1, Math.round(w * (1 - i / h)));
        const y = hang ? i : 15 - i;
        rect(g, x - (ww >> 1), y, ww, 1, col); px(g, x - (ww >> 1), y, hi);
      }
    };
    shard(5, 9, 4, '#2aa0c8', '#c8faff'); shard(10, 13, 5, '#00e5ff', '#e8ffff'); shard(13, 6, 3, '#ff2bd6', '#ffd0f0');
  }));
  const TORCH = mk(16, 16, g => {
    rect(g, 6, 8, 4, 6, '#3a2a58'); rect(g, 5, 7, 6, 2, '#5a4a80');
    rect(g, 7, 2, 2, 5, '#ff2bd6'); rect(g, 6, 4, 4, 3, '#ff2bd6'); rect(g, 7, 3, 2, 3, '#ffd0f0');
  });

  // Brilho radial pronto para luzes (desenhado com 'lighter').
  function makeGlow(r, g2, b) {
    return mk(64, 64, g => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${r},${g2},${b},0.9)`); gr.addColorStop(0.35, `rgba(${r},${g2},${b},0.35)`); gr.addColorStop(1, `rgba(${r},${g2},${b},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  const GLOW = { cyan: makeGlow(0, 229, 255), pink: makeGlow(255, 43, 214), amber: makeGlow(255, 176, 0), white: makeGlow(255, 255, 255), lava: makeGlow(255, 90, 20) };

  /* ---------- fundos em parallax (faixas que se repetem) ---------- */
  const BG_W = 384;
  function buildBackgrounds(theme) {
    const layers = [];
    if (theme === 'campo') {
      layers.push({ f: 0.08, img: mk(BG_W, H, g => {
        for (let i = 0; i < 7; i++) {
          const x = hash(i, 1) * BG_W, y = 20 + hash(i, 2) * 70, w = 24 + hash(i, 3) * 30;
          for (const xx of [x, x - BG_W, x + BG_W]) {
            disc(g, xx, y, 7, '#ffffff'); disc(g, xx + w * 0.35, y - 4, 9, '#ffffff'); disc(g, xx + w * 0.7, y, 7, '#ffffff');
            rect(g, xx - 4, y, w + 8, 6, '#ffffff'); rect(g, xx - 4, y + 5, w + 8, 2, '#cfeaff');
          }
        }
      }) });
      layers.push({ f: 0.25, img: mk(BG_W, H, g => {
        for (let x = 0; x < BG_W; x++) {
          const h = 70 + 22 * Math.sin((x / BG_W) * TAU * 2) + 10 * Math.sin((x / BG_W) * TAU * 5 + 1);
          rect(g, x, H - h, 1, h, '#7ac8a0'); px(g, x, H - h, '#a8e8c0');
        }
      }) });
      layers.push({ f: 0.5, img: mk(BG_W, H, g => {
        for (let x = 0; x < BG_W; x++) {
          const h = 46 + 14 * Math.sin((x / BG_W) * TAU * 3 + 2) + 6 * Math.sin((x / BG_W) * TAU * 7);
          rect(g, x, H - h, 1, h, '#3fa860'); px(g, x, H - h, '#6ad08a');
        }
        for (let i = 0; i < 9; i++) {
          const x = hash(i, 9) * BG_W;
          for (const xx of [x, x - BG_W, x + BG_W]) { rect(g, xx, H - 86, 3, 30, '#6a4a2a'); disc(g, xx + 1.5, H - 90, 9, '#2a8a4a'); disc(g, xx - 2, H - 86, 6, '#3aa05a'); }
        }
      }) });
    } else if (theme === 'caverna') {
      layers.push({ f: 0.1, img: mk(BG_W, H, g => {
        for (let i = 0; i < 40; i++) px(g, (hash(i, 4) * BG_W) | 0, (hash(i, 6) * H) | 0, i % 3 ? '#5a3a8a' : '#00e5ff');
      }) });
      layers.push({ f: 0.3, img: mk(BG_W, H, g => {
        for (let x = 0; x < BG_W; x++) {
          const top = 30 + 16 * Math.sin((x / BG_W) * TAU * 3) + 8 * Math.sin((x / BG_W) * TAU * 8);
          const bot = 70 + 20 * Math.sin((x / BG_W) * TAU * 2 + 1) + 8 * Math.sin((x / BG_W) * TAU * 9);
          rect(g, x, 0, 1, top, '#1c0c36'); rect(g, x, H - bot, 1, bot, '#1c0c36');
        }
        for (let i = 0; i < 10; i++) {
          const x = (hash(i, 12) * BG_W) | 0, h = 8 + ((hash(i, 13) * 14) | 0);
          for (let y = 0; y < h; y++) rect(g, x - ((h - y) >> 2), H - 60 - y, ((h - y) >> 1) + 1, 1, i % 2 ? '#2a6a8a' : '#6a2a8a');
        }
      }) });
      layers.push({ f: 0.55, img: mk(BG_W, H, g => {
        for (let i = 0; i < 12; i++) {
          const x = (hash(i, 21) * BG_W) | 0, h = 14 + ((hash(i, 22) * 26) | 0), w = 5 + ((hash(i, 23) * 6) | 0);
          for (let y = 0; y < h; y++) {
            const ww = Math.max(1, Math.round(w * (1 - y / h)));
            rect(g, x - (ww >> 1), 28 + y, ww, 1, '#2a1446');
          }
        }
      }) });
    } else {
      layers.push({ f: 0.08, img: mk(BG_W, H, g => {
        g.strokeStyle = 'rgba(255,43,214,0.25)'; g.lineWidth = 1;
        for (let x = 0; x < BG_W; x += 24) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
        for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(BG_W, y + 0.5); g.stroke(); }
        disc(g, 300, 50, 18, '#ff2bd6'); disc(g, 300, 50, 15, '#2a0a2a');
        for (let i = 0; i < 5; i++) rect(g, 282, 44 + i * 4, 36, 1, '#2a0a2a');
      }) });
      layers.push({ f: 0.3, img: mk(BG_W, H, g => {
        let x = 0;
        while (x < BG_W) {
          const w = 30 + ((hash(x, 1) * 40) | 0), h = 80 + ((hash(x, 2) * 90) | 0);
          rect(g, x, H - h, w, h, '#160b2a');
          for (let i = 0; i < w; i += 8) rect(g, x + i, H - h - 6, 5, 6, '#160b2a');
          for (let wy = H - h + 12; wy < H - 30; wy += 16) for (let wx = x + 6; wx < x + w - 6; wx += 12) if (hash(wx, wy) < 0.35) rect(g, wx, wy, 3, 6, hash(wy, wx) < 0.5 ? '#00e5ff' : '#ff2bd6');
          x += w + 6;
        }
      }) });
      layers.push({ f: 0.6, img: mk(BG_W, H, g => {
        for (let x = 0; x < BG_W; x += 64) { rect(g, x + 20, 40, 10, H, '#0e0820'); rect(g, x + 19, 40, 12, 3, '#ff2bd6'); rect(g, x + 22, 46, 6, 60, 'rgba(255,43,214,0.15)'); }
      }) });
    }
    return layers;
  }

  /* =====================================================================
     SONS E MÚSICA (chiptune agendado no relógio do Web Audio)
     ===================================================================== */
  const S = {
    jump() { Sfx.tone(300, 0.14, 'square', 0.06, 620); },
    djump() { Sfx.tone(520, 0.12, 'square', 0.06, 1040); Sfx.noise(0.12, 0.08, 3000, 0, 'highpass', 800); },
    coin() { Sfx.tone(988, 0.06, 'square', 0.06); Sfx.tone(1319, 0.2, 'square', 0.06, null, 0.06); },
    stomp() { Sfx.tone(240, 0.12, 'square', 0.09, 70); Sfx.noise(0.08, 0.15, 1400); },
    bump() { Sfx.tone(150, 0.09, 'triangle', 0.18, 90); },
    item() { [523, 659, 784, 1047].forEach((f, i) => Sfx.tone(f, 0.07, 'square', 0.05, null, i * 0.05)); },
    heart() { [659, 880, 1175, 1568].forEach((f, i) => Sfx.tone(f, 0.12, 'triangle', 0.12, null, i * 0.06)); },
    hurt() { Sfx.tone(520, 0.3, 'sawtooth', 0.08, 110); },
    oneUp() { [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => Sfx.tone(f, 0.08, 'square', 0.06, null, i * 0.07)); },
    check() { [659, 988, 1319, 1760].forEach((f, i) => Sfx.tone(f, 0.1, 'triangle', 0.12, null, i * 0.07)); },
    flag() { for (let i = 0; i < 10; i++) Sfx.tone(392 * Math.pow(2, i / 6), 0.08, 'square', 0.05, null, i * 0.05); },
    bossHit() { Sfx.noise(0.35, 0.45, 2600); Sfx.tone(180, 0.35, 'sawtooth', 0.12, 50); },
    quake() { Sfx.noise(0.5, 0.45, 400); Sfx.tone(70, 0.4, 'triangle', 0.25, 35); },
    shoot() { Sfx.tone(700, 0.18, 'sawtooth', 0.05, 180); },
    tick() { Sfx.tone(1500, 0.03, 'square', 0.03); },
    warn() { [880, 0, 880, 0, 880].forEach((f, i) => f && Sfx.tone(f, 0.08, 'square', 0.06, null, i * 0.09)); },
    bounce() { Sfx.tone(200, 0.3, 'triangle', 0.15, 900); },
    door() { Sfx.noise(0.6, 0.3, 900); Sfx.tone(110, 0.5, 'square', 0.06, 220); },
  };

  const NOTE = n => {
    const m = /^([A-G])(#?)(\d)$/.exec(n);
    if (!m) return 0;
    const idx = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
    return 440 * Math.pow(2, (idx + (+m[3] + 1) * 12 - 69) / 12);
  };
  const song = (bpm, lead, mel, bass) => ({ bpm, lead, mel: mel.split(' ').map(NOTE), bass: bass.split(' ').map(NOTE) });
  const SONGS = {
    campo: song(150, 'square',
      'E5 G5 C6 G5 A5 G5 E5 C5 D5 F5 A5 F5 G5 F5 D5 B4 E5 G5 C6 E6 D6 C6 A5 G5 F5 A5 G5 E5 D5 - C5 -',
      'C3 C3 C3 C3 F2 F2 G2 G2 C3 C3 A2 A2 F2 G2 C3 C3'),
    caverna: song(112, 'triangle',
      'A4 - C5 E5 D5 - C5 B4 A4 - E4 - G4 A4 B4 - C5 - E5 A5 G5 - E5 D5 C5 B4 A4 G4 A4 - - -',
      'A2 A2 F2 F2 G2 G2 E2 E2 A2 A2 F2 F2 G2 E2 A2 A2'),
    fortaleza: song(168, 'square',
      'E5 - E5 G5 B5 - A5 G5 F#5 - D5 - E5 - B4 - E5 - E5 G5 B5 - D6 C6 B5 - A5 - G5 F#5 E5 -',
      'E2 E3 E2 E3 E2 E3 E2 E3 C2 C3 C2 C3 D2 D3 D2 D3 E2 E3 E2 E3 E2 E3 E2 E3 C2 C3 D2 D3 B1 B2 B1 B2'),
    chefe: song(184, 'square',
      'E5 F5 E5 D#5 E5 F5 E5 D#5 E5 G5 F#5 F5 E5 - B4 - C5 C#5 C5 B4 C5 C#5 C5 B4 C5 D#5 D5 C#5 C5 - B4 -',
      'E2 E2 E3 E2 E2 E2 E3 E2 E2 E2 E3 E2 E2 E2 E3 E2 C2 C2 C3 C2 C2 C2 C3 C2 B1 B1 B2 B1 B1 B1 B2 B1'),
  };
  const Music = (() => {
    let cur = null, id = '', step = 0, next = 0;
    return {
      play(name) { if (id === name && cur) return; id = name; cur = SONGS[name]; step = 0; next = 0; },
      stop() { cur = null; id = ''; },
      // Agenda as notas dos próximos 150 ms (chamado a cada quadro).
      update() {
        if (!cur || settings.musica !== 'on') return;
        const ac = Sfx.ensure();
        if (!ac) return;
        const dur = 60 / cur.bpm / 2;
        const ratio = cur.mel.length / cur.bass.length;
        if (next < ac.currentTime) next = ac.currentTime + 0.05;
        while (next < ac.currentTime + 0.15) {
          const d = next - ac.currentTime;
          const m = cur.mel[step % cur.mel.length];
          if (m) Sfx.tone(m, dur * 0.85, cur.lead, cur.lead === 'triangle' ? 0.09 : 0.035, null, d);
          if (step % ratio === 0) {
            const b = cur.bass[(step / ratio) % cur.bass.length];
            if (b) Sfx.tone(b, dur * ratio * 0.8, 'triangle', 0.08, null, d);
          }
          step++; next += dur;
        }
      },
    };
  })();

  /* =====================================================================
     ESTADO DO JOGO
     ===================================================================== */
  let state = 'menu', pausedFrom = null, stateT = 0, phase = '';
  let levelIdx = 0, L = null, theme = THEMES.campo, bgLayers = [], bgCache = {};
  let score = 0, lives = 3, coins = 0, coinsTotal = 0, kills = 0, timeLeft = TIME, warned = false, checkpointHit = false;
  let player = null, enemies = [], platforms = [], items = [], particles = [], popups = [], shots = [], waves = [], bumps = [];
  let boss = null, arenaLocked = false, bossDead = false;
  let camX = 0, time = 0, shake = 0, flagY = 0, flagBonus = 0, tallyT = 0, winBonus = 0, winNext = 0;
  let hi = +Arcade.store.get('super-pixel_hi', 0) || 0;
  let k = 1, skyGrad = null;
  const darkC = document.createElement('canvas'), dctx = darkC.getContext('2d');

  const WALK_SPEED = { campo: 28, caverna: 34, fortaleza: 42 };

  function newPlayer(x, y, hearts = 0) {
    return { x, y, w: 10, h: 14, vx: 0, vy: 0, face: 1, ground: false, coyote: 0, buf: 0, jumping: false, airJumps: 0, inv: 0, hearts, plat: null, anim: 0, dead: false, prevBottom: 0 };
  }

  function loadLevel(i, atCheckpoint) {
    levelIdx = i;
    L = parseLevel(LEVELS[i]);
    theme = THEMES[L.def.theme];
    bgLayers = bgCache[L.def.theme] || (bgCache[L.def.theme] = buildBackgrounds(L.def.theme));
    skyGrad = null;
    const sp = WALK_SPEED[L.def.theme];
    enemies = L.enemies.map(e => ({ ...e, dir: -1, vx: -sp, vy: 0, speed: sp, alive: true, active: false, t: Math.random() * 6, x0: e.x, y0: e.y, dead: 0, squash: false, ground: false }));
    platforms = L.platforms.map(p => ({ ...p, w: 48, h: 8, dx: 0, dy: 0, t: 0, prevY: p.y }));
    items = []; particles = []; popups = []; shots = []; waves = []; bumps = [];
    arenaLocked = false; bossDead = false;
    boss = L.boss ? { x: L.boss.x, y: L.boss.y - 30, w: 28, h: 30, vx: 0, vy: 0, hp: 3, inv: 0, mode: 'idle', t: 1.2, face: -1, ground: false, active: false, dead: -1 } : null;
    const cp = atCheckpoint && L.checkpoint;
    if (cp) L.checkpoint.on = true;
    const hearts = player && !player.dead ? player.hearts : 0;
    player = cp ? newPlayer(L.checkpoint.x - 5, L.checkpoint.y - 14, hearts) : newPlayer(L.start.x * TILE + 3, L.start.y * TILE + 2, hearts);
    timeLeft = TIME; warned = false;
    flagY = L.flag ? L.flag.top + 2 : 0;
    camX = clamp(player.x - W * 0.35, 0, Math.max(0, L.w * TILE - W));
  }

  /* ---------- tiles e colisão ---------- */
  const tileAt = (tx, ty) => {
    if (tx < 0 || tx >= L.w) return 'B';           // bordas da fase são paredes
    if (ty < 0 || ty >= ROWS) return '.';          // acima do topo e buracos
    return L.grid[ty][tx];
  };
  const isSolid = c => c === '#' || c === 'B' || c === '?' || c === 'H' || c === 'X' || (c === 'd' && arenaLocked) || (c === 'D' && !bossDead);
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function moveX(b, dx) {
    b.x += dx;
    const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
    if (dx > 0) {
      const tx = Math.floor((b.x + b.w) / TILE);
      for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(tx, ty))) { b.x = tx * TILE - b.w - 0.001; return true; }
    } else if (dx < 0) {
      const tx = Math.floor(b.x / TILE);
      for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(tx, ty))) { b.x = (tx + 1) * TILE + 0.001; return true; }
    }
    return false;
  }
  // Retorna { land } ao pousar ou { bonk: {tx, ty} } ao bater a cabeça.
  function moveY(b, dy, oneWay) {
    const prevBottom = b.y + b.h;
    b.y += dy;
    const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
    if (dy > 0) {
      const ty = Math.floor((b.y + b.h) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const c = tileAt(tx, ty);
        if (isSolid(c) || (oneWay && c === '=' && prevBottom <= ty * TILE + 0.5)) { b.y = ty * TILE - b.h; return { land: true }; }
      }
    } else if (dy < 0) {
      const ty = Math.floor(b.y / TILE);
      let hit = null;
      for (let tx = x0; tx <= x1; tx++) {
        if (!isSolid(tileAt(tx, ty))) continue;
        const d = Math.abs((tx + 0.5) * TILE - (b.x + b.w / 2));
        if (!hit || d < hit.d) hit = { tx, ty, d };
      }
      if (hit) { b.y = (ty + 1) * TILE; return { bonk: hit }; }
    }
    return {};
  }

  /* ---------- efeitos ---------- */
  function burst(x, y, n, colors, sp = 80, grav = 300, life = 0.5, size = 2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.8), l = life * (0.6 + Math.random() * 0.6);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, g: grav, life: l, max: l, color: Arcade.pick(colors), size });
    }
  }
  function popup(x, y, text, color = '#ffffff') { popups.push({ x, y, text, color, t: 0.9 }); }
  function addScore(n, x, y, color) { score += n; if (x !== undefined) popup(x, y, String(n), color); }
  function addCoin(x, y) {
    coins++; coinsTotal++;
    addScore(100);
    S.coin();
    burst(x, y, 6, ['#ffd400', '#fff6b0', '#ffffff'], 50, 0, 0.35, 1.5);
    if (coins >= 100) { coins -= 100; lives++; S.oneUp(); popup(player.x, player.y - 10, '1UP!', '#39ff14'); }
  }

  /* ---------- herói ---------- */
  const inp = { dir: 0, jump: false };
  let jumpEdge = false;

  function hurt() {
    const p = player;
    if (codes.has('IMORTAL') || p.inv > 0 || p.dead || state !== 'play') return;
    if (p.hearts > 0) {
      p.hearts--; p.inv = 1.6;
      p.vy = -200; p.vx = -p.face * 90;
      S.hurt(); shake = 0.25;
      burst(p.x + 5, p.y + 4, 10, ['#ff2b5c', '#ffd0dc'], 90);
      popup(p.x, p.y - 6, '♥ -1', '#ff2b5c');
    } else die('hit');
  }
  function die(why) {
    const p = player;
    if (state !== 'play' || p.dead) return;
    if (codes.has('IMORTAL')) {
      if (why === 'pit' || why === 'lava') { p.vy = -640; p.y = Math.min(p.y, H - 30); S.bounce(); burst(p.x + 5, p.y + 14, 12, ['#ffd400', '#ff2bd6', '#00e5ff'], 120); }
      else if (why === 'time') timeLeft = TIME;
      return;
    }
    p.dead = true; p.vx = 0; p.vy = -330; p.hearts = 0;
    state = 'dying'; stateT = 0;
    Music.stop();
    Sfx.lose();
    shake = 0.3;
  }

  function hitBlock(tx, ty) {
    const c = L.grid[ty][tx];
    bumps.push({ tx, ty, t: 0.18 });
    // inimigos em cima do bloco são derrubados
    for (const e of enemies) {
      if (e.alive && e.type === 'walker' && Math.abs(e.y + e.h - ty * TILE) < 3 && e.x + e.w > tx * TILE && e.x < tx * TILE + TILE) kill(e);
    }
    if (ty > 0 && L.grid[ty - 1][tx] === 'o') { L.grid[ty - 1][tx] = '.'; addCoin(tx * TILE + 8, ty * TILE - 8); }
    if (c === '?') {
      L.grid[ty][tx] = 'X';
      items.push({ type: 'popcoin', x: tx * TILE, y: ty * TILE - 16, vy: -230, t: 0.55 });
      addCoin(tx * TILE + 8, ty * TILE - 8);
      popup(tx * TILE + 2, ty * TILE - 18, '100', '#ffd400');
    } else if (c === 'H') {
      L.grid[ty][tx] = 'X';
      items.push({ type: 'heart', x: tx * TILE, y: ty * TILE, targetY: ty * TILE - 16, t: 0, w: 16, h: 14 });
      S.item();
    } else S.bump();
  }

  function stomp(e) {
    const p = player;
    e.alive = false; e.squash = true; e.dead = 0.45;
    kills++;
    addScore(200, e.x, e.y - 6, '#ffffff');
    p.vy = inp.jump ? -PHYS.jumpV * 0.95 : -PHYS.jumpV * 0.6;
    p.jumping = inp.jump;
    if (codes.has('KONAMI')) p.airJumps = 1;
    S.stomp();
    burst(e.x + 7, e.y + 8, 8, [theme.enemy.main, '#ffffff'], 70);
  }
  function kill(e) {
    e.alive = false; e.squash = false; e.dead = 1.4; e.vy = -220;
    kills++;
    addScore(200, e.x, e.y - 6, '#ffffff');
    S.stomp();
  }

  function updatePlayer(dt) {
    const p = player;
    const moon = codes.has('LUA');
    p.prevBottom = p.y + p.h;
    // andar: aceleração e atrito
    const dir = inp.dir;
    const acc = p.ground ? PHYS.accGround : PHYS.accAir;
    if (dir) {
      p.vx += dir * acc * dt;
      if (p.ground && Math.sign(p.vx) === -dir) {
        p.vx += dir * PHYS.friction * dt;   // derrapada ao virar
        if (Math.abs(p.vx) > 40 && Math.random() < 0.3) particles.push({ x: p.x + 5, y: p.y + p.h, vx: -dir * 20, vy: -20, g: 0, life: 0.25, max: 0.25, color: '#e8e0d0', size: 2 });
      }
      p.face = dir;
    } else {
      const f = (p.ground ? PHYS.friction : PHYS.friction * 0.25) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }
    p.vx = clamp(p.vx, -PHYS.maxVX, PHYS.maxVX);

    // coyote time e buffer de pulo
    p.coyote = p.ground ? PHYS.coyote : p.coyote - dt;
    if (jumpEdge) { p.buf = PHYS.buffer; jumpEdge = false; } else p.buf -= dt;
    const jv = PHYS.jumpV * (moon ? 1.2 : 1);
    if (p.buf > 0 && (p.ground || p.coyote > 0)) {
      p.vy = -jv; p.ground = false; p.coyote = 0; p.buf = 0; p.plat = null; p.jumping = true;
      S.jump();
      burst(p.x + 5, p.y + p.h, 4, ['#ffffff', '#d8d0e8'], 30, 0, 0.25, 2);
    } else if (p.buf > 0 && !p.ground && p.airJumps > 0 && codes.has('KONAMI')) {
      p.airJumps--; p.vy = -jv * 0.92; p.buf = 0; p.jumping = true;
      S.djump();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; particles.push({ x: p.x + 5, y: p.y + p.h, vx: Math.cos(a) * 60, vy: Math.sin(a) * 20, g: 0, life: 0.3, max: 0.3, color: '#00e5ff', size: 2 }); }
    }
    // altura variável: soltar o botão corta a subida
    if (p.jumping && !inp.jump && p.vy < 0) { p.vy *= PHYS.cut; p.jumping = false; }
    if (p.vy >= 0) p.jumping = false;
    const grav = (p.vy < 0 && inp.jump ? PHYS.gravHold : PHYS.grav) * (moon ? 0.8 : 1);
    p.vy = Math.min(PHYS.maxFall * (moon ? 0.75 : 1), p.vy + grav * dt);

    // movimento com colisão
    if (moveX(p, p.vx * dt)) p.vx = 0;
    const wasGround = p.ground;
    const fallV = p.vy;
    const r = moveY(p, p.vy * dt, true);
    p.ground = false;
    if (r.land) { p.vy = 0; p.ground = true; p.plat = null; }
    if (r.bonk) { p.vy = 20; p.jumping = false; hitBlock(r.bonk.tx, r.bonk.ty); }
    // plataformas móveis (só por cima)
    if (p.vy >= 0) {
      for (const pl of platforms) {
        if (p.x + p.w > pl.x + 1 && p.x < pl.x + pl.w - 1 && p.prevBottom <= pl.prevY + 2 && p.y + p.h >= pl.y) {
          p.y = pl.y - p.h; p.vy = 0; p.ground = true; p.plat = pl;
        }
      }
    }
    if (p.ground && !wasGround && fallV > 260) burst(p.x + 5, p.y + p.h, 5, ['#ffffff', '#d8d0e8'], 40, 0, 0.25, 2);
    if (p.ground) p.airJumps = 1;
    p.anim += Math.abs(p.vx) * dt;
    p.inv = Math.max(0, p.inv - dt);

    // moedas e perigos dos tiles
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.01) / TILE);
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = tileAt(tx, ty);
        if (c === 'o') { L.grid[ty][tx] = '.'; addCoin(tx * TILE + 8, ty * TILE + 8); }
        else if (c === '^' && p.y + p.h > ty * TILE + 9 && p.x + p.w > tx * TILE + 2 && p.x < tx * TILE + 14) {
          if (codes.has('IMORTAL')) { p.vy = -260; p.y = ty * TILE + 8 - p.h; } else hurt();
        } else if (c === '~' && p.y + p.h > ty * TILE + 4) die('lava');
      }
    }
    if (p.y > H + 8) die('pit');
  }

  /* ---------- inimigos, itens, plataformas ---------- */
  function updatePlatforms(dt) {
    for (const pl of platforms) {
      pl.t += dt;
      pl.prevY = pl.y;
      const nx = pl.kind === 'h' ? pl.x0 + ((1 - Math.cos(pl.t * 0.8)) / 2) * pl.range : pl.x0;
      const ny = pl.kind === 'v' ? pl.y0 + Math.sin(pl.t * 1.1 + pl.x0 * 0.01) * pl.range : pl.y0;
      pl.dx = nx - pl.x; pl.dy = ny - pl.y;
      pl.x = nx; pl.y = ny;
      if (player.plat === pl && !player.dead) {
        if (player.x + player.w > pl.x && player.x < pl.x + pl.w) { moveX(player, pl.dx); player.y = pl.y - player.h; }
        else player.plat = null;
      }
    }
  }

  function updateEnemies(dt) {
    const p = player;
    for (const e of enemies) {
      if (!e.alive) {
        e.dead -= dt;
        if (!e.squash) { e.vy += 900 * dt; e.y += e.vy * dt; }
        continue;
      }
      if (!e.active) { if (e.x < camX + W + 24 && e.x > camX - 64) e.active = true; else continue; }
      e.t += dt;
      if (e.type === 'walker') {
        e.vx = e.dir * e.speed;
        e.vy = Math.min(400, e.vy + 900 * dt);
        if (moveX(e, e.vx * dt)) e.dir *= -1;
        const r = moveY(e, e.vy * dt, true);
        e.ground = !!r.land;
        if (r.land) e.vy = 0;
        if (e.ground) {
          // vira ao chegar na beirada
          const ahead = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
          const c = tileAt(Math.floor(ahead / TILE), Math.floor((e.y + e.h + 2) / TILE));
          if (!isSolid(c) && c !== '=') e.dir *= -1;
        }
        if (e.y > H + 20) { e.alive = false; e.dead = 0; }
      } else {
        const ox = Math.sin(e.t * 0.9) * 40;
        e.dir = Math.cos(e.t * 0.9) >= 0 ? 1 : -1;
        e.x = e.x0 + ox; e.y = e.y0 + Math.sin(e.t * 2.4) * 10;
      }
      if (p.dead || state !== 'play') continue;
      const hb = { x: e.x + 1, y: e.y + 2, w: e.w - 2, h: e.h - 2 };
      if (overlap(p, hb)) {
        if (codes.has('IMORTAL')) kill(e);
        else if (p.vy > 0 && p.prevBottom <= e.y + 7) stomp(e);
        else hurt();
      }
    }
    enemies = enemies.filter(e => e.alive || e.dead > 0);
  }

  function updateItems(dt) {
    for (const it of items) {
      it.t += dt;
      if (it.type === 'popcoin') { it.vy += 900 * dt; it.y += it.vy * dt; if (it.t > 0.55) it.done = true; }
      else if (it.type === 'heart') {
        it.y = it.t < 0.35 ? lerp(it.targetY + 16, it.targetY, it.t / 0.35) : it.targetY + Math.sin(it.t * 4) * 2;
        if (overlap(player, it) && !player.dead) {
          it.done = true;
          if (player.hearts < MAX_HEARTS) { player.hearts++; popup(it.x, it.y - 6, '♥ +1', '#ff2b5c'); }
          else addScore(1000, it.x, it.y - 6, '#ff2b5c');
          S.heart();
          burst(it.x + 8, it.y + 7, 14, ['#ff2b5c', '#ffd0dc', '#ffffff'], 80);
        }
      }
    }
    items = items.filter(it => !it.done);
  }

  /* ---------- chefe: MEGA GLITCH ---------- */
  function updateBoss(dt) {
    const b = boss, p = player;
    if (!b) return;
    if (!b.active) {
      if (L.arena && !arenaLocked && p.x > (L.arena.x0 + 2) * TILE) {
        arenaLocked = true; b.active = true; b.mode = 'idle'; b.t = 1.4;
        Music.play('chefe'); S.door(); shake = 0.4;
        popup(p.x - 20, p.y - 20, 'MEGA GLITCH!', '#ff2bd6');
      }
      return;
    }
    if (b.hp <= 0) {
      b.dead += dt;
      if (Math.random() < dt * 14) burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, 6, ['#ff2bd6', '#00e5ff', '#ffd400', '#ffffff'], 120, 100, 0.6, 3);
      if (b.dead > 2 && !bossDead) {
        bossDead = true;
        S.door(); Sfx.win();
        for (let ty = 2; ty < 12; ty++) burst(L.arena.x1 * TILE + 8, ty * TILE + 8, 3, ['#ff2bd6', '#ffb0f0'], 60);
        Music.play(L.def.song);
        popup(p.x - 16, p.y - 20, 'PORTA ABERTA!', '#39ff14');
      }
      return;
    }
    b.inv = Math.max(0, b.inv - dt);
    const rage = [1, 1.7, 1.3, 1][b.hp];
    b.t -= dt;
    b.vy = Math.min(500, b.vy + 1000 * dt);
    if (b.mode === 'idle') {
      b.vx = 0;
      if (b.t <= 0) { b.mode = 'walk'; b.t = 1.6 / rage; }
    } else if (b.mode === 'walk') {
      b.face = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
      b.vx = b.face * 45 * rage;
      if (b.t <= 0 && b.ground) {
        if (Math.random() < 0.55) {
          b.mode = 'jump'; b.vy = -420; b.ground = false;
          b.vx = clamp((p.x - b.x) * 1.2, -170, 170);
        } else { b.mode = 'aim'; b.t = 0.55; b.vx = 0; }
      }
    } else if (b.mode === 'jump') {
      if (b.ground && b.vy >= 0) {
        // pouso: duas ondas de choque correm pelo chão
        const fy = b.y + b.h;
        waves.push({ x: b.x + 2, y: fy, dir: -1, life: 3 }, { x: b.x + b.w - 2, y: fy, dir: 1, life: 3 });
        shake = 0.45; S.quake();
        burst(b.x + b.w / 2, fy, 14, ['#c8b8e8', '#ffffff'], 90, 200, 0.5, 3);
        b.mode = 'walk'; b.t = 1.8 / rage; b.vx = 0;
      }
    } else if (b.mode === 'aim') {
      b.vx = 0;
      if (b.t <= 0) {
        const n = b.hp === 1 ? 5 : 3;
        for (let i = 0; i < n; i++) shots.push({ x: b.x + b.w / 2, y: b.y + 8, vx: b.face * (50 + i * 38), vy: -230 - i * 25, r: 4, life: 4.5, bounces: 2 });
        S.shoot();
        b.mode = 'walk'; b.t = 2 / rage;
      }
    }
    if (moveX(b, b.vx * dt)) b.vx = 0;
    const r = moveY(b, b.vy * dt, false);
    b.ground = !!r.land;
    if (r.land) b.vy = 0;

    if (p.dead || state !== 'play') return;
    if (overlap(p, { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 2 })) {
      if (p.vy > 0 && p.prevBottom <= b.y + 10) {
        p.vy = -PHYS.jumpV * 1.05; p.jumping = inp.jump;
        if (b.inv <= 0) {
          b.hp--; b.inv = 1.3;
          S.bossHit(); shake = 0.5;
          burst(b.x + b.w / 2, b.y, 16, ['#ff2bd6', '#00e5ff', '#ffffff'], 130);
          if (b.hp <= 0) {
            b.dead = 0; shots = []; waves = []; kills++;
            addScore(5000, b.x, b.y - 10, '#ffd400');
          } else { b.mode = 'walk'; b.t = 0.9; popup(b.x, b.y - 10, `${b.hp}/3`, '#ff2bd6'); }
        }
      } else if (!codes.has('IMORTAL')) {
        hurt();
        p.vx = (p.x < b.x ? -1 : 1) * 160;
      }
    }
  }

  function updateShots(dt) {
    const p = player;
    for (const s of shots) {
      s.life -= dt;
      s.vy += 600 * dt;
      s.x += s.vx * dt;
      if (isSolid(tileAt(Math.floor((s.x + Math.sign(s.vx) * s.r) / TILE), Math.floor(s.y / TILE)))) s.vx = -s.vx;
      s.y += s.vy * dt;
      if (s.vy > 0 && isSolid(tileAt(Math.floor(s.x / TILE), Math.floor((s.y + s.r) / TILE)))) {
        s.y = Math.floor((s.y + s.r) / TILE) * TILE - s.r; s.vy = -Math.abs(s.vy) * 0.75; s.bounces--;
        if (s.bounces < 0) s.life = 0;
      }
      if (Math.random() < 0.5) particles.push({ x: s.x, y: s.y, vx: 0, vy: 0, g: 0, life: 0.2, max: 0.2, color: '#ff2bd6', size: 2 });
      if (!p.dead && overlap(p, { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 })) { hurt(); s.life = 0; }
    }
    shots = shots.filter(s => s.life > 0);
    for (const w of waves) {
      w.life -= dt;
      w.x += w.dir * 130 * dt;
      if (isSolid(tileAt(Math.floor(w.x / TILE), Math.floor((w.y - 6) / TILE)))) w.life = 0;
      if (Math.random() < 0.6) particles.push({ x: w.x, y: w.y - 2, vx: -w.dir * 20, vy: -40, g: 100, life: 0.3, max: 0.3, color: '#00e5ff', size: 2 });
      if (!p.dead && overlap(p, { x: w.x - 5, y: w.y - 12, w: 10, h: 12 })) { hurt(); w.life = 0; }
    }
    waves = waves.filter(w => w.life > 0);
  }

  /* ---------- sequência da bandeira e troca de fase ---------- */
  function touchFlag() {
    const f = L.flag, p = player;
    const frac = clamp((f.y - (p.y + p.h)) / (f.y - f.top), 0, 1);
    flagBonus = Math.max(100, Math.round(frac * 10) * 100);
    addScore(flagBonus, f.x + 6, p.y, frac > 0.9 ? '#ffd400' : '#ffffff');
    state = 'clear'; phase = 'slide'; stateT = 0;
    p.vx = 0; p.vy = 0; p.x = f.x - p.w - 1; p.face = 1; p.plat = null;
    Music.stop(); S.flag();
  }
  function updateClear(dt) {
    const p = player, f = L.flag;
    stateT += dt;
    if (phase === 'slide') {
      p.y = Math.min(f.y - p.h, p.y + 120 * dt);
      flagY = Math.min(f.y - 14, flagY + 120 * dt);
      if (p.y >= f.y - p.h && flagY >= f.y - 14) { phase = 'walk'; stateT = 0; p.x = f.x + 2; Sfx.win(); }
    } else if (phase === 'walk') {
      p.vx = 60; p.face = 1;
      p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.grav * dt);
      if (moveX(p, p.vx * dt)) p.vx = 0;
      const r = moveY(p, p.vy * dt, true);
      p.ground = !!r.land; if (r.land) p.vy = 0;
      p.anim += 60 * dt;
      if (stateT > 1.5) { phase = 'tally'; stateT = 0; tallyT = 0; timeLeft = Math.ceil(timeLeft); p.vx = 0; }
    } else if (phase === 'tally') {
      tallyT += dt;
      while (tallyT > 0.025 && timeLeft > 0) {
        tallyT -= 0.025;
        const d = Math.min(2, timeLeft);
        timeLeft -= d; addScore(d * 10);
        if ((timeLeft | 0) % 4 === 0) S.tick();
      }
      if (timeLeft <= 0 && stateT > 1) {
        if (levelIdx < LEVELS.length - 1) { checkpointHit = false; loadLevel(levelIdx + 1, false); state = 'intro'; stateT = 0; }
        else { state = 'win'; stateT = 0; winBonus = lives; winNext = 1.2; Music.stop(); }
      }
    }
  }

  /* =====================================================================
     DESENHO
     ===================================================================== */
  function drawText(text, x, y, size, color, align = 'left', alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size / 4); ctx.strokeStyle = '#120a20'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  const snap = v => Math.round(v * k) / k;
  function drawTiles(cx) {
    const tx0 = Math.max(0, Math.floor(cx / TILE)), tx1 = Math.min(L.w - 1, Math.floor((cx + W) / TILE) + 1);
    const th = L.def.theme;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = L.grid[ty][tx];
        if (c === '.' || c === 'o') continue;
        const x = tx * TILE - cx;
        let y = ty * TILE;
        if (c === '~') {
          const top = ty === 0 || L.grid[ty - 1][tx] !== '~';
          ctx.fillStyle = top ? '#ff6a1a' : '#c8300a'; ctx.fillRect(snap(x), snap(y), snap(x + TILE) - snap(x), snap(y + TILE) - snap(y));
          if (top) {
            for (let i = 0; i < 16; i += 2) { const hh = 2 + Math.round(Math.sin(time * 4 + (tx * 16 + i) * 0.4) * 1.5); ctx.fillStyle = '#ffd400'; ctx.fillRect(x + i, y, 2, hh); }
          } else if (hash(tx, ty + Math.floor(time * 3)) < 0.3) { ctx.fillStyle = '#ff8a3a'; ctx.fillRect(x + 6, y + 6, 3, 3); }
          continue;
        }
        if ((c === 'd' && !arenaLocked) || (c === 'D' && bossDead)) continue;
        const bump = bumps.find(b => b.tx === tx && b.ty === ty);
        if (bump) y -= Math.sin((1 - bump.t / 0.18) * Math.PI) * 4;
        const top = c === '#' && (ty === 0 || L.grid[ty - 1][tx] !== '#');
        const sx = snap(x), sy = snap(y);
        ctx.drawImage(tileArt(th, c, top), sx, sy, snap(x + TILE) - sx, snap(y + TILE) - sy);
        if ((c === '?' || c === 'H') && Math.sin(time * 5 + tx) > 0.6) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 1, y + 1, 14, 14); }
        if ((c === 'd' || c === 'D') && Math.random() < 0.05) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + ((Math.random() * 14) | 0), y, 1, TILE); }
      }
    }
    // moedas giratórias
    const frame = Math.floor(time * 8) % 4;
    for (let ty = 0; ty < ROWS; ty++) for (let tx = tx0; tx <= tx1; tx++) if (L.grid[ty][tx] === 'o') ctx.drawImage(COIN[(frame + tx) % 4], tx * TILE - cx, ty * TILE + Math.sin(time * 3 + tx) * 1);
  }

  function drawDecor(cx) {
    for (const d of L.decor) {
      const x = d.x * TILE - cx;
      if (x < -16 || x > W) continue;
      if (d.c === '*') ctx.drawImage(FLOWER[(d.x + d.y) % 3], x, d.y * TILE + Math.round(Math.sin(time * 2 + d.x) * 0.6));
      else if (d.c === 'c') ctx.drawImage(CRYSTAL[d.y > 0 && isSolid(tileAt(d.x, d.y - 1)) ? 1 : 0], x, d.y * TILE);
      else if (d.c === 't') {
        ctx.drawImage(TORCH, x, d.y * TILE);
        if (Math.random() < 0.3) particles.push({ x: d.x * TILE + 8 + (Math.random() - 0.5) * 3, y: d.y * TILE + 3, vx: 0, vy: -20, g: 0, life: 0.3, max: 0.3, color: '#ff8ae6', size: 1 });
      }
    }
  }

  function drawFlags(cx) {
    const cp = L.checkpoint;
    if (cp) {
      const x = cp.x - cx;
      ctx.fillStyle = '#d8d0e8'; ctx.fillRect(x - 1, cp.y - 30, 2, 30);
      ctx.fillStyle = '#5a4a80'; ctx.fillRect(x - 3, cp.y - 2, 6, 2);
      const col = cp.on ? '#39ff14' : '#7a708a';
      const wv = Math.sin(time * 6) * 1.5;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x + 1, cp.y - 30); ctx.lineTo(x + 12, cp.y - 26 + wv); ctx.lineTo(x + 1, cp.y - 22); ctx.fill();
      if (cp.on) ctx.drawImage(GLOW.cyan, x - 8, cp.y - 38, 24, 24);
    }
    const f = L.flag;
    if (f) {
      const x = f.x - cx;
      ctx.fillStyle = '#e8e0f8'; ctx.fillRect(x - 1, f.top, 2, f.y - f.top);
      ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(x, f.top - 2, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a4a80'; ctx.fillRect(x - 5, f.y - 4, 10, 4);
      const wv = Math.sin(time * 5) * 2;
      ctx.fillStyle = '#ff2bd6';
      ctx.beginPath(); ctx.moveTo(x - 1, flagY); ctx.lineTo(x - 16, flagY + 6 + wv); ctx.lineTo(x - 1, flagY + 12); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 8, flagY + 5, 3, 3);
    }
  }

  function drawPlayer(cx) {
    const p = player;
    if (state === 'menu') return;
    if (p.inv > 0 && Math.floor(time * 20) % 2 && !p.dead) return;
    let img;
    if (p.dead) img = HERO.dead;
    else if (!p.ground && state !== 'clear') img = HERO.jump;
    else if (state === 'clear' && phase === 'slide') img = HERO.jump;
    else if (Math.abs(p.vx) > 5) img = [HERO.runA, HERO.runB, HERO.idle, HERO.runB][Math.floor(p.anim / 7) % 4];
    else img = HERO.idle;
    const x = Math.round((p.x - 3 - cx) * k) / k, y = Math.round((p.y - 2) * k) / k;
    if (p.hearts > 0 || codes.has('IMORTAL')) {
      const g = codes.has('IMORTAL') ? [GLOW.cyan, GLOW.pink, GLOW.amber][Math.floor(time * 10) % 3] : GLOW.pink;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 6);
      ctx.drawImage(g, x - 8, y - 8, 32, 32);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    if (p.face < 0) { ctx.translate(x + 16, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
    if (p.dead) { ctx.translate(x + 8, y + 8); ctx.rotate(Math.PI); ctx.translate(-x - 8, -y - 8); }
    ctx.drawImage(img, x, y);
    ctx.restore();
  }

  function drawEnemies(cx) {
    const th = L.def.theme;
    for (const e of enemies) {
      const x = e.x - 1 - cx, y = e.y - (e.type === 'walker' ? 4 : 2);
      if (x < -20 || x > W + 4) continue;
      const fr = Math.floor((e.t || time) * (e.type === 'walker' ? 6 : 10)) % 2;
      const key = th + e.type + fr;
      const img = artCache[key] || (artCache[key] = e.type === 'walker' ? walkerArt(theme.enemy, fr, th) : flyerArt(theme.flyer, fr));
      ctx.save();
      if (e.squash) { ctx.translate(x, y + 16); ctx.scale(1, 0.35); ctx.translate(-x, -y - 16); }
      else if (!e.alive) { ctx.translate(x + 8, y + 8); ctx.rotate(Math.PI); ctx.translate(-x - 8, -y - 8); }
      if (e.dir > 0) { ctx.translate(x + 16, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      ctx.drawImage(img, x, y);
      ctx.restore();
    }
  }
  const artCache = {};

  function drawBoss(cx) {
    const b = boss;
    if (!b || (b.hp <= 0 && b.dead > 2)) return;
    const flash = b.inv > 0 && Math.floor(time * 16) % 2;
    let x = b.x - 2 - cx, y = b.y - 2;
    if (b.mode === 'aim' && b.hp > 0) x += Math.sin(time * 60) * 1.5;
    ctx.save();
    if (b.hp <= 0) { ctx.globalAlpha = Math.max(0, 1 - b.dead / 2); x += (Math.random() - 0.5) * 6; }
    if (b.face > 0) { ctx.translate(x + 32, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    ctx.drawImage(BOSS[flash ? 1 : 0], x, y);
    // faixas de "glitch"
    if (b.inv > 0 || b.hp <= 1 || Math.random() < 0.04) {
      for (let i = 0; i < 3; i++) {
        const gy = y + Math.random() * 30;
        ctx.globalAlpha = 0.7;
        ctx.drawImage(BOSS[0], 0, gy - y, 32, 3, x + (Math.random() - 0.5) * 8, gy, 32, 3);
      }
    }
    ctx.restore();
    for (const s of shots) {
      ctx.drawImage(GLOW.pink, s.x - cx - 10, s.y - 10, 20, 20);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - cx - 2, s.y - 2, 4, 4);
    }
    for (const w of waves) {
      const x2 = w.x - cx;
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath(); ctx.moveTo(x2 - 6, w.y); ctx.lineTo(x2 + w.dir * 3, w.y - 12 - Math.sin(time * 30) * 2); ctx.lineTo(x2 + 6 * w.dir, w.y); ctx.fill();
      ctx.drawImage(GLOW.cyan, x2 - 12, w.y - 20, 24, 24);
    }
  }

  // Cavernas: tudo escuro, com luz em volta do herói, dos cristais e das moedas.
  function drawDarkness(cx) {
    if (darkC.width !== canvas.width || darkC.height !== canvas.height) { darkC.width = canvas.width; darkC.height = canvas.height; }
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, darkC.width, darkC.height);
    dctx.fillStyle = 'rgba(6,2,20,0.74)';
    dctx.fillRect(0, 0, darkC.width, darkC.height);
    dctx.setTransform(k, 0, 0, k, 0, 0);
    dctx.globalCompositeOperation = 'destination-out';
    const p = player;
    const pr = 96 + Math.sin(time * 3) * 3;
    if (state !== 'menu') dctx.drawImage(GLOW.white, p.x + 5 - cx - pr, p.y + 7 - pr, pr * 2, pr * 2);
    else dctx.drawImage(GLOW.white, W / 2 - 120, H / 2 - 120, 240, 240);
    const glows = [];
    for (const d of L.decor) if (d.c === 'c') glows.push([d.x * TILE + 8 - cx, d.y * TILE + 8, 44]);
    const tx0 = Math.floor(cx / TILE), tx1 = tx0 + Math.ceil(W / TILE) + 1;
    for (let ty = 0; ty < ROWS; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const c = tileAt(tx, ty);
      if (c === 'o') glows.push([tx * TILE + 8 - cx, ty * TILE + 8, 18]);
      else if (c === 'B' || c === '?' || c === 'H') glows.push([tx * TILE + 8 - cx, ty * TILE + 8, 22]);
    }
    for (const e of enemies) if (e.type === 'flyer') glows.push([e.x + 7 - cx, e.y + 6, 20]);
    for (const [x, y, r] of glows) if (x > -r && x < W + r) dctx.drawImage(GLOW.white, x - r, y - r, r * 2, r * 2);
    ctx.drawImage(darkC, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const d of L.decor) {
      const x = d.x * TILE + 8 - cx;
      if (d.c === 'c' && x > -30 && x < W + 30) { ctx.globalAlpha = 0.45 + 0.25 * Math.sin(time * 2 + d.x); ctx.drawImage((d.x % 2) ? GLOW.cyan : GLOW.pink, x - 22, d.y * TILE + 8 - 22, 44, 44); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawLights(cx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const d of L.decor) {
      const x = d.x * TILE + 8 - cx;
      if (d.c === 't' && x > -40 && x < W + 40) { ctx.globalAlpha = 0.55 + 0.15 * Math.sin(time * 9 + d.x); ctx.drawImage(GLOW.pink, x - 28, d.y * TILE + 4 - 28, 56, 56); }
    }
    // brilho da lava
    const tx0 = Math.floor(cx / TILE), tx1 = tx0 + Math.ceil(W / TILE) + 1;
    ctx.globalAlpha = 0.35;
    for (let tx = tx0; tx <= tx1; tx++) if (tileAt(tx, 13) === '~') ctx.drawImage(GLOW.lava, tx * TILE + 8 - cx - 26, 13 * TILE - 22, 52, 52);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawHud() {
    // faixa superior
    ctx.fillStyle = 'rgba(10,4,24,0.55)'; ctx.fillRect(0, 0, W, 15);
    ctx.save();
    ctx.translate(2, 0); ctx.scale(0.6, 0.6); ctx.drawImage(HERO.idle, 0, 2); ctx.restore();
    drawText(`×${lives}`, 13, 8, 8, '#ffffff');
    ctx.drawImage(COIN[0], 34, -1, 16, 16);
    drawText(`×${String(coins).padStart(2, '0')}`, 46, 8, 8, '#ffd400');
    drawText(`FASE ${levelIdx + 1}`, W / 2 + 10, 8, 8, '#ffb000', 'center');
    const tl = Math.max(0, Math.ceil(timeLeft));
    drawText(`⏱${tl}`, W - 3, 8, 8, tl <= 60 && Math.floor(time * 4) % 2 ? '#ff3b5c' : '#ffffff', 'right');
    // corações extras
    for (let i = 0; i < player.hearts; i++) ctx.drawImage(HEART, 1 + i * 11, 13, 12, 12);
    // vida do chefe
    if (boss && boss.active && boss.hp > 0) {
      const bw = 90, bx = W / 2 - bw / 2, by = 20;
      drawText('MEGA GLITCH', W / 2, by, 7, '#ff2bd6', 'center');
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#1a0f24'; ctx.fillRect(bx + i * 31, by + 6, 28, 5);
        ctx.fillStyle = i < boss.hp ? '#ff2bd6' : '#3a2a50'; ctx.fillRect(bx + i * 31 + 1, by + 7, 26, 3);
      }
    }
  }

  function drawCard() {
    ctx.fillStyle = '#0a0418'; ctx.fillRect(0, 0, W, H);
    if (state === 'win') {
      drawText('PARABÉNS!', W / 2, H * 0.32, 20, '#ffb000', 'center');
      drawText('O MEGA GLITCH FOI', W / 2, H * 0.46, 9, '#ffffff', 'center');
      drawText('DERROTADO!', W / 2, H * 0.53, 9, '#ffffff', 'center');
      drawText(`BÔNUS DE VIDAS: ${winBonus} × 1000`, W / 2, H * 0.68, 8, '#39ff14', 'center');
      ctx.drawImage(HERO.jump, W / 2 - 8, H * 0.78 + Math.sin(time * 6) * 4);
      return;
    }
    drawText(`FASE ${levelIdx + 1}`, W / 2, H * 0.34, 18, '#ffb000', 'center');
    drawText(LEVELS[levelIdx].name, W / 2, H * 0.46, 10, '#ffffff', 'center');
    ctx.drawImage(HERO.idle, W / 2 - 22, H * 0.6);
    drawText(`× ${lives}`, W / 2 + 2, H * 0.6 + 8, 10, '#ffffff');
  }

  function render() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (state === 'intro' || state === 'win') { drawCard(); crt(); return; }
    let cx = Math.round(camX * k) / k;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 6);
    // céu e parallax
    if (!skyGrad) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      theme.sky.forEach((c, i) => skyGrad.addColorStop(i / (theme.sky.length - 1), c));
    }
    ctx.fillStyle = skyGrad; ctx.fillRect(-10, -10, W + 20, H + 20);
    if (L.def.theme === 'campo') {
      ctx.drawImage(GLOW.amber, W - 90, -20, 110, 110);
      ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(W - 35, 35, 14, 0, TAU); ctx.fill();
    }
    for (const ly of bgLayers) {
      const off = Math.round(((cx * ly.f) % BG_W) * k) / k;
      for (let x = -off; x < W; x += BG_W) ctx.drawImage(ly.img, x, 0);
    }
    drawDecor(cx);
    drawTiles(cx);
    drawFlags(cx);
    for (const pl of platforms) {
      const x = pl.x - cx;
      if (x < -50 || x > W) continue;
      const art = tileArt(L.def.theme, '=', false);
      for (let i = 0; i < 3; i++) ctx.drawImage(art, x + i * 16, pl.y);
      ctx.fillStyle = L.def.theme === 'campo' ? '#ffb000' : '#ff2bd6'; ctx.fillRect(x + 2, pl.y + 3, 44, 1);
    }
    for (const it of items) {
      if (it.type === 'popcoin') ctx.drawImage(COIN[Math.floor(time * 16) % 4], it.x - cx, it.y);
      else ctx.drawImage(HEART, it.x - cx, it.y);
    }
    drawEnemies(cx);
    drawBoss(cx);
    if (!theme.dark) drawPlayer(cx);
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cx - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    if (theme.dark) { drawDarkness(cx); drawPlayer(cx); }
    else if (L.def.theme === 'fortaleza') drawLights(cx);
    for (const pp of popups) drawText(pp.text, pp.x - cx, pp.y - (0.9 - pp.t) * 24, 7, pp.color, 'left', Math.min(1, pp.t * 3));
    ctx.restore();
    if (state !== 'menu') drawHud();
    crt();
  }
  function crt() {
    if (settings.crt !== 'on') return;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 0.7);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* =====================================================================
     FLUXO DO JOGO
     ===================================================================== */
  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }
  function start() {
    if (state !== 'menu' && state !== 'over') return;
    Sfx.ensure();
    score = 0; lives = 3; coins = 0; coinsTotal = 0; kills = 0; checkpointHit = false;
    player = null;
    loadLevel(0, false);
    state = 'intro'; stateT = 0;
    show(null);
  }
  function toMenu() {
    state = 'menu';
    Music.stop();
    loadLevel(0, false);
    show('menu');
  }
  function togglePause() {
    if (state === 'play' || state === 'intro' || state === 'dying' || state === 'clear' || state === 'win') {
      pausedFrom = state; state = 'pause'; show('pause');
    } else if (state === 'pause') {
      state = pausedFrom; show(null);
    }
  }
  function gameOver(won) {
    state = 'over';
    Music.stop();
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set('super-pixel_hi', hi); }
    Ranking.gameOver($('rankBox'), { board: 'super-pixel', score, cheated });
    $('overTitle').textContent = won ? 'VOCÊ VENCEU!' : 'FIM DE JOGO';
    $('overScore').textContent = score;
    $('overInfo').textContent = won
      ? `O MEGA GLITCH caiu! ${coinsTotal} moedas · ${kills} inimigos derrotados.`
      : `Parou na fase ${levelIdx + 1} (${LEVELS[levelIdx].name}) · ${coinsTotal} moedas · ${kills} inimigos.`;
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else if (!won) Sfx.lose();
  }

  function update(dt) {
    if (state === 'play') {
      timeLeft -= dt;
      if (timeLeft <= 60 && !warned) { warned = true; S.warn(); popup(player.x - 10, player.y - 14, 'PRESSA!', '#ff3b5c'); }
      if (timeLeft <= 0) { timeLeft = 0; die('time'); }
      updatePlatforms(dt);
      updatePlayer(dt);
      if (state !== 'play') return;
      updateEnemies(dt);
      updateItems(dt);
      updateBoss(dt);
      updateShots(dt);
      const cp = L.checkpoint;
      if (cp && !cp.on && player.x + player.w > cp.x - 4) {
        cp.on = true; checkpointHit = true;
        S.check(); popup(cp.x - 24, cp.y - 40, 'CHECKPOINT!', '#39ff14');
        burst(cp.x + 6, cp.y - 26, 16, ['#39ff14', '#ffffff', '#00e5ff'], 90);
      }
      if (L.flag && player.x + player.w >= L.flag.x - 1 && !player.dead) touchFlag();
    } else if (state === 'dying') {
      const p = player;
      stateT += dt;
      if (stateT > 0.5) { p.vy += PHYS.grav * 0.7 * dt; p.y += p.vy * dt; }
      if (stateT > 2.4) {
        lives--;
        if (lives <= 0) gameOver(false);
        else { loadLevel(levelIdx, checkpointHit); state = 'intro'; stateT = 0; }
      }
    } else if (state === 'clear') {
      updateClear(dt);
      updatePlatforms(dt);
      updateEnemies(dt);
    } else if (state === 'menu') {
      updatePlatforms(dt);
      for (const e of enemies) { e.t += dt; if (e.type === 'flyer') { e.x = e.x0 + Math.sin(e.t * 0.9) * 40; e.y = e.y0 + Math.sin(e.t * 2.4) * 10; e.dir = Math.cos(e.t * 0.9) >= 0 ? 1 : -1; } }
    }
    for (const b of bumps) b.t -= dt;
    bumps = bumps.filter(b => b.t > 0);
  }

  // Câmera com rolagem suave e um pouco de antecipação na direção do movimento.
  function updateCamera(dt) {
    const maxCam = Math.max(0, L.w * TILE - W);
    if (state === 'menu') { camX = ((Math.sin(time * 0.06 - Math.PI / 2) + 1) / 2) * maxCam; return; }
    const p = player;
    const target = p.x + p.w / 2 - W * 0.42 + p.vx * 0.35;
    camX += (target - camX) * Math.min(1, dt * 5);
    let lo = 0, hi2 = maxCam;
    if (arenaLocked && !bossDead && L.arena) {
      const a0 = L.arena.x0 * TILE, a1 = (L.arena.x1 + 1) * TILE;
      if (a1 - a0 <= W) lo = hi2 = clamp((a0 + a1) / 2 - W / 2, 0, maxCam);
      else { lo = a0; hi2 = a1 - W; }
    }
    camX = clamp(camX, lo, hi2);
  }

  /* =====================================================================
     ENTRADA
     ===================================================================== */
  const keys = {};
  const touch = { left: false, right: false, jump: false };
  const JUMP_KEYS = new Set(['arrowup', 'w', ' ', 'z']);
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !(e.target.closest && e.target.closest('button'))) start();
      return;
    }
    keys[key] = true;
    if (JUMP_KEYS.has(key) && !e.repeat) jumpEdge = true;
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const kk of Object.keys(keys)) keys[kk] = false; });

  function holdButton(el, name) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      Sfx.ensure();
      touch[name] = true;
      if (name === 'jump') jumpEdge = true;
      el.classList.add('on');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    });
    const up = () => { touch[name] = false; el.classList.remove('on'); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  holdButton($('tLeft'), 'left'); holdButton($('tRight'), 'right'); holdButton($('tJump'), 'jump');

  const padPrev = { a: false, start: false };
  function readInput() {
    let dir = (keys.arrowright || keys.d || touch.right ? 1 : 0) - (keys.arrowleft || keys.a || touch.left ? 1 : 0);
    let jump = !!(keys.arrowup || keys.w || keys[' '] || keys.z || touch.jump);
    const g = Arcade.gamepad(0);
    if (g) {
      if (!dir && Math.abs(g.lx) > 0.3) dir = Math.sign(g.lx);
      jump = jump || g.a;
      if (g.a && !padPrev.a) { if (state === 'menu' || state === 'over') start(); else jumpEdge = true; }
      if (g.start && !padPrev.start) togglePause();
      padPrev.a = g.a; padPrev.start = g.start;
    }
    inp.dir = dir; inp.jump = jump;
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
    if (document.hidden && state !== 'menu' && state !== 'over' && state !== 'pause') togglePause();
  });

  /* =====================================================================
     LAÇO PRINCIPAL
     ===================================================================== */
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function updateHud() {
    setText(hud.score, String(score));
    setText(hud.hi, String(hi));
    setText(hud.stage, `${levelIdx + 1}/3`);
    const st = [];
    if (player && player.hearts) st.push('♥'.repeat(player.hearts));
    if (codes.has('IMORTAL')) st.push('★');
    setText(hud.status, st.join(' '));
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    readInput();
    if (state !== 'pause' && state !== 'over') {
      time += dt;
      if (state === 'intro') {
        stateT += dt;
        if (stateT > 2.2) { state = 'play'; Music.play(L.def.song); }
      } else if (state === 'win') {
        // bônus de vidas: 1000 pontos por vida que sobrou, contados um a um
        stateT += dt;
        if (stateT > 1.2 && winBonus > 0 && stateT >= winNext) { winBonus--; winNext = stateT + 0.45; addScore(1000); S.oneUp(); }
        if (winBonus <= 0 && stateT > winNext + 1.2) gameOver(true);
      }
      acc += dt;
      while (acc >= STEP) { acc -= STEP; update(STEP); }
      updateCamera(dt);
      shake = Math.max(0, shake - dt * 1.5);
      for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
      particles = particles.filter(p => p.life > 0);
      for (const pp of popups) pp.t -= dt;
      popups = popups.filter(pp => pp.t > 0);
    }
    if (state === 'play' || state === 'clear') Music.update();
    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    if (w < 10 || h < 10) return;
    W = Math.round(clamp((H * w) / h, 192, 432));
    k = Arcade.fit(canvas, W, H, wrap);
    skyGrad = null;
  }
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  resize();
  loadLevel(0, false);
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
