// Catálogo da Super Neon: edições (dados das capas) e jogos (CD-ROM e Hall da Fama).
// As páginas usam caminhos relativos à raiz do site; `base` ajusta para quem está em subpasta.

// Ícones 64x64 no estilo dos ícones de CD-ROM do Windows 95.
const ICONE = {
  quadrix: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#0b1630"/><g stroke="#000" stroke-width=".3"><rect x="2" y="10" width="3" height="3" fill="#ff3b5c"/><rect x="5" y="10" width="3" height="3" fill="#ff3b5c"/><rect x="5" y="7" width="3" height="3" fill="#ff3b5c"/><rect x="8" y="10" width="3" height="3" fill="#ffd400"/><rect x="11" y="10" width="3" height="3" fill="#ffd400"/><rect x="11" y="7" width="3" height="3" fill="#ffd400"/><rect x="7" y="1" width="3" height="3" fill="#00e5ff"/><rect x="7" y="4" width="3" height="3" fill="#00e5ff"/><rect x="10" y="4" width="3" height="3" fill="#00e5ff"/></g><rect y="13" width="16" height="3" fill="#7b3bff"/></svg>`,
  snake: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#06140a"/><path d="M2 13h6v-4h4v-4h2" fill="none" stroke="#39ff14" stroke-width="2.2"/><rect x="12" y="3" width="3" height="3" fill="#8bff5c"/><rect x="13" y="3.6" width="1" height="1" fill="#000"/><rect x="3" y="3" width="3" height="3" fill="#ff2238"/><rect x="4.5" y="2" width="1" height="1" fill="#3bd13b"/></svg>`,
  'fruit-ninja': `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#5b3a21"/><path d="M2 9a6 5 0 0 1 12 0Z" fill="#1d6b1f"/><path d="M3 9a5 4 0 0 1 10 0Z" fill="#ff3b4f"/><circle cx="6" cy="7.5" r=".5"/><circle cx="9" cy="6.8" r=".5"/><circle cx="11" cy="8" r=".5"/><path d="M2 14L14 2" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  'flappy-bird': `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#4ec0ca"/><rect x="11" y="0" width="4" height="5" fill="#73bf2e" stroke="#543847" stroke-width=".4"/><rect x="11" y="11" width="4" height="5" fill="#73bf2e" stroke="#543847" stroke-width=".4"/><ellipse cx="6.5" cy="8" rx="4" ry="3" fill="#f8c51c" stroke="#543847" stroke-width=".5"/><circle cx="8.2" cy="7" r="1.3" fill="#fff"/><rect x="8.5" y="6.5" width=".7" height="1.1"/><ellipse cx="10.2" cy="8.6" rx="1.8" ry=".8" fill="#f0612b"/><ellipse cx="4.6" cy="8.2" rx="2" ry="1.3" fill="#fdf6d8" stroke="#543847" stroke-width=".4"/></svg>`,
  paredao: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#120a04"/><g stroke="#000" stroke-width=".3"><rect x="1" y="2" width="4.5" height="2" fill="#ff3b5c"/><rect x="5.5" y="2" width="4.5" height="2" fill="#ff8a00"/><rect x="10" y="2" width="4.5" height="2" fill="#ffd400"/><rect x="1" y="4" width="4.5" height="2" fill="#22c55e"/><rect x="10" y="4" width="4.5" height="2" fill="#00c8e6"/></g><rect x="7" y="9" width="2" height="2" fill="#fff"/><rect x="4" y="13" width="7" height="1.5" fill="#ff8a00"/></svg>`,
  invasores: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#07031a"/><g fill="#b26bff"><rect x="5" y="2" width="6" height="1"/><rect x="3" y="3" width="10" height="1"/><rect x="2" y="4" width="12" height="2"/><rect x="2" y="6" width="2" height="1"/><rect x="6" y="6" width="4" height="1"/><rect x="12" y="6" width="2" height="1"/><rect x="4" y="7" width="2" height="1"/><rect x="10" y="7" width="2" height="1"/></g><g fill="#07031a"><rect x="5" y="4" width="2" height="1"/><rect x="9" y="4" width="2" height="1"/></g><rect x="7.5" y="9" width="1" height="2" fill="#fff"/><rect x="5" y="13" width="6" height="2" fill="#39ff14"/><rect x="7" y="12" width="2" height="1" fill="#39ff14"/></svg>`,
  pong: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#000"/><rect x="1.5" y="4" width="1.5" height="5" fill="#4dd2ff"/><rect x="13" y="7" width="1.5" height="5" fill="#4dd2ff"/><g fill="#4dd2ff" opacity=".5"><rect x="7.6" y="1" width=".8" height="2"/><rect x="7.6" y="5" width=".8" height="2"/><rect x="7.6" y="9" width=".8" height="2"/><rect x="7.6" y="13" width=".8" height="2"/></g><rect x="9" y="6" width="1.5" height="1.5" fill="#fff"/></svg>`,
  'come-come': `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#03031a"/><rect x=".5" y=".5" width="15" height="15" fill="none" stroke="#2f5bff" stroke-width="1"/><path d="M6 8L10.5 5.2A5 5 0 1 0 10.5 10.8Z" fill="#ffe600"/><circle cx="11.5" cy="8" r=".8" fill="#ffd9b0"/><circle cx="14" cy="8" r=".8" fill="#ffd9b0"/></svg>`,
  travessia: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="8" fill="#0b3a8a"/><rect y="8" width="16" height="8" fill="#222"/><rect x="1" y="2" width="8" height="2" fill="#8a5a2b"/><rect x="0" y="11" width="16" height=".5" fill="#ffd400" opacity=".7"/><rect x="10" y="12" width="5" height="3" fill="#ff3b5c"/><rect x="6" y="5" width="4" height="4" fill="#39ff14"/><rect x="6.5" y="5.5" width="1" height="1" fill="#000"/><rect x="8.5" y="5.5" width="1" height="1" fill="#000"/></svg>`,
  'campo-minado': `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#c0c0c0"/><g fill="#fff"><rect x="0" y="0" width="16" height="1"/><rect x="0" y="0" width="1" height="16"/></g><rect x="1" y="1" width="7" height="7" fill="#bdbdbd" stroke="#808080" stroke-width=".4"/><text x="4.5" y="6.8" font-size="6" font-weight="bold" text-anchor="middle" fill="#0000ff" font-family="Arial">1</text><circle cx="11.5" cy="11.5" r="2.6"/><g stroke="#000" stroke-width=".8"><path d="M11.5 7.6v7.8M7.6 11.5h7.8"/></g><rect x="10.3" y="10.3" width="1" height="1" fill="#fff"/><path d="M3 9v6M3 9l3 1.4L3 12" fill="#ff0000" stroke="#000" stroke-width=".5"/></svg>`,
  turbo: `<svg viewBox="0 0 16 16"><rect width="16" height="7" fill="#ff7a59"/><rect y="7" width="16" height="9" fill="#3a8a2f"/><path d="M7 7h2l5 9H2Z" fill="#555"/><path d="M7.9 8h.2l.3 2h-.8ZM7.6 12h.8l.4 3H7.2Z" fill="#fff"/><rect x="5.5" y="11.5" width="5" height="3" rx=".8" fill="#ff2bd6" stroke="#000" stroke-width=".4"/><rect x="5.8" y="13.8" width="1.2" height="1" fill="#111"/><rect x="9" y="13.8" width="1.2" height="1" fill="#111"/><circle cx="12.5" cy="3" r="2" fill="#ffd400"/></svg>`,
  'super-pixel': `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#5fb7ff"/><rect y="13" width="16" height="3" fill="#8a5a2b"/><rect y="12" width="16" height="1" fill="#39d14b"/><rect x="5" y="4" width="6" height="2" fill="#ffb000"/><rect x="4" y="6" width="8" height="1" fill="#ffb000"/><rect x="5" y="7" width="6" height="2" fill="#ffd9b0"/><rect x="9" y="7" width="1" height="1" fill="#000"/><rect x="5" y="9" width="6" height="3" fill="#7b3bff"/><rect x="12" y="3" width="3" height="3" fill="#ffd400" stroke="#000" stroke-width=".3"/></svg>`,
};

