// Leitores online: presença em tempo real com o Firebase Realtime Database (plano gratuito).
// Cada aba aberta grava presenca/{local}/{id} e o Firebase apaga sozinho quando a aba fecha.
// "local" é o jogo (pasta em jogos/) ou "revista" para a banca e as edições.
// As regras estão em database.rules.json. Depende de ranking.js (carregador do SDK).
const Presenca = (() => {
  const local = document.documentElement.dataset.presenca
    || (location.pathname.match(/\/jogos\/([a-z0-9-]+)\//) || [])[1]
    || 'revista';
  const ouvintes = [];
  let estado = null; // { total, porLocal: { snake: 2, revista: 5, ... } }

  function avisar() { for (const f of ouvintes) f(estado); }

  async function conectar() {
    const cfg = window.SUPER_NEON_FIREBASE || {};
    if (typeof Ranking === 'undefined' || !Ranking.enabled || !cfg.databaseURL) return;
    let app;
    try { app = await Ranking.app('database'); } catch (e) { return; }
    const db = app.database();
    const eu = db.ref('presenca/' + local).push();
    // A cada (re)conexão: primeiro combina o "apague quando eu sair", depois marca presença.
    db.ref('.info/connected').on('value', s => {
      if (s.val() !== true) return;
      eu.onDisconnect().remove()
        .then(() => eu.set({ t: firebase.database.ServerValue.TIMESTAMP }))
        .catch(() => { /* já marcado ou sem permissão: o contador segue sem esta aba */ });
    });
    db.ref('presenca').on('value', s => {
      const porLocal = {};
      let total = 0;
      s.forEach(l => { const n = l.numChildren(); porLocal[l.key] = n; total += n; });
      estado = { total, porLocal };
      avisar();
    }, () => { /* leitura negada ou offline */ });
  }

  /* ---------- selos na tela ---------- */
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  function seloJogo(topbar) {
    const el = document.createElement('span');
    el.className = 'online';
    el.hidden = true;
    const btn = topbar.querySelector('.icon-btn');
    topbar.insertBefore(el, btn || null);
    ouvintes.push(e => {
      const aqui = e.porLocal[local] || 0;
      el.hidden = false;
      el.innerHTML = `<i aria-hidden="true"></i>${aqui} jogando`;
      el.title = `${plural(aqui, 'pessoa jogando', 'pessoas jogando')} este jogo agora · ${plural(e.total, 'pessoa', 'pessoas')} na Super Neon`;
    });
  }
  function seloRevista() {
    const el = document.createElement('div');
    el.className = 'online-flutuante';
    el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    ouvintes.push(e => {
      el.hidden = false;
      el.innerHTML = `<i aria-hidden="true"></i><b>${e.total}</b> ${e.total === 1 ? 'leitor online' : 'leitores online'}`;
      const jogando = e.total - (e.porLocal.revista || 0);
      el.title = `${e.porLocal.revista || 0} lendo a revista · ${jogando} jogando`;
    });
  }

  function iniciar() {
    const topbar = document.querySelector('.game-page .topbar');
    if (topbar) seloJogo(topbar); else seloRevista();
    conectar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  return {
    local,
    // Recebe { total, porLocal } sempre que alguém entra ou sai.
    onChange(f) { ouvintes.push(f); if (estado) f(estado); },
  };
})();
