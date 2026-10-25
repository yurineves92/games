// Hall da Fama global: Firebase Firestore (plano gratuito), placar estilo fliperama com 3 iniciais.
// Cada placar fica em ranking/{board}/scores. As regras de segurança estão em firestore.rules.
const Ranking = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const cfg = window.SUPER_NEON_FIREBASE || {};
  const enabled = !!(cfg.apiKey && cfg.projectId);
  let dbP = null;

  const loadScript = src => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
  function db() {
    if (!enabled) return Promise.reject(new Error('ranking desligado'));
    if (!dbP) {
      dbP = (async () => {
        if (!window.firebase) {
          await loadScript(SDK + 'firebase-app-compat.js');
          await loadScript(SDK + 'firebase-firestore-compat.js');
        }
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
        return app.firestore();
      })();
      dbP.catch(() => { dbP = null; });
    }
    return dbP;
  }
  const boardId = id => String(id).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
  const scores = (d, id) => d.collection('ranking').doc(boardId(id)).collection('scores');

  async function top(id, n = 10) {
    const d = await db();
    const snap = await scores(d, id).orderBy('score', 'desc').limit(n).get();
    return snap.docs.map(x => ({ id: x.id, ...x.data() }));
  }
  async function submit(id, name, score) {
    const d = await db();
    const ref = await scores(d, id).add({ name, score: Math.floor(score), at: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderList(ol, rows, mine) {
    if (!rows.length) { ol.innerHTML = '<li class="rank-empty">Ninguém ainda. Seja o primeiro!</li>'; return; }
    ol.innerHTML = rows.map((r, i) =>
      `<li class="${r.id === mine ? 'me' : ''}"><span class="rank-pos">${i + 1}º</span><span class="rank-name">${esc(r.name)}</span><span class="rank-score">${Number(r.score) || 0}</span></li>`).join('');
  }

  // Lista simples (usada na página Hall da Fama da revista).
  async function list(ol, id, n = 5) {
    if (!enabled) { ol.innerHTML = '<li class="rank-empty">Ranking global desligado.</li>'; return; }
    ol.innerHTML = '<li class="rank-empty">Carregando…</li>';
    try { renderList(ol, await top(id, n)); } catch (e) { ol.innerHTML = '<li class="rank-empty">Sem conexão com o Hall da Fama.</li>'; }
  }

  // Bloco do ranking dentro do painel de fim de jogo.
  // opts: { board: 'snake-normal', score, cheated }
  function gameOver(mount, { board, score, cheated = false }) {
    if (!mount) return;
    if (!enabled) { mount.innerHTML = ''; mount.hidden = true; return; }
    mount.hidden = false;
    mount.innerHTML = `
      <h3 class="rank-title">HALL DA FAMA</h3>
      <form class="rank-form" hidden autocomplete="off">
        <label>SUAS INICIAIS <input class="rank-input" maxlength="3" spellcheck="false" autocapitalize="characters" aria-label="Suas iniciais (até 3 letras)"></label>
        <button type="submit">GRAVAR</button>
      </form>
      <p class="rank-msg" aria-live="polite"></p>
      <ol class="rank-list"><li class="rank-empty">Carregando…</li></ol>`;
    const form = mount.querySelector('.rank-form'), input = mount.querySelector('.rank-input');
    const msg = mount.querySelector('.rank-msg'), ol = mount.querySelector('.rank-list');
    input.value = Arcade.store.get('rank_initials', '');
    input.addEventListener('keydown', e => e.stopPropagation());
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

    let rows = [];
    top(board, 10).then(r => {
      rows = r;
      renderList(ol, rows);
      if (cheated) { msg.textContent = 'Código secreto ligado: este placar fica fora do ranking.'; return; }
      if (score <= 0) return;
      const last = rows[rows.length - 1];
      if (rows.length < 10 || score > last.score) {
        form.hidden = false;
        msg.textContent = 'Você entrou no TOP 10!';
      } else {
        msg.textContent = `Faltaram ${last.score - score + 1} pontos para entrar no TOP 10.`;
      }
    }).catch(() => { ol.innerHTML = '<li class="rank-empty">Sem conexão com o Hall da Fama.</li>'; });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (!name) { input.focus(); return; }
      Arcade.store.set('rank_initials', name);
      form.querySelector('button').disabled = true;
      msg.textContent = 'Gravando…';
      try {
        const id = await submit(board, name, score);
        form.hidden = true;
        msg.textContent = 'Placar gravado!';
        renderList(ol, await top(board, 10), id);
        Sfx.win();
      } catch (err) {
        form.querySelector('button').disabled = false;
        msg.textContent = 'Não deu para gravar. Tente de novo.';
      }
    });
  }

  return { enabled, top, submit, list, gameOver };
})();
