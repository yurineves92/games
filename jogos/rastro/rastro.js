// Rastro de Luz: duelo de motos de luz numa grade neon. Cada moto anda sempre para a frente e deixa
// um muro de luz atrás; bateu em muro, rastro ou parede, explodiu. Quatro motos por rodada, quem
// vencer 5 rodadas leva a partida. Se a rodada demora, a arena encolhe; de vez em quando surge um item.
(() => {
  const CELL = 12;                                   // lado de cada casa da grade (unidades lógicas)
  const AREA = 2600;                                 // casas na arena (o formato acompanha a tela)
  const WIN = 5;                                     // rodadas para vencer a partida
  const SPEED = 10, TURBO_X = 1.75;                  // casas por segundo e multiplicador do turbo
  const TURBO_USE = 0.45, TURBO_GAIN = 0.1;          // gasto e recarga da barra de turbo por segundo
  const SHRINK_AT = 30, SHRINK_EVERY = 1.5;          // a arena encolhe após 30 s, um anel a cada 1,5 s
  const DEREZ = 0.9;                                 // tempo até o rastro de uma moto explodida sumir
  const COUNT = 2.4, END_T = 2.4;                    // contagem 3-2-1 e pausa entre rodadas
  const FAST = 2.5;                                  // acelera a rodada quando não sobra humano vivo
  const WALL = 9;
  const TAU = Math.PI * 2;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];      // direções: 0 cima, 1 direita, 2 baixo, 3 esquerda
  const COLORS = ['#00e5ff', '#ff2bd6', '#ffd400', '#39ff14'];
  // Pontos do ranking (só 1 jogador), todos multiplicados pela dificuldade (×1, ×2, ×3).
  const PTS = { sec: 10, kill: 150, item: 50, round: 500, match: 2000 };
  // CPU: casas que ela enxerga no flood-fill, chance de não ver o muro na cara, vontade de usar turbo,
  // se desvia da cabeça das outras motos.
  const AI = {
    facil: { flood: 24, blunder: 0.3, turbo: 0.15, avoid: false, mult: 1 },
    normal: { flood: 120, blunder: 0.08, turbo: 0.45, avoid: true, mult: 2 },
    dificil: { flood: 420, blunder: 0.015, turbo: 0.85, avoid: true, mult: 3 },
  };
  const DIFF_NAME = { facil: 'FÁCIL', normal: 'NORMAL', dificil: 'DIFÍCIL' };
  // Largada em cata-vento (ninguém começa de frente para ninguém): x, y relativos e direção.
  const STARTS = [[0.2, 0.5, 0], [0.8, 0.5, 2], [0.5, 0.2, 1], [0.5, 0.8, 3]];

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const stage = $('stage'), screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = {
    names: [0, 1, 2, 3].map(i => $('hN' + i)), dots: [0, 1, 2, 3].map(i => $('hD' + i)),
    score: $('hScore'), scoreWrap: $('hScoreWrap'), hi: $('hHi'), hiWrap: $('hHiWrap'), status: $('hStatus'),
  };

  /* ---------- configurações e códigos ---------- */
  const settings = { mode: '1p', diff: 'normal' };
  Arcade.bindSettings(panels.menu, settings, 'rastro_', () => syncMode());
  const codes = Arcade.codes('rastro', {
    KONAMI: 'As bordas da arena dão a volta para você',
    TURBO: 'Turbo infinito',
    FANTASMA: 'Você atravessa o próprio rastro',
  }, $('codeMount'));

  const hiKey = () => 'rastro_hi_' + settings.diff;
  let hi = 0;
  function syncMode() {
    $('diffOpt').hidden = settings.mode !== '1p';
    hi = +Arcade.store.get(hiKey(), 0) || 0;
    updateHud();
  }

  /* ---------- grade ---------- */
  let COLS = 64, ROWS = 40, W = COLS * CELL, H = ROWS * CELL, ready = false;
  let grid = new Uint8Array(COLS * ROWS);            // 0 livre, 1..4 rastro de cada moto, 9 parede
  let seen = new Int32Array(COLS * ROWS), queue = new Int32Array(COLS * ROWS), gen = 0;

  // Escolhe o formato da grade pela tela (deitada, quadrada ou em pé) com mais ou menos AREA casas.
  function chooseGrid() {
    const { w, h } = Arcade.innerSize(wrap);
    const a = Math.max(0.5, Math.min(2, (w || 4) / Math.max(1, h || 3)));
    const c = Math.max(36, Math.min(76, Math.round(Math.sqrt(AREA * a))));
    const r = Math.max(36, Math.min(76, Math.round(AREA / c)));
    if (c !== COLS || r !== ROWS || !ready) {
      ready = true;
      COLS = c; ROWS = r; W = COLS * CELL; H = ROWS * CELL;
      grid = new Uint8Array(COLS * ROWS);
      seen = new Int32Array(COLS * ROWS); queue = new Int32Array(COLS * ROWS); gen = 0;
      resize();
    }
  }

  const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const cx = i => (i % COLS + 0.5) * CELL;
  const cy = i => (((i / COLS) | 0) + 0.5) * CELL;
  const adjacent = (a, b) => {
    const ax = a % COLS, ay = (a / COLS) | 0, bx = b % COLS, by = (b / COLS) | 0;
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  };
  // Casa vizinha na direção d (−1 se sair da arena). Com wrap, as bordas dão a volta.
  function nextCell(x, y, d, wrapIt = false) {
    let nx = x + DX[d], ny = y + DY[d];
    if (wrapIt) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
    return inside(nx, ny) ? ny * COLS + nx : -1;
  }
  const free = i => i >= 0 && grid[i] === 0;

  // Quantas casas livres dá para alcançar a partir de i (para no limite): a "visão" da CPU.
  function flood(start, limit) {
    if (!free(start)) return 0;
    if (++gen > 2e9) { gen = 1; seen.fill(0); }
    seen[start] = gen; queue[0] = start;
    let head = 0, tail = 1, n = 0;
    while (head < tail && n < limit) {
      const i = queue[head++]; n++;
      const x = i % COLS, y = (i / COLS) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!inside(nx, ny)) continue;
        const j = ny * COLS + nx;
        if (grid[j] === 0 && seen[j] !== gen) { seen[j] = gen; queue[tail++] = j; }
      }
    }
    return n;
  }
  // Casas livres em linha reta a partir de i na direção d.
  function run(i, d, max) {
    let n = 0, x = i % COLS, y = (i / COLS) | 0;
    while (n < max) { const j = nextCell(x, y, d); if (!free(j)) break; n++; x += DX[d]; y += DY[d]; }
    return n;
  }

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');
  const scan = document.createElement('canvas');
  const trail = document.createElement('canvas'), tctx = trail.getContext('2d');

  function resize() {
    k = Arcade.fit(canvas, W, H, wrap);
    buildBackground();
    buildScan();
    trail.width = canvas.width; trail.height = canvas.height;
    rebuildTrails();
  }

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, '#04141d'); grad.addColorStop(1, '#010509');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // grade fina em cada casa e mais forte a cada 4
    g.lineWidth = 0.6;
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass ? 'rgba(0,229,255,0.16)' : 'rgba(0,229,255,0.055)';
      g.beginPath();
      for (let x = 0; x <= COLS; x++) if ((x % 4 === 0) === !!pass) { g.moveTo(x * CELL, 0); g.lineTo(x * CELL, H); }
      for (let y = 0; y <= ROWS; y++) if ((y % 4 === 0) === !!pass) { g.moveTo(0, y * CELL); g.lineTo(W, y * CELL); }
      g.stroke();
    }
    g.save();
    g.shadowColor = '#00e5ff'; g.shadowBlur = 12 * k;
    g.strokeStyle = 'rgba(0,229,255,0.85)'; g.lineWidth = 2.5;
    g.strokeRect(1.25, 1.25, W - 2.5, H - 2.5);
    g.restore();
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.14)';
    const step = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 240));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.3, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  // Os rastros ficam desenhados num canvas fora da tela: cada passo só acrescenta um segmento.
  function strokeTrail(g, color) {
    g.lineCap = 'square'; g.lineJoin = 'miter';
    g.strokeStyle = color; g.lineWidth = CELL * 0.42;
    g.shadowColor = color; g.shadowBlur = 7 * k;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.72)'; g.lineWidth = CELL * 0.13;
    g.stroke();
  }
  // Monta o caminho de uma moto, só com as casas que ainda são dela (o PULSO pode ter apagado algumas).
  function tracePath(g, b) {
    g.beginPath();
    let prev = -1;
    for (const i of b.path) {
      if (grid[i] !== b.id) { prev = -1; continue; }
      const x = cx(i), y = cy(i);
      if (prev >= 0 && adjacent(prev, i)) g.lineTo(x, y);
      else { g.moveTo(x, y); g.lineTo(x + 0.01, y); }
      prev = i;
    }
  }
  function rebuildTrails() {
    const g = tctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, trail.width, trail.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    for (const b of bikes) {
      if (!b.alive || !b.path.length) continue;
      tracePath(g, b);
      strokeTrail(g, b.color);
    }
    if (ring > 0) {
      // paredes que avançaram: faixa escura com brilho vermelho na borda de dentro
      const ix = ring * CELL, iy = ring * CELL, iw = Math.max(0, W - 2 * ix), ih = Math.max(0, H - 2 * iy);
      g.beginPath(); g.rect(0, 0, W, H); g.rect(ix, iy, iw, ih);
      g.fillStyle = '#14040b'; g.fill('evenodd');
      g.fillStyle = 'rgba(255,59,92,0.16)'; g.fill('evenodd');
      g.strokeStyle = 'rgba(255,59,92,0.12)'; g.lineWidth = 1;
      g.beginPath();
      for (let s = -H; s < W; s += CELL) { g.moveTo(s, H); g.lineTo(s + H, 0); }
      g.save();
      g.beginPath(); g.rect(0, 0, W, H); g.rect(ix, iy, iw, ih); g.clip('evenodd');
      g.beginPath();
      for (let s = -H; s < W; s += CELL) { g.moveTo(s, H); g.lineTo(s + H, 0); }
      g.stroke();
      g.restore();
      g.save();
      g.shadowColor = '#ff3b5c'; g.shadowBlur = 10 * k;
      g.strokeStyle = '#ff3b5c'; g.lineWidth = 2;
      g.strokeRect(ix, iy, iw, ih);
      g.restore();
    }
  }
  function drawSegment(b, from, to) {
    const g = tctx;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.beginPath();
    if (adjacent(from, to)) { g.moveTo(cx(from), cy(from)); g.lineTo(cx(to), cy(to)); }
    else { g.moveTo(cx(to), cy(to)); g.lineTo(cx(to) + 0.01, cy(to)); }    // deu a volta na borda
    strokeTrail(g, b.color);
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let phase = 'count', phaseT = 0, roundT = 0, round = 1, lastBeat = 0;
  let wins = [0, 0, 0, 0], roundWinner = null, endText = '', matchOver = false;
  let ring = 0, shrinkT = 0, item = null, itemT = 0;
  let particles = [], waves = [], popups = [];
  let time = 0, shakeT = 0, flashT = 0, overT = 0, hudT = 0;
  // pontuação do jogador no modo 1 jogador
  let aliveT = 0, kills = 0, roundsWon = 0, itemsTaken = 0, matchWon = false;
  const bikes = [0, 1, 2, 3].map(i => ({
    idx: i, id: i + 1, color: COLORS[i], name: '', human: false, player: -1, persona: 'cautelosa', cfg: AI.normal,
    x: 0, y: 0, dir: 0, moved: 0, turns: [], acc: 0, alive: true, deadT: 0, path: [],
    turbo: 1, boost: false, wrap: false, ghost: false, aiTurbo: 0, aiCool: 0,
  }));

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };
  const one = () => settings.mode === '1p';
  const playing = () => state === 'play';
  const names = () => (one() ? ['VOCÊ', 'NAVALHA', 'TATU', 'PIRADA'] : ['J1', 'J2', 'TATU', 'PIRADA']);

  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  // Quem pilota cada moto: na demo são 4 CPUs; no 1P você é o ciano; no 2P o J2 é o magenta.
  function configureBikes(demo) {
    const level = demo ? 'normal' : one() ? settings.diff : 'normal';
    const personas = ['cautelosa', 'agressiva', 'cautelosa', 'maluca'];
    const nm = demo ? ['RAIO', 'NAVALHA', 'TATU', 'PIRADA'] : names();
    for (const b of bikes) {
      b.human = !demo && (b.idx === 0 || (b.idx === 1 && !one()));
      b.player = b.human ? b.idx : -1;
      b.persona = personas[b.idx];
      b.cfg = AI[level];
      b.name = nm[b.idx];
    }
  }

  function setupMatch(demo) {
    configureBikes(demo);
    wins = [0, 0, 0, 0]; round = 1; matchOver = false;
    aliveT = 0; kills = 0; roundsWon = 0; itemsTaken = 0; matchWon = false;
    particles = []; waves = []; popups = [];
    setupRound();
  }

  function setupRound() {
    chooseGrid();
    grid.fill(0);
    ring = 0; shrinkT = 0; roundT = 0; item = null; itemT = Arcade.rand(5, 8);
    roundWinner = null; endText = '';
    const cheats = state !== 'menu';
    for (const b of bikes) {
      const [rx, ry, d] = STARTS[b.idx];
      b.x = Math.floor(rx * COLS); b.y = Math.floor(ry * ROWS);
      b.dir = b.moved = d; b.turns = []; b.acc = 0;
      b.alive = true; b.deadT = 0; b.turbo = 1; b.boost = false; b.aiTurbo = 0; b.aiCool = 0;
      b.wrap = b.human && cheats && codes.has('KONAMI');
      b.ghost = b.human && cheats && codes.has('FANTASMA');
      const c = b.y * COLS + b.x;
      grid[c] = b.id; b.path = [c];
    }
    phase = 'count'; phaseT = 0; lastBeat = 0;
    rebuildTrails();
    updateHud();
  }

  function start() {
    Sfx.ensure();
    state = 'play';
    setupMatch(false);
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
    if (state === 'play') { pausedFrom = state; state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
  }

  // Pontuação do ranking: (segundos vivo ×10 + abates ×150 + itens ×50 + rodadas vencidas ×500
  // + 2000 se vencer a partida) × multiplicador da dificuldade (1, 2 ou 3).
  function totalScore() {
    const base = Math.floor(aliveT * PTS.sec) + kills * PTS.kill + itemsTaken * PTS.item + roundsWon * PTS.round + (matchWon ? PTS.match : 0);
    return base * AI[settings.diff].mult;
  }
  const mult = () => AI[settings.diff].mult;

  function fmtTime(s) {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const champ = bikes.find(b => wins[b.idx] >= WIN) || bikes[0];
    const youWin = one() && champ.idx === 0;
    matchWon = youWin;
    $('overTitle').textContent = one() ? (youWin ? 'CAMPEÃO DA GRADE!' : `${champ.name} LEVOU A PARTIDA`) : `${champ.name} VENCEU!`;
    $('overVs').innerHTML = bikes.map(b => `<div style="--c:${b.color}">${b.name}<b>${wins[b.idx]}</b></div>`).join('');
    let rec = false;
    if (one()) {
      const sc = totalScore();
      const cheated = codes.any();
      rec = sc > hi && !cheated;
      if (rec) { hi = sc; Arcade.store.set(hiKey(), hi); }
      $('overScore').hidden = false;
      $('overScore').textContent = sc;
      $('overInfo').textContent = `CPU ${DIFF_NAME[settings.diff]} · ${roundsWon} ${roundsWon === 1 ? 'rodada' : 'rodadas'} · ${kills} ${kills === 1 ? 'abate' : 'abates'} · ${fmtTime(aliveT)} vivo`;
      Ranking.gameOver($('rankBox'), { board: 'rastro-' + settings.diff, score: sc, cheated });
    } else {
      $('overScore').hidden = true;
      $('overInfo').textContent = `${round} ${round === 1 ? 'rodada disputada' : 'rodadas disputadas'}. Revanche?`;
      $('rankBox').hidden = true;
      $('rankBox').innerHTML = '';
    }
    $('overRecord').hidden = !rec;
    show('over');
    if (!one() || youWin) Sfx.win(); else Sfx.lose();
    updateHud();
  }

  function updateHud() {
    const nm = names();
    const demo = state === 'menu';
    for (let i = 0; i < 4; i++) {
      const w = demo ? 0 : wins[i];
      hud.names[i].textContent = nm[i];
      hud.names[i].style.color = COLORS[i];
      hud.dots[i].textContent = '●'.repeat(w) + '○'.repeat(Math.max(0, WIN - w));
      hud.dots[i].style.color = COLORS[i];
    }
    hud.scoreWrap.hidden = !one();
    hud.hiWrap.hidden = !one();
    hud.score.textContent = demo ? 0 : totalScore();
    hud.hi.textContent = hi;
    hud.status.textContent = demo ? (one() ? `CPU ${DIFF_NAME[settings.diff]}` : '2 JOGADORES') : `RODADA ${round}`;
  }

  /* ---------- efeitos ---------- */
  function burst(x, y, color, n, power = 200, size = 3) {
    for (let i = 0; i < n && particles.length < 360; i++) {
      const a = Math.random() * TAU, s = Arcade.rand(power * 0.15, power);
      const life = Arcade.rand(0.3, 0.9);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: Arcade.rand(size * 0.6, size * 1.4) });
    }
  }
  function popup(x, y, text, color, life = 1.1) { popups.push({ x, y, text, color, life }); }

  /* ---------- motos ---------- */
  // Vira a moto: {abs: direção} (teclado, controle, deslize) ou {rel: ±1} (◄ ►, LB/RB).
  // A primeira virada vale na hora; as outras ficam na fila e valem uma por casa andada.
  function applyTurn(b, t) {
    const d = t.abs !== undefined ? t.abs : (b.dir + (t.rel > 0 ? 1 : 3)) % 4;
    if (d === b.dir || d === (b.moved + 2) % 4) return false;
    b.dir = d;
    tone(560 + b.idx * 90, 0.035, 'square', 0.045);
    return true;
  }
  function pushTurn(b, t) {
    if (!b || !b.alive || !playing() || phase === 'end') return;
    if (b.dir === b.moved && !b.turns.length) applyTurn(b, t);
    else if (b.turns.length < 3) b.turns.push(t);
  }

  function crash(b, killer) {
    if (!b.alive) return;
    b.alive = false; b.deadT = DEREZ; b.boost = false;
    const x = cx(b.y * COLS + b.x), y = cy(b.y * COLS + b.x);
    burst(x, y, b.color, 34, 260, 3.5);
    burst(x, y, '#ffffff', 10, 160, 2.5);
    waves.push({ x, y, r: 4, life: 0.6, color: b.color });
    shakeT = Math.max(shakeT, b.human ? 0.45 : 0.22);
    if (b.human) flashT = 0.3;
    noise(0.6, b.human ? 0.5 : 0.28, 2200);
    tone(170, 0.45, 'sawtooth', b.human ? 0.12 : 0.06, 40);
    // abate: a moto bateu no rastro do jogador (só conta no 1 jogador)
    if (killer && killer !== b && killer.idx === 0 && killer.human && one() && playing()) {
      kills++;
      popup(x, y - 14, `+${PTS.kill * mult()} ABATE!`, '#00e5ff');
      tone(990, 0.08, 'square', 0.07, null, 0.15); tone(1320, 0.12, 'square', 0.07, null, 0.23);
    }
    rebuildTrails();
  }

  // Depois do desfazer, as casas da moto explodida ficam livres de novo.
  function derez(b) {
    for (const i of b.path) if (grid[i] === b.id) grid[i] = 0;
    b.path = [];
    rebuildTrails();
  }

  function humanTurbo(b) {
    if (b.player === 0) return keys.Space || keys.ShiftLeft || (one() && keys.ShiftRight) || pads.turbo || gp[0].turbo;
    return keys.Enter || keys.NumpadEnter || keys.Slash || keys.NumpadDivide || keys.IntlRo || keys.ShiftRight || keys.slashKey || gp[1].turbo;
  }

  function simulate(dt) {
    for (const b of bikes) {
      if (!b.alive) continue;
      const inf = b.human && playing() && codes.has('TURBO');
      const want = b.human ? humanTurbo(b) : b.aiTurbo > 0;
      const was = b.boost;
      b.boost = !!want && (inf || b.turbo > 0.02);
      if (b.boost) { if (!inf) b.turbo = Math.max(0, b.turbo - TURBO_USE * dt); }
      else b.turbo = Math.min(1, b.turbo + TURBO_GAIN * dt);
      if (b.boost && !was && b.human) noise(0.35, 0.12, 900, 0, 'bandpass', 3000);
      b.acc += SPEED * (b.boost ? TURBO_X : 1) * dt;
      // faíscas atrás de quem está no turbo
      if (b.boost && Math.random() < 0.6 && particles.length < 360) {
        const i = b.y * COLS + b.x;
        particles.push({ x: cx(i) - DX[b.moved] * 5, y: cy(i) - DY[b.moved] * 5, vx: -DX[b.moved] * 80 + Arcade.rand(-40, 40), vy: -DY[b.moved] * 80 + Arcade.rand(-40, 40), life: 0.3, max: 0.3, color: b.color, size: 2 });
      }
    }
    // passos em rodadas: todas as motos que andam uma casa agora decidem e andam juntas (justo para todos)
    for (let guard = 0; guard < 12; guard++) {
      const movers = bikes.filter(b => b.alive && b.acc >= 1);
      if (!movers.length) break;
      for (const m of movers) if (!m.human) think(m);
      const targets = movers.map(m => nextCell(m.x, m.y, m.dir, m.wrap));
      const dead = new Set();
      movers.forEach((m, n) => {
        const t = targets[n];
        if (t < 0) { dead.add(m); return; }
        const g = grid[t];
        if (g !== 0 && !(m.ghost && g === m.id)) { dead.add(m); m.killer = g >= 1 && g <= 4 ? bikes[g - 1] : null; return; }
        // duas motos entrando na mesma casa: as duas explodem
        for (let o = 0; o < movers.length; o++) if (o !== n && targets[o] === t) { dead.add(m); m.killer = null; }
      });
      movers.forEach((m, n) => {
        if (dead.has(m)) { m.acc = 0; crash(m, m.killer); m.killer = null; return; }
        const t = targets[n], from = m.y * COLS + m.x;
        m.x = t % COLS; m.y = (t / COLS) | 0;
        grid[t] = m.id; m.path.push(t);
        drawSegment(m, from, t);
        m.acc -= 1;
        m.moved = m.dir;
        while (m.turns.length) if (applyTurn(m, m.turns.shift())) break;
        if (item && item.i === t) takeItem(m);
      });
      if (checkRoundEnd()) return;
    }
  }

  function checkRoundEnd() {
    const alive = bikes.filter(b => b.alive);
    if (alive.length > 1) return false;
    endRound(alive[0] || null);
    return true;
  }

  function endRound(winner) {
    phase = 'end'; phaseT = 0;
    roundWinner = winner;
    if (winner) {
      wins[winner.idx]++;
      endText = `${winner.name} VENCE A RODADA!`;
      const i = winner.y * COLS + winner.x;
      waves.push({ x: cx(i), y: cy(i), r: 6, life: 1.2, color: winner.color });
    } else endText = 'EMPATE! NINGUÉM PONTUA';
    matchOver = wins.some(w => w >= WIN);
    if (playing()) {
      if (one() && winner && winner.idx === 0) {
        roundsWon++;
        popup(W / 2, H / 2 + 46, `+${PTS.round * mult()} PONTOS`, '#00e5ff', 2);
      }
      const humanWon = winner && winner.human;
      if (humanWon || (!one() && !winner)) [523, 659, 784, 1047].forEach((f, n) => tone(f, 0.16, 'square', 0.1, null, n * 0.1));
      else [392, 330, 262].forEach((f, n) => tone(f, 0.2, 'triangle', 0.13, null, n * 0.13));
    }
    updateHud();
  }

  /* ---------- CPU ---------- */
  // Alvo da NAVALHA: um ponto à frente da moto rival mais próxima (prefere o humano).
  function chaseTarget(b) {
    let best = null, bd = Infinity;
    for (const o of bikes) {
      if (o === b || !o.alive) continue;
      const d = (Math.abs(o.x - b.x) + Math.abs(o.y - b.y)) * (o.human ? 0.6 : 1);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return null;
    const dist = Math.abs(best.x - b.x) + Math.abs(best.y - b.y);
    const lead = Math.max(2, Math.min(7, Math.round(dist / 3)));
    return { x: best.x + DX[best.moved] * lead, y: best.y + DY[best.moved] * lead, dist };
  }
  // Casa colada na cabeça de outra moto: perigo de batida de frente.
  function nearHead(b, i) {
    const x = i % COLS, y = (i / COLS) | 0;
    for (const o of bikes) if (o !== b && o.alive && Math.abs(o.x - x) + Math.abs(o.y - y) <= 1) return true;
    return false;
  }

  function think(b) {
    const c = b.cfg;
    const straight = nextCell(b.x, b.y, b.moved);
    // vacilo: às vezes a CPU não vê o muro bem na frente
    if (!free(straight) && Math.random() < c.blunder * (b.persona === 'maluca' ? 0.5 : 1)) { b.dir = b.moved; return; }
    const tgt = b.persona === 'agressiva' ? chaseTarget(b) : null;
    const need = Math.min(c.flood, b.persona === 'agressiva' ? 150 : 40);
    const wild = b.persona === 'maluca' && Math.random() < 0.06 ? (Math.random() < 0.5 ? 1 : 3) : 0;
    let best = -Infinity, bestD = b.moved, bestRun = 0;
    for (const turn of [0, 3, 1]) {
      const d = (b.moved + turn) % 4;
      const n = nextCell(b.x, b.y, d);
      if (!free(n)) continue;
      const space = flood(n, c.flood);
      const ahead = run(n, d, 12);
      let s = space >= need ? 1000 : space * 20;
      if (c.avoid && nearHead(b, n)) s -= 600;
      if (ahead < 1) s -= 60;                        // muro logo adiante: melhor virar já
      if (b.persona === 'cautelosa') s += space * 2 + ahead * 3 + (turn === 0 ? 4 : 0);
      else if (b.persona === 'agressiva') {
        if (tgt) s -= (Math.abs(tgt.x - n % COLS) + Math.abs(tgt.y - ((n / COLS) | 0))) * 6;
        if (turn === 0) s += b.aiCool > 0 ? 30 : 3;
        s += Math.min(ahead, 3) * 4 + Math.min(space, 200) * 0.6;
      } else {
        s += turn === 0 ? 50 : 0;
        if (turn === wild && ahead >= 4) s += 80;
        s += Math.min(space, 200) * 0.2;
        s += Math.random() * 10;
      }
      if (s > best) { best = s; bestD = d; bestRun = ahead; }
    }
    if (bestD !== b.moved) b.aiCool = 3; else if (b.aiCool > 0) b.aiCool--;
    b.dir = bestD;
    // turbo: a NAVALHA acelera para fechar, o TATU só em reta longa, a PIRADA quando dá na telha
    if (b.aiTurbo > 0) b.aiTurbo--;
    if (c.avoid && bestRun < 4) b.aiTurbo = 0;
    else if (b.aiTurbo === 0) {
      if (b.persona === 'agressiva' && tgt && tgt.dist < 16 && Math.random() < c.turbo * 0.2) b.aiTurbo = 6 + ((Math.random() * 8) | 0);
      else if (b.persona === 'cautelosa' && bestRun >= 10 && b.turbo > 0.8 && Math.random() < c.turbo * 0.03) b.aiTurbo = 8;
      else if (b.persona === 'maluca' && Math.random() < 0.015) b.aiTurbo = 10 + ((Math.random() * 15) | 0);
    }
  }

  /* ---------- arena que encolhe e itens ---------- */
  function addRing() {
    const max = Math.floor(Math.min(COLS, ROWS) / 2);
    if (ring >= max) return;
    const r = ring++;
    const wall = (x, y) => {
      const i = y * COLS + x;
      grid[i] = WALL;
      for (const b of bikes) if (b.alive && b.x === x && b.y === y) crash(b, null);
      if (item && item.i === i) item = null;
    };
    for (let x = r; x < COLS - r; x++) { wall(x, r); wall(x, ROWS - 1 - r); }
    for (let y = r; y < ROWS - r; y++) { wall(r, y); wall(COLS - 1 - r, y); }
    shakeT = Math.max(shakeT, 0.12);
    noise(0.25, 0.2, 500);
    tone(90, 0.25, 'sawtooth', 0.08, 50);
    rebuildTrails();
  }

  function spawnItem() {
    for (let tries = 0; tries < 80; tries++) {
      const m = ring + 2;
      const x = m + ((Math.random() * (COLS - 2 * m)) | 0), y = m + ((Math.random() * (ROWS - 2 * m)) | 0);
      if (!inside(x, y)) continue;
      const i = y * COLS + x;
      if (grid[i] !== 0) continue;
      if (bikes.some(b => b.alive && Math.abs(b.x - x) + Math.abs(b.y - y) < 6)) continue;
      item = { i, type: Math.random() < 0.62 ? 'carga' : 'pulso', life: 9 };
      tone(1400, 0.06, 'triangle', 0.05); tone(1800, 0.08, 'triangle', 0.05, null, 0.07);
      return;
    }
  }

  function takeItem(b) {
    const x = cx(item.i), y = cy(item.i);
    if (item.type === 'carga') {
      b.turbo = 1;
      popup(x, y - 14, '⚡ CARGA!', '#ffd400');
      burst(x, y, '#ffd400', 18, 180, 2.5);
    } else {
      // PULSO: apaga os rastros num raio de 5 casas (as cabeças e as paredes ficam)
      const ix = item.i % COLS, iy = (item.i / COLS) | 0;
      for (let yy = iy - 5; yy <= iy + 5; yy++) for (let xx = ix - 5; xx <= ix + 5; xx++) {
        if (!inside(xx, yy) || (xx - ix) ** 2 + (yy - iy) ** 2 > 30) continue;
        const j = yy * COLS + xx, g = grid[j];
        if (g >= 1 && g <= 4 && !bikes.some(o => o.alive && o.x === xx && o.y === yy)) grid[j] = 0;
      }
      waves.push({ x, y, r: 4, life: 0.5, color: '#ffffff', max: 5.5 * CELL });
      popup(x, y - 14, '✦ PULSO!', '#ffffff');
      burst(x, y, '#ffffff', 22, 260, 2.5);
      rebuildTrails();
    }
    if (b.human && one() && playing()) { itemsTaken++; popup(x, y + 6, `+${PTS.item * mult()}`, b.color, 0.9); }
    if (b.human) [880, 1175, 1568].forEach((f, n) => tone(f, 0.07, 'square', 0.06, null, n * 0.05));
    item = null;
  }

  /* ---------- entrada ---------- */
  const keys = {};
  const pads = { turbo: false };
  const gp = [{ dir: -1, a: false, start: false, lb: false, rb: false, turbo: false }, { dir: -1, a: false, start: false, lb: false, rb: false, turbo: false }];
  const humanBike = p => bikes.find(b => b.human && b.player === p) || null;
  const ABS = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3, ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };

  addEventListener('keydown', e => {
    const key = e.key.toLowerCase(), code = e.code;
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    const onButton = e.target.closest && e.target.closest('button');
    if (state === 'menu' || state === 'over') {
      if ((key === 'enter' || key === ' ') && !onButton && !e.repeat && (state === 'menu' || overT > 0.8)) start();
      return;
    }
    if (state !== 'play') return;
    if (key === 'enter') e.preventDefault();
    keys[code] = true;
    if (key === '/') keys.slashKey = true;
    if (e.repeat || !(code in ABS)) return;
    // 1 jogador: setas ou WASD movem você; 2 jogadores: WASD = J1, setas = J2
    const isArrow = code.startsWith('Arrow');
    pushTurn(humanBike(one() || !isArrow ? 0 : 1), { abs: ABS[code] });
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.key === '/') keys.slashKey = false; });
  addEventListener('blur', () => { for (const kk in keys) keys[kk] = false; pads.turbo = false; });

  // Botões na tela: ◄ ► viram (relativo à moto), TURBO enquanto segurar.
  function bindPadButton(el, onDown, onUp) {
    const down = e => {
      e.preventDefault(); Sfx.ensure();
      el.classList.add('down');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
      onDown();
    };
    const up = () => { el.classList.remove('down'); if (onUp) onUp(); };
    el.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  bindPadButton($('btnLeft'), () => pushTurn(humanBike(0), { rel: -1 }));
  bindPadButton($('btnRight'), () => pushTurn(humanBike(0), { rel: 1 }));
  bindPadButton($('btnTurbo'), () => { pads.turbo = true; }, () => { pads.turbo = false; });

  // Deslizar o dedo na tela aponta a moto na direção do deslize (vários deslizes no mesmo toque valem).
  // No 2 jogadores, a metade esquerda é do J1 e a direita do J2.
  const swipes = new Map();
  screen.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const player = !one() && e.clientX > r.left + r.width / 2 ? 1 : 0;
    swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, player });
    try { screen.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
  });
  screen.addEventListener('pointermove', e => {
    const s = swipes.get(e.pointerId);
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    pushTurn(humanBike(s.player), { abs: d });
    s.x = e.clientX; s.y = e.clientY;
  });
  const endSwipe = e => swipes.delete(e.pointerId);
  screen.addEventListener('pointerup', endSwipe);
  screen.addEventListener('pointercancel', endSwipe);

  // Controles físicos: direcional/analógico aponta (absoluto), LB/RB viram (relativo), A turbo.
  function pollPads() {
    for (let i = 0; i < 2; i++) {
      const g = Arcade.gamepad(i), p = gp[i];
      if (!g) { p.turbo = false; p.dir = -1; continue; }
      const ax = g.lx, ay = g.ly;
      let d = -1;
      if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.5) d = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 1 : 3) : (ay > 0 ? 2 : 0);
      const bike = humanBike(i);
      if (d >= 0 && d !== p.dir) pushTurn(bike, { abs: d });
      p.dir = d;
      if (g.lb && !p.lb) pushTurn(bike, { rel: -1 });
      if (g.rb && !p.rb) pushTurn(bike, { rel: 1 });
      p.turbo = g.a || g.rt || g.x;
      if (g.a && !p.a && (state === 'menu' || (state === 'over' && overT > 0.8))) start();
      if (g.start && !p.start) togglePause();
      p.a = g.a; p.start = g.start; p.lb = g.lb; p.rb = g.rb;
    }
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
  function update(dt) {
    time += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    if (state === 'over') overT += dt;

    if (state === 'menu' || state === 'play') {
      phaseT += dt;
      if (phase === 'count') {
        const beat = Math.ceil((COUNT - phaseT) / 0.8);
        if (beat !== lastBeat && beat > 0) { lastBeat = beat; if (state !== 'menu') Sfx.beep(false); }
        if (phaseT >= COUNT) { phase = 'run'; phaseT = 0; if (state !== 'menu') Sfx.beep(true); }
      } else if (phase === 'run') {
        const fast = state === 'play' && !bikes.some(b => b.human && b.alive);
        const sim = fast ? dt * FAST : dt;
        roundT += sim;
        if (state === 'play' && one() && bikes[0].alive) aliveT += sim;
        // a arena encolhe se a rodada demorar
        if (roundT >= SHRINK_AT) {
          shrinkT -= sim;
          if (shrinkT <= 0) { shrinkT = SHRINK_EVERY; addRing(); }
        } else if (roundT >= SHRINK_AT - 3 && Math.floor(roundT) !== Math.floor(roundT - sim)) tone(660, 0.12, 'square', 0.07);
        // itens raros
        if (item) { item.life -= sim; if (item.life <= 0) item = null; }
        else { itemT -= sim; if (itemT <= 0) { itemT = Arcade.rand(9, 14); spawnItem(); } }
        if (phase === 'run') simulate(sim);
        if (phase === 'run') checkRoundEnd();          // a parede também derruba motos
        for (const b of bikes) if (!b.alive && b.deadT > 0) { b.deadT -= sim; if (b.deadT <= 0) derez(b); }
        hudT -= dt;
        if (hudT <= 0) { hudT = 0.25; if (state === 'play') updateHud(); }
      } else if (phase === 'end') {
        for (const b of bikes) if (!b.alive && b.deadT > 0) { b.deadT -= dt; if (b.deadT <= 0) derez(b); }
        if (phaseT >= END_T) {
          if (matchOver) {
            if (state === 'menu') setupMatch(true);
            else gameOver();
          } else { round++; setupRound(); }
        }
      }
    }

    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
    particles = particles.filter(p => p.life > 0);
    for (const w of waves) { w.life -= dt; w.r += ((w.max || 90) - w.r) * Math.min(1, dt * 6); }
    waves = waves.filter(w => w.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 18 * dt; }
    popups = popups.filter(p => p.life > 0);
  }

  /* ---------- desenho ---------- */
  function drawText(text, x, y, size, color, alpha = 1, font = 'Orbitron, sans-serif', weight = 900) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = 12 * k;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Ponta da moto: anda suave entre as casas (a grade é por passos, o desenho não).
  function headPos(b) {
    const i = b.y * COLS + b.x;
    const f = b.alive && phase === 'run' ? Math.min(0.95, b.acc) : 0;
    return { x: cx(i) + DX[b.dir] * f * CELL, y: cy(i) + DY[b.dir] * f * CELL, i };
  }

  function drawBike(b) {
    const h = headPos(b);
    ctx.save();
    ctx.globalAlpha = b.ghost && b.alive ? 0.75 + Math.sin(time * 12) * 0.2 : 1;
    // pedacinho de rastro entre a última casa e a ponta
    ctx.shadowColor = b.color; ctx.shadowBlur = 12 * k;
    ctx.strokeStyle = b.color; ctx.lineWidth = CELL * 0.42; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(cx(h.i), cy(h.i)); ctx.lineTo(h.x, h.y); ctx.stroke();
    ctx.translate(h.x, h.y);
    ctx.rotate(b.dir * Math.PI / 2);
    const len = CELL * 1.15, wd = CELL * 0.7;
    if (b.boost) {
      ctx.fillStyle = b.color;
      ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.moveTo(-wd * 0.35, len * 0.45); ctx.lineTo(0, len * (0.9 + Math.random() * 0.6)); ctx.lineTo(wd * 0.35, len * 0.45); ctx.fill();
      ctx.globalAlpha /= 0.8;
    }
    ctx.fillStyle = b.color;
    ctx.fillRect(-wd / 2, -len / 2, wd, len);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-wd * 0.22, -len / 2, wd * 0.44, len * 0.45);
    ctx.restore();
  }

  function drawItem() {
    const x = cx(item.i), y = cy(item.i);
    const pulse = 1 + Math.sin(time * 8) * 0.15;
    const blink = item.life < 2.5 && Math.floor(time * 8) % 2;
    if (blink) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    const c = item.type === 'carga' ? '#ffd400' : '#ffffff';
    ctx.shadowColor = c; ctx.shadowBlur = 14 * k;
    ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.rotate(time * 2);
    ctx.strokeRect(-CELL * 0.75, -CELL * 0.75, CELL * 1.5, CELL * 1.5);
    ctx.rotate(-time * 2);
    ctx.fillStyle = c;
    if (item.type === 'carga') {
      // raio
      ctx.beginPath();
      ctx.moveTo(2, -7); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 7); ctx.lineTo(4, -1); ctx.lineTo(0, -1); ctx.closePath();
      ctx.fill();
    } else {
      // estrela de 4 pontas
      ctx.beginPath();
      for (let n = 0; n < 8; n++) {
        const a = n * Math.PI / 4, r = n % 2 ? 2 : 7;
        ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawTurboBars() {
    for (const b of bikes) {
      if (!b.human) continue;
      const bw = 84, bh = 7;
      const x = b.player === 0 ? 10 : W - 10 - bw, y = H - 16;
      const inf = playing() && codes.has('TURBO');
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - 2, y - 12, bw + 4, bh + 15);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = b.boost ? '#ffffff' : b.color;
      ctx.fillRect(x, y, bw * (inf ? 1 : b.turbo), bh);
      ctx.font = '10px "Share Tech Mono", monospace';
      ctx.textAlign = b.player === 0 ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = b.color;
      ctx.fillText((one() ? 'TURBO' : `TURBO ${b.name}`) + (inf ? ' ∞' : ''), b.player === 0 ? x : x + bw, y - 3);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0, sy = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0;
    ctx.drawImage(trail, sx * k, sy * k);
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    // aviso: a arena vai encolher
    const warn = phase === 'run' && roundT >= SHRINK_AT - 3 && roundT < SHRINK_AT;
    if (warn && Math.floor(time * 6) % 2) {
      ctx.strokeStyle = 'rgba(255,59,92,0.8)'; ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);
    }

    if (item) drawItem();

    // rastros se desfazendo (moto explodida)
    for (const b of bikes) {
      if (b.alive || b.deadT <= 0 || !b.path.length) continue;
      ctx.save();
      ctx.globalAlpha = (b.deadT / DEREZ) * (0.45 + Math.random() * 0.55);
      tracePath(ctx, b);
      ctx.lineCap = 'square';
      ctx.strokeStyle = Math.random() < 0.3 ? '#ffffff' : b.color; ctx.lineWidth = CELL * 0.42;
      ctx.stroke();
      ctx.restore();
    }

    for (const b of bikes) if (b.alive) drawBike(b);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const w of waves) {
      ctx.globalAlpha = Math.max(0, w.life * 1.6);
      ctx.strokeStyle = w.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (flashT > 0) { ctx.fillStyle = `rgba(255,59,92,${flashT * 0.5})`; ctx.fillRect(0, 0, W, H); }

    for (const p of popups) drawText(p.text, p.x, p.y, 13, p.color, Math.min(1, p.life * 2));

    const small = Math.min(W, H);
    if (phase === 'count') {
      const left = COUNT - phaseT;
      const n = Math.max(1, Math.ceil(left / 0.8));
      drawText(String(n), W / 2, H / 2, small * 0.2, '#00e5ff', 0.4 + ((left % 0.8) / 0.8) * 0.6);
      const decisive = wins.some(w => w === WIN - 1);
      drawText(decisive ? `RODADA ${round} · DECISIVA!` : `RODADA ${round}`, W / 2, H / 2 - small * 0.17, small * 0.055, decisive ? '#ffd400' : '#ffffff', 0.9);
      // quem é quem e para onde vai
      for (const b of bikes) {
        const h = headPos(b);
        ctx.save();
        ctx.translate(h.x, h.y); ctx.rotate(b.dir * Math.PI / 2);
        ctx.fillStyle = b.color; ctx.globalAlpha = 0.5 + Math.sin(time * 10) * 0.3;
        ctx.beginPath(); ctx.moveTo(0, -CELL * 2.6); ctx.lineTo(-CELL * 0.7, -CELL * 1.5); ctx.lineTo(CELL * 0.7, -CELL * 1.5); ctx.fill();
        ctx.restore();
        drawText(b.name, h.x, h.y + (b.dir === 2 ? -CELL * 1.6 : CELL * 1.8), b.human ? 13 : 10, b.color, b.human ? 1 : 0.75);
      }
    } else if (phase === 'run') {
      if (phaseT < 0.6) drawText('VAI!', W / 2, H / 2, small * 0.14, '#ffffff', 1 - phaseT / 0.6);
      if (warn) drawText('A ARENA VAI ENCOLHER!', W / 2, H * 0.14, small * 0.05, '#ff3b5c', 0.6 + Math.sin(time * 12) * 0.4);
      else if (roundT >= SHRINK_AT && roundT < SHRINK_AT + 2) drawText('ENCOLHENDO!', W / 2, H * 0.14, small * 0.05, '#ff3b5c', 1 - (roundT - SHRINK_AT) / 2);
      if (state === 'play' && !bikes.some(b => b.human && b.alive)) {
        drawText(one() ? 'VOCÊ CAIU! ACELERANDO O FIM DA RODADA...' : 'ACELERANDO O FIM DA RODADA...', W / 2, H - small * 0.1, small * 0.032, '#ffffff', 0.6 + Math.sin(time * 6) * 0.3, '"Share Tech Mono", monospace', 400);
      }
    } else if (phase === 'end') {
      const c = roundWinner ? roundWinner.color : '#ffffff';
      drawText(endText, W / 2, H / 2, small * 0.06, c, Math.min(1, phaseT * 4));
      if (matchOver) drawText('FIM DE PARTIDA', W / 2, H / 2 + small * 0.09, small * 0.04, '#ffd400', Math.min(1, phaseT * 2));
    }

    if (state !== 'menu') drawTurboBars();

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
  Arcade.setupPads(stage, $('padBtn'), () => { if (ready) resize(); });
  addEventListener('resize', () => {
    if (!ready) return;
    resize();
    // na demo (ou entre rodadas) a grade já se adapta ao novo formato da tela
    if (state === 'menu' && phase === 'count') setupRound();
  });
  syncMode();
  chooseGrid();
  setupMatch(true);
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
