// Meteoros: tiro espacial em vetores neon num campo aberto cujas bordas dão a volta.
// Meteoros se partem em pedaços menores, o Caçador atira na sua direção e os cristais raros soltam cápsulas.
(() => {
  const SHORT = 460, LONG_MAX = 860;                 // lado menor do campo e limite do lado maior (unidades lógicas)
  let W = 760, H = SHORT;                            // o campo se adapta ao formato da tela (em pé ou deitado)
  const TAU = Math.PI * 2;
  // Meteoros por tamanho: raio, pontos, faixa de velocidade, cor.
  const ROCK = {
    3: { r: 42, pts: 20, v: [28, 58], color: '#ff8a00', glow: 'rgba(255,138,0,0.22)' },
    2: { r: 24, pts: 50, v: [50, 92], color: '#ffa940', glow: 'rgba(255,169,64,0.22)' },
    1: { r: 12, pts: 100, v: [78, 138], color: '#ffd166', glow: 'rgba(255,209,102,0.24)' },
  };
  const FULL = { 3: 20 + 2 * 50 + 4 * 100, 2: 50 + 2 * 100, 1: 100 };   // meteoro inteiro (vale na bomba)
  const SHIP_R = 10, TURN = 4.8, AIM_TURN = 12, THRUST = 330, VMAX = 400, DRAG = 0.45;
  const BULLET_V = 560, BULLET_LIFE = 0.9, MAX_SHOTS = 5, FIRE_IV = 0.16, TAP_IV = 0.07;
  const HYPER_TIME = 0.5, HYPER_CD = 1, HYPER_FAIL = 0.125;
  const CRYSTAL_R = 17, CRYSTAL_PTS = 250, HUNTER_R = 15, HUNTER_PTS = 1000;
  const LIFE_EVERY = 10000, PERFECT_BONUS = 1000, MAX_ROCKS_WAVE = 12;
  const C = { ship: '#7df9ff', crystal: '#c58bff', hunter: '#ff2bd6', shot: '#ffffff', eshot: '#ff5bf0' };
  const POWERS = {
    shield: { letter: 'E', name: 'ESCUDO', color: '#39ff14', time: 8 },
    double: { letter: 'D', name: 'TIRO DUPLO', color: '#ffd400', time: 12 },
    bomb: { letter: 'B', name: 'BOMBA', color: '#ff3b5c', time: 0 },
  };
  // Dificuldade: meteoros na 1ª onda, velocidade, intervalo do Caçador, cadência e erro de mira dele.
  const DIFF = {
    cadete: { start: 3, speed: 0.8, hunter: 32, fire: 1.7, err: 0.42 },
    piloto: { start: 4, speed: 1, hunter: 24, fire: 1.35, err: 0.3 },
    as: { start: 5, speed: 1.25, hunter: 16, fire: 1.05, err: 0.18 },
  };
  const DIFF_NAME = { cadete: 'CADETE', piloto: 'PILOTO', as: 'ÁS' };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const wrap = $('gameWrap'), stage = $('stage'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), lives: $('hLives'), wave: $('hWave'), status: $('hStatus') };

  /* ---------- configurações e códigos ---------- */
  const settings = { diff: 'piloto' };
  Arcade.bindSettings(panels.menu, settings, 'meteoros_', () => { loadHi(); updateHud(); });
  const codes = Arcade.codes('meteoros', {
    KONAMI: 'Tiro em leque de 5',
    BLINDADO: 'Escudo permanente',
    LENTO: 'Meteoros em câmera lenta',
  }, $('codeMount'), () => updateHud());

  const hiKey = () => 'meteoros_hi_' + settings.diff;
  let hi = 0;
  function loadHi() { hi = +Arcade.store.get(hiKey(), 0) || 0; }
  const D = () => DIFF[settings.diff] || DIFF.piloto;

  /* ---------- utilidades ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = Arcade.rand;
  // Menor diferença num eixo que dá a volta.
  const wrapD = (d, size) => (d > size / 2 ? d - size : d < -size / 2 ? d + size : d);
  const wrapPos = o => { o.x = ((o.x % W) + W) % W; o.y = ((o.y % H) + H) % H; };
  function delta(a, b) { return { dx: wrapD(b.x - a.x, W), dy: wrapD(b.y - a.y, H) }; }
  function near(a, b, rr) { const { dx, dy } = delta(a, b); return dx * dx + dy * dy < rr * rr; }
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  // Chama fn nas posições em que o objeto aparece (as cópias do outro lado quando encosta na borda).
  function eachWrap(x, y, r, fn, wrapX = true) {
    const xs = [0], ys = [0];
    if (wrapX) { if (x < r) xs.push(W); else if (x > W - r) xs.push(-W); }
    if (y < r) ys.push(H); else if (y > H - r) ys.push(-H);
    for (const ox of xs) for (const oy of ys) fn(x + ox, y + oy);
  }

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');
  const scan = document.createElement('canvas');
  let stars = [];

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    const ow = W, oh = H;
    if (w >= h) { H = SHORT; W = Math.round(clamp((SHORT * w) / Math.max(1, h), SHORT, LONG_MAX)); }
    else { W = SHORT; H = Math.round(clamp((SHORT * h) / Math.max(1, w), SHORT, LONG_MAX)); }
    k = Arcade.fit(canvas, W, H, wrap);
    if (ow !== W || oh !== H) {
      // reposiciona tudo proporcionalmente ao novo formato
      const sx = W / ow, sy = H / oh;
      for (const list of [rocks, bullets, eshots, caps, particles, debris, rings, popups]) for (const o of list) { o.x *= sx; o.y *= sy; }
      for (const o of [ship, hunter, crystal]) if (o) { o.x *= sx; o.y *= sy; if (o.hx !== undefined) { o.hx *= sx; o.hy *= sy; } }
      makeStars();
    }
    buildBackground();
    buildScan();
  }

  // Gerador com semente: a nebulosa fica igual a cada redimensionamento.
  function seeded(s) { return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const sky = g.createLinearGradient(0, 0, W, H);
    sky.addColorStop(0, '#05020c'); sky.addColorStop(0.55, '#08031a'); sky.addColorStop(1, '#0d0414');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // nebulosa: nuvens macias laranja, magenta e verde-água
    const rnd = seeded(20251105);
    const blobs = [
      ['255,138,0', 0.13], ['255,43,214', 0.1], ['0,229,255', 0.07], ['255,90,40', 0.1], ['178,107,255', 0.09],
    ];
    const cx = W * 0.62, cy = H * 0.4;
    for (let i = 0; i < 14; i++) {
      const [rgb, a] = blobs[i % blobs.length];
      const x = cx + (rnd() - 0.5) * W * 0.9, y = cy + (rnd() - 0.5) * H * 0.8;
      const r = (0.18 + rnd() * 0.3) * Math.max(W, H);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // poeira fina de estrelas fixas bem ao fundo
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.22})`;
      g.fillRect(rnd() * W, rnd() * H, 0.8, 0.8);
    }
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.13)';
    const step = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 240));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.32, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  // Três camadas de estrelas: as mais perto andam mais quando a nave se mexe (paralaxe).
  function makeStars() {
    stars = [];
    const n = Math.round((W * H) / 2600);
    for (let i = 0; i < n; i++) {
      const layer = i % 3;
      stars.push({ x: Math.random() * W, y: Math.random() * H, d: [0.03, 0.07, 0.14][layer], s: [1, 1.3, 1.9][layer], p: Math.random() * TAU, b: Arcade.rand(0.35, 0.9) });
    }
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let score = 0, lives = 3, wave = 1, nextLife = LIFE_EVERY, kills = 0, hunters = 0, lostThisWave = false;
  let ship = null, hunter = null, crystal = null;
  let rocks = [], bullets = [], eshots = [], caps = [], particles = [], debris = [], rings = [], popups = [];
  let power = { shield: 0, double: 0 };
  let waveT = 0, hunterT = 20, crystalT = 15, overDelay = 0, banner = null;
  let time = 0, shakeT = 0, flashT = 0, flashColor = '255,255,255', overT = 0, camX = 0, camY = 0;
  let thrustSndT = 0, sirenT = 0, sirenHi = false, fireWas = false, hyperReq = false, lastStatus = '';

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function newShip() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, inv: 0, hyperT: 0, hyperCd: 0, hx: 0, hy: 0, fireCd: 0, thrust: 0, respawnT: 0 };
  }

  // Velocidade dos meteoros: sobe 8% por onda até quase o dobro.
  const speedMult = () => D().speed * Math.min(1.9, 1 + 0.08 * (wave - 1));

  function makeRock(size, x, y, baseVx = 0, baseVy = 0) {
    const R = ROCK[size];
    const a = Math.random() * TAU, sp = rand(R.v[0], R.v[1]) * speedMult();
    const n = size === 3 ? 12 : size === 2 ? 10 : 8;
    const shape = [];
    for (let i = 0; i < n; i++) shape.push(rand(0.72, 1.05));
    return { size, r: R.r, x, y, vx: Math.cos(a) * sp + baseVx * 0.4, vy: Math.sin(a) * sp + baseVy * 0.4, rot: Math.random() * TAU, spin: rand(-1.2, 1.2) / size, shape };
  }

  function spawnWave() {
    const n = Math.min(MAX_ROCKS_WAVE, D().start + wave - 1);
    for (let i = 0; i < n; i++) {
      // nasce na borda, longe da nave
      let x, y, tries = 0;
      do {
        if (Math.random() < 0.5) { x = Math.random() * W; y = Math.random() < 0.5 ? 0 : H - 1; }
        else { x = Math.random() < 0.5 ? 0 : W - 1; y = Math.random() * H; }
        tries++;
      } while (ship && ship.alive && near(ship, { x, y }, 190) && tries < 20);
      rocks.push(makeRock(3, x, y));
    }
    lostThisWave = false;
    banner = { text: `ONDA ${wave}`, sub: wave === 1 ? 'BOA SORTE, ' + DIFF_NAME[settings.diff] : `${n} METEOROS À VISTA`, t: 2 };
    updateHud();
  }

  function newGame() {
    score = 0; lives = 3; wave = 1; nextLife = LIFE_EVERY; kills = 0; hunters = 0;
    rocks = []; bullets = []; eshots = []; caps = []; particles = []; debris = []; rings = []; popups = [];
    hunter = null; crystal = null; power = { shield: 0, double: 0 };
    waveT = 0; overDelay = 0; fireWas = false; hyperReq = false;
    // os relógios do cristal e do Caçador continuam correndo de uma onda para a outra
    crystalT = rand(8, 16); hunterT = D().hunter * rand(0.8, 1.2);
    ship = newShip();
    ship.inv = state === 'menu' ? 0 : 2;
    spawnWave();
  }

  function start() {
    Sfx.ensure();
    state = 'play';
    loadHi();
    newGame();
    overT = 0;
    show(null);
    updateHud();
    Sfx.tone(180, 0.35, 'sawtooth', 0.06, 900);
    Sfx.tone(360, 0.25, 'square', 0.04, 1400, 0.12);
  }

  function toMenu() {
    state = 'menu';
    newGame();
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (state === 'play') { pausedFrom = state; state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set(hiKey(), hi); }
    Ranking.gameOver($('rankBox'), { board: 'meteoros-' + settings.diff, score, cheated });
    $('overTitle').textContent = wave >= 10 ? 'LENDA DO ESPAÇO!' : 'FIM DE JOGO';
    $('overScore').textContent = score;
    $('overInfo').textContent = `${DIFF_NAME[settings.diff]} · Onda ${wave} · ${kills} ${kills === 1 ? 'meteoro' : 'meteoros'}` +
      (hunters ? ` · ${hunters} ${hunters === 1 ? 'Caçador' : 'Caçadores'}` : '');
    $('overRecord').hidden = !rec;
    show('over');
    if (rec && score > 0) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function statusText() {
    if (state === 'menu') {
      const st = [DIFF_NAME[settings.diff]];
      if (codes.has('KONAMI')) st.push('LEQUE');
      if (codes.has('BLINDADO')) st.push('BLINDADO');
      if (codes.has('LENTO')) st.push('CÂMERA LENTA');
      return st.join(' · ');
    }
    const st = [];
    if (power.shield > 0) st.push(`ESCUDO ${Math.ceil(power.shield)}s`);
    if (power.double > 0) st.push(`DUPLO ${Math.ceil(power.double)}s`);
    if (codes.has('KONAMI')) st.push('LEQUE');
    if (codes.has('BLINDADO')) st.push('BLINDADO');
    if (codes.has('LENTO')) st.push('CÂMERA LENTA');
    return st.join(' · ');
  }

  function updateHud() {
    const demo = state === 'menu';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.lives.textContent = demo ? 3 : Math.max(0, lives);
    hud.wave.textContent = demo ? 1 : wave;
    lastStatus = statusText();
    hud.status.textContent = lastStatus;
  }

  function addScore(n, x, y, showPop) {
    if (state !== 'play') return;
    score += n;
    if (showPop) popups.push({ x, y, text: '+' + n, color: '#ffd400', life: 1.1, size: 16 });
    while (score >= nextLife) {
      nextLife += LIFE_EVERY; lives++;
      popups.push({ x: W / 2, y: H * 0.3, text: 'VIDA EXTRA!', color: C.ship, life: 1.8, size: 26 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => Sfx.tone(f, 0.12, 'square', 0.07, null, i * 0.08));
    }
    updateHud();
  }

  /* ---------- efeitos ---------- */
  function burst(x, y, color, n, power = 160, size = 2.2) {
    for (let i = 0; i < n && particles.length < 320; i++) {
      const a = Math.random() * TAU, s = rand(power * 0.2, power);
      const life = rand(0.3, 0.8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: rand(size * 0.6, size * 1.4) });
    }
  }
  // Cacos em vetor: traços que giram e se espalham.
  function shards(x, y, color, n, power = 90, len = 10) {
    for (let i = 0; i < n && debris.length < 80; i++) {
      const a = Math.random() * TAU, s = rand(power * 0.3, power);
      const life = rand(0.6, 1.3);
      debris.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, a: Math.random() * TAU, va: rand(-6, 6), len: rand(len * 0.5, len), life, max: life, color });
    }
  }
  function ring(x, y, color, r0, vr, life, width = 2) { rings.push({ x, y, r: r0, vr, life, max: life, color, width }); }
  function shake(t) { shakeT = Math.max(shakeT, t); }
  function flash(rgb, t) { flashColor = rgb; flashT = Math.max(flashT, t); }

  function rockBoom(rock) {
    const R = ROCK[rock.size];
    burst(rock.x, rock.y, R.color, 6 + rock.size * 5, 60 + rock.size * 50);
    shards(rock.x, rock.y, R.color, 2 + rock.size * 2, 50 + rock.size * 20, rock.r * 0.5);
    if (rock.size === 3) ring(rock.x, rock.y, 'rgba(255,138,0,', 10, 160, 0.4);
    noise(0.15 + rock.size * 0.12, 0.12 + rock.size * 0.07, 600 + (4 - rock.size) * 900);
    shake(rock.size * 0.07);
  }

  /* ---------- meteoros, cristal e cápsulas ---------- */
  // Parte o meteoro em dois menores. scored = conta pontos (tiro ou trombada sua).
  function breakRock(rock, scored, impVx = 0, impVy = 0) {
    const i = rocks.indexOf(rock);
    if (i < 0) return;
    rocks.splice(i, 1);
    if (scored) { addScore(ROCK[rock.size].pts); kills++; }
    rockBoom(rock);
    if (rock.size > 1) {
      for (let n = 0; n < 2; n++) {
        const kid = makeRock(rock.size - 1, rock.x, rock.y, rock.vx + impVx * 0.06, rock.vy + impVy * 0.06);
        kid.x += kid.vx * 0.08; kid.y += kid.vy * 0.08;
        rocks.push(kid);
      }
    }
  }

  // Bomba: o meteoro some inteiro, valendo ele e todos os pedaços que daria.
  function vaporize(rock) {
    const i = rocks.indexOf(rock);
    if (i < 0) return;
    rocks.splice(i, 1);
    addScore(FULL[rock.size]);
    kills += rock.size === 3 ? 7 : rock.size === 2 ? 3 : 1;
    burst(rock.x, rock.y, ROCK[rock.size].color, 6 + rock.size * 3, 160);
    shards(rock.x, rock.y, '#ff3b5c', 2 + rock.size, 120, rock.r * 0.6);
  }

  function spawnCrystal() {
    // atravessa o campo uma vez só, de uma borda até a outra (não dá a volta)
    const side = (Math.random() * 4) | 0;
    let x, y;
    if (side === 0) { x = -CRYSTAL_R * 2; y = rand(H * 0.15, H * 0.85); }
    else if (side === 1) { x = W + CRYSTAL_R * 2; y = rand(H * 0.15, H * 0.85); }
    else if (side === 2) { y = -CRYSTAL_R * 2; x = rand(W * 0.15, W * 0.85); }
    else { y = H + CRYSTAL_R * 2; x = rand(W * 0.15, W * 0.85); }
    const tx = rand(W * 0.3, W * 0.7), ty = rand(H * 0.3, H * 0.7);
    const a = Math.atan2(ty - y, tx - x), sp = 70;
    crystal = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: 0, t: 0 };
    tone(1568, 0.08, 'triangle', 0.05); tone(2093, 0.12, 'triangle', 0.05, null, 0.08);
  }

  function breakCrystal(scored) {
    const c = crystal;
    crystal = null;
    if (scored) addScore(CRYSTAL_PTS, c.x, c.y - 20, true);
    burst(c.x, c.y, C.crystal, 22, 220, 2.6);
    burst(c.x, c.y, '#ffffff', 8, 140, 2);
    shards(c.x, c.y, C.crystal, 8, 140, 9);
    ring(c.x, c.y, 'rgba(197,139,255,', 6, 220, 0.5, 3);
    [1760, 2349, 2637].forEach((f, i) => tone(f, 0.1, 'triangle', 0.06, null, i * 0.05));
    // solta a cápsula (bomba é a mais rara)
    const roll = Math.random();
    const type = roll < 0.4 ? 'shield' : roll < 0.8 ? 'double' : 'bomb';
    const cx = clamp(c.x, 20, W - 20), cy = clamp(c.y, 20, H - 20);
    const a = Math.random() * TAU;
    caps.push({ type, x: cx, y: cy, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, life: 10, t: 0 });
  }

  function collect(cap) {
    const P = POWERS[cap.type];
    addScore(50);
    popups.push({ x: cap.x, y: cap.y - 22, text: P.name + '!', color: P.color, life: 1.4, size: 18 });
    ring(cap.x, cap.y, hexToRgbPrefix(P.color), 8, 200, 0.4, 3);
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.08, 'square', 0.06, null, i * 0.05));
    if (cap.type === 'bomb') detonate(ship.x, ship.y);
    else power[cap.type] = P.time;
    updateHud();
  }
  function hexToRgbPrefix(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},`;
  }

  // Onda de choque que cresce a partir da nave e vaporiza tudo o que alcança.
  function detonate(x, y) {
    rings.push({ x, y, r: 6, vr: 760, life: 1.1, max: 1.1, color: 'rgba(255,59,92,', width: 6, bomb: true });
    eshots = [];
    flash('255,59,92', 0.35); shake(0.5);
    Sfx.explode();
    tone(80, 0.8, 'sawtooth', 0.12, 30);
  }

  /* ---------- nave ---------- */
  function shoot() {
    const fan = codes.has('KONAMI') && state !== 'menu', dbl = power.double > 0;
    const max = fan ? 15 : dbl ? 10 : MAX_SHOTS;
    const room = max - bullets.length;
    if (room <= 0) return false;
    const list = fan ? [-2, -1, 0, 1, 2].map(i => ({ da: i * 0.13, off: 0 }))
      : dbl ? [{ da: 0, off: -5 }, { da: 0, off: 5 }] : [{ da: 0, off: 0 }];
    const ca = Math.cos(ship.a), sa = Math.sin(ship.a);
    for (const s of list.slice(0, room)) {
      const a = ship.a + s.da;
      bullets.push({
        x: ship.x + ca * (SHIP_R + 4) - sa * s.off, y: ship.y + sa * (SHIP_R + 4) + ca * s.off,
        vx: Math.cos(a) * BULLET_V + ship.vx * 0.6, vy: Math.sin(a) * BULLET_V + ship.vy * 0.6, life: BULLET_LIFE,
      });
    }
    tone(fan ? 1100 : 940, 0.07, 'square', 0.035, 380);
    return true;
  }

  const shielded = () => power.shield > 0 || (codes.has('BLINDADO') && state !== 'menu');
  const vulnerable = () => state === 'play' && ship.alive && ship.hyperT <= 0 && ship.inv <= 0 && !shielded();

  function killShip(msg) {
    if (!ship.alive) return;
    ship.alive = false; ship.respawnT = 0; ship.thrust = 0;
    lives--; lostThisWave = true;
    power = { shield: 0, double: 0 };
    burst(ship.x, ship.y, C.ship, 30, 260, 2.6);
    burst(ship.x, ship.y, '#ffffff', 12, 180, 2);
    shards(ship.x, ship.y, C.ship, 6, 70, 13);
    ring(ship.x, ship.y, 'rgba(125,249,255,', 8, 240, 0.6, 3);
    shake(0.6); flash('255,80,60', 0.25);
    Sfx.explode();
    if (msg) popups.push({ x: W / 2, y: H * 0.38, text: msg, color: '#ff3b5c', life: 1.8, size: 22 });
    if (lives <= 0) overDelay = 2.2;
    updateHud();
  }

  function hyperspace() {
    if (!ship.alive || ship.hyperT > 0 || ship.hyperCd > 0) return;
    ship.hyperT = HYPER_TIME; ship.hyperCd = HYPER_CD + HYPER_TIME;
    ship.hx = rand(30, W - 30); ship.hy = rand(30, H - 30);
    ring(ship.x, ship.y, 'rgba(125,249,255,', 40, -70, 0.5, 2);
    burst(ship.x, ship.y, C.ship, 14, 120, 1.8);
    tone(300, 0.4, 'sine', 0.08, 2400);
    tone(150, 0.4, 'square', 0.03, 1200, 0.05);
  }

  function arriveHyper() {
    ship.x = ship.hx; ship.y = ship.hy;
    ship.vx *= 0.25; ship.vy *= 0.25;
    ring(ship.x, ship.y, 'rgba(125,249,255,', 4, 160, 0.45, 2);
    burst(ship.x, ship.y, C.ship, 14, 140, 1.8);
    tone(2400, 0.2, 'sine', 0.06, 500);
    // o risco: às vezes o motor dá pane na chegada (nem a blindagem salva)
    if (Math.random() < HYPER_FAIL) { ship.inv = 0; killShip('PANE NO HIPERESPAÇO!'); }
  }

  function centerClear() {
    const c = { x: W / 2, y: H / 2 };
    for (const r of rocks) if (near(r, c, r.r + 90)) return false;
    for (const s of eshots) if (near(s, c, 70)) return false;
    if (hunter && near(hunter, c, 120)) return false;
    if (crystal && near(crystal, c, 80)) return false;
    return true;
  }

  /* ---------- Caçador ---------- */
  function spawnHunter() {
    const fromLeft = Math.random() < 0.5;
    const sp = Math.min(200, 105 + wave * 8);
    hunter = {
      x: fromLeft ? -HUNTER_R * 2 : W + HUNTER_R * 2, y: rand(H * 0.12, H * 0.88),
      vx: fromLeft ? sp : -sp, vy: 0, turnT: 0.6, fireT: 1.2, a: fromLeft ? 0 : Math.PI, t: 0,
    };
    banner = { text: 'CAÇADOR À VISTA!', sub: `${HUNTER_PTS} PONTOS PELA CABEÇA DELE`, t: 1.6, color: C.hunter };
    tone(220, 0.3, 'sawtooth', 0.06, 660);
  }

  function updateHunter(dt) {
    const h = hunter;
    h.t += dt;
    h.x += h.vx * dt; h.y += h.vy * dt;
    h.y = ((h.y % H) + H) % H;
    h.turnT -= dt;
    if (h.turnT <= 0) { h.turnT = rand(0.7, 1.5); h.vy = rand(-1, 1) * 80; }
    // vira o "bico" para a nave
    const target = ship.alive && ship.hyperT <= 0 ? ship : { x: W / 2, y: H / 2 };
    const { dx, dy } = delta(h, target);
    h.a += clamp(angDiff(h.a, Math.atan2(dy, dx)), -5 * dt, 5 * dt);
    h.fireT -= dt;
    if (h.fireT <= 0 && h.x > 0 && h.x < W) {
      h.fireT = D().fire * rand(0.85, 1.15);
      if (ship.alive && ship.hyperT <= 0) {
        const err = Math.max(0.05, D().err - 0.025 * (wave - 1));
        const a = Math.atan2(dy, dx) + rand(-err, err);
        eshots.push({ x: h.x + Math.cos(a) * 16, y: h.y + Math.sin(a) * 16, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 1.7 });
        tone(520, 0.1, 'sawtooth', 0.04, 180);
      }
    }
    // sirene enquanto ele estiver na tela
    sirenT -= dt;
    if (sirenT <= 0) { sirenT = 0.22; sirenHi = !sirenHi; tone(sirenHi ? 760 : 560, 0.16, 'triangle', 0.025); }
    if ((h.vx > 0 && h.x > W + HUNTER_R * 2) || (h.vx < 0 && h.x < -HUNTER_R * 2)) {
      hunter = null;
      hunterT = D().hunter * rand(0.8, 1.2);
    }
  }

  function killHunter(scored) {
    const h = hunter;
    hunter = null;
    hunterT = D().hunter * rand(0.8, 1.2);
    if (scored) { addScore(HUNTER_PTS, h.x, h.y - 24, true); hunters++; }
    burst(h.x, h.y, C.hunter, 34, 280, 2.6);
    burst(h.x, h.y, '#ffffff', 10, 200, 2);
    shards(h.x, h.y, C.hunter, 8, 110, 12);
    ring(h.x, h.y, 'rgba(255,43,214,', 10, 260, 0.55, 3);
    shake(0.4); flash('255,43,214', 0.15);
    noise(0.6, 0.4, 2600);
    tone(880, 0.4, 'square', 0.06, 110);
  }

  /* ---------- entrada ---------- */
  const keys = { left: false, right: false, up: false, fire: false };
  const pads = { fire: false };
  const gp = { x: 0, y: 0, fire: false };
  const joy = new VJoy($('joy'));

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
    if (key === 'arrowup' || key === 'w') keys.up = true;
    if (key === ' ') keys.fire = true;
    if ((key === 'shift' || key === 'arrowdown' || key === 's') && !e.repeat) hyperReq = true;
  });
  addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') keys.left = false;
    if (key === 'arrowright' || key === 'd') keys.right = false;
    if (key === 'arrowup' || key === 'w') keys.up = false;
    if (key === ' ') keys.fire = false;
  });
  addEventListener('blur', () => { keys.left = keys.right = keys.up = keys.fire = false; pads.fire = false; });

  // Botões na tela (vários dedos ao mesmo tempo).
  function bindPadButton(el, down, up = () => {}) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); Sfx.ensure();
      el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
      down();
    });
    const end = () => { el.classList.remove('down'); up(); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindPadButton($('btnFire'), () => { pads.fire = true; }, () => { pads.fire = false; });
  bindPadButton($('btnHyper'), () => { if (state === 'play') hyperReq = true; });

  let padPrev = { a: false, b: false, start: false };
  function pollPad() {
    const g = Arcade.gamepad(0);
    gp.x = 0; gp.y = 0; gp.fire = false;
    if (!g) return;
    gp.x = g.lx; gp.y = g.ly; gp.fire = g.a || g.rt;
    if (g.a && !padPrev.a && (state === 'menu' || (state === 'over' && overT > 0.8))) start();
    if (g.b && !padPrev.b && state === 'play') hyperReq = true;
    if (g.start && !padPrev.start) { if (state === 'menu') start(); else togglePause(); }
    padPrev = { a: g.a, b: g.b, start: g.start };
  }

  // Junta teclado, joystick da tela e controle num comando só.
  function readControls() {
    const c = { aim: null, turn: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), thrust: keys.up ? 1 : 0, fire: keys.fire || pads.fire || gp.fire };
    if (joy.active && joy.mag > 0.3) { c.aim = Math.atan2(joy.y, joy.x); if (joy.mag > 0.8) c.thrust = 1; }
    const gm = Math.hypot(gp.x, gp.y);
    if (gm > 0.35) { c.aim = Math.atan2(gp.y, gp.x); if (gm > 0.85) c.thrust = 1; }
    return c;
  }

  // Piloto automático da demonstração: mira no alvo mais perto (com antecipação) e atira.
  function autopilot() {
    let best = null, bd = 1e9;
    const consider = (o, w) => {
      const { dx, dy } = delta(ship, o);
      const d = Math.hypot(dx, dy) * w;
      if (d < bd) { bd = d; best = { o, dx, dy, d: d / w }; }
    };
    for (const r of rocks) consider(r, 1);
    if (hunter && hunter.x > 0 && hunter.x < W) consider(hunter, 0.6);
    if (crystal) consider(crystal, 0.7);
    for (const c of caps) consider(c, 0.5);
    const out = { aim: null, turn: 0, thrust: 0, fire: false };
    if (!best) return out;
    const t = best.d / BULLET_V;
    const tx = best.dx + (best.o.vx || 0) * t, ty = best.dy + (best.o.vy || 0) * t;
    out.aim = Math.atan2(ty, tx);
    const sp = Math.hypot(ship.vx, ship.vy);
    out.thrust = best.d > 300 && sp < 120 ? 1 : 0;
    out.fire = Math.abs(angDiff(ship.a, out.aim)) < 0.2 && best.d < 360;
    return out;
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

  /* ---------- atualização ---------- */
  const NO_INPUT = { aim: null, turn: 0, thrust: 0, fire: false };

  function updateShip(dt) {
    const demo = state === 'menu';
    ship.inv = Math.max(0, ship.inv - dt);
    ship.hyperCd = Math.max(0, ship.hyperCd - dt);
    if (ship.hyperT > 0) {
      ship.hyperT -= dt;
      if (ship.hyperT <= 0) arriveHyper();
      return;
    }
    const c = demo ? autopilot() : state === 'play' ? readControls() : NO_INPUT;
    if (c.aim !== null) ship.a += clamp(angDiff(ship.a, c.aim), -AIM_TURN * dt, AIM_TURN * dt);
    else ship.a += c.turn * TURN * dt;
    ship.thrust = c.thrust;
    if (c.thrust > 0) {
      ship.vx += Math.cos(ship.a) * THRUST * c.thrust * dt;
      ship.vy += Math.sin(ship.a) * THRUST * c.thrust * dt;
      thrustSndT -= dt;
      if (thrustSndT <= 0) { thrustSndT = 0.08; noise(0.1, 0.05, 520, 0, 'lowpass', 160); }
      // fagulhas do motor
      if (Math.random() < 0.6) {
        const ba = ship.a + Math.PI + rand(-0.3, 0.3);
        particles.length < 320 && particles.push({ x: ship.x - Math.cos(ship.a) * 9, y: ship.y - Math.sin(ship.a) * 9, vx: Math.cos(ba) * 120 + ship.vx, vy: Math.sin(ba) * 120 + ship.vy, life: 0.25, max: 0.25, color: '#ff8a00', size: 2 });
      }
    }
    const drag = Math.exp(-DRAG * dt);
    ship.vx *= drag; ship.vy *= drag;
    const sp = Math.hypot(ship.vx, ship.vy);
    if (sp > VMAX) { ship.vx *= VMAX / sp; ship.vy *= VMAX / sp; }
    ship.x += ship.vx * dt; ship.y += ship.vy * dt;
    wrapPos(ship);
    camX += ship.vx * dt; camY += ship.vy * dt;

    // tiro: segurar = rajada com cadência; toques rápidos podem atirar um pouco mais rápido
    ship.fireCd -= dt;
    if (c.fire) {
      if (!fireWas && ship.fireCd > 0 && ship.fireCd < FIRE_IV - TAP_IV) ship.fireCd = 0;
      if (ship.fireCd <= 0 && shoot()) ship.fireCd = FIRE_IV;
    }
    fireWas = c.fire;

    if (hyperReq) { hyperReq = false; if (state === 'play') hyperspace(); }
  }

  function update(dt) {
    time += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    if (state === 'over') overT += dt;
    const demo = state === 'menu', playing = state === 'play';
    const slow = codes.has('LENTO') && !demo ? 0.45 : 1;

    power.shield = Math.max(0, power.shield - dt);
    power.double = Math.max(0, power.double - dt);

    // nave (ou reaparição quando o centro estiver livre)
    if (ship.alive) updateShip(dt);
    else if (lives > 0 && (playing || demo)) {
      ship.respawnT += dt;
      if (ship.respawnT > 1.4 && (centerClear() || ship.respawnT > 5)) {
        ship = newShip();
        ship.inv = 3;
        ring(ship.x, ship.y, 'rgba(125,249,255,', 50, -80, 0.5, 2);
        tone(440, 0.2, 'triangle', 0.06, 880);
      }
    }
    if (!ship.alive || ship.hyperT > 0) fireWas = false;

    // meteoros
    for (const r of rocks) {
      r.x += r.vx * dt * slow; r.y += r.vy * dt * slow; r.rot += r.spin * dt * slow;
      wrapPos(r);
    }
    for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrapPos(b); }
    bullets = bullets.filter(b => b.life > 0);
    for (const s of eshots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; wrapPos(s); }
    eshots = eshots.filter(s => s.life > 0);
    for (const c of caps) { c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; c.t += dt; wrapPos(c); }
    caps = caps.filter(c => c.life > 0);

    // cristal raro
    if (crystal) {
      crystal.x += crystal.vx * dt * slow; crystal.y += crystal.vy * dt * slow;
      crystal.rot += dt * 1.4; crystal.t += dt;
      const m = CRYSTAL_R * 3;
      if (crystal.t > 2 && (crystal.x < -m || crystal.x > W + m || crystal.y < -m || crystal.y > H + m)) crystal = null;
    } else if ((playing || demo) && waveT <= 0) {
      crystalT -= dt;
      if (crystalT <= 0) { spawnCrystal(); crystalT = rand(18, 30); }
    }

    // Caçador
    if (hunter) updateHunter(dt);
    else if ((playing || demo) && waveT <= 0 && rocks.length) {
      hunterT -= dt;
      if (hunterT <= 0) spawnHunter();
    }

    collide();

    // fim da onda
    if ((playing || demo) && !rocks.length && waveT <= 0) {
      waveT = 2.4;
      if (playing && !lostThisWave && ship.alive) {
        addScore(PERFECT_BONUS);
        banner = { text: 'SEM ARRANHÃO!', sub: `BÔNUS +${PERFECT_BONUS}`, t: 2, color: '#ffd400' };
        Sfx.win();
      } else banner = { text: `ONDA ${wave} LIMPA`, sub: 'PREPARE-SE...', t: 2 };
    }
    if (waveT > 0) { waveT -= dt; if (waveT <= 0) { wave++; spawnWave(); } }

    if (overDelay > 0) { overDelay -= dt; if (overDelay <= 0 && playing) { gameOver(); return; } }

    // efeitos
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    particles = particles.filter(p => p.life > 0);
    for (const d of debris) { d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt; }
    debris = debris.filter(d => d.life > 0);
    for (const r of rings) { r.life -= dt; r.r = Math.max(0, r.r + r.vr * dt); }
    rings = rings.filter(r => r.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 22 * dt; }
    popups = popups.filter(p => p.life > 0);
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }

    // HUD só muda quando o texto de status muda (cronômetros dos poderes)
    if (statusText() !== lastStatus) updateHud();
  }

  function collide() {
    const demo = state === 'menu';
    // tiros da nave
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let hit = false;
      for (let j = rocks.length - 1; j >= 0; j--) {
        const r = rocks[j];
        if (near(b, r, r.r * 0.92 + 2)) { breakRock(r, true, b.vx, b.vy); hit = true; break; }
      }
      if (!hit && crystal && near(b, crystal, CRYSTAL_R + 3)) { breakCrystal(true); hit = true; }
      if (!hit && hunter && near(b, hunter, HUNTER_R + 2)) { killHunter(true); hit = true; }
      if (hit) bullets.splice(i, 1);
    }
    // tiros do Caçador quebram meteoros (sem pontos) e acertam a nave
    for (let i = eshots.length - 1; i >= 0; i--) {
      const s = eshots[i];
      let hit = false;
      for (let j = rocks.length - 1; j >= 0; j--) {
        const r = rocks[j];
        if (near(s, r, r.r * 0.9)) { breakRock(r, false); hit = true; break; }
      }
      if (!hit && !demo && ship.alive && ship.hyperT <= 0 && near(s, ship, SHIP_R + 3)) {
        hit = true;
        if (vulnerable()) killShip();
        else { burst(s.x, s.y, POWERS.shield.color, 10, 140); tone(1200, 0.06, 'square', 0.05, 600); }
      }
      if (hit) eshots.splice(i, 1);
    }
    // bomba: anel que vaporiza o que alcançar
    for (const rg of rings) {
      if (!rg.bomb) continue;
      for (let j = rocks.length - 1; j >= 0; j--) if (near(rg, rocks[j], rg.r + rocks[j].r * 0.5)) vaporize(rocks[j]);
      if (hunter && near(rg, hunter, rg.r)) killHunter(true);
      if (crystal && near(rg, crystal, rg.r)) breakCrystal(true);
    }
    if (demo || state !== 'play' || !ship.alive || ship.hyperT > 0) return;
    // nave contra o resto
    const sh = shielded(), safe = ship.inv > 0;
    for (let j = rocks.length - 1; j >= 0; j--) {
      const r = rocks[j];
      if (!near(ship, r, r.r * 0.85 + SHIP_R * 0.8)) continue;
      if (sh) {
        // com escudo a trombada parte o meteoro e empurra a nave
        const { dx, dy } = delta(r, ship);
        const d = Math.hypot(dx, dy) || 1;
        ship.vx += (dx / d) * 120; ship.vy += (dy / d) * 120;
        breakRock(r, true);
        tone(300, 0.1, 'square', 0.06, 900);
      } else if (!safe) { breakRock(r, true); killShip(); return; }
    }
    if (crystal && near(ship, crystal, CRYSTAL_R + SHIP_R * 0.8)) {
      if (sh) breakCrystal(true);
      else if (!safe) { breakCrystal(true); killShip(); return; }
    }
    if (hunter && near(ship, hunter, HUNTER_R + SHIP_R * 0.8)) {
      if (sh) killHunter(true);
      else if (!safe) { killHunter(true); killShip(); return; }
    }
    for (let i = caps.length - 1; i >= 0; i--) {
      if (near(ship, caps[i], 13 + SHIP_R)) { const c = caps[i]; caps.splice(i, 1); collect(c); }
    }
  }

  /* ---------- desenho ---------- */
  // Traço neon barato: um traço largo e transparente (brilho) e um fino por cima (núcleo).
  function neon(color, glow, w = 1.8) {
    ctx.strokeStyle = glow; ctx.lineWidth = w * 4.5; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }

  function drawText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function rockPoly(r, x, y) {
    const n = r.shape.length;
    for (let i = 0; i < n; i++) {
      const a = r.rot + (i / n) * TAU, d = r.r * r.shape[i];
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawRocks() {
    // um caminho por tamanho: poucas chamadas de desenho mesmo com muitos meteoros
    for (const size of [3, 2, 1]) {
      ctx.beginPath();
      let any = false;
      for (const r of rocks) if (r.size === size) { any = true; eachWrap(r.x, r.y, r.r * 1.05, (x, y) => rockPoly(r, x, y)); }
      if (!any) continue;
      ctx.fillStyle = 'rgba(255,138,0,0.05)'; ctx.fill();
      neon(ROCK[size].color, ROCK[size].glow, size === 1 ? 1.5 : 1.8);
    }
  }

  function shipPath(x, y, a, s = 1) {
    const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
    const P = (px, py) => [x + px * ca - py * sa, y + px * sa + py * ca];
    const pts = [P(15, 0), P(-10, -9), P(-6, 0), P(-10, 9)];
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawShip() {
    if (!ship.alive || ship.hyperT > 0) return;
    if (ship.inv > 0 && Math.floor(time * 10) % 2) return;   // pisca enquanto invencível
    eachWrap(ship.x, ship.y, 24, (x, y) => {
      ctx.save();
      ctx.shadowColor = C.ship; ctx.shadowBlur = 10;
      ctx.beginPath(); shipPath(x, y, ship.a);
      ctx.fillStyle = 'rgba(125,249,255,0.1)'; ctx.fill();
      ctx.strokeStyle = C.ship; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      if (ship.thrust > 0) {
        const f = rand(10, 20);
        const ca = Math.cos(ship.a), sa = Math.sin(ship.a);
        ctx.beginPath();
        ctx.moveTo(x - ca * 7 + sa * 4, y - sa * 7 - ca * 4);
        ctx.lineTo(x - ca * (7 + f), y - sa * (7 + f));
        ctx.lineTo(x - ca * 7 - sa * 4, y - sa * 7 + ca * 4);
        neon('#ffb347', 'rgba(255,138,0,0.3)', 1.6);
      }
      if (shielded()) {
        const left = codes.has('BLINDADO') ? 99 : power.shield;
        if (left > 2 || Math.floor(time * 8) % 2) {
          ctx.beginPath(); ctx.arc(x, y, 20 + Math.sin(time * 6) * 1.5, 0, TAU);
          neon('#39ff14', 'rgba(57,255,20,0.18)', 1.5);
        }
      }
    });
  }

  function drawHunter() {
    const h = hunter;
    eachWrap(h.x, h.y, 22, (x, y) => {
      const ca = Math.cos(h.a), sa = Math.sin(h.a);
      const P = (px, py) => [x + px * ca - py * sa, y + px * sa + py * ca];
      // arraia com pinças: bico apontado para você
      const pts = [P(16, 0), P(-6, -13), P(-2, -5), P(-11, 0), P(-2, 5), P(-6, 13)];
      ctx.save();
      ctx.shadowColor = C.hunter; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,43,214,0.12)'; ctx.fill();
      ctx.strokeStyle = C.hunter; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      // olho que pulsa
      ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(h.t * 12) * 0.4})`;
      ctx.beginPath(); ctx.arc(x + ca * 2, y + sa * 2, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }, false);
  }

  function drawCrystal() {
    const c = crystal;
    const pulse = 0.5 + Math.sin(c.t * 5) * 0.5;
    ctx.save();
    ctx.shadowColor = C.crystal; ctx.shadowBlur = 14 + pulse * 10;
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = c.rot + (i / 6) * TAU, d = i % 2 ? CRYSTAL_R * 0.8 : CRYSTAL_R;
      pts.push([c.x + Math.cos(a) * d, c.y + Math.sin(a) * d]);
    }
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = `rgba(197,139,255,${0.12 + pulse * 0.12})`; ctx.fill();
    ctx.strokeStyle = C.crystal; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    // facetas
    ctx.beginPath();
    for (const p of pts) { ctx.moveTo(c.x, c.y); ctx.lineTo(p[0], p[1]); }
    ctx.strokeStyle = `rgba(160,240,255,${0.35 + pulse * 0.4})`; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function drawCaps() {
    for (const c of caps) {
      if (c.life < 2.5 && Math.floor(time * 8) % 2) continue;   // pisca antes de sumir
      const P = POWERS[c.type];
      const r = 11 + Math.sin(c.t * 6) * 1.2;
      eachWrap(c.x, c.y, 16, (x, y) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
        neon(P.color, hexToRgbPrefix(P.color) + '0.25)', 2);
        ctx.font = '900 12px Orbitron, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = P.color; ctx.fillText(P.letter, x, y + 0.5);
      });
    }
  }

  function drawStars() {
    for (const s of stars) {
      const x = (((s.x - camX * s.d) % W) + W) % W, y = (((s.y - camY * s.d) % H) + H) % H;
      ctx.globalAlpha = s.b * (0.7 + Math.sin(time * 2 + s.p) * 0.3);
      ctx.fillStyle = s.d > 0.1 ? '#fff4e0' : '#cfe8ff';
      ctx.fillRect(x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? rand(-1, 1) * shakeT * 14 : 0, sy = shakeT > 0 ? rand(-1, 1) * shakeT * 14 : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    drawStars();

    // anéis (explosões, hiperespaço, bomba)
    for (const r of rings) {
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.strokeStyle = r.color + (r.life / r.max) * (r.bomb ? 0.9 : 0.7) + ')';
      ctx.lineWidth = r.width; ctx.stroke();
    }

    drawCaps();
    drawRocks();
    if (crystal) drawCrystal();

    // tiros da nave: riscos brancos
    if (bullets.length) {
      ctx.beginPath();
      for (const b of bullets) { ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); ctx.lineTo(b.x, b.y); }
      neon('#ffffff', 'rgba(125,249,255,0.35)', 2);
    }
    // tiros do Caçador: bolinhas magenta
    if (eshots.length) {
      ctx.beginPath();
      for (const s of eshots) { ctx.moveTo(s.x + 3.5, s.y); ctx.arc(s.x, s.y, 3.5, 0, TAU); }
      ctx.fillStyle = 'rgba(255,43,214,0.3)'; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,43,214,0.3)'; ctx.stroke();
      ctx.fillStyle = C.eshot; ctx.fill();
    }

    if (hunter) drawHunter();
    drawShip();

    // cacos e partículas
    if (debris.length) {
      for (const d of debris) {
        ctx.globalAlpha = Math.max(0, d.life / d.max);
        const ca = Math.cos(d.a) * d.len / 2, sa = Math.sin(d.a) * d.len / 2;
        ctx.beginPath(); ctx.moveTo(d.x - ca, d.y - sa); ctx.lineTo(d.x + ca, d.y + sa);
        ctx.strokeStyle = d.color; ctx.lineWidth = 1.6; ctx.stroke();
      }
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const p of popups) drawText(p.text, p.x, p.y, p.size, p.color, Math.min(1, p.life * 2));
    if (banner && state !== 'over') {
      const a = Math.min(1, banner.t * 2);
      drawText(banner.text, W / 2, H * 0.42, Math.min(40, W / 12), banner.color || '#ff8a00', a);
      if (banner.sub) drawText(banner.sub, W / 2, H * 0.42 + 36, 14, '#f1e9ff', a * 0.9);
    }
    // reaparição: aviso enquanto espera o centro liberar
    if (state === 'play' && !ship.alive && lives > 0 && ship.respawnT > 1.4) {
      drawText('ESPERANDO O CENTRO LIBERAR...', W / 2, H / 2 + 50, 13, '#7df9ff', 0.5 + Math.sin(time * 6) * 0.3);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 30, 0, TAU);
      ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(125,249,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (flashT > 0) {
      ctx.fillStyle = `rgba(${flashColor},${flashT * 0.6})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
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
  ship = newShip();
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  resize();
  makeStars();
  loadHi();
  newGame();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
