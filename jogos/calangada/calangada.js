// CALANGADA: artilharia por turnos com equipes de calangos de capacete neon.
// O terreno é um bitmap destrutível: um Uint8Array com o material de cada ponto do mundo (0 = ar),
// usado na colisão, e um canvas fora da tela com a pintura. Explosões apagam círculos nos dois.
// A física roda em passo fixo de 1/60 s, e a CPU testa os tiros com a mesma função que move
// os projéteis de verdade (só que sem efeitos), espalhando a busca por vários quadros.
(() => {
  'use strict';

  /* ---------- constantes ---------- */
  const WW = 2400, WH = 1000;            // tamanho do mundo lógico
  const SEA0 = 880;                      // nível inicial do mar
  const STEP = 1 / 60;
  const TAU = Math.PI * 2;
  const GRAV = 600;
  const WIND_ACC = 170;                  // vento 1,0 = 170 unidades/s² nos projéteis leves
  const WALK = 52;
  const TURN_T = 45, RETREAT_T = 5;
  const CHARGE_T = 1.3;                  // segundos para a barra de força encher
  const V_MIN = 140, V_MAX = 920;
  const SD_ROUND = 8, SD_RISE = 32;      // morte súbita: da 8ª rodada em diante o mar sobe 32 por turno
  const PTS = { dmg: 10, kill: 300, win: 1500, surv: 500 };
  const MAX_PART = 420;
  const TEAM_COLORS = ['#00e5ff', '#ff2bd6', '#ffd400', '#ff7a1a'];
  const FAR_W = 2400, FAR_H = 700;
  // CPU: erro de ângulo (rad) e de força, quanto do vento ela leva em conta, tempo "pensando", chance de dar uma andada.
  const AI = {
    facil: { angErr: 0.15, powErr: 0.11, wind: 0.3, think: 1.5, wander: 0.15, mult: 1 },
    normal: { angErr: 0.075, powErr: 0.055, wind: 0.75, think: 1.1, wander: 0.25, mult: 2 },
    dificil: { angErr: 0.028, powErr: 0.02, wind: 1, think: 0.8, wander: 0.3, mult: 3 },
  };
  const DIFF_NAME = { facil: 'FÁCIL', normal: 'NORMAL', dificil: 'DIFÍCIL' };

  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const wrap = $('gameWrap'), stage = $('stage'), overlay = $('overlay');
  const panels = { menu: $('menuPanel'), pause: $('pausePanel'), over: $('overPanel') };
  const hud = { turn: $('hTurn'), weapon: $('hWeapon'), score: $('hScore'), scoreWrap: $('hScoreWrap'), hi: $('hHi'), hiWrap: $('hHiWrap'), status: $('hStatus') };

  /* ---------- utilitários ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = Arcade.rand, pick = Arcade.pick;
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const seeded = s => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* ---------- configurações e códigos ---------- */
  const settings = { mode: '1p', equipes: '2', humanos: '2', calangos: '3', cpu: 'normal', cenario: 'aleatorio' };
  const codes = Arcade.codes('calangada', {
    KONAMI: 'Munição infinita de todas as armas, até a Feijoada Atômica',
    SEMVENTO: 'Vento sempre zero',
    SUPERPULO: 'Pulo muito mais alto e sem dano de queda',
  }, $('codeMount'));

  /* ---------- nomes e falas ---------- */
  const NAMES = [
    'ZÉ CALANGO', 'DONA LAGARTIXA', 'TIÃO RABICHO', 'JUREMA', 'CALANGUINHO', 'SEU LAGARTO', 'DONA CAUDA', 'BILUCA',
    'TONHÃO', 'ZEZINHO DO MURO', 'MESTRE CALANGUIM', 'NEIDE NEON', 'RODINEI', 'JOELMA ESCAMOSA', 'VALDISNEI', 'KLEBER RABICHO',
    'CLEITON', 'SUELI', 'JUVENAL', 'TIA ZULMIRA', 'PEDRINHO SAPECA', 'LAGARTÃO', 'ESCAMINHA', 'DONA TELHA',
    'RABINHO DE OURO', 'MORMAÇO', 'CALORÃO', 'TÔ TORRANDO', 'BISCOITO', 'PASTEL', 'COXINHA', 'BRIGADEIRO',
    'PAÇOCA', 'PAMONHA', 'TAPIOCA', 'QUINDIM', 'RAPADURA', 'COCADA', 'CUSCUZ', 'SEU DITO',
    'VÓ CHIQUINHA', 'NENÉM', 'XEXÉU', 'ARIGÓ', 'CHICO RABO-FINO', 'SEVERINO', 'DONA CREUZA', 'GENIVALDO',
    'ROSINEIDE', 'WELLINGTON', 'JAQUELINE', 'LAGARTIXA NINJA', 'CALANGO DOIDO', 'TROVOADA', 'BOLINHO', 'FARINHA',
    'MANDIOCA', 'SOL A PINO', 'DONA ESCAMA', 'TICO-TICO',
  ];
  const TEAM_NAMES = ['CALANGOS DO SERTÃO', 'LAGARTIXAS DO ASFALTO', 'BONDE DO RABICHO', 'ESQUADRÃO CAJU', 'TURMA DO MORMAÇO', 'ESCAMAS DE NEON', 'OS PÉ-DE-PAREDE', 'FILHOS DO SOL'];
  const PH = {
    turn: ['BORA!', 'AGORA VAI!', 'SEGURA ESSA!', 'É HOJE!', 'CHEGOU A MINHA VEZ!', 'DEIXA COMIGO!', 'VOU MANDAR VER!', 'OLHA O PAI!'],
    hurt: ['AI!', 'UI!', 'MEU RABO!', 'ÔXE!', 'EITA!', 'VALEI-ME!', 'DOEU!', 'ARRE ÉGUA!', 'MINHA ESCAMA!'],
    die: ['FUI...', 'ADEUS, MAINHA!', 'ME ENTERRA NO SOL...', 'CONTA PRA MINHA VÓ...', 'VOU VIRAR LAGARTIXA DE PAREDE...'],
    kill: ['TOMA!', 'FREGUÊS!', 'VAI CHORAR?', 'É GOL!', 'CHUPA ESSA MANGA!', 'NEM VIU!'],
    miss: ['FOI O VENTO!', 'ERA DE PROPÓSITO!', 'ERREI FEIO...', 'TREINO É TREINO...'],
    self: ['FOGO AMIGO!', 'FOI MAL, PARÇA!', 'NÃO FOI EU!'],
    slap: ['VOLTA AQUI, MENINO!', 'PLAFT!', 'CHINELADA DE MÃE!'],
    crate: ['OBA!', 'PRESENTE!', 'É MEU!', 'CAIU DO CÉU!'],
    late: ['DEMOROU!', 'ACORDA, CALANGO!', 'TAVA COCHILANDO...'],
    pass: ['PASSO A VEZ!', 'HOJE NÃO...', 'VOU SÓ OBSERVAR.'],
  };

  /* ---------- armas ---------- */
  // kind: charge (segura e solta), shot (tiro reto), melee (chinelada), drop (larga no chão), target (escolhe o alvo), dig (cava).
  const WEAPONS = [
    { id: 'bazuca', name: 'BAZUCA DE BAMBU', short: 'BAZUCA', ammo: Infinity, kind: 'charge', desc: 'Foguete de bambu: segure FOGO para carregar e solte. O vento leva!' },
    { id: 'caju', name: 'GRANADA DE CAJU', short: 'CAJU', ammo: Infinity, kind: 'charge', fuse: true, desc: 'Quica no chão e explode quando o pavio acaba (1 a 5 s). O vento não pega.' },
    { id: 'coco', name: 'COCO-BOMBA', short: 'COCO', ammo: 2, kind: 'charge', desc: 'Explode no impacto e espalha 5 coquinhos explosivos para todo lado.' },
    { id: 'estilingue', name: 'ESTILINGUE DUPLO', short: 'ESTILINGUE', ammo: Infinity, kind: 'shot', desc: 'Dois tiros retos, sem força nem vento. Dá para mirar de novo entre um e outro.' },
    { id: 'chinelo', name: 'CHINELADA', short: 'CHINELO', ammo: Infinity, kind: 'melee', desc: 'Chinelo de mãe, colado no alvo. Não explode, mas manda o freguês longe (de preferência pro mar).' },
    { id: 'dinamite', name: 'DINAMITE JUNINA', short: 'DINAMITE', ammo: 1, kind: 'drop', desc: 'Larga aos seus pés com pavio de 5 s. Anarriê: corre que o arraiá vai pelos ares!' },
    { id: 'mangas', name: 'CHUVA DE MANGAS', short: 'MANGAS', ammo: 1, kind: 'target', desc: 'O urubu entregador solta 5 mangas explosivas sobre o ponto escolhido. O vento desvia.' },
    { id: 'pa', name: 'PÁ DO TATU', short: 'PÁ', ammo: 3, kind: 'dig', desc: 'Cava um túnel na direção da mira, reto ou inclinado. Ótimo para se esconder.' },
    { id: 'teleporte', name: 'TELETRANSPORTE', short: 'TELEPORTE', ammo: 2, kind: 'target', desc: 'Escolha um lugar vazio no mapa e apareça lá num piscar de olhos.' },
    { id: 'feijoada', name: 'FEIJOADA ATÔMICA', short: 'FEIJOADA', ammo: 0, kind: 'charge', legend: true, desc: 'LENDÁRIA! Só vem em caixa. A panela borbulha 3 s e... BUM! Ainda solta linguiças explosivas.' },
  ];
  const W_BY = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));
  // Projéteis: raio e dano da explosão, vento (0/1), se bate em calango, quique e pavio.
  const PROJ = {
    bazuca: { R: 42, dmg: 45, wind: 1, hit: true },
    caju: { R: 40, dmg: 42, bounce: 0.5 },
    coco: { R: 34, dmg: 30, hit: true },
    coquinho: { R: 22, dmg: 18, hit: true },
    dinamite: { R: 68, dmg: 75, bounce: 0.12, fuse: 5 },
    manga: { R: 30, dmg: 24, wind: 1, hit: true },
    feijoada: { R: 115, dmg: 80, bounce: 0.25, fuse: 3 },
    linguica: { R: 24, dmg: 16, hit: true },
  };
  const SLING = { R: 15, dmg: 22 }, SLAP = { dmg: 20, push: 560 };

  /* =====================================================================
     TERRENO
     ===================================================================== */
  const mat = new Uint8Array(WW * WH);
  const terr = document.createElement('canvas');
  terr.width = WW; terr.height = WH;
  const tctx = terr.getContext('2d');
  const far = document.createElement('canvas');
  far.width = FAR_W; far.height = FAR_H;
  const fctx = far.getContext('2d');

  const solid = (x, y) => x >= 0 && y >= 0 && x < WW && y < WH && mat[(y | 0) * WW + (x | 0)] !== 0;

  // Ferramentas de "desenho" na máscara de materiais.
  function mRect(x, y, w, h, m) {
    const x0 = clamp(Math.round(x), 0, WW), x1 = clamp(Math.round(x + w), 0, WW);
    const y0 = clamp(Math.round(y), 0, WH), y1 = clamp(Math.round(y + h), 0, WH);
    for (let yy = y0; yy < y1; yy++) mat.fill(m, yy * WW + x0, yy * WW + x1);
  }
  function mCircle(cx, cy, r, m) {
    for (let dy = -Math.ceil(r); dy <= r; dy++) {
      const yy = Math.round(cy + dy);
      if (yy < 0 || yy >= WH) continue;
      const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
      const x0 = clamp(Math.round(cx - dx), 0, WW), x1 = clamp(Math.round(cx + dx) + 1, 0, WW);
      if (x1 > x0) mat.fill(m, yy * WW + x0, yy * WW + x1);
    }
  }
  function mLine(x0, y0, x1, y1, r0, r1, m) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, Math.min(r0, r1) * 0.6)));
    for (let i = 0; i <= n; i++) { const t = i / n; mCircle(lerp(x0, x1, t), lerp(y0, y1, t), lerp(r0, r1, t), m); }
  }
  // Polígono qualquer, preenchido por linhas (regra par-ímpar).
  function mPoly(pts, m) {
    let ya = Infinity, yb = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { ya = Math.min(ya, pts[i]); yb = Math.max(yb, pts[i]); }
    const n = pts.length / 2, xs = [];
    for (let y = Math.max(0, Math.floor(ya)); y <= Math.min(WH - 1, Math.ceil(yb)); y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = clamp(Math.round(xs[i]), 0, WW), x1 = clamp(Math.round(xs[i + 1]), 0, WW);
        if (x1 > x0) mat.fill(m, y * WW + x0, y * WW + x1);
      }
    }
  }
  function fillColumns(top, m) {
    for (let x = 0; x < WW; x++) {
      const t = clamp(Math.round(top(x)), 0, WH);
      for (let y = t; y < WH; y++) mat[y * WW + x] = m;
    }
  }
  // Rebaixa o terreno nas pontas do mapa (vira ilha) e cria vales/canais suaves.
  const edgeDrop = (x, w = 260, depth = 480) => { const d = Math.min(x, WW - x); return d < w ? Math.pow(1 - d / w, 2) * depth : 0; };
  const dip = (x, c, w, depth) => { const u = Math.abs(x - c) / w; return u < 1 ? (0.5 + 0.5 * Math.cos(Math.PI * u)) * depth : 0; };

  // Rotina de pintura: cada material tem borda neon (top2), borda clara (top), cor do miolo (a→b com a profundidade).
  const mdef = (top2, top, a, b, o = {}) => ({
    top2: hex(top2), top: hex(top), a: hex(a), b: hex(b), under: o.under ? hex(o.under) : null,
    edge: o.edge ?? 6, fade: o.fade ?? 260, noise: o.noise ?? 0.12, pat: o.pat || null,
  });
  const PAT = {
    sand: (x, y) => 1 + 0.07 * Math.sin(y * 0.21 + Math.sin(x * 0.013) * 4),
    soil: (x, y) => 1 + 0.06 * Math.sin(y * 0.12 + Math.sin(x * 0.02) * 3) - ((x * 7 + y * 3) % 23 === 0 ? 0.25 : 0),
    rings: (x, y) => (y % 7 < 2 ? 0.76 : 1),
    bricks: (x, y) => ((y % 9 === 0) || ((x + (((y / 9) | 0) % 2) * 7) % 14 === 0) ? 0.8 : 1),
    hatch: (x, y) => (((x + y) % 16 < 2) || ((x - y + 4000) % 16 < 2) ? 0.72 : 1),
    stone: (x, y) => 1 + 0.12 * Math.sin(x * 0.07 + Math.sin(y * 0.05) * 2) * Math.cos(y * 0.04),
    facet: (x, y) => (((x - y + 4000) % 11) < 3 ? 1.35 : 1),
    crack: (x, y) => (((x * 13 + y * 7) % 97) < 2 ? 0.7 : 1),
  };

  /* ---------- os 5 cenários ---------- */
  function palm(x, y, h, lean, R) {
    const tx = x + lean * h, ty = y - h, qx = x + lean * h * 0.15, qy = y - h * 0.6;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      mCircle(u * u * x + 2 * u * t * qx + t * t * tx, u * u * y + 2 * u * t * qy + t * t * ty, lerp(5, 3.4, t), 3);
    }
    for (let j = 0; j < 6; j++) {
      const a = Math.PI + 0.25 + j * ((Math.PI - 0.5) / 5) + (R() - 0.5) * 0.2, L = 42 + R() * 14;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        mCircle(tx + Math.cos(a) * L * t, ty + Math.sin(a) * L * t * 0.55 + t * t * L * 0.5, 3.4 * (1 - t) + 1.1, 4);
      }
    }
    for (let j = 0; j < 3; j++) mCircle(tx - 4 + j * 4, ty + 5 + (j % 2) * 2, 3.6, 5);
  }
  function house(x, y, w, h, wall) {
    mRect(x, y, w, h, wall);
    mRect(x - 2, y, w + 4, 4, 17);
    const nw = Math.max(1, Math.floor((w - 8) / 15));
    for (let i = 0; i < nw; i++) if ((i + y) % 3 !== 1) mRect(x + 7 + i * 15, y + 11, 7, 8, 15);
  }
  function girder(x, y, len, ang, m) {
    const c = Math.cos(ang), s = Math.sin(ang), t = 6;
    mPoly([x - s * t, y + c * t, x + c * len - s * t, y + s * len + c * t, x + c * len + s * t, y + s * len - c * t, x + s * t, y - c * t], m);
  }
  function crystal(x, y, size, ang, m) {
    const c = Math.cos(ang), s = Math.sin(ang), w = size * 0.32;
    const P = (u, v) => [x + c * u - s * v, y + s * u + c * v];
    mPoly([...P(-4, -w), ...P(size * 0.7, -w), ...P(size, 0), ...P(size * 0.7, w), ...P(-4, w)], m);
  }

  const THEMES = {
    praia: {
      name: 'PRAIA DE NEON', grav: 1, windK: 1, air: true,
      info: 'Duas ilhas de areia separadas por um canal, com coqueiros que viram torre de tiro. Cuidado com o canal do meio!',
      sky: ['#12052e', '#3d0f5c', '#a3206e', '#ff6f6f', '#ffb35c'], sea: '0,229,255', burn: '#ff4fd8',
      debris: ['#e2a75e', '#ffe7a3', '#ff4fd8'],
      mats: {
        1: mdef('#ff4fd8', '#ffe7a3', '#e2a75e', '#7a3b2e', { pat: PAT.sand, fade: 300 }),
        3: mdef('#c99257', '#b07a42', '#946232', '#5e3a1c', { edge: 2, fade: 40, pat: PAT.rings }),
        4: mdef('#c6ff9a', '#6dff3a', '#2fd11a', '#14700a', { edge: 2, fade: 20, noise: 0.18 }),
        5: mdef('#8a5a30', '#7a4a24', '#5a3418', '#3d220f', { edge: 1, fade: 10 }),
      },
      gen(R) {
        const p = [R() * TAU, R() * TAU, R() * TAU];
        const gx = WW / 2 + (R() - 0.5) * 300;
        const top = x => 565 + 55 * Math.sin(x * 0.0042 + p[0]) + 24 * Math.sin(x * 0.011 + p[1]) + 8 * Math.sin(x * 0.031 + p[2]) + edgeDrop(x) + dip(x, gx, 170, 560);
        fillColumns(top, 1);
        for (let i = 0; i < 9; i++) {
          const x = 140 + R() * (WW - 280), t = top(x);
          if (t > SEA0 - 90 || Math.abs(x - gx) < 210) continue;
          palm(x, t + 6, 85 + R() * 60, (R() < 0.5 ? -1 : 1) * (0.12 + R() * 0.25), R);
        }
      },
      bg(g, R) {
        // sol listrado de fim de tarde
        const sg = g.createLinearGradient(0, 200, 0, 660);
        sg.addColorStop(0, '#fff27a'); sg.addColorStop(0.5, '#ff8a5c'); sg.addColorStop(1, '#ff2bd6');
        g.fillStyle = sg; g.beginPath(); g.arc(1200, 470, 240, 0, TAU); g.fill();
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 9; i++) g.fillRect(900, 470 + i * 22, 600, 3 + i * 1.3);
        g.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.5})`; g.fillRect(R() * FAR_W, R() * 260, 2, 2); }
        g.fillStyle = '#2a0b3d';
        for (let i = 0; i < 6; i++) {
          const cx = R() * FAR_W, w = 160 + R() * 260, h = 30 + R() * 50;
          g.beginPath(); g.ellipse(cx, 690, w, h, 0, Math.PI, 0); g.fill();
          for (let j = 0; j < 3; j++) {
            const px = cx + (R() - 0.5) * w, py = 690 - h * 0.7;
            g.fillRect(px, py - 50, 3, 52);
            for (let a = 0; a < 5; a++) { g.beginPath(); g.ellipse(px + Math.cos(a * 1.3) * 12, py - 52 + Math.sin(a * 1.3) * 3, 14, 3, a * 1.3, 0, TAU); g.fill(); }
          }
        }
        g.fillStyle = 'rgba(0,229,255,0.5)'; g.fillRect(0, 688, FAR_W, 2);
      },
    },
    favela: {
      name: 'FAVELA FLUORESCENTE', grav: 1, windK: 1, air: true,
      info: 'Um morrão de casinhas coloridas empilhadas. As lajes são ótimas trincheiras, mas as encostas terminam no mar.',
      sky: ['#02010a', '#0c0830', '#1d0f4a', '#3a1462'], sea: '190,80,255', burn: '#7dff3a',
      debris: ['#a8553a', '#ff6fae', '#5fe6ff', '#ffe066'],
      mats: {
        1: mdef('#7dff3a', '#4fd12a', '#a8553a', '#3a1820', { edge: 7, pat: PAT.soil }),
        10: mdef('#ff6fae', '#ff6fae', '#ff6fae', '#a83a6e', { edge: 0, fade: 400, pat: PAT.bricks, noise: 0.06 }),
        11: mdef('#5fe6ff', '#5fe6ff', '#5fe6ff', '#2a7a99', { edge: 0, fade: 400, pat: PAT.bricks, noise: 0.06 }),
        12: mdef('#ffe066', '#ffe066', '#ffe066', '#a8862a', { edge: 0, fade: 400, pat: PAT.bricks, noise: 0.06 }),
        13: mdef('#9dff6a', '#9dff6a', '#9dff6a', '#4a8a2a', { edge: 0, fade: 400, pat: PAT.bricks, noise: 0.06 }),
        14: mdef('#c79bff', '#c79bff', '#c79bff', '#6a4a99', { edge: 0, fade: 400, pat: PAT.bricks, noise: 0.06 }),
        15: mdef('#fff7c2', '#fff2a8', '#fff2a8', '#ffd84a', { edge: 1, fade: 8, noise: 0 }),
        17: mdef('#d8d4e0', '#a8a4b8', '#8a8699', '#55526a', { edge: 2, fade: 30, pat: PAT.crack }),
        18: mdef('#8ab4ff', '#3b7bff', '#2a5ad0', '#1a3a90', { edge: 2, fade: 12 }),
      },
      gen(R) {
        const p = [R() * TAU, R() * TAU];
        const cx = WW / 2 + (R() - 0.5) * 300;
        const top = x => 310 + Math.pow(Math.abs(x - cx) / (WW * 0.52), 1.5) * 540 + 16 * Math.sin(x * 0.013 + p[0]) + 8 * Math.sin(x * 0.04 + p[1]) + edgeDrop(x, 200, 400);
        fillColumns(top, 1);
        let x = 110 + R() * 40;
        while (x < WW - 150) {
          const w = Math.round(46 + R() * 34);
          const t0 = top(x), t1 = top(x + w), lowG = Math.max(t0, t1, top(x + w / 2));
          if (lowG < SEA0 - 50 && R() < 0.85) {
            let base = Math.round(Math.min(t0, t1)) + 3;
            mRect(x + 3, base, w - 6, lowG - base + 6, 17);
            const floors = 1 + Math.floor(R() * (Math.abs(x - cx) < 500 ? 3 : 2));
            for (let f = 0; f < floors; f++) {
              const hgt = Math.round(30 + R() * 16), off = Math.round((R() - 0.5) * 12);
              const ww = f ? w - 6 - Math.abs(off) : w;
              house(x + (f ? 3 + Math.max(0, off) : 0), base - hgt, ww, hgt, 10 + Math.floor(R() * 5));
              base -= hgt;
            }
            if (R() < 0.45) mRect(x + w * 0.55, base - 11, 13, 11, 18);
          }
          x += w + 4 + R() * 26;
        }
      },
      bg(g, R) {
        for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + R() * 0.6})`; g.fillRect(R() * FAR_W, R() * 420, 1.5, 1.5); }
        const mg = g.createRadialGradient(1750, 150, 10, 1750, 150, 140);
        mg.addColorStop(0, 'rgba(255,247,214,0.5)'); mg.addColorStop(1, 'rgba(255,247,214,0)');
        g.fillStyle = mg; g.fillRect(1600, 0, 300, 300);
        g.fillStyle = '#fff7d6'; g.beginPath(); g.arc(1750, 150, 46, 0, TAU); g.fill();
        for (const [base, col, lights] of [[470, '#160b2e', 260], [560, '#0e0720', 200]]) {
          g.fillStyle = col; g.beginPath(); g.moveTo(0, FAR_H);
          for (let x = 0; x <= FAR_W; x += 40) g.lineTo(x, base + Math.sin(x * 0.004 + base) * 70 + Math.sin(x * 0.011) * 25);
          g.lineTo(FAR_W, FAR_H); g.fill();
          for (let i = 0; i < lights; i++) {
            const x = R() * FAR_W, y = base + Math.sin(x * 0.004 + base) * 70 + Math.sin(x * 0.011) * 25 + 10 + R() * 160;
            g.fillStyle = pick(['#ffe066', '#ff6fae', '#5fe6ff', '#fff2a8']);
            g.globalAlpha = 0.35 + R() * 0.5; g.fillRect(x, y, 3, 3);
          }
          g.globalAlpha = 1;
        }
      },
    },
    obras: {
      name: 'CANTEIRO DE OBRAS', grav: 1, windK: 1, air: true,
      info: 'Chão baixo, montes de terra, um guindaste e vigas de aço penduradas no ar. Quem fica na viga fica exposto e pode despencar.',
      sky: ['#1a0b1e', '#4a1a2e', '#a33a2a', '#ff8a3a'], sea: '0,255,190', burn: '#ff7a1a',
      debris: ['#8a6440', '#ff7a1a', '#c8c4cc'],
      mats: {
        1: mdef('#ffb000', '#c98a4a', '#8a6440', '#3e2a1e', { pat: PAT.soil }),
        20: mdef('#ffe0a0', '#ff9a2a', '#ff7a1a', '#a84a08', { edge: 2, fade: 12, pat: PAT.hatch }),
        21: mdef('#e8e4ec', '#b8b4c0', '#8e8a99', '#5a5766', { edge: 2, fade: 50, noise: 0.22, pat: PAT.crack }),
        22: mdef('#fff7b0', '#ffd400', '#e0b000', '#806000', { edge: 1, fade: 10, pat: PAT.hatch }),
      },
      gen(R) {
        const p = [R() * TAU, R() * TAU];
        const piles = [0, 1, 2, 3].map(() => ({ c: 250 + R() * (WW - 500), w: 110 + R() * 120, h: 70 + R() * 130 }));
        const top = x => {
          let t = 705 + 22 * Math.sin(x * 0.006 + p[0]) + 10 * Math.sin(x * 0.02 + p[1]) + edgeDrop(x, 240, 420);
          for (const q of piles) t -= q.h * Math.exp(-Math.pow((x - q.c) / q.w, 2) * 2.2);
          return t;
        };
        fillColumns(top, 1);
        for (let i = 0; i < 5; i++) {
          const x = 220 + R() * (WW - 440), w = 46 + R() * 40, h = 28 + R() * 30;
          mRect(x, Math.min(top(x), top(x + w)) - h + 4, w, h + 8, 21);
        }
        // guindaste: torre amarela com braço comprido
        const kx = 380 + R() * (WW - 760), kt = top(kx), dir = R() < 0.5 ? -1 : 1;
        mRect(kx - 8, 210, 16, kt - 206, 22);
        mRect(Math.min(kx - dir * 90, kx + dir * 300), 200, 390, 10, 22);
        mRect(kx - dir * 90 - (dir > 0 ? 0 : 30), 210, 30, 24, 21);
        // vigas de aço no ar
        let made = 0;
        for (let tries = 0; tries < 40 && made < 9; tries++) {
          const len = 150 + R() * 160, x = 120 + R() * (WW - 240 - len), y = 290 + R() * 330, ang = (R() - 0.5) * 0.32;
          if (Math.max(top(x), top(x + len)) - y < 90) continue;
          if (x < kx + 30 && x + len > kx - 30) continue;
          girder(x, y, len, ang, 20);
          made++;
        }
      },
      bg(g, R) {
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,220,200,${0.1 + R() * 0.3})`; g.fillRect(R() * FAR_W, R() * 200, 1.5, 1.5); }
        let x = 0;
        while (x < FAR_W) {
          const w = 50 + R() * 90, h = 120 + R() * 280;
          g.fillStyle = '#2a1630'; g.fillRect(x, FAR_H - h, w, h);
          g.fillStyle = 'rgba(255,200,120,0.55)';
          for (let wy = FAR_H - h + 10; wy < FAR_H - 10; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 12) if (R() < 0.3) g.fillRect(wx, wy, 5, 6);
          x += w + 6 + R() * 30;
        }
        g.strokeStyle = '#3a1f3e'; g.lineWidth = 6;
        for (let i = 0; i < 4; i++) {
          const cx = 200 + R() * (FAR_W - 400), top = 120 + R() * 120;
          g.beginPath(); g.moveTo(cx, FAR_H); g.lineTo(cx, top); g.lineTo(cx + (R() < 0.5 ? -1 : 1) * 220, top); g.stroke();
          g.fillStyle = '#ff3b5c'; g.fillRect(cx - 3, top - 6, 6, 6);
        }
      },
    },
    lua: {
      name: 'LUA DE QUEIJO', grav: 0.55, windK: 0.3, air: true,
      info: 'Queijo cheio de buracos e gravidade baixinha: tudo voa mais longe, o vento quase some e os pulos vão lá em cima.',
      sky: ['#000006', '#05031a', '#0e0a2e', '#1a1040'], sea: '200,190,255', burn: '#ffb000',
      debris: ['#ffcf3a', '#fff7c2', '#d98e04'],
      mats: {
        30: mdef('#fff7c2', '#ffe066', '#ffcf3a', '#d98e04', { edge: 5, fade: 320, noise: 0.06, under: '#b06a00' }),
      },
      gen(R) {
        const p = [R() * TAU, R() * TAU, R() * TAU];
        const top = x => 525 + 60 * Math.sin(x * 0.0035 + p[0]) + 28 * Math.sin(x * 0.009 + p[1]) + 8 * Math.sin(x * 0.04 + p[2]) + edgeDrop(x, 240, 460);
        fillColumns(top, 30);
        for (let i = 0; i < 4; i++) {
          const x = 300 + R() * (WW - 600), t = top(x), r = 45 + R() * 45;
          if (t > SEA0 - 100) continue;
          mCircle(x, t + r * 0.7, r * 1.18, 30);
          mCircle(x, t + r * 0.3, r, 0);
        }
        for (let i = 0; i < 38; i++) {
          const x = 120 + R() * (WW - 240), t = top(x), r = 8 + R() * 24;
          const y = t + 34 + r + R() * Math.max(0, SEA0 - t - 60);
          if (y - r > t + 18) mCircle(x, y, r, 0);
        }
      },
      bg(g, R) {
        for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.8})`; const s = R() < 0.1 ? 2.5 : 1.3; g.fillRect(R() * FAR_W, R() * FAR_H, s, s); }
        const ex = 700, ey = 210, er = 92;
        const glow = g.createRadialGradient(ex, ey, er, ex, ey, er + 40);
        glow.addColorStop(0, 'rgba(90,170,255,0.45)'); glow.addColorStop(1, 'rgba(90,170,255,0)');
        g.fillStyle = glow; g.fillRect(ex - er - 50, ey - er - 50, er * 2 + 100, er * 2 + 100);
        g.save(); g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.clip();
        g.fillStyle = '#1d5bd6'; g.fillRect(ex - er, ey - er, er * 2, er * 2);
        g.fillStyle = '#39c94a';
        for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(ex - er + R() * er * 2, ey - er + R() * er * 2, 14 + R() * 30, 10 + R() * 20, R() * 3, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(0,0,30,0.45)'; g.beginPath(); g.arc(ex + 40, ey + 10, er, 0, TAU); g.fill();
        g.restore();
        g.strokeStyle = 'rgba(255,111,174,0.7)'; g.lineWidth = 3;
        g.beginPath(); g.ellipse(1900, 160, 70, 14, -0.3, 0, TAU); g.stroke();
        g.fillStyle = '#c79bff'; g.beginPath(); g.arc(1900, 160, 30, 0, TAU); g.fill();
      },
    },
    caverna: {
      name: 'CAVERNA DE CRISTAL', grav: 1, windK: 0, air: false,
      info: 'Teto de pedra, estalactites e cristais brilhantes. Sem vento e sem Chuva de Mangas: aqui é tiro na raça.',
      sky: ['#05030a', '#0d0818', '#160d26', '#1d1030'], sea: '125,255,58', burn: '#00e5ff',
      debris: ['#4b3a7c', '#00e5ff', '#ff8be6'],
      mats: {
        40: mdef('#00e5ff', '#2bb3a8', '#4b3a7c', '#1c1433', { edge: 6, fade: 200, pat: PAT.stone, under: '#7a3aa8' }),
        41: mdef('#e0ffff', '#7ff6ff', '#00c8e0', '#006b8a', { edge: 2, fade: 40, pat: PAT.facet, noise: 0.05 }),
        42: mdef('#ffe0f8', '#ff8be6', '#e02bc0', '#7a0f66', { edge: 2, fade: 40, pat: PAT.facet, noise: 0.05 }),
        43: mdef('#fffbe0', '#fff07a', '#e0c000', '#7a6400', { edge: 2, fade: 40, pat: PAT.facet, noise: 0.05 }),
      },
      gen(R) {
        const p = [R() * TAU, R() * TAU, R() * TAU, R() * TAU];
        const floor = x => 655 + 50 * Math.sin(x * 0.005 + p[0]) + 22 * Math.sin(x * 0.017 + p[1]) + edgeDrop(x, 220, 420);
        const ceil = x => 150 + 45 * Math.sin(x * 0.004 + p[2]) + 25 * Math.sin(x * 0.013 + p[3]);
        fillColumns(floor, 40);
        for (let x = 0; x < WW; x++) { const c = Math.round(ceil(x)); for (let y = 0; y < c; y++) mat[y * WW + x] = 40; }
        for (let i = 0; i < 15; i++) {
          const x = 80 + R() * (WW - 160), w = 18 + R() * 22, len = 40 + R() * 90, c = ceil(x);
          mPoly([x - w / 2, c - 6, x + w / 2, c - 6, x + (R() - 0.5) * 6, c + len], 40);
        }
        for (let i = 0; i < 8; i++) {
          const x = 260 + R() * (WW - 520), w = 22 + R() * 22, len = 30 + R() * 60, f = floor(x);
          if (f < SEA0 - 60) mPoly([x - w / 2, f + 6, x + w / 2, f + 6, x, f - len], 40);
        }
        // pilares com janelas, para não fechar a linha de tiro
        const nP = 1 + (R() < 0.6 ? 1 : 0);
        for (let i = 0; i < nP; i++) {
          const x = WW * (nP === 1 ? 0.5 : 0.33 + i * 0.34) + (R() - 0.5) * 160, w = 46 + R() * 26;
          const c = ceil(x), f = floor(x);
          for (let y = c - 4; y < f + 6; y++) {
            const u = (y - c) / (f - c), hw = (w / 2) * (0.55 + 0.45 * Math.abs(Math.cos(u * Math.PI)));
            mRect(x - hw, y, hw * 2, 1, 40);
          }
          mCircle(x, lerp(c, f, 0.55), 26 + R() * 10, 0);
        }
        for (let i = 0; i < 28; i++) {
          const x = 100 + R() * (WW - 200), up = R() < 0.6, m = 41 + Math.floor(R() * 3), size = 18 + R() * 26;
          if (up) { const f = floor(x); if (f < SEA0 - 40) crystal(x, f + 4, size, -Math.PI / 2 + (R() - 0.5) * 0.9, m); }
          else crystal(x, ceil(x) - 4, size, Math.PI / 2 + (R() - 0.5) * 0.9, m);
        }
      },
      bg(g, R) {
        g.fillStyle = '#120a20';
        for (let i = 0; i < 26; i++) {
          const x = R() * FAR_W, w = 30 + R() * 70, len = 80 + R() * 220;
          g.beginPath(); g.moveTo(x - w, 0); g.lineTo(x + w, 0); g.lineTo(x, len); g.fill();
        }
        for (let i = 0; i < 70; i++) {
          const x = R() * FAR_W, y = 120 + R() * 560, s = 3 + R() * 7;
          g.fillStyle = pick(['rgba(0,229,255,0.35)', 'rgba(255,139,230,0.3)', 'rgba(255,240,122,0.25)']);
          g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s, y); g.lineTo(x, y + s * 2); g.lineTo(x - s, y); g.fill();
        }
        g.fillStyle = '#0d0718';
        g.beginPath(); g.moveTo(0, FAR_H);
        for (let x = 0; x <= FAR_W; x += 30) g.lineTo(x, 560 + Math.sin(x * 0.01) * 40 + Math.sin(x * 0.037) * 20);
        g.lineTo(FAR_W, FAR_H); g.fill();
      },
    },
  };
  const THEME_IDS = Object.keys(THEMES);

  function paintTerrain() {
    const img = tctx.createImageData(WW, WH), px = new Uint32Array(img.data.buffer);
    // distância até o ar logo abaixo (para a borda de baixo dos tetos e buracos)
    const below = new Uint8Array(WW * WH);
    for (let x = 0; x < WW; x++) {
      let run = 255;
      for (let y = WH - 1; y >= 0; y--) {
        const i = y * WW + x;
        if (mat[i]) { if (run < 255) run++; below[i] = run; } else run = 0;
      }
    }
    const L = [];
    for (const id in theme.mats) L[id] = theme.mats[id];
    // dep: distância até o ar logo acima (bordas); deep: profundidade "cheia", que só zera em vãos grandes
    // (assim um buraco pequeno não deixa uma coluna clara embaixo dele)
    const dep = new Uint16Array(WW).fill(400), deep = new Float32Array(WW).fill(400);
    for (let y = 0; y < WH; y++) {
      const row = y * WW;
      for (let x = 0; x < WW; x++) {
        const i = row + x, m = mat[i];
        if (!m) { dep[x] = 0; deep[x] = Math.max(0, deep[x] - 2); continue; }
        const d = dep[x] = dep[x] < 999 ? dep[x] + 1 : 999;
        const dd = deep[x] = Math.max(d, deep[x] + 1);
        const q = L[m] || L[1] || L[30] || L[40];
        let r, g, b;
        if (d <= 2) { r = q.top2[0]; g = q.top2[1]; b = q.top2[2]; }
        else if (d <= q.edge) { r = q.top[0]; g = q.top[1]; b = q.top[2]; }
        else {
          const t = Math.min(1, (dd - q.edge) / q.fade);
          r = q.a[0] + (q.b[0] - q.a[0]) * t; g = q.a[1] + (q.b[1] - q.a[1]) * t; b = q.a[2] + (q.b[2] - q.a[2]) * t;
        }
        if (q.under && below[i] <= 3) { r = (r + q.under[0] * 2) / 3; g = (g + q.under[1] * 2) / 3; b = (b + q.under[2] * 2) / 3; }
        let f = 1 + (hash(x, y) - 0.5) * q.noise;
        if (q.pat) f *= q.pat(x, y, d);
        px[i] = 0xff000000 | (c255(b * f) << 16) | (c255(g * f) << 8) | c255(r * f);
      }
    }
    tctx.clearRect(0, 0, WW, WH);
    tctx.putImageData(img, 0, 0);
  }

  function buildTerrain(id) {
    theme = THEMES[id];
    theme.id = id;
    mat.fill(0);
    const R = seeded((Math.random() * 2147483646 + 1) | 0);
    theme.gen(R);
    // a última faixa do mundo é sempre fundo do mar
    paintTerrain();
    fctx.clearRect(0, 0, FAR_W, FAR_H);
    theme.bg(fctx, R);
    skyGrad = null;
  }

  /* =====================================================================
     ESTADO
     ===================================================================== */
  let state = 'menu', pausedFrom = null, overT = 0;
  let theme = null, skyGrad = null, seaY = SEA0, seaTarget = SEA0;
  let G = null, teams = [], calangos = [];
  let projs = [], crates = [], parts = [], smokes = [], rings = [], popups = [], bubbles = [], tracers = [], floaters = [];
  let shake = 0, time = 0, urubu = null, ai = null;
  const cam = { x: 0, y: 0, manualT: 0 };
  let VW = 900, VH = 520, k = 1, dpr = 1, cssW = 900, cssH = 520, ui = 1;
  let hi = 0;
  const grav = () => GRAV * theme.grav;
  const human = c => c && teams[c.team].human && !G.demo;

  /* ---------- sons (a demonstração atrás do menu fica muda) ---------- */
  const tone = (...a) => { if (state !== 'menu') Sfx.tone(...a); };
  const noise = (...a) => { if (state !== 'menu') Sfx.noise(...a); };
  const S = {
    step() { tone(140 + Math.random() * 70, 0.035, 'triangle', 0.035); },
    jump() { tone(260, 0.14, 'square', 0.06, 620); },
    backflip() { tone(520, 0.2, 'square', 0.06, 180); tone(780, 0.1, 'triangle', 0.04, null, 0.08); },
    charge(p) { tone(170 + p * 780, 0.06, 'sawtooth', 0.035); },
    fire() { noise(0.2, 0.28, 2400, 0, 'bandpass', 400); tone(220, 0.12, 'square', 0.06, 90); },
    twang() { tone(900, 0.09, 'square', 0.06, 260); noise(0.06, 0.15, 4000, 0, 'highpass', 2000); },
    whistle(f) { tone(f, 0.1, 'sine', 0.022, f * 0.95); },
    boom(size) {
      if (size >= 2) { noise(1.4, 0.75, 2600, 0, 'lowpass', 40); tone(90, 1.1, 'sawtooth', 0.14, 25); tone(55, 1.3, 'sine', 0.3, 20); }
      else if (size >= 1) { noise(0.75, 0.55, 2000); tone(130, 0.5, 'sawtooth', 0.12, 35); }
      else { noise(0.35, 0.4, 2600, 0, 'lowpass', 120); tone(200, 0.2, 'square', 0.07, 60); }
    },
    splash() { noise(0.6, 0.3, 4000, 0, 'bandpass', 300); [0.05, 0.15, 0.27].forEach((d, i) => tone(300 + i * 120, 0.07, 'sine', 0.06, 700 + i * 100, d)); },
    // "ai!" sintético: uma voz que desce de tom com um harmônico por cima
    ai(p) { tone(p, 0.13, 'sawtooth', 0.07, p * 0.62); tone(p * 2.02, 0.1, 'square', 0.022, p * 1.2); },
    bounce(v) { tone(360 + Math.random() * 90, 0.04, 'square', Math.min(0.06, v / 5000)); },
    plaft() { noise(0.12, 0.55, 5000, 0, 'highpass', 1500); tone(600, 0.06, 'square', 0.08, 200); },
    whoosh() { noise(0.2, 0.18, 1200, 0, 'bandpass', 3000); },
    tele() { [660, 880, 1175, 1568].forEach((f, i) => tone(f, 0.08, 'triangle', 0.06, null, i * 0.05)); },
    dig() { noise(0.08, 0.2, 900, 0, 'bandpass', 300); },
    pick() { [784, 988, 1319].forEach((f, i) => tone(f, 0.09, 'square', 0.06, null, i * 0.06)); },
    para() { tone(500, 0.4, 'sine', 0.04, 260); },
    tick(hiT) { tone(hiT ? 1100 : 760, 0.05, 'square', 0.05); },
    turn() { tone(660, 0.08, 'square', 0.06); tone(990, 0.12, 'square', 0.06, null, 0.09); },
    sad() { [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? 0.55 : 0.2, 'sawtooth', 0.06, i === 3 ? 190 : null, i * 0.21)); },
    buzz() { tone(120, 0.2, 'sawtooth', 0.08); },
    fuse() { noise(0.07, 0.05, 6000, 0, 'highpass', 3000); },
    blub() { tone(180 + Math.random() * 120, 0.08, 'sine', 0.05, 420); },
    rise() { tone(90, 1.4, 'sawtooth', 0.06, 160); noise(1.4, 0.15, 600, 0, 'lowpass', 200); },
    urubu() { tone(1400, 0.12, 'triangle', 0.04, 900); tone(1200, 0.12, 'triangle', 0.04, 800, 0.14); },
    fanfare() {
      const n = [523, 523, 659, 784, 659, 784, 1047], d = [0, 0.12, 0.24, 0.36, 0.6, 0.72, 0.86];
      n.forEach((f, i) => tone(f, i === 6 ? 0.55 : 0.11, 'square', 0.08, null, d[i]));
      [262, 330, 392].forEach(f => tone(f, 0.55, 'triangle', 0.05, null, 0.86));
    },
  };

  /* ---------- efeitos ---------- */
  function spark(x, y, n, colors, sp = 200, g = 300, life = 0.6, size = 2.5) {
    for (let i = 0; i < n && parts.length < MAX_PART; i++) {
      const a = Math.random() * TAU, s = sp * (0.25 + Math.random() * 0.75), l = life * (0.5 + Math.random() * 0.7);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - sp * 0.25, g, life: l, max: l, color: Array.isArray(colors) ? pick(colors) : colors, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  function puff(x, y, n, r = 10, life = 1.3) {
    for (let i = 0; i < n && smokes.length < 70; i++) {
      const l = life * rand(0.6, 1.2);
      smokes.push({ x: x + rand(-r, r), y: y + rand(-r, r), r: r * rand(0.6, 1.2), vx: rand(-15, 15), vy: rand(-45, -10), life: l, max: l });
    }
  }
  function popup(x, y, text, color, size = 1) { popups.push({ x, y, text, color, t: 1.4, size }); }
  function say(c, text) {
    if (!c || c.dead) return;
    bubbles = bubbles.filter(b => b.c !== c);
    bubbles.push({ c, text, t: 2.3 });
  }
  function banner(text, color = '#7dff3a', t = 2.2) { if (G) G.banner = { text, color, t, max: t }; }
  function splash(x, big) {
    const col = `rgb(${theme.sea})`;
    spark(x, seaY - 2, big ? 26 : 12, [col, '#ffffff'], big ? 260 : 170, 600, 0.8, 2.5);
    rings.push({ x, y: seaY, r: big ? 26 : 14, t: 0, max: 0.5, sea: true });
  }

  /* =====================================================================
     PARTIDA
     ===================================================================== */
  function findSpots() {
    const out = [];
    for (let x = 70; x < WW - 70; x += 7) {
      let free = 0;
      for (let y = 0; y < seaY - 50; y++) {
        if (mat[y * WW + x]) { if (free >= 26 && y > 40) out.push({ x, y }); free = 0; }
        else free++;
      }
    }
    return out;
  }
  function makeCalango(team, name, x, y) {
    return {
      team, name, hp: 100, shown: 100, x, y, vx: 0, vy: 0, air: true, blown: false, face: x < WW / 2 ? 1 : -1, aim: 0.45,
      dead: false, drowned: false, gone: false, walkAcc: 0, walkPh: 0, walkT: 0, stepT: 0, hurtT: 0, cel: 0, flip: 0, slapT: 0,
      charging: false, power: 0, dig: null, seed: Math.random() * 10, voice: rand(330, 560), aiAt: -9, killer: -1, blink: rand(1, 4),
    };
  }

  function newMatch(demo) {
    const nTeams = demo ? 2 + (Math.random() < 0.35 ? 1 : 0) : +settings.equipes;
    const per = demo ? 3 : +settings.calangos;
    const multi = !demo && settings.mode === 'multi';
    const humans = demo ? 0 : multi ? Math.min(nTeams, +settings.humanos) : 1;
    const themeId = demo || settings.cenario === 'aleatorio' ? pick(THEME_IDS) : settings.cenario;
    seaY = seaTarget = SEA0;
    buildTerrain(themeId);
    projs = []; crates = []; parts = []; smokes = []; rings = []; popups = []; bubbles = []; tracers = []; floaters = [];
    urubu = null; ai = null; shake = 0;
    const tn = shuffle(TEAM_NAMES), nm = shuffle(NAMES);
    teams = []; calangos = [];
    for (let i = 0; i < nTeams; i++) {
      const ammo = {};
      for (const w of WEAPONS) ammo[w.id] = w.ammo;
      teams.push({
        idx: i, name: tn[i], color: TEAM_COLORS[i], human: i < humans, level: demo ? 'normal' : settings.cpu,
        calangos: [], ammo, next: 0, weapon: 0, fuse: 3, dmgDealt: 0, kills: 0, friendly: 0,
      });
    }
    // posições: espalha os calangos pela ilha, longe uns dos outros e do mar
    const spots = shuffle(findSpots()), used = [];
    const take = () => {
      for (const minD of [130, 80, 40, 0]) {
        const s = spots.find(p => used.every(u => Math.abs(u.x - p.x) + Math.abs(u.y - p.y) * 0.5 > minD));
        if (s) { used.push(s); return s; }
      }
      return { x: WW / 2, y: 100 };
    };
    for (let j = 0; j < per; j++) for (const t of teams) {
      const s = take(), c = makeCalango(t.idx, nm[calangos.length % nm.length], s.x, s.y - 2);
      t.calangos.push(c); calangos.push(c);
    }
    for (const c of calangos) { let n = 0; while (blocked(c.x, c.y) && n++ < 60) c.y--; }
    G = {
      demo, multi, cur: Math.floor(Math.random() * nTeams) - 1, round: 0, turnNo: 0, phase: 'intro', t: 0,
      timer: TURN_T, retreat: 0, wind: 0, active: null, weapon: 0, sling: 0, cursor: null, cursorT: 0,
      score: 0, turnDmg: 0, firedWeapon: null, shooter: null, banner: null, endSoon: false, winner: null,
      dq: [], dying: null, quietT: 0, lastSec: 99, chargeT: 0,
      stats: { best: { dmg: 0 }, drowned: [], slaps: 0 },
    };
    const c0 = calangos[0];
    cam.x = clamp(WW / 2 - VW / 2, -60, WW - VW + 60); cam.y = c0 ? c0.y - VH * 0.6 : 300; cam.manualT = 0;
    banner(theme.name, '#ffffff', 1.8);
    closeMenu();
  }

  const teamAlive = t => t.calangos.some(c => !c.dead && c.hp > 0);
  const cheatAmmo = t => t.human && !G.demo && codes.has('KONAMI');
  function ammoOf(t, id) {
    if (id === 'mangas' && !theme.air) return 0;
    return cheatAmmo(t) ? Infinity : t.ammo[id];
  }
  const scoring = kt => !G.demo && !G.multi && kt === 0;
  const mult = () => AI[settings.cpu].mult;
  const noFall = c => codes.has('SUPERPULO') && human(c);

  /* =====================================================================
     FÍSICA DOS CALANGOS
     ===================================================================== */
  // Corpo de 10×16 acima dos pés (o pé fica na primeira linha de chão).
  function blocked(x, y) {
    for (let yy = y - 15; yy <= y - 1.9; yy += 4.35) for (let xx = x - 4; xx <= x + 4; xx += 4) if (solid(xx, yy)) return true;
    return false;
  }
  const grounded = (x, y) => solid(x, y) || solid(x - 3, y) || solid(x + 3, y);
  function popUp(c) { let i = 0; while (i++ < 8 && (solid(c.x, c.y - 1) || solid(c.x - 3, c.y - 1) || solid(c.x + 3, c.y - 1))) c.y--; }

  function stepWalk(c, dir) {
    const nx = c.x + dir;
    if (nx < 2 || nx > WW - 2) return false;
    for (let up = 0; up <= 6; up++) {
      if (!blocked(nx, c.y - up)) {
        c.x = nx; c.y -= up;
        popUp(c);
        let down = 0;
        while (!grounded(c.x, c.y) && down < 7) { c.y++; down++; }
        if (!grounded(c.x, c.y)) { c.air = true; c.vx = dir * 40; c.vy = 0; }
        return true;
      }
    }
    return false;
  }
  function jump(c, back) {
    if (c.air) return;
    const sup = codes.has('SUPERPULO') && human(c) ? 1.7 : 1;
    if (back) { c.vx = -c.face * 55; c.vy = -380 * sup; c.flip = 0.001; S.backflip(); }
    else { c.vx = c.face * 135; c.vy = -250 * sup; S.jump(); }
    c.air = true; c.blown = false; c.y -= 1;
  }
  function moveAir(c, dt, tomb) {
    c.vy = Math.min(900, c.vy + grav() * dt);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(c.vx), Math.abs(c.vy)) * dt / 1.5));
    for (let i = 0; i < n; i++) {
      const sx = c.vx * dt / n, sy = c.vy * dt / n;
      if (sx) {
        if (!blocked(c.x + sx, c.y)) c.x += sx;
        else if (!blocked(c.x + sx, c.y - 2.5)) { c.x += sx; c.y -= 2.5; }
        else c.vx *= -0.3;
      }
      if (sy > 0) {
        if (grounded(c.x, c.y + sy)) { c.y = Math.floor(c.y + sy); popUp(c); land(c, tomb); return; }
        c.y += sy;
      } else if (sy < 0) {
        if (blocked(c.x, c.y + sy)) c.vy = 0; else c.y += sy;
      }
    }
  }
  function land(c, tomb) {
    const v = c.vy;
    if (!tomb && v > 440 && !noFall(c)) { const d = Math.round((v - 440) * 0.075); if (d > 0) damage(c, d); }
    if (c.blown && v > 240) { c.vy = -v * 0.28; c.vx *= 0.5; c.y -= 1; spark(c.x, c.y, 3, theme.debris, 50, 200, 0.3, 2); return; }
    c.air = false; c.blown = false; c.vx = 0; c.vy = 0; c.flip = 0;
    if (v > 220 && !tomb) spark(c.x, c.y, 4, theme.debris, 60, 200, 0.4, 2);
  }

  function updateCalango(c, dt, ctl) {
    c.hurtT = Math.max(0, c.hurtT - dt); c.slapT = Math.max(0, c.slapT - dt); c.walkT = Math.max(0, c.walkT - dt);
    if (c.shown > c.hp) c.shown = Math.max(c.hp, c.shown - dt * 45); else c.shown = c.hp;
    if (c.gone) return;
    if (c.dead) {                                   // lápide: cai se o chão sumir, afunda no mar
      if (c.air) moveAir(c, dt, true);
      else if (!grounded(c.x, c.y)) { c.air = true; c.vx = 0; c.vy = 0; }
      if (c.y - 4 > seaY) { c.gone = true; floaters.push({ x: c.x, color: teams[c.team].color, t: 0, vx: rand(-6, 6) }); splash(c.x, false); }
      return;
    }
    if (c.flip) c.flip = c.air ? c.flip + dt * 1.6 : 0;
    if (c.cel > 0 && !c.air && Math.random() < dt * 1.2 && G.phase === 'victory') { c.vy = -200; c.vx = 0; c.air = true; }
    if (c.dig) {
      const d = c.dig;
      d.t -= dt; d.ct -= dt; d.st -= dt;
      if (d.ct <= 0) { d.ct = 0.05; carve(c.x + d.dx * 5, c.y - 8 + d.dy * 5, 11); spark(c.x + d.dx * 14, c.y - 8 + d.dy * 14, 2, theme.debris, 90, 300, 0.4, 2); }
      if (d.st <= 0) { d.st = 0.12; S.dig(); }
      c.x = clamp(c.x + d.dx * 46 * dt, 4, WW - 4); c.y += d.dy * 46 * dt;
      c.walkPh += dt * 20; c.walkT = 0.1;
      if (d.t <= 0) { c.dig = null; popUp(c); c.air = !grounded(c.x, c.y); c.vx = 0; c.vy = 0; }
      if (c.y - 6 > seaY) drown(c);
      return;
    }
    if (c.air) moveAir(c, dt, false);
    else if (!grounded(c.x, c.y)) { c.air = true; c.vx = 0; c.vy = 0; }
    else if (ctl) {
      if (ctl.move && !c.charging) {
        c.face = ctl.move > 0 ? 1 : -1;
        c.walkAcc += WALK * dt;
        while (c.walkAcc >= 1) {
          c.walkAcc -= 1;
          if (!stepWalk(c, c.face)) { c.walkAcc = 0; break; }
          if (c.air) break;
        }
        c.walkPh += dt * 14; c.walkT = 0.12;
        c.stepT -= dt; if (c.stepT <= 0) { c.stepT = 0.22; S.step(); }
      } else c.walkAcc = 0;
      if (ctl.jump && !c.charging) jump(c, false);
      else if (ctl.back && !c.charging) jump(c, true);
    }
    if (ctl && ctl.aim) c.aim = clamp(c.aim + ctl.aim * 1.5 * dt, -1.45, 1.45);
    if (c.y - 6 > seaY) drown(c);
  }

  /* ---------- dano, mortes e afogamentos ---------- */
  function damage(c, d) {
    if (c.dead || d <= 0) return;
    const real = Math.min(d, c.hp);
    c.hp -= real;
    if (c.hp <= 0) { c.hp = 0; if (c.killer < 0) c.killer = G.phase === 'rise' ? -1 : G.cur; }
    c.hurtT = 0.3;
    popup(c.x, c.y - 32, '-' + d, teams[c.team].color);
    if (time - c.aiAt > 0.25) { S.ai(c.voice); c.aiAt = time; }
    if (Math.random() < 0.45) say(c, pick(PH.hurt));
    G.turnDmg += real;
    const kt = G.cur;
    if (kt >= 0 && G.phase !== 'rise') {
      if (c.team !== kt) { teams[kt].dmgDealt += real; if (scoring(kt)) G.score += real * PTS.dmg * mult(); }
      else teams[kt].friendly += real;
    }
    if (c === G.active) { if (G.phase === 'aim') G.endSoon = true; else if (G.phase === 'fired') G.retreat = 0; }
  }
  function creditKill(c) {
    const kt = c.killer;
    if (kt < 0 || kt === c.team) return;
    teams[kt].kills++;
    if (scoring(kt)) G.score += PTS.kill * mult();
    const sh = G.shooter;
    if (sh && !sh.dead && sh.team === kt && Math.random() < 0.7) say(sh, pick(PH.kill));
  }
  function drown(c) {
    if (c.dead) return;
    if (c.killer < 0) c.killer = G.phase === 'rise' ? -1 : G.cur;
    c.dead = true; c.drowned = true; c.gone = true; c.hp = 0; c.shown = 0; c.dig = null; c.charging = false;
    bubbles = bubbles.filter(b => b.c !== c);
    splash(c.x, true); S.splash();
    floaters.push({ x: c.x, color: teams[c.team].color, t: 0, vx: rand(-8, 8) });
    popup(c.x, seaY - 34, pick(['GLUB GLUB!', 'TCHIBUM!', 'NÃO SEI NADAR!', 'SOCORRO!']), '#ffffff', 1.1);
    G.stats.drowned.push(c.name);
    creditKill(c);
    if (c === G.active) { if (G.phase === 'aim') G.endSoon = true; else if (G.phase === 'fired') G.retreat = 0; }
  }
  function kill(c) {
    c.dead = true; c.vx = 0; c.vy = 0; c.charging = false;
    c.air = !grounded(c.x, c.y);
    bubbles = bubbles.filter(b => b.c !== c);
    spark(c.x, c.y - 8, 26, [teams[c.team].color, '#ffffff', '#7dff3a'], 220, 250, 0.7);
    puff(c.x, c.y - 8, 6, 8);
    rings.push({ x: c.x, y: c.y - 8, r: 18, t: 0, max: 0.4 });
    S.sad();
    creditKill(c);
  }

  /* =====================================================================
     TERRENO DESTRUTÍVEL E EXPLOSÕES
     ===================================================================== */
  function carve(x, y, r) {
    mCircle(x, y, r, 0);
    tctx.save();
    tctx.globalCompositeOperation = 'destination-out';
    tctx.beginPath(); tctx.arc(x, y, r + 0.5, 0, TAU); tctx.fill();
    tctx.globalCompositeOperation = 'source-atop';
    tctx.lineWidth = 8; tctx.strokeStyle = 'rgba(0,0,0,0.38)';
    tctx.beginPath(); tctx.arc(x, y, r + 5, 0, TAU); tctx.stroke();
    tctx.lineWidth = 3; tctx.strokeStyle = theme.burn;
    tctx.beginPath(); tctx.arc(x, y, r + 1.6, 0, TAU); tctx.stroke();
    tctx.restore();
  }

  function explode(x, y, R, dmg, o = {}) {
    if (R > 0) carve(x, y, R);
    const push = o.push ?? dmg * 9;
    for (const c of calangos) {
      if (c.dead) continue;
      const dx = c.x - x, dy = c.y - 8 - y, d = Math.hypot(dx, dy);
      if (d >= R + 10) continue;
      const f = 1 - d / (R + 10);
      const dd = Math.max(1, Math.round(dmg * Math.min(1, f * 1.3)));
      let nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : -1;
      ny -= 0.55;
      const m = Math.hypot(nx, ny) || 1;
      nx /= m; ny /= m;
      const sp = push * f;
      c.vx = c.vx * 0.3 + nx * sp; c.vy = c.vy * 0.3 + ny * sp;
      c.air = true; c.blown = true; c.y -= 1; c.dig = null; c.charging = false;
      damage(c, dd);
    }
    for (const b of crates) if (!b.dead && Math.hypot(b.x - x, b.y - 7 - y) < R + 12) breakCrate(b);
    for (const p of projs) {
      if (p.dead || !p.bounce) continue;
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d < R + 20 && d > 0.5) { const f = (1 - d / (R + 20)) * dmg * 7; p.vx += (dx / d) * f; p.vy += (dy / d) * f - f * 0.3; p.rest = false; }
    }
    // efeitos: clarão, faíscas, pedaços do chão e fumaça
    rings.push({ x, y, r: R, t: 0, max: R > 80 ? 0.8 : 0.45 });
    spark(x, y, Math.min(60, 10 + R * 0.7), ['#ffffff', '#fff27a', '#ffb000', '#ff4f1a', theme.burn], R * 5, 380, 0.7, 3);
    spark(x, y, Math.min(30, R * 0.4), theme.debris, R * 4, 600, 0.9, 3.2);
    puff(x, y, Math.min(12, 2 + R / 10), R * 0.4);
    shake = Math.min(1.6, shake + R / 70);
    S.boom(R >= 90 ? 2 : R >= 36 ? 1 : 0);
  }

  function breakCrate(b) {
    b.dead = true;
    if (b.type === 'arma') explode(b.x, b.y - 7, 26, 14);
    else spark(b.x, b.y - 7, 16, ['#7dff3a', '#ffffff'], 150, 200, 0.6);
  }

  /* =====================================================================
     PROJÉTEIS (a mesma função serve para o jogo e para a simulação da CPU)
     ===================================================================== */
  function launch(kind, x, y, vx, vy, owner, fuse) {
    const d = PROJ[kind];
    const p = { kind, x, y, vx, vy, t: 0, owner, windK: d.wind || 0, bounce: d.bounce || 0, hit: !!d.hit, fuse: fuse ?? d.fuse, rest: false, rot: 0, wt: 0, ft: 0, dead: false };
    projs.push(p);
    return p;
  }
  function calangoAt(x, y, skip) {
    for (const c of calangos) {
      if (c.dead || c === skip) continue;
      if (Math.abs(c.x - x) < 7 && y > c.y - 17 && y < c.y + 1) return c;
    }
    return null;
  }
  function bounceProj(p, cx, cy) {
    let nx = 0, ny = 0;
    for (let dy = -5; dy <= 5; dy += 2.5) for (let dx = -5; dx <= 5; dx += 2.5) if (solid(cx + dx, cy + dy)) { nx -= dx; ny -= dy; }
    const m = Math.hypot(nx, ny);
    if (m < 0.001) { nx = 0; ny = -1; } else { nx /= m; ny /= m; }
    const dot = p.vx * nx + p.vy * ny;
    if (dot < 0) {
      p.vx -= (1 + p.bounce) * dot * nx; p.vy -= (1 + p.bounce) * dot * ny;
      p.vx *= 0.82; p.vy *= 0.82;
    } else { p.x += nx; p.y += ny; }
    if (Math.hypot(p.vx, p.vy) < 28) { p.vx = 0; p.vy = 0; p.rest = true; }
    return -dot;
  }
  // Avança um passo; devolve 'hit', 'fuse', 'water', 'out' ou null.
  function projStep(p, dt, sim) {
    p.t += dt;
    if (p.rest) {
      if (solid(p.x, p.y + 3) || solid(p.x - 2, p.y + 3) || solid(p.x + 2, p.y + 3)) return p.fuse !== undefined && p.t >= p.fuse ? 'fuse' : null;
      p.rest = false;
    }
    p.vy += grav() * dt;
    if (p.windK) p.vx += G.wind * WIND_ACC * p.windK * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) * dt / 2.5));
    const sx = p.vx * dt / n, sy = p.vy * dt / n;
    for (let i = 0; i < n; i++) {
      const nx = p.x + sx, ny = p.y + sy;
      if (solid(nx, ny)) {
        if (p.bounce) { const imp = bounceProj(p, nx, ny); if (!sim && imp > 70) S.bounce(imp); break; }
        p.x = nx; p.y = ny;
        return 'hit';
      }
      p.x = nx; p.y = ny;
      if (p.hit && p.y > hitTop) { const c = calangoAt(p.x, p.y, p.t < 0.3 ? p.owner : null); if (c) return 'hit'; }
      if (p.y > seaY) return 'water';
    }
    if (p.fuse !== undefined && p.t >= p.fuse) return 'fuse';
    if (p.x < -400 || p.x > WW + 400 || p.y > WH + 100) return 'out';
    return null;
  }
  let hitTop = 0;               // acima desta altura não há calango (atalho para a simulação)
  const syncHitTop = () => { hitTop = Math.min(...calangos.filter(c => !c.dead).map(c => c.y - 18), WH); };

  function detonate(p) {
    p.dead = true;
    const d = PROJ[p.kind];
    explode(p.x, p.y, d.R, d.dmg);
    if (p.kind === 'coco') for (let i = 0; i < 5; i++) launch('coquinho', p.x, p.y - 2, rand(-170, 170), rand(-420, -240), null);
    if (p.kind === 'feijoada') {
      for (let i = 0; i < 6; i++) launch('linguica', p.x, p.y - 4, rand(-280, 280), rand(-560, -320), null);
      shake = 2.2;
      puff(p.x, p.y - 60, 14, 50, 2.4);
      banner('FEIJOADA ATÔMICA!!!', '#ffd400', 2);
    }
  }

  function updateProjs(dt) {
    syncHitTop();
    for (const p of projs) {
      if (p.dead) continue;
      const r = projStep(p, dt, false);
      if (!p.rest) p.rot += dt * (p.kind === 'bazuca' ? 0 : 9);
      if (p.kind === 'bazuca' && parts.length < MAX_PART) {
        parts.push({ x: p.x, y: p.y, vx: rand(-25, 25) - p.vx * 0.1, vy: rand(-25, 25) - p.vy * 0.1, g: -40, life: 0.35, max: 0.35, color: pick(['#ffb000', '#ff4f1a', '#fff27a']), size: 2.6 });
      }
      if (p.kind === 'dinamite' || p.kind === 'feijoada') {
        p.ft -= dt;
        if (p.ft <= 0) {
          p.ft = p.kind === 'dinamite' ? 0.1 : 0.32;
          if (p.kind === 'dinamite') { S.fuse(); spark(p.x + 2, p.y - 12, 2, ['#fff27a', '#ffb000'], 60, 100, 0.3, 2); }
          else { S.blub(); spark(p.x, p.y - 10, 2, ['#5a3a20', '#fff7c2'], 50, -40, 0.6, 3); }
        }
      }
      p.wt -= dt;
      if (p.wt <= 0 && !p.rest && (p.kind === 'bazuca' || p.kind === 'manga' || p.kind === 'coco')) {
        p.wt = 0.09;
        S.whistle(450 + 700 * clamp(1 - (p.vy + 500) / 1100, 0, 1));
      }
      if (r === 'hit' || r === 'fuse') detonate(p);
      else if (r === 'water') { p.dead = true; splash(p.x, false); S.splash(); }
      else if (r === 'out') p.dead = true;
    }
    projs = projs.filter(p => !p.dead);
  }

  /* ---------- armas especiais ---------- */
  function rayHit(c, face, ang) {
    const dx = face * Math.cos(ang), dy = -Math.sin(ang);
    let x = c.x + dx * 8, y = c.y - 9 + dy * 8;
    for (let i = 0; i < 320; i++) {
      x += dx * 3; y += dy * 3;
      if (solid(x, y)) return { x, y, c: null };
      const o = calangoAt(x, y, c);
      if (o) return { x, y, c: o };
      if (y > seaY || x < -60 || x > WW + 60 || y < -400) return { x, y, c: null, miss: true };
    }
    return { x, y, c: null, miss: true };
  }
  function slingShot(c) {
    const h = rayHit(c, c.face, c.aim);
    tracers.push({ x0: c.x + c.face * Math.cos(c.aim) * 12, y0: c.y - 9 - Math.sin(c.aim) * 12, x1: h.x, y1: h.y, t: 0.25 });
    S.twang();
    if (!h.miss) explode(h.x, h.y, SLING.R, SLING.dmg, { push: 330 });
    else if (h.y > seaY) splash(h.x, false);
  }
  function slap(c) {
    c.slapT = 0.35;
    const a = Math.max(0.35, c.aim);
    let hit = 0;
    for (const o of calangos) {
      if (o.dead || o === c) continue;
      const dx = o.x - c.x;
      if (Math.abs(dx) < 30 && Math.abs(o.y - c.y) < 22 && (Math.sign(dx) === c.face || Math.abs(dx) < 4)) {
        o.vx = c.face * Math.cos(a) * SLAP.push; o.vy = -Math.sin(a) * SLAP.push;
        o.air = true; o.blown = true; o.y -= 2;
        damage(o, SLAP.dmg);
        spark(o.x, o.y - 10, 14, ['#ffffff', '#ffd400', '#3b7bff'], 180, 100, 0.5);
        hit++;
      }
    }
    if (hit) { S.plaft(); popup(c.x + c.face * 18, c.y - 30, 'PLAFT!', '#ffd400', 1.3); G.stats.slaps += hit; if (Math.random() < 0.6) say(c, pick(PH.slap)); }
    else { S.whoosh(); popup(c.x + c.face * 18, c.y - 26, 'VUUSH!', '#9a8bb8'); }
  }
  function validSpot(x, y) { return x > 8 && x < WW - 8 && y > -150 && y < seaY - 24 && !blocked(x, y) && !solid(x, y - 1); }
  function teleport(c, x, y) {
    spark(c.x, c.y - 8, 22, ['#00e5ff', '#ffffff', '#ff2bd6'], 160, 0, 0.5);
    rings.push({ x: c.x, y: c.y - 8, r: 16, t: 0, max: 0.35 });
    c.x = x; c.y = y; c.air = true; c.vx = 0; c.vy = 0; c.blown = false;
    spark(x, y - 8, 22, ['#00e5ff', '#ffffff', '#ff2bd6'], 160, 0, 0.5);
    rings.push({ x, y: y - 8, r: 16, t: 0, max: 0.35 });
    S.tele();
  }
  // Urubu entregador: atravessa o céu e solta 5 mangas em cima do alvo.
  function callUrubu(tx) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const drops = [-2, -1, 0, 1, 2].map(i => tx + i * 34).sort((a, b) => dir * (a - b));
    urubu = { x: tx - dir * (VW * 0.7 + 200), y: -120, dir, tx, drops, i: 0, flap: 0 };
    S.urubu();
  }
  function updateUrubu(dt) {
    const u = urubu;
    u.x += u.dir * 560 * dt; u.flap += dt * 10;
    while (u.i < u.drops.length && (u.dir > 0 ? u.x >= u.drops[u.i] : u.x <= u.drops[u.i])) {
      launch('manga', u.drops[u.i], -100, 0, 0, null);
      tone(700 - u.i * 60, 0.06, 'triangle', 0.04);
      u.i++;
    }
    if (u.i >= u.drops.length && Math.abs(u.x - u.tx) > VW) urubu = null;
  }

  /* ---------- caixas de paraquedas ---------- */
  function dropCrate() {
    for (let tries = 0; tries < 30; tries++) {
      const x = 120 + Math.random() * (WW - 240);
      let y0 = 0;
      while (y0 < WH && solid(x, y0)) y0++;
      let gy = -1;
      for (let y = y0; y < seaY - 30; y++) if (solid(x, y)) { gy = y; break; }
      if (gy < 0 || calangos.some(c => !c.dead && Math.abs(c.x - x) < 40)) continue;
      const arma = Math.random() < 0.5;
      let w = null;
      if (arma) {
        const r = Math.random();
        w = r < 0.1 ? 'feijoada' : r < 0.32 ? 'coco' : r < 0.52 ? 'dinamite' : r < 0.68 ? 'mangas' : r < 0.84 ? 'teleporte' : 'pa';
        if (w === 'mangas' && !theme.air) w = 'coco';
      }
      const b = { x, y: y0 === 0 ? -60 : y0 + 18, vx: 0, vy: 0, type: arma ? 'arma' : 'vida', w, para: true, air: true, dead: false, t: 0 };
      crates.push(b);
      S.para();
      return b;
    }
    return null;
  }
  function updateCrates(dt) {
    for (const b of crates) {
      if (b.dead) continue;
      b.t += dt;
      if (b.air) {
        if (b.para) { b.vy = 120 * Math.sqrt(theme.grav); b.vx = G.wind * 30; } else { b.vy = Math.min(600, b.vy + grav() * dt); b.vx = 0; }
        const n = Math.max(1, Math.ceil((Math.abs(b.vy) + Math.abs(b.vx)) * dt / 1.5));
        for (let i = 0; i < n; i++) {
          const nx = b.x + b.vx * dt / n, ny = b.y + b.vy * dt / n;
          if (!solid(nx - 7, b.y - 7) && !solid(nx + 7, b.y - 7)) b.x = clamp(nx, 4, WW - 4);
          if (solid(b.x, ny) || solid(b.x - 6, ny) || solid(b.x + 6, ny)) {
            b.air = false; b.para = false; b.y = Math.floor(ny);
            let up = 0; while (up++ < 10 && solid(b.x, b.y - 1)) b.y--;
            break;
          }
          b.y = ny;
        }
        if (b.y - 6 > seaY) { b.dead = true; splash(b.x, false); continue; }
      } else if (!solid(b.x, b.y) && !solid(b.x - 6, b.y) && !solid(b.x + 6, b.y)) { b.air = true; b.para = false; b.vy = 0; }
      for (const c of calangos) if (!c.dead && Math.abs(c.x - b.x) < 15 && c.y > b.y - 20 && c.y < b.y + 18) { collect(c, b); break; }
    }
    crates = crates.filter(b => !b.dead);
  }
  function collect(c, b) {
    b.dead = true;
    const t = teams[c.team];
    if (b.type === 'vida') { c.hp = Math.min(200, c.hp + 25); c.shown = c.hp; popup(c.x, c.y - 34, '+25 VIDA', '#7dff3a'); }
    else {
      const n = b.w === 'pa' ? 2 : 1, w = WEAPONS[W_BY[b.w]];
      if (isFinite(t.ammo[b.w])) t.ammo[b.w] += n;
      popup(c.x, c.y - 34, `+${n} ${w.short}`, w.legend ? '#ffd400' : '#ffffff');
      if (w.legend) banner(`${t.name} ACHOU A FEIJOADA ATÔMICA!`, '#ffd400', 2.6);
    }
    spark(b.x, b.y - 7, 18, ['#7dff3a', '#ffffff', '#ffd400'], 160, 100, 0.6);
    S.pick();
    say(c, pick(PH.crate));
  }

  /* =====================================================================
     TURNOS
     ===================================================================== */
  function setPhase(p) { G.phase = p; G.t = 0; }
  const quiet = () => !projs.length && !urubu && calangos.every(c => c.dead || (!c.air && !c.dig));

  function nextTurn() {
    const n = teams.length, prev = G.cur;
    let t = prev;
    for (let i = 0; i < n; i++) { t = (t + 1 + n) % n; if (teamAlive(teams[t])) break; }
    if (G.round === 0 || t <= prev) {
      G.round++;
      if (G.round === SD_ROUND) banner('MORTE SÚBITA! O MAR VAI SUBIR A CADA TURNO', '#ff3b5c', 3);
    }
    G.cur = t;
    const team = teams[t], L = team.calangos.length;
    for (let i = 0; i < L; i++) {
      const c = team.calangos[(team.next + i) % L];
      if (!c.dead && c.hp > 0) { G.active = c; team.next = (team.next + i + 1) % L; break; }
    }
    let w = Math.random() * 2 - 1;
    w = Math.sign(w) * Math.pow(Math.abs(w), 1.25);
    G.wind = codes.has('SEMVENTO') && !G.demo ? 0 : Math.round(w * 10) / 10 * theme.windK;
    G.turnDmg = 0; G.firedWeapon = null; G.shooter = null; G.endSoon = false;
    G.turnNo++;
    if (G.turnNo > 1 && crates.length < 3 && Math.random() < 0.4 && dropCrate()) setPhase('drop');
    else beginTurn();
  }
  function beginTurn() {
    const team = teams[G.cur];
    inp.confirm = false;
    if (team.human && G.multi) setPhase('handoff'); else setPhase('pre');
    if (G.phase === 'pre') announce();
  }
  function announce() {
    const c = G.active, team = teams[G.cur];
    banner(team.human && !G.multi && !G.demo ? `SUA VEZ: ${c.name}` : `VEZ DE ${c.name}`, team.color, 1.6);
    S.turn();
    if (Math.random() < 0.45) say(c, pick(PH.turn));
    cam.manualT = 0;
  }
  function startAim() {
    const c = G.active, team = teams[G.cur];
    setPhase('aim');
    G.timer = TURN_T; G.sling = 0; G.cursor = null; G.lastSec = 99;
    if (ammoOf(team, WEAPONS[team.weapon].id) <= 0) team.weapon = 0;
    G.weapon = team.weapon;
    c.charging = false; c.power = 0;
    drainInput();
    if (team.human && !G.demo) ai = null; else aiStart(c);
  }
  function endTurn() {
    const c = G.active;
    if (c) { c.charging = false; c.power = 0; }
    closeMenu();
    G.cursor = null; G.endSoon = false;
    if (ai) ai.mode = 'idle';
    setPhase('settle'); G.quietT = 0;
  }
  function resolve() {
    const c = G.active;
    if (c && G.turnDmg > G.stats.best.dmg) G.stats.best = { dmg: G.turnDmg, name: c.name, team: teams[c.team].name, weapon: G.firedWeapon || 'TOMBO' };
    if (c && G.firedWeapon && G.turnDmg === 0 && !c.dead && Math.random() < 0.5) say(c, pick(PH.miss));
    else if (c && !c.dead && teams[c.team].friendly > 0 && G.turnDmg > 0 && calangos.some(o => o.team === c.team && o.hurtT > 0) && Math.random() < 0.5) say(c, pick(PH.self));
    G.turnDmg = 0;
    G.dq = calangos.filter(o => !o.dead && o.hp <= 0);
    nextDeath();
  }
  function nextDeath() {
    if (G.dq.length) { G.dying = G.dq.shift(); setPhase('death'); say(G.dying, pick(PH.die)); }
    else afterDeaths();
  }
  function afterDeaths() {
    if (checkEnd()) return;
    if (G.round >= SD_ROUND) { seaTarget = seaY - SD_RISE; setPhase('rise'); S.rise(); banner('O MAR TÁ SUBINDO!', '#ff3b5c', 1.4); }
    else nextTurn();
  }
  function checkEnd() {
    const alive = teams.filter(teamAlive);
    if (alive.length > 1) return false;
    G.winner = alive[0] || null;
    setPhase('victory');
    if (G.winner) {
      for (const c of G.winner.calangos) if (!c.dead) { c.cel = 1; say(c, pick(['ÊÊÊÊ!', 'É CAMPEÃO!', 'UHUUU!', 'OLÊ, OLÊ!', 'CHUPA!'])); }
      banner(`${G.winner.name} VENCEU!`, G.winner.color, 3.6);
    } else banner('EMPATE! NÃO SOBROU NINGUÉM', '#ffffff', 3.6);
    S.fanfare();
    return true;
  }

  function step(dt) {
    G.t += dt;
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
    const c = G.active;
    let ctl = null;
    if (c && !c.dead && (G.phase === 'aim' || G.phase === 'fired')) {
      ctl = human(c) ? humanCtl() : aiCtl(c, dt);
      if (G.phase === 'aim') turnControl(c, ctl, dt);
      else {
        // FOGO de novo durante a fuga encerra a vez mais cedo
        if (ctl.press && human(c) && G.t > 0.4) G.retreat = 0;
        ctl.press = false; ctl.held = false;
      }
    } else drainInput();
    for (const o of calangos) updateCalango(o, dt, o === c && G.phase !== 'death' ? ctl : null);
    updateProjs(dt);
    updateCrates(dt);
    if (urubu) updateUrubu(dt);
    switch (G.phase) {
      case 'intro': if (G.t > 1.8 && quiet()) nextTurn(); break;
      case 'drop': if (G.t > 2.6 || !crates.some(b => b.air)) beginTurn(); break;
      case 'handoff': if (inp.confirm) { inp.confirm = false; setPhase('pre'); announce(); } break;
      case 'pre': if (G.t > 1.2) startAim(); break;
      case 'aim': if (G.endSoon) endTurn(); break;
      case 'fired': G.retreat -= dt; if (G.retreat <= 0) endTurn(); break;
      case 'settle':
        if (quiet()) { G.quietT += dt; if (G.quietT > 0.45) resolve(); } else G.quietT = 0;
        if (G.t > 14) resolve();
        break;
      case 'death':
        if (G.t > 1.0 && !G.dying.dead) kill(G.dying);
        if (G.t > 1.7) nextDeath();
        break;
      case 'rise':
        seaY = Math.max(seaTarget, seaY - dt * SD_RISE / 1.2);
        if (G.t > 1.7 && !checkEnd()) nextTurn();
        break;
      case 'victory':
        if (G.winner && Math.random() < dt * 8) {
          const w = G.winner.calangos.find(o => !o.dead) || G.winner.calangos[0];
          spark(w.x + rand(-90, 90), w.y - 120, 6, [G.winner.color, '#ffffff', '#7dff3a', '#ffd400'], 140, 160, 1.4, 3);
        }
        if (G.t > 3.8) { G.phase = 'done'; if (G.demo) newMatch(true); else gameOver(); }
        break;
    }
  }

  // Controle do calango da vez durante a mira: tempo, carga, alvo e disparo.
  function turnControl(c, ctl, dt) {
    const w = WEAPONS[G.weapon];
    G.timer -= dt;
    const sec = Math.ceil(G.timer);
    if (sec !== G.lastSec) { G.lastSec = sec; if (sec <= 5 && sec > 0 && human(c)) S.tick(sec <= 2); }
    if (G.timer <= 0) { if (!G.sling) say(c, pick(PH.late)); endTurn(); return; }
    if (w.kind === 'target') {
      if (!G.cursor) G.cursor = { x: clamp(c.x + c.face * 170, 20, WW - 20), y: c.y - 110 };
      if (ctl.move || ctl.aim) {
        G.cursor.x = clamp(G.cursor.x + ctl.move * 430 * dt, 0, WW);
        G.cursor.y = clamp(G.cursor.y - ctl.aim * 430 * dt, -300, WH);
        G.cursorT = 1.2;
      }
      ctl.move = 0; ctl.aim = 0;
      if (ctl.press && !c.air) {
        if (w.id === 'teleporte' && !validSpot(G.cursor.x, G.cursor.y)) { S.buzz(); popup(G.cursor.x, G.cursor.y - 22, 'AÍ NÃO DÁ!', '#ff3b5c'); }
        else fire(c, w, 1);
      }
      return;
    }
    if (w.kind === 'charge') {
      if (ctl.press && !c.charging && !c.air) { c.charging = true; c.power = 0; G.chargeT = 0; }
      if (c.charging) {
        c.power = Math.min(1, c.power + dt / CHARGE_T);
        G.chargeT -= dt;
        if (G.chargeT <= 0) { G.chargeT = 0.05; S.charge(c.power); }
        if (!ctl.held || c.power >= 1) fire(c, w, c.power);
      }
    } else if (ctl.press && !c.air) fire(c, w, 1);
  }

  function fire(c, w, power) {
    const team = teams[c.team];
    c.charging = false;
    if (ammoOf(team, w.id) <= 0) { S.buzz(); return; }
    const use = () => { if (!cheatAmmo(team) && isFinite(team.ammo[w.id])) team.ammo[w.id]--; };
    const ca = Math.cos(c.aim), sa = Math.sin(c.aim);
    const mx = c.x + c.face * ca * 14, my = c.y - 9 - sa * 14;
    G.firedWeapon = w.name; G.shooter = c;
    if (w.kind === 'charge') {
      use();
      const sp = V_MIN + (V_MAX - V_MIN) * power, d = PROJ[w.id], inside = solid(mx, my);
      const p = launch(w.id, inside ? c.x : mx, inside ? c.y - 9 : my, c.face * ca * sp, -sa * sp, c, w.id === 'caju' ? team.fuse : undefined);
      if (inside && d.hit) detonate(p);
      S.fire();
      if (w.id === 'feijoada') banner('SAIU A FEIJOADA!', '#ffd400', 1.5);
    } else if (w.id === 'estilingue') {
      if (!G.sling) use();
      slingShot(c);
      G.sling++;
      if (G.sling < 2) return;
    } else if (w.id === 'chinelo') { use(); slap(c); }
    else if (w.id === 'dinamite') { use(); launch('dinamite', c.x + c.face * 7, c.y - 6, c.face * 50, -80, c); say(c, 'ANARRIÊ! CORRE!'); }
    else if (w.id === 'mangas') { use(); callUrubu(G.cursor.x); say(c, 'Ô URUBU, CAPRICHA!'); }
    else if (w.id === 'pa') { use(); const a = clamp(c.aim, -0.75, 0.75); c.dig = { t: 1.7, dx: c.face * Math.cos(a), dy: -Math.sin(a), ct: 0, st: 0 }; }
    else if (w.id === 'teleporte') { use(); teleport(c, G.cursor.x, G.cursor.y); }
    G.cursor = null;
    closeMenu();
    setPhase('fired'); G.retreat = RETREAT_T;
    // a CPU só usa o tempo de fuga quando precisa correr (dinamite)
    if (!human(c) && !(ai && ai.flee)) G.retreat = 1.2;
    if (ammoOf(team, w.id) <= 0) team.weapon = 0;
  }

  /* =====================================================================
     CPU
     ===================================================================== */
  const simP = { kind: '', x: 0, y: 0, vx: 0, vy: 0, t: 0, owner: null, windK: 0, bounce: 0, hit: false, fuse: undefined, rest: false };
  function simReset(x, y, vx, vy, owner, windK, bounce, hit, fuse) {
    const p = simP;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.owner = owner; p.windK = windK; p.bounce = bounce; p.hit = hit; p.fuse = fuse; p.rest = false;
    return p;
  }
  function simulate(p, maxT) {
    for (let t = 0; t < maxT; t += STEP) { const r = projStep(p, STEP, true); if (r) return r; }
    return 'timeout';
  }
  function simShot(c, id, face, a, pw, fuse, windAware) {
    const d = PROJ[id], ca = Math.cos(a), sa = Math.sin(a);
    let mx = c.x + face * ca * 14, my = c.y - 9 - sa * 14;
    if (solid(mx, my)) { if (d.hit) return { x: mx, y: my }; mx = c.x; my = c.y - 9; }
    const sp = V_MIN + (V_MAX - V_MIN) * pw;
    const p = simReset(mx, my, face * ca * sp, -sa * sp, c, d.wind ? windAware : 0, d.bounce || 0, !!d.hit, id === 'caju' ? fuse : d.fuse);
    const r = simulate(p, 6.5);
    return r === 'hit' || r === 'fuse' ? p : null;
  }
  function simDrop(x, windAware) {
    const p = simReset(x, -100, 0, 0, null, windAware, 0, true, undefined);
    return simulate(p, 6) === 'hit' ? p : null;
  }
  function knockSim(o, face) {
    const p = simReset(o.x, o.y - 9, face * Math.cos(0.6) * SLAP.push, -Math.sin(0.6) * SLAP.push, null, 0, 0, false, undefined);
    return simulate(p, 5);
  }
  // Vale do ponto de explosão: dano nos inimigos menos (bem mais) o dano nos amigos e em si mesmo.
  function evalBlast(x, y, R, dmg, me) {
    let s = 0;
    for (const o of calangos) {
      if (o.dead || o.hp <= 0) continue;
      const d = Math.hypot(o.x - x, o.y - 8 - y);
      if (d < R + 10) {
        const f = 1 - d / (R + 10), dd = Math.min(o.hp, dmg * Math.min(1, f * 1.3)), kill = dd >= o.hp;
        if (o.team !== me.team) s += dd + (kill ? 40 : 0);
        else s -= dd * (o === me ? 2.2 : 1.4) + (kill ? 80 : 0);
      } else if (o.team !== me.team) s += Math.max(0, 6 - d / 40);
    }
    return s;
  }
  function blastScore(id, x, y, me) {
    const d = PROJ[id];
    const s = evalBlast(x, y, d.R, d.dmg, me);
    return id === 'coco' && s > 0 ? s * 1.3 : s;
  }
  function safeAhead(c, dir) {
    const x = c.x + dir * 12;
    if (x < 6 || x > WW - 6) return false;
    for (let y = c.y - 10; y < Math.min(seaY, c.y + 160); y += 2) if (solid(x, y)) return true;
    return false;
  }
  function fleePath(c, dir, dist) {
    for (let d = 6; d <= dist; d += 6) {
      const xx = c.x + dir * d;
      let ok = false;
      for (let y = c.y - 24; y <= c.y + 40; y += 2) if (solid(xx, y) && !blocked(xx, y - 1)) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }
  function nearestFoe(c) {
    let best = null, bd = Infinity;
    for (const o of calangos) if (!o.dead && o.hp > 0 && o.team !== c.team) { const d = Math.abs(o.x - c.x) + Math.abs(o.y - c.y); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  function* think(c, cfg) {
    const team = teams[c.team];
    const foes = calangos.filter(o => !o.dead && o.hp > 0 && o.team !== c.team);
    if (!foes.length) return null;
    let best = null, n = 0;
    const keep = p => { if (!best || p.score > best.score) { best = p; ai.best = p; } };
    syncHitTop();
    // chinelada: só colado no inimigo (e melhor ainda se ele estiver na beira do mar)
    for (const o of foes) {
      const dx = o.x - c.x;
      if (Math.abs(dx) < 24 && Math.abs(o.y - c.y) < 20) {
        const face = dx >= 0 ? 1 : -1;
        let s = Math.min(SLAP.dmg, o.hp) + (o.hp <= SLAP.dmg ? 40 : 0);
        if (knockSim(o, face) === 'water') s += 90;
        keep({ w: 'chinelo', face, angle: 0.6, power: 1, score: s + 4 });
      }
    }
    // estilingue: linha de tiro limpa até o inimigo
    for (const o of foes) {
      const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy);
      if (d < 30 || d > 700) continue;
      const face = dx >= 0 ? 1 : -1, ang = Math.atan2(-dy, Math.abs(dx));
      if (Math.abs(ang) > 1.45) continue;
      const h = rayHit(c, face, ang);
      if (h.c === o) keep({ w: 'estilingue', face, angle: ang, power: 1, score: evalBlast(h.x, h.y, SLING.R, SLING.dmg, c) * 1.7 });
    }
    yield;
    // tiros carregados: varre ângulo e força, depois refina em volta do melhor
    const ids = ['bazuca', 'caju', 'coco', 'feijoada'].filter(id => ammoOf(team, id) > 0);
    for (const id of ids) {
      const value = id === 'coco' ? 0.85 : 1;
      const fuses = id === 'caju' ? [2, 3] : [0];
      let here = null;
      for (const fz of fuses) for (const face of [-1, 1]) for (let a = -0.5; a <= 1.43; a += 0.08) for (let pw = 0.18; pw <= 1.001; pw += 0.05) {
        const r = simShot(c, id, face, a, Math.min(1, pw), fz, cfg.wind);
        if (r) {
          const plan = { w: id, face, angle: a, power: Math.min(1, pw), fuse: fz, score: blastScore(id, r.x, r.y, c) * value };
          keep(plan);
          if (!here || plan.score > here.score) here = plan;
        }
        if (++n % 24 === 0) yield;
      }
      if (here && here.score > 0) {
        const b = here;
        for (let da = -0.06; da <= 0.0601; da += 0.02) for (let dp = -0.04; dp <= 0.0401; dp += 0.01) {
          const a = b.angle + da, pw = clamp(b.power + dp, 0.05, 1);
          const r = simShot(c, id, b.face, a, pw, b.fuse, cfg.wind);
          if (r) keep({ ...b, angle: a, power: pw, score: blastScore(id, r.x, r.y, c) * value });
          if (++n % 24 === 0) yield;
        }
      }
    }
    // chuva de mangas
    if (ammoOf(team, 'mangas') > 0) {
      for (const o of foes) for (let tx = o.x - 240; tx <= o.x + 240; tx += 12) {
        let s = 0;
        for (let i = -2; i <= 2; i++) { const r = simDrop(tx + i * 34, cfg.wind); if (r) s += evalBlast(r.x, r.y, PROJ.manga.R, PROJ.manga.dmg, c); }
        keep({ w: 'mangas', face: c.face, angle: c.aim, power: 1, target: { x: tx, y: o.y - 80 }, score: s * 0.8 });
        if (++n % 3 === 0) yield;
      }
    }
    // dinamite: inimigo colado e caminho livre para fugir
    if (ammoOf(team, 'dinamite') > 0) {
      for (const o of foes) {
        const dx = o.x - c.x;
        if (Math.abs(dx) > 40 || Math.abs(o.y - c.y) > 26) continue;
        const flee = dx >= 0 ? -1 : 1;
        if (!fleePath(c, flee, 110)) continue;
        const ox = c.x;
        c.x += flee * 110;
        const s = evalBlast(ox - flee * 7, c.y - 8, PROJ.dinamite.R, PROJ.dinamite.dmg, c) * 0.9;
        c.x = ox;
        keep({ w: 'dinamite', face: -flee, angle: c.aim, power: 1, flee, score: s });
      }
    }
    return best;
  }

  function aiStart(c) {
    const cfg = AI[teams[c.team].level];
    ai = { c, cfg, mode: 'wait', t: 0.5 + Math.random() * 0.6, gen: null, best: null, result: undefined, tries: 0, thinkT: 0, walkDir: 0, walkT: 0, stuckT: 0, jumps: 0, lastX: c.x, plan: null, flee: 0, holdT: 0 };
    if (Math.random() < cfg.wander) { ai.mode = 'walk'; ai.walkDir = Math.random() < 0.5 ? -1 : 1; ai.walkT = rand(0.4, 1.0); }
  }
  function aiThink() {
    ai.mode = 'think'; ai.thinkT = 0; ai.best = null; ai.result = undefined;
    ai.gen = think(ai.c, ai.cfg);
  }
  // Chamado uma vez por quadro: avança a busca dentro de um orçamento de ~5 ms.
  function aiFrame() {
    if (!ai || ai.mode !== 'think' || ai.result !== undefined || !ai.gen) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 5) {
      const r = ai.gen.next();
      if (r.done) { ai.result = r.value || null; break; }
    }
  }
  function aiDecide(best) {
    const c = ai.c, cfg = ai.cfg, team = teams[c.team];
    if ((!best || best.score < 10) && ai.tries < 2 && G.timer > 16) {
      const foe = nearestFoe(c);
      if (foe && Math.abs(foe.x - c.x) > 40) {
        ai.tries++; ai.mode = 'walk'; ai.walkDir = foe.x > c.x ? 1 : -1; ai.walkT = rand(1.2, 2.6);
        ai.stuckT = 0; ai.jumps = 0; ai.lastX = c.x;
        return;
      }
    }
    if (!best || best.score < -2) { say(c, pick(PH.pass)); endTurn(); return; }
    const plan = { ...best };
    const kind = WEAPONS[W_BY[plan.w]].kind;
    if (kind !== 'melee' && kind !== 'drop' && kind !== 'target') plan.angle = clamp(plan.angle + gauss() * cfg.angErr, -1.45, 1.45);
    if (kind === 'charge') plan.power = clamp(plan.power + gauss() * cfg.powErr, 0.05, 1);
    if (plan.target) plan.target = { x: plan.target.x + gauss() * cfg.angErr * 400, y: plan.target.y };
    ai.plan = plan; ai.flee = plan.flee || 0;
    G.weapon = W_BY[plan.w]; team.weapon = G.weapon;
    if (plan.fuse) team.fuse = plan.fuse;
    if (plan.face) c.face = plan.face;
    ai.mode = 'aim'; ai.holdT = 0;
  }
  function aiCtl(c, dt) {
    const ctl = { move: 0, aim: 0, held: false, press: false, jump: false, back: false };
    if (!ai || ai.c !== c) return ctl;
    const stuckCheck = () => {
      if (Math.abs(c.x - ai.lastX) < 0.01) { ai.stuckT += dt; if (ai.stuckT > 0.3) { ctl.jump = true; ai.stuckT = 0; ai.jumps++; } }
      else ai.stuckT = 0;
      ai.lastX = c.x;
    };
    if (G.phase === 'fired') {
      if (ai.flee && G.retreat > 0.3 && !c.air && safeAhead(c, ai.flee)) { ctl.move = ai.flee; stuckCheck(); }
      return ctl;
    }
    switch (ai.mode) {
      case 'wait':
        ai.t -= dt;
        if (ai.t <= 0) aiThink();
        break;
      case 'walk':
        ai.walkT -= dt;
        if (c.air) break;
        if (ai.walkT <= 0 || ai.jumps > 2 || G.timer < 14 || !safeAhead(c, ai.walkDir)) { aiThink(); break; }
        ctl.move = ai.walkDir;
        stuckCheck();
        break;
      case 'think':
        ai.thinkT += dt;
        if (ai.best && !c.air) {
          if (ai.best.face) c.face = ai.best.face;
          c.aim += clamp(ai.best.angle - c.aim, -2.2 * dt, 2.2 * dt);
        }
        if (ai.result !== undefined && ai.thinkT >= ai.cfg.think) aiDecide(ai.result);
        break;
      case 'aim': {
        const p = ai.plan, w = WEAPONS[G.weapon];
        if (c.air) break;
        c.face = p.face || c.face;
        if (w.kind === 'target') {
          if (!G.cursor) G.cursor = { x: c.x, y: c.y - 100 };
          G.cursor.x += (p.target.x - G.cursor.x) * Math.min(1, dt * 4);
          G.cursor.y += (p.target.y - G.cursor.y) * Math.min(1, dt * 4);
          G.cursorT = 0.5;
          ai.holdT += dt;
          if (ai.holdT > 0.9) ai.mode = 'fire';
          break;
        }
        const d = p.angle - c.aim;
        if (Math.abs(d) > 0.004) ctl.aim = clamp(d / (1.5 * dt), -1, 1);
        else { ai.holdT += dt; if (ai.holdT > 0.25) ai.mode = 'fire'; }
        break;
      }
      case 'fire': {
        const p = ai.plan, w = WEAPONS[G.weapon];
        if (c.air) break;
        if (w.kind === 'charge') {
          if (!c.charging) { ctl.press = true; ctl.held = true; }
          else if (c.power + STEP / CHARGE_T >= p.power) { c.power = p.power - STEP / CHARGE_T; ctl.held = false; ai.mode = 'done'; }
          else ctl.held = true;
        } else {
          if (w.kind === 'target') G.cursor = { x: p.target.x, y: p.target.y };
          ctl.press = true;
          ai.mode = 'done';
        }
        break;
      }
      case 'done':
        if (G.weapon === W_BY.estilingue && G.sling === 1) {
          ai.plan.angle = clamp(ai.plan.angle + gauss() * ai.cfg.angErr * 0.5, -1.45, 1.45);
          ai.mode = 'aim'; ai.holdT = 0;
        }
        break;
    }
    return ctl;
  }

  /* =====================================================================
     ÍCONES DAS ARMAS (desenhados numa caixa de 40×40)
     ===================================================================== */
  function manga(g, x, y, a, s = 1) {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    g.fillStyle = '#ffb000'; g.beginPath(); g.ellipse(0, 0, 6.5, 4.6, 0, 0, TAU); g.fill();
    g.fillStyle = '#ff5a1a'; g.beginPath(); g.ellipse(1.5, 0.8, 4.6, 3.4, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#39ff14'; g.beginPath(); g.ellipse(-6, -2.5, 3, 1.4, -0.6, 0, TAU); g.fill();
    g.restore();
  }
  function drawIcon(g, id, s) {
    g.save();
    g.scale(s / 40, s / 40); g.translate(20, 20);
    g.lineCap = 'round'; g.lineJoin = 'round';
    switch (id) {
      case 'bazuca':
        g.rotate(-0.55);
        g.fillStyle = '#ffb000'; g.beginPath(); g.moveTo(-15, -3.5); g.lineTo(-22, 0); g.lineTo(-15, 3.5); g.fill();
        g.fillStyle = '#8bd450'; g.fillRect(-15, -5, 30, 10);
        g.fillStyle = '#4f7a2a'; for (const x of [-7, 1, 9]) g.fillRect(x, -5, 2, 10);
        g.fillStyle = '#c6ff9a'; g.fillRect(-15, -5, 30, 2);
        g.fillStyle = '#ff4f1a'; g.beginPath(); g.moveTo(15, -5); g.lineTo(21, 0); g.lineTo(15, 5); g.fill();
        break;
      case 'caju':
        g.fillStyle = '#ff3b2a'; g.beginPath(); g.moveTo(-8, -3); g.bezierCurveTo(-13, 9, -6, 17, 0, 17); g.bezierCurveTo(6, 17, 13, 9, 8, -3); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,212,0,0.75)'; g.beginPath(); g.ellipse(-3, 3, 3, 6, 0.2, 0, TAU); g.fill();
        g.fillStyle = '#b07a42'; g.beginPath(); g.ellipse(0, -7, 8.5, 4.5, 0.25, 0, TAU); g.fill();
        g.strokeStyle = '#d0d0e0'; g.lineWidth = 2; g.beginPath(); g.arc(8, -13, 3.2, 0, TAU); g.stroke();
        break;
      case 'coco':
        g.fillStyle = '#7a4a24'; g.beginPath(); g.arc(0, 3, 13, 0, TAU); g.fill();
        g.fillStyle = '#4a2a12'; for (const [x, y] of [[-4, -1], [4, -1], [0, 5]]) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
        g.strokeStyle = '#e0e0e0'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(2, -15, 6, -16); g.stroke();
        g.fillStyle = '#ffd400'; g.beginPath(); g.arc(7, -17, 2.6, 0, TAU); g.fill();
        break;
      case 'estilingue':
        g.strokeStyle = '#a0662e'; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(0, 18); g.lineTo(0, 3); g.lineTo(-9, -12); g.moveTo(0, 3); g.lineTo(9, -12); g.stroke();
        g.strokeStyle = '#ff3b5c'; g.lineWidth = 2; g.beginPath(); g.moveTo(-9, -11); g.lineTo(0, -2); g.lineTo(9, -11); g.stroke();
        g.fillStyle = '#c8c4cc'; g.beginPath(); g.arc(0, -2, 3, 0, TAU); g.fill();
        break;
      case 'chinelo':
        g.rotate(-0.5);
        g.fillStyle = '#3b7bff'; g.beginPath(); g.ellipse(0, 0, 9, 17, 0, 0, TAU); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
        g.lineWidth = 3; g.beginPath(); g.moveTo(-7, 3); g.lineTo(0, -8); g.lineTo(7, 3); g.stroke();
        break;
      case 'dinamite': {
        g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.moveTo(-19, -15); g.quadraticCurveTo(0, -9, 19, -15); g.stroke();
        const cols = ['#ff3b5c', '#ffd400', '#00e5ff', '#7dff3a', '#ff2bd6'];
        for (let i = 0; i < 5; i++) { const x = -15 + i * 7.5, y = -14 + Math.sin((i + 0.5) / 5 * Math.PI) * 2.6; g.fillStyle = cols[i]; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.lineTo(x, y + 5); g.fill(); }
        g.fillStyle = '#e8283c'; g.fillRect(-6, -4, 12, 22);
        g.fillStyle = '#ffd400'; g.fillRect(-6, 0, 12, 2); g.fillRect(-6, 11, 12, 2);
        g.strokeStyle = '#e0e0e0'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(2, -8, 6, -8); g.stroke();
        g.fillStyle = '#fff27a'; g.beginPath(); g.arc(7, -8, 2.6, 0, TAU); g.fill();
        break;
      }
      case 'mangas':
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5;
        for (const x of [-9, 4, 9]) { g.beginPath(); g.moveTo(x, -19); g.lineTo(x, -11); g.stroke(); }
        manga(g, -9, -4, 1.2); manga(g, 4, -7, 1.4); manga(g, 9, 9, 1.1);
        break;
      case 'pa':
        g.rotate(0.6);
        g.strokeStyle = '#a0662e'; g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 6); g.moveTo(-5, -18); g.lineTo(5, -18); g.stroke();
        g.fillStyle = '#c8d0e0'; g.beginPath(); g.moveTo(-7.5, 5); g.lineTo(7.5, 5); g.lineTo(7.5, 12); g.lineTo(0, 19); g.lineTo(-7.5, 12); g.closePath(); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke();
        break;
      case 'teleporte':
        g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 11, 14, 4.5, 0, 0, TAU); g.stroke();
        g.strokeStyle = '#ff2bd6'; g.lineWidth = 2;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, 4 - i * 7, 10 - i * 3, 3, 0, 0.3, Math.PI * 1.7); g.stroke(); }
        g.fillStyle = '#ffffff'; g.beginPath();
        for (let i = 0; i < 8; i++) { const r = i % 2 ? 2 : 7, a = i * Math.PI / 4; g.lineTo(Math.cos(a) * r, -14 + Math.sin(a) * r); }
        g.fill();
        break;
      case 'feijoada':
        g.fillStyle = '#26222e'; g.beginPath(); g.ellipse(0, 5, 15, 12, 0, 0, TAU); g.fill();
        g.fillStyle = '#4a4458'; g.fillRect(-17, -7, 34, 4); g.fillRect(-20, -4, 5, 3); g.fillRect(15, -4, 5, 3);
        g.fillStyle = '#ffd400';
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.beginPath(); g.moveTo(0, 5); g.arc(0, 5, 9, a - 0.5, a + 0.5); g.closePath(); g.fill(); }
        g.fillStyle = '#26222e'; g.beginPath(); g.arc(0, 5, 2.8, 0, TAU); g.fill();
        g.fillStyle = '#ffd400'; g.beginPath(); g.arc(0, 5, 1.6, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.6;
        for (const x of [-6, 0, 6]) { g.beginPath(); g.moveTo(x, -9); g.quadraticCurveTo(x + 3, -13, x, -16); g.quadraticCurveTo(x - 3, -19, x, -21); g.stroke(); }
        break;
    }
    g.restore();
  }

  /* =====================================================================
     ENTRADA
     ===================================================================== */
  const keys = {};
  const touch = { left: false, right: false, up: false, down: false, fire: false };
  const inp = { press: false, jump: false, back: false, confirm: false };
  let padState = null, jumpPending = 0, lastJumpTap = 0;
  function drainInput() { inp.press = false; inp.jump = false; inp.back = false; }
  const NO_CTL = () => ({ move: 0, aim: 0, held: false, press: false, jump: false, back: false });

  function humanCtl() {
    if (menuOpen) { drainInput(); return NO_CTL(); }
    let move = (keys.arrowright || touch.right ? 1 : 0) - (keys.arrowleft || touch.left ? 1 : 0);
    let aim = (keys.arrowup || touch.up ? 1 : 0) - (keys.arrowdown || touch.down ? 1 : 0);
    const g = padState;
    if (g) {
      if (!move && Math.abs(g.lx) > 0.45) move = Math.sign(g.lx);
      if (!aim && Math.abs(g.ly) > 0.3) aim = clamp(-g.ly, -1, 1);
    }
    const held = !!(keys[' '] || touch.fire || (g && (g.x || g.rt)));
    const ctl = { move, aim, held, press: inp.press, jump: inp.jump, back: inp.back };
    drainInput();
    if (move || ctl.jump || ctl.back || ctl.press) cam.manualT = 0;
    return ctl;
  }

  /* ---------- menu de armas ---------- */
  const wMenu = $('wMenu'), wGrid = $('wGrid'), wFuse = $('wFuse'), wDesc = $('wDesc');
  let menuOpen = false, wmCur = 0;
  const wButtons = WEAPONS.map((w, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 80;
    drawIcon(cv.getContext('2d'), w.id, 80);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = w.short;
    const am = document.createElement('span'); am.className = 'am';
    b.append(cv, n, am);
    if (w.legend) b.classList.add('legend');
    b.addEventListener('click', () => chooseWeapon(i));
    b.addEventListener('pointerenter', () => { if (menuOpen) { wmCur = i; syncWMenu(); } });
    wGrid.append(b);
    return { b, am };
  });
  wFuse.innerHTML = '<span>PAVIO DO CAJU:</span>' + [1, 2, 3, 4, 5].map(f => `<button type="button" data-fuse="${f}">${f}s</button>`).join('');
  wFuse.addEventListener('click', e => {
    const b = e.target.closest('[data-fuse]');
    if (!b || !canChoose()) return;
    teams[G.active.team].fuse = +b.dataset.fuse;
    tone(880, 0.05, 'square', 0.05);
    syncWMenu();
  });
  wMenu.addEventListener('pointerdown', e => { if (e.target === wMenu) closeMenu(); });
  wMenu.addEventListener('contextmenu', e => { e.preventDefault(); closeMenu(); });

  const canChoose = () => state === 'play' && G && G.phase === 'aim' && human(G.active) && !G.active.charging && !G.sling;
  function openMenu() {
    if (!canChoose()) return;
    menuOpen = true; wMenu.hidden = false; wmCur = G.weapon;
    syncWMenu();
    tone(520, 0.05, 'square', 0.04);
  }
  function closeMenu() { menuOpen = false; wMenu.hidden = true; }
  function toggleMenu() { if (menuOpen) closeMenu(); else openMenu(); }
  function syncWMenu() {
    if (!G || !G.active) return;
    const team = teams[G.active.team];
    WEAPONS.forEach((w, i) => {
      const a = ammoOf(team, w.id), { b, am } = wButtons[i];
      b.disabled = a <= 0;
      am.textContent = a === Infinity ? '∞' : a > 0 ? '×' + a : w.id === 'mangas' && !theme.air ? 'TETO' : '0';
      b.classList.toggle('sel', i === G.weapon);
      b.classList.toggle('cur', i === wmCur);
      b.title = `${i < 9 ? i + 1 : 0} · ${w.name}`;
    });
    const w = WEAPONS[wmCur];
    wDesc.textContent = `${w.name}: ${w.desc}`;
    wFuse.hidden = w.id !== 'caju' && WEAPONS[G.weapon].id !== 'caju';
    for (const b of wFuse.querySelectorAll('button')) b.classList.toggle('on', +b.dataset.fuse === team.fuse);
  }
  function selectWeapon(i) {
    if (!canChoose()) return false;
    const team = teams[G.active.team], w = WEAPONS[i];
    if (!w || ammoOf(team, w.id) <= 0) { S.buzz(); return false; }
    if (i !== G.weapon) popup(G.active.x, G.active.y - 46, w.short, '#ffffff', 0.85);
    G.weapon = i; team.weapon = i; G.cursor = null;
    tone(660, 0.05, 'square', 0.05);
    return true;
  }
  function chooseWeapon(i) { if (selectWeapon(i)) closeMenu(); else if (menuOpen) syncWMenu(); }
  function cycleWeapon(d) {
    if (!canChoose()) return;
    const team = teams[G.active.team], n = WEAPONS.length;
    for (let s = 1; s <= n; s++) {
      const i = (G.weapon + d * s + n * 2) % n;
      if (ammoOf(team, WEAPONS[i].id) > 0) { selectWeapon(i); if (menuOpen) { wmCur = i; syncWMenu(); } return; }
    }
  }
  function cycleFuse() {
    if (!canChoose()) return;
    const t = teams[G.active.team];
    t.fuse = (t.fuse % 5) + 1;
    popup(G.active.x, G.active.y - 46, `PAVIO ${t.fuse} s`, '#ffd400', 0.85);
    tone(880, 0.05, 'square', 0.05);
    if (menuOpen) syncWMenu();
  }
  function menuKey(key) {
    const n = WEAPONS.length;
    if (key === 'arrowleft') wmCur = (wmCur + n - 1) % n;
    else if (key === 'arrowright') wmCur = (wmCur + 1) % n;
    else if (key === 'arrowup') wmCur = (wmCur + n - 5) % n;
    else if (key === 'arrowdown') wmCur = (wmCur + 5) % n;
    else if (key === 'enter' || key === ' ') { chooseWeapon(wmCur); return; }
    else if (key === 'w') { closeMenu(); return; }
    else if (key === 'f') { cycleFuse(); return; }
    else if (/^[0-9]$/.test(key)) { chooseWeapon(key === '0' ? 9 : +key - 1); return; }
    syncWMenu();
  }

  /* ---------- teclado ---------- */
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    const playing = state === 'play';
    if (key.startsWith('arrow') || key === ' ' || (playing && (key === 'tab' || key === 'backspace'))) e.preventDefault();
    if (key === 'm') { Arcade.toggleMute(); return; }
    if (key === 'escape' && menuOpen) { closeMenu(); return; }
    if (key === 'p' || key === 'escape') { togglePause(); return; }
    if (state === 'menu' || state === 'over') {
      const onButton = e.target.closest && e.target.closest('button');
      if ((key === 'enter' || key === ' ') && !onButton && !e.repeat && (state === 'menu' || overT > 1)) start();
      return;
    }
    if (!playing) return;
    keys[key] = true;
    if (e.repeat) return;
    if (menuOpen) { menuKey(key); return; }
    if (G.phase === 'handoff') { if (key === ' ' || key === 'enter') inp.confirm = true; return; }
    if (key === ' ') inp.press = true;
    else if (key === 'enter') inp.jump = true;
    else if (key === 'backspace') inp.back = true;
    else if (key === 'tab') cycleWeapon(e.shiftKey ? -1 : 1);
    else if (key === 'e') cycleWeapon(1);
    else if (key === 'q') cycleWeapon(-1);
    else if (key === 'w') openMenu();
    else if (key === 'f') cycleFuse();
    else if (/^[0-9]$/.test(key)) selectWeapon(key === '0' ? 9 : +key - 1);
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const kk in keys) keys[kk] = false; });

  /* ---------- mouse e toque no mapa ---------- */
  const ptrs = new Map();
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: cam.x + ((e.clientX - r.left) / r.width) * VW, y: cam.y + ((e.clientY - r.top) / r.height) * VH };
  }
  function tapAt(w) {
    if (state !== 'play' || !G) return;
    if (G.phase === 'handoff') { inp.confirm = true; return; }
    const c = G.active;
    if (G.phase !== 'aim' || !human(c) || menuOpen) return;
    const wp = WEAPONS[G.weapon];
    if (wp.kind === 'target') {
      if (G.cursor && Math.hypot(G.cursor.x - w.x, G.cursor.y - w.y) < 26 * ui) inp.press = true;
      else { G.cursor = { x: clamp(w.x, 0, WW), y: clamp(w.y, -300, WH) }; G.cursorT = 1; tone(880, 0.04, 'square', 0.04); }
      return;
    }
    if (c.charging) return;
    const dx = w.x - c.x, dy = (c.y - 9) - w.y;
    if (Math.abs(dx) > 2) c.face = dx > 0 ? 1 : -1;
    c.aim = clamp(Math.atan2(dy, Math.abs(dx)), -1.45, 1.45);
  }
  canvas.addEventListener('pointerdown', e => {
    Sfx.ensure();
    e.preventDefault();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button, moved: false });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
  });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > 10) p.moved = true;
    if (p.moved && state === 'play') {
      const n = ptrs.size;
      cam.x -= (dx * ui) / n; cam.y -= (dy * ui) / n;
      cam.manualT = 3;
      clampCam();
    }
  });
  const endPtr = e => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const many = ptrs.size > 1;
    ptrs.delete(e.pointerId);
    if (p.moved || many || e.type === 'pointercancel') return;
    if (p.btn === 2) { if (state === 'play') toggleMenu(); return; }
    if (p.btn === 0) tapAt(toWorld(e));
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (state !== 'play') return;
    e.preventDefault();
    if (e.shiftKey) cam.y += e.deltaY * ui * 0.6;
    else { cam.x += (e.deltaX + e.deltaY) * ui * 0.6; }
    cam.manualT = 3;
    clampCam();
  }, { passive: false });

  /* ---------- botões na tela ---------- */
  function holdBtn(el, name, onDown) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      Sfx.ensure();
      if (name) touch[name] = true;
      el.classList.add('hold');
      if (onDown) onDown();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    });
    const up = () => { if (name) touch[name] = false; el.classList.remove('hold'); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  holdBtn($('bLeft'), 'left', () => { if (menuOpen) menuKey('arrowleft'); });
  holdBtn($('bRight'), 'right', () => { if (menuOpen) menuKey('arrowright'); });
  holdBtn($('bUp'), 'up', () => { if (menuOpen) menuKey('arrowup'); });
  holdBtn($('bDown'), 'down', () => { if (menuOpen) menuKey('arrowdown'); });
  holdBtn($('bFire'), 'fire', () => {
    if (state !== 'play' || !G) return;
    if (menuOpen) { chooseWeapon(wmCur); return; }
    if (G.phase === 'handoff') inp.confirm = true; else inp.press = true;
  });
  holdBtn($('bWeapon'), null, () => { if (state === 'play') toggleMenu(); });
  // PULO: um toque pula para a frente, dois toques rápidos dão o pulo para trás.
  holdBtn($('bJump'), null, () => {
    if (state !== 'play' || !G) return;
    if (G.phase === 'handoff') { inp.confirm = true; return; }
    const now = performance.now();
    if (jumpPending && now - lastJumpTap < 300) { jumpPending = 0; inp.back = true; }
    else { jumpPending = now + 300; lastJumpTap = now; }
  });

  /* ---------- controle de videogame ---------- */
  const padPrev = {};
  function pollPad(dt) {
    const g = Arcade.gamepad(0);
    padState = g;
    if (!g) return;
    const now = { a: g.a, b: g.b, x: g.x, y: g.y, lb: g.lb, rb: g.rb, lt: g.lt, rt: g.rt, start: g.start, L: g.lx < -0.5, R: g.lx > 0.5, U: g.ly < -0.5, D: g.ly > 0.5 };
    const edge = n => now[n] && !padPrev[n];
    if (edge('start')) togglePause();
    if (state === 'menu' || state === 'over') { if (edge('a') && (state === 'menu' || overT > 1)) start(); }
    else if (state === 'play' && G) {
      if (menuOpen) {
        if (edge('L')) menuKey('arrowleft');
        if (edge('R')) menuKey('arrowright');
        if (edge('U')) menuKey('arrowup');
        if (edge('D')) menuKey('arrowdown');
        if (edge('a') || edge('x')) chooseWeapon(wmCur);
        else if (edge('y') || edge('b')) closeMenu();
        if (edge('lt')) cycleFuse();
      } else if (G.phase === 'handoff') {
        if (edge('a') || edge('x') || edge('rt')) inp.confirm = true;
      } else {
        if (edge('a')) inp.jump = true;
        if (edge('b')) inp.back = true;
        if (edge('x') || edge('rt')) inp.press = true;
        if (edge('y')) openMenu();
        if (edge('lb')) cycleWeapon(-1);
        if (edge('rb')) cycleWeapon(1);
        if (edge('lt')) cycleFuse();
        if (g.rx || g.ry) { cam.x += g.rx * 900 * dt; cam.y += g.ry * 900 * dt; cam.manualT = 2; clampCam(); }
      }
    }
    for (const n of Object.keys(now)) padPrev[n] = now[n];
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

  /* =====================================================================
     CÂMERA
     ===================================================================== */
  function clampCam() {
    const minX = -80, maxX = WW - VW + 80;
    cam.x = maxX < minX ? (WW - VW) / 2 : clamp(cam.x, minX, maxX);
    const minY = -360, maxY = WH - VH;
    cam.y = maxY < minY ? (WH - VH) / 2 : clamp(cam.y, minY, maxY);
  }
  function camFocus() {
    if (!G) return null;
    if (projs.length) return projs[0];
    if (urubu) return { x: urubu.tx, y: -170 + VH * 0.55 };
    if (G.phase === 'drop') { const b = crates.find(q => q.air); if (b) return b; }
    if (G.phase === 'death' && G.dying) return G.dying;
    if ((G.phase === 'victory' || G.phase === 'done') && G.winner) return G.winner.calangos.find(c => !c.dead) || null;
    if (G.phase === 'aim' && G.cursor && G.cursorT > 0) return G.cursor;
    const c = G.active;
    return c && !c.gone ? c : null;
  }
  function updateCamera(dt) {
    const f = camFocus();
    if (cam.manualT > 0 && !projs.length && !urubu) cam.manualT -= dt;
    else if (f) {
      const sp = projs.length ? 6 : 3.2;
      cam.x += (f.x - VW / 2 - cam.x) * Math.min(1, dt * sp);
      cam.y += (f.y - VH * 0.56 - cam.y) * Math.min(1, dt * sp);
    }
    clampCam();
  }

  /* =====================================================================
     DESENHO
     ===================================================================== */
  const scan = document.createElement('canvas');
  function buildScan() {
    scan.width = canvas.width; scan.height = canvas.height;
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.13)';
    const st = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 240));
    for (let y = 0; y < scan.height; y += st) g.fillRect(0, y, scan.width, Math.max(1, st >> 1));
    const v = g.createRadialGradient(scan.width / 2, scan.height / 2, Math.min(scan.width, scan.height) * 0.35, scan.width / 2, scan.height / 2, Math.max(scan.width, scan.height) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = v; g.fillRect(0, 0, scan.width, scan.height);
  }
  const glowSpr = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,150,0.9)');
    gr.addColorStop(0.55, 'rgba(255,120,40,0.45)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  })();

  function waveY(x, ph) { return seaY + Math.sin(x * 0.02 + time * 2 + ph) * 3 + Math.sin(x * 0.051 - time * 3.1 + ph) * 1.6; }
  function drawSeaBack() {
    ctx.fillStyle = `rgba(${theme.sea},0.14)`;
    ctx.fillRect(cam.x - 20, seaY - 8, VW + 40, Math.max(WH, cam.y + VH) - seaY + 40);
  }
  function drawSeaFront() {
    const x0 = Math.floor((cam.x - 20) / 16) * 16, x1 = cam.x + VW + 36, bot = Math.max(WH, cam.y + VH) + 30, col = theme.sea;
    ctx.beginPath(); ctx.moveTo(x0, bot);
    for (let x = x0; x <= x1; x += 16) ctx.lineTo(x, waveY(x, 0));
    ctx.lineTo(x1, bot); ctx.closePath();
    const g = ctx.createLinearGradient(0, seaY - 4, 0, seaY + 160);
    g.addColorStop(0, `rgba(${col},0.5)`); g.addColorStop(0.35, 'rgba(14,6,40,0.82)'); g.addColorStop(1, 'rgba(4,2,14,0.95)');
    ctx.fillStyle = g; ctx.fill();
    ctx.save();
    ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 2.5; ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) { const y = waveY(x, 0); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) { const y = waveY(x, 2.1) + 16; if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = `rgba(${col},0.35)`;
    for (let i = 0; i < 14; i++) {
      const span = x1 - x0, x = x0 + ((i * 197 + time * (20 + i * 3)) % span);
      ctx.fillRect(x, seaY + 30 + (i % 5) * 16, 14 + (i % 3) * 8, 1.5);
    }
  }

  const BODY = '#7cc94a', BODY_D = '#4f8f2e', BELLY = '#d8f0a0';
  function isAiming(c) { return c === G.active && G.phase === 'aim' && !c.air && !c.dig && WEAPONS[G.weapon].kind !== 'target'; }
  function drawHeld(id, c) {
    if (id === 'bazuca') {
      ctx.fillStyle = '#8bd450'; ctx.fillRect(-3, -2.2, 17, 4.4);
      ctx.fillStyle = '#4f7a2a'; ctx.fillRect(3, -2.2, 1.2, 4.4); ctx.fillRect(9, -2.2, 1.2, 4.4);
      if (c.charging) { ctx.fillStyle = '#ffb000'; ctx.fillRect(-6, -1.2, 3, 2.4); }
      return;
    }
    ctx.save(); ctx.translate(7, 0); ctx.rotate(c ? c.aim : 0);
    drawIcon(ctx, id, 12);
    ctx.restore();
  }
  function drawCalango(c) {
    const col = teams[c.team].color, moving = c.walkT > 0 && !c.air;
    const bob = moving ? Math.abs(Math.sin(c.walkPh)) * 1.3 : 0;
    const flash = c.hurtT > 0 && Math.floor(c.hurtT * 20) % 2 === 0;
    const body = flash ? '#ffffff' : BODY, dark = flash ? '#d0d0d0' : BODY_D;
    const air = c.air, fast = air && c.vy > 320;
    ctx.save();
    ctx.translate(c.x, c.y - bob);
    ctx.scale(c.face, 1);
    if (c.flip) { ctx.translate(0, -8); ctx.rotate(-Math.min(1, c.flip) * TAU); ctx.translate(0, 8); }
    // cauda
    const sw = Math.sin(time * 3 + c.seed) * 2 + (air ? -4 : 0) + (moving ? Math.sin(c.walkPh) * 2 : 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark; ctx.lineWidth = 3.6;
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.quadraticCurveTo(-11, -3 + sw * 0.4, -18, -7 + sw); ctx.stroke();
    ctx.strokeStyle = body; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-5, -5.4); ctx.quadraticCurveTo(-11, -3.4 + sw * 0.4, -17, -7.3 + sw); ctx.stroke();
    // pernas
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const lx = i < 2 ? 4.5 : -3.5, side = i % 2 ? 1 : -1;
      const ph = c.walkPh + (i === 0 || i === 3 ? 0 : Math.PI);
      const fx = lx + (moving ? Math.sin(ph) * 2.6 : 0) + (air ? side * 2.5 : 0) + (i < 2 ? 1.5 : -1.5);
      const fy = air ? (fast ? -3 + Math.sin(time * 30 + i) * 1.5 : -1.5) : moving ? -Math.max(0, Math.cos(ph)) * 1.5 : 0;
      ctx.beginPath(); ctx.moveTo(lx, -4.5); ctx.lineTo(fx, fy); ctx.stroke();
    }
    // corpo
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -6.2, 7.6, 4.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : BELLY; ctx.beginPath(); ctx.ellipse(1, -4.3, 5.4, 1.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(-2.5, -8.4, 1.1, 0, TAU); ctx.arc(1.4, -9.3, 0.9, 0, TAU); ctx.fill();
    // cabeça, boca e olho
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(7.4, -9.6, 5.2, 3.8, -0.15, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 0.8; ctx.beginPath();
    if (c.cel > 0 || c.hurtT > 0 || fast) ctx.arc(10.2, -8.3, 1.5, 0, Math.PI);
    else { ctx.moveTo(8.6, -7.6); ctx.lineTo(12.2, -8.3); }
    ctx.stroke();
    const blink = ((time + c.seed) % 4) < 0.12;
    if (blink) { ctx.beginPath(); ctx.moveTo(7.6, -11); ctx.lineTo(10.6, -11); ctx.stroke(); }
    else {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(9.1, -11, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(9.6 + Math.cos(c.aim) * 0.5, -11 - Math.sin(c.aim) * 0.6, fast ? 0.6 : 1, 0, TAU); ctx.fill();
    }
    // capacete neon
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(6.8, -11.6, 4.8, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(3.2, -13, 7.2, 1.1);
    ctx.fillStyle = Math.sin(time * 6 + c.seed) > 0 ? '#ffffff' : col; ctx.beginPath(); ctx.arc(6.8, -16.7, 0.9, 0, TAU); ctx.fill();
    // arma na mão, chinelada e pá
    if (isAiming(c)) { ctx.save(); ctx.translate(3, -7.5); ctx.rotate(-c.aim); drawHeld(WEAPONS[G.weapon].id, c); ctx.restore(); }
    if (c.slapT > 0) { ctx.save(); ctx.translate(6, -9); ctx.rotate(-1.6 + (1 - c.slapT / 0.35) * 2.8); ctx.translate(4, -12); drawIcon(ctx, 'chinelo', 14); ctx.restore(); }
    if (c.dig) { ctx.save(); ctx.translate(12, -6); ctx.rotate(Math.sin(time * 30) * 0.4); drawIcon(ctx, 'pa', 12); ctx.restore(); }
    ctx.restore();
  }
  function drawTomb(c) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = '#8d8aa0';
    ctx.beginPath(); ctx.moveTo(-5.5, 0); ctx.lineTo(-5.5, -9); ctx.arc(0, -9, 5.5, Math.PI, 0); ctx.lineTo(5.5, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a5766'; ctx.fillRect(-0.8, -11.5, 1.6, 8); ctx.fillRect(-3, -9, 6, 1.6);
    const col = teams[c.team].color;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -14.2, 3.6, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawFloaters() {
    for (const f of floaters) {
      const y = seaY - 1 + Math.sin(f.t * 2.2 + f.x) * 1.8;
      ctx.save(); ctx.translate(f.x, y); ctx.rotate(Math.sin(f.t * 1.7) * 0.25);
      ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(0, 0, 4.8, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-3.6, -1.6, 7.2, 1.1);
      ctx.restore();
    }
  }
  function drawCrates() {
    for (const b of crates) {
      ctx.save(); ctx.translate(b.x, b.y);
      if (b.para) {
        ctx.rotate(Math.sin(b.t * 3) * 0.12);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-15, -36); ctx.lineTo(-6, -14); ctx.moveTo(15, -36); ctx.lineTo(6, -14); ctx.moveTo(0, -36); ctx.lineTo(0, -14); ctx.stroke();
        ctx.fillStyle = b.type === 'vida' ? '#7dff3a' : '#ffd400';
        ctx.beginPath(); ctx.arc(0, -36, 16, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(-5, -36); ctx.lineTo(5, -36); ctx.closePath(); ctx.fill();
      }
      if (b.type === 'vida') {
        ctx.fillStyle = '#f4f0ff'; ctx.fillRect(-8, -14, 16, 14);
        ctx.fillStyle = '#ff3b5c'; ctx.fillRect(-1.7, -12.5, 3.4, 11); ctx.fillRect(-5.5, -8.7, 11, 3.4);
      } else {
        ctx.fillStyle = '#ffd400'; ctx.fillRect(-8, -14, 16, 14);
        ctx.fillStyle = '#1a1030'; ctx.font = '900 11px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, -6.5);
      }
      ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 1; ctx.strokeRect(-8, -14, 16, 14);
      ctx.restore();
    }
  }
  function drawProjs() {
    for (const p of projs) {
      ctx.save(); ctx.translate(p.x, p.y);
      switch (p.kind) {
        case 'bazuca':
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillStyle = '#8bd450'; ctx.fillRect(-8, -2.5, 14, 5);
          ctx.fillStyle = '#4f7a2a'; ctx.fillRect(-3, -2.5, 1.2, 5); ctx.fillRect(2, -2.5, 1.2, 5);
          ctx.fillStyle = '#ff4f1a'; ctx.beginPath(); ctx.moveTo(6, -2.5); ctx.lineTo(10, 0); ctx.lineTo(6, 2.5); ctx.fill();
          break;
        case 'caju':
          ctx.rotate(p.rot); ctx.translate(-6, -6); drawIcon(ctx, 'caju', 12);
          break;
        case 'coco': case 'coquinho': {
          const r = p.kind === 'coco' ? 5.5 : 3.4;
          ctx.rotate(p.rot);
          ctx.fillStyle = '#7a4a24'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#4a2a12'; ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.3, r * 0.22, 0, TAU); ctx.arc(-r * 0.35, -r * 0.3, r * 0.22, 0, TAU); ctx.fill();
          break;
        }
        case 'dinamite':
          ctx.rotate(Math.sin(p.rot) * 0.15);
          ctx.fillStyle = '#e8283c'; ctx.fillRect(-2.6, -10, 5.2, 10);
          ctx.fillStyle = '#ffd400'; ctx.fillRect(-2.6, -7.5, 5.2, 1.2);
          ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(2, -12); ctx.stroke();
          break;
        case 'manga':
          manga(ctx, 0, 0, p.rot, 0.9);
          break;
        case 'feijoada':
          ctx.rotate(Math.sin(p.rot) * 0.1);
          ctx.translate(-8, -15); drawIcon(ctx, 'feijoada', 16);
          break;
        case 'linguica':
          ctx.rotate(p.rot);
          ctx.fillStyle = '#c0392b'; rrect(ctx, -5, -2, 10, 4, 2); ctx.fill();
          ctx.fillStyle = '#ff8a70'; ctx.fillRect(-3, -1.4, 6, 0.8);
          break;
      }
      ctx.restore();
      if (p.fuse !== undefined && (p.kind === 'caju' || p.kind === 'dinamite' || p.kind === 'feijoada')) {
        const s = Math.max(0, Math.ceil(p.fuse - p.t)), fs = clamp(12 * ui, 9, 22);
        ctx.font = `900 ${fs}px Orbitron, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(String(s), p.x, p.y - 16);
        ctx.fillStyle = s <= 1 ? '#ff3b5c' : '#ffffff'; ctx.fillText(String(s), p.x, p.y - 16);
      }
    }
  }
  function drawUrubu() {
    const u = urubu, fl = Math.sin(u.flap) * 9;
    ctx.save(); ctx.translate(u.x, u.y); ctx.scale(u.dir * 1.6, 1.6);
    ctx.fillStyle = '#1a0f22'; ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, -2); ctx.quadraticCurveTo(-10, -12 - fl, -22, -8 - fl); ctx.quadraticCurveTo(-10, -3, 4, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-17, 3); ctx.lineTo(-10, 3); ctx.fill();
    ctx.fillStyle = '#ff8b8b'; ctx.beginPath(); ctx.arc(11, -3, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.moveTo(14, -3.5); ctx.lineTo(18, -2); ctx.lineTo(14, -1); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(12, -4, 0.9, 0, TAU); ctx.fill();
    if (u.i < u.drops.length) {
      ctx.fillStyle = '#a0662e'; ctx.fillRect(-4, 4, 9, 5);
      manga(ctx, -1, 4, 0.3, 0.45); manga(ctx, 3, 3.5, -0.4, 0.45);
    }
    ctx.restore();
  }
  function drawAimUi() {
    const c = G && G.active;
    if (!c || c.dead || G.phase !== 'aim' || c.air) return;
    const w = WEAPONS[G.weapon];
    if (w.kind === 'target') return;
    const col = teams[c.team].color, ca = Math.cos(c.aim) * c.face, sa = -Math.sin(c.aim);
    const ox = c.x, oy = c.y - 9, r = w.kind === 'melee' ? 30 : w.kind === 'drop' || w.kind === 'dig' ? 34 : 62;
    const cx = ox + ca * r, cy = oy + sa * r;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, TAU);
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9);
    ctx.stroke();
    if (c.charging) {
      for (let i = 0; i < 12; i++) {
        const t = (i + 1) / 12;
        if (t > c.power + 0.04) break;
        const d = 14 + t * 46;
        ctx.fillStyle = `hsl(${60 - t * 60},100%,${55 + t * 5}%)`;
        ctx.beginPath(); ctx.arc(ox + ca * d, oy + sa * d, 1.2 + t * 3.6, 0, TAU); ctx.fill();
      }
    }
  }
  function drawCursor() {
    if (!G || G.phase !== 'aim' || !G.cursor) return;
    const w = WEAPONS[G.weapon];
    if (w.kind !== 'target') return;
    const { x, y } = G.cursor, ok = w.id !== 'teleporte' || validSpot(x, y);
    const col = ok ? '#7dff3a' : '#ff3b5c', p = 1 + Math.sin(time * 8) * 0.12;
    if (w.id === 'mangas') {
      ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,176,0,0.55)'; ctx.lineWidth = 1.2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 34, -100); ctx.lineTo(x + i * 34, y + 40); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    if (w.id === 'teleporte') {
      ctx.globalAlpha = 0.4; ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x, y - 7, 8, 5, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 12 * p, 0, TAU);
    ctx.moveTo(x - 18, y); ctx.lineTo(x - 7, y); ctx.moveTo(x + 7, y); ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 7); ctx.moveTo(x, y + 7); ctx.lineTo(x, y + 18);
    ctx.stroke();
  }
  function drawFx() {
    for (const s of smokes) {
      const a = s.life / s.max;
      ctx.fillStyle = `rgba(70,60,90,${a * 0.42})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1.7 - a * 0.7), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const t = r.t / r.max;
      if (r.sea) {
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = `rgb(${theme.sea})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * (0.4 + t * 1.6), r.r * 0.25 * (0.4 + t), 0, 0, TAU); ctx.stroke();
        continue;
      }
      if (t < 0.5) { const s = r.r * 1.9 * (0.6 + t); ctx.globalAlpha = 1 - t * 2; ctx.drawImage(glowSpr, r.x - s, r.y - s, s * 2, s * 2); }
      ctx.globalAlpha = (1 - t) * 0.85; ctx.strokeStyle = theme.burn; ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.5 + t * 0.9), 0, TAU); ctx.stroke();
    }
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const t of tracers) {
      ctx.globalAlpha = t.t / 0.25; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(t.x0, t.y0); ctx.lineTo(t.x1, t.y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawLabels() {
    const fs = clamp(10.5 * ui, 7.5, 22);
    ctx.font = `${fs}px "Share Tech Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    for (const c of calangos) {
      if (c.dead) continue;
      const col = teams[c.team].color, y = c.y - 21;
      const hp = String(Math.ceil(c.shown)), w = ctx.measureText(hp).width + fs * 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(c.x - w / 2, y - fs * 0.92, w, fs * 1.12);
      ctx.fillStyle = col; ctx.fillText(hp, c.x, y);
      ctx.lineWidth = fs * 0.28; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(c.name, c.x, y - fs * 1.15);
      ctx.fillText(c.name, c.x, y - fs * 1.15);
      if (c === G.active && (G.phase === 'pre' || G.phase === 'aim' || G.phase === 'handoff')) {
        const ay = y - fs * 2.3 - Math.abs(Math.sin(time * 6)) * 4;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(c.x - 5, ay - 6); ctx.lineTo(c.x + 5, ay - 6); ctx.lineTo(c.x, ay); ctx.closePath(); ctx.fill();
      }
    }
  }
  function drawBubbles() {
    const fs = clamp(10 * ui, 7.5, 20);
    ctx.font = `bold ${fs}px "Share Tech Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of bubbles) {
      const c = b.c, w = ctx.measureText(b.text).width + fs * 1.1, h = fs * 1.7;
      const x = clamp(c.x - w / 2, cam.x + 4, cam.x + VW - w - 4), y = c.y - 24 - fs * 3.2 - h;
      ctx.globalAlpha = Math.min(1, b.t * 3);
      ctx.fillStyle = '#ffffff';
      rrect(ctx, x, y, w, h, fs * 0.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(c.x - 3, y + h - 0.5); ctx.lineTo(c.x + 3, y + h - 0.5); ctx.lineTo(c.x, y + h + 5); ctx.fill();
      ctx.fillStyle = '#12051e'; ctx.fillText(b.text, x + w / 2, y + h / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
  }
  function drawPopups() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const p of popups) {
      const fs = clamp(13 * ui, 10, 26) * p.size;
      ctx.font = `900 ${fs}px Orbitron, sans-serif`;
      ctx.globalAlpha = Math.min(1, p.t * 2);
      ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- HUD dentro do canvas (em pixels CSS) ---------- */
  function hudBox(x, y, w, h, stroke) {
    ctx.fillStyle = 'rgba(4,10,6,0.74)'; rrect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke();
  }
  function drawHandoff(W, H) {
    const t = teams[G.cur], c = G.active;
    ctx.fillStyle = 'rgba(3,6,4,0.93)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const big = clamp(W / 16, 18, 40);
    ctx.font = `${big * 0.45}px "Share Tech Mono", monospace`; ctx.fillStyle = '#9a8bb8';
    ctx.fillText('PASSE O APARELHO!', W / 2, H * 0.3);
    ctx.font = `900 ${big * 0.7}px Orbitron, sans-serif`; ctx.fillStyle = '#ffffff';
    ctx.fillText('VEZ DA EQUIPE', W / 2, H * 0.4);
    ctx.save(); ctx.shadowColor = t.color; ctx.shadowBlur = 18;
    ctx.font = `900 ${Math.min(big, (W * 0.9) / Math.max(8, t.name.length) * 1.4)}px Orbitron, sans-serif`; ctx.fillStyle = t.color;
    ctx.fillText(t.name, W / 2, H * 0.5);
    ctx.restore();
    ctx.font = `${big * 0.5}px "Share Tech Mono", monospace`; ctx.fillStyle = t.color;
    ctx.fillText(`quem joga agora: ${c.name}`, W / 2, H * 0.6);
    if (Math.floor(time * 2.5) % 2) {
      ctx.font = `700 ${big * 0.4}px Orbitron, sans-serif`; ctx.fillStyle = '#7dff3a';
      ctx.fillText('TOQUE NA TELA OU APERTE ESPAÇO', W / 2, H * 0.74);
    }
  }
  function drawHud() {
    if (!G) return;
    const W = cssW, H = cssH, s = clamp(Math.min(W, H) / 420, 0.78, 1.15);
    ctx.lineJoin = 'round';
    if (G.phase === 'handoff') { drawHandoff(W, H); return; }
    const c = G.active, live = c && !c.gone && (G.phase === 'aim' || G.phase === 'fired' || G.phase === 'pre');
    const bh = 44 * s;
    if (live) {
      const col = teams[c.team].color, team = teams[c.team];
      const t = G.phase === 'fired' ? Math.max(0, G.retreat) : G.phase === 'pre' ? TURN_T : Math.max(0, G.timer);
      const bw = 56 * s, x = 10, y = 10;
      hudBox(x, y, bw, bh, col);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${21 * s}px Orbitron, sans-serif`;
      ctx.fillStyle = t <= 5 && G.phase === 'aim' ? '#ff3b5c' : '#ffffff';
      ctx.fillText(String(Math.ceil(t)), x + bw / 2, y + bh * 0.42);
      ctx.font = `${9.5 * s}px "Share Tech Mono", monospace`; ctx.fillStyle = col;
      ctx.fillText(G.phase === 'fired' ? 'FUJA!' : 'TEMPO', x + bw / 2, y + bh * 0.82);
      // arma da vez
      const w = WEAPONS[G.weapon], a = ammoOf(team, w.id), ix = x + bw + 6;
      hudBox(ix, y, bh, bh, 'rgba(125,255,58,0.5)');
      ctx.save(); ctx.translate(ix + 4, y + 4); drawIcon(ctx, w.id, bh - 8); ctx.restore();
      ctx.textAlign = 'left';
      ctx.font = `700 ${11 * s}px Orbitron, sans-serif`; ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(w.short, ix + bh + 6, y + bh * 0.32); ctx.fillText(w.short, ix + bh + 6, y + bh * 0.32);
      const extra = (a === Infinity ? '∞' : '×' + a) + (w.id === 'caju' ? `  PAVIO ${team.fuse}s` : '') + (w.id === 'estilingue' && G.sling ? '  2º TIRO!' : '');
      ctx.font = `${11 * s}px "Share Tech Mono", monospace`; ctx.fillStyle = '#ffd400';
      ctx.strokeText(extra, ix + bh + 6, y + bh * 0.72); ctx.fillText(extra, ix + bh + 6, y + bh * 0.72);
    }
    // vento
    {
      const ww = 124 * s, wh = 34 * s, wx = W - ww - 10, wy = 10;
      hudBox(wx, wy, ww, wh, 'rgba(0,229,255,0.6)');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${9 * s}px "Share Tech Mono", monospace`; ctx.fillStyle = '#9adfff';
      if (theme.windK === 0) { ctx.font = `${10 * s}px "Share Tech Mono", monospace`; ctx.fillText('SEM VENTO: TETO!', wx + ww / 2, wy + wh / 2); }
      else {
        ctx.fillText('VENTO', wx + ww / 2, wy + wh * 0.25);
        const mid = wx + ww / 2, by = wy + wh * 0.66, n = Math.round(Math.abs(G.wind) * 10), dir = Math.sign(G.wind);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(mid - 1, by - 6 * s, 2, 12 * s);
        for (let i = 0; i < n; i++) {
          const cx = mid + dir * (5 + i * 5.2) * s;
          ctx.fillStyle = `hsl(${190 - i * 14},100%,${60 + i * 2}%)`;
          ctx.beginPath(); ctx.moveTo(cx - dir * 2.5 * s, by - 5 * s); ctx.lineTo(cx + dir * 2.5 * s, by); ctx.lineTo(cx - dir * 2.5 * s, by + 5 * s); ctx.closePath(); ctx.fill();
        }
        if (!n) { ctx.fillStyle = '#9adfff'; ctx.fillText('CALMARIA', mid, by); }
      }
    }
    // barras de vida das equipes
    {
      const rowH = 13 * s, nameW = 128 * s, barW = clamp(W - nameW - 60, 60, 220 * s), x0 = 10;
      let y = H - 8 - teams.length * rowH;
      ctx.textBaseline = 'middle';
      for (const t of teams) {
        const tot = t.calangos.reduce((a, o) => a + (o.dead ? 0 : o.shown), 0), max = Math.max(t.calangos.length * 100, tot);
        const alive = teamAlive(t), isCur = c && c.team === t.idx && live;
        ctx.font = `${9.5 * s}px "Share Tech Mono", monospace`; ctx.textAlign = 'left';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        const label = (isCur ? '► ' : '') + t.name;
        ctx.strokeText(label, x0, y + rowH / 2); ctx.fillStyle = alive ? t.color : '#5a5766'; ctx.fillText(label, x0, y + rowH / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0 + nameW, y + 2, barW, rowH - 4);
        ctx.fillStyle = t.color; ctx.globalAlpha = alive ? 0.9 : 0.3;
        ctx.fillRect(x0 + nameW, y + 2, barW * (tot / max), rowH - 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff'; ctx.strokeText(String(Math.ceil(tot)), x0 + nameW + barW + 5, y + rowH / 2); ctx.fillText(String(Math.ceil(tot)), x0 + nameW + barW + 5, y + rowH / 2);
        y += rowH;
      }
    }
    // avisos no meio da tela
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (G.banner) {
      const b = G.banner, a = Math.min(1, b.t * 2.5, (b.max - b.t) * 5 + 0.2);
      const fs = clamp((W * 1.5) / Math.max(10, b.text.length), 12, 26 * s);
      ctx.globalAlpha = a;
      ctx.font = `900 ${fs}px Orbitron, sans-serif`;
      ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(b.text, W / 2, bh + 34 * s);
      ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = 14; ctx.fillStyle = b.color; ctx.fillText(b.text, W / 2, bh + 34 * s); ctx.restore();
      ctx.globalAlpha = 1;
    }
    let hint = '';
    if (G.phase === 'aim' && c && human(c)) {
      const w = WEAPONS[G.weapon];
      if (w.kind === 'target') hint = 'TOQUE/CLIQUE NO MAPA PARA ESCOLHER O ALVO · FOGO CONFIRMA';
      else if (c.charging) hint = 'SOLTE PARA ATIRAR!';
    } else if (G.phase === 'aim' && c && ai && ai.c === c && (ai.mode === 'think' || ai.mode === 'wait')) hint = `${c.name} ESTÁ PENSANDO${'.'.repeat(1 + (Math.floor(time * 3) % 3))}`;
    else if (G.phase === 'fired' && c && human(c) && G.retreat > 0) hint = 'CORRE, CALANGO!';
    if (hint) {
      ctx.font = `${11 * s}px "Share Tech Mono", monospace`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const hy = H - 14 - teams.length * 13 * s;
      ctx.strokeText(hint, W / 2, hy); ctx.fillStyle = '#ffffff'; ctx.fillText(hint, W / 2, hy);
    }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!skyGrad) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      theme.sky.forEach((cl, i) => skyGrad.addColorStop(i / (theme.sky.length - 1), cl));
    }
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // camada distante, com parallax
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.drawImage(far, -cam.x * 0.3 - 80, VH * 0.9 - FAR_H - (cam.y - (SEA0 - VH * 0.8)) * 0.3);
    // mundo (com tremida)
    const sh = shake > 0 ? shake * 8 : 0;
    const ox = -cam.x + (sh ? rand(-sh, sh) : 0), oy = -cam.y + (sh ? rand(-sh, sh) : 0);
    ctx.setTransform(k, 0, 0, k, Math.round(ox * k), Math.round(oy * k));
    drawSeaBack();
    ctx.imageSmoothingEnabled = false;
    const x0 = Math.max(0, Math.floor(cam.x - 12)), y0 = Math.max(0, Math.floor(cam.y - 12));
    const x1 = Math.min(WW, Math.ceil(cam.x + VW + 12)), y1 = Math.min(WH, Math.ceil(cam.y + VH + 12));
    if (x1 > x0 && y1 > y0) ctx.drawImage(terr, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.imageSmoothingEnabled = true;
    drawCrates();
    for (const c of calangos) if (c.dead && !c.gone) drawTomb(c);
    drawProjs();
    for (const c of calangos) if (!c.dead) drawCalango(c);
    if (G) drawAimUi();
    drawFx();
    if (urubu) drawUrubu();
    drawSeaFront();
    drawFloaters();
    if (G) { drawLabels(); drawCursor(); }
    drawBubbles();
    drawPopups();
    // HUD em pixels CSS e scanlines por cima de tudo
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHud();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scan, 0, 0);
  }

  /* =====================================================================
     FLUXO DO JOGO
     ===================================================================== */
  const hiKey = () => 'calangada_hi_' + settings.cpu;
  function show(name) {
    overlay.hidden = !name;
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
  }
  function start() {
    Sfx.ensure();
    state = 'play';
    newMatch(false);
    show(null);
    updateHud();
  }
  function toMenu() {
    state = 'menu';
    newMatch(true);
    show('menu');
    updateHud();
  }
  function togglePause() {
    if (state === 'play') { state = 'pause'; closeMenu(); for (const kk in keys) keys[kk] = false; show('pause'); }
    else if (state === 'pause') { state = 'play'; show(null); }
  }
  function gameOver() {
    state = 'over'; overT = 0;
    const one = !G.multi, me = teams[0], won = G.winner === me;
    const cheated = codes.any();
    let rec = false;
    const title = $('overTitle');
    title.style.color = G.winner ? G.winner.color : '';
    if (one) {
      let sc = G.score;
      if (won) sc += (PTS.win + me.calangos.filter(c => !c.dead).length * PTS.surv) * mult();
      sc = Math.round(sc);
      rec = sc > hi && !cheated;
      if (rec) { hi = sc; Arcade.store.set(hiKey(), hi); }
      title.textContent = won ? 'VITÓRIA!' : G.winner ? 'DERROTA...' : 'EMPATE!';
      $('overScore').hidden = false;
      $('overScore').textContent = sc;
      $('overInfo').textContent = `CPU ${DIFF_NAME[settings.cpu]} (pontos ×${mult()}) · ${theme.name}` + (won ? ' · bônus de vitória e de sobreviventes!' : G.winner ? ` · ${G.winner.name} levou a melhor.` : '');
      Ranking.gameOver($('rankBox'), { board: 'calangada-' + settings.cpu, score: sc, cheated });
    } else {
      title.textContent = G.winner ? `${G.winner.name} VENCEU!` : 'EMPATE!';
      $('overScore').hidden = true;
      $('overInfo').textContent = `${theme.name} · ${G.round} ${G.round === 1 ? 'rodada' : 'rodadas'} de pura calangada.`;
      $('rankBox').hidden = true; $('rankBox').innerHTML = '';
    }
    $('overRecord').hidden = !rec;
    const st = G.stats, li = [];
    li.push(st.best.dmg > 0 ? `Tiro do jogo: <b>${st.best.name}</b> (${st.best.team}) causou <b>${st.best.dmg}</b> de dano com ${st.best.weapon}.` : 'Ninguém acertou nada. Treino é treino!');
    li.push(st.drowned.length ? `Foram nadar: <b>${st.drowned.join(', ')}</b>.` : 'Ninguém caiu no mar. O tubarão ficou com fome.');
    const killer = teams.slice().sort((a, b) => b.kills - a.kills)[0];
    if (killer.kills) li.push(`Mais eliminações: <b>${killer.name}</b> (${killer.kills}).`);
    const ff = teams.slice().sort((a, b) => b.friendly - a.friendly)[0];
    if (ff.friendly) li.push(`Prêmio Fogo Amigo: <b>${ff.name}</b>, com ${ff.friendly} de dano nos próprios calangos.`);
    if (st.slaps) li.push(`Chineladas certeiras: <b>${st.slaps}</b>.`);
    if (one) li.push(`Seu dano: <b>${me.dmgDealt}</b> · suas eliminações: <b>${me.kills}</b>.`);
    $('overStats').innerHTML = li.map(t => `<li>${t}</li>`).join('');
    show('over');
    if (one && !won) Sfx.lose();
  }

  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function updateHud() {
    const one = settings.mode === '1p';
    hud.hiWrap.hidden = !one;
    hud.scoreWrap.hidden = !(one && state !== 'menu');
    setText(hud.hi, String(hi));
    if (!G || state === 'menu') {
      setText(hud.turn, '—'); hud.turn.style.color = '';
      setText(hud.weapon, '—'); setText(hud.status, 'DEMO');
      return;
    }
    const c = G.active, t = c ? teams[c.team] : null, w = WEAPONS[G.weapon];
    setText(hud.turn, c ? c.name : '—');
    const col = t ? t.color : '';
    if (hud.turn.style.color !== col) hud.turn.style.color = col;
    const a = t ? ammoOf(t, w.id) : 0;
    setText(hud.weapon, t ? `${w.short} ${a === Infinity ? '∞' : '×' + a}${w.id === 'caju' ? ' · ' + t.fuse + 's' : ''}` : '—');
    setText(hud.score, String(Math.round(G.score)));
    setText(hud.status, G.round >= SD_ROUND ? 'MORTE SÚBITA!' : `RODADA ${Math.max(1, G.round)}/${SD_ROUND}`);
  }
  function syncMenu() {
    const multi = settings.mode === 'multi', eq = +settings.equipes;
    $('humOpt').hidden = !multi;
    if (+settings.humanos > eq) { settings.humanos = String(eq); Arcade.store.set('calangada_humanos', settings.humanos); }
    for (const b of $('humSeg').querySelectorAll('button')) { b.disabled = +b.dataset.value > eq; b.classList.toggle('on', b.dataset.value === settings.humanos); }
    const cpuTeams = multi ? eq - +settings.humanos : eq - 1;
    $('cpuOpt').hidden = cpuTeams <= 0;
    const th = settings.cenario === 'aleatorio' ? 'Cenário sorteado entre os 5.' : `${THEMES[settings.cenario].name}: ${THEMES[settings.cenario].info}`;
    const who = multi
      ? `${settings.humanos} equipes humanas passando o aparelho${cpuTeams ? ` + ${cpuTeams} da CPU` : ''}. Sem recorde: só glória e zoeira.`
      : `Sua equipe contra ${cpuTeams} ${cpuTeams > 1 ? 'equipes' : 'equipe'} da CPU. Vale recorde e Hall da Fama.`;
    $('modeInfo').textContent = `${who} ${th}`;
    hi = +Arcade.store.get(hiKey(), 0) || 0;
    updateHud();
  }

  /* =====================================================================
     LAÇO PRINCIPAL
     ===================================================================== */
  function updateFx(dt) {
    shake = Math.max(0, shake - dt * 2.2);
    for (const p of parts) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.life -= dt; }
    parts = parts.filter(p => p.life > 0);
    for (const s of smokes) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    smokes = smokes.filter(s => s.life > 0);
    for (const r of rings) r.t += dt;
    rings = rings.filter(r => r.t < r.max);
    for (const p of popups) { p.t -= dt; p.y -= 22 * dt; }
    popups = popups.filter(p => p.t > 0);
    for (const b of bubbles) b.t -= dt;
    bubbles = bubbles.filter(b => b.t > 0 && !b.c.dead);
    for (const t of tracers) t.t -= dt;
    tracers = tracers.filter(t => t.t > 0);
    for (const f of floaters) { f.t += dt; f.x += f.vx * dt; f.vx *= 0.995; }
    if (G) G.cursorT = Math.max(0, G.cursorT - dt);
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    pollPad(dt);
    if (jumpPending && now >= jumpPending) { jumpPending = 0; inp.jump = true; }
    if (G && (state === 'play' || state === 'menu' || state === 'over')) {
      time += dt;
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 6) { acc -= STEP; step(STEP); n++; }
      if (n >= 6) acc = 0;
      if (G.phase === 'aim') aiFrame();
      updateFx(dt);
      updateCamera(dt);
      if (state === 'over') overT += dt;
    }
    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  function resize() {
    const { w, h } = Arcade.innerSize(wrap);
    if (w < 10 || h < 10) return;
    // em pé a câmera fica mais perto (mostra menos mapa na largura)
    const s = clamp(Math.min(w, h) / 400, 0.8, 1.35);
    VW = Math.round(clamp(w / s, 320, 1700));
    VH = Math.round(clamp(h / s, 300, 1000));
    k = Arcade.fit(canvas, VW, VH, wrap);
    cssW = parseFloat(canvas.style.width) || VW; cssH = parseFloat(canvas.style.height) || VH;
    dpr = canvas.width / cssW;
    ui = VW / cssW;
    skyGrad = null;
    buildScan();
    clampCam();
  }

  /* ---------- início ---------- */
  Arcade.bindSettings(panels.menu, settings, 'calangada_', () => syncMenu());
  Arcade.bindMute($('muteBtn'));
  Arcade.setupPads(stage, $('padBtn'), () => resize());
  addEventListener('resize', resize);
  resize();
  syncMenu();
  newMatch(true);
  show('menu');
  updateHud();
  requestAnimationFrame(frame);
})();