const JOGOS = {
  quadrix: { nome: 'Quadrix', pasta: 'jogos/quadrix/', cor: '#00e5ff', ed: 1, recordes: [['quadrix_hi_maratona', 'Maratona'], ['quadrix_hi_ultra', 'Ultra']], ranking: 'quadrix-maratona', rankingNome: 'Maratona' },
  snake: { nome: 'Snake', pasta: 'jogos/snake/', cor: '#39ff14', ed: 1, recordes: [['snake_hi', '']], ranking: 'snake-normal-solid', rankingNome: 'Normal' },
  'fruit-ninja': { nome: 'Fruit Ninja', pasta: 'jogos/fruit-ninja/', cor: '#ff3b5c', ed: 1, recordes: [['fruit_hi_classic', 'Clássico'], ['fruit_hi_arcade', 'Arcade'], ['fruit_hi_zen', 'Zen']], ranking: 'fruit-ninja-classic', rankingNome: 'Clássico' },
  'flappy-bird': { nome: 'Flappy Bird', pasta: 'jogos/flappy-bird/', cor: '#ffd400', ed: 1, recordes: [['flappy_hi', '']], ranking: 'flappy-bird-normal', rankingNome: 'Normal' },
  paredao: { nome: 'Paredão', pasta: 'jogos/paredao/', cor: '#ff8a00', ed: 2, recordes: [['paredao_hi', '']], ranking: 'paredao' },
  invasores: { nome: 'Invasores', pasta: 'jogos/invasores/', cor: '#b26bff', ed: 2, recordes: [['invasores_hi', '']], ranking: 'invasores' },
  pong: { nome: 'Pong', pasta: 'jogos/pong/', cor: '#4dd2ff', ed: 2, recordes: [['pong_hi_easy', 'Fácil'], ['pong_hi_normal', 'Normal'], ['pong_hi_hard', 'Difícil']], ranking: 'pong-normal', rankingNome: 'Normal' },
  'come-come': { nome: 'Come-Come', pasta: 'jogos/come-come/', cor: '#ffe600', ed: 3, recordes: [['come-come_hi', '']], ranking: 'come-come' },
  travessia: { nome: 'Travessia', pasta: 'jogos/travessia/', cor: '#39ff14', ed: 3, recordes: [['travessia_hi', '']], ranking: 'travessia' },
  'campo-minado': { nome: 'Campo Minado', pasta: 'jogos/campo-minado/', cor: '#8aa0ff', ed: 3, recordes: [['campo-minado_hi_iniciante', 'Iniciante'], ['campo-minado_hi_intermediario', 'Intermediário'], ['campo-minado_hi_expert', 'Expert']], ranking: 'campo-minado-intermediario', rankingNome: 'Intermediário' },
  turbo: { nome: 'Turbo Neon', pasta: 'jogos/turbo/', cor: '#ff2bd6', ed: 4, recordes: [['turbo_hi_rio', 'Rio'], ['turbo_hi_sp', 'São Paulo'], ['turbo_hi_deserto', 'Deserto']], ranking: 'turbo-rio', rankingNome: 'Rio' },
  'super-pixel': { nome: 'Super Pixel', pasta: 'jogos/super-pixel/', cor: '#ffb000', ed: 4, recordes: [['super-pixel_hi', '']], ranking: 'super-pixel' },
};

