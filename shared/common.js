// Utilitários compartilhados: sons sintetizados, ajuste do canvas, armazenamento, botão de som.
const Sfx = (() => {
  let ac = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem('arcade_muted') === '1'; } catch (e) { /* sem storage */ }

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur = 0.1, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Ruído filtrado. type 'lowpass' (estrondo) ou 'bandpass'/'highpass' (sopro, corte).
  function noise(dur = 0.4, vol = 0.3, cutoff = 1500, delay = 0, type = 'lowpass', cutoffTo = 60) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoffTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('arcade_muted', m ? '1' : '0'); } catch (e) { /* sem storage */ }
    if (master) master.gain.value = m ? 0 : 0.5;
  }

  return {
    ensure, tone, noise, setMuted,
    isMuted: () => muted,
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.11, null, i * 0.11)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, null, i * 0.14)); },
    explode() { noise(0.7, 0.55, 2000); tone(130, 0.5, 'sawtooth', 0.12, 35); },
    beep(hi) { tone(hi ? 880 : 440, hi ? 0.3 : 0.14, 'square', 0.14); },
  };
})();

// Joystick virtual na tela: arrastar com dedo ou mouse. x/y vão de -1 a 1.
class VJoy {
  constructor(el) {
    this.el = el;
    this.knob = el.querySelector('.vjoy-knob');
    this.x = 0; this.y = 0; this.id = null;
    el.addEventListener('pointerdown', e => {
      if (this.id !== null) return;
      Sfx.ensure();
      this.id = e.pointerId;
      el.classList.add('active');
      this.move(e);
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === this.id) this.move(e); });
    const end = e => {
      if (e.pointerId !== this.id) return;
      this.id = null; this.x = 0; this.y = 0;
      el.classList.remove('active');
      this.knob.style.transform = '';
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  move(e) {
    const r = this.el.getBoundingClientRect();
    const R = r.width / 2;
    let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    this.x = dx; this.y = dy;
    this.knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
  }
  get active() { return this.id !== null; }
  get mag() { return Math.hypot(this.x, this.y); }
}

const Arcade = (() => {
  const muteButtons = [];

  function syncMute() {
    for (const b of muteButtons) {
      b.textContent = Sfx.isMuted() ? '🔇' : '🔊';
      b.setAttribute('aria-label', Sfx.isMuted() ? 'Ativar som' : 'Silenciar');
    }
  }

  return {
    // Ajusta o canvas ao pai mantendo a proporção.
    // Retorna o fator entre pixels do canvas e unidades lógicas.
    fit(canvas, W, H, stage = canvas.parentElement) {
      const { w: pw, h: ph } = Arcade.innerSize(stage);
      const s = Math.max(0.2, Math.min(pw / W, ph / H));
      const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      return canvas.width / W;
    },
    // Área útil de um elemento (sem padding), em pixels CSS.
    innerSize(el) {
      const cs = getComputedStyle(el);
      return {
        w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      };
    },
    bindMute(btn) {
      muteButtons.push(btn);
      btn.addEventListener('click', () => { Sfx.ensure(); Arcade.toggleMute(); btn.blur(); });
      syncMute();
    },
    toggleMute() { Sfx.setMuted(!Sfx.isMuted()); syncMute(); },
    store: {
      get(key, def) {
        try { const v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; }
      },
      set(key, v) {
        try { localStorage.setItem(key, String(v)); } catch (e) { /* sem storage */ }
      },
    },
    // Botão 🎮 que mostra/esconde os controles na tela (padrão: visível só em telas de toque).
    setupPads(stage, btn, onChange) {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      let on = Arcade.store.get('arcade_pads', coarse ? '1' : '0') === '1';
      const apply = () => {
        stage.classList.toggle('no-pads', !on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = on ? 'Esconder controles na tela' : 'Mostrar controles na tela';
        onChange();
      };
      btn.addEventListener('click', () => { on = !on; Arcade.store.set('arcade_pads', on ? '1' : '0'); apply(); btn.blur(); });
      apply();
    },
    // Controle físico (Gamepad API). i = 0 para o primeiro conectado.
    gamepad(i = 0) {
      const list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
      const g = list[i];
      if (!g) return null;
      const ax = n => { const v = g.axes[n] || 0; return Math.abs(v) > 0.2 ? v : 0; };
      const b = n => !!(g.buttons[n] && g.buttons[n].pressed);
      let lx = ax(0), ly = ax(1);
      if (b(14)) lx = -1; if (b(15)) lx = 1; if (b(12)) ly = -1; if (b(13)) ly = 1;
      return { lx, ly, rx: ax(2), ry: ax(3), a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), lt: b(6), rt: b(7), start: b(9) };
    },
    // Liga os botões de opção (.seg[data-setting]) a um objeto de configurações salvo no navegador.
    bindSettings(root, settings, prefix, onChange = () => {}) {
      for (const seg of root.querySelectorAll('.seg[data-setting]')) {
        const key = seg.dataset.setting;
        const saved = Arcade.store.get(prefix + key, null);
        if (saved !== null && seg.querySelector(`[data-value="${saved}"]`)) settings[key] = saved;
        const sync = () => {
          for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b.dataset.value === String(settings[key]));
        };
        seg.addEventListener('click', e => {
          const b = e.target.closest('button[data-value]');
          if (!b || b.disabled) return;
          settings[key] = b.dataset.value;
          Arcade.store.set(prefix + key, b.dataset.value);
          sync(); onChange(key);
        });
        sync();
      }
    },
    // Códigos secretos (seção Dicas & Macetes da revista).
    // defs: { KONAMI: 'descrição', GULOSO: 'descrição', ... }. Cria a caixa "CÓDIGO SECRETO"
    // dentro de `mount`. Com o menu aberto, KONAMI também vale pela sequência ↑ ↑ ↓ ↓ ← → ← → B A.
    // Retorna { has(code), any(), list() }. Com código ativo, o recorde não deve ser salvo.
    codes(gameId, defs, mount, onChange = () => {}) {
      const key = 'codes_' + gameId;
      let active;
      try { active = new Set(JSON.parse(Arcade.store.get(key, '[]')).filter(c => defs[c])); } catch (e) { active = new Set(); }
      const save = () => Arcade.store.set(key, JSON.stringify([...active]));
      const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      const box = document.createElement('div');
      box.className = 'codebox';
      box.innerHTML = `
        <span class="opt-label">CÓDIGO SECRETO</span>
        <form class="code-form" autocomplete="off">
          <input class="code-input" maxlength="14" spellcheck="false" autocapitalize="characters" placeholder="DIGITE AQUI" aria-label="Código secreto">
          <button type="submit">OK</button>
        </form>
        <div class="code-list"></div>
        <p class="code-msg" aria-live="polite"></p>`;
      if (mount) mount.appendChild(box);
      const input = box.querySelector('.code-input'), list = box.querySelector('.code-list'), msg = box.querySelector('.code-msg');

      let toastEl = null, toastT = 0;
      function toast(text, ok) {
        if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'code-toast'; document.body.appendChild(toastEl); }
        toastEl.textContent = text;
        toastEl.classList.toggle('bad', !ok);
        toastEl.classList.add('show');
        clearTimeout(toastT);
        toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
      }
      function render() {
        list.innerHTML = '';
        for (const c of active) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'code-chip';
          b.textContent = `${c} ✕`;
          b.title = `${defs[c]} (clique para desligar)`;
          b.addEventListener('click', () => toggle(c));
          list.appendChild(b);
        }
        box.classList.toggle('has-codes', active.size > 0);
      }
      function toggle(c) {
        if (active.has(c)) {
          active.delete(c);
          msg.textContent = `${c} desligado.`;
          toast(`CÓDIGO DESLIGADO: ${c}`, true);
          Sfx.tone(400, 0.15, 'square', 0.08, 200);
        } else {
          active.add(c);
          msg.textContent = `CÓDIGO ACEITO! ${defs[c]}. Com código ligado o recorde não é salvo.`;
          toast(`★ CÓDIGO ACEITO: ${defs[c]}`, true);
          [523, 784, 1047, 1568].forEach((f, i) => Sfx.tone(f, 0.1, 'square', 0.08, null, i * 0.06));
        }
        save(); render(); onChange(c, active.has(c));
      }
      function tryCode(raw) {
        const c = norm(raw);
        if (defs[c]) { toggle(c); return true; }
        msg.textContent = 'CÓDIGO INVÁLIDO. Confira na revista!';
        toast('CÓDIGO INVÁLIDO', false);
        Sfx.tone(140, 0.25, 'sawtooth', 0.1);
        return false;
      }
      box.querySelector('.code-form').addEventListener('submit', e => {
        e.preventDefault();
        Sfx.ensure();
        if (input.value.trim()) tryCode(input.value);
        input.value = '';
        input.blur();
      });
      // Impede que as teclas digitadas na caixa controlem o jogo.
      input.addEventListener('keydown', e => e.stopPropagation());

      let buf = '';
      const KONAMI = 'UUDDLRLRBA';
      const ARROWS = { arrowup: 'U', arrowdown: 'D', arrowleft: 'L', arrowright: 'R' };
      addEventListener('keydown', e => {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        // Só no menu: durante a partida as letras são controles do jogo.
        if (mount && !mount.offsetParent) { buf = ''; return; }
        const k = e.key.toLowerCase();
        const t = ARROWS[k] || (/^[a-z0-9]$/.test(k) ? k.toUpperCase() : '');
        if (!t) return;
        buf = (buf + t).slice(-20);
        // Códigos com letras só pela caixa: digitados soltos, as letras acionariam teclas do jogo (M = som).
        if (defs.KONAMI && buf.endsWith(KONAMI)) { buf = ''; toggle('KONAMI'); }
      }, true);

      render();
      return { has: c => active.has(c), any: () => active.size > 0, list: () => [...active] };
    },
    rand: (a, b) => a + Math.random() * (b - a),
    pick: a => a[(Math.random() * a.length) | 0],
  };
})();
