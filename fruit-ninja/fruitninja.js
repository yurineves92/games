// Fruit Ninja: frutas desenhadas no canvas, física simples e uma lâmina que segue o ponteiro.
(() => {
  const H = 600;
  let W = 900;
  const G = 760;            // gravidade (unidades lógicas/s²)
  const TAU = Math.PI * 2;
  const MODES = {
    classic: { time: 0, bombs: true, lives: 3, info: 'Deixar cair custa vida. Bomba é fim de jogo.' },
    arcade: { time: 60, bombs: true, lives: 0, info: '60 segundos para fazer o máximo de pontos. Bomba tira 10.' },
    zen: { time: 90, bombs: false, lives: 0, info: '90 segundos, sem bombas e sem vidas.' },
  };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), lives: $('hLives'), livesWrap: $('hLivesWrap'), time: $('hTime'), timeWrap: $('hTimeWrap'), status: $('hStatus') };

  const settings = { mode: 'classic' };
  Arcade.bindSettings(panels.menu, settings, 'fruit_', () => syncMode());
  function syncMode() {
    $('modeInfo').textContent = MODES[settings.mode].info;
    hi = +Arcade.store.get('fruit_hi_' + settings.mode, 0) || 0;
    updateHud();
  }

  /* ---------- desenho das frutas (sprites gerados uma vez por tamanho de tela) ---------- */
  // Aleatório com semente, para os detalhes das frutas não mudarem ao redimensionar.
  const seeded = s => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

  function shade(g, r, c1, c2, c3, rx = 1, ry = 1) {
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r * 1.1);
    gr.addColorStop(0, c1); gr.addColorStop(0.55, c2); gr.addColorStop(1, c3);
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(0, 0, r * rx, r * ry, 0, 0, TAU); g.fill();
  }
  function shine(g, r) {
    g.fillStyle = 'rgba(255,255,255,0.38)';
    g.beginPath(); g.ellipse(-r * 0.38, -r * 0.42, r * 0.24, r * 0.12, -0.7, 0, TAU); g.fill();
  }
  function disc(g, r, color, rx = 1, ry = 1) {
    g.fillStyle = color;
    g.beginPath(); g.ellipse(0, 0, r * rx, r * ry, 0, 0, TAU); g.fill();
  }
  function wedges(g, r, n, color, gap) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + gap, a1 = ((i + 1) / n) * TAU - gap;
      g.beginPath(); g.moveTo(Math.cos((a0 + a1) / 2) * r * 0.12, Math.sin((a0 + a1) / 2) * r * 0.12);
      g.arc(0, 0, r, a0, a1); g.closePath(); g.fill();
    }
  }
  function seedDrop(g, x, y, a, len, wid, color) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = color;
    g.beginPath(); g.ellipse(0, 0, len, wid, 0, 0, TAU); g.fill();
    g.restore();
  }

  const FRUITS = [
    {
      id: 'melancia', r: 58, juice: '#ff2a44', pts: 1,
      whole(g, r) {
        shade(g, r, '#6fdc58', '#2e8b2a', '#124a16', 1.12, 0.92);
        g.save();
        g.beginPath(); g.ellipse(0, 0, r * 1.12, r * 0.92, 0, 0, TAU); g.clip();
        g.strokeStyle = '#155c18'; g.lineWidth = r * 0.17; g.lineCap = 'round';
        for (let i = -3; i <= 3; i++) {
          const x = i * r * 0.34;
          g.beginPath(); g.moveTo(x, -r);
          g.bezierCurveTo(x + r * 0.12, -r * 0.4, x - r * 0.12, r * 0.3, x + r * 0.05, r);
          g.stroke();
        }
        g.restore();
        shine(g, r);
      },
      face(g, r) {
        disc(g, r, '#1d6b1f', 1.12, 0.92);
        disc(g, r * 0.93, '#dff5b8', 1.12, 0.92);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, '#ff7b88'); gr.addColorStop(1, '#e3102c');
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(0, 0, r * 0.84 * 1.12, r * 0.84 * 0.92, 0, 0, TAU); g.fill();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, d = i % 2 ? 0.52 : 0.32;
          seedDrop(g, Math.cos(a) * r * d * 1.12, Math.sin(a) * r * d * 0.92, a, r * 0.07, r * 0.04, '#1b1010');
        }
      },
    },
    {
      id: 'laranja', r: 44, juice: '#ffa020', pts: 1,
      whole(g, r, rnd) {
        shade(g, r, '#ffd27a', '#ff8c00', '#b84a00');
        g.fillStyle = 'rgba(150,60,0,0.25)';
        for (let i = 0; i < 40; i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * r * 0.9;
          g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.025, 0, TAU); g.fill();
        }
        g.fillStyle = '#3c8a1e';
        g.beginPath(); g.ellipse(0, -r * 0.9, r * 0.12, r * 0.08, 0, 0, TAU); g.fill();
        shine(g, r);
      },
      face(g, r) {
        disc(g, r, '#ff8c00');
        disc(g, r * 0.9, '#fff1d0');
        wedges(g, r * 0.84, 10, '#ffab2e', 0.05);
        disc(g, r * 0.08, '#fff1d0');
      },
    },
    {
      id: 'maçã', r: 42, juice: '#fff0b0', pts: 1,
      whole(g, r) {
        shade(g, r, '#ff7a7a', '#e0102a', '#6e000f');
        g.fillStyle = 'rgba(80,0,10,0.45)';
        g.beginPath(); g.ellipse(0, -r * 0.82, r * 0.22, r * 0.1, 0, 0, TAU); g.fill();
        g.strokeStyle = '#5a3214'; g.lineWidth = r * 0.09; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, -r * 0.8); g.quadraticCurveTo(r * 0.02, -r * 1.05, r * 0.14, -r * 1.2); g.stroke();
        g.fillStyle = '#46b83a';
        g.beginPath(); g.ellipse(r * 0.32, -r * 1.02, r * 0.24, r * 0.1, -0.5, 0, TAU); g.fill();
        shine(g, r);
      },
      face(g, r) {
        disc(g, r, '#c80f26');
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, '#fffbe6'); gr.addColorStop(1, '#f6e7a8');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 0.92, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(160,120,60,0.6)'; g.lineWidth = r * 0.04;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU - Math.PI / 2, d = i % 2 ? r * 0.12 : r * 0.3;
          g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
        }
        g.closePath(); g.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU - Math.PI / 2;
          seedDrop(g, Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, a, r * 0.08, r * 0.045, '#4a2a12');
        }
      },
    },
    {
      id: 'limão', r: 38, juice: '#f5e63a', pts: 1,
      whole(g, r, rnd) {
        g.fillStyle = '#c9ae00';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 1.1, 0, r * 0.18, r * 0.14, 0, 0, TAU); g.fill(); }
        shade(g, r, '#fffbaa', '#f2d814', '#a88c00', 1.15, 0.86);
        g.fillStyle = 'rgba(150,120,0,0.25)';
        for (let i = 0; i < 30; i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.85;
          g.beginPath(); g.arc(Math.cos(a) * d * r * 1.1, Math.sin(a) * d * r * 0.8, r * 0.025, 0, TAU); g.fill();
        }
        shine(g, r);
      },
      face(g, r) {
        g.save(); g.scale(1.15, 0.86);
        disc(g, r, '#f2d814');
        disc(g, r * 0.9, '#fffbe0');
        wedges(g, r * 0.84, 8, '#f9ee6e', 0.06);
        g.restore();
      },
    },
    {
      id: 'kiwi', r: 38, juice: '#9be05a', pts: 1,
      whole(g, r, rnd) {
        shade(g, r, '#c39560', '#7a5530', '#3e2812', 1.12, 0.9);
        g.lineWidth = 1; g.lineCap = 'round';
        for (let i = 0; i < 160; i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.92;
          const x = Math.cos(a) * d * r * 1.12, y = Math.sin(a) * d * r * 0.9;
          g.strokeStyle = rnd() < 0.5 ? 'rgba(60,35,15,0.5)' : 'rgba(220,180,120,0.35)';
          const b = rnd() * TAU;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * r * 0.06, y + Math.sin(b) * r * 0.06); g.stroke();
        }
        shine(g, r);
      },
      face(g, r) {
        disc(g, r, '#6b4a26', 1.12, 0.9);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, '#d8f59a'); gr.addColorStop(0.5, '#8fd04a'); gr.addColorStop(1, '#4f9a22');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, r * 0.93 * 1.12, r * 0.93 * 0.9, 0, 0, TAU); g.fill();
        disc(g, r * 0.24, '#f4f8dc', 1.12, 0.9);
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * TAU, d = r * (i % 2 ? 0.36 : 0.42);
          seedDrop(g, Math.cos(a) * d * 1.12, Math.sin(a) * d * 0.9, a, r * 0.05, r * 0.025, '#111');
        }
      },
    },
    {
      id: 'pêssego', r: 42, juice: '#ffb84a', pts: 1,
      whole(g, r) {
        shade(g, r, '#ffe0b0', '#ff8f6a', '#b8404a');
        g.strokeStyle = 'rgba(150,40,50,0.45)'; g.lineWidth = r * 0.06;
        g.beginPath(); g.moveTo(r * 0.05, -r * 0.92); g.bezierCurveTo(-r * 0.35, -r * 0.4, -r * 0.35, r * 0.4, r * 0.05, r * 0.95); g.stroke();
        g.fillStyle = '#4caf3a';
        g.beginPath(); g.ellipse(r * 0.25, -r * 0.95, r * 0.24, r * 0.1, -0.3, 0, TAU); g.fill();
        shine(g, r);
      },
      face(g, r) {
        disc(g, r, '#ff7f5f');
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, '#ffb238'); gr.addColorStop(1, '#ffd77a');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 0.92, 0, TAU); g.fill();
        disc(g, r * 0.34, '#8a4a24', 0.8, 1);
        g.strokeStyle = 'rgba(60,25,10,0.6)'; g.lineWidth = r * 0.03;
        for (let i = -2; i <= 2; i++) {
          g.beginPath(); g.moveTo(-r * 0.2, i * r * 0.1); g.quadraticCurveTo(0, i * r * 0.1 + r * 0.05, r * 0.2, i * r * 0.1); g.stroke();
        }
      },
    },
  ];

  let k = 1;
  // Cada fruta vira dois canvases: inteira e a face cortada.
  function buildSprites() {
    FRUITS.forEach((f, idx) => {
      const L = Math.ceil(f.r * 2.7);
      const make = draw => {
        const c = document.createElement('canvas');
        c.width = c.height = Math.ceil(L * k);
        const g = c.getContext('2d');
        g.setTransform(k, 0, 0, k, (L * k) / 2, (L * k) / 2);
        draw(g, f.r, seeded(1234 + idx * 97));
        return c;
      };
      f.L = L;
      f.wholeImg = make(f.whole);
      f.faceImg = make(f.face);
    });
  }

  /* ---------- fundo: tábua de madeira ---------- */
  const bg = document.createElement('canvas');
  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const rnd = seeded(42);
    const pw = 110;
    const tones = ['#5b3a21', '#4f321c', '#634126', '#563720'];
    for (let x = 0, i = 0; x < W; x += pw, i++) {
      const gr = g.createLinearGradient(x, 0, x + pw, 0);
      gr.addColorStop(0, tones[i % 4]); gr.addColorStop(0.5, tones[(i + 2) % 4]); gr.addColorStop(1, tones[i % 4]);
      g.fillStyle = gr; g.fillRect(x, 0, pw, H);
      g.strokeStyle = 'rgba(30,15,5,0.35)'; g.lineWidth = 1.2;
      for (let j = 0; j < 9; j++) {
        const gx = x + 8 + rnd() * (pw - 16);
        g.beginPath(); g.moveTo(gx, 0);
        for (let y = 0; y <= H; y += 40) g.lineTo(gx + Math.sin(y * 0.02 + j) * 4 + (rnd() - 0.5) * 2, y);
        g.stroke();
      }
      if (rnd() < 0.8) {
        const kx = x + 20 + rnd() * (pw - 40), ky = rnd() * H;
        g.strokeStyle = 'rgba(30,15,5,0.4)';
        for (let s = 1; s <= 3; s++) { g.beginPath(); g.ellipse(kx, ky, 4 * s, 9 * s, 0, 0, TAU); g.stroke(); }
      }
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x + pw - 3, 0, 3, H);
    }
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    W = Math.round(Math.max(420, Math.min(1100, (H * w) / Math.max(1, h))));
    k = Arcade.fit(canvas, W, H, wrap);
    buildSprites();
    buildBackground();
  }

  /* ---------- estado ---------- */
  let state = 'menu', mode = MODES.classic;
  let fruits = [], halves = [], drops = [], stains = [], popups = [];
  let score = 0, lives = 3, timeLeft = 0, elapsed = 0, spawnT = 0, sliced = 0, bestCombo = 0;
  let combo = 0, comboT = 0, comboX = 0, comboY = 0, flashT = 0, shakeT = 0, boomT = 0, endT = 0;
  let hi = 0;

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function start() {
    Sfx.ensure();
    mode = MODES[settings.mode];
    hi = +Arcade.store.get('fruit_hi_' + settings.mode, 0) || 0;
    fruits = []; halves = []; drops = []; popups = [];
    score = 0; lives = mode.lives; timeLeft = mode.time; elapsed = 0; spawnT = 0.6;
    sliced = 0; bestCombo = 0; combo = 0; comboT = 0; flashT = 0; boomT = 0; endT = 0;
    state = 'play';
    show(null);
    updateHud();
    Sfx.tone(300, 0.25, 'triangle', 0.1, 900);
  }

  function toMenu() { state = 'menu'; show('menu'); updateHud(); }

  function togglePause() {
    if (state === 'play') { state = 'pause'; show('pause'); blade.on = false; }
    else if (state === 'pause') { state = 'play'; show(null); }
  }

  function gameOver(title) {
    state = 'over';
    const rec = score > hi;
    if (rec) { hi = score; Arcade.store.set('fruit_hi_' + settings.mode, hi); }
    $('overTitle').textContent = title;
    $('overScore').textContent = score;
    $('overInfo').textContent = `${sliced} ${sliced === 1 ? 'fruta fatiada' : 'frutas fatiadas'}` + (bestCombo >= 3 ? ` · maior combo x${bestCombo}` : '');
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    hud.score.textContent = state === 'menu' ? 0 : score;
    hud.hi.textContent = hi;
    const m = state === 'menu' ? MODES[settings.mode] : mode;
    hud.livesWrap.hidden = !m.lives;
    hud.timeWrap.hidden = !m.time;
    if (m.lives) {
      const lost = state === 'menu' ? 0 : m.lives - lives;
      hud.lives.innerHTML = Array.from({ length: m.lives }, (_, i) => `<i class="${i < lost ? 'lost' : ''}">✕</i>`).join('');
    }
    if (m.time) hud.time.textContent = state === 'menu' ? m.time : Math.max(0, Math.ceil(timeLeft));
  }

  /* ---------- lançamento ---------- */
  function launch(bomb, fromX) {
    const type = bomb ? null : Arcade.pick(FRUITS);
    const r = bomb ? 38 : type.r;
    const x = fromX !== undefined ? fromX : Arcade.rand(W * 0.12, W * 0.88);
    const apex = Arcade.rand(H * 0.5, H * 0.86);
    const vy = -Math.sqrt(2 * G * (apex + r));
    const flight = (2 * -vy) / G;
    const tx = Arcade.rand(W * 0.25, W * 0.75);
    const vx = Math.max(-260, Math.min(260, (tx - x) / (flight * 0.75)));
    fruits.push({ type, bomb, r, x, y: H + r, vx, vy, rot: Math.random() * TAU, vr: Arcade.rand(-3, 3), spark: 0 });
    Sfx.tone(bomb ? 90 : 140, 0.12, 'sine', 0.12, bomb ? 60 : 80);
  }

  function spawnWave() {
    const d = Math.min(1, elapsed / 80);
    const demo = state === 'menu';
    const bombChance = demo || !mode.bombs ? 0 : 0.1 + 0.12 * d;
    if (Math.random() < 0.35 && !demo) {
      // sequência da esquerda para a direita (ou vice-versa)
      const n = 3 + ((Math.random() * (2 + d * 3)) | 0);
      const ltr = Math.random() < 0.5;
      for (let i = 0; i < n; i++) {
        const x = W * (0.12 + (0.76 * i) / (n - 1));
        setTimeout(() => { if (state === 'play') launch(Math.random() < bombChance * 0.6, ltr ? x : W - x); }, i * 220);
      }
      return 2 + n * 0.2;
    }
    const n = demo ? 1 + ((Math.random() * 2) | 0) : 1 + ((Math.random() * (2 + d * 4)) | 0);
    let bombs = 0;
    for (let i = 0; i < n; i++) {
      const b = Math.random() < bombChance && bombs < 2;
      if (b) bombs++;
      setTimeout(() => { if (state === 'play' || (demo && state === 'menu')) launch(b); }, i * 90);
    }
    return demo ? 1.6 : 1.7 - d * 0.7 + n * 0.05;
  }

  /* ---------- corte ---------- */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  function cutAlong(a, b) {
    if (state !== 'play' && state !== 'menu') return;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    for (const f of fruits) {
      if (f.dead) continue;
      if (segDist(f.x, f.y, a.x, a.y, b.x, b.y) > f.r * (f.bomb ? 0.8 : 1)) continue;
      if (f.bomb) bombHit(f); else slice(f, ang);
    }
    fruits = fruits.filter(f => !f.dead);
  }

  function slice(f, ang) {
    f.dead = true;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    for (const s of [-1, 1]) {
      halves.push({
        type: f.type, side: s, x: f.x + nx * s * 4, y: f.y + ny * s * 4,
        vx: f.vx * 0.6 + nx * s * Arcade.rand(70, 130), vy: Math.min(f.vy, 0) * 0.4 + ny * s * Arcade.rand(70, 130) - 60,
        ang, rot: 0, vr: s * Arcade.rand(1.5, 4),
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = ang + (Math.random() < 0.5 ? 0 : Math.PI) + Arcade.rand(-0.9, 0.9), sp = Arcade.rand(80, 420);
      drops.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp + f.vx * 0.3, vy: Math.sin(a) * sp - 80, r: Arcade.rand(2, 5.5), color: f.type.juice, life: Arcade.rand(0.4, 0.9) });
    }
    stains.push({ x: f.x, y: f.y, r: f.r * Arcade.rand(1.1, 1.6), color: f.type.juice, life: 3, rot: Math.random() * TAU, seed: (Math.random() * 1e6) | 0 });
    if (stains.length > 14) stains.shift();
    Sfx.noise(0.14, 0.22, 4200, 0, 'highpass', 1800);
    Sfx.tone(Arcade.rand(170, 230), 0.09, 'sine', 0.12, 90);
    if (state !== 'play') return;
    sliced++;
    score += f.type.pts;
    combo = comboT > 0 ? combo + 1 : 1;
    comboT = 0.22; comboX = f.x; comboY = f.y;
    updateHud();
  }

  function bombHit(f) {
    f.dead = true;
    if (state !== 'play') return;
    Sfx.explode();
    shakeT = 0.5; flashT = 0.6;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, sp = Arcade.rand(100, 600);
      drops.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Arcade.rand(2, 6), color: Arcade.pick(['#ffe27a', '#ff8a00', '#ffffff', '#555']), life: Arcade.rand(0.4, 1) });
    }
    if (mode.lives) {
      state = 'boom'; boomT = 0; blade.on = false;
      bombAt = { x: f.x, y: f.y };
    } else {
      score = Math.max(0, score - 10);
      popups.push({ x: f.x, y: f.y, text: '-10', color: '#ff3b5c', life: 1 });
      updateHud();
    }
  }
  let bombAt = { x: 0, y: 0 };

  function missFruit(f) {
    if (state !== 'play' || !mode.lives || f.bomb) return;
    lives--;
    popups.push({ x: Math.max(30, Math.min(W - 30, f.x)), y: H - 40, text: '✕', color: '#ff3b5c', life: 1.1, big: true });
    Sfx.tone(160, 0.3, 'square', 0.1, 70);
    updateHud();
    if (lives <= 0) { state = 'ending'; endT = 0.9; endTitle = 'FIM DE JOGO'; }
  }
  let endTitle = '';

  /* ---------- lâmina ---------- */
  const blade = { on: false, pid: null, last: null, pts: [], whoosh: 0, pad: false };
  const toLocal = e => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  function bladeTo(p, t) {
    const a = blade.last;
    blade.pts.push({ x: p.x, y: p.y, t });
    if (a) {
      const dist = Math.hypot(p.x - a.x, p.y - a.y);
      const speed = dist / Math.max(0.001, (t - a.t) / 1000);
      if (speed > 220 && dist > 1) {
        cutAlong(a, p);
        if (dist > 30 && t - blade.whoosh > 160) { blade.whoosh = t; Sfx.noise(0.12, 0.05, 2600, 0, 'bandpass', 900); }
      }
    }
    blade.last = { x: p.x, y: p.y, t };
  }
  canvas.addEventListener('pointerdown', e => {
    Sfx.ensure();
    blade.on = true; blade.pad = false; blade.pid = e.pointerId; blade.last = null;
    bladeTo(toLocal(e), performance.now());
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!blade.on || e.pointerId !== blade.pid) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) bladeTo(toLocal(ev), ev.timeStamp || performance.now());
  });
  const bladeUp = e => { if (e.pointerId === blade.pid) { blade.on = false; blade.last = null; } };
  canvas.addEventListener('pointerup', bladeUp);
  canvas.addEventListener('pointercancel', bladeUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Controle de videogame: o analógico move um cursor; A/RT ligam a lâmina.
  const cursor = { x: 450, y: 300, visible: false };
  let padStart = false, padA = false;
  function pollPad(dt) {
    const g = Arcade.gamepad(0);
    if (!g) return;
    const mx = g.lx || g.rx, my = g.ly || g.ry;
    if (mx || my) cursor.visible = true;
    cursor.x = Math.max(0, Math.min(W, cursor.x + mx * 1300 * dt));
    cursor.y = Math.max(0, Math.min(H, cursor.y + my * 1300 * dt));
    const cut = g.a || g.rt;
    if (cut && (state === 'menu' || state === 'over') && !padA) start();
    else if (cut && state === 'play') {
      if (!blade.on) { blade.on = true; blade.pad = true; blade.last = null; }
      if (blade.pad) bladeTo(cursor, performance.now());
    } else if (blade.pad) { blade.on = false; blade.pad = false; blade.last = null; }
    if (g.start && !padStart) togglePause();
    padStart = g.start; padA = cut;
  }

  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'm') Arcade.toggleMute();
    else if (key === 'p' || key === 'escape') togglePause();
    else if ((key === 'enter' || key === ' ') && (state === 'menu' || state === 'over') && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); start(); }
  });
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

  /* ---------- atualização ---------- */
  function update(dt) {
    const live = state === 'play' || state === 'menu';
    if (state === 'play') {
      elapsed += dt;
      if (mode.time) {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; state = 'ending'; endT = 1.6; endTitle = 'TEMPO!'; Sfx.beep(true); }
        updateHud();
      }
    }
    if (live) {
      spawnT -= dt;
      if (spawnT <= 0) spawnT = spawnWave();
    }
    if (state === 'ending') { endT -= dt; if (endT <= 0) gameOver(endTitle); }

    for (const f of fruits) {
      f.vy += G * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      if (f.x < f.r && f.vx < 0) f.vx *= -0.6;
      if (f.x > W - f.r && f.vx > 0) f.vx *= -0.6;
      if (f.bomb && Math.random() < 0.7) {
        const fx = f.x + Math.cos(f.rot - 1.2) * f.r * 1.25, fy = f.y + Math.sin(f.rot - 1.2) * f.r * 1.25;
        drops.push({ x: fx, y: fy, vx: Arcade.rand(-60, 60), vy: Arcade.rand(-120, -20), r: Arcade.rand(1, 2.5), color: Arcade.pick(['#ffe27a', '#ff8a00', '#fff']), life: 0.25, spark: true });
      }
      if (f.y > H + f.r + 20 && f.vy > 0) { f.dead = true; if (state === 'play') missFruit(f); }
    }
    fruits = fruits.filter(f => !f.dead);
    for (const h of halves) { h.vy += G * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; }
    halves = halves.filter(h => h.y < H + 120);
    for (const d of drops) { d.vy += G * 0.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; }
    drops = drops.filter(d => d.life > 0);
    for (const s of stains) s.life -= dt;
    stains = stains.filter(s => s.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 30 * dt; }
    popups = popups.filter(p => p.life > 0);

    if (comboT > 0) {
      comboT -= dt;
      if (comboT <= 0) {
        if (combo >= 3 && state === 'play') {
          score += combo;
          bestCombo = Math.max(bestCombo, combo);
          popups.push({ x: comboX, y: comboY, text: `COMBO x${combo}  +${combo}`, color: '#ffd400', life: 1.4, big: true });
          [659, 784, 988, 1319].slice(0, Math.min(4, combo - 1)).forEach((f, i) => Sfx.tone(f, 0.12, 'square', 0.09, null, i * 0.07));
          updateHud();
        }
        combo = 0;
      }
    }
    const now = performance.now();
    blade.pts = blade.pts.filter(p => now - p.t < 130);
    flashT = Math.max(0, flashT - dt);
    shakeT = Math.max(0, shakeT - dt);
  }

  /* ---------- desenho ---------- */
  function drawStain(s) {
    const rnd = seeded(s.seed);
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, s.life / 3);
    ctx.fillStyle = s.color;
    ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.beginPath(); ctx.ellipse(0, 0, s.r * 0.6, s.r * 0.45, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU, d = s.r * (0.5 + rnd() * 0.6), rr = s.r * (0.06 + rnd() * 0.14);
      ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawBomb(f, t) {
    ctx.save();
    ctx.translate(f.x, f.y);
    const pulse = 0.5 + 0.5 * Math.sin(t * 12);
    ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 14 + pulse * 16;
    const gr = ctx.createRadialGradient(-f.r * 0.35, -f.r * 0.35, 2, 0, 0, f.r);
    gr.addColorStop(0, '#6a6a72'); gr.addColorStop(0.5, '#25252b'); gr.addColorStop(1, '#09090b');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.rotate(f.rot);
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(-f.r * 0.28, -f.r * 1.12, f.r * 0.56, f.r * 0.3);
    ctx.strokeStyle = '#a07040'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -f.r * 1.1); ctx.quadraticCurveTo(f.r * 0.3, -f.r * 1.5, f.r * 0.45, -f.r * 1.15); ctx.stroke();
    ctx.rotate(-f.rot);
    ctx.fillStyle = `rgba(255,60,60,${0.5 + pulse * 0.5})`;
    ctx.font = `900 ${f.r * 0.8}px Orbitron, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✕', 0, 2);
    ctx.restore();
  }

  function drawBlade() {
    const pts = blade.pts;
    if (pts.length < 2) return;
    const now = performance.now();
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      ctx.shadowColor = '#7ff6ff'; ctx.shadowBlur = pass ? 0 : 16;
      for (let i = 1; i < pts.length; i++) {
        const f = 1 - (now - pts[i].t) / 130;
        if (f <= 0) continue;
        ctx.strokeStyle = pass ? `rgba(255,255,255,${f})` : `rgba(120,240,255,${f * 0.8})`;
        ctx.lineWidth = (pass ? 5 : 11) * f + 1;
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function text(t, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = color; ctx.fillText(t, x, y);
    ctx.restore();
  }

  function draw(t) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 14 * shakeT, (Math.random() - 0.5) * 14 * shakeT);
    ctx.drawImage(bg, -10, -10, W + 20, H + 20);
    for (const s of stains) drawStain(s);

    for (const h of halves) {
      const L = h.type.L;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.ang + h.rot);
      ctx.beginPath();
      if (h.side < 0) ctx.rect(-L, -L, L * 2, L); else ctx.rect(-L, 0, L * 2, L);
      ctx.clip();
      ctx.drawImage(h.type.faceImg, -L / 2, -L / 2, L, L);
      ctx.restore();
    }
    for (const f of fruits) {
      if (f.bomb) { drawBomb(f, t); continue; }
      const L = f.type.L;
      ctx.save();
      ctx.translate(f.x, f.y); ctx.rotate(f.rot);
      ctx.drawImage(f.type.wholeImg, -L / 2, -L / 2, L, L);
      ctx.restore();
    }
    for (const d of drops) {
      ctx.globalAlpha = Math.min(1, d.life * 3);
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawBlade();
    if (cursor.visible && state === 'play') {
      ctx.strokeStyle = blade.pad ? '#ffffff' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 10, 0, TAU); ctx.stroke();
    }
    for (const p of popups) text(p.text, p.x, p.y, p.big ? 30 : 22, p.color, p.life * 1.5);

    if (state === 'play' && mode.time && timeLeft <= 5) text(String(Math.ceil(timeLeft)), W / 2, 80, 64, '#ffd400', 0.4 + (timeLeft % 1) * 0.6);
    if (state === 'ending') text(endTitle, W / 2, H / 2, 64, endTitle === 'TEMPO!' ? '#ffd400' : '#ff3b5c');

    if (state === 'boom') {
      const r = boomT * Math.max(W, H) * 1.6;
      const gr = ctx.createRadialGradient(bombAt.x, bombAt.y, 0, bombAt.x, bombAt.y, Math.max(1, r));
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = gr; ctx.fillRect(-20, -20, W + 40, H + 40);
      if (boomT > 0.8) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (boomT - 0.8) * 2)})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    } else if (flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashT * 0.8})`; ctx.fillRect(-20, -20, W + 40, H + 40);
    }
  }

  /* ---------- laço principal ---------- */
  let last = performance.now(), clock = 0;
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollPad(dt);
    if (state === 'boom') {
      boomT += dt;
      dt *= 0.2;
      if (boomT > 1.4) gameOver('BOOM!');
    }
    if (state !== 'pause') { clock += dt; update(dt); }
    draw(clock);
    requestAnimationFrame(frame);
  }

  Arcade.bindMute($('muteBtn'));
  addEventListener('resize', resize);
  resize();
  syncMode();
  show('menu');
  requestAnimationFrame(frame);
})();
