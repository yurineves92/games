// TURBO NEON: corrida pseudo-3D no estilo dos anos 90.
// A pista é uma lista de segmentos retos; a cada quadro os próximos segmentos são projetados
// em perspectiva e a curva de cada um é acumulada para "entortar" a estrada (técnica clássica
// dos jogos de corrida de 16 bits). Subidas e descidas vêm da altura (y) de cada segmento.
(() => {
  'use strict';

  /* ---------- constantes ---------- */
  const H = 400;                  // altura lógica fixa; a largura acompanha a proporção da tela
  let W = 640;
  const TAU = Math.PI * 2;
  const SEG = 200;                // comprimento de um segmento de pista
  const ROAD_W = 2000;            // meia largura da pista (unidades do mundo)
  const RUMBLE = 3;               // segmentos por faixa da zebra
  const CAM_H = 1000;             // altura da câmera
  const FOV = 100;
  const DRAW = 200;               // quantos segmentos à frente são desenhados
  const DEPTH0 = 1 / Math.tan((FOV / 2) * Math.PI / 180);
  const PLAYER_Z = CAM_H * DEPTH0; // distância entre a câmera e o carro do jogador
  const MAX_SPEED = SEG * 60;     // 60 segmentos por segundo
  const ACCEL = MAX_SPEED / 5, BRAKE = -MAX_SPEED, DECEL = -MAX_SPEED / 5;
  const OFF_DECEL = -MAX_SPEED / 2, OFF_LIMIT = MAX_SPEED / 4;
  const CENTRIFUGAL = 0.3;
  const LAPS = 3, NITROS = 3, NITRO_TIME = 2.5, NITRO_MULT = 1.35;
  const CAR_W = 560;              // largura de um carro no mundo
  const KMH = 240;                // velocidade máxima mostrada (sem nitro)
  const LINE_SEG = 40;            // segmento da linha de largada/chegada
  const GEARS = [0, 0.16, 0.32, 0.5, 0.67, 0.84];

  const RIVALS = [
    { name: 'FAÍSCA', body: '#00e5ff', dark: '#00708f', max: 0.975 },
    { name: 'TROVÃO', body: '#ffd400', dark: '#9a7d00', max: 0.96 },
    { name: 'CORISCO', body: '#39ff14', dark: '#1d7f0a', max: 0.945 },
    { name: 'FURACÃO', body: '#ff7a1a', dark: '#9c4307', max: 0.93 },
    { name: 'BALA', body: '#eeeef6', dark: '#7d7d92', max: 0.91 },
    { name: 'CICLONE', body: '#9a6bff', dark: '#4b2b9c', max: 0.89 },
    { name: 'RAIO', body: '#ff3b5c', dark: '#9c1730', max: 0.87 },
  ];
  const ME = { name: 'VOCÊ', body: '#ff2bd6', dark: '#8e0c76' };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const wrap = $('gameWrap'), stage = $('stage'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { pos: $('hPos'), lap: $('hLap'), time: $('hTime'), hi: $('hHi') };

  /* ---------- utilitários ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIn = (a, b, t) => a + (b - a) * t * t;
  const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
  const seeded = s => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const fmt = t => {
    if (!isFinite(t)) return '-:--.-';
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  };
  function poly(c, pts, color) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath(); c.fill();
  }
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  /* ---------- configurações e códigos ---------- */
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const settings = { pista: 'rio', acel: coarse ? 'auto' : 'manual' };
  const codes = Arcade.codes('turbo', {
    KONAMI: 'Nitro infinito',
    NOITE: 'Corrida noturna com faróis',
    PILOTO: 'Adversários mais lentos',
  }, $('codeMount'));

  /* =====================================================================
     PISTAS
     ===================================================================== */
  // Comprimentos, curvas e morros no padrão dos tutoriais de "pseudo 3D racer".
  const LEN = { S: 25, M: 50, L: 100 };
  const CURVE = { E: 2, M: 4, H: 6 };
  const HILL = { L: 20, M: 40, H: 60 };

  let segments = [], trackLen = 0, T = null;
  const lastY = () => (segments.length ? segments[segments.length - 1].p2.world.y : 0);
  const findSeg = z => segments[Math.floor(z / SEG) % segments.length];
  const wrapZ = z => ((z % trackLen) + trackLen) % trackLen;

  function addSegment(curve, y) {
    const n = segments.length;
    segments.push({
      index: n, curve, sprites: [], cars: [], band: Math.floor(n / RUMBLE) % 2, clip: H,
      p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * SEG }, camera: {}, screen: {} },
    });
  }
  // Trecho com entrada, miolo e saída: a curva cresce, se mantém e se desfaz; a altura muda suavemente.
  function addRoad(enter, hold, leave, curve, hill) {
    const y0 = lastY(), y1 = y0 + hill * SEG, total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(y0, y1, (n + 1) / total));
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(y0, y1, (enter + n + 1) / total));
    for (let n = 0; n < leave; n++) addSegment(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n + 1) / total));
  }
  // Pequena linguagem de construção: cada pista é uma lista de comandos.
  const ROAD = {
    reta: n => addRoad(n, n, n, 0, 0),
    curva: (n, c, h = 0) => addRoad(n, n, n, c, h),
    morro: (n, h) => addRoad(n, n, n, 0, h),
    esses() {
      addRoad(LEN.M, LEN.M, LEN.M, -CURVE.E, 0);
      addRoad(LEN.M, LEN.M, LEN.M, CURVE.M, HILL.M);
      addRoad(LEN.M, LEN.M, LEN.M, CURVE.E, -HILL.L);
      addRoad(LEN.M, LEN.M, LEN.M, -CURVE.E, HILL.M);
      addRoad(LEN.M, LEN.M, LEN.M, -CURVE.M, -HILL.M);
    },
    lombadas() {
      for (const h of [5, -2, -5, 8, 5, -7, 5, -2]) addRoad(10, 10, 10, 0, h);
    },
    fim: n => addRoad(n, n, n, 0, -lastY() / SEG),
  };

  /* ---------- paletas e cenários ---------- */
  const TRACKS = {
    rio: {
      name: 'RIO', lanes: 3, night: false,
      info: 'Avenida beira-mar ao pôr do sol: retas longas, curvas abertas, coqueiros e guarda-sóis. Boa pista para aprender.',
      sky: ['#1d0838', '#7a1f6e', '#ff5e7a', '#ffb05c'],
      fog: '#ff9878', fogDensity: 4.2,
      ground: ['#e9c582', '#dfb873'], shoulder: ['#cfa66c', '#c39a60'],
      road: ['#57525e', '#524d59'], rumble: ['#ff2bd6', '#fff4fd'], lane: '#fff7e8',
      layout() {
        ROAD.reta(LEN.S); ROAD.reta(LEN.M);
        ROAD.curva(LEN.M, CURVE.E); ROAD.curva(LEN.M, -3, HILL.L / 2);
        ROAD.reta(LEN.S);
        ROAD.curva(30, 5, HILL.L); ROAD.curva(30, -5, -HILL.L);
        ROAD.reta(LEN.M);
        ROAD.esses();
        ROAD.morro(40, 30); ROAD.curva(LEN.M, 3, -30);
        ROAD.lombadas();
        ROAD.curva(40, -CURVE.H); ROAD.reta(40);
        ROAD.curva(60, CURVE.E, 15);
        ROAD.fim(60);
      },
    },
    sp: {
      name: 'SÃO PAULO', lanes: 4, night: true,
      info: 'Marginal de madrugada: curvas fechadas, viaduto, prédios e postes colados no acostamento. Freie antes das curvas!',
      sky: ['#03010a', '#0d0626', '#2a0f52', '#5a1d7a'],
      fog: '#1c0b38', fogDensity: 3.4,
      ground: ['#24222d', '#1f1d28'], shoulder: ['#353240', '#2f2c3a'],
      road: ['#2f2d38', '#2b2934'], rumble: ['#00e5ff', '#e9f6ff'], lane: '#ffd400',
      layout() {
        ROAD.reta(LEN.S); ROAD.reta(60);
        ROAD.curva(LEN.S, CURVE.H); ROAD.reta(40);
        ROAD.curva(LEN.S, -CURVE.H); ROAD.reta(30);
        ROAD.morro(40, HILL.M); ROAD.morro(40, -HILL.M);
        ROAD.curva(40, CURVE.M); ROAD.curva(40, -CURVE.M);
        ROAD.reta(LEN.M);
        ROAD.curva(LEN.S, CURVE.H); ROAD.curva(LEN.S, CURVE.H);
        ROAD.reta(60);
        ROAD.curva(30, -5, HILL.L); ROAD.curva(30, -3, -HILL.L);
        ROAD.lombadas();
        ROAD.curva(LEN.S, -CURVE.H, 0); ROAD.reta(40);
        ROAD.curva(40, CURVE.E);
        ROAD.fim(50);
      },
    },
    deserto: {
      name: 'DESERTO', lanes: 2, night: false,
      info: 'Rodovia no meio do nada: dunas gigantes, lombadas e cactos. No alto dos morros você não vê o que vem depois!',
      sky: ['#1f6fd6', '#4aa6f5', '#a6dcff', '#ffe9b8'],
      fog: '#f4d7a2', fogDensity: 3.8,
      ground: ['#eaa457', '#e09a4c'], shoulder: ['#cf8a48', '#c47f3f'],
      road: ['#6d6560', '#67605b'], rumble: ['#ff3b1f', '#fff6ea'], lane: '#fffbe8',
      layout() {
        ROAD.reta(LEN.S);
        ROAD.morro(LEN.M, HILL.M); ROAD.morro(LEN.M, -HILL.M);
        ROAD.curva(60, CURVE.E + 1, HILL.H); ROAD.curva(60, -CURVE.E - 1, -HILL.H);
        ROAD.lombadas();
        ROAD.reta(80);
        ROAD.curva(LEN.M, CURVE.H - 1, 30); ROAD.morro(30, -30);
        ROAD.curva(80, -CURVE.E);
        ROAD.morro(40, HILL.H); ROAD.morro(40, -HILL.H);
        ROAD.esses();
        ROAD.curva(40, CURVE.M, -HILL.L);
        ROAD.fim(80);
      },
    },
  };

  /* =====================================================================
     SPRITES PROCEDURAIS (desenhados uma vez em canvas fora da tela)
     ===================================================================== */
  // Cada sprite é desenhado em unidades do mundo com origem no pé do objeto (x=0, y=0, y negativo para cima).
  const SPR = {};
  function bake(w, h, fn) {
    const r = Math.min(0.34, 760 / h, 760 / w);
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.ceil(w * r)); cv.height = Math.max(2, Math.ceil(h * r));
    const g = cv.getContext('2d');
    g.setTransform(r, 0, 0, r, (w / 2) * r, h * r);
    fn(g);
    return cv;
  }
  function defSprite(type, w, h, coll, fn, extra = {}) {
    (SPR[type] = SPR[type] || []).push({ img: bake(w, h, fn), w, h, coll, ...extra });
  }

  function leaf(g, x0, y0, dx, dy, lift, wid, c1, c2) {
    const cx = x0 + dx * 0.5, cy = y0 + dy * 0.5 - lift, x1 = x0 + dx, y1 = y0 + dy;
    const P = t => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1];
    const up = [], dn = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, [px, py] = P(t), [qx, qy] = P(Math.min(1, t + 0.01));
      let nx = -(qy - py), ny = qx - px; const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      const ww = wid * Math.sin(Math.PI * Math.min(1, t * 1.15));
      // unshift com dois valores mantém o par (x, y) junto e inverte a ordem dos pontos
      up.push(px + nx * ww, py + ny * ww); dn.unshift(px - nx * ww * 0.7, py - ny * ww * 0.7);
    }
    poly(g, up.concat(dn), c1);
    g.strokeStyle = c2; g.lineWidth = 14;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    // folíolos
    g.lineWidth = 10;
    for (let i = 2; i < 13; i++) {
      const t = i / 14, [px, py] = P(t);
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + (dx > 0 ? 1 : -1) * 18, py + wid * 0.9 * Math.sin(Math.PI * t)); g.stroke();
    }
  }

  function buildSprites() {
    for (const k of Object.keys(SPR)) delete SPR[k];
    const font = (px, w = 900) => `${w} ${px}px Orbitron, sans-serif`;

    /* --- RIO --- */
    for (const lean of [-1, 0.6, 1]) {
      defSprite('palm', 1500, 2100, 170, g => {
        const tx = lean * 380, ty = -1760;
        for (let i = 0; i < 12; i++) {
          const t0 = i / 12, t1 = (i + 1) / 12;
          const q = t => [(1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * (lean * 40) + t * t * tx, 2 * (1 - t) * t * -900 + t * t * ty];
          const [ax, ay] = q(t0), [bx, by] = q(t1);
          const wa = lerp(70, 40, t0), wb = lerp(70, 40, t1);
          poly(g, [ax - wa, ay, ax + wa, ay, bx + wb, by + 6, bx - wb, by + 6], i % 2 ? '#7b4b29' : '#9a6236');
        }
        for (const [dx, dy, l] of [[-720, 160, 200], [-560, -140, 260], [-260, -360, 200], [140, -380, 200], [460, -240, 240], [700, 120, 220], [-240, 360, 80], [300, 380, 80]]) {
          leaf(g, tx, ty, dx, dy, l, 70, dy < -200 ? '#36d16a' : '#1f9a4a', '#13652f');
        }
        g.fillStyle = '#5a3418';
        for (const [cx, cy] of [[-40, 30], [40, 40], [0, 70]]) { g.beginPath(); g.arc(tx + cx, ty + cy, 55, 0, TAU); g.fill(); }
      });
    }
    for (const [a, b] of [['#ff2b4f', '#fff4f6'], ['#ffd400', '#1e7bff'], ['#ff2bd6', '#00e5ff']]) {
      defSprite('umbrella', 900, 800, 90, g => {
        g.strokeStyle = '#eee'; g.lineWidth = 28;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(30, -640); g.stroke();
        g.save(); g.translate(30, -620); g.scale(1, 0.42);
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? a : b;
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 420, Math.PI + (i / 8) * Math.PI, Math.PI + ((i + 1) / 8) * Math.PI); g.closePath(); g.fill();
        }
        g.restore();
        g.fillStyle = a; g.fillRect(-380, -70, 300, 50); g.fillStyle = b; g.fillRect(-380, -45, 300, 18);
      });
    }
    defSprite('kiosk', 1400, 1150, 1150, g => {
      g.fillStyle = '#f4ead6'; g.fillRect(-520, -470, 1040, 470);
      for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#1fa0c8' : '#f4ead6'; g.fillRect(-520 + i * 149, -170, 149, 170); }
      g.fillStyle = '#3a2340'; g.fillRect(-420, -430, 840, 200);
      g.fillStyle = '#7a4a22'; g.fillRect(-520, -240, 1040, 40);
      poly(g, [-660, -460, 660, -460, 380, -900, -380, -900], '#d4a24c');
      g.strokeStyle = '#a87a2c'; g.lineWidth = 16;
      for (let x = -640; x <= 640; x += 50) { g.beginPath(); g.moveTo(x, -460); g.lineTo(x * 0.62, -880); g.stroke(); }
      g.fillStyle = '#c99640'; for (let x = -660; x < 660; x += 60) poly(g, [x, -470, x + 60, -470, x + 30, -400], '#c99640');
      g.fillStyle = '#0f6b3a'; g.fillRect(-300, -1100, 600, 190);
      g.fillStyle = '#fff'; g.font = font(130); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('COCO', 0, -1003);
      g.fillStyle = '#3f8a2a'; g.beginPath(); g.arc(250, -300, 70, 0, TAU); g.fill();
      g.strokeStyle = '#ff2bd6'; g.lineWidth = 12; g.beginPath(); g.moveTo(250, -340); g.lineTo(300, -460); g.stroke();
    });
    defSprite('tower', 900, 1500, 650, g => {
      g.strokeStyle = '#d9d0c4'; g.lineWidth = 40;
      for (const x of [-260, 260]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x * 0.8, -900); g.stroke(); }
      g.lineWidth = 20; g.beginPath(); g.moveTo(-250, -150); g.lineTo(220, -700); g.moveTo(250, -150); g.lineTo(-220, -700); g.stroke();
      g.fillStyle = '#fbf6ee'; g.fillRect(-330, -1250, 660, 380);
      g.fillStyle = '#ff3b3b'; g.fillRect(-330, -990, 660, 70);
      g.fillStyle = '#2a1840'; g.fillRect(-270, -1200, 540, 170);
      poly(g, [-380, -1250, 380, -1250, 300, -1330, -300, -1330], '#ff3b3b');
      g.fillStyle = '#ff3b3b'; g.font = font(110); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('POSTO 6', 0, -900);
      g.strokeStyle = '#ddd'; g.lineWidth = 14; g.beginPath(); g.moveTo(300, -1330); g.lineTo(300, -1490); g.stroke();
      poly(g, [300, -1490, 440, -1450, 300, -1410], '#ff3b3b');
    });
    for (const [txt, c1, c2] of [['SUPER NEON', '#ff2bd6', '#00e5ff'], ['TURBO', '#00e5ff', '#ffd400'], ['NITRO!', '#39ff14', '#ff2bd6'], ['EDIÇÃO 4', '#ffd400', '#ff2bd6']]) {
      defSprite('billboard', 1900, 1400, 1700, g => {
        g.fillStyle = '#2c2a36'; g.fillRect(-640, -820, 70, 820); g.fillRect(570, -820, 70, 820);
        g.fillStyle = '#100a20'; g.fillRect(-900, -1360, 1800, 560);
        g.shadowColor = c1; g.shadowBlur = 60; g.strokeStyle = c1; g.lineWidth = 34;
        g.strokeRect(-860, -1320, 1720, 480);
        g.shadowColor = c2; g.fillStyle = c2;
        let px = 300; g.font = font(px);
        while (g.measureText(txt).width > 1500 && px > 80) { px -= 10; g.font = font(px); }
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(txt, 0, -1075);
        g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.85; g.fillText(txt, 0, -1075); g.globalAlpha = 1;
      });
    }

    /* --- SÃO PAULO --- */
    const winCols = ['#ffd27a', '#ffe9b0', '#7ae0ff', '#ff8ae6'];
    for (let v = 0; v < 7; v++) {
      const rnd = seeded(101 + v * 37);
      const bw = 1700 + rnd() * 1100, bh = 2800 + rnd() * 3600;
      const base = ['#1c1733', '#231b3f', '#161b35', '#2a1a35', '#1a2235'][v % 5];
      defSprite('building', bw, bh + 500, bw * 0.96, g => {
        g.fillStyle = base; g.fillRect(-bw / 2, -bh, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(-bw / 2, -bh, bw * 0.12, bh);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bw / 2 - bw * 0.1, -bh, bw * 0.1, bh);
        const cols = Math.max(3, Math.floor((bw - 260) / 230)), rows = Math.floor((bh - 380) / 250);
        const cw = (bw - 260) / cols;
        const warm = winCols[v % winCols.length];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const lit = rnd() < 0.48;
            g.fillStyle = lit ? (rnd() < 0.8 ? warm : Arcade.pick(winCols)) : '#2e2748';
            g.fillRect(-bw / 2 + 130 + c * cw + cw * 0.18, -bh + 260 + r * 250, cw * 0.64, 150);
          }
        }
        if (v % 2 === 0) {
          const nc = ['#ff2bd6', '#00e5ff', '#39ff14'][v % 3];
          g.shadowColor = nc; g.shadowBlur = 50; g.strokeStyle = nc; g.lineWidth = 40;
          g.strokeRect(-bw / 2 + 60, -bh + 60, bw - 120, 120); g.shadowBlur = 0;
        }
        g.strokeStyle = '#555'; g.lineWidth = 30;
        g.beginPath(); g.moveTo(bw * 0.2, -bh); g.lineTo(bw * 0.2, -bh - 460); g.stroke();
        g.fillStyle = '#ff2030'; g.beginPath(); g.arc(bw * 0.2, -bh - 470, 45, 0, TAU); g.fill();
      });
    }
    for (const dir of [-1, 1]) {
      defSprite('lamp', 1700, 1700, 140, g => {
        g.fillStyle = '#3d3a4c'; g.fillRect(-45, -1500, 90, 1500);
        g.fillStyle = '#2a2836'; g.fillRect(-70, -200, 140, 200);
        g.strokeStyle = '#3d3a4c'; g.lineWidth = 50; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, -1480); g.quadraticCurveTo(0, -1620, dir * 300, -1600); g.lineTo(dir * 640, -1580); g.stroke();
        g.fillStyle = '#4a4758'; g.fillRect(dir * 640 - 120, -1610, 240, 60);
        g.fillStyle = '#fff3c4'; g.beginPath(); g.ellipse(dir * 640, -1545, 100, 32, 0, 0, TAU); g.fill();
      }, { glow: [dir * 640, -1540] });
    }
    defSprite('orelhao', 700, 1000, 320, g => {
      g.fillStyle = '#4a4a55'; g.fillRect(-35, -620, 70, 620);
      g.fillStyle = '#ff7a1a'; g.beginPath(); g.ellipse(0, -700, 260, 300, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffa04a'; g.beginPath(); g.ellipse(-60, -780, 120, 160, -0.3, 0, TAU); g.fill();
      g.fillStyle = '#2a1530'; g.beginPath(); g.ellipse(0, -600, 170, 190, 0, 0, Math.PI); g.fill();
      g.fillStyle = '#d0d0d8'; g.fillRect(-60, -640, 120, 150);
      g.fillStyle = '#20202a'; g.fillRect(-40, -620, 80, 30);
    });
    for (const dir of [-1, 1]) {
      defSprite('chevron', 760, 800, 320, g => {
        g.fillStyle = '#3a3a44'; g.fillRect(-250, -420, 50, 420); g.fillRect(200, -420, 50, 420);
        g.fillStyle = '#111'; g.fillRect(-340, -790, 680, 400);
        g.fillStyle = '#ffd400'; g.fillRect(-320, -770, 640, 360);
        for (const o of [-160, 60]) {
          const x = o * dir;
          poly(g, [x - 70 * dir, -730, x + 10 * dir, -730, x + 110 * dir, -590, x + 10 * dir, -450, x - 70 * dir, -450, x + 30 * dir, -590], '#111');
        }
      });
    }

    /* --- DESERTO --- */
    for (let v = 0; v < 3; v++) {
      defSprite('cactus', 900, 1600, 260, g => {
        const green = '#2f8d47', dark = '#216b35', light = '#4fbf68';
        const arm = (x, y, w, h, dir) => {
          g.fillStyle = green; rrect(g, Math.min(x, x + dir * w), y, w, 150, 75); g.fill();
          rrect(g, x + dir * w - (dir > 0 ? 150 : 0), y - h, 150, h + 150, 75); g.fill();
        };
        if (v !== 1) arm(-110, -720, 330, 420, -1);
        if (v !== 2) arm(110, -900 + v * 120, 300, 380, 1);
        g.fillStyle = green; rrect(g, -115, -1450, 230, 1450, 115); g.fill();
        g.strokeStyle = dark; g.lineWidth = 16;
        for (const x of [-55, 0, 55]) { g.beginPath(); g.moveTo(x, -1380); g.lineTo(x, -30); g.stroke(); }
        g.fillStyle = light; g.fillRect(-95, -1350, 22, 1250);
        if (v === 2) { g.fillStyle = '#ff5fa8'; g.beginPath(); g.arc(0, -1460, 60, 0, TAU); g.fill(); }
      });
    }
    for (let v = 0; v < 2; v++) {
      defSprite('rock', 1300, 800, 1050, g => {
        const s = v ? 0.8 : 1;
        poly(g, [-600 * s, 0, -560 * s, -300 * s, -300 * s, -620 * s, 120 * s, -700 * s, 480 * s, -480 * s, 620 * s, -120 * s, 600 * s, 0], '#9c5a36');
        poly(g, [-480 * s, -320 * s, -260 * s, -580 * s, 100 * s, -660 * s, -40 * s, -420 * s], '#c27a4c');
        poly(g, [200 * s, -560 * s, 470 * s, -460 * s, 590 * s, -120 * s, 600 * s, 0, 260 * s, 0], '#73402a');
      });
    }
    defSprite('deadtree', 1100, 1600, 160, g => {
      g.strokeStyle = '#5c3b2a'; g.lineCap = 'round';
      const br = (x, y, a, l, w, d) => {
        const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        if (d > 0) { br(x2, y2, a - 0.5, l * 0.68, w * 0.62, d - 1); br(x2, y2, a + 0.45, l * 0.62, w * 0.6, d - 1); }
      };
      br(0, 0, -Math.PI / 2, 620, 110, 4);
    });
    for (const [l1, l2] of [['POSTO', '99 km'], ['ÁGUA', '50 km'], ['OÁSIS', '120 km']]) {
      defSprite('sign', 1000, 1200, 140, g => {
        g.fillStyle = '#6a6a70'; g.fillRect(-300, -700, 50, 700); g.fillRect(250, -700, 50, 700);
        g.fillStyle = '#fff'; g.fillRect(-470, -1170, 940, 520);
        g.fillStyle = '#0f6b3a'; g.fillRect(-445, -1145, 890, 470);
        g.fillStyle = '#fff'; g.font = font(150, 700); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(l1, 0, -1010); g.fillText(l2, 0, -810);
      });
    }
    defSprite('skull', 700, 450, 0, g => {
      g.fillStyle = '#efe6d2';
      g.beginPath(); g.ellipse(0, -180, 150, 130, 0, 0, TAU); g.fill();
      g.strokeStyle = '#efe6d2'; g.lineWidth = 50; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-130, -250); g.quadraticCurveTo(-320, -300, -300, -420); g.moveTo(130, -250); g.quadraticCurveTo(320, -300, 300, -420); g.stroke();
      g.fillStyle = '#3a2418'; g.beginPath(); g.arc(-55, -200, 32, 0, TAU); g.arc(55, -200, 32, 0, TAU); g.fill();
    });
  }

  // Coloca os objetos à beira da pista (sempre a mesma arrumação para cada pista).
  function addSprite(i, t, offset, v) {
    const seg = segments[i % segments.length];
    const list = SPR[t];
    const vi = v === undefined ? Math.floor(Math.random() * list.length) : v % list.length;
    seg.sprites.push({ t, v: vi, offset, coll: list[vi].coll });
  }
  const freeZone = i => i > LINE_SEG - 26 && i < LINE_SEG + 8;
  function populate(id) {
    const rnd = seeded(id === 'rio' ? 11 : id === 'sp' ? 22 : 33);
    const N = segments.length;
    const pickV = n => Math.floor(rnd() * n);
    // placas de curva (chevron) do lado de fora
    for (let i = 0; i < N; i++) {
      const c = segments[i].curve;
      if (Math.abs(c) >= 3 && i % 9 === 0 && !freeZone(i)) addSprite(i, 'chevron', c > 0 ? -1.35 : 1.35, c > 0 ? 1 : 0);
    }
    if (id === 'rio') {
      for (let i = 0; i < N; i += 6) addSprite(i, 'palm', 1.35 + rnd() * 0.5, pickV(3));
      for (let i = 3; i < N; i += 9) {
        if (rnd() < 0.7) addSprite(i, 'umbrella', -(1.5 + rnd() * 1.6), pickV(3));
        if (rnd() < 0.4) addSprite(i + 2, 'umbrella', -(2.4 + rnd() * 1.2), pickV(3));
      }
      for (let i = 60; i < N; i += 130) addSprite(i, 'kiosk', -1.75);
      for (let i = 120; i < N; i += 210) addSprite(i, 'billboard', 1.9, pickV(4));
      for (let i = 200; i < N; i += 320) addSprite(i, 'tower', -2.3);
      for (let i = 4; i < N; i += 14) if (rnd() < 0.6) addSprite(i, 'palm', -(3 + rnd() * 1.5), pickV(3));
    } else if (id === 'sp') {
      for (let i = 0; i < N; i += 10) addSprite(i, 'lamp', (i / 10) % 2 ? -1.2 : 1.2, (i / 10) % 2 ? 1 : 0);
      for (let i = 2; i < N; i += 7) {
        addSprite(i, 'building', 2.1 + rnd() * 1.4, pickV(7));
        addSprite(i + 3, 'building', -(2.1 + rnd() * 1.4), pickV(7));
      }
      for (let i = 50; i < N; i += 95) addSprite(i, 'orelhao', 1.45);
      for (let i = 90; i < N; i += 170) addSprite(i, 'billboard', -1.75, pickV(4));
    } else {
      for (let i = 0; i < N; i += 4) {
        const r = rnd();
        const side = rnd() < 0.5 ? -1 : 1;
        if (r < 0.45) addSprite(i, 'cactus', side * (1.3 + rnd() * 2.6), pickV(3));
        else if (r < 0.6) addSprite(i, 'rock', side * (1.6 + rnd() * 2.2), pickV(2));
        else if (r < 0.64) addSprite(i, 'deadtree', side * (1.4 + rnd() * 2), 0);
        else if (r < 0.67) addSprite(i, 'skull', side * (1.25 + rnd() * 0.6), 0);
      }
      for (let i = 150; i < N; i += 260) addSprite(i, 'sign', 1.45, pickV(3));
      for (let i = 300; i < N; i += 520) addSprite(i, 'billboard', -1.8, pickV(4));
    }
    // limpa a área do grid de largada e põe o pórtico
    for (let i = LINE_SEG - 26; i < LINE_SEG + 8; i++) {
      const s = segments[i];
      s.sprites = s.sprites.filter(sp => Math.abs(sp.offset) > 1.9 || sp.t === 'palm' || sp.t === 'lamp' || sp.t === 'building');
    }
    segments[LINE_SEG].sprites.push({ t: 'gantry', offset: 0, coll: 0 });
    segments[LINE_SEG].checker = segments[LINE_SEG + 1].checker = true;
  }

  function buildTrack() {
    T = TRACKS[settings.pista] || TRACKS.rio;
    segments = [];
    T.layout();
    trackLen = segments.length * SEG;
    populate(settings.pista);
    if (k) buildLayers();
    skyGrad = null;
  }

  /* =====================================================================
     FUNDO EM PARALLAX (três camadas desenhadas uma vez por tamanho de tela)
     ===================================================================== */
  const LH = 170;
  const LAYER_W = { sky: 1000, far: 1240, near: 1460 };
  const layers = {};
  let k = 0, skyGrad = null;

  // Desenha fn(x) e, se encostar nas bordas, repete do outro lado para a faixa emendar sem costura.
  const wrapDraw = (lw, x, r, fn) => { fn(x); if (x - r < 0) fn(x + lw); if (x + r > lw) fn(x - lw); };
  function ridge(g, lw, base, fnH, color) {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, LH);
    for (let x = 0; x <= lw; x += 4) g.lineTo(x, base - fnH(x));
    g.lineTo(lw, LH); g.closePath(); g.fill();
  }
  const per = (lw, x, n, ph = 0) => Math.sin((x / lw) * TAU * n + ph);

  const LAYERS = {
    rio: {
      sky(g, lw, rnd) {
        const sx = lw * 0.42, sy = LH - 34;
        const glow = g.createRadialGradient(sx, sy, 10, sx, sy, 190);
        glow.addColorStop(0, 'rgba(255,190,90,0.55)'); glow.addColorStop(1, 'rgba(255,60,120,0)');
        g.fillStyle = glow; g.fillRect(sx - 200, sy - 200, 400, 400);
        const sun = g.createLinearGradient(0, sy - 66, 0, sy + 66);
        sun.addColorStop(0, '#fff27a'); sun.addColorStop(0.5, '#ff9b4a'); sun.addColorStop(1, '#ff2f8e');
        g.fillStyle = sun; g.beginPath(); g.arc(sx, sy, 66, 0, TAU); g.fill();
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 7; i++) g.fillRect(sx - 70, sy - 4 + i * 9, 140, 1.4 + i * 0.7);
        g.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 9; i++) {
          const x = rnd() * lw, y = 18 + rnd() * 80, w = 50 + rnd() * 110;
          wrapDraw(lw, x, w, xx => {
            g.fillStyle = 'rgba(120,30,110,0.55)'; g.beginPath(); g.ellipse(xx, y, w, 7 + rnd() * 5, 0, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,140,170,0.45)'; g.beginPath(); g.ellipse(xx + 6, y + 4, w * 0.8, 3, 0, 0, TAU); g.fill();
          });
        }
      },
      far(g, lw) {
        const grad = g.createLinearGradient(0, 20, 0, LH);
        grad.addColorStop(0, '#5a1f6e'); grad.addColorStop(1, '#2c0d3e');
        ridge(g, lw, LH - 12, x => 16 + 10 * per(lw, x, 2) + 6 * per(lw, x, 5, 1), grad);
        g.fillStyle = grad;
        const dome = (x0, w, h) => wrapDraw(lw, x0, w, x => {
          g.beginPath(); g.moveTo(x - w, LH - 10);
          g.bezierCurveTo(x - w * 0.95, LH - h * 0.7, x - w * 0.4, LH - h * 1.02, x + w * 0.05, LH - h);
          g.bezierCurveTo(x + w * 0.5, LH - h * 0.98, x + w * 0.8, LH - h * 0.6, x + w, LH - 10); g.fill();
        });
        dome(lw * 0.2, 58, 132); dome(lw * 0.2 - 105, 46, 66);
        dome(lw * 0.55, 70, 118); dome(lw * 0.8, 40, 96); dome(lw * 0.8 + 60, 44, 84);
        // bondinho e Cristo
        g.strokeStyle = 'rgba(255,200,230,0.6)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(lw * 0.2 - 105, LH - 66); g.lineTo(lw * 0.2 + 3, LH - 132); g.stroke();
        g.fillStyle = '#ffd0ea'; g.fillRect(lw * 0.2 - 52, LH - 101, 4, 3);
        const cx = lw * 0.55 + 3, cy = LH - 118;
        g.fillStyle = '#ffe4f2'; g.fillRect(cx - 1, cy - 12, 2.4, 12); g.fillRect(cx - 6, cy - 9, 12.4, 2);
        // contorno iluminado pelo pôr do sol
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(255,120,160,0.25)'; g.fillRect(0, 0, lw, LH - 60);
        g.globalCompositeOperation = 'source-over';
        // mar
        const sea = g.createLinearGradient(0, LH - 14, 0, LH);
        sea.addColorStop(0, '#ff7aa8'); sea.addColorStop(1, '#7a2a8a');
        g.fillStyle = sea; g.fillRect(0, LH - 14, lw, 14);
        g.fillStyle = 'rgba(255,240,200,0.75)';
        for (let i = 0; i < 40; i++) g.fillRect((i * 97.3) % lw, LH - 12 + (i * 7) % 11, 6 + (i % 5) * 4, 1);
      },
      near(g, lw, rnd) {
        let x = 0;
        while (x < lw) {
          const w = 18 + rnd() * 30, h = 14 + rnd() * 40, xx = x;
          wrapDraw(lw, xx + w / 2, w, cx => {
            g.fillStyle = '#2b0f3c'; g.fillRect(cx - w / 2, LH - h, w, h);
            g.fillStyle = 'rgba(255,214,140,0.8)';
            for (let yy = LH - h + 4; yy < LH - 4; yy += 5) for (let wx = cx - w / 2 + 3; wx < cx + w / 2 - 3; wx += 5) if (rnd() < 0.3) g.fillRect(wx, yy, 2, 2);
          });
          x += w + rnd() * 26;
        }
        for (let i = 0; i < 26; i++) {
          const px = rnd() * lw, ph = 26 + rnd() * 34;
          wrapDraw(lw, px, 30, cx => {
            g.strokeStyle = '#1a0726'; g.lineWidth = 2.4;
            g.beginPath(); g.moveTo(cx, LH); g.quadraticCurveTo(cx + 3, LH - ph / 2, cx + 6, LH - ph); g.stroke();
            g.lineWidth = 2;
            for (const a of [-2.7, -2.2, -1.6, -1, -0.45]) {
              g.beginPath(); g.moveTo(cx + 6, LH - ph);
              g.quadraticCurveTo(cx + 6 + Math.cos(a) * 9, LH - ph + Math.sin(a) * 9 - 3, cx + 6 + Math.cos(a) * 16, LH - ph + Math.sin(a) * 6 + 6);
              g.stroke();
            }
          });
        }
        g.fillStyle = '#1a0726'; g.fillRect(0, LH - 3, lw, 3);
      },
    },
    sp: {
      sky(g, lw, rnd) {
        for (let i = 0; i < 160; i++) {
          g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.7})`;
          const s = rnd() < 0.15 ? 1.6 : 0.9;
          g.fillRect(rnd() * lw, rnd() * (LH - 40), s, s);
        }
        const mx = lw * 0.7, my = 44;
        const mg = g.createRadialGradient(mx, my, 6, mx, my, 70);
        mg.addColorStop(0, 'rgba(200,180,255,0.35)'); mg.addColorStop(1, 'rgba(120,60,200,0)');
        g.fillStyle = mg; g.fillRect(mx - 70, my - 70, 140, 140);
        g.fillStyle = '#efe6ff'; g.beginPath(); g.arc(mx, my, 20, 0, TAU); g.fill();
        g.globalCompositeOperation = 'destination-out';
        g.beginPath(); g.arc(mx + 9, my - 5, 18, 0, TAU); g.fill();
        g.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 6; i++) {
          const x = rnd() * lw, y = 60 + rnd() * 60, w = 80 + rnd() * 120;
          wrapDraw(lw, x, w, xx => { g.fillStyle = 'rgba(120,40,160,0.25)'; g.beginPath(); g.ellipse(xx, y, w, 8, 0, 0, TAU); g.fill(); });
        }
      },
      far(g, lw, rnd) {
        let x = 0;
        while (x < lw) {
          const w = 14 + rnd() * 30, h = 26 + rnd() * 80, xx = x;
          const ant = rnd() < 0.25;
          wrapDraw(lw, xx + w / 2, w, cx => {
            g.fillStyle = '#1c1446'; g.fillRect(cx - w / 2, LH - h, w, h);
            g.fillStyle = 'rgba(160,150,255,0.35)';
            for (let yy = LH - h + 3; yy < LH; yy += 4) for (let wx = cx - w / 2 + 2; wx < cx + w / 2 - 2; wx += 4) if (rnd() < 0.18) g.fillRect(wx, yy, 1.5, 1.5);
            if (ant) {
              g.strokeStyle = '#3a2f6a'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, LH - h); g.lineTo(cx, LH - h - 22); g.stroke();
              g.fillStyle = '#ff3040'; g.beginPath(); g.arc(cx, LH - h - 22, 1.6, 0, TAU); g.fill();
            }
          });
          x += w - 2;
        }
        // ponte estaiada
        const bx = lw * 0.36, deck = LH - 22;
        g.strokeStyle = 'rgba(160,140,255,0.8)'; g.lineWidth = 0.7;
        for (let i = 0; i < 12; i++) {
          const my = LH - 120 + i * 5;
          g.beginPath(); g.moveTo(bx, my); g.lineTo(bx - 40 - i * 10, deck); g.moveTo(bx, my); g.lineTo(bx + 40 + i * 10, deck); g.stroke();
        }
        g.strokeStyle = '#c9b8ff'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(bx - 14, LH); g.lineTo(bx + 4, LH - 130); g.moveTo(bx + 14, LH); g.lineTo(bx - 4, LH - 130); g.stroke();
        g.fillStyle = '#7a6cff'; g.fillRect(bx - 170, deck, 340, 2.5);
      },
      near(g, lw, rnd) {
        let x = 0;
        const wc = ['#ffd27a', '#7ae0ff', '#ff8ae6', '#fff0c0'];
        while (x < lw) {
          const w = 26 + rnd() * 46, h = 40 + rnd() * 110, xx = x;
          const neon = rnd() < 0.3 ? Arcade.pick(['#ff2bd6', '#00e5ff', '#39ff14', '#ffd400']) : null;
          const col = Arcade.pick(wc);
          wrapDraw(lw, xx + w / 2, w, cx => {
            g.fillStyle = '#0f0a22'; g.fillRect(cx - w / 2, LH - h, w, h);
            g.fillStyle = col;
            for (let yy = LH - h + 5; yy < LH - 2; yy += 6) for (let wx = cx - w / 2 + 3; wx < cx + w / 2 - 4; wx += 6) if (rnd() < 0.35) g.fillRect(wx, yy, 3, 3);
            if (neon) {
              g.save(); g.shadowColor = neon; g.shadowBlur = 8; g.fillStyle = neon;
              g.fillRect(cx - w / 2, LH - h, w, 2); g.restore();
            }
          });
          x += w + rnd() * 10;
        }
        // prédio ondulado (homenagem ao Copan)
        const cx = lw * 0.62, cw = 90, ch = 120;
        g.fillStyle = '#16102c';
        g.beginPath(); g.moveTo(cx - cw / 2, LH);
        for (let y = 0; y <= ch; y += 4) g.lineTo(cx - cw / 2 + 8 * Math.sin(y / 18), LH - y);
        for (let y = ch; y >= 0; y -= 4) g.lineTo(cx + cw / 2 + 8 * Math.sin(y / 18), LH - y);
        g.fill();
        g.strokeStyle = 'rgba(255,220,150,0.55)'; g.lineWidth = 1;
        for (let y = 6; y < ch; y += 5) {
          g.beginPath(); g.moveTo(cx - cw / 2 + 8 * Math.sin(y / 18) + 2, LH - y); g.lineTo(cx + cw / 2 + 8 * Math.sin(y / 18) - 2, LH - y); g.stroke();
        }
      },
    },
    deserto: {
      sky(g, lw, rnd) {
        const sx = lw * 0.5, sy = 46;
        const glow = g.createRadialGradient(sx, sy, 8, sx, sy, 150);
        glow.addColorStop(0, 'rgba(255,255,230,0.95)'); glow.addColorStop(0.2, 'rgba(255,240,170,0.5)'); glow.addColorStop(1, 'rgba(255,220,120,0)');
        g.fillStyle = glow; g.fillRect(sx - 150, sy - 150, 300, 300);
        g.fillStyle = '#fffef0'; g.beginPath(); g.arc(sx, sy, 24, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(40,30,30,0.7)'; g.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          const bx = lw * (0.2 + rnd() * 0.6), by = 30 + rnd() * 50, s = 4 + rnd() * 3;
          g.beginPath(); g.moveTo(bx - s, by - s * 0.4); g.quadraticCurveTo(bx - s / 2, by - s * 0.8, bx, by); g.quadraticCurveTo(bx + s / 2, by - s * 0.8, bx + s, by - s * 0.4); g.stroke();
        }
        for (let i = 0; i < 5; i++) {
          const x = rnd() * lw, y = 20 + rnd() * 50, w = 60 + rnd() * 90;
          wrapDraw(lw, x, w, xx => { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(xx, y, w, 6, 0, 0, TAU); g.fill(); });
        }
      },
      far(g, lw, rnd) {
        const mesa = (x0, top, base, h, col) => wrapDraw(lw, x0, base, x => {
          poly(g, [x - base, LH, x - top, LH - h, x - top + 6, LH - h - 4, x + top - 6, LH - h - 4, x + top, LH - h, x + base, LH], col);
        });
        for (let i = 0; i < 7; i++) mesa(rnd() * lw, 20 + rnd() * 50, 50 + rnd() * 60, 40 + rnd() * 50, '#d9a08a');
        for (let i = 0; i < 6; i++) mesa(rnd() * lw, 15 + rnd() * 40, 40 + rnd() * 50, 25 + rnd() * 50, '#bd7062');
        g.fillStyle = 'rgba(255,230,190,0.35)'; g.fillRect(0, LH - 20, lw, 20);
      },
      near(g, lw, rnd) {
        ridge(g, lw, LH, x => 14 + 9 * per(lw, x, 3) + 5 * per(lw, x, 7, 2), '#e6a05a');
        ridge(g, lw, LH, x => 6 + 6 * per(lw, x, 4, 1) + 3 * per(lw, x, 9), '#d48a45');
        g.fillStyle = '#7a4a22';
        for (let i = 0; i < 18; i++) {
          const cx = rnd() * lw, h = 6 + rnd() * 10;
          wrapDraw(lw, cx, 6, x => {
            g.fillRect(x - 1, LH - h, 2.4, h);
            g.fillRect(x - 4, LH - h * 0.7, 2, h * 0.4); g.fillRect(x - 4, LH - h * 0.5, 4, 1.6);
            g.fillRect(x + 2.4, LH - h * 0.85, 2, h * 0.4); g.fillRect(x + 1, LH - h * 0.55, 3, 1.6);
          });
        }
      },
    },
  };

  function buildLayers() {
    const L = LAYERS[settings.pista] || LAYERS.rio;
    let seed = 7;
    for (const name of ['sky', 'far', 'near']) {
      const lw = LAYER_W[name];
      const cv = layers[name] || (layers[name] = document.createElement('canvas'));
      cv.width = Math.ceil(lw * k); cv.height = Math.ceil(LH * k);
      const g = cv.getContext('2d');
      g.setTransform(k, 0, 0, k, 0, 0);
      g.clearRect(0, 0, lw, LH);
      L[name](g, lw, seeded(seed += 31));
    }
  }

  // Brilhos prontos (para faróis, lanternas e postes) desenhados com 'lighter'.
  function makeGlow(r, g, b) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.25, `rgba(${r},${g},${b},0.45)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    return cv;
  }
  const GLOW = { red: makeGlow(255, 40, 60), amber: makeGlow(255, 200, 110), white: makeGlow(220, 235, 255), blue: makeGlow(80, 160, 255) };
  const darkC = document.createElement('canvas'), dctx = darkC.getContext('2d');

  /* =====================================================================
     SOM: ronco contínuo do motor (osciladores próprios) + efeitos com Sfx
     ===================================================================== */
  const Engine = (() => {
    let ac = null, o1, o2, f, g;
    function init() {
      ac = Sfx.ensure();
      if (!ac) return false;
      o1 = ac.createOscillator(); o1.type = 'sawtooth';
      o2 = ac.createOscillator(); o2.type = 'square';
      f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
      g = ac.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination);
      o1.start(); o2.start();
      return true;
    }
    return {
      // on: motor ligado; rpm de 0 a ~1.1; load: pé no acelerador (deixa o ronco mais cheio)
      set(on, rpm, load) {
        if (!g) { if (!on || Sfx.isMuted()) return; if (!init()) return; }
        const t = ac.currentTime;
        const vol = on && !Sfx.isMuted() ? 0.028 + 0.03 * load : 0;
        g.gain.setTargetAtTime(vol, t, 0.05);
        const fr = 34 + rpm * 96;
        o1.frequency.setTargetAtTime(fr, t, 0.03);
        o2.frequency.setTargetAtTime(fr * 0.5 + 1.3, t, 0.03);
        f.frequency.setTargetAtTime(260 + rpm * 1300 + load * 500, t, 0.04);
      },
    };
  })();
  // Efeitos só tocam na corrida de verdade (a demonstração atrás do menu fica muda).
  const fx = fn => { if (state === 'count' || state === 'play' || state === 'finish') fn(); };

  /* =====================================================================
     ESTADO DA CORRIDA
     ===================================================================== */
  let state = 'menu', pausedFrom = null;
  let player = null, cars = [];
  let raceTime = 0, lapStart = 0, lapsDone = 0, lapTimes = [], bestLap = Infinity;
  let nitro = NITROS, nitroT = 0, fovK = 0, shake = 0, crashT = 0, bumpT = 0;
  let countT = 0, lastLit = -1, perfect = false, finishT = 0, finishPos = 0, rank = 8, results = [];
  let skyOff = 0, farOff = 0, nearOff = 0, time = 0, offT = 0, screechT = 0;
  let particles = [], lines = [], msgs = [];
  const lights = [];
  let Px = 320, Py = 180, HY = 200;
  let hi = 0;
  const hiKey = () => 'turbo_hi_' + settings.pista;
  const input = { steer: 0, gas: false, brake: false, rawGas: false };
  let gasPrev = false;

  function placeCar(c) {
    c.z = wrapZ(LINE_SEG * SEG + c.dist);
    const s = findSeg(c.z);
    if (s !== c.seg) {
      if (c.seg) { const i = c.seg.cars.indexOf(c); if (i >= 0) c.seg.cars.splice(i, 1); }
      s.cars.push(c); c.seg = s;
    }
  }

  // Grid: 4 filas de 2 carros; o jogador larga na última fila, à direita.
  function resetRace() {
    for (const s of segments) s.cars.length = 0;
    cars = RIVALS.map((r, i) => {
      const offset = i % 2 ? 0.45 : -0.45;
      const c = { ...r, dist: -SEG * (2 + Math.floor(i / 2) * 5), offset, lane: offset, laneT: 2 + Math.random() * 3, speed: 0, steer: 0, brake: 0, finishT: 0, seg: null, z: 0 };
      placeCar(c);
      return c;
    });
    player = { x: 0.45, dist: -SEG * 17, speed: 0, steer: 0, steerVis: 0, pz: 0, rpm: 0, gear: 1, roll: 0, off: false };
    player.pz = wrapZ(LINE_SEG * SEG + player.dist);
    raceTime = 0; lapStart = 0; lapsDone = 0; lapTimes = []; bestLap = Infinity;
    nitro = NITROS; nitroT = 0; fovK = 0; shake = 0; crashT = 0; bumpT = 0;
    finishT = 0; finishPos = 0; rank = 8; results = [];
    particles = []; lines = []; msgs = [];
    hi = +Arcade.store.get(hiKey(), 0) || 0;
  }

  const computeRank = () => 1 + cars.filter(c => c.dist > player.dist).length;

  function msg(text, color = '#fff', t = 1.4) { msgs.push({ text, color, t, max: t }); }

  function burst(x, y, n, colors, sp = 200, grav = 400, size = 3, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random());
      const l = life * (0.5 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.4, grav, life: l, max: l, color: Arcade.pick(colors), size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  const carY = () => HY + Py;
  const carW = () => (CAR_W / CAM_H) * Px;

  /* ---------- eventos da corrida ---------- */
  function tryNitro() {
    if (state !== 'play' || nitroT > 0) return;
    const inf = codes.has('KONAMI');
    if (!inf && nitro <= 0) { Sfx.tone(150, 0.14, 'square', 0.06); msg('SEM NITRO', '#ff3b5c', 0.8); return; }
    if (!inf) nitro--;
    nitroT = NITRO_TIME;
    Sfx.noise(0.9, 0.35, 400, 0, 'bandpass', 3500);
    Sfx.tone(180, 0.7, 'sawtooth', 0.07, 720);
    msg('NITRO!', '#00e5ff', 0.9);
  }

  function crash(s) {
    crashT = 0.5;
    const hard = player.speed > MAX_SPEED * 0.3;
    player.speed *= 0.18;
    player.x += (player.x > s.offset ? 1 : -1) * 0.08;
    shake = hard ? 0.7 : 0.35;
    burst(W / 2, carY() - carW() * 0.35, hard ? 26 : 12, ['#fff6a0', '#ffd400', '#ff9a2a', '#ffffff'], 260, 600, 3, 0.5);
    fx(() => { Sfx.noise(0.45, 0.5, 1800); Sfx.tone(110, 0.32, 'sawtooth', 0.12, 45); });
  }

  function bump(strong) {
    if (bumpT > 0) return;
    bumpT = 0.3;
    shake = Math.max(shake, strong ? 0.45 : 0.2);
    burst(W / 2, carY() - carW() * 0.5, strong ? 14 : 6, ['#ffffff', '#ffd400', '#ff7a1a'], 220, 600, 2.5, 0.4);
    fx(() => { Sfx.noise(0.2, 0.32, 2600, 0, 'bandpass', 500); Sfx.tone(190, 0.12, 'square', 0.08, 90); });
  }

  function finish() {
    state = 'finish'; finishT = 0;
    finishPos = computeRank();
    // classificação: quem já cruzou, o jogador e os que ainda estão na pista (tempo estimado)
    const done = cars.filter(c => c.finishT).sort((a, b) => a.finishT - b.finishT);
    const rest = cars.filter(c => !c.finishT).sort((a, b) => b.dist - a.dist);
    results = [
      ...done.map(c => ({ name: c.name, color: c.body, t: c.finishT })),
      { name: ME.name, color: ME.body, t: raceTime, me: true },
      ...rest.map(c => ({ name: c.name, color: c.body, t: raceTime + (LAPS * trackLen - c.dist) / Math.max(c.speed, MAX_SPEED * 0.5) })),
    ];
    msgs = [];
    if (finishPos <= 3) Sfx.win(); else Sfx.lose();
    for (let i = 0; i < 60; i++) confetti();
  }
  function confetti() {
    const l = 1.5 + Math.random() * 1.5;
    particles.push({ x: Math.random() * W, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 80, grav: 30, life: l, max: l, color: Arcade.pick(['#ff2bd6', '#00e5ff', '#ffd400', '#39ff14', '#ffffff']), size: 3 + Math.random() * 2, spin: Math.random() * TAU });
  }

  /* =====================================================================
     ATUALIZAÇÃO (passos de no máximo 1/120 s)
     ===================================================================== */
  // IA: olha alguns segmentos à frente e desvia de quem está mais lento (inclusive do jogador).
  function aiSteer(c, pseg) {
    const cw = CAR_W / ROAD_W;
    const N = segments.length;
    for (let i = 1; i < 20; i++) {
      const seg = segments[(c.seg.index + i) % N];
      if (seg === pseg && c.speed > player.speed && Math.abs(player.x - c.offset) < cw * 1.3) {
        const dir = player.x > 0.5 ? -1 : player.x < -0.5 ? 1 : (c.offset > player.x ? 1 : -1);
        return (dir / i) * (c.speed - player.speed) / MAX_SPEED;
      }
      for (const o of seg.cars) {
        if (o !== c && c.speed > o.speed && Math.abs(o.offset - c.offset) < cw * 1.3) {
          const dir = o.offset > 0.5 ? -1 : o.offset < -0.5 ? 1 : (c.offset > o.offset ? 1 : -1);
          return (dir / i) * (c.speed - o.speed) / MAX_SPEED;
        }
      }
    }
    return (c.lane - c.offset) * 0.015;
  }

  function updateCars(h, pseg) {
    const slow = codes.has('PILOTO') ? 0.85 : 1;
    const demo = state === 'menu' || state === 'over';
    for (const c of cars) {
      let target = c.max * MAX_SPEED * slow;
      const gap = c.dist - player.dist;
      if (demo) {
        // na demonstração os carros ficam rondando o jogador
        if (gap > SEG * 45) target = MAX_SPEED * 0.5; else if (gap < -SEG * 10) target = MAX_SPEED;
      } else if (gap > trackLen * 0.2) target *= 0.95;   // um pouco de "elástico" para a corrida
      else if (gap < -trackLen * 0.12) target *= 1.05;  // continuar disputada
      target *= 1 - Math.min(0.12, Math.abs(c.seg.curve) * 0.015);
      c.speed += clamp(target - c.speed, -MAX_SPEED * 0.6 * h, ACCEL * (1.05 - 0.45 * c.speed / MAX_SPEED) * h);
      c.brake = Math.max(0, c.brake - h);
      c.laneT -= h;
      if (c.laneT <= 0) { c.laneT = 2 + Math.random() * 4; c.lane = Arcade.pick([-0.6, -0.2, 0.2, 0.6]); }
      const before = c.offset;
      c.offset = clamp(c.offset + aiSteer(c, pseg) * h * 60, -0.85, 0.85);
      c.steer = lerp(c.steer, clamp((c.offset - before) / h * 2, -1, 1), Math.min(1, h * 8));
      c.dist += c.speed * h;
      placeCar(c);
      if (!c.finishT && !demo && c.dist >= LAPS * trackLen) c.finishT = raceTime;
    }
  }

  function update(h) {
    const live = state === 'play';
    const pseg = findSeg(player.pz);
    const pct = player.speed / MAX_SPEED;
    let steer = 0, gas = false, brk = false;
    if (live) { steer = input.steer; gas = input.gas; brk = input.brake; }
    else {
      // piloto automático (demonstração, volta da vitória)
      const ahead = segments[(pseg.index + 14) % segments.length];
      const target = clamp(-ahead.curve * 0.07, -0.55, 0.55) + (state === 'menu' ? Math.sin(time * 0.3) * 0.25 : 0);
      steer = clamp((target - player.x) * 3, -1, 1);
      const cruise = state === 'menu' ? 0.8 : 0.55;
      gas = pct < cruise; brk = pct > cruise + 0.1;
    }
    const boost = nitroT > 0;
    if (boost) nitroT = Math.max(0, nitroT - h);

    // volante e força centrífuga
    const dx = h * 2 * pct;
    player.x += dx * steer;
    player.x -= dx * pct * pseg.curve * CENTRIFUGAL;

    // acelerador, freio e nitro
    const top = MAX_SPEED * (boost ? NITRO_MULT : 1);
    if (boost) player.speed += ACCEL * 1.6 * h;
    if (gas) player.speed += ACCEL * (1.15 - 0.55 * Math.min(1, pct)) * h;
    else if (brk) player.speed += BRAKE * h;
    else player.speed += DECEL * h;
    if (player.speed > top) player.speed = Math.max(top, player.speed - MAX_SPEED * 0.5 * h);

    // fora da pista: perde velocidade
    const off = Math.abs(player.x) > 1;
    player.off = off;
    if (off && player.speed > OFF_LIMIT) player.speed = Math.max(OFF_LIMIT, player.speed + OFF_DECEL * h);
    player.speed = clamp(player.speed, 0, MAX_SPEED * NITRO_MULT);
    player.x = clamp(player.x, -2.6, 2.6);

    // batidas em objetos (só fora da pista) e em carros
    crashT = Math.max(0, crashT - h); bumpT = Math.max(0, bumpT - h);
    if (off && crashT <= 0) {
      for (const s of pseg.sprites) {
        if (s.coll && Math.abs(player.x - s.offset) * ROAD_W < (s.coll + CAR_W * 0.7) / 2) { crash(s); break; }
      }
    }
    const cw = CAR_W / ROAD_W;
    for (const c of pseg.cars) {
      if (Math.abs(player.x - c.offset) >= cw * 0.85) continue;
      let dz = wrapZ(c.z - player.pz);
      if (dz > trackLen / 2) dz -= trackLen;
      if (dz >= 0 && player.speed > c.speed) {
        // bateu na traseira: fica atrás dele e perde velocidade
        player.speed = c.speed * (c.speed / player.speed);
        player.dist += dz - 60;
        c.speed = Math.min(MAX_SPEED, c.speed * 1.04);
        bump(true);
      } else if (dz < 0 && c.speed > player.speed) {
        c.speed = player.speed * 0.9; c.brake = 0.6;
        bump(false);
      }
    }

    player.dist += player.speed * h;
    player.pz = wrapZ(LINE_SEG * SEG + player.dist);

    // fundo acompanha as curvas
    const moved = (player.speed * h) / SEG;
    skyOff += pseg.curve * moved * 0.35;
    farOff += pseg.curve * moved * 0.7;
    nearOff += pseg.curve * moved * 1.25;

    // câmbio automático: o giro sobe dentro de cada marcha
    const p2 = player.speed / MAX_SPEED;
    let gi = 0;
    for (let i = 0; i < GEARS.length; i++) if (p2 >= GEARS[i]) gi = i;
    const lo = GEARS[gi], hiG = GEARS[gi + 1] || 1;
    const rpm = clamp(0.28 + 0.72 * (p2 - lo) / (hiG - lo), 0.2, 1.15);
    if (gi + 1 > player.gear && live) fx(() => Sfx.tone(140, 0.06, 'square', 0.04, 90));
    player.gear = gi + 1;
    player.rpm = lerp(player.rpm, rpm, Math.min(1, h * 12));
    player.steer = steer;
    player.steerVis = lerp(player.steerVis, steer, Math.min(1, h * 10));
    player.roll += (player.speed * h) / 70;

    // poeira fora da pista e cantada de pneu
    if (off && player.speed > 600) {
      offT -= h;
      if (offT <= 0) {
        offT = 0.08;
        fx(() => Sfx.noise(0.1, 0.12, 500));
        const cy = carY(), w = carW();
        for (const s of [-1, 1]) burst(W / 2 + s * w * 0.4, cy - 2, 2, [T.ground[0], T.shoulder[1], '#ffffff'], 70, -40, 4, 0.5);
        shake = Math.max(shake, 0.08);
      }
    }
    if (live && pct > 0.7 && Math.abs(pseg.curve) > 3 && Math.abs(steer) > 0.5 && !off) {
      screechT -= h;
      if (screechT <= 0) { screechT = 0.22; Sfx.noise(0.18, 0.05, 3200, 0, 'bandpass', 2200); }
    }

    updateCars(h, pseg);

    // voltas e posição
    if (live) {
      raceTime += h;
      const done = Math.floor(player.dist / trackLen);
      if (done > lapsDone) {
        const lt = raceTime - lapStart;
        lapStart = raceTime; lapTimes.push(lt); bestLap = Math.min(bestLap, lt); lapsDone = done;
        if (done >= LAPS) { finish(); return; }
        if (done === LAPS - 1) { msg('ÚLTIMA VOLTA!', '#ffd400', 2); [659, 784, 988, 1319].forEach((f, i) => Sfx.tone(f, 0.12, 'square', 0.07, null, i * 0.08)); }
        else { msg(`VOLTA ${done + 1}`, '#ffffff', 1.6); Sfx.tone(880, 0.1, 'square', 0.07); Sfx.tone(1320, 0.14, 'square', 0.07, null, 0.1); }
        msg(`VOLTA EM ${fmt(lt)}`, '#00e5ff', 1.6);
      }
      const r = computeRank();
      if (r < rank) { Sfx.tone(988, 0.06, 'square', 0.05); Sfx.tone(1318, 0.08, 'square', 0.05, null, 0.05); }
      rank = r;
    }
  }

  // Largada: o semáforo acende 3 luzes vermelhas e depois fica verde.
  function countdown(dt) {
    if (input.rawGas && !gasPrev) perfect = countT <= 0.45;
    countT -= dt;
    const lit = countT > 3 ? 0 : countT > 2 ? 1 : countT > 1 ? 2 : 3;
    if (lit !== lastLit) { lastLit = lit; if (lit) Sfx.beep(false); }
    player.rpm = lerp(player.rpm, input.rawGas ? 0.95 + Math.random() * 0.1 : 0.2, Math.min(1, dt * 8));
    if (countT <= 0) {
      state = 'play';
      Sfx.beep(true);
      if (perfect && input.rawGas) {
        player.speed = MAX_SPEED * 0.42;
        msg('LARGADA PERFEITA!', '#39ff14', 1.8);
        [784, 1047, 1319].forEach((f, i) => Sfx.tone(f, 0.1, 'square', 0.07, null, i * 0.06));
      } else msg('VAI!', '#39ff14', 1);
    }
  }

  /* =====================================================================
     DESENHO
     ===================================================================== */
  function project(p, cx, cy, cz, depth) {
    p.camera.x = -cx;
    p.camera.y = p.world.y - cy;
    p.camera.z = p.world.z - cz;
    const sc = (p.screen.scale = depth / p.camera.z);
    p.screen.x = W / 2 + sc * p.camera.x * Px;
    p.screen.y = HY - sc * p.camera.y * Py;
    p.screen.w = sc * ROAD_W * Px;
  }

  const trap = (x1, y1, w1, x2, y2, w2, color) => poly(ctx, [x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2], color);

  function drawSegment(seg) {
    const a = seg.p1.screen, b = seg.p2.screen, band = seg.band;
    const x1 = a.x, y1 = a.y + 0.6, w1 = a.w, x2 = b.x, y2 = b.y, w2 = b.w;
    ctx.fillStyle = T.ground[band];
    ctx.fillRect(-20, y2, W + 40, y1 - y2 + 0.4);
    trap(x1, y1, w1 * 1.32, x2, y2, w2 * 1.32, T.shoulder[band]);
    trap(x1, y1, w1 * 1.1, x2, y2, w2 * 1.1, T.rumble[band]);
    if (seg.checker) {
      const cols = 10;
      for (let i = 0; i < cols; i++) {
        const fa = -1 + (2 * i) / cols, fb = -1 + (2 * (i + 1)) / cols;
        poly(ctx, [x1 + w1 * fa, y1, x1 + w1 * fb, y1, x2 + w2 * fb, y2, x2 + w2 * fa, y2], (i + seg.index) % 2 ? '#141018' : '#f4f2f8');
      }
    } else {
      trap(x1, y1, w1, x2, y2, w2, T.road[band]);
      const lanes = T.lanes, l1 = w1 / 60, l2 = w2 / 60;
      for (let l = 1; l < lanes; l++) {
        const f = -1 + (2 * l) / lanes;
        if (lanes === 4 && l === 2) {
          // faixa dupla amarela no meio da Marginal
          trap(x1 + w1 * f - l1 * 1.6, y1, l1 * 0.7, x2 + w2 * f - l2 * 1.6, y2, l2 * 0.7, T.lane);
          trap(x1 + w1 * f + l1 * 1.6, y1, l1 * 0.7, x2 + w2 * f + l2 * 1.6, y2, l2 * 0.7, T.lane);
        } else if (band === 0) trap(x1 + w1 * f, y1, l1, x2 + w2 * f, y2, l2, lanes === 4 ? '#f2f0ff' : T.lane);
      }
    }
    if (seg.fog > 0.01) {
      ctx.globalAlpha = seg.fog; ctx.fillStyle = T.fog;
      ctx.fillRect(-20, y2, W + 40, y1 - y2 + 0.4);
      ctx.globalAlpha = 1;
    }
  }

  function drawLayer(img, lw, off, bottom) {
    if (!img) return;
    for (let x = -(((off % lw) + lw) % lw); x < W; x += lw) ctx.drawImage(img, x, bottom - LH, lw, LH);
  }
  function drawBackground(playerY) {
    if (!skyGrad) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, HY);
      T.sky.forEach((c, i) => skyGrad.addColorStop(i / (T.sky.length - 1), c));
    }
    ctx.fillStyle = skyGrad; ctx.fillRect(-20, -20, W + 40, HY + 22);
    drawLayer(layers.sky, LAYER_W.sky, skyOff, HY + 2);
    drawLayer(layers.far, LAYER_W.far, farOff, HY + 2);
    ctx.fillStyle = T.fog; ctx.fillRect(-20, HY, W + 40, H - HY + 20);
    drawLayer(layers.near, LAYER_W.near, nearOff, HY + 3 + clamp(playerY * 0.001, -4, 12));
  }

  // Desenha só a parte do objeto que não está escondida atrás de um morro.
  function clipDraw(top, bottom, clipY, alpha, fn) {
    if (top >= clipY) return;
    ctx.globalAlpha = alpha;
    if (bottom > clipY) {
      ctx.save(); ctx.beginPath(); ctx.rect(-20, -20, W + 40, clipY + 20); ctx.clip(); fn(); ctx.restore();
    } else fn();
    ctx.globalAlpha = 1;
  }

  // Carro visto de trás, desenhado com polígonos. Largura w em unidades lógicas, pé em (x, y).
  function drawCar(x, y, w, col, o) {
    if (w < 2) return;
    const c = ctx;
    if (w < 12) {
      c.fillStyle = col.body; c.fillRect(x - w / 2, y - w * 0.45, w, w * 0.3);
      c.fillStyle = '#0d0d12'; c.fillRect(x - w / 2, y - w * 0.16, w * 0.22, w * 0.16); c.fillRect(x + w * 0.28, y - w * 0.16, w * 0.22, w * 0.16);
      c.fillStyle = '#ff2a3a'; c.fillRect(x - w * 0.42, y - w * 0.33, w * 0.2, w * 0.06); c.fillRect(x + w * 0.22, y - w * 0.33, w * 0.2, w * 0.06);
      return;
    }
    const st = o.steer || 0;
    c.save();
    c.translate(x, y); c.scale(w / 100, w / 100);
    c.rotate(st * 0.025);
    c.fillStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.ellipse(0, -1, 57, 6, 0, 0, TAU); c.fill();
    // pneus com sulcos que rolam
    const roll = (o.roll || 0) % 6;
    for (const sx of [-1, 1]) {
      const tx = sx * 40 - 9 + st * 2;
      c.fillStyle = '#0c0b10'; rrect(c, tx, -25, 18, 25, 4); c.fill();
      c.fillStyle = '#2a2933';
      for (let yy = -23 + roll; yy < -1; yy += 6) c.fillRect(tx + 2, yy, 14, 1.8);
    }
    // carroceria
    poly(c, [-51, -12, 51, -12, 48, -37, -48, -37], col.dark);
    const bg = c.createLinearGradient(0, -50, 0, -30);
    bg.addColorStop(0, col.body); bg.addColorStop(1, col.dark);
    poly(c, [-48, -36, 48, -36, 43, -49, -43, -49], bg);
    poly(c, [-48, -37, 48, -37, 47.5, -39, -47.5, -39], 'rgba(255,255,255,0.35)');
    if (o.player) poly(c, [-7, -12, 7, -12, 5.5, -49, -5.5, -49], 'rgba(255,255,255,0.85)');
    // cabine (desloca para o lado da curva)
    const cx = st * 5;
    poly(c, [-35 + cx * 0.5, -48, 35 + cx * 0.5, -48, 25 + cx, -66, -25 + cx, -66], col.dark);
    poly(c, [-30 + cx * 0.5, -49, 30 + cx * 0.5, -49, 22 + cx, -63, -22 + cx, -63], '#151028');
    poly(c, [-19 + cx, -62, -10 + cx, -62, -16 + cx * 0.5, -50, -27 + cx * 0.5, -50], 'rgba(255,255,255,0.16)');
    c.fillStyle = o.player ? '#ffd400' : '#e8e8f0';
    c.beginPath(); c.arc(-7 + cx * 0.8, -55, 5.5, 0, TAU); c.fill();
    // aerofólio
    c.fillStyle = col.dark; c.fillRect(-31, -56, 5, 10); c.fillRect(26, -56, 5, 10);
    c.fillStyle = col.body; c.fillRect(-49, -61, 98, 6);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-49, -56, 98, 1.5);
    // lanternas, placa, para-choque e escapamentos
    c.fillStyle = '#2a0008'; c.fillRect(-46, -34, 27, 9); c.fillRect(19, -34, 27, 9);
    c.fillStyle = o.brake ? '#ffe4e4' : '#ff2a3a';
    c.fillRect(-45, -33, 25, 7); c.fillRect(20, -33, 25, 7);
    c.fillStyle = '#ece6f6'; c.fillRect(-12, -31, 24, 10);
    if (o.plate && w > 60) {
      c.fillStyle = '#1a1030'; c.font = '900 7px Orbitron, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(o.plate, 0, -25.8);
    }
    c.fillStyle = '#17121f'; c.fillRect(-40, -19, 80, 5);
    for (const ex of [-25, 25]) {
      c.fillStyle = '#6a6a74'; c.beginPath(); c.arc(ex, -15, 3.6, 0, TAU); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(ex, -15, 2, 0, TAU); c.fill();
    }
    if (o.nitro) {
      c.globalCompositeOperation = 'lighter';
      for (const ex of [-25, 25]) {
        const fl = 10 + Math.random() * 12;
        const gr = c.createRadialGradient(ex, -14, 0, ex, -14, fl);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(90,170,255,0.9)'); gr.addColorStop(1, 'rgba(70,40,255,0)');
        c.fillStyle = gr; c.beginPath(); c.ellipse(ex, -14 + fl * 0.2, fl * 0.6, fl, 0, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    c.restore();
  }

  function drawGantry(x, y, s) {
    const rw = ROAD_W * s * 1.2, top = 1500 * s, bh = 320 * s, pw = Math.max(0.8, 110 * s);
    ctx.fillStyle = '#2b2540';
    ctx.fillRect(x - rw - pw / 2, y - top, pw, top); ctx.fillRect(x + rw - pw / 2, y - top, pw, top);
    ctx.fillStyle = '#120a20'; ctx.fillRect(x - rw - pw, y - top - bh, 2 * rw + 2 * pw, bh);
    const n = 24, cw = (2 * rw) / n, ch = bh * 0.22;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#f4f2f8' : '#141018'; ctx.fillRect(x - rw + i * cw, y - top - bh, cw + 0.3, ch);
      ctx.fillStyle = i % 2 ? '#141018' : '#f4f2f8'; ctx.fillRect(x - rw + i * cw, y - top - ch, cw + 0.3, ch);
    }
    if (bh > 10) {
      ctx.fillStyle = '#ff2bd6';
      ctx.font = `900 ${bh * 0.42}px Orbitron, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TURBO NEON', x, y - top - bh / 2);
    }
  }

  // Escuridão do código NOITE: tudo preto, menos o cone dos faróis e as luzes.
  function drawNight() {
    if (darkC.width !== canvas.width || darkC.height !== canvas.height) { darkC.width = canvas.width; darkC.height = canvas.height; }
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, darkC.width, darkC.height);
    dctx.fillStyle = 'rgba(2,1,12,0.86)';
    dctx.fillRect(0, 0, darkC.width, darkC.height);
    dctx.setTransform(k, 0, 0, k, 0, 0);
    dctx.globalCompositeOperation = 'destination-out';
    const cy = carY(), cw = carW();
    const aim = W / 2 + player.steerVis * W * 0.06;
    const far = HY + (cy - HY) * 0.08;
    for (const [spread, a] of [[1.3, 0.3], [1, 0.4], [0.7, 0.45]]) {
      const gr = dctx.createLinearGradient(0, cy, 0, far);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.75})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = gr;
      dctx.beginPath();
      dctx.moveTo(W / 2 - cw * 0.5 * spread, cy - cw * 0.25); dctx.lineTo(W / 2 + cw * 0.5 * spread, cy - cw * 0.25);
      dctx.lineTo(aim + W * 0.17 * spread, far); dctx.lineTo(aim - W * 0.17 * spread, far);
      dctx.closePath(); dctx.fill();
    }
    for (const l of lights) dctx.drawImage(GLOW.white, l.x - l.r * 1.6, l.y - l.r * 1.6, l.r * 3.2, l.r * 3.2);
    ctx.drawImage(darkC, 0, 0, W, H);
    // estrelas
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 50; i++) {
      const sx = (((i * 137.5 - skyOff * 0.5) % W) + W) % W, sy = (i * 53.7) % (HY - 20);
      ctx.fillRect(sx, sy, i % 7 ? 1 : 1.8, i % 7 ? 1 : 1.8);
    }
  }

  function drawPlayer() {
    const w = carW();
    const pct = player.speed / MAX_SPEED;
    let y = carY();
    if (state !== 'count') y += (Math.random() * 2 - 1) * pct * (player.off ? 2.4 : 0.5);
    drawCar(W / 2, y, w, ME, {
      steer: player.steerVis, brake: state === 'play' && input.brake, nitro: nitroT > 0,
      roll: player.roll, plate: 'NEON', player: true,
    });
  }

  function drawText(text, x, y, size, color, align = 'center', alpha = 1, glow = true) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2.5, size / 7); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function render() {
    const night = codes.has('NOITE');
    const lightsOn = night || T.night;
    lights.length = 0;
    const depth = DEPTH0 / (1 + 0.24 * fovK);
    const position = wrapZ(player.pz - PLAYER_Z);
    const base = findSeg(position), basePct = (position % SEG) / SEG;
    const pseg = findSeg(player.pz), pPct = (player.pz % SEG) / SEG;
    const playerY = lerp(pseg.p1.world.y, pseg.p2.world.y, pPct);
    const camY = playerY + CAM_H;
    const N = segments.length;

    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 10);
    drawBackground(playerY);

    // estrada: da frente para o fundo, guardando a linha mais alta já desenhada (maxy)
    let maxy = H, x = 0, dx = -(base.curve * basePct);
    for (let n = 0; n < DRAW; n++) {
      const seg = segments[(base.index + n) % N];
      const camZ = position - (seg.index < base.index ? trackLen : 0);
      seg.clip = maxy;
      const d = n / DRAW;
      seg.fog = 1 - Math.exp(-d * d * T.fogDensity);
      project(seg.p1, player.x * ROAD_W - x, camY, camZ, depth);
      project(seg.p2, player.x * ROAD_W - x - dx, camY, camZ, depth);
      x += dx; dx += seg.curve;
      if (seg.p1.camera.z <= depth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      drawSegment(seg);
      maxy = seg.p2.screen.y;
    }

    // objetos e carros: do fundo para a frente
    for (let n = DRAW - 1; n > 0; n--) {
      const seg = segments[(base.index + n) % N];
      if (seg.p1.camera.z <= depth) continue;
      const fade = clamp((DRAW - n) / 25, 0, 1);
      for (const c of seg.cars) {
        const p = (c.z % SEG) / SEG;
        const sc = lerp(seg.p1.screen.scale, seg.p2.screen.scale, p);
        const cx = lerp(seg.p1.screen.x, seg.p2.screen.x, p) + sc * c.offset * ROAD_W * Px;
        const cy = lerp(seg.p1.screen.y, seg.p2.screen.y, p);
        const w = CAR_W * sc * Px;
        if (cx + w < 0 || cx - w > W) continue;
        clipDraw(cy - w * 0.66, cy, seg.clip, fade, () => drawCar(cx, cy, w, c, { steer: c.steer, brake: c.brake > 0, roll: c.dist / 70 }));
        if (lightsOn && cy - w * 0.3 < seg.clip) {
          lights.push({ x: cx - w * 0.33, y: cy - w * 0.3, r: w * 0.32, c: 'red' }, { x: cx + w * 0.33, y: cy - w * 0.3, r: w * 0.32, c: 'red' });
        }
      }
      for (const s of seg.sprites) {
        const sc = seg.p1.screen.scale, s0 = sc * Px;
        const sx = seg.p1.screen.x + sc * s.offset * ROAD_W * Px, sy = seg.p1.screen.y;
        if (s.t === 'gantry') { clipDraw(sy - 1820 * s0, sy, seg.clip, fade, () => drawGantry(sx, sy, s0)); continue; }
        const d = SPR[s.t][s.v];
        const w = d.w * s0, hh = d.h * s0;
        if (hh < 0.7 || sx + w / 2 < -10 || sx - w / 2 > W + 10) continue;
        clipDraw(sy - hh, sy, seg.clip, fade, () => ctx.drawImage(d.img, sx - w / 2, sy - hh, w, hh));
        if (d.glow && lightsOn) {
          const gy = sy + d.glow[1] * s0;
          if (gy < seg.clip) lights.push({ x: sx + d.glow[0] * s0, y: gy, r: 700 * s0, c: 'amber' });
        }
      }
      if (seg === pseg && !night) drawPlayer();
    }

    if (night) { drawNight(); drawPlayer(); }
    const cy = carY(), cw = carW();
    const braking = state === 'play' && input.brake;
    if (lightsOn || braking) {
      const r = cw * (braking ? 0.4 : 0.28);
      lights.push({ x: W / 2 - cw * 0.33, y: cy - cw * 0.3, r, c: 'red' }, { x: W / 2 + cw * 0.33, y: cy - cw * 0.3, r, c: 'red' });
    }
    if (lights.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights) ctx.drawImage(GLOW[l.c], l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    // linhas de velocidade do nitro
    if (lines.length) {
      ctx.strokeStyle = '#e8f6ff'; ctx.lineCap = 'round';
      for (const l of lines) {
        const ca = Math.cos(l.a), sa = Math.sin(l.a);
        ctx.globalAlpha = Math.min(1, l.r / 80) * 0.55;
        ctx.lineWidth = 1 + l.r / 200;
        ctx.beginPath(); ctx.moveTo(W / 2 + ca * l.r, HY + sa * l.r * 0.75); ctx.lineTo(W / 2 + ca * (l.r + l.len), HY + sa * (l.r + l.len) * 0.75); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (fovK > 0.05) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,229,255,0)'); vg.addColorStop(1, `rgba(0,160,255,${0.28 * fovK})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      if (p.spin !== undefined) {
        const s = Math.abs(Math.cos(p.spin)) * p.size;
        ctx.fillRect(p.x - s / 2, p.y - p.size / 2, s + 0.5, p.size);
      } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawHud();
  }

  /* ---------- painel (HUD) dentro do canvas ---------- */
  function drawHud() {
    if (state === 'menu' || state === 'over') return;
    const u = clamp(W / 560, 0.62, 1.05);
    const m = 12 * u;
    // posição
    const pos = state === 'finish' ? finishPos : rank;
    const pc = pos === 1 ? '#ffd400' : pos <= 3 ? '#00e5ff' : '#ffffff';
    drawText(`${pos}º`, m, m + 20 * u, 40 * u, pc, 'left');
    ctx.font = `900 ${40 * u}px Orbitron, sans-serif`;
    drawText('/8', m + ctx.measureText(`${pos}º`).width + 3 * u, m + 28 * u, 14 * u, '#c9b8e8', 'left', 1, false);
    // volta e tempos
    const lap = clamp(lapsDone + 1, 1, LAPS);
    drawText(`VOLTA ${lap}/${LAPS}`, W - m, m + 8 * u, 14 * u, '#ffffff', 'right');
    drawText(fmt(raceTime), W - m, m + 27 * u, 17 * u, '#ffd400', 'right');
    if (isFinite(bestLap)) drawText(`MELHOR ${fmt(bestLap)}`, W - m, m + 45 * u, 10 * u, '#00e5ff', 'right', 1, false);
    // barra de progresso da corrida (todos os carros)
    const by = m + 62 * u, bx0 = m, bx1 = W - m;
    ctx.fillStyle = 'rgba(10,4,24,0.6)'; ctx.fillRect(bx0, by - 2 * u, bx1 - bx0, 4 * u);
    ctx.fillStyle = '#f4f2f8'; ctx.fillRect(bx1 - 2 * u, by - 5 * u, 2 * u, 10 * u);
    for (let i = 1; i < LAPS; i++) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(lerp(bx0, bx1, i / LAPS) - 0.5, by - 4 * u, 1, 8 * u); }
    const prog = d => clamp(d / (LAPS * trackLen), 0, 1);
    for (const c of cars) {
      ctx.fillStyle = c.body;
      ctx.beginPath(); ctx.arc(lerp(bx0, bx1, prog(c.dist)), by, 3.2 * u, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = ME.body; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u;
    ctx.beginPath(); ctx.arc(lerp(bx0, bx1, prog(player.dist)), by, 5 * u, 0, TAU); ctx.fill(); ctx.stroke();

    // conta-giros + velocidade + marcha
    const R = 40 * u, cx = m + R + 2 * u, cy = H - m - R + 4 * u;
    ctx.fillStyle = 'rgba(10,4,24,0.72)'; ctx.beginPath(); ctx.arc(cx, cy, R + 5 * u, 0, TAU); ctx.fill();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.lineWidth = 5 * u; ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, R - 3 * u, a0, a1); ctx.stroke();
    ctx.strokeStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(cx, cy, R - 3 * u, a0 + (a1 - a0) * 0.85, a1); ctx.stroke();
    const rpm = clamp(player.rpm / 1.1, 0, 1);
    ctx.save(); ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 8;
    ctx.strokeStyle = rpm > 0.85 ? '#ff3b5c' : '#ff2bd6';
    ctx.beginPath(); ctx.arc(cx, cy, R - 3 * u, a0, a0 + (a1 - a0) * rpm); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2 * u;
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 9 * u), cy + Math.sin(a) * (R - 9 * u)); ctx.lineTo(cx + Math.cos(a) * (R - 13 * u), cy + Math.sin(a) * (R - 13 * u)); ctx.stroke();
    }
    const kmh = Math.round((player.speed / MAX_SPEED) * KMH);
    drawText(String(kmh), cx, cy + 2 * u, 19 * u, '#ffffff', 'center', 1, false);
    drawText('km/h', cx, cy + 16 * u, 7.5 * u, '#c9b8e8', 'center', 1, false);
    drawText(`${player.gear}ª`, cx, cy - 17 * u, 11 * u, '#ffd400', 'center', 1, false);

    // nitro
    const nx = W - m, ny = H - m;
    const inf = codes.has('KONAMI');
    drawText('NITRO', nx, ny - 44 * u, 10 * u, '#00e5ff', 'right', 1, false);
    if (inf) drawText('∞', nx - 22 * u, ny - 18 * u, 26 * u, '#00e5ff', 'center');
    else {
      for (let i = 0; i < NITROS; i++) {
        const bw = 11 * u, bh = 28 * u, bx = nx - (NITROS - i) * (bw + 5 * u) + 5 * u, byy = ny - bh;
        ctx.fillStyle = 'rgba(10,4,24,0.7)'; rrect(ctx, bx - 1.5 * u, byy - 1.5 * u, bw + 3 * u, bh + 3 * u, 4 * u); ctx.fill();
        let fill = i < nitro ? 1 : 0;
        if (i === nitro && nitroT > 0) fill = nitroT / NITRO_TIME;
        if (fill > 0) {
          ctx.fillStyle = '#00e5ff';
          rrect(ctx, bx, byy + bh * (1 - fill), bw, bh * fill, Math.min(3 * u, bh * fill / 2)); ctx.fill();
        }
        ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1 * u; rrect(ctx, bx, byy, bw, bh, 3 * u); ctx.stroke();
      }
    }

    // semáforo da largada
    const showLights = state === 'count' || (state === 'play' && raceTime < 1.2);
    if (showLights) {
      const r = 13 * u, gx = W / 2, gy = 104 * u;
      ctx.fillStyle = '#0d0818'; rrect(ctx, gx - r * 4.6, gy - r * 1.6, r * 9.2, r * 3.2, r * 0.8); ctx.fill();
      ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 1.5 * u; ctx.stroke();
      const green = state === 'play';
      for (let i = 0; i < 3; i++) {
        const on = green || lastLit > i;
        const col = green ? '#39ff14' : '#ff2030';
        ctx.save();
        if (on) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
        ctx.fillStyle = on ? col : '#2a1a2e';
        ctx.beginPath(); ctx.arc(gx + (i - 1) * r * 2.9, gy, r, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // mensagens no centro
    let my = H * 0.36;
    for (const ms of msgs) {
      const t = 1 - ms.t / ms.max;
      const s = t < 0.12 ? 0.6 + t * 3.4 : 1;
      drawText(ms.text, W / 2, my, Math.min(30 * u * s, (W * 1.25) / ms.text.length), ms.color, 'center', clamp(ms.t * 3, 0, 1));
      my += 30 * u;
    }

    // chegada
    if (state === 'finish') {
      const cs = 9 * u, cols = Math.ceil(W / cs) + 1;
      for (let i = 0; i < cols; i++) for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#141018' : '#f4f2f8';
        ctx.fillRect(i * cs, H * 0.2 + j * cs + Math.sin(time * 6 + i * 0.5) * 4 * u, cs + 0.5, cs + 0.5);
      }
      drawText('CHEGADA!', W / 2, H * 0.36, Math.min(44 * u, W / 7), '#ffffff');
      drawText(`${finishPos}º LUGAR`, W / 2, H * 0.48, Math.min(34 * u, W / 7), pc);
    }
  }

  /* =====================================================================
     TELAS E HUD DA BARRA SUPERIOR
     ===================================================================== */
  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function updateHud() {
    const racing = state !== 'menu';
    const done = state === 'finish' || state === 'over' || (state === 'pause' && pausedFrom === 'finish');
    setText(hud.pos, `${racing ? (done ? finishPos : rank) : 8}º`);
    setText(hud.lap, `${racing ? clamp(lapsDone + 1, 1, LAPS) : 1}/${LAPS}`);
    setText(hud.time, fmt(racing ? raceTime : 0));
    setText(hud.hi, String(hi));
    tNitro.classList.toggle('empty', nitro <= 0 && !codes.has('KONAMI'));
  }
  function describe() { $('trackInfo').textContent = T.info; }

  function start() {
    if (state === 'count' || state === 'play' || state === 'finish') return;
    Sfx.ensure();
    resetRace();
    state = 'count'; countT = 3.8; lastLit = -1; perfect = false;
    show(null);
  }
  function toMenu() {
    state = 'menu';
    resetRace();
    show('menu');
  }
  function togglePause() {
    if (state === 'play' || state === 'count' || state === 'finish') {
      pausedFrom = state; state = 'pause'; show('pause');
    } else if (state === 'pause') {
      state = pausedFrom; show(null);
    }
  }

  function gameOver() {
    state = 'over';
    const secs = raceTime;
    const score = Math.round((9 - finishPos) * 1000 + Math.max(0, 600 - secs) * 10);
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set(hiKey(), hi); }
    Ranking.gameOver($('rankBox'), { board: 'turbo-' + settings.pista, score, cheated });
    $('overTitle').textContent = finishPos === 1 ? 'VITÓRIA!' : finishPos <= 3 ? 'PÓDIO!' : 'CHEGADA';
    $('overScore').textContent = `${finishPos}º LUGAR`;
    $('overInfo').textContent = `${T.name} · tempo ${fmt(secs)} · melhor volta ${fmt(bestLap)} · ${score} pontos`;
    $('overRecord').hidden = !rec;
    $('overResults').innerHTML = results.map((r, i) =>
      `<li class="${r.me ? 'me' : ''}"><span>${i + 1}º</span><span class="dot" style="background:${r.color};color:${r.color}"></span><span>${r.name}</span><span class="t">${fmt(r.t)}</span></li>`).join('');
    show('over');
  }

  /* =====================================================================
     ENTRADA: teclado, botões na tela e controle de videogame
     ===================================================================== */
  const keys = {};
  const touch = { left: false, right: false, gas: false, brake: false };
  const tNitro = $('tNitro');
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
    if ((key === ' ' || key === 'n') && !e.repeat) tryNitro();
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const kk of Object.keys(keys)) keys[kk] = false; });

  function holdButton(el, name) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      Sfx.ensure();
      if (name === 'nitro') tryNitro(); else touch[name] = true;
      el.classList.add('on');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    });
    const up = () => { if (name !== 'nitro') touch[name] = false; el.classList.remove('on'); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  holdButton($('tLeft'), 'left'); holdButton($('tRight'), 'right');
  holdButton($('tGas'), 'gas'); holdButton($('tBrake'), 'brake'); holdButton(tNitro, 'nitro');

  const padPrev = { start: false, nitro: false, a: false };
  function readInput() {
    let steer = (keys.arrowright || keys.d || touch.right ? 1 : 0) - (keys.arrowleft || keys.a || touch.left ? 1 : 0);
    let gas = !!(keys.arrowup || keys.z || keys.w || touch.gas);
    const brake = !!(keys.arrowdown || keys.x || keys.s || touch.brake) || false;
    let brk = brake;
    const g = Arcade.gamepad(0);
    if (g) {
      if (Math.abs(g.lx) > Math.abs(steer)) steer = g.lx;
      gas = gas || g.rt || g.a;
      brk = brk || g.lt || g.b;
      const nit = g.x || g.y;
      if (g.start && !padPrev.start) togglePause();
      if (nit && !padPrev.nitro) tryNitro();
      if (g.a && !padPrev.a && (state === 'menu' || state === 'over')) start();
      padPrev.start = g.start; padPrev.nitro = nit; padPrev.a = g.a;
    }
    input.rawGas = gas;
    if (settings.acel === 'auto' && state === 'play') gas = !brk;
    input.steer = clamp(steer, -1, 1); input.gas = gas; input.brake = brk;
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
    if (document.hidden && (state === 'play' || state === 'count' || state === 'finish')) togglePause();
  });

  /* =====================================================================
     LAÇO PRINCIPAL
     ===================================================================== */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    readInput();

    if (state !== 'pause') {
      time += dt;
      if (state === 'count') countdown(dt);
      else {
        let t = dt;
        while (t > 1e-6 && state !== 'pause') { const h = Math.min(t, 1 / 120); update(h); t -= h; }
      }
      if (state === 'finish') {
        finishT += dt;
        if (Math.random() < 0.5) confetti();
        if (finishT > 3.4) gameOver();
      }
      fovK = lerp(fovK, nitroT > 0 ? 1 : 0, Math.min(1, dt * 4));
      shake = Math.max(0, shake - dt * 1.6);
      // linhas de velocidade
      if (nitroT > 0) for (let i = 0; i < 3; i++) lines.push({ a: Math.random() * TAU, r: 20 + Math.random() * 40, v: 300 + Math.random() * 300, len: 20 + Math.random() * 40 });
      for (const l of lines) { l.r += l.v * dt; l.v *= 1 + dt * 3; }
      lines = lines.filter(l => l.r < Math.max(W, H));
      for (const p of particles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.life -= dt;
        if (p.spin !== undefined) p.spin += dt * 8;
      }
      particles = particles.filter(p => p.life > 0);
      for (const ms of msgs) ms.t -= dt;
      msgs = msgs.filter(ms => ms.t > 0);
    }

    // ronco do motor
    if (state === 'count') Engine.set(true, player.rpm, input.rawGas ? 1 : 0.2);
    else Engine.set(state === 'play' || state === 'finish', player.rpm + (nitroT > 0 ? 0.15 : 0), input.gas || nitroT > 0 ? 1 : 0.3);
    gasPrev = input.rawGas;

    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  function computeView() { HY = H * 0.5; Py = H * 0.45; Px = Math.min(W / 2, Py * 1.7); }
  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    if (w < 10 || h < 10) return;
    W = Math.round(H * clamp(w / h, 0.6, 2.1));
    k = Arcade.fit(canvas, W, H, wrap);
    computeView();
    buildLayers();
    skyGrad = null;
  }

  Arcade.bindSettings(panels.menu, settings, 'turbo_', key => {
    if (key === 'pista') { buildTrack(); resetRace(); describe(); }
  });
  buildSprites();
  buildTrack();
  resetRace();
  describe();
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { buildSprites(); });
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
