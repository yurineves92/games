// Trilha sonora da Super Neon: música original (synthwave/chiptune) gerada na hora com Web Audio.
// Nenhum arquivo de áudio, nenhuma música de terceiros: a composição é desta revista.
const Musica = (() => {
  const BPM = 112;
  const PASSO = 60 / BPM / 4;          // duração de uma semicolcheia
  const CHAVE = 'sn_musica';

  // Lá menor: Am – F – C – G (notas MIDI do acorde).
  const ACORDES = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];

  // Melodia em 16 passos por compasso: nota, "-" segura a anterior, "." é pausa.
  const A = [
    'A4 . C5 . E5 - - . D5 . C5 . E5 - . .',
    'F5 - - . E5 . C5 . A4 - - . C5 . D5 .',
    'E5 - - . G5 - - . E5 . D5 . C5 - . .',
    'D5 - - . B4 . G4 . B4 . D5 . G5 - - .',
  ];
  const B = [
    'A5 - - . G5 . E5 . C5 - - . E5 . G5 .',
    'A5 - - . G5 . F5 . E5 - - . C5 . D5 .',
    'E5 - G5 - E5 - D5 - C5 - - . D5 . E5 .',
    'D5 - - - B4 - - - G4 - - - . . . .',
  ];
  // 16 compassos: introdução sem melodia, A, B e A de novo.
  const FORMA = [null, null, null, null, ...A, ...B, ...A];

  const NOMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = n => 12 * (Number(n[n.length - 1]) + 1) + NOMES[n[0]] + (n[1] === '#' ? 1 : 0);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // Converte "A4 - . C5" em [{passo, nota, dur}].
  function ler(linha) {
    const t = linha.split(' '), out = [];
    t.forEach((s, i) => {
      if (s === '.' || s === '-') return;
      let d = 1;
      while (t[i + d] === '-') d++;
      out.push({ passo: i, nota: midi(s), dur: d });
    });
    return out;
  }
  const MELODIA = FORMA.map(l => (l ? ler(l) : []));

  let ac = null, mestre = null, eco = null, ruido = null;
  let tocando = false, timer = 0, proximo = 0, passo = 0;

  function montar() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    mestre = ac.createGain();
    mestre.gain.value = 0.0001;
    const comp = ac.createDynamicsCompressor();
    mestre.connect(comp); comp.connect(ac.destination);
    // Eco (delay) para a melodia ficar com cara de anos 80.
    eco = ac.createDelay(1);
    eco.delayTime.value = PASSO * 3;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const mol = ac.createGain(); mol.gain.value = 0.28;
    eco.connect(fb); fb.connect(eco); eco.connect(mol); mol.connect(mestre);
    ruido = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function nota(t, freq, dur, tipo, vol, { corte = 0, ataque = 0.005, ecoar = false, detune = 0 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = tipo; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let saida = g;
    if (corte) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = corte;
      g.connect(f); saida = f;
    }
    o.connect(g);
    saida.connect(mestre);
    if (ecoar) saida.connect(eco);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function bateria(t, tipo) {
    if (tipo === 'bumbo') {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(mestre);
      o.start(t); o.stop(t + 0.3);
      return;
    }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = ruido;
    const caixa = tipo === 'caixa';
    f.type = caixa ? 'bandpass' : 'highpass';
    f.frequency.value = caixa ? 1800 : 7000;
    g.gain.setValueAtTime(caixa ? 0.45 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (caixa ? 0.18 : 0.05));
    s.connect(f); f.connect(g); g.connect(mestre);
    if (caixa) g.connect(eco);
    s.start(t); s.stop(t + 0.2);
  }

  // Agenda tudo o que acontece num passo (semicolcheia) da música.
  function agendar(p, t) {
    const compasso = Math.floor(p / 16) % FORMA.length, i = p % 16;
    const ac0 = ACORDES[compasso % 4];
    const raiz = ac0[0] - 12;
    const intro = compasso < 2;

    // baixo em colcheias, com oitava
    if (i % 2 === 0) {
      const padrao = [0, 0, 12, 0, 0, 12, 7, 12];
      nota(t, hz(raiz - 12 + padrao[i / 2]), PASSO * 1.8, 'sawtooth', 0.22, { corte: 700 });
    }
    // arpejo
    if (!intro || i % 4 === 0) {
      const arp = [0, 1, 2, 1];
      nota(t, hz(ac0[arp[i % 4]] + 12), PASSO * 0.9, 'square', 0.035, { corte: 2600, ecoar: true });
    }
    // pad no começo do compasso
    if (i === 0) {
      for (const n of ac0) {
        nota(t, hz(n), PASSO * 15, 'sawtooth', 0.025, { corte: 1100, ataque: 0.4, detune: -8 });
        nota(t, hz(n), PASSO * 15, 'sawtooth', 0.025, { corte: 1100, ataque: 0.4, detune: 8 });
      }
    }
    // bateria
    if (!intro) {
      if (i === 0 || i === 8 || i === 10) bateria(t, 'bumbo');
      if (i === 4 || i === 12) bateria(t, 'caixa');
    } else if (i === 0) bateria(t, 'bumbo');
    if (i % 2 === 1 && compasso >= 1) bateria(t, 'chimbal');
    // melodia
    for (const m of MELODIA[compasso]) {
      if (m.passo === i) nota(t, hz(m.nota), PASSO * m.dur * 0.95, 'square', 0.07, { corte: 3200, ecoar: true });
    }
  }

  function laco() {
    while (proximo < ac.currentTime + 0.15) {
      agendar(passo, proximo);
      proximo += PASSO;
      passo = (passo + 1) % (FORMA.length * 16);
    }
  }

  function tocar() {
    if (tocando) return;
    if (!ac && !montar()) return;
    if (ac.state === 'suspended') ac.resume();
    tocando = true;
    proximo = ac.currentTime + 0.08;
    mestre.gain.cancelScheduledValues(ac.currentTime);
    mestre.gain.setTargetAtTime(0.5, ac.currentTime, 0.4);
    timer = setInterval(laco, 25);
    laco();
    atualizar();
  }
  function parar() {
    if (!tocando) return;
    tocando = false;
    clearInterval(timer);
    mestre.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08);
    atualizar();
  }

  let botao = null;
  const querTocar = () => { try { return localStorage.getItem(CHAVE) !== '0'; } catch (e) { return true; } };
  const salvar = on => { try { localStorage.setItem(CHAVE, on ? '1' : '0'); } catch (e) { /* sem storage */ } };
  function atualizar() {
    if (!botao) return;
    botao.setAttribute('aria-pressed', tocando ? 'true' : 'false');
    botao.innerHTML = `<span class="musica-ico" aria-hidden="true">${tocando ? '♫' : '♪'}</span> Música: ${tocando ? 'ligada' : 'desligada'}`;
    botao.classList.toggle('on', tocando);
  }

  function iniciar() {
    botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'musica-btn';
    botao.title = 'Trilha original da Super Neon';
    botao.addEventListener('click', e => {
      e.stopPropagation();
      if (tocando) { parar(); salvar(false); } else { tocar(); salvar(true); }
    });
    document.body.appendChild(botao);
    atualizar();
    // O navegador só deixa tocar som depois de um clique ou tecla.
    if (querTocar()) {
      const primeira = e => {
        if (e.target === botao) return;
        removeEventListener('pointerdown', primeira, true);
        removeEventListener('keydown', primeira, true);
        if (querTocar()) tocar();
      };
      addEventListener('pointerdown', primeira, true);
      addEventListener('keydown', primeira, true);
    }
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) ac.suspend(); else if (tocando) ac.resume();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  return { tocar, parar };
})();
