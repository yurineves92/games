// Pong: quadra neon, bola que acelera e faz curva com o efeito da raquete, CPU que erra como gente.
// A quadra lógica é sempre "deitada" (raquetes à esquerda e à direita). Em tela de celular em pé
// ela é desenhada girada 90°: o jogador 1 fica embaixo e o jogador 2 em cima.
(() => {
  const L = 800;                                     // comprimento da quadra (eixo x lógico)
  let S = 480;                                       // largura da quadra (eixo y lógico), adapta à tela
  const PW = 12, PH = 84, GIANT_H = 176, PX = 30;    // raquete: espessura, altura, altura gigante, distância da borda
  const BS = 12;                                     // lado da bola (quadrada, como em 1972)
  const WIN = 7;
  const SPEED0 = 380, SPEED_MAX = 1050;
  const TAU = Math.PI * 2;
  // CPU: velocidade máx., tempo de reação, erro de mira, se prevê tabelas, quanto tenta "colocar" a bola, chance de vacilo.
  const AI = {
    easy: { v: 300, react: 0.3, err: 44, predict: false, aim: 0, lapse: 0.16, mult: 1 },
    normal: { v: 430, react: 0.17, err: 24, predict: true, aim: 0.35, lapse: 0.08, mult: 2 },
    hard: { v: 580, react: 0.08, err: 10, predict: true, aim: 0.75, lapse: 0.035, mult: 3 },
  };
  const DIFF_NAME = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { p1: $('hP1'), p2: $('hP2'), p1n: $('hP1Name'), p2n: $('hP2Name'), hi: $('hHi'), hiWrap: $('hHiWrap'), status: $('hStatus') };

  /* ---------- configurações e códigos ---------- */
  const settings = { mode: '1p', diff: 'normal' };
  Arcade.bindSettings(panels.menu, settings, 'pong_', () => syncMode());
  const codes = Arcade.codes('pong', {
    KONAMI: 'Bola arco-íris com rastro de cometa',
    GIGANTE: 'Sua raquete fica gigante',
    MALUCO: 'A bola muda de rumo do nada',
  }, $('codeMount'));

  const hiKey = () => 'pong_hi_' + settings.diff;
  let hi = 0;
  function syncMode() {
    $('diffOpt').hidden = settings.mode !== '1p';
    hi = +Arcade.store.get(hiKey(), 0) || 0;
    updateHud();
  }

  /* ---------- tela ---------- */
  let k = 1, rot = false;
  const bg = document.createElement('canvas');
  const scan = document.createElement('canvas');

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    rot = h > w * 1.05;
    const long = Math.max(w, h), short = Math.min(w, h);
    S = Math.round(Math.max(420, Math.min(600, (L * short) / Math.max(1, long))));
    k = rot ? Arcade.fit(canvas, S, L, wrap) : Arcade.fit(canvas, L, S, wrap);
    buildBackground();
    buildScan();
    for (const p of paddles) p.y = Math.max(p.h / 2, Math.min(S - p.h / 2, p.y));
  }

  // Transformação da quadra lógica para o canvas (com tremida opcional, em unidades lógicas).
  function courtTransform(g, sx = 0, sy = 0) {
    if (rot) g.setTransform(0, -k, k, 0, (sy) * k, (L - sx) * k);
    else g.setTransform(k, 0, 0, k, sx * k, sy * k);
  }

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    courtTransform(g);
    const grad = g.createLinearGradient(0, 0, L, 0);
    grad.addColorStop(0, '#04121c'); grad.addColorStop(0.5, '#020910'); grad.addColorStop(1, '#04121c');
    g.fillStyle = grad; g.fillRect(0, 0, L, S);
    // grade bem apagada, como uma mesa de fliperama
    g.strokeStyle = 'rgba(77,210,255,0.05)'; g.lineWidth = 1;
    for (let x = 0; x <= L; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
    for (let y = 0; y <= S; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(L, y); g.stroke(); }
    // linhas da quadra
    g.save();
    g.shadowColor = '#4dd2ff'; g.shadowBlur = 10;
    g.strokeStyle = 'rgba(77,210,255,0.8)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(L, 2); g.moveTo(0, S - 2); g.lineTo(L, S - 2); g.stroke();
    // rede tracejada
    g.fillStyle = 'rgba(77,210,255,0.55)';
    for (let y = 8; y < S - 8; y += 22) g.fillRect(L / 2 - 2, y, 4, 12);
    g.restore();
    // círculo central discreto
    g.strokeStyle = 'rgba(77,210,255,0.12)'; g.lineWidth = 2;
    g.beginPath(); g.arc(L / 2, S / 2, 60, 0, TAU); g.stroke();
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.15)';
    const step = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 220));
    if (rot) for (let x = 0; x < scan.width; x += step) g.fillRect(x, 0, Math.max(1, step >> 1), scan.height);
    else for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.3, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  const paddles = [
    { side: 0, x: PX, y: 240, h: PH, vy: 0, glow: 0, color: '#4dd2ff', target: null, dir: 0, cpu: false, ai: null },
    { side: 1, x: L - PX, y: 240, h: PH, vy: 0, glow: 0, color: '#ff2bd6', target: null, dir: 0, cpu: false, ai: null },
  ];
  let scores = [0, 0], ball = null, rally = 0, bestRally = 0, hits = 0;
  let particles = [], trail = [], popups = [];
  let time = 0, stateT = 0, endT = 0, countT = 0, lastBeat = 0, shakeT = 0, flashT = 0, flashSide = 0, overT = 0, crazyT = 3;
  let scorePulse = [0, 0];

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function setupMatch(demo) {
    scores = [0, 0]; rally = 0; bestRally = 0; hits = 0; endT = 0;
    particles = []; trail = []; popups = [];
    const one = settings.mode === '1p';
    paddles[0].cpu = demo;
    paddles[1].cpu = demo || one;
    paddles[0].ai = demo ? newAi('normal') : null;
    paddles[1].ai = demo ? newAi('normal') : one ? newAi(settings.diff) : null;
    paddles[0].color = '#4dd2ff';
    paddles[1].color = one || demo ? '#ff2bd6' : '#ffd400';
    for (const p of paddles) { p.y = S / 2; p.vy = 0; p.target = null; p.glow = 0; }
    applySizes();
    serve(Math.random() < 0.5 ? 0 : 1, 1);
  }

  function applySizes() {
    paddles[0].h = codes.has('GIGANTE') && state !== 'menu' ? GIANT_H : PH;
    paddles[1].h = PH;
  }

  function newAi(level) {
    return { cfg: AI[level], t: 0, target: S / 2, err: 0, offset: 0, coming: false };
  }

  // Bola no centro; sai em direção a quem vai receber (side 0 = esquerda) depois de uma pausa.
  function serve(toward, wait = 1) {
    const a = Arcade.rand(-0.45, 0.45);
    const dir = toward === 0 ? -1 : 1;
    ball = { x: L / 2, y: S / 2 + Arcade.rand(-S * 0.25, S * 0.25), vx: Math.cos(a) * dir, vy: Math.sin(a), speed: SPEED0, curve: 0, wait, spin: 0, hue: 0 };
    rally = 0;
    crazyT = Arcade.rand(1.5, 3.5);
  }

  function start() {
    Sfx.ensure();
    state = 'count';
    setupMatch(false);
    ball.wait = 99;
    countT = 2.4; lastBeat = 0; stateT = 0;
    show(null);
    updateHud();
  }

  function toMenu() {
    state = 'menu';
    setupMatch(true);
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (state === 'play' || state === 'count') { pausedFrom = state; state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
  }

  // Pontuação do ranking: seus pontos ×100 − pontos da CPU ×50 + bônus de vitória (500 × 1/2/3).
  function rankScore(win) {
    const mult = AI[settings.diff].mult;
    return Math.max(0, scores[0] * 100 - scores[1] * 50 + (win ? 500 * mult : 0));
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const one = settings.mode === '1p';
    const p1win = scores[0] > scores[1];
    $('overTitle').textContent = one ? (p1win ? 'VOCÊ VENCEU!' : 'A CPU VENCEU') : (p1win ? 'JOGADOR 1 VENCEU!' : 'JOGADOR 2 VENCEU!');
    $('overVs').innerHTML = `<div>${one ? 'VOCÊ' : 'J1'}<b>${scores[0]}</b></div><span class="x">×</span><div>${one ? 'CPU' : 'J2'}<b>${scores[1]}</b></div>`;
    const info = `Maior rally: ${bestRally} ${bestRally === 1 ? 'rebatida' : 'rebatidas'}`;
    let rec = false;
    if (one) {
      const sc = rankScore(p1win);
      const cheated = codes.any();
      rec = sc > hi && !cheated;
      if (rec) { hi = sc; Arcade.store.set(hiKey(), hi); }
      $('overScore').hidden = false;
      $('overScore').textContent = sc;
      $('overInfo').textContent = `CPU ${DIFF_NAME[settings.diff]} · ${info}`;
      Ranking.gameOver($('rankBox'), { board: 'pong-' + settings.diff, score: sc, cheated });
    } else {
      $('overScore').hidden = true;
      $('overInfo').textContent = info;
      $('rankBox').hidden = true;
      $('rankBox').innerHTML = '';
    }
    $('overRecord').hidden = !rec;
    show('over');
    if (!one || p1win) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    const one = settings.mode === '1p';
    const demo = state === 'menu';
    hud.p1n.textContent = one ? 'VOCÊ' : 'J1';
    hud.p2n.textContent = one ? 'CPU' : 'J2';
    hud.p1.textContent = demo ? 0 : scores[0];
    hud.p2.textContent = demo ? 0 : scores[1];
    hud.hiWrap.hidden = !one;
    hud.hi.textContent = hi;
    hud.status.textContent = one ? `CPU ${DIFF_NAME[settings.diff]}` : '2 JOGADORES';
  }

  /* ---------- física ---------- */
  function burst(x, y, color, n, power = 200, size = 3) {
    for (let i = 0; i < n && particles.length < 500; i++) {
      const a = Math.random() * TAU, s = Arcade.rand(power * 0.2, power);
      const life = Arcade.rand(0.25, 0.7);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: Arcade.rand(size * 0.6, size * 1.4) });
    }
  }

  const ballColor = () => (codes.has('KONAMI') ? `hsl(${ball.hue % 360},100%,62%)` : '#ffffff');

  function hitPaddle(p) {
    const dir = p.side === 0 ? 1 : -1;
    // o ângulo depende do ponto de contato: no centro sai reto, nas pontas sai inclinado (até ~54°)
    const t = Math.max(-1, Math.min(1, (ball.y - p.y) / (p.h / 2 + BS / 2)));
    const a = t * 0.95;
    ball.speed = Math.min(SPEED_MAX, ball.speed * 1.05 + 10);
    ball.vx = Math.cos(a) * dir; ball.vy = Math.sin(a);
    // efeito: raquete em movimento empurra a bola e faz ela curvar
    ball.vy += (p.vy / ball.speed) * 0.25;
    ball.curve = Math.max(-1100, Math.min(1100, p.vy * 1.3));
    ball.spin = ball.curve / 300;
    ball.x = p.x + dir * (PW / 2 + BS / 2 + 0.5);
    normalize();
    p.glow = 1;
    rally++; hits++;
    bestRally = Math.max(bestRally, rally);
    burst(ball.x, ball.y, codes.has('KONAMI') ? ballColor() : p.color, 12, 220);
    const pitch = 330 + (ball.speed - SPEED0) * 0.7;
    tone(pitch, 0.06, 'square', 0.09);
    if (Math.abs(ball.curve) > 500) tone(pitch * 1.5, 0.12, 'triangle', 0.05, pitch * 2.2, 0.03);
    if (rally > 0 && rally % 10 === 0 && state === 'play') popups.push({ x: L / 2, y: S * 0.2, text: `RALLY ${rally}!`, color: '#ffd400', life: 1.2 });
  }

  // Mantém a velocidade constante e impede a bola de andar quase na vertical.
  function normalize() {
    const m = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx /= m; ball.vy /= m;
    if (Math.abs(ball.vx) < 0.55) {
      ball.vx = Math.sign(ball.vx || 1) * 0.55;
      ball.vy = Math.sign(ball.vy || 1) * Math.sqrt(1 - 0.55 * 0.55);
    }
  }

  function scorePoint(side) {
    scores[side]++;
    scorePulse[side] = 1;
    shakeT = 0.35; flashT = 0.35; flashSide = side === 0 ? 1 : 0;
    const gx = side === 0 ? L : 0;
    burst(gx, Math.max(10, Math.min(S - 10, ball.y)), side === 0 ? paddles[0].color : paddles[1].color, 40, 380, 4);
    if (state === 'menu') {
      if (Math.max(...scores) >= WIN) scores = [0, 0];
      serve(side === 0 ? 1 : 0, 1);
      return;
    }
    const one = settings.mode === '1p';
    if (one && side === 1) { tone(300, 0.15, 'square', 0.1, 120); tone(150, 0.3, 'triangle', 0.1, 70, 0.12); }
    else [660, 880, 1320].forEach((f, i) => tone(f, 0.1, 'square', 0.08, null, i * 0.07));
    noise(0.3, 0.2, 1800);
    updateHud();
    if (scores[side] >= WIN) { ball.wait = 99; endT = 0.9; return; }
    // quem levou o ponto recebe o próximo saque
    serve(side === 0 ? 1 : 0, 1.1);
  }

  function updateBall(dt) {
    if (ball.wait > 0) { ball.wait -= dt; if (ball.wait <= 0) tone(880, 0.05, 'square', 0.06); return; }
    // curva (efeito) que vai sumindo
    ball.vy += (ball.curve / ball.speed) * dt;
    ball.curve *= Math.exp(-dt * 1.5);
    ball.spin *= Math.exp(-dt * 1.2);
    normalize();
    ball.hue += dt * 400;

    // código MALUCO: de vez em quando a bola muda de rumo sozinha
    if (codes.has('MALUCO')) {
      crazyT -= dt;
      if (crazyT <= 0) {
        crazyT = Arcade.rand(1.2, 3.2);
        if (ball.x > L * 0.25 && ball.x < L * 0.75) {
          const a = Arcade.rand(-0.85, 0.85);
          const dir = Math.random() < 0.22 ? -Math.sign(ball.vx) : Math.sign(ball.vx);
          ball.vx = Math.cos(a) * dir; ball.vy = Math.sin(a);
          ball.curve = Arcade.rand(-600, 600);
          normalize();
          burst(ball.x, ball.y, '#ffd400', 16, 200);
          popups.push({ x: ball.x, y: ball.y - 24, text: '?!', color: '#ffd400', life: 0.7 });
          tone(1200, 0.15, 'sawtooth', 0.05, 300);
        }
      }
    }

    const dist = ball.speed * dt, n = Math.max(1, Math.ceil(dist / 4));
    for (let i = 0; i < n; i++) {
      const px = ball.x;
      ball.x += (ball.vx * dist) / n;
      ball.y += (ball.vy * dist) / n;
      // paredes de cima e de baixo
      if (ball.y < BS / 2 + 3) { ball.y = BS / 2 + 3; ball.vy = Math.abs(ball.vy); ball.curve *= -0.5; wallHit(); }
      else if (ball.y > S - BS / 2 - 3) { ball.y = S - BS / 2 - 3; ball.vy = -Math.abs(ball.vy); ball.curve *= -0.5; wallHit(); }
      // raquetes
      for (const p of paddles) {
        const face = p.x + (p.side === 0 ? PW / 2 : -PW / 2);
        const coming = p.side === 0 ? ball.vx < 0 : ball.vx > 0;
        if (!coming) continue;
        const front = ball.x + (p.side === 0 ? -BS / 2 : BS / 2);
        const prevFront = px + (p.side === 0 ? -BS / 2 : BS / 2);
        const crossed = p.side === 0 ? front <= face && prevFront >= face - PW : front >= face && prevFront <= face + PW;
        if (crossed && Math.abs(ball.y - p.y) <= p.h / 2 + BS / 2) { hitPaddle(p); break; }
      }
      // gol
      if (ball.x < -BS) { scorePoint(1); return; }
      if (ball.x > L + BS) { scorePoint(0); return; }
    }
    trail.push({ x: ball.x, y: ball.y, hue: ball.hue });
    const maxTrail = codes.has('KONAMI') ? 40 : 14;
    while (trail.length > maxTrail) trail.shift();
  }

  function wallHit() {
    tone(220, 0.04, 'square', 0.06);
    burst(ball.x, ball.y, '#4dd2ff', 5, 120, 2);
  }

  /* ---------- CPU ---------- */
  // Onde a bola vai cruzar a linha x, contando as tabelas nas paredes (ignora a curva: é aí que ela erra).
  function predictY(x) {
    const t = (x - ball.x) / (ball.vx * ball.speed);
    if (t < 0) return ball.y;
    let y = ball.y + ball.vy * ball.speed * t;
    const lo = BS / 2 + 3, span = S - BS - 6;
    y -= lo;
    y = ((y % (2 * span)) + 2 * span) % (2 * span);
    if (y > span) y = 2 * span - y;
    return y + lo;
  }

  function cpuThink(p, dt) {
    const ai = p.ai, c = ai.cfg;
    const coming = (p.side === 0 ? ball.vx < 0 : ball.vx > 0) && ball.wait <= 0;
    if (coming && !ai.coming) {
      // nova jogada vindo: sorteia o erro desta vez (cresce com a velocidade) e às vezes um vacilo
      const sp = ball.speed / SPEED0;
      ai.err = Arcade.rand(-c.err, c.err) * sp;
      if (Math.random() < c.lapse * sp) ai.err += (Math.random() < 0.5 ? -1 : 1) * Arcade.rand(p.h * 0.6, p.h * 1.1);
      ai.offset = Arcade.rand(-1, 1) * c.aim * p.h * 0.42;
      ai.t = 0;
    }
    ai.coming = coming;
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = c.react * Arcade.rand(0.7, 1.3);
      if (coming) {
        const y = c.predict ? predictY(p.x) : ball.y;
        ai.target = y + ai.err - ai.offset;
      } else {
        // bola indo embora: volta devagar para perto do meio
        ai.target = S / 2 + (ball.y - S / 2) * 0.25;
      }
    }
    const d = ai.target - p.y;
    const maxV = coming ? c.v : c.v * 0.5;
    return Math.max(-maxV, Math.min(maxV, d * 7));
  }

  /* ---------- entrada ---------- */
  const keys = {};
  const touches = new Map();                         // ponteiro → lado controlado
  let mouseY = null;

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
    keys[key] = true;
    if (key === 'w' || key === 's' || key.startsWith('arrow')) mouseY = null;
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const kk in keys) keys[kk] = false; });

  // Converte a posição do ponteiro para a quadra lógica (desfazendo o giro em tela em pé).
  function toCourt(e) {
    const r = canvas.getBoundingClientRect();
    const X = (e.clientX - r.left) / r.width, Y = (e.clientY - r.top) / r.height;
    return rot ? { x: L - Y * L, y: X * S } : { x: X * L, y: Y * S };
  }
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    const c = toCourt(e);
    const side = settings.mode === '1p' ? 0 : c.x < L / 2 ? 0 : 1;
    touches.set(e.pointerId, side);
    paddles[side].target = c.y;
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
  });
  screen.addEventListener('pointermove', e => {
    const c = toCourt(e);
    if (touches.has(e.pointerId)) { paddles[touches.get(e.pointerId)].target = c.y; return; }
    // mouse passando por cima (sem clicar) move o jogador 1 no modo 1 jogador
    if (e.pointerType === 'mouse' && settings.mode === '1p') mouseY = c.y;
  });
  const endTouch = e => {
    if (!touches.has(e.pointerId)) return;
    paddles[touches.get(e.pointerId)].target = null;
    touches.delete(e.pointerId);
  };
  screen.addEventListener('pointerup', endTouch);
  screen.addEventListener('pointercancel', endTouch);
  screen.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouseY = null; });

  const padPrev = [{ a: false, start: false }, { a: false, start: false }];
  const padAxis = [0, 0];
  function pollPads() {
    for (let i = 0; i < 2; i++) {
      const g = Arcade.gamepad(i);
      padAxis[i] = 0;
      if (!g) continue;
      padAxis[i] = g.ly || g.ry;
      if (g.a && !padPrev[i].a && (state === 'menu' || (state === 'over' && overT > 0.8))) start();
      if (g.start && !padPrev[i].start) togglePause();
      padPrev[i].a = g.a; padPrev[i].start = g.start;
    }
  }

  // Velocidade desejada de cada raquete humana (unidades/s).
  function humanVelocity(p) {
    const one = settings.mode === '1p';
    const target = p.target !== null ? p.target : p.side === 0 && one && mouseY !== null ? mouseY : null;
    if (target !== null) return Math.max(-1500, Math.min(1500, (target - p.y) * 20));
    let dir = 0;
    if (p.side === 0) {
      dir = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      if (one) dir += (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
      if (padAxis[0]) dir = padAxis[0];
    } else {
      dir = (keys.arrowdown ? 1 : 0) - (keys.arrowup ? 1 : 0);
      if (padAxis[1]) dir = padAxis[1];
    }
    return Math.max(-1, Math.min(1, dir)) * 620;
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

  /* ---------- atualização ---------- */
  function update(dt) {
    time += dt; stateT += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    scorePulse = scorePulse.map(v => Math.max(0, v - dt * 1.5));
    if (state === 'over') overT += dt;

    if (state === 'count') {
      const beat = Math.ceil(countT / 0.8);
      if (beat !== lastBeat) { lastBeat = beat; Sfx.beep(false); }
      countT -= dt;
      if (countT <= 0) { state = 'play'; ball.wait = 0.4; Sfx.beep(true); }
    }

    if (state === 'play' && endT > 0) { endT -= dt; if (endT <= 0) { gameOver(); return; } }

    if (state === 'play' || state === 'menu' || state === 'count') {
      for (const p of paddles) {
        const v = p.cpu ? cpuThink(p, dt) : humanVelocity(p);
        p.vy = v;
        p.y = Math.max(p.h / 2, Math.min(S - p.h / 2, p.y + v * dt));
        p.glow = Math.max(0, p.glow - dt * 3);
      }
      if (state !== 'count') updateBall(dt);
    }

    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 20 * dt; }
    popups = popups.filter(p => p.life > 0);
  }

  /* ---------- desenho ---------- */
  // Dígitos blocados de 3×5, como nos placares dos anos 70.
  const DIGITS = [
    '111101101101111', '001001001001001', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111',
  ];
  function drawDigits(n, cx, cy, cell, color, alpha) {
    const str = String(n);
    const dw = cell * 3, gap = cell;
    const total = str.length * dw + (str.length - 1) * gap;
    ctx.save();
    upright(cx, cy);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    let x0 = -total / 2;
    for (const ch of str) {
      const pat = DIGITS[+ch];
      for (let i = 0; i < 15; i++) if (pat[i] === '1') ctx.fillRect(x0 + (i % 3) * cell, -cell * 2.5 + Math.floor(i / 3) * cell, cell + 0.5, cell + 0.5);
      x0 += dw + gap;
    }
    ctx.restore();
  }
  // Leva a origem para (x, y) da quadra e desfaz o giro, para textos ficarem de pé na tela.
  function upright(x, y) {
    ctx.translate(x, y);
    if (rot) ctx.rotate(Math.PI / 2);
  }
  function drawText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    upright(x, y);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, 0, 0);
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawPaddle(p) {
    ctx.save();
    ctx.shadowColor = p.color; ctx.shadowBlur = 16 + p.glow * 22;
    const x = p.x - PW / 2, y = p.y - p.h / 2;
    const g = ctx.createLinearGradient(x, 0, x + PW, 0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, p.color); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = p.glow > 0.5 ? '#ffffff' : g;
    ctx.fillRect(x, y, PW, p.h);
    ctx.restore();
  }

  function drawBall() {
    const rainbow = codes.has('KONAMI');
    // rastro
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i], a = (i + 1) / trail.length;
      const s = BS * (rainbow ? 0.3 + a * 0.9 : 0.4 + a * 0.6);
      ctx.fillStyle = rainbow ? `hsla(${t.hue % 360},100%,60%,${a * 0.7})` : `rgba(77,210,255,${a * 0.35})`;
      ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
    }
    if (ball.wait > 0 && Math.floor(time * 6) % 2 && state !== 'count') return;   // pisca antes do saque
    ctx.save();
    const c = ballColor();
    ctx.shadowColor = rainbow ? c : '#4dd2ff'; ctx.shadowBlur = 20;
    ctx.fillStyle = c;
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.spin * time * 4);                // gira quando tem efeito
    ctx.fillRect(-BS / 2, -BS / 2, BS, BS);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 16 : 0, sy = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 16 : 0;
    courtTransform(ctx, sx, sy);

    // placar gigante no alto da quadra, um de cada lado da rede
    const demo = state === 'menu';
    const cell = Math.min(16, S / 30);
    drawDigits(scores[0], L / 2 - 90, S * 0.2, cell, paddles[0].color, (demo ? 0.25 : 0.4) + scorePulse[0] * 0.6);
    drawDigits(scores[1], L / 2 + 90, S * 0.2, cell, paddles[1].color, (demo ? 0.25 : 0.4) + scorePulse[1] * 0.6);

    // brilho no gol de quem levou o ponto
    if (flashT > 0) {
      const gx = flashSide === 0 ? 0 : L - 120;
      const g = ctx.createLinearGradient(gx, 0, gx + 120, 0);
      const c = `rgba(255,59,92,${flashT * 1.6})`;
      if (flashSide === 0) { g.addColorStop(0, c); g.addColorStop(1, 'rgba(255,59,92,0)'); }
      else { g.addColorStop(0, 'rgba(255,59,92,0)'); g.addColorStop(1, c); }
      ctx.fillStyle = g; ctx.fillRect(gx, 0, 120, S);
    }

    for (const p of paddles) drawPaddle(p);
    if (ball) drawBall();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of popups) drawText(p.text, p.x, p.y, 20, p.color, Math.min(1, p.life * 2));

    if (state === 'count') {
      const n = Math.ceil(countT / 0.8);
      drawText(String(n), L / 2, S / 2, 90, '#4dd2ff', 0.4 + (countT % 0.8) / 0.8 * 0.6);
      const one = settings.mode === '1p';
      drawText(one ? 'VOCÊ' : 'J1', L * 0.2, S * 0.5, 22, paddles[0].color, 0.9);
      drawText(one ? 'CPU' : 'J2', L * 0.8, S * 0.5, 22, paddles[1].color, 0.9);
    } else if (state === 'play' && Math.max(...scores) === WIN - 1 && ball.wait > 0 && scores[0] !== scores[1]) {
      drawText('MATCH POINT', L / 2, S * 0.62, 24, '#ffd400', 0.9);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scan, 0, 0);
  }

  /* ---------- laço principal ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    pollPads();
    if (state !== 'pause') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- início ---------- */
  Arcade.bindMute($('muteBtn'));
  addEventListener('resize', resize);
  resize();
  syncMode();
  setupMatch(true);
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
