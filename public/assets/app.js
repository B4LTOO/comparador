(function () {
  'use strict';

  var API = 'api/';
  var STORE_KEY = 'comparador-fps-v3';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var RES = [['1080', '1080p'], ['1440', '1440p'], ['3440', '3440×1440'], ['2160', '4K']];
  var QUAL = [['low', 'Baja'], ['mid', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra']];
  var UP = [['0', 'Apagado'], ['1', 'Calidad'], ['2', 'Equilibrado'], ['3', 'Rendimiento']];
  var HZ = [['60', '60 Hz'], ['144', '144 Hz'], ['240', '240 Hz'], ['360', '360 Hz']];
  var RAM = [['8', '8 GB'], ['16', '16 GB'], ['32', '32 GB']];
  var TAGS = [['all', 'Todos'], ['comp', 'Competitivos'], ['ex', 'Exigentes']];
  var SORTS = [
    ['def', 'Orden del catálogo', false], ['name', 'Nombre', false], ['a', 'Más FPS en PC A', false],
    ['b', 'Más FPS en PC B', true], ['diff', 'Mayor diferencia entre A y B', true], ['lim', 'Limitados por la CPU primero', false]
  ];
  var PRESETS = [
    ['Entrada', 'core-i5-12400f', 'geforce-rtx-5050', '16'],
    ['Gama media', 'ryzen-5-7600x', 'geforce-rtx-5060-ti-16gb', '16'],
    ['Alta gama', 'ryzen-7-9800x3d', 'geforce-rtx-5080', '32'],
    ['Extrema', 'ryzen-7-9850x3d', 'geforce-rtx-5090', '32'],
    ['Clásico', 'ryzen-5-1600', 'geforce-gtx-1060-6gb', '16']
  ];
  var LIM_SHORT = { cpu: 'CPU', gpu: 'GPU', eq: 'Equilibrio', cap: 'Tope' };
  var LIM_LONG = { cpu: 'Limita la CPU', gpu: 'Limita la GPU', eq: 'Equilibrado', cap: 'Tope del juego' };
  var LIM_ORDER = ['cpu', 'gpu', 'eq', 'cap'];
  var KEYS = ['a', 'b'];

  var DEFAULTS = { res: '1080', q: 'high', up: '0', rt: false, fg: false, hz: '144' };
  var state = {
    a: { cpu: 'core-i5-10400', gpu: 'geforce-rtx-5070-ti', ram: '16' },
    b: { cpu: 'ryzen-7-7800x3d', gpu: 'geforce-rtx-5070-ti', ram: '16' },
    useB: true, res: DEFAULTS.res, q: DEFAULTS.q, up: DEFAULTS.up, rt: false, fg: false, hz: DEFAULTS.hz,
    tag: 'all', sort: 'def', search: '', onlyMiss: false, theme: ''
  };

  var catalog = null;
  var result = null;
  var advice = null;
  var rows = {};
  var order = [];
  var board = {};
  var syncers = [];
  var reqId = 0, adviseId = 0, timer = 0, adviseTimer = 0;
  var deleteToken = null;
  var firstRender = true;
  var renderHooks = [];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Math.round(n).toLocaleString('es'); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  // Crea elementos con el DOM: todo texto entra como texto, nunca como marcado.
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) continue;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return el;
  }
  function svg(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) el.appendChild(arguments[i]);
    return el;
  }

  function showError(msg) { var e = $('error'); e.textContent = msg; e.hidden = false; }
  function hideError() { $('error').hidden = true; }
  function getJSON(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Error del servidor (' + res.status + ')');
        return data;
      });
    });
  }

  // ---- Persistencia ------------------------------------------------------
  function inList(list, v) { return list.some(function (i) { return i[0] === v; }); }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s || typeof s !== 'object') return;
      KEYS.forEach(function (r) {
        if (s[r] && typeof s[r].cpu === 'string' && typeof s[r].gpu === 'string' && inList(RAM, String(s[r].ram))) {
          state[r] = { cpu: s[r].cpu, gpu: s[r].gpu, ram: String(s[r].ram) };
        }
      });
      if (inList(RES, s.res)) state.res = s.res;
      if (inList(QUAL, s.q)) state.q = s.q;
      if (inList(UP, s.up)) state.up = s.up;
      if (inList(HZ, s.hz)) state.hz = s.hz;
      if (inList(TAGS, s.tag)) state.tag = s.tag;
      if (inList(SORTS, s.sort)) state.sort = s.sort;
      if (typeof s.rt === 'boolean') state.rt = s.rt;
      if (typeof s.fg === 'boolean') state.fg = s.fg;
      if (typeof s.useB === 'boolean') state.useB = s.useB;
      if (s.theme === 'light' || s.theme === 'dark') state.theme = s.theme;
    } catch (e) { /* sin almacenamiento: se usa el ejemplo */ }
  }
  function save() {
    try {
      var s = {};
      ['a', 'b', 'useB', 'res', 'q', 'up', 'rt', 'fg', 'hz', 'tag', 'sort', 'theme'].forEach(function (k) { s[k] = state[k]; });
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) { /* ignorar */ }
  }
  function hasPart(list, slug) { return list.some(function (i) { return i.slug === slug; }); }
  function sanitize() {
    KEYS.forEach(function (r) {
      if (!hasPart(catalog.cpus, state[r].cpu)) state[r].cpu = catalog.cpus[0].slug;
      if (!hasPart(catalog.gpus, state[r].gpu)) state[r].gpu = catalog.gpus[0].slug;
    });
  }
  function part(list, slug) { return list.filter(function (p) { return p.slug === slug; })[0]; }

  // ---- Tema --------------------------------------------------------------
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('themeBtn').textContent = t === 'dark' ? 'Modo claro' : 'Modo oscuro';
  }
  function initTheme() {
    if (!state.theme) {
      state.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(state.theme);
    $('themeBtn').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(state.theme); save();
    });
  }

  // ---- Controles reutilizables ---------------------------------------------
  function seg(label, options, get, set) {
    var buttons = [];
    var el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', role: 'radio', class: 'seg-b', 'aria-checked': 'false', tabindex: '-1', text: o[1] });
      b.addEventListener('click', function () { set(o[0]); });
      b.addEventListener('keydown', function (ev) {
        var i = options.findIndex(function (x) { return x[0] === get(); });
        var step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        ev.preventDefault();
        var n = options[(i + step + options.length) % options.length][0];
        set(n);
        buttons[options.findIndex(function (x) { return x[0] === n; })].focus();
      });
      buttons.push(b); el.appendChild(b);
    });
    function sync() {
      options.forEach(function (o, i) {
        var on = o[0] === get();
        buttons[i].setAttribute('aria-checked', on ? 'true' : 'false');
        buttons[i].tabIndex = on ? 0 : -1;
      });
    }
    syncers.push(sync);
    return el;
  }

  function toggle(title, hint, get, set) {
    var b = h('button', { type: 'button', role: 'switch', class: 'sw', 'aria-checked': 'false' },
      h('span', { class: 'sw-track' }, h('span', { class: 'sw-knob' })),
      h('span', { class: 'sw-text' }, h('strong', { text: title }), hint ? h('span', { text: hint }) : null));
    b.addEventListener('click', function () { set(!get()); });
    syncers.push(function () { b.setAttribute('aria-checked', get() ? 'true' : 'false'); });
    return b;
  }

  // Selector con búsqueda y teclado para procesadores y tarjetas.
  function combo(kind, rig, labelText) {
    var uid = 'cb-' + kind + '-' + rig;
    var input = h('input', {
      type: 'text', id: uid, role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false',
      'aria-controls': uid + '-list', autocomplete: 'off', spellcheck: 'false', placeholder: 'Escribe para buscar'
    });
    var list = h('ul', { role: 'listbox', id: uid + '-list', class: 'combo-list', 'aria-label': labelText });
    list.hidden = true;
    var wrap = h('div', { class: 'combo' }, input, list);
    var shown = [], active = -1;

    function items() { return kind === 'cpu' ? catalog.cpus : catalog.gpus; }
    function label(p) { return p.name + (p.source === 'estimado' ? ' (est.)' : ''); }
    function setActive(i) {
      active = i;
      Array.prototype.forEach.call(list.querySelectorAll('[role=option]'), function (li, k) {
        li.setAttribute('aria-selected', k === i ? 'true' : 'false');
        if (k === i) { li.scrollIntoView({ block: 'nearest' }); }
      });
      if (i >= 0) input.setAttribute('aria-activedescendant', uid + '-o' + i); else input.removeAttribute('aria-activedescendant');
    }
    function render(q) {
      var terms = norm(q).split(' ').filter(Boolean);
      shown = items().filter(function (p) {
        var t = norm(p.name + ' ' + p.brand), c = t.replace(/ /g, '');
        return terms.every(function (w) { return t.indexOf(w) >= 0 || c.indexOf(w) >= 0; });
      }).slice(0, 80);
      clear(list);
      if (!shown.length) list.appendChild(h('li', { class: 'combo-empty', text: 'Sin resultados. Prueba con otra parte del nombre.' }));
      var cur = -1;
      shown.forEach(function (p, i) {
        var isCur = p.slug === state[rig][kind];
        if (isCur) cur = i;
        var li = h('li', { role: 'option', id: uid + '-o' + i, class: 'combo-opt' + (isCur ? ' current' : ''), 'aria-selected': 'false' },
          h('span', { text: label(p) }), h('small', { text: kind === 'gpu' ? p.vram_gb + ' GB' : p.brand }));
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(p); });
        list.appendChild(li);
      });
      setActive(shown.length ? (terms.length ? 0 : Math.max(cur, 0)) : -1);
    }
    function open(q) {
      render(q); list.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function close() {
      list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
      sync();
    }
    function pick(p) {
      state[rig][kind] = p.slug;
      close(); input.blur();
      changed();
    }
    function sync() {
      var p = part(items(), state[rig][kind]);
      input.value = p ? label(p) : '';
    }
    input.addEventListener('focus', function () { input.select(); open(''); });
    input.addEventListener('input', function () { open(input.value); });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (list.hidden) open(''); else if (shown.length) setActive((active + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
      } else if (ev.key === 'Enter') {
        if (!list.hidden && active >= 0 && shown[active]) { ev.preventDefault(); pick(shown[active]); }
      } else if (ev.key === 'Escape') {
        if (!list.hidden) { ev.preventDefault(); close(); }
      }
    });
    syncers.push(function () { if (document.activeElement !== input) sync(); });
    return wrap;
  }

  // ---- Panel de configuración ------------------------------------------------
  function setValue(k, v) { state[k] = v; changed(); }

  function rigCard(r) {
    var R = r.toUpperCase();
    var presetBtns = PRESETS.map(function (p) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: p[0], title: 'Aplicar el equipo «' + p[0] + '» al PC ' + R });
      b.addEventListener('click', function () {
        if (!hasPart(catalog.cpus, p[1]) || !hasPart(catalog.gpus, p[2])) return;
        state[r] = { cpu: p[1], gpu: p[2], ram: p[3] };
        changed();
      });
      return b;
    });
    syncers.push(function () {
      PRESETS.forEach(function (p, i) {
        var s = state[r];
        presetBtns[i].setAttribute('aria-pressed', s.cpu === p[1] && s.gpu === p[2] && s.ram === p[3] ? 'true' : 'false');
      });
    });
    var gpuHint = h('p', { class: 'hint' });
    syncers.push(function () {
      var g = part(catalog.gpus, state[r].gpu);
      if (!g) return;
      var t = g.vram_gb + ' GB de memoria de video.';
      if (g.vram_gb <= 8 && (state.res === '2160' || state.res === '3440')) t += ' A esta resolución se queda corta y pierde FPS.';
      gpuHint.textContent = t;
    });

    function tile(kind) {
      var art = h('span', { class: 'tile-art' }), name = h('strong'), sub = h('span'), shown = '';
      syncers.push(function () {
        var p = part(kind === 'cpu' ? catalog.cpus : catalog.gpus, state[r][kind]);
        if (!p || shown === p.slug) return;
        shown = p.slug;
        art.textContent = '';
        art.appendChild(window.PartArt.make(kind, p));
        art.classList.remove('swap'); void art.offsetWidth; art.classList.add('swap');
        name.textContent = p.name;
        sub.textContent = kind === 'gpu' ? (p.brand === 'Integrada' ? 'Gráficos integrados' : p.brand + ' · ' + p.vram_gb + ' GB de video') : p.brand + ' · procesador';
      });
      return h('div', { class: 'tile ' + kind }, art, h('span', { class: 'tile-t' }, h('em', { text: kind === 'cpu' ? 'Procesador' : 'Tarjeta de video' }), name, sub),
        window.FPSHooks ? window.FPSHooks.tileButton(kind, r, function (f) { syncers.push(f); }) : null);
    }
    var showcase = h('div', { class: 'showcase' }, tile('gpu'), tile('cpu'));

    var body = h('div', { class: 'stack' }, showcase,
      h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Punto de partida' }), (function () { var d = h('div', { class: 'presets' }); presetBtns.forEach(function (b) { d.appendChild(b); }); return d; })()),
      h('div', { class: 'field' }, h('label', { for: 'cb-cpu-' + r, text: 'Procesador' }), combo('cpu', r, 'Procesadores')),
      h('div', { class: 'field' }, h('label', { for: 'cb-gpu-' + r, text: 'Tarjeta de video' }), combo('gpu', r, 'Tarjetas de video'), gpuHint),
      h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Memoria RAM' }),
        seg('Memoria RAM del PC ' + R, RAM, function () { return state[r].ram; }, function (v) { state[r].ram = v; changed(); }))
    );
    if (window.FPSHooks) body.appendChild(window.FPSHooks.rigPanel(r, function (f) { syncers.push(f); }));
    var head = h('div', { class: 'rig-head' }, h('div', { class: 'rig-title' }, h('i', { class: 'dot' }), h('h2', { text: 'PC ' + R })));
    var card = h('section', { class: 'card rig rig-' + r, 'aria-label': 'PC ' + R });
    card.appendChild(head);
    if (r === 'b') {
      head.appendChild(toggle('Comparar', null, function () { return state.useB; }, function (v) { state.useB = v; changed(); }));
      var wrapB = h('div', { class: 'collapse' }, h('div', { class: 'collapse-in' }, body));
      syncers.push(function () { wrapB.className = 'collapse' + (state.useB ? '' : ' shut'); wrapB.setAttribute('aria-hidden', state.useB ? 'false' : 'true'); if ('inert' in wrapB) wrapB.inert = !state.useB; });
      card.appendChild(wrapB);
    } else {
      card.appendChild(body);
    }
    return card;
  }

  function settingsCard() {
    var reset = h('button', { type: 'button', class: 'btn ghost small', text: 'Restablecer' });
    reset.addEventListener('click', function () { Object.keys(DEFAULTS).forEach(function (k) { state[k] = DEFAULTS[k]; }); changed(); });
    function group(title, hint, control) {
      return h('div', { class: 'group' }, h('span', { class: 'lbl', text: title }), control, hint ? h('p', { class: 'hint', text: hint }) : null);
    }
    return h('section', { class: 'card settings', 'aria-label': 'Cómo juegas' },
      h('div', { class: 'rig-head' }, h('h2', { text: 'Cómo juegas' }), reset),
      group('Resolución', 'Más píxeles piden más a la tarjeta de video.', seg('Resolución', RES, function () { return state.res; }, function (v) { setValue('res', v); })),
      group('Calidad gráfica', null, seg('Calidad gráfica', QUAL, function () { return state.q; }, function (v) { setValue('q', v); })),
      group('Escalado (DLSS, FSR, XeSS)', 'Dibuja a menor resolución y reescala. Solo en juegos compatibles; ayuda más en 1440p y 4K.',
        seg('Escalado', UP, function () { return state.up; }, function (v) { setValue('up', v); })),
      toggle('Trazado de rayos', 'Luces y reflejos realistas. Castiga más a tarjetas viejas y a AMD.', function () { return state.rt; }, function (v) { setValue('rt', v); }),
      toggle('Generación de fotogramas', 'Inserta cuadros extra. Los FPS reales no cambian y sube la latencia.', function () { return state.fg; }, function (v) { setValue('fg', v); }),
      group('Mi monitor', 'La marca de las barras y los porcentajes usan esta meta.', seg('Frecuencia del monitor', HZ, function () { return state.hz; }, function (v) { setValue('hz', v); })),
      h('p', { class: 'keys' }, 'Atajos: ', h('kbd', { text: '1' }), ' a ', h('kbd', { text: '4' }), ' resolución, ', h('kbd', { text: 'R' }), ' rayos, ',
        h('kbd', { text: 'F' }), ' fotogramas, ', h('kbd', { text: 'B' }), ' comparar.')
    );
  }

  function buildConfig() {
    var cfg = $('config');
    cfg.appendChild(rigCard('a'));
    var swap = h('button', { type: 'button', class: 'btn ghost small', text: 'Intercambiar A y B' });
    swap.addEventListener('click', function () { var t = state.a; state.a = state.b; state.b = t; changed(); });
    var copy = h('button', { type: 'button', class: 'btn ghost small', text: 'Copiar A en B' });
    copy.addEventListener('click', function () { state.b = { cpu: state.a.cpu, gpu: state.a.gpu, ram: state.a.ram }; state.useB = true; changed(); });
    var tools = h('div', { class: 'tools' }, swap, copy);
    cfg.appendChild(tools);
    cfg.appendChild(rigCard('b'));
    cfg.appendChild(settingsCard());
  }

  function syncAll() { syncers.forEach(function (f) { f(); }); }
  function changed() { syncAll(); save(); refresh(); }

  // ---- Consultas a la API -------------------------------------------------------
  function paramsFor(extra) {
    var p = new URLSearchParams();
    ['a', 'b'].forEach(function (r) {
      if (r === 'b' && !state.useB) return;
      p.set('cpu_' + r, state[r].cpu); p.set('gpu_' + r, state[r].gpu); p.set('ram_' + r, state[r].ram);
    });
    p.set('res', state.res); p.set('q', state.q); p.set('up', state.up);
    p.set('rt', state.rt ? '1' : '0'); p.set('fg', state.fg ? '1' : '0');
    Object.keys(extra || {}).forEach(function (k) { p.set(k, extra[k]); });
    return p.toString();
  }

  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var id = ++reqId;
      $('results').classList.add('busy');
      getJSON(API + 'estimate.php?' + paramsFor()).then(function (data) {
        if (id !== reqId) return;
        hideError();
        result = data;
        render();
      }).catch(function (err) {
        if (id === reqId) showError('No se pudo calcular: ' + err.message);
      }).then(function () { if (id === reqId) $('results').classList.remove('busy'); });
    }, 90);
    scheduleAdvice();
  }

  function scheduleAdvice() {
    clearTimeout(adviseTimer);
    adviseTimer = setTimeout(function () {
      var id = ++adviseId;
      getJSON(API + 'advise.php?' + paramsFor(state.tag === 'all' ? {} : { tag: state.tag })).then(function (data) {
        if (id !== adviseId) return;
        advice = data; renderAdvice();
      }).catch(function () {
        if (id === adviseId) { advice = null; renderAdvice(true); }
      });
    }, 350);
  }

  // ---- Marcador -----------------------------------------------------------------
  function tween(el, to) {
    var from = el._v || 0;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (reduced || from === to) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = firstRender ? 1100 : 600;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      k = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * k);
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }

  function buildBoard() {
    var sb = $('scoreboard');
    var C = 2 * Math.PI * 34;
    KEYS.forEach(function (r) {
      var o = { C: C };
      o.num = h('span', { class: 'big-num', text: '0' });
      o.cpu = h('strong'); o.rest = h('span');
      o.ring = svg('circle', { class: 'ring-val', cx: 42, cy: 42, r: 34, fill: 'none', 'stroke-width': 9, 'stroke-dasharray': String(C) });
      o.ring.style.strokeDashoffset = String(C);
      o.pct = h('strong', { text: '0 de 0' }); o.pctTxt = h('span');
      o.segs = {}; o.legend = {};
      var bar = h('div', { class: 'bn-bar', role: 'img' });
      var legend = h('ul', { class: 'bn-legend' });
      LIM_ORDER.forEach(function (k) {
        o.segs[k] = h('i', { class: 'c-' + k, title: LIM_LONG[k] });
        bar.appendChild(o.segs[k]);
        o.legend[k] = h('b', { text: '0' });
        legend.appendChild(h('li', null, h('span', { class: 'sq c-' + k }), h('span', { text: LIM_LONG[k] + ' en ' }), o.legend[k]));
      });
      o.bar = bar;
      o.el = h('article', { class: 'score ' + r },
        h('div', { class: 'score-who' }, h('span', { text: 'PC ' + r.toUpperCase() }), o.cpu, o.rest),
        h('div', { class: 'big' }, o.num, h('span', { class: 'big-unit', text: 'FPS en promedio' })),
        h('div', { class: 'goal' },
          svg('svg', { class: 'ring', viewBox: '0 0 84 84', 'aria-hidden': 'true' }, svg('circle', { class: 'ring-track', cx: 42, cy: 42, r: 34, fill: 'none', 'stroke-width': 9 }), o.ring),
          h('div', { class: 'goal-txt' }, o.pct, o.pctTxt)),
        h('div', { class: 'bn' }, bar, legend),
        (o.value = h('div', { class: 'cost' })));
      o.value.hidden = true;
      board[r] = o;
    });
    board.deltaNum = h('strong'); board.deltaTxt = h('span'); board.deltaCost = h('span', { class: 'delta-cost' });
    board.delta = h('div', { class: 'delta' }, board.deltaNum, board.deltaTxt, board.deltaCost);
    sb.appendChild(board.a.el); sb.appendChild(board.delta); sb.appendChild(board.b.el);
  }

  function activeKeys() { return state.useB ? KEYS : ['a']; }
  function tagged() { return result.games.filter(function (g) { return state.tag === 'all' || g.tag === state.tag; }); }
  function hz() { return Number(state.hz); }

  function renderBoard() {
    var games = tagged(), n = games.length, avgs = {};
    $('scoreboard').className = 'scoreboard' + (state.useB ? ' two' : '');
    board.b.el.hidden = !state.useB; board.delta.hidden = !state.useB;
    activeKeys().forEach(function (r) {
      var o = board[r], info = result.rigs[r], sum = 0, hit = 0, lim = { cpu: 0, gpu: 0, eq: 0, cap: 0 };
      games.forEach(function (g) {
        sum += g[r].fps; if (g[r].fps >= hz()) hit++; lim[g[r].lim]++;
      });
      var avg = n ? sum / n : 0;
      avgs[r] = avg;
      o.cpu.textContent = info.cpu;
      o.rest.textContent = info.gpu + ', ' + info.ram + ' GB de RAM';
      tween(o.num, avg);
      o.ring.style.strokeDashoffset = String(o.C * (1 - (n ? hit / n : 0)));
      o.pct.textContent = hit + ' de ' + n;
      o.pctTxt.textContent = 'juegos llegan a ' + state.hz + ' FPS';
      var desc = [];
      LIM_ORDER.forEach(function (k) {
        o.segs[k].style.flexGrow = String(lim[k]);
        o.segs[k].style.flexBasis = '0';
        o.legend[k].textContent = String(lim[k]);
        desc.push(LIM_LONG[k] + ': ' + lim[k]);
      });
      o.bar.setAttribute('aria-label', 'Cuello de botella del PC ' + r.toUpperCase() + '. ' + desc.join(', '));
      if (window.FPSHooks) window.FPSHooks.cost(r, o.value, avg);
    });
    if (window.FPSHooks) window.FPSHooks.compare(board.deltaCost, avgs);
    if (state.useB) {
      var d = avgs.a > 0 ? (avgs.b / avgs.a - 1) * 100 : 0;
      var cls = Math.abs(d) < 1 ? '' : d > 0 ? ' up' : ' down';
      board.delta.className = 'delta' + cls;
      board.deltaNum.textContent = Math.abs(d) < 1 ? 'Empate' : (d > 0 ? '+' : '−') + fmt(Math.abs(d)) + ' %';
      board.deltaTxt.textContent = Math.abs(d) < 1 ? 'los dos rinden igual' : 'FPS del PC B respecto al A';
    }
  }

  // ---- Consejos -----------------------------------------------------------------
  function renderAdvice(failed) {
    var box = $('advisor');
    clear(box);
    if (failed || !advice) {
      box.appendChild(h('p', { class: 'adv-none', text: failed ? 'No se pudieron calcular las mejoras. Revisa la conexión con el servidor.' : 'Calculando…' }));
      return;
    }
    activeKeys().forEach(function (r) {
      var d = advice.rigs[r];
      if (!d) return;
      var R = r.toUpperCase();
      var best = function (l) { return l.reduce(function (m, o) { return Math.max(m, o.gain); }, 0); };
      var bc = best(d.cpu), bg = best(d.gpu), verdict;
      if (!d.cpu.length && !d.gpu.length) verdict = 'Ya tiene las piezas más potentes del catálogo.';
      else if (bc > bg * 1.25) verdict = 'Empieza por el procesador: es lo que más frena a este equipo.';
      else if (bg > bc * 1.25) verdict = 'Empieza por la tarjeta de video: es lo que más frena a este equipo.';
      else verdict = 'Procesador y tarjeta dan ganancias parecidas; cambia la que te salga más barata.';
      var maxGain = Math.max(bc, bg, 1);
      var scopeTxt = state.tag === 'all' ? ' juegos' : state.tag === 'comp' ? ' juegos competitivos' : ' juegos exigentes';
      var card = h('article', { class: 'adv rig-' + r },
        h('h3', null, h('i', { class: 'dot' }), 'Mejorar el PC ' + R),
        h('p', { class: 'adv-sub', text: 'Hoy rinde ' + fmt(d.baseline) + ' FPS de promedio en ' + advice.games + scopeTxt + '. ' + verdict }));
      [['Procesador', 'cpu', d.cpu], ['Tarjeta de video', 'gpu', d.gpu]].forEach(function (g) {
        var ul = h('ul', { class: 'opts' });
        if (!g[2].length) ul.appendChild(h('li', { class: 'adv-none', text: 'No hay una pieza más potente en el catálogo.' }));
        g[2].forEach(function (o) {
          var btn = h('button', { type: 'button', class: 'btn ghost small', text: 'Probar', 'aria-label': 'Probar ' + o.name + ' en el PC ' + R });
          btn.addEventListener('click', function () { state[r][g[1]] = o.slug; changed(); });
          var bar = h('span', { class: 'opt-bar' }, h('i'));
          bar.firstChild.style.width = Math.max(4, o.gain / maxGain * 100) + '%';
          var po = part(g[1] === 'cpu' ? catalog.cpus : catalog.gpus, o.slug);
          var li = h('li', { class: 'opt' },
            h('span', { class: 'opt-art' }, po ? window.PartArt.make(g[1], po) : null),
            h('span', { class: 'opt-name', text: o.name, title: o.name }),
            h('span', { class: 'opt-gain', text: '+' + fmt(o.gain) + ' %' }),
            bar, btn);
          ul.appendChild(li);
          if (window.FPSHooks) window.FPSHooks.option(g[1], r, o, li);
        });
        card.appendChild(h('div', null, h('h4', { text: g[0] }), ul));
      });
      box.appendChild(card);
    });
  }

  // ---- Juego por juego -----------------------------------------------------------
  function chevron() {
    return svg('svg', { class: 'chev', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
      svg('path', { d: 'M6 9l6 6 6-6' }));
  }

  function buildToolbar() {
    var tb = $('toolbar');
    var search = h('input', { type: 'text', id: 'gameSearch', placeholder: 'Buscar juego', autocomplete: 'off', 'aria-label': 'Buscar juego' });
    search.addEventListener('input', function () { state.search = search.value; renderGames(); });
    var sortSel = h('select', { id: 'gameSort', 'aria-label': 'Ordenar juegos' });
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; save(); renderGames(); });
    syncers.push(function () {
      var want = SORTS.filter(function (s) { return !s[2] || state.useB; });
      if (sortSel.options.length !== want.length) {
        clear(sortSel);
        want.forEach(function (s) { sortSel.appendChild(h('option', { value: s[0], text: s[1] })); });
      }
      if (!want.some(function (s) { return s[0] === state.sort; })) state.sort = 'def';
      sortSel.value = state.sort;
    });
    var tagSeg = seg('Tipo de juego', TAGS, function () { return state.tag; }, function (v) { state.tag = v; syncAll(); save(); scheduleAdvice(); if (result) { renderBoard(); renderGames(); } });
    var miss = toggle('Solo los que no llegan a mi meta', null, function () { return state.onlyMiss; }, function (v) { state.onlyMiss = v; syncAll(); renderGames(); });
    tb.appendChild(h('div', { class: 'field' }, h('label', { for: 'gameSearch', text: 'Buscar' }), search));
    tb.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Tipo' }), tagSeg));
    tb.appendChild(h('div', { class: 'field narrow' }, h('label', { for: 'gameSort', text: 'Ordenar por' }), sortSel));
    tb.appendChild(miss);
  }

  function buildRows() {
    var list = $('gameList');
    var legendMark = h('span');
    var legend = h('li', { class: 'legend' },
      h('span', null, h('i', { class: 'sq c-a' }), 'PC A'),
      h('span', { id: 'legendB' }, h('i', { class: 'sq c-b' }), 'PC B'),
      legendMark);
    list.appendChild(legend);
    catalog.games.forEach(function (g) {
      var r = { slug: g.slug, game: g, open: false, line: {}, fill: {}, mark: {}, val: {}, num: {}, sub: {}, lim: {} };
      r.tags = {
        rt: h('span', { class: 'tag', title: 'Admite trazado de rayos', text: 'RT' }),
        fg: h('span', { class: 'tag', title: 'Admite generación de fotogramas', text: 'FG' }),
        up: h('span', { class: 'tag', title: 'Admite DLSS, FSR o XeSS', text: 'Escalado' })
      };
      var lims = h('span', { class: 'g-lims' });
      var bars = h('span', { class: 'g-bars' });
      KEYS.forEach(function (k) {
        r.fill[k] = h('i', { class: 'fill' });
        r.mark[k] = h('i', { class: 'mark' });
        r.num[k] = h('span', { text: '0' });
        r.sub[k] = h('small');
        r.val[k] = h('span', { class: 'g-val' }, r.num[k], r.sub[k]);
        r.line[k] = h('span', { class: 'g-line ' + k }, h('span', { class: 'track' }, r.fill[k], r.mark[k]), r.val[k]);
        r.lim[k] = h('span', { class: 'pill' }, h('i', { class: 'sq' }), h('span'));
        bars.appendChild(r.line[k]); lims.appendChild(r.lim[k]);
      });
      var nameEl = h('span', { class: 'g-name' }, h('span', { text: g.name }),
        g.source === 'estimado' ? h('span', { class: 'est', text: '(est.)' }) : null,
        r.tags.rt, r.tags.fg, r.tags.up, lims);
      r.head = h('button', { type: 'button', class: 'game-head', 'aria-expanded': 'false' }, nameEl, bars, chevron());
      r.detail = h('div', { class: 'detail-in' });
      r.li = h('li', { class: 'game' }, r.head, h('div', { class: 'game-detail' }, r.detail));
      r.head.addEventListener('click', function () {
        r.open = !r.open;
        r.li.classList.toggle('open', r.open);
        r.head.setAttribute('aria-expanded', r.open ? 'true' : 'false');
        r.detail.hidden = !r.open;
        if (r.open) fillDetail(r);
      });
      r.detail.hidden = true;
      rows[g.slug] = r; order.push(g.slug);
      list.appendChild(r.li);
    });
    var none = h('li', { class: 'empty', id: 'noGames', hidden: true }, h('span', { text: 'Ningún juego coincide con los filtros.' }));
    var clearBtn = h('button', { type: 'button', class: 'btn ghost small', text: 'Quitar filtros' });
    clearBtn.addEventListener('click', function () {
      state.tag = 'all'; state.search = ''; state.onlyMiss = false; $('gameSearch').value = '';
      syncAll(); save(); scheduleAdvice(); renderBoard(); renderGames();
    });
    none.appendChild(clearBtn);
    list.appendChild(none);
  }

  function meter(text, pct, full, cls) {
    var i = h('i'); i.style.width = Math.min(100, pct) + '%';
    return h('div', { class: 'meter' + (full ? ' full' : '') + ' ' + cls }, h('span', { text: text }), h('span', { class: 'meter-track' }, i), h('b', { text: pct + ' %' }));
  }

  function fillDetail(r) {
    if (!r.data) return;
    var g = r.data;
    clear(r.detail);
    var grid = h('div', { class: 'detail-grid' });
    activeKeys().forEach(function (k) {
      var e = g[k], info = result.rigs[k];
      var msg = {
        cpu: 'La CPU es el cuello de botella: la tarjeta trabaja al ' + e.gpu_use + ' %. Cambiar solo la tarjeta casi no sube los FPS; un procesador más rápido sí.',
        gpu: 'La tarjeta de video es el cuello de botella: la CPU trabaja al ' + e.cpu_use + ' %. Ayuda bajar la calidad, activar el escalado o cambiar la tarjeta.',
        eq: 'Equilibrado: procesador y tarjeta se aprovechan casi al máximo.',
        cap: 'El juego limita los FPS por diseño, así que ninguna pieza llega a su máximo.'
      }[e.lim];
      var lines = ['Mínimos 1 %: ' + fmt(e.low) + ' FPS.'];
      if (e.fg) lines.push('FPS reales: ' + fmt(e.base_fps) + '. La generación de fotogramas muestra ' + fmt(e.fps) + ', pero la respuesta al mouse sigue siendo la de los reales.');
      var pill = h('span', { class: 'pill' }, h('i', { class: 'sq c-' + e.lim }), h('span', { text: LIM_LONG[e.lim] }));
      grid.appendChild(h('div', { class: 'det ' + k },
        h('h4', { text: 'PC ' + k.toUpperCase() + ': ' + info.gpu }),
        pill,
        meter('Tarjeta de video', e.gpu_use, e.gpu_use >= 95, 'gpu'),
        meter('Procesador', e.cpu_use, e.cpu_use >= 95, 'cpu'),
        h('p', { text: msg }),
        h('p', { text: lines.join(' ') }),
        h('p', { text: 'En este juego la tarjeta daría hasta ' + fmt(e.gpu_cap) + ' FPS y el procesador hasta ' + fmt(e.cpu_cap) + '.' })
      ));
    });
    r.detail.appendChild(grid);
  }

  function renderGames() {
    if (!result) return;
    var byslug = {};
    result.games.forEach(function (g) { byslug[g.slug] = g; });
    var keys = activeKeys(), q = norm(state.search);

    // Primero decide qué juegos se ven y la escala de las barras.
    var visible = [], max = 120;
    result.games.forEach(function (g) {
      var okTag = state.tag === 'all' || g.tag === state.tag;
      var okSearch = !q || norm(g.name).indexOf(q) >= 0;
      var okMiss = !state.onlyMiss || keys.some(function (k) { return g[k].fps < hz(); });
      var show = okTag && okSearch && okMiss;
      rows[g.slug].show = show;
      if (show) { visible.push(g); keys.forEach(function (k) { max = Math.max(max, g[k].fps); }); }
    });
    var scale = Math.ceil(Math.max(max, hz() * 1.1) / 60) * 60;

    result.games.forEach(function (g) {
      var r = rows[g.slug];
      r.data = g;
      r.li.hidden = !r.show;
      r.tags.rt.hidden = !g.feat.rt; r.tags.fg.hidden = !g.feat.fg; r.tags.up.hidden = !g.feat.up;
      r.tags.rt.classList.toggle('on', state.rt && g.feat.rt);
      r.tags.fg.classList.toggle('on', state.fg && g.feat.fg);
      r.tags.up.classList.toggle('on', state.up !== '0' && g.feat.up);
      KEYS.forEach(function (k) {
        var on = keys.indexOf(k) >= 0;
        r.line[k].hidden = !on; r.lim[k].hidden = !on;
        if (!on) return;
        var e = g[k];
        r.fill[k].style.width = Math.min(100, e.fps / scale * 100) + '%';
        r.mark[k].style.left = Math.min(100, hz() / scale * 100) + '%';
        r.num[k].textContent = fmt(e.fps);
        r.sub[k].textContent = e.fg ? 'FG' : '';
        r.val[k].className = 'g-val ' + (e.fps >= hz() ? 'hit' : 'miss');
        r.val[k].title = e.fps >= hz() ? 'Llega a tu meta de ' + state.hz + ' FPS' : 'No llega a tu meta de ' + state.hz + ' FPS';
        r.lim[k].firstChild.className = 'sq c-' + e.lim;
        r.lim[k].lastChild.textContent = (keys.length > 1 ? k.toUpperCase() + ': ' : '') + LIM_SHORT[e.lim];
        r.lim[k].title = LIM_LONG[e.lim];
      });
      if (r.open) fillDetail(r);
    });

    // Orden: solo se mueven los nodos si el orden cambió.
    var sorted = result.games.slice();
    var idx = {}; catalog.games.forEach(function (g, i) { idx[g.slug] = i; });
    var by = state.sort;
    if (by === 'name') sorted.sort(function (x, y) { return x.name.localeCompare(y.name, 'es'); });
    else if (by === 'a' || (by === 'b' && state.useB)) sorted.sort(function (x, y) { return y[by].fps - x[by].fps; });
    else if (by === 'diff' && state.useB) sorted.sort(function (x, y) { return Math.abs(Math.log(y.b.fps / y.a.fps)) - Math.abs(Math.log(x.b.fps / x.a.fps)); });
    else if (by === 'lim') sorted.sort(function (x, y) { return LIM_ORDER.indexOf(x.a.lim) - LIM_ORDER.indexOf(y.a.lim) || idx[x.slug] - idx[y.slug]; });
    else sorted.sort(function (x, y) { return idx[x.slug] - idx[y.slug]; });
    var next = sorted.map(function (g) { return g.slug; });
    if (next.join() !== order.join()) {
      var anchor = $('noGames');
      next.forEach(function (s) { $('gameList').insertBefore(rows[s].li, anchor); });
      order = next;
    }

    $('noGames').hidden = visible.length > 0;
    $('legendB').hidden = !state.useB;
    $('gameList').firstChild.lastChild.textContent = 'La marca vertical es tu meta de ' + state.hz + ' FPS.';
    $('gamesCount').textContent = visible.length + ' de ' + result.games.length + ' juegos. Meta: ' + state.hz + ' FPS';
  }

  // ---- Atajos de teclado ----------
  function initFx() {
    document.addEventListener('keydown', function (ev) {
      var el = document.activeElement, tag = el && el.tagName;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || !catalog) return;
      var k = ev.key.toLowerCase();
      if (k >= '1' && k <= '4') state.res = RES[Number(k) - 1][0];
      else if (k === 'r') state.rt = !state.rt;
      else if (k === 'f') state.fg = !state.fg;
      else if (k === 'b') state.useB = !state.useB;
      else return;
      changed();
    });
  }

  function render() {
    if (firstRender && !reduced) {
      var sb = $('scoreboard');
      sb.classList.add('boot');
      setTimeout(function () { sb.classList.remove('boot'); }, 1500);
    }
    renderBoard();
    renderGames();
    firstRender = false;
    renderHooks.splice(0).forEach(function (cb) { try { cb(); } catch (e) { /* el asistente nunca debe romper la página */ } });
  }

  // ---- Puente para el asistente (chat.js) -------------------------------------------
  function stats() {
    if (!result) return null;
    var games = tagged(), out = { n: games.length, hz: hz(), rigs: {} };
    activeKeys().forEach(function (r) {
      var sum = 0, hit = 0, lim = { cpu: 0, gpu: 0, eq: 0, cap: 0 };
      games.forEach(function (g) { sum += g[r].fps; if (g[r].fps >= hz()) hit++; lim[g[r].lim]++; });
      out.rigs[r] = { avg: games.length ? sum / games.length : 0, hit: hit, lim: lim, cpu: result.rigs[r].cpu, gpu: result.rigs[r].gpu, ram: result.rigs[r].ram };
    });
    return out;
  }
  window.FPSApp = {
    state: state,
    labels: { res: RES, q: QUAL, up: UP, hz: HZ },
    presets: PRESETS,
    catalog: function () { return catalog; },
    result: function () { return result; },
    stats: stats,
    fetchAdvice: function () { return getJSON(API + 'advise.php?' + paramsFor(state.tag === 'all' ? {} : { tag: state.tag })); },
    onRender: function (cb) { renderHooks.push(cb); },
    refreshBoard: function () { if (result) renderBoard(); },
    change: function (fn) { fn(state); sanitize(); changed(); },
    reset: function () { Object.keys(DEFAULTS).forEach(function (k) { state[k] = DEFAULTS[k]; }); changed(); },
    swap: function () { var t = state.a; state.a = state.b; state.b = t; changed(); }
  };

  // ---- Guardar, compartir y borrar ---------------------------------------------------
  function shareUrl(code) { return location.origin + location.pathname + '?b=' + code; }

  function showSaved(code) {
    var box = $('saveResult');
    clear(box);
    var input = h('input', { type: 'text', readonly: 'readonly', value: shareUrl(code), 'aria-label': 'Enlace para compartir' });
    var copy = h('button', { type: 'button', class: 'btn ghost', text: 'Copiar enlace' });
    copy.addEventListener('click', function () {
      input.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(function () { copy.textContent = 'Enlace copiado'; }, function () { /* queda seleccionado */ });
      }
    });
    box.appendChild(input);
    box.appendChild(copy);
    if (deleteToken) {
      var del = h('button', { type: 'button', class: 'btn ghost', text: 'Eliminar' });
      del.addEventListener('click', function () { removeSaved(code, del); });
      box.appendChild(del);
    }
    box.appendChild(h('p', { text: 'Cualquiera con este enlace puede ver la comparación. Solo tú puedes eliminarla, desde esta pestaña.' }));
    box.hidden = false;
  }

  function removeSaved(code, button) {
    button.disabled = true;
    getJSON(API + 'builds.php?code=' + encodeURIComponent(code) + '&token=' + encodeURIComponent(deleteToken), { method: 'DELETE' })
      .then(function () { deleteToken = null; $('saveResult').hidden = true; loadRecent(); })
      .catch(function (err) { button.disabled = false; showError(err.message); });
  }

  function submitSave(ev) {
    ev.preventDefault();
    var btn = $('saveBtn');
    btn.disabled = true;
    var body = {
      title: $('title').value, public: $('isPublic').checked,
      cpu_a: state.a.cpu, gpu_a: state.a.gpu, ram_a: Number(state.a.ram),
      res: Number(state.res), q: state.q, up: Number(state.up), rt: state.rt, fg: state.fg
    };
    if (state.useB) { body.cpu_b = state.b.cpu; body.gpu_b = state.b.gpu; body.ram_b = Number(state.b.ram); }
    getJSON(API + 'builds.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (data) { hideError(); deleteToken = data.delete_token; showSaved(data.code); loadRecent(); })
      .catch(function (err) { showError('No se pudo guardar: ' + err.message); })
      .then(function () { btn.disabled = false; });
  }

  function loadRecent() {
    var list = $('recent');
    getJSON(API + 'builds.php?recent=1').then(function (data) {
      clear(list);
      if (!data.builds.length) {
        list.appendChild(h('li', { class: 'meta', text: 'Todavía no hay comparaciones públicas. Guarda una con «Mostrar en recientes».' }));
        return;
      }
      data.builds.forEach(function (b) {
        var a = b.a.cpu_name + ' con ' + b.a.gpu_name;
        var detail = b.b ? a + ' contra ' + b.b.cpu_name + ' con ' + b.b.gpu_name : a;
        list.appendChild(h('li', null,
          h('a', { href: '?b=' + encodeURIComponent(b.code), text: b.title || 'Comparación ' + b.code }),
          h('span', { class: 'meta', text: detail })));
      });
    }).catch(function () { /* la lista es opcional */ });
  }

  function applyBuild(b) {
    state.a = { cpu: b.a.cpu, gpu: b.a.gpu, ram: String(b.a.ram) };
    state.useB = !!b.b;
    if (b.b) state.b = { cpu: b.b.cpu, gpu: b.b.gpu, ram: String(b.b.ram) };
    state.res = String(b.settings.res);
    state.q = b.settings.q;
    state.up = String(Number(b.settings.up));
    state.rt = !!b.settings.rt;
    state.fg = !!b.settings.fg;
  }

  // ---- Inicio ------------------------------------------------------------------------
  function init() {
    load();
    initTheme();
    initFx();
    getJSON(API + 'catalog.php').then(function (data) {
      // El catálogo llega de menor a mayor potencia: se muestra de mayor a menor.
      data.cpus.reverse(); data.gpus.reverse();
      catalog = data;
      var code = new URLSearchParams(location.search).get('b');
      var loaded = /^[a-z2-9]{8}$/.test(code || '')
        ? getJSON(API + 'builds.php?code=' + code).then(applyBuild).catch(function () { showError('No se encontró esa comparación guardada. Se muestra el ejemplo.'); })
        : Promise.resolve();
      return loaded.then(function () {
        sanitize();
        buildConfig(); buildBoard(); buildToolbar(); buildRows();
        $('saveForm').addEventListener('submit', submitSave);
        syncAll();
        refresh();
        loadRecent();
        window.dispatchEvent(new Event('fps-ready'));
      });
    }).catch(function (err) {
      showError('No se pudo conectar con el servidor: ' + err.message);
    });
  }

  init();
})();
