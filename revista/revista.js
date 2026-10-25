// Comportamento da revista: capas, CD-ROM, navegação, Hall da Fama e um segredinho.
const Revista = (() => {
  // Caminho até a raiz do site (as edições ficam em edicoes/NN/, então lá é "../../").
  const base = document.documentElement.dataset.base || '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const edicao = n => EDICOES.find(e => e.n === Number(n));

  function lerRecorde(jogo) {
    let melhor = 0;
    for (const [k] of jogo.recordes) {
      try { melhor = Math.max(melhor, Number(localStorage.getItem(k)) || 0); } catch (e) { /* sem storage */ }
    }
    return melhor;
  }

  /* ---------- capa ---------- */
  function capaHTML(ed) {
    return `
      <img class="capa-arte" src="${base}edicoes/${ed.slug}/arte.svg" alt="">
      <div class="capa-topo"><span>Nº ${ed.n} · ${esc(ed.mes)} · ${esc(ed.ano)}</span><span>${ed.especial ? 'Especial · ' : ''}${esc(ed.preco)}</span></div>
      <div class="capa-logo" aria-hidden="true"><span class="l1">Super</span><span class="l2">Neon</span></div>
      <div class="capa-num" aria-hidden="true"><small>Nº</small><b>${String(ed.n).padStart(2, '0')}</b></div>
      <ul class="capa-chamadas">${ed.chamadas.map(([t, s, c]) => `<li style="--c:${c}"><b>${esc(t)}</b><br>${esc(s)}</li>`).join('')}</ul>
      <div class="capa-selo">${esc(ed.selo)}</div>
      <p class="capa-manchete"><span class="m1">${esc(ed.manchete)}</span><span class="m2">${esc(ed.manchete2)}</span></p>
      <div class="capa-rodape"><span>★ ${esc(ed.rodape)}</span><span class="capa-barras" data-cod="${ed.cod}"></span></div>
      <div class="capa-brilho"></div>`;
  }
  function montarCapas() {
    for (const el of document.querySelectorAll('[data-capa]')) {
      const ed = edicao(el.dataset.capa);
      if (!ed) continue;
      el.classList.add('capa');
      el.style.setProperty('--capa-fundo', ed.fundo);
      el.style.setProperty('--capa-manchete', ed.corManchete);
      el.setAttribute('aria-label', `Capa da Super Neon número ${ed.n}: ${ed.manchete}`);
      el.innerHTML = capaHTML(ed);
    }
  }

  /* ---------- CD-ROM ---------- */
  let carregando = null;
  function abrirJogo(jogo, href) {
    if (!carregando) {
      carregando = document.createElement('div');
      carregando.className = 'win-carregando';
      carregando.innerHTML = `
        <div class="win" role="dialog" aria-label="Carregando">
          <div class="win-titulo"><span>Copiando…</span></div>
          <div class="win-corpo"><p class="msg"></p><div class="barra"><i></i></div></div>
        </div>`;
      document.body.appendChild(carregando);
    }
    carregando.querySelector('.msg').textContent = `Lendo D:\\${jogo.nome.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}.EXE do CD-ROM…`;
    carregando.classList.remove('on');
    void carregando.offsetWidth;
    carregando.classList.add('on');
    setTimeout(() => { location.href = href; }, 950);
  }
  function montarCDROM() {
    for (const el of document.querySelectorAll('[data-cdrom]')) {
      const ed = edicao(el.dataset.cdrom);
      if (!ed) continue;
      const icones = ed.jogos.map(id => {
        const j = JOGOS[id], rec = lerRecorde(j);
        return `<a class="icone" href="${base}${j.pasta}" data-jogo="${id}">
          <span class="icone-img" aria-hidden="true">${ICONE[id] || ''}</span>
          <span>${esc(j.nome)}.exe</span>
          <small>${rec ? `Recorde: ${rec}` : 'Sem recorde'}</small>
          <small class="jogando" data-jogando="${id}" hidden></small></a>`;
      }).join('');
      el.innerHTML = `
        <div class="win">
          <div class="win-titulo"><span>💿 CD-ROM Super Neon Nº ${ed.n} (D:)</span><span class="win-btns"><i>_</i><i>□</i><i>×</i></span></div>
          <div class="win-menu"><span><u>A</u>rquivo</span><span><u>E</u>ditar</span><span><u>E</u>xibir</span><span>Aj<u>u</u>da</span></div>
          <div class="win-corpo">
            ${icones}
            <a class="icone" href="#dicas"><span class="icone-img" aria-hidden="true">${ICONE_TXT}</span><span>LEIAME.txt</span><small>Códigos secretos</small></a>
          </div>
          <div class="win-status"><span>${ed.jogos.length + 1} objeto(s)</span><span>Clique duas vezes… ou uma só, a gente não liga</span></div>
        </div>`;
      for (const a of el.querySelectorAll('a[data-jogo]')) {
        a.addEventListener('click', e => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          abrirJogo(JOGOS[a.dataset.jogo], a.href);
        });
      }
    }
  }
  const ICONE_TXT = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path d="M3 1h7l3 3v11H3Z" fill="#fff" stroke="#000" stroke-width=".6"/><path d="M10 1v3h3" fill="#c0c0c0" stroke="#000" stroke-width=".6"/><g fill="#000080"><rect x="5" y="6" width="6" height=".8"/><rect x="5" y="8" width="6" height=".8"/><rect x="5" y="10" width="4" height=".8"/><rect x="5" y="12" width="5" height=".8"/></g></svg>`;

  /* ---------- Hall da Fama ---------- */
  function montarHall() {
    for (const el of document.querySelectorAll('[data-hall]')) {
      el.innerHTML = Object.entries(JOGOS).map(([id, j]) => `
        <div class="hall-jogo" style="--c:${j.cor}">
          <h3>${esc(j.nome)}</h3>
          <p class="local">Seu recorde: <b>${lerRecorde(j) || '—'}</b> · Edição ${j.ed}</p>
          <p class="local jogando" data-jogando="${id}" hidden></p>
          <ol data-board="${j.ranking}"></ol>
          ${j.rankingNome ? `<p class="local">Ranking: ${esc(j.rankingNome)}</p>` : ''}
        </div>`).join('');
      for (const ol of el.querySelectorAll('ol[data-board]')) {
        if (typeof Ranking !== 'undefined') Ranking.list(ol, ol.dataset.board, 5);
        else ol.innerHTML = '<li class="rank-empty">Ranking indisponível.</li>';
      }
    }
  }

  // Quantas pessoas estão em cada jogo agora (shared/presenca.js).
  function montarJogando() {
    if (typeof Presenca === 'undefined') return;
    Presenca.onChange(e => {
      for (const el of document.querySelectorAll('[data-jogando]')) {
        const n = e.porLocal[el.dataset.jogando] || 0;
        el.hidden = n === 0;
        el.textContent = `● ${n} jogando agora`;
      }
    });
  }

  /* ---------- navegação e animações ---------- */
  function montarNav() {
    const links = [...document.querySelectorAll('.nav a[href^="#"]')];
    const alvo = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        for (const a of links) a.classList.toggle('ativo', a === alvo.get(e.target.id));
      }
    }, { rootMargin: '-30% 0px -60% 0px' });
    for (const id of alvo.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }

    const surge = new IntersectionObserver(entradas => {
      for (const e of entradas) if (e.isIntersecting) { e.target.classList.add('visivel'); surge.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    for (const el of document.querySelectorAll('.surge')) surge.observe(el);
  }

  // ↑ ↑ ↓ ↓ ← → ← → B A na revista liga o "modo turbo".
  function segredo() {
    const seq = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let i = 0, raf = 0;
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      i = k === seq[i] ? i + 1 : (k === seq[0] ? 1 : 0);
      if (i < seq.length) return;
      i = 0;
      const on = document.body.classList.toggle('turbo');
      cancelAnimationFrame(raf);
      if (on) {
        const t0 = performance.now();
        const gira = t => { document.body.style.setProperty('--h', `${((t - t0) / 8) % 360}deg`); raf = requestAnimationFrame(gira); };
        raf = requestAnimationFrame(gira);
      } else document.body.style.removeProperty('--h');
    });
  }

  function iniciar() {
    montarCapas();
    montarCDROM();
    montarHall();
    montarJogando();
    montarNav();
    segredo();
    const ano = document.querySelector('[data-ano]');
    if (ano) ano.textContent = new Date().getFullYear();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  return { edicao, lerRecorde };
})();
