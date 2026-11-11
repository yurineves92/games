// Bolhas: atirador de bolhas neon numa grade hexagonal. Junte 3+ da mesma cor para estourar,
// derrube os cachos soltos (valem o dobro a cada bolha que cai) e não deixe o teto chegar no canhão.
// Cada cor tem um símbolo próprio, para dar para jogar mesmo sem distinguir as cores.
(() => {
  const W = 390, H = 660;                            // quadra lógica fixa (em pé, o formato natural)
  const R = 17, D = R * 2, COLS = 11;                // raio, diâmetro, bolhas por fileira (10 nas deslocadas)
  const RH = D * 0.866;                              // altura de cada fileira na grade hexagonal
  const FX0 = 8, FX1 = W - 8;                        // paredes laterais
  const XL = FX0 + R, XR = FX1 - R;                  // limites do centro da bolha em voo
  const CEIL0 = 26;                                  // teto na posição inicial
  const DEAD_Y = H - 112;                            // linha do canhão: passou daqui, fim de jogo
  const CX = W / 2, CY = H - 58;                     // canhão
  const NEXT_X = CX - 80, NEXT_Y = CY + 18;          // bolha seguinte
  const BOMB_X = CX + 80, BOMB_Y = CY + 18;          // estoque de bombas (código BOMBA)
  const SPEED = 1150;                                // velocidade do tiro (unidades/s)
  const MAX_A = 1.4;                                 // ângulo máximo da mira (rad, a partir da vertical)
  const HIT_D = D * 0.8;                             // distância de colisão (um pouco generosa nas frestas)
  const AIM_LEN = 330;                               // tamanho da mira normal
  const INF_MISSES = 5;                              // modo INFINITO: tiros perdidos para entrar uma fileira extra
  const TAU = Math.PI * 2;

  /* ---------- cores e especiais ---------- */
  // Cada cor tem um símbolo (acessibilidade para daltônicos).
  const COLORS = [
    { name: 'VERMELHO', c: '#ff3b5c', hi: '#ffc2cd', lo: '#7a0820', sym: 'tri' },
    { name: 'LARANJA', c: '#ff9a1f', hi: '#ffe0b8', lo: '#7a3a00', sym: 'dia' },
    { name: 'AMARELO', c: '#ffe234', hi: '#fffbd0', lo: '#7a6400', sym: 'star' },
    { name: 'VERDE', c: '#39ff7a', hi: '#d0ffe0', lo: '#06702c', sym: 'sq' },
    { name: 'CIANO', c: '#22d8ff', hi: '#d0f6ff', lo: '#005c7a', sym: 'ring' },
    { name: 'VIOLETA', c: '#b46bff', hi: '#ecdcff', lo: '#40107a', sym: 'plus' },
  ];
  const BOMB = 6, RAINBOW = 7, RAIO = 8, GRAY = 9;
  const SPECIAL_COLOR = { [BOMB]: '#ff5a3c', [RAINBOW]: '#ffffff', [RAIO]: '#7fe8ff' };
  const colorOf = t => (t < 6 ? COLORS[t].c : SPECIAL_COLOR[t] || '#888');

  /* ---------- as 10 fases desenhadas ---------- */
  // Fileiras pares têm 11 bolhas; as ímpares, deslocadas meia bolha para a direita, têm 10.
  // R vermelho, O laranja, Y amarelo, G verde, C ciano, V violeta, . vazio.
  const LEVELS = [
    { name: 'PRIMEIRO SOPRO', every: 8, rows: [
      'RRRYYYYYCCC', 'RRRYYYYCCC', 'CCCRRRRRYYY', 'CCRRRRRYYY', 'YYYCCCCCRRR', 'YYYCCCCRRR'] },
    { name: 'CORAÇÃO NEON', every: 8, rows: [
      '.OOO...OOO.', 'OORROORROO', 'ORYRRRRRRRO', 'ORYYRRRRRO', '.ORRRRRRRO.', '.ORRRRRRO.',
      '..ORRRRRO..', '...ORRO...', '....OOO....'] },
    { name: 'ONDA DE CHOQUE', every: 7, rows: [
      'CVVVCCCCCVV', 'VGGVVCCCVV', 'VGGGVVVVVGG', 'GCCGGVVVGG', 'GCCCGGGGGCC', 'CVVCCGGGCC', 'CVVVCCCCCVV'] },
    { name: 'XADREZ MALUCO', every: 7, rows: [
      'YYVVYYVVYYV', 'YYVVYYVVYY', 'VVYYVVYYVVY', 'VVYYVVYYVV', 'CCRRCCRRCCR', 'CCRRCCRRCC',
      'RRCCRRCCRRC', 'RRCCRRCCRR'] },
    { name: 'PIRÂMIDE PENDURADA', every: 6, rows: [
      '.....Y.....', '....YY....', '....OOO....', '...OGGO...', '...RRGRR...', '..RRCCRR..',
      '..VVRRRVV..', '.VVCCCCVV.', '.CCVVVVVCC.', 'CCVVGGVVCC'] },
    { name: 'INVASOR DE GELATINA', every: 6, rows: [
      'CCOOCCCOOCC', '..V....V..', '..VVVVVVV..', '.VVGVVGVV.', 'VVVRRRRRVVV', 'V.VVVVVV.V',
      'V.V.....V.V', '..RR..RR..'] },
    { name: 'ARCO-ÍRIS', every: 6, rows: [
      'YORRRRRRROY', 'YOORRRROOY', 'GYYOOOOOYYG', 'GYYYYYYYYG', 'CGGGYYYGGGC', 'CCGGGGGGCC',
      'VCCCCCCCCCV', 'VVVCCCCVVV'] },
    { name: 'SORRISO AMARELO', every: 5, rows: [
      '...VVRVV...', '.OYYYYYYO.', '.OYYYYYYYO.', 'OYYCYYCYYO', '.OYYYYYYYO.', 'OYYYYYYYYO',
      '.OYRYYYRYO.', '.OYRRRRYO.', '..OYYRYYO..'] },
    { name: 'JARDIM DE CRISTAL', every: 5, rows: [
      'CCVVCCCVVCC', 'VRRVYYVRRV', 'VRYRYCYRYRV', 'VRRVYYVRRV', 'GGGOOGOOGGG', 'GGOROOROGG',
      'GGGOOGOOGGG', 'VCCVGGVCCV', 'VCOCGYGCOCV', 'VCCVGGVCCV'] },
    { name: 'OLHO DO FURACÃO', every: 5, rows: [
      'OOORROOOYYG', 'ORRRRROOYY', 'RRRVVRROOYY', 'RVVVVVROOY', 'RVVCCVRROYY', 'VVCGGRROYY',
      'VVCGGYOOYYG', 'VCCGYYYYYG', 'VVCCGGYYGGG', 'VVCCGGGGGC', 'RVVCCCGGCCC'] },
  ];
  const RANDOM_NAMES = ['ZONA SURPRESA', 'BOLHAS SELVAGENS', 'CAOS COLORIDO', 'TEMPESTADE DE ESPUMA',
    'FÁBRICA DE SABÃO', 'AQUÁRIO DO CAOS', 'CHUVA DE CONFETE', 'ESPUMA RADIOATIVA'];
  const LETTER = { R: 0, O: 1, Y: 2, G: 3, C: 4, V: 5 };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const screen = $('screen'), wrap = $('gameWrap'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { score: $('hScore'), hi: $('hHi'), level: $('hLevel'), levelName: $('hLevelName'), ceil: $('hCeil'), ceilName: $('hCeilName'), status: $('hStatus') };

  /* ---------- configurações e códigos ---------- */
  const settings = { mode: 'fases' };
  Arcade.bindSettings(panels.menu, settings, 'bolhas_', () => syncMode());
  const codes = Arcade.codes('bolhas', {
    KONAMI: 'Mira completa: mostra o caminho inteiro, com todos os rebotes, até onde a bolha vai grudar',
    ARCOIRIS: 'A cada 5 tiros vem uma bolha coringa arco-íris',
    BOMBA: 'Cada fase começa com 3 bombas guardadas: aperte B (no controle, X) ou toque no ícone da bomba ao lado do canhão para carregar uma; aperte de novo para guardar',
  }, $('codeMount'));

  const hiKey = () => 'bolhas_hi_' + settings.mode;
  let hi = 0;
  function syncMode() {
    hi = +Arcade.store.get(hiKey(), 0) || 0;
    $('modeInfo').textContent = settings.mode === 'fases'
      ? '10 fases desenhadas à mão e depois fases-surpresa sem fim. Limpe a tela para avançar.'
      : 'Sem fases: o teto desce sozinho e fileiras novas entram sem parar, cada vez mais rápido.';
    updateHud();
  }

  /* ---------- tela ---------- */
  let k = 1;
  const bg = document.createElement('canvas');
  const scan = document.createElement('canvas');
  let sprites = [], soft = [];

  function resize() {
    k = Arcade.fit(canvas, W, H, wrap);
    buildBackground();
    buildScan();
    buildSprites();
  }

  function buildBackground() {
    bg.width = canvas.width; bg.height = canvas.height;
    const g = bg.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d0322'); sky.addColorStop(0.55, '#14052e'); sky.addColorStop(1, '#22063a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const neb = (x, y, r, c) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    };
    neb(W * 0.15, H * 0.3, 220, 'rgba(255,43,214,0.12)');
    neb(W * 0.9, H * 0.6, 240, 'rgba(34,216,255,0.09)');
    neb(W * 0.5, H, 260, 'rgba(180,107,255,0.14)');
    // colmeia bem apagada no fundo
    g.strokeStyle = 'rgba(255,43,214,0.045)'; g.lineWidth = 1;
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = FX0 + R + c * D + (r & 1 ? R : 0), y = CEIL0 + R + r * RH;
        if (y > DEAD_Y) break;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;
          g.lineTo(x + Math.cos(a) * R * 1.12, y + Math.sin(a) * R * 1.12);
        }
        g.closePath(); g.stroke();
      }
    }
    // área do canhão
    const fl = g.createLinearGradient(0, DEAD_Y, 0, H);
    fl.addColorStop(0, 'rgba(255,43,214,0.10)'); fl.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = fl; g.fillRect(0, DEAD_Y, W, H - DEAD_Y);
    g.strokeStyle = 'rgba(255,43,214,0.10)';
    for (let x = 0; x <= W; x += 26) { g.beginPath(); g.moveTo(x, DEAD_Y); g.lineTo(CX + (x - CX) * 1.8, H); g.stroke(); }
    // paredes laterais neon
    g.save();
    g.shadowColor = '#ff2bd6'; g.shadowBlur = 10 * k;
    g.strokeStyle = 'rgba(255,43,214,0.85)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(FX0 - 1, 0); g.lineTo(FX0 - 1, H); g.moveTo(FX1 + 1, 0); g.lineTo(FX1 + 1, H); g.stroke();
    g.restore();
    g.fillStyle = 'rgba(10,2,20,0.85)';
    g.fillRect(0, 0, FX0 - 2, H); g.fillRect(FX1 + 2, 0, W - FX1 - 2, H);
  }

  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.13)';
    const step = Math.max(2, Math.round(canvas.height / 300));
    for (let y = 0; y < scan.height; y += step) g.fillRect(0, y, scan.width, Math.max(1, step >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.35, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }

  /* ---------- bolhas pré-desenhadas (brilho, reflexo e símbolo) ---------- */
  const SP = D + 16;                                 // lado do sprite em unidades lógicas (bolha + brilho)

  function symbol(g, s, size) {
    g.beginPath();
    if (s === 'tri') {
      g.moveTo(0, -size); g.lineTo(size * 0.95, size * 0.7); g.lineTo(-size * 0.95, size * 0.7); g.closePath(); g.fill();
    } else if (s === 'dia') {
      g.moveTo(0, -size); g.lineTo(size * 0.8, 0); g.lineTo(0, size); g.lineTo(-size * 0.8, 0); g.closePath(); g.fill();
    } else if (s === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i & 1 ? size * 0.45 : size;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    } else if (s === 'sq') {
      g.rect(-size * 0.72, -size * 0.72, size * 1.44, size * 1.44); g.fill();
    } else if (s === 'ring') {
      g.arc(0, 0, size * 0.85, 0, TAU); g.arc(0, 0, size * 0.42, 0, TAU, true); g.fill();
    } else if (s === 'plus') {
      const t = size * 0.36;
      g.rect(-t, -size, t * 2, size * 2); g.rect(-size, -t, size * 2, t * 2); g.fill();
    } else if (s === 'bolt') {
      g.moveTo(size * 0.25, -size); g.lineTo(-size * 0.6, size * 0.15); g.lineTo(-size * 0.02, size * 0.15);
      g.lineTo(-size * 0.3, size); g.lineTo(size * 0.62, -size * 0.2); g.lineTo(size * 0.05, -size * 0.2); g.closePath(); g.fill();
    } else if (s === 'spark') {
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 4, rr = i & 1 ? size * 0.28 : size;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    }
  }

  function makeSprite(t) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(SP * k);
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, (SP / 2) * k, (SP / 2) * k);
    const body = (hiC, mid, lo, glow) => {
      g.save();
      g.shadowColor = glow; g.shadowBlur = 9 * k;
      const gr = g.createRadialGradient(-R * 0.35, -R * 0.4, 1, 0, 0, R);
      gr.addColorStop(0, hiC); gr.addColorStop(0.5, mid); gr.addColorStop(1, lo);
      g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, R - 0.5, 0, TAU); g.fill();
      g.restore();
    };
    if (t < 6) {
      const col = COLORS[t];
      body(col.hi, col.c, col.lo, col.c);
      g.fillStyle = 'rgba(20,0,36,0.55)';
      g.save(); g.translate(0, R * 0.06); symbol(g, col.sym, R * 0.46); g.restore();
    } else if (t === GRAY) {
      body('#8c8aa0', '#4a475c', '#1c1a26', '#000');
    } else if (t === BOMB) {
      body('#7d7590', '#2b2638', '#0b0912', '#ff5a3c');
      // tampinha e pavio
      g.fillStyle = '#9a93ad'; g.fillRect(-4, -R - 1, 8, 5);
      g.strokeStyle = '#ffd400'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -R); g.quadraticCurveTo(5, -R - 6, 9, -R - 3); g.stroke();
      g.fillStyle = '#ff5a3c';
      g.save(); g.translate(0, R * 0.08); symbol(g, 'spark', R * 0.5); g.restore();
    } else if (t === RAINBOW) {
      g.save();
      g.shadowColor = '#fff'; g.shadowBlur = 9 * k;
      for (let i = 0; i < 6; i++) {
        g.fillStyle = COLORS[i].c;
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 0.5, i * TAU / 6, (i + 1) * TAU / 6 + 0.02); g.closePath(); g.fill();
      }
      g.restore();
      const gr = g.createRadialGradient(-R * 0.3, -R * 0.35, 1, 0, 0, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R - 0.5, 0, TAU); g.fill();
      g.fillStyle = '#fff'; symbol(g, 'spark', R * 0.55);
    } else if (t === RAIO) {
      body('#ffffff', '#7fe8ff', '#103a8a', '#7fe8ff');
      g.fillStyle = '#ffe234'; g.strokeStyle = 'rgba(20,0,36,0.7)'; g.lineWidth = 1.2;
      symbol(g, 'bolt', R * 0.62); g.stroke();
    }
    // aro e reflexo
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, R - 1.3, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.78)';
    g.save(); g.translate(-R * 0.38, -R * 0.46); g.rotate(-0.6);
    g.beginPath(); g.ellipse(0, 0, R * 0.32, R * 0.16, 0, 0, TAU); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.arc(R * 0.42, R * 0.38, R * 0.09, 0, TAU); g.fill();
    return c;
  }

  function buildSprites() {
    sprites = [];
    for (let t = 0; t <= GRAY; t++) sprites[t] = makeSprite(t);
    // bolhas desfocadas do fundo
    soft = COLORS.map(col => {
      const c = document.createElement('canvas');
      const s = Math.max(8, Math.ceil(64 * k));
      c.width = c.height = s;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, col.c); gr.addColorStop(0.55, col.c + '55'); gr.addColorStop(1, col.c + '00');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      return c;
    });
  }

  function drawBubble(t, x, y, scale = 1, alpha = 1, rot = 0) {
    const s = SP * scale;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.drawImage(sprites[t], -s / 2, -s / 2, s, s);
      ctx.restore();
    } else ctx.drawImage(sprites[t], x - s / 2, y - s / 2, s, s);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /* ---------- grade hexagonal ---------- */
  let grid = [], par = 0, offset = 0;
  const shift = r => (r + par) & 1;                  // fileira deslocada meia bolha para a direita?
  const rowLen = r => (shift(r) ? COLS - 1 : COLS);
  const topY = () => CEIL0 + offset;
  const cellX = (r, c) => FX0 + R + c * D + (shift(r) ? R : 0);
  const cellY = r => topY() + R + r * RH;
  const emptyRow = () => new Array(COLS).fill(null);
  const valid = (r, c) => r >= 0 && c >= 0 && c < rowLen(r);
  const get = (r, c) => (r >= 0 && r < grid.length && valid(r, c) ? grid[r][c] : null);
  function ensureRow(r) { while (grid.length <= r) grid.push(emptyRow()); }

  function neighbors(r, c) {
    const out = [[r, c - 1], [r, c + 1]];
    const s = shift(r);
    for (const dr of [-1, 1]) {
      if (s) out.push([r + dr, c], [r + dr, c + 1]);
      else out.push([r + dr, c - 1], [r + dr, c]);
    }
    return out.filter(([rr, cc]) => valid(rr, cc));
  }

  // Grupo da mesma cor ligado à célula (r, c).
  function groupOf(r, c, color) {
    const seen = new Set([r * 16 + c]), out = [[r, c]];
    for (let i = 0; i < out.length; i++) {
      for (const [rr, cc] of neighbors(out[i][0], out[i][1])) {
        const id = rr * 16 + cc, b = get(rr, cc);
        if (!seen.has(id) && b && b.c === color) { seen.add(id); out.push([rr, cc]); }
      }
    }
    return out;
  }

  // Bolhas sem ligação com o teto (fileira 0).
  function floating() {
    const seen = new Set(), q = [];
    if (grid.length) for (let c = 0; c < rowLen(0); c++) if (grid[0][c]) { seen.add(c); q.push([0, c]); }
    for (let i = 0; i < q.length; i++) {
      for (const [rr, cc] of neighbors(q[i][0], q[i][1])) {
        const id = rr * 16 + cc;
        if (!seen.has(id) && get(rr, cc)) { seen.add(id); q.push([rr, cc]); }
      }
    }
    const out = [];
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < rowLen(r); c++) if (grid[r][c] && !seen.has(r * 16 + c)) out.push([r, c]);
    return out;
  }

  function colorsPresent() {
    const s = new Set();
    for (const row of grid) for (const b of row) if (b) s.add(b.c);
    return s;
  }
  function lowestRow() {
    for (let r = grid.length - 1; r >= 0; r--) if (grid[r].some(Boolean)) return r;
    return -1;
  }
  const isEmpty = () => lowestRow() < 0;
  function trimRows() { while (grid.length > 1 && !grid[grid.length - 1].some(Boolean)) grid.pop(); }

  // A bolha em (x, y) encosta em alguma da grade?
  function touching(x, y, dist = HIT_D, cb = null) {
    const r0 = Math.floor((y - topY() - R) / RH);
    let hit = false;
    for (let r = Math.max(0, r0 - 1); r <= r0 + 2 && r < grid.length; r++) {
      const c0 = Math.round((x - FX0 - R - (shift(r) ? R : 0)) / D);
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        const b = get(r, c);
        if (!b) continue;
        const dx = cellX(r, c) - x, dy = cellY(r) - y;
        if (dx * dx + dy * dy < dist * dist) { hit = true; if (cb) cb(r, c); else return true; }
      }
    }
    return hit;
  }

  // Célula vazia mais perto de onde a bolha parou (presa ao teto ou a uma vizinha).
  function snap(x, y) {
    const r0 = Math.max(0, Math.round((y - topY() - R) / RH));
    let best = null, bestD = Infinity, loose = null, looseD = Infinity;
    for (let r = Math.max(0, r0 - 1); r <= r0 + 1; r++) {
      const c0 = Math.round((x - FX0 - R - (shift(r) ? R : 0)) / D);
      for (let c = c0 - 2; c <= c0 + 2; c++) {
        if (!valid(r, c) || get(r, c)) continue;
        const dx = cellX(r, c) - x, dy = cellY(r) - y, d = dx * dx + dy * dy;
        const held = r === 0 || neighbors(r, c).some(([rr, cc]) => get(rr, cc));
        if (held && d < bestD) { bestD = d; best = [r, c]; }
        if (d < looseD) { looseD = d; loose = [r, c]; }
      }
    }
    return best || loose;
  }

  /* ---------- montagem das fases ---------- */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const bubble = c => ({ c, s: 1, b: 0 });

  function gridFromRows(rows) {
    par = 0; grid = [];
    rows.forEach((s, r) => {
      const row = emptyRow();
      for (let c = 0; c < rowLen(r); c++) { const v = LETTER[s[c]]; if (v !== undefined) row[c] = bubble(v); }
      grid.push(row);
    });
  }

  // Cor aleatória que tende a repetir a das vizinhas (cria cachos jogáveis).
  function clumpColor(r, c, pal, glue) {
    if (Math.random() < glue) {
      const ns = neighbors(r, c).map(([rr, cc]) => get(rr, cc)).filter(Boolean);
      if (ns.length) return Arcade.pick(ns).c;
    }
    return Arcade.pick(pal);
  }

  function randomGrid(rows, pal) {
    par = 0; grid = [];
    for (let r = 0; r < rows; r++) {
      grid.push(emptyRow());
      for (let c = 0; c < rowLen(r); c++) {
        // as últimas fileiras ganham buracos, como estalactites
        if (r >= rows - 2 && Math.random() < 0.3) continue;
        grid[r][c] = bubble(clumpColor(r, c, pal, 0.5));
      }
    }
    for (const [r, c] of floating()) grid[r][c] = null;
  }

  /* ---------- estado ---------- */
  let state = 'menu', pausedFrom = null;
  let mode = 'fases', level = 1, levelName = '', levelPal = [0, 1, 2], every = 8, shotsLeft = 8, drops = 0;
  let score = 0, combo = 0, bombs = 0, shotsInLevel = 0, ammoCount = 0, totalPops = 0, bestFall = 0;
  let cur = 0, next = 1, stash = null;               // bolha no canhão, a próxima, e a guardada quando entra uma bomba
  let aim = 0, ball = null, reload = 0, recoil = 0, swapT = 0;
  // modo INFINITO
  let scroll = 0, infLevel = 1, rowsAdded = 0, misses = 0, infTime = 0;
  // efeitos
  let particles = [], rings = [], pops = [], fallers = [], popups = [], bokeh = [];
  let time = 0, shakeT = 0, flashT = 0, flashColor = '#fff', banner = null, overT = 0, stateT = 0, clearBonus = 0;
  let dangerBeat = 0, dieStep = 0;

  // Sons do jogo; a demonstração atrás do menu fica muda.
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };

  function show(name) {
    overlay.hidden = !name;
    $('stage').classList.toggle('playing', !name);
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }

  function loadLevel(n) {
    level = n;
    if (n <= LEVELS.length) {
      const L = LEVELS[n - 1];
      gridFromRows(L.rows);
      levelName = L.name; every = L.every;
      levelPal = [...colorsPresent()];
    } else {
      // fases-surpresa: mais fileiras, mais cores e teto mais apressado a cada fase
      const extra = n - LEVELS.length;
      const rows = Math.min(11, 6 + Math.floor(extra / 2));
      const nc = Math.min(6, 4 + Math.floor(extra / 3));
      levelPal = shuffle([0, 1, 2, 3, 4, 5]).slice(0, nc);
      randomGrid(rows, levelPal);
      levelName = RANDOM_NAMES[(extra - 1) % RANDOM_NAMES.length];
      every = Math.max(3, 6 - Math.floor(extra / 3));
    }
    offset = 0; drops = 0; scroll = 0;
    shotsLeft = every; shotsInLevel = 0; combo = 0;
    bombs = codes.has('BOMBA') && state !== 'menu' ? 3 : 0;
    ball = null; stash = null; reload = 0.3;
    cur = gen(); next = gen();
    banner = { title: `FASE ${n}`, sub: levelName, t: 0, dur: 2.4 };
  }

  function startInfinite() {
    levelPal = [0, 1, 2, 3];
    randomGrid(7, levelPal);
    levelName = 'INFINITO'; level = 1;
    offset = 0; scroll = 0; infLevel = 1; rowsAdded = 0; misses = 0; infTime = 0;
    combo = 0; shotsInLevel = 0;
    bombs = codes.has('BOMBA') ? 3 : 0;
    ball = null; stash = null; reload = 0.3;
    cur = gen(); next = gen();
    banner = { title: 'INFINITO', sub: 'O TETO NÃO PARA!', t: 0, dur: 2.4 };
  }

  // Nova fileira entrando por cima (modo INFINITO).
  function pushRow() {
    par ^= 1;
    grid.unshift(emptyRow());
    const nc = Math.min(6, 4 + Math.floor((infLevel - 1) / 2));
    const pal = [0, 1, 2, 3, 4, 5].slice(0, nc);
    for (let c = 0; c < rowLen(0); c++) { const b = bubble(clumpColor(0, c, pal, 0.45)); b.s = 0; grid[0][c] = b; }
    rowsAdded++;
    const lv = 1 + Math.floor(rowsAdded / 6);
    if (lv > infLevel) {
      infLevel = lv;
      banner = { title: `NÍVEL ${infLevel}`, sub: 'O TETO ACELEROU!', t: 0, dur: 1.8 };
      if (codes.has('BOMBA') && state !== 'menu') bombs = 3;
      tone(523, 0.1, 'square', 0.08); tone(784, 0.16, 'square', 0.08, null, 0.1);
    }
    updateHud();
  }

  // Sorteia a próxima bolha do canhão (só cores que ainda existem na tela).
  function gen() {
    ammoCount++;
    if (codes.has('ARCOIRIS') && state !== 'menu' && ammoCount % 5 === 0) return RAINBOW;
    const lv = mode === 'infinito' && state !== 'menu' ? infLevel + 3 : level;
    if (lv >= 6) {
      const p = Math.min(0.09, 0.035 + (lv - 6) * 0.004);
      if (Math.random() < p) { const x = Math.random(); return x < 0.4 ? BOMB : x < 0.75 ? RAINBOW : RAIO; }
    }
    const pres = [...colorsPresent()];
    return Arcade.pick(pres.length ? pres : levelPal);
  }

  // Bolhas do canhão cuja cor sumiu da tela trocam por uma cor que ainda existe.
  function recolorAmmo() {
    const pres = [...colorsPresent()];
    if (!pres.length) return;
    const fix = t => (t !== null && t < 6 && !pres.includes(t) ? Arcade.pick(pres) : t);
    cur = fix(cur); next = fix(next); stash = fix(stash);
  }

  function start() {
    Sfx.ensure();
    mode = settings.mode;
    state = 'play'; stateT = 0;
    score = 0; totalPops = 0; bestFall = 0; ammoCount = 0;
    particles = []; rings = []; pops = []; fallers = []; popups = [];
    aim = 0;
    if (mode === 'fases') loadLevel(1); else startInfinite();
    show(null);
    updateHud();
    Sfx.beep(true);
  }

  function setupDemo() {
    mode = 'fases';
    score = 0;
    particles = []; rings = []; pops = []; fallers = []; popups = [];
    loadLevel(1 + ((Math.random() * LEVELS.length) | 0));
    banner = null;
  }

  function toMenu() {
    state = 'menu';
    setupDemo();
    show('menu');
    updateHud();
  }

  function togglePause() {
    if (state === 'play' || state === 'clear') { pausedFrom = state; state = 'pause'; show('pause'); }
    else if (state === 'pause') { state = pausedFrom; show(null); }
  }

  function gameOver() {
    state = 'over'; overT = 0;
    const cheated = codes.any();
    const rec = score > hi && !cheated;
    if (rec) { hi = score; Arcade.store.set(hiKey(), hi); }
    $('overTitle').textContent = 'A ESPUMA VENCEU!';
    $('overScore').textContent = score;
    $('overInfo').textContent = (mode === 'fases'
      ? `Chegou à fase ${level} (${levelName})`
      : `Nível ${infLevel} · ${rowsAdded} fileiras novas`) + ` · ${totalPops} bolhas estouradas · maior queda: ${bestFall}`;
    $('overRecord').hidden = !rec;
    Ranking.gameOver($('rankBox'), { board: 'bolhas-' + mode, score, cheated });
    show('over');
    updateHud();
  }

  function updateHud() {
    const demo = state === 'menu';
    const inf = (demo ? settings.mode : mode) === 'infinito';
    hud.score.textContent = demo ? 0 : score;
    hud.hi.textContent = hi;
    hud.levelName.textContent = inf ? 'NÍVEL' : 'FASE';
    hud.level.textContent = demo ? 1 : inf ? infLevel : level;
    hud.ceilName.textContent = inf ? 'FILEIRA EM' : 'TETO EM';
    hud.ceil.textContent = demo ? (inf ? INF_MISSES : LEVELS[0].every) : inf ? INF_MISSES - misses : shotsLeft;
    hud.status.textContent = inf ? 'INFINITO' : 'FASES';
  }

  /* ---------- efeitos ---------- */
  function burst(x, y, color, n, power = 180, size = 3) {
    for (let i = 0; i < n && particles.length < 320; i++) {
      const a = Math.random() * TAU, s = Arcade.rand(power * 0.25, power);
      const life = Arcade.rand(0.3, 0.7);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, max: life, color, size: Arcade.rand(size * 0.6, size * 1.4) });
    }
  }
  function popup(x, y, text, color = '#fff', size = 16, life = 1) {
    if (popups.length < 12) popups.push({ x, y, text, color, size, life, max: life });
  }

  // Estoura uma lista de células: tira da grade na hora, a animação vem em cascata.
  function popCells(list, comboN) {
    list.forEach(([r, c], i) => {
      const b = get(r, c);
      if (!b) return;
      pops.push({ x: cellX(r, c), y: cellY(r), t: b.c, delay: i * 0.035 });
      grid[r][c] = null;
      if (i < 18) {
        const f = 480 * Math.pow(2, (Math.min(comboN, 8) * 2 + Math.min(i, 14)) / 12);
        tone(f, 0.08, 'sine', 0.13, f * 1.9, i * 0.035);
        tone(f * 2, 0.025, 'square', 0.025, null, i * 0.035);
      }
    });
  }

  // Derruba o que ficou solto e devolve os pontos (20, 40, 80… dobra a cada bolha, até 1280).
  function dropFloating() {
    const list = floating();
    let pts = 0;
    list.forEach(([r, c], i) => {
      const b = grid[r][c];
      fallers.push({ x: cellX(r, c), y: cellY(r), vx: Arcade.rand(-60, 60), vy: Arcade.rand(-120, -20), t: b.c, rot: 0, vr: Arcade.rand(-3, 3) });
      grid[r][c] = null;
      pts += 20 * Math.pow(2, Math.min(i, 6));
    });
    if (list.length) {
      bestFall = Math.max(bestFall, list.length);
      tone(900, 0.45, 'triangle', 0.08, 160);
      if (list.length >= 5) { tone(1320, 0.3, 'sine', 0.06, 2000, 0.1); shakeT = Math.max(shakeT, 0.2); }
    }
    return { n: list.length, pts };
  }

  /* ---------- tiro ---------- */
  const canFire = () => (state === 'play' || state === 'menu') && !ball && reload <= 0;

  function fire() {
    if (!canFire()) return;
    ball = { x: CX, y: CY, dx: Math.sin(aim), dy: -Math.cos(aim), t: cur, zapped: 0, trail: [], onBounce: () => tone(520, 0.03, 'square', 0.04) };
    if (stash !== null) { cur = stash; stash = null; } else { cur = next; next = gen(); }
    swapT = 0.15; recoil = 1;
    shotsInLevel++;
    tone(320, 0.09, 'square', 0.07, 700);
    if (ball.t === RAIO) tone(1400, 0.4, 'sawtooth', 0.05, 300);
  }

  function swap() {
    if (state !== 'play' && state !== 'menu') return;
    [cur, next] = [next, cur];
    swapT = 0.15;
    tone(660, 0.05, 'square', 0.06); tone(990, 0.06, 'square', 0.05, null, 0.05);
  }

  // Código BOMBA: carrega uma bomba no canhão (a bolha atual fica guardada); de novo, guarda a bomba.
  function toggleBomb() {
    if (state !== 'play' || !codes.has('BOMBA')) return;
    if (cur === BOMB && stash !== null) { bombs++; cur = stash; stash = null; tone(400, 0.08, 'square', 0.06, 200); }
    else if (bombs > 0 && stash === null && cur !== BOMB) { bombs--; stash = cur; cur = BOMB; tone(200, 0.12, 'sawtooth', 0.08, 500); }
    swapT = 0.15;
  }

  // Move a bolha `dist` unidades em passinhos. Retorna 'ceil' ou 'hit' quando gruda, null se segue voando.
  function moveBall(b, dist, real) {
    const n = Math.max(1, Math.ceil(dist / 3)), step = dist / n;
    for (let i = 0; i < n; i++) {
      b.x += b.dx * step; b.y += b.dy * step;
      if (b.x < XL) { b.x = 2 * XL - b.x; b.dx = -b.dx; if (b.onBounce) b.onBounce(b); }
      else if (b.x > XR) { b.x = 2 * XR - b.x; b.dx = -b.dx; if (b.onBounce) b.onBounce(b); }
      if (b.y - R <= topY()) return 'ceil';
      if (b.t === RAIO) { if (real) zap(b); continue; }
      if (touching(b.x, b.y)) return 'hit';
    }
    return null;
  }

  // Bolha RAIO: atravessa tudo e estoura o que tocar no caminho.
  function zap(b) {
    touching(b.x, b.y, D * 0.92, (r, c) => {
      const bb = grid[r][c];
      pops.push({ x: cellX(r, c), y: cellY(r), t: bb.c, delay: 0 });
      grid[r][c] = null;
      const f = 600 * Math.pow(2, Math.min(b.zapped, 18) / 12);
      tone(f, 0.06, 'sine', 0.12, f * 1.8);
      b.zapped++;
    });
  }

  // Caminho da mira: lista de pontos (com os rebotes) e a célula onde a bolha vai grudar.
  function trace(angle, t, maxLen) {
    const pts = [[CX, CY]];
    const b = { x: CX, y: CY, dx: Math.sin(angle), dy: -Math.cos(angle), t, onBounce: bb => pts.push([bb.x, bb.y]) };
    let res = null, len = 0;
    while (len < maxLen && !res) { const d = Math.min(60, maxLen - len); res = moveBall(b, d, false); len += d; }
    pts.push([b.x, b.y]);
    return { pts, cell: res && t !== RAIO ? snap(b.x, b.y) : null };
  }

  // A bolha grudou: estouros, quedas, pontos, teto.
  function stick(b) {
    const cell = snap(b.x, b.y);
    if (!cell) return;
    const [r, c] = cell;
    ensureRow(r);
    let popped = 0;
    let t = b.t;
    const x = cellX(r, c), y = cellY(r);
    tone(170, 0.05, 'triangle', 0.1);
    for (const [rr, cc] of neighbors(r, c)) { const nb = get(rr, cc); if (nb) nb.b = 1; }

    if (t === BOMB) {
      // estoura tudo num raio de duas bolhas
      const list = [];
      for (let rr = Math.max(0, r - 2); rr <= r + 2 && rr < grid.length; rr++) {
        for (let cc = 0; cc < rowLen(rr); cc++) {
          if (!grid[rr][cc]) continue;
          const dx = cellX(rr, cc) - x, dy = cellY(rr) - y;
          if (dx * dx + dy * dy <= (D * 2.05) ** 2) list.push([rr, cc]);
        }
      }
      popCells(list, combo);
      popped = list.length;
      rings.push({ x, y, r: R, max: D * 2.6, t: 0, color: '#ff5a3c', w: 6 });
      burst(x, y, '#ffd400', 30, 320, 4);
      burst(x, y, '#ff5a3c', 24, 260, 3);
      shakeT = 0.4; flashT = 0.25; flashColor = '#ff5a3c';
      if (state !== 'menu') Sfx.explode();
    } else {
      if (t === RAINBOW) {
        // coringa: vira a cor que forma o maior grupo com as vizinhas
        let bestC = -1, bestN = -1;
        for (const [rr, cc] of neighbors(r, c)) {
          const nb = get(rr, cc);
          if (!nb || nb.c >= 6) continue;
          grid[r][c] = bubble(nb.c);
          const n = groupOf(r, c, nb.c).length;
          if (n > bestN) { bestN = n; bestC = nb.c; }
        }
        if (bestC < 0) bestC = Arcade.pick([...colorsPresent()].filter(v => v < 6).concat(levelPal));
        t = bestC;
        rings.push({ x, y, r: R, max: D * 1.6, t: 0, color: '#ffffff', w: 3 });
        [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.08, 'triangle', 0.06, null, i * 0.04));
      }
      grid[r][c] = bubble(t);
      grid[r][c].s = 0.6;
      const g = groupOf(r, c, t);
      if (g.length >= 3) { popCells(g, combo); popped = g.length; }
    }
    finishShot(popped, x, y);
  }

  function finishShot(popped, x, y) {
    let pts = popped * 10;
    const fall = popped ? dropFloating() : { n: 0, pts: 0 };
    pts += fall.pts;
    totalPops += popped + fall.n;
    if (popped || fall.n) {
      combo++;
      if (combo >= 2) {
        pts += 50 * (combo - 1);
        popup(x, y - 34, `COMBO x${combo}`, '#ffd400', 14, 1);
      }
      if (fall.n >= 3) popup(x, y - 14, `QUEDA! +${fall.pts}`, '#39ff7a', 18, 1.3);
      popup(x, y + 6, `+${pts}`, '#ffffff', 15, 0.9);
    } else {
      combo = 0;
      if (mode === 'fases') {
        shotsLeft--;
        if (shotsLeft <= 0) dropCeiling();
        else if (shotsLeft === 1) tone(220, 0.12, 'square', 0.06);
      } else {
        misses++;
        if (misses >= INF_MISSES) { misses = 0; pushRow(); shakeT = 0.3; flashT = 0.15; flashColor = '#ff2bd6'; noise(0.35, 0.25, 700); tone(90, 0.3, 'sawtooth', 0.1, 50); }
      }
    }
    if (state !== 'menu') score += pts;
    trimRows();
    recolorAmmo();
    reload = 0.08;
    checkClear();
    updateHud();
  }

  function dropCeiling() {
    drops++;
    shotsLeft = every;
    shakeT = 0.35; flashT = 0.15; flashColor = '#ff2bd6';
    noise(0.4, 0.3, 600); tone(90, 0.35, 'sawtooth', 0.12, 45);
    popup(W / 2, DEAD_Y - 20, 'O TETO DESCEU!', '#ff2bd6', 18, 1.1);
  }

  function checkClear() {
    if (!isEmpty()) return;
    if (mode === 'infinito' && state !== 'menu') {
      score += 3000;
      popup(W / 2, H * 0.4, 'TELA LIMPA! +3000', '#ffd400', 20, 1.6);
      Sfx.win();
      for (let i = 0; i < 4; i++) pushRow();
      return;
    }
    if (state === 'menu') { setupDemo(); return; }
    clearBonus = 1000 + 200 * level + Math.max(0, 40 - shotsInLevel) * 20;
    score += clearBonus;
    state = 'clear'; stateT = 0;
    banner = { title: 'FASE LIMPA!', sub: `BÔNUS +${clearBonus}`, t: 0, dur: 2.6 };
    Sfx.win();
    for (let i = 0; i < 4; i++) burst(Arcade.rand(60, W - 60), Arcade.rand(120, 360), COLORS[i].c, 18, 260, 3);
  }

  function die() {
    if (state === 'menu') { setupDemo(); return; }
    state = 'dying'; stateT = 0; ball = null;
    shakeT = 0.5; flashT = 0.3; flashColor = '#ff3b5c';
    Sfx.lose();
    noise(0.8, 0.3, 900);
  }

  /* ---------- entrada ---------- */
  const keys = { left: false, right: false };
  let keyHold = 0, aimTouch = null;

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
    if (state !== 'play' && state !== 'clear') return;
    if (key === 'arrowleft' || key === 'a') keys.left = true;
    if (key === 'arrowright' || key === 'd') keys.right = true;
    if (e.repeat) return;
    if (key === ' ' || key === 'arrowup' || key === 'w') fire();
    if (key === 'shift' || key === 'arrowdown' || key === 's' || key === 'c') swap();
    if (key === 'b') toggleBomb();
  });
  addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') keys.left = false;
    if (key === 'arrowright' || key === 'd') keys.right = false;
  });
  addEventListener('blur', () => { keys.left = keys.right = false; });

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function aimAt(p) {
    const dy = CY - p.y;
    const a = dy < 8 ? Math.sign(p.x - CX || 1) * MAX_A : Math.atan2(p.x - CX, dy);
    aim = Math.max(-MAX_A, Math.min(MAX_A, a));
  }
  const near = (p, x, y, rad) => Math.hypot(p.x - x, p.y - y) < rad;
  const onCannon = p => near(p, CX, CY, 40) || near(p, NEXT_X, NEXT_Y, 30);
  const onBombIcon = p => codes.has('BOMBA') && near(p, BOMB_X, BOMB_Y, 32);

  // O dedo pode mirar em qualquer lugar do palco (com o celular deitado sobra espaço dos lados).
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => {
    if ((state !== 'play' && state !== 'clear') || e.target.closest('.overlay')) return;
    Sfx.ensure();
    const p = toLogical(e);
    if (e.pointerType === 'mouse') {
      if (!screen.contains(e.target)) return;
      e.preventDefault();
      if (e.button === 2 || onCannon(p)) { swap(); return; }
      if (onBombIcon(p)) { toggleBomb(); return; }
      aimAt(p); fire();
      return;
    }
    e.preventDefault();
    if (aimTouch !== null) return;
    if (onCannon(p)) { swap(); return; }
    if (onBombIcon(p)) { toggleBomb(); return; }
    aimTouch = e.pointerId; aimAt(p);
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
  });
  stage.addEventListener('pointermove', e => {
    const p = toLogical(e);
    if (e.pointerId === aimTouch) { aimAt(p); return; }
    if (e.pointerType === 'mouse' && (state === 'play' || state === 'clear') && p.y < DEAD_Y + 20) aimAt(p);
  });
  const endTouch = e => {
    if (e.pointerId !== aimTouch) return;
    aimTouch = null;
    const p = toLogical(e);
    if (e.type === 'pointerup' && p.y < DEAD_Y + 8) fire();
  };
  stage.addEventListener('pointerup', endTouch);
  stage.addEventListener('pointercancel', endTouch);
  screen.addEventListener('contextmenu', e => e.preventDefault());

  const padPrev = { a: false, b: false, x: false, start: false };
  let padAx = 0, padAim = null;
  function pollPad() {
    const g = Arcade.gamepad(0);
    padAx = 0; padAim = null;
    if (!g) return;
    const play = state === 'play' || state === 'clear';
    const sx = g.lx || g.rx, sy = g.ly || g.ry;
    // analógico apontado para cima: mira direto naquela direção; para os lados ou direcional: gira
    if (Math.hypot(sx, sy) > 0.55 && sy < -0.35) padAim = Math.atan2(sx, -sy);
    else padAx = sx;
    if (g.a && !padPrev.a) {
      if (state === 'menu' || (state === 'over' && overT > 0.8)) start();
      else if (play) fire();
    }
    if (g.b && !padPrev.b && play) swap();
    const bx = g.x || g.y;
    if (bx && !padPrev.x && play) toggleBomb();
    if (g.start && !padPrev.start) togglePause();
    padPrev.a = g.a; padPrev.b = g.b; padPrev.x = bx; padPrev.start = g.start;
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
  document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'play' || state === 'clear')) togglePause(); });

  /* ---------- piloto automático (demonstração) ---------- */
  let demoT = 1, demoAim = null;
  function autopilot(dt) {
    if (!canFire()) return;
    if (demoAim === null) {
      demoT -= dt;
      if (demoT > 0) return;
      if (Math.random() < 0.12) swap();
      // testa vários ângulos e escolhe o que forma o maior grupo
      let best = 0, bestV = -Infinity;
      for (let a = -1.36; a <= 1.36; a += 0.034) {
        const tr = trace(a, cur, 1500);
        let v = Math.random() * 2;
        if (tr.cell && cur < 6) {
          const [r, c] = tr.cell;
          ensureRow(r);
          grid[r][c] = bubble(cur);
          const n = groupOf(r, c, cur).length;
          grid[r][c] = null;
          v += n >= 3 ? n * 10 : n * 3;
          v -= r * 0.4;
        }
        if (v > bestV) { bestV = v; best = a; }
      }
      trimRows();
      demoAim = best;
      return;
    }
    const d = demoAim - aim;
    aim += Math.sign(d) * Math.min(Math.abs(d), dt * 2.2);
    if (Math.abs(d) < 0.01) { fire(); demoAim = null; demoT = Arcade.rand(0.25, 0.7); }
  }

  /* ---------- atualização ---------- */
  function update(dt) {
    time += dt; stateT += dt;
    shakeT = Math.max(0, shakeT - dt);
    flashT = Math.max(0, flashT - dt);
    reload = Math.max(0, reload - dt);
    recoil = Math.max(0, recoil - dt * 5);
    swapT = Math.max(0, swapT - dt);
    if (state === 'over') overT += dt;
    if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }

    const live = state === 'play' || state === 'menu' || state === 'clear';
    if (state === 'menu') autopilot(dt);
    else if (state === 'play' || state === 'clear') {
      // mira pelo teclado/controle: começa devagar para o ajuste fino e acelera
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) || padAx;
      if (dir) { keyHold += dt; aim += dir * Math.min(2, 0.55 + keyHold * 2.2) * dt; }
      else keyHold = 0;
      if (padAim !== null) aim += (padAim - aim) * Math.min(1, dt * 14);
      aim = Math.max(-MAX_A, Math.min(MAX_A, aim));
    }

    if (live) {
      // teto
      if (mode === 'fases') {
        const target = drops * RH;
        if (offset < target) offset = Math.min(target, offset + 160 * dt);
      } else if (state !== 'menu') {
        infTime += dt;
        const interval = Math.max(3.2, 10 - (infLevel - 1) * 0.6);
        scroll += (RH / interval) * dt;
        if (scroll >= RH) { scroll -= RH; pushRow(); }
        offset = scroll;
      }
      // bolha em voo
      if (ball) {
        ball.trail.push(ball.x, ball.y);
        if (ball.trail.length > 16) ball.trail.splice(0, 2);
        const res = moveBall(ball, SPEED * dt, true);
        if (res) {
          const b = ball;
          ball = null;
          if (b.t === RAIO) {
            rings.push({ x: b.x, y: topY() + 4, r: 8, max: 60, t: 0, color: '#7fe8ff', w: 4 });
            burst(b.x, topY() + 6, '#7fe8ff', 16, 220);
            finishShot(b.zapped, b.x, Math.max(b.y, topY() + 40));
          } else stick(b);
        }
      }
      // perigo: alguma bolha passou da linha?
      const low = lowestRow();
      if (low >= 0 && state !== 'clear') {
        const bottom = cellY(low) + R;
        if (bottom > DEAD_Y) die();
        else if (bottom > DEAD_Y - RH * 1.5 && state === 'play') {
          dangerBeat -= dt;
          if (dangerBeat <= 0) { dangerBeat = 0.6; tone(150, 0.08, 'square', 0.05); }
        }
      }
    }

    if (state === 'clear' && stateT > 2.6) { state = 'play'; loadLevel(level + 1); updateHud(); }

    if (state === 'dying') {
      // as bolhas apagam de baixo para cima e despencam
      const low = lowestRow();
      dieStep -= dt;
      if (low >= 0 && stateT > 0.35 && dieStep <= 0) {
        dieStep = 0.06;
        for (let c = 0; c < rowLen(low); c++) {
          const b = grid[low][c];
          if (b) fallers.push({ x: cellX(low, c), y: cellY(low), vx: Arcade.rand(-40, 40), vy: Arcade.rand(-60, 0), t: GRAY, rot: 0, vr: Arcade.rand(-2, 2) });
          grid[low][c] = null;
        }
        if (Math.random() < 0.4) tone(Arcade.rand(120, 220), 0.06, 'triangle', 0.05);
      }
      if (stateT > 2.2) gameOver();
    }

    // animações da grade
    for (const row of grid) for (const b of row) if (b) { if (b.s < 1) b.s = Math.min(1, b.s + dt * 5); if (b.b > 0) b.b = Math.max(0, b.b - dt * 5); }

    for (const p of pops) {
      p.delay -= dt;
      if (p.delay <= 0 && !p.done) {
        p.done = true;
        const col = colorOf(p.t);
        burst(p.x, p.y, col, 6, 170, 3);
        rings.push({ x: p.x, y: p.y, r: R * 0.7, max: R * 1.7, t: 0, color: col, w: 3 });
      }
    }
    pops = pops.filter(p => !p.done);
    for (const f of fallers) { f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
    fallers = fallers.filter(f => {
      if (f.y < H + R) return true;
      if (particles.length < 260) burst(f.x, H - 4, colorOf(f.t), 3, 120, 2);
      return false;
    });
    for (const r of rings) r.t += dt * 4;
    rings = rings.filter(r => r.t < 1);
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + 260 * dt; }
    particles = particles.filter(p => p.life > 0);
    for (const p of popups) { p.life -= dt; p.y -= 30 * dt; }
    popups = popups.filter(p => p.life > 0);

    // bolhas desfocadas subindo no fundo
    for (const b of bokeh) {
      b.y -= b.vy * dt; b.x += Math.sin(time * b.w + b.ph) * 12 * dt;
      if (b.y < -b.r) Object.assign(b, newBokeh(), { y: H + 40 });
    }
  }

  function newBokeh() {
    return { x: Arcade.rand(0, W), y: Arcade.rand(0, H), r: Arcade.rand(12, 46), vy: Arcade.rand(12, 40), ci: (Math.random() * 6) | 0, a: Arcade.rand(0.08, 0.2), w: Arcade.rand(0.5, 1.5), ph: Math.random() * TAU };
  }
  for (let i = 0; i < 14; i++) bokeh.push(newBokeh());

  /* ---------- desenho ---------- */
  function drawText(text, x, y, size, color, alpha = 1, glow = 12) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = `900 ${size}px Orbitron, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.shadowColor = color; ctx.shadowBlur = glow * k;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawCeiling() {
    const y = topY();
    const g = ctx.createLinearGradient(0, 0, 0, y);
    g.addColorStop(0, '#1a0830'); g.addColorStop(1, '#3a1050');
    ctx.fillStyle = g; ctx.fillRect(FX0, 0, FX1 - FX0, y);
    // listras de prensa
    ctx.fillStyle = 'rgba(255,43,214,0.12)';
    for (let x = FX0 - 30 + ((y * 0.6) % 30); x < FX1; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14, y); ctx.lineTo(x + 14 + 12, y - 12); ctx.lineTo(x + 12, y - 12); ctx.fill();
    }
    ctx.save();
    ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 10 * k;
    ctx.fillStyle = '#ff2bd6'; ctx.fillRect(FX0, y - 3, FX1 - FX0, 3);
    ctx.restore();
    // luzinhas: tiros até o teto descer (ou tiros até a fileira extra no INFINITO)
    const total = mode === 'fases' ? every : INF_MISSES;
    const left = mode === 'fases' ? shotsLeft : INF_MISSES - misses;
    const py = Math.max(10, y - 12);
    for (let i = 0; i < total; i++) {
      const px = W / 2 + (i - (total - 1) / 2) * 16;
      const on = i < left;
      ctx.fillStyle = on ? (left <= 1 ? (Math.floor(time * 6) % 2 ? '#ff3b5c' : '#ffd400') : '#ffd400') : 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    }
  }

  function drawGrid() {
    const low = lowestRow();
    const danger = low >= 0 && cellY(low) + R > DEAD_Y - RH * 1.5;
    for (let r = 0; r < grid.length; r++) {
      const y = cellY(r);
      const shake = danger && r >= low - 1 ? Math.sin(time * 40 + r) * 0.8 : 0;
      for (let c = 0; c < rowLen(r); c++) {
        const b = grid[r][c];
        if (!b) continue;
        const sc = b.s * (1 + b.b * 0.07);
        drawBubble(b.c, cellX(r, c) + shake, y, sc);
      }
    }
    // bolhas que vão estourar (esperando a vez na cascata)
    for (const p of pops) drawBubble(p.t, p.x, p.y, 1 + Math.max(0, 0.15 - p.delay));
  }

  function drawAim() {
    if (state !== 'play' && state !== 'clear' && state !== 'menu') return;
    if (ball || reload > 0.05) return;
    const full = codes.has('KONAMI') && state !== 'menu';
    const tr = trace(aim, cur, full ? 4000 : AIM_LEN);
    const pts = tr.pts;
    const col = cur === RAINBOW ? `hsl(${(time * 300) % 360},100%,70%)` : colorOf(cur);
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const gap = 15, off = (time * 45) % gap;
    ctx.fillStyle = col;
    let seg = 0, acc = 0;
    for (let d = off + 28; d < total; d += gap) {
      while (seg < pts.length - 2 && acc + Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1]) < d) {
        acc += Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1]); seg++;
      }
      const [x0, y0] = pts[seg], [x1, y1] = pts[seg + 1];
      const L = Math.hypot(x1 - x0, y1 - y0) || 1, u = (d - acc) / L;
      ctx.globalAlpha = full ? 0.85 : Math.max(0, 0.9 - (d / total) * 0.7);
      ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 2.4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // KONAMI: fantasma da bolha onde ela vai grudar
    if (full && tr.cell) {
      const [r, c] = tr.cell;
      const x = cellX(r, c), y = cellY(r);
      drawBubble(cur < 6 ? cur : cur === BOMB ? BOMB : RAINBOW, x, y, 1, 0.35 + Math.sin(time * 8) * 0.1);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R + 2, 0, TAU); ctx.stroke();
    }
  }

  function drawCannon() {
    // linha do canhão
    const low = lowestRow();
    const danger = low >= 0 && cellY(low) + R > DEAD_Y - RH * 1.5;
    ctx.save();
    ctx.strokeStyle = danger && Math.floor(time * 5) % 2 ? '#ff3b5c' : 'rgba(255,43,214,0.55)';
    ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time * 20;
    ctx.beginPath(); ctx.moveTo(FX0, DEAD_Y); ctx.lineTo(FX1, DEAD_Y); ctx.stroke();
    ctx.restore();

    // cano girando
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(aim);
    const back = recoil * 6;
    const g = ctx.createLinearGradient(-11, 0, 11, 0);
    g.addColorStop(0, '#5a1a6a'); g.addColorStop(0.5, '#ff7ae6'); g.addColorStop(1, '#5a1a6a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-12, back); ctx.lineTo(-8, -48 + back); ctx.lineTo(8, -48 + back); ctx.lineTo(12, back); ctx.fill();
    ctx.fillStyle = '#ff2bd6'; ctx.fillRect(-10, -52 + back, 20, 6);
    ctx.restore();
    // base
    ctx.save();
    ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 12 * k;
    ctx.fillStyle = '#1d0830'; ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(CX, CY + 6, 30, Math.PI, 0); ctx.lineTo(CX + 38, H - 6); ctx.lineTo(CX - 38, H - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // bolha atual (desliza da posição da próxima ao trocar)
    const u = swapT / 0.15;
    const bx = CX + (NEXT_X - CX) * u, by = CY + (NEXT_Y - CY) * u;
    drawBubble(cur, bx, by, 1, 1, cur === RAINBOW ? time * 2 : 0);
    if (cur === BOMB) drawFuse(bx, by);
    // próxima
    drawBubble(next, NEXT_X, NEXT_Y, 0.72, 1, next === RAINBOW ? time * 2 : 0);
    ctx.font = '700 9px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(241,233,255,0.7)';
    ctx.fillText('PRÓXIMA', NEXT_X, NEXT_Y + 25);
    // setinhas de troca
    ctx.strokeStyle = 'rgba(255,43,214,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc((CX + NEXT_X) / 2 + 4, CY + 10, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc((CX + NEXT_X) / 2 + 4, CY + 10, 9, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    // estoque de bombas
    if (codes.has('BOMBA') && state !== 'menu') {
      ctx.globalAlpha = bombs > 0 ? 1 : 0.3;
      drawBubble(BOMB, BOMB_X, BOMB_Y, 0.72);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd400';
      ctx.font = '900 12px Orbitron, sans-serif';
      ctx.fillText(`x${bombs}`, BOMB_X + 24, BOMB_Y + 2);
      ctx.font = '700 9px Orbitron, sans-serif'; ctx.fillStyle = 'rgba(241,233,255,0.7)';
      ctx.fillText('BOMBA', BOMB_X, BOMB_Y + 25);
    }
  }

  function drawFuse(x, y) {
    const fx = x + 9, fy = y - R - 3;
    ctx.fillStyle = Math.floor(time * 20) % 2 ? '#ffd400' : '#ffffff';
    ctx.beginPath(); ctx.arc(fx + Arcade.rand(-1, 1), fy + Arcade.rand(-1, 1), 2.6, 0, TAU); ctx.fill();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    const sx = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0, sy = shakeT > 0 ? Arcade.rand(-1, 1) * shakeT * 14 : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    for (const b of bokeh) {
      ctx.globalAlpha = b.a;
      ctx.drawImage(soft[b.ci], b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    ctx.globalAlpha = 1;

    drawCeiling();
    drawAim();
    drawGrid();
    for (const f of fallers) drawBubble(f.t, f.x, f.y, 1, 1, f.rot);

    if (ball) {
      const tr = ball.trail, col = colorOf(ball.t);
      ctx.fillStyle = col;
      for (let i = 0; i < tr.length; i += 2) {
        ctx.globalAlpha = (i / tr.length) * 0.45;
        ctx.beginPath(); ctx.arc(tr[i], tr[i + 1], R * (0.3 + (i / tr.length) * 0.5), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawBubble(ball.t, ball.x, ball.y, 1, 1, ball.t === RAINBOW ? time * 8 : 0);
      if (ball.t === BOMB) drawFuse(ball.x, ball.y);
    }

    for (const r of rings) {
      ctx.globalAlpha = 1 - r.t;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - r.t) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * r.t, 0, TAU); ctx.stroke();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    drawCannon();

    for (const p of popups) drawText(p.text, p.x, p.y, p.size, p.color, Math.min(1, p.life * 2.5 / p.max), 8);

    if (banner && state !== 'menu') {
      const t = banner.t, a = Math.min(1, t * 4, (banner.dur - t) * 3);
      const yy = H * 0.42 - Math.max(0, 0.25 - t) * 120;
      ctx.fillStyle = `rgba(8,2,18,${0.6 * a})`;
      ctx.fillRect(0, yy - 46, W, 92);
      drawText(banner.title, W / 2, yy - 12, 30, '#ff2bd6', a, 16);
      drawText(banner.sub, W / 2, yy + 22, 15, '#ffd400', a, 8);
    }

    if (flashT > 0) {
      ctx.globalAlpha = flashT * 0.8;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scan, 0, 0);
  }

  /* ---------- legenda do menu ---------- */
  function buildLegend() {
    const box = $('legend');
    const items = [
      [BOMB, 'BOMBA: estoura tudo num raio de duas bolhas'],
      [RAINBOW, 'CORINGA: vira a cor do grupo que tocar'],
      [RAIO, 'RAIO: atravessa tudo em linha reta até o teto'],
    ];
    for (const [t, text] of items) {
      const c = document.createElement('canvas');
      const s = 26, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = c.height = s * dpr; c.style.width = c.style.height = s + 'px';
      c.getContext('2d').drawImage(sprites[t], 0, 0, s * dpr, s * dpr);
      const span = document.createElement('span');
      span.textContent = text;
      box.append(c, span);
    }
    const note = document.createElement('span');
    note.style.gridColumn = '1 / -1';
    note.textContent = 'Especiais aparecem a partir da fase 6. Cada cor tem seu símbolo: ▲ vermelho, ◆ laranja, ★ amarelo, ■ verde, ◎ ciano, ✚ violeta.';
    box.append(note);
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
  buildLegend();
  syncMode();
  setupDemo();
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