const EDICOES = [
  {
    n: 1, slug: '01', mes: 'Novembro', ano: 'Ano 1', preco: 'R$ 5,90', cod: '7 891234 000017',
    fundo: 'linear-gradient(165deg, #12002e 0%, #3a0a6a 45%, #ff2bd6 100%)',
    manchete: 'Quadrix!', manchete2: 'O vício em blocos que vai fritar o seu cérebro', corManchete: '#00e5ff',
    chamadas: [
      ['Snake', 'A cobrinha mais famosa do mundo volta faminta', '#22c55e'],
      ['Fruit Ninja', 'Fatiamos mil melancias para você', '#ff3b5c'],
      ['Flappy Bird', 'Como passar dos 40 canos', '#ff8a00'],
    ],
    selo: '4 jogos no CD-ROM!', rodape: 'Todos os códigos secretos!',
    jogos: ['quadrix', 'snake', 'fruit-ninja', 'flappy-bird'],
  },
  {
    n: 2, slug: '02', mes: 'Dezembro', ano: 'Ano 1', preco: 'R$ 5,90', cod: '7 891234 000024',
    fundo: 'linear-gradient(170deg, #000 0%, #14063a 50%, #4a1690 100%)',
    manchete: 'Invasores!', manchete2: 'A Terra precisa de você, piloto', corManchete: '#39ff14',
    chamadas: [
      ['Paredão', 'As 10 fases detonadas tijolo por tijolo', '#ff8a00'],
      ['Pong', 'O avô dos videogames ainda dá um caldo', '#00c8e6'],
      ['Macete', 'O tiro que vale 300 no disco voador', '#7b3bff'],
    ],
    selo: '3 jogos no CD-ROM!', rodape: 'Detonado completo do Paredão',
    jogos: ['invasores', 'paredao', 'pong'],
  },
  {
    n: 3, slug: '03', mes: 'Janeiro', ano: 'Ano 2', preco: 'R$ 5,90', cod: '7 891234 000031',
    fundo: 'linear-gradient(170deg, #000018 0%, #0a1460 55%, #2f5bff 100%)',
    manchete: 'Come-Come', manchete2: 'Os fantasmas estão soltos no labirinto!', corManchete: '#ffe600',
    chamadas: [
      ['Travessia', 'Atravesse a avenida sem virar panqueca', '#22c55e'],
      ['Campo Minado', 'Nunca mais exploda na primeira jogada', '#8aa0ff'],
      ['Dossiê', 'Os segredos dos 4 fantasmas', '#ff3b5c'],
    ],
    selo: '3 jogos no CD-ROM!', rodape: 'Pôster dos fantasmas',
    jogos: ['come-come', 'travessia', 'campo-minado'],
  },
  {
    n: 4, slug: '04', mes: 'Fevereiro', ano: 'Ano 2', preco: 'R$ 7,90', cod: '7 891234 000048', especial: true,
    fundo: 'linear-gradient(170deg, #1a0010 0%, #6a0a4a 40%, #ff7a3a 100%)',
    manchete: 'Turbo Neon', manchete2: 'Pé na tábua do Rio ao deserto!', corManchete: '#ffd400',
    chamadas: [
      ['Super Pixel', 'O herói de 8 bits que pula até a lua', '#ffb000'],
      ['Edição especial', 'Mapas completos das 3 fases', '#ff2bd6'],
      ['Pit stop', 'Os segredos do nitro', '#00c8e6'],
    ],
    selo: 'Edição especial!', rodape: 'Pôster gigante do Super Pixel',
    jogos: ['turbo', 'super-pixel'],
  },
];
