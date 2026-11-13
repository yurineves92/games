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
  meteoros: `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#05020f"/><g fill="#fff"><circle cx="2" cy="3" r=".3"/><circle cx="13" cy="1.6" r=".3"/><circle cx="6" cy="14" r=".3"/><circle cx="14.5" cy="13" r=".3"/></g><path d="M9 2.5l3 1 1.5 3-1 3-3 1-2.5-1.5-.5-3Z" fill="none" stroke="#ff8a00" stroke-width=".7"/><path d="M2.5 10l1.5.5.5 1.5-1 1-1.5-.5-.5-1.5Z" fill="none" stroke="#ff8a00" stroke-width=".6"/><path d="M6 13.5L7.2 9.2 8.4 13.5 7.2 12.6Z" fill="none" stroke="#fff" stroke-width=".6" stroke-linejoin="round" transform="rotate(30 7.2 11.5)"/><g fill="#ffd400"><circle cx="8.7" cy="8.4" r=".4"/><circle cx="9.6" cy="6.9" r=".4"/></g></svg>`,
  'pouso-lunar': `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#070b1e"/><circle cx="12.5" cy="3" r="1.6" fill="#9ad0ff" opacity=".8"/><path d="M0 13l2-2 2 1.5 1-.5h4l1.5-2 2 1.5L16 10v6H0Z" fill="#1b2350" stroke="#9ad0ff" stroke-width=".5"/><rect x="5" y="11.6" width="4" height=".6" fill="#39ff14"/><path d="M5.6 7.8h2.8l.7 1.6H4.9Z" fill="#c0c8e0" stroke="#e8eeff" stroke-width=".5"/><path d="M5.4 9.4l-.8 1.6M8.6 9.4l.8 1.6" stroke="#e8eeff" stroke-width=".5"/><circle cx="7" cy="6.6" r="1.4" fill="#9ad0ff" stroke="#e8eeff" stroke-width=".5"/><path d="M6.4 9.6L7 11.3 7.6 9.6Z" fill="#ff8a00"/></svg>`,
  'defesa-total': `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#0a0418"/><path d="M1 0L5 8M15 0L10 7M7.5 0L8.5 5" stroke="#ff3b5c" stroke-width=".6"/><circle cx="9" cy="6" r="2.4" fill="#ffd400" opacity=".85"/><circle cx="9" cy="6" r="1.2" fill="#fff"/><g fill="#00e5ff" shape-rendering="crispEdges"><rect x="1" y="11" width="2" height="3"/><rect x="3.5" y="10" width="2" height="4"/><rect x="10.5" y="10.5" width="2" height="3.5"/><rect x="13" y="11.5" width="2" height="2.5"/></g><path d="M6.5 14l1.5-2.5 1.5 2.5Z" fill="#ff3b5c"/><rect y="14" width="16" height="2" fill="#5a1060"/></svg>`,
  rastro: `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#020812"/><path d="M4 0v16M8 0v16M12 0v16M0 4h16M0 8h16M0 12h16" stroke="#0b3550" stroke-width=".3"/><path d="M1 15V6h6v4h3" fill="none" stroke="#00e5ff" stroke-width="1.2"/><rect x="9.6" y="9.2" width="2" height="1.6" fill="#fff"/><path d="M15 2H9v3H5.5" fill="none" stroke="#ff2bd6" stroke-width="1.2"/><rect x="3.8" y="4.2" width="2" height="1.6" fill="#fff"/></svg>`,
  bolhas: `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#14002a"/><g stroke="#000" stroke-width=".3"><circle cx="2.5" cy="2.3" r="1.9" fill="#ff2bd6"/><circle cx="6.5" cy="2.3" r="1.9" fill="#00e5ff"/><circle cx="10.5" cy="2.3" r="1.9" fill="#ff2bd6"/><circle cx="14.5" cy="2.3" r="1.9" fill="#ffd400"/><circle cx="4.5" cy="5.8" r="1.9" fill="#39ff14"/><circle cx="8.5" cy="5.8" r="1.9" fill="#ffd400"/><circle cx="12.5" cy="5.8" r="1.9" fill="#00e5ff"/><circle cx="8" cy="13.6" r="1.9" fill="#39ff14"/></g><g fill="#fff" opacity=".7"><circle cx="1.9" cy="1.7" r=".5"/><circle cx="5.9" cy="1.7" r=".5"/><circle cx="7.4" cy="13" r=".5"/></g><path d="M8 11.4L9.4 8" stroke="#fff" stroke-width=".5" stroke-dasharray=".6 .6"/></svg>`,
  joias: `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#1a0f00"/><path d="M4 .8L7.2 4 4 7.2.8 4Z" fill="#ff3b5c" stroke="#fff" stroke-width=".3"/><circle cx="12" cy="4" r="3" fill="#00e5ff" stroke="#fff" stroke-width=".3"/><path d="M4 8.8l3 5.6H1Z" fill="#39ff14" stroke="#fff" stroke-width=".3"/><path d="M12 8.6l.9 2 2.2.2-1.7 1.4.6 2.2L12 13.2l-2 1.2.6-2.2-1.7-1.4 2.2-.2Z" fill="#ffd400" stroke="#fff" stroke-width=".3"/><g fill="#fff" opacity=".75"><path d="M2.6 3.4L4 2v1.6Z"/><circle cx="11" cy="3" r=".7"/></g></svg>`,
  calangada: `<svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#0a1a3a"/><path d="M0 11c2-2 4-1 6-2s3-3 5-2 3 1 5 0v9H0Z" fill="#2a1a0a" stroke="#7dff3a" stroke-width=".6"/><circle cx="9.5" cy="9.2" r="1.6" fill="#0a1a3a"/><rect y="14.5" width="16" height="1.5" fill="#00e5ff" opacity=".7"/><path d="M3 9.4c.6-.8 1.6-.9 2.4-.5l1 .6-.3.5-.9-.3-.3.9h-.5l.1-.9-.7.2-.4.9h-.5Z" fill="#7dff3a"/><path d="M4.4 8.6a1 1 0 0 1 1.6-.2" stroke="#ff2bd6" stroke-width=".7" fill="none"/><path d="M6.4 8.4L8 6.6" stroke="#ffd400" stroke-width=".6"/><path d="M8.6 2.6Q11 1 13 3.6" stroke="#fff" stroke-width=".4" stroke-dasharray=".6 .5" fill="none"/><circle cx="13.2" cy="4" r=".9" fill="#ffb000"/></svg>`,
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
  meteoros: { nome: 'Meteoros', pasta: 'jogos/meteoros/', cor: '#ff8a00', ed: 5, recordes: [['meteoros_hi_cadete', 'Cadete'], ['meteoros_hi_piloto', 'Piloto'], ['meteoros_hi_as', 'Ás']], ranking: 'meteoros-piloto', rankingNome: 'Piloto' },
  'pouso-lunar': { nome: 'Pouso Lunar', pasta: 'jogos/pouso-lunar/', cor: '#9ad0ff', ed: 5, recordes: [['pouso-lunar_hi_treino', 'Treino'], ['pouso-lunar_hi_missao', 'Missão'], ['pouso-lunar_hi_heroico', 'Heroico']], ranking: 'pouso-lunar-missao', rankingNome: 'Missão' },
  'defesa-total': { nome: 'Defesa Total', pasta: 'jogos/defesa-total/', cor: '#ff3b5c', ed: 5, recordes: [['defesa-total_hi_normal', 'Normal'], ['defesa-total_hi_rapida', 'Rápida']], ranking: 'defesa-total-normal', rankingNome: 'Normal' },
  rastro: { nome: 'Rastro de Luz', pasta: 'jogos/rastro/', cor: '#00e5ff', ed: 6, recordes: [['rastro_hi_facil', 'Fácil'], ['rastro_hi_normal', 'Normal'], ['rastro_hi_dificil', 'Difícil']], ranking: 'rastro-normal', rankingNome: 'Normal' },
  bolhas: { nome: 'Bolhas', pasta: 'jogos/bolhas/', cor: '#ff2bd6', ed: 6, recordes: [['bolhas_hi_fases', 'Fases'], ['bolhas_hi_infinito', 'Infinito']], ranking: 'bolhas-fases', rankingNome: 'Fases' },
  joias: { nome: 'Joias', pasta: 'jogos/joias/', cor: '#ffd400', ed: 6, recordes: [['joias_hi_classico', 'Clássico'], ['joias_hi_relogio', 'Relógio']], ranking: 'joias-classico', rankingNome: 'Clássico' },
  calangada: { nome: 'Calangada', pasta: 'jogos/calangada/', cor: '#7dff3a', ed: 7, recordes: [['calangada_hi_facil', 'Fácil'], ['calangada_hi_normal', 'Normal'], ['calangada_hi_dificil', 'Difícil']], ranking: 'calangada-normal', rankingNome: 'Normal' },
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
  {
    n: 5, slug: '05', mes: 'Março', ano: 'Ano 2', preco: 'R$ 5,90', cod: '7 891234 000055',
    fundo: 'linear-gradient(170deg, #000 0%, #0a0630 45%, #3a0a5a 75%, #ff6a00 100%)',
    manchete: 'Meteoros!', manchete2: 'Chuva de pedra no espaço: segure o manche', corManchete: '#ff8a00',
    chamadas: [
      ['Pouso Lunar', 'Desça em 5 astros sem amassar a lataria', '#9ad0ff'],
      ['Defesa Total', 'Salve as 6 cidades da chuva de mísseis', '#ff3b5c'],
      ['Guia', 'O sistema solar da Super Neon', '#22c55e'],
    ],
    selo: '3 jogos no CD-ROM!', rodape: 'Guia dos 5 astros do Pouso Lunar',
    jogos: ['meteoros', 'pouso-lunar', 'defesa-total'],
  },
  {
    n: 6, slug: '06', mes: 'Abril', ano: 'Ano 2', preco: 'R$ 5,90', cod: '7 891234 000062',
    fundo: 'linear-gradient(170deg, #000 0%, #001a2a 45%, #003a5a 70%, #ff2bd6 100%)',
    manchete: 'Rastro de Luz', mancheteTam: '12.5cqw', manchete2: 'Quatro motos, uma arena e nenhum freio', corManchete: '#00e5ff',
    chamadas: [
      ['Bolhas', 'Mire, rebata e estoure tudo', '#ff2bd6'],
      ['Joias', 'Combine 3 e não pare nunca mais', '#ffb000'],
      ['Duelo', 'Desafie seu irmão no 2 jogadores', '#22c55e'],
    ],
    selo: '3 jogos no CD-ROM!', rodape: 'Detonado das 10 fases do Bolhas',
    jogos: ['rastro', 'bolhas', 'joias'],
  },
  {
    n: 7, slug: '07', mes: 'Maio', ano: 'Ano 2', preco: 'R$ 7,90', cod: '7 891234 000079', especial: true,
    fundo: 'linear-gradient(170deg, #06102a 0%, #0a2a5a 45%, #1a5a3a 75%, #ffb000 100%)',
    manchete: 'Calangada!', manchete2: 'Arme seu bando e exploda a ilha do vizinho', corManchete: '#7dff3a',
    chamadas: [
      ['Arsenal', 'Todas as armas, da Chinelada à Feijoada', '#ff3b5c'],
      ['Mapas', 'Os 5 cenários explicados', '#00c8e6'],
      ['Turma toda', 'Até 4 equipes no mesmo aparelho', '#ff8a00'],
    ],
    selo: 'Edição especial!', rodape: 'Guia completo do arsenal',
    jogos: ['calangada'],
  },
];
