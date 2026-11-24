/* Presupuesto, compatibilidad y lista de compras. Todo queda en este navegador (localStorage):
   los precios los escribe la persona, la página no consulta tiendas. */
(function () {
  'use strict';
  var KEY = 'fps-extras-v1';
  var S = { prices: {}, psu: { a: '', b: '' }, board: { a: 'auto', b: 'auto' }, list: [], budget: '' };
  var subs = [];

  function A() { return window.FPSApp; }
  function C() { return window.Compat; }
  function h(tag, attrs) {
    var el = document.createElement(tag), a = attrs || {};
    Object.keys(a).forEach(function (k) {
      if (a[k] == null || a[k] === false) return;
      if (k === 'class') el.className = a[k]; else if (k === 'text') el.textContent = a[k]; else el.setAttribute(k, a[k] === true ? '' : a[k]);
    });
    for (var i = 2; i < arguments.length; i++) if (arguments[i] != null) el.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
    return el;
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('es-CL'); }
  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.min(n, 99999999) : 0; }
  function rigName(r) { return 'PC ' + r.toUpperCase(); }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s || typeof s !== 'object') return;
      if (s.prices && typeof s.prices === 'object') Object.keys(s.prices).forEach(function (k) { if (/^[a-z0-9:.-]{1,80}$/i.test(k) && num(s.prices[k])) S.prices[k] = num(s.prices[k]); });
      ['a', 'b'].forEach(function (r) {
        if (s.psu && C().PSU_SIZES.indexOf(Number(s.psu[r])) >= 0) S.psu[r] = String(Number(s.psu[r]));
        if (s.board && C().BOARDS.some(function (b) { return b.id === s.board[r]; })) S.board[r] = s.board[r];
      });
      if (Array.isArray(s.list)) S.list = s.list.filter(function (i) {
        return i && (i.kind === 'cpu' || i.kind === 'gpu') && /^[a-z0-9-]{1,60}$/.test(i.slug) && (i.rig === 'a' || i.rig === 'b') && typeof i.name === 'string';
      }).slice(0, 30).map(function (i) {
        return { kind: i.kind, slug: i.slug, rig: i.rig, name: String(i.name).slice(0, 60), brand: String(i.brand || '').slice(0, 20), vram_gb: Number(i.vram_gb) || 0,
          gain: typeof i.gain === 'number' ? i.gain : null, needs: i.needs && typeof i.needs === 'object' ? { board: i.needs.board || null, ram: i.needs.ram || null } : { board: null, ram: null } };
      });
      S.budget = num(s.budget) ? String(num(s.budget)) : '';
    } catch (e) { /* sin almacenamiento */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignorar */ } }
  function notify(src) { save(); subs.forEach(function (f) { try { f(src); } catch (e) { /* una vista no rompe a las demás */ } }); if (A() && A().refreshBoard) A().refreshBoard(); }
  function on(fn) { subs.push(fn); }

  function part(kind, slug) {
    var cat = A() && A().catalog && A().catalog();
    if (!cat) return null;
    return (kind === 'cpu' ? cat.cpus : cat.gpus).filter(function (p) { return p.slug === slug; })[0] || null;
  }
  function priceOf(key) { return S.prices[key] || 0; }
  function setPrice(key, v) { var n = num(v); if (n) S.prices[key] = n; else delete S.prices[key]; }

  // ---- Costo de cada PC ---------------------------------------------------------------
  function rigCost(r) {
    var st = A().state[r], keys = ['cpu:' + st.cpu, 'gpu:' + st.gpu, 'ram:' + st.ram], total = 0, have = 0;
    keys.forEach(function (k) { if (priceOf(k)) { total += priceOf(k); have++; } });
    return { total: total, have: have, missing: keys.length - have };
  }
  function costHook(r, el, avg) {
    var c = rigCost(r);
    el.hidden = !c.have;
    if (!c.have) return;
    el.textContent = '';
    el.appendChild(h('span', null, 'Costo de las piezas: '));
    el.appendChild(h('strong', { text: money(c.total) }));
    var bits = [];
    if (c.missing) bits.push('faltan ' + c.missing + ' precio' + (c.missing > 1 ? 's' : ''));
    else if (avg > 0) bits.push(money(c.total / avg) + ' por cada FPS');
    if (bits.length) el.appendChild(h('span', { class: 'cost-sub', text: ' · ' + bits.join(' · ') }));
  }
  function compareHook(el, avgs) {
    var st = A().state;
    el.textContent = '';
    if (!st.useB) return;
    var a = rigCost('a'), b = rigCost('b');
    if (a.missing || b.missing || !a.have) return;
    var d = b.total - a.total;
    el.textContent = Math.abs(d) < 1 ? 'Cuestan lo mismo' : 'El PC B cuesta ' + money(Math.abs(d)) + (d > 0 ? ' más' : ' menos');
  }

  // ---- Lista ---------------------------------------------------------------------------
  function inList(kind, slug, rig) { return S.list.some(function (i) { return i.kind === kind && i.slug === slug && i.rig === rig; }); }
  function addItem(it) {
    if (inList(it.kind, it.slug, it.rig)) return false;
    if (S.list.length >= 30) return false;
    S.list.push(it); notify(); return true;
  }
  function removeItem(kind, slug, rig) {
    S.list = S.list.filter(function (i) { return !(i.kind === kind && i.slug === slug && i.rig === rig); }); notify();
  }
  function itemFrom(kind, p, rig, gain, needs) {
    return { kind: kind, slug: p.slug, rig: rig, name: p.name, brand: p.brand || '', vram_gb: p.vram_gb || 0, gain: gain == null ? null : gain, needs: needs || { board: null, ram: null } };
  }

  function curNeeds(candidateName, rig) {
    var cur = A().state[rig].cpu, curPart = part('cpu', cur);
    return C().upgradeNeeds(curPart ? curPart.name : candidateName, S.board[rig], candidateName);
  }

  // ---- Panel dentro de la tarjeta de cada PC -------------------------------------------
  function rigPanel(r, addSync) {
    var boardSel = h('select', { id: 'board-' + r, 'aria-label': 'Placa madre del PC ' + r.toUpperCase() });
    C().BOARDS.forEach(function (b) { boardSel.appendChild(h('option', { value: b.id, text: b.label })); });
    var psuSel = h('select', { id: 'psu-' + r, 'aria-label': 'Fuente de poder del PC ' + r.toUpperCase() });
    psuSel.appendChild(h('option', { value: '', text: 'No sé / no la indico' }));
    C().PSU_SIZES.forEach(function (w) { psuSel.appendChild(h('option', { value: String(w), text: w + ' W' })); });
    boardSel.value = S.board[r]; psuSel.value = S.psu[r];
    boardSel.addEventListener('change', function () { S.board[r] = boardSel.value; notify('rig' + r); update(); });
    psuSel.addEventListener('change', function () { S.psu[r] = psuSel.value; notify('rig' + r); update(); });

    var checks = h('ul', { class: 'checks', 'aria-live': 'polite' });
    var rows = {};
    [['cpu', 'Procesador'], ['gpu', 'Tarjeta de video'], ['ram', 'Memoria RAM (kit)']].forEach(function (d) {
      var inp = h('input', { type: 'number', min: '0', max: '99999999', step: '1000', inputmode: 'numeric', id: 'price-' + r + '-' + d[0], placeholder: '0' });
      inp.addEventListener('input', function () { setPrice(d[0] + ':' + (d[0] === 'ram' ? A().state[r].ram : A().state[r][d[0]]), inp.value); notify('rig' + r); totals(); });
      rows[d[0]] = inp;
    });
    var total = h('p', { class: 'price-total' });

    function totals() {
      var c = rigCost(r);
      total.textContent = c.have ? 'Total de las piezas: ' + money(c.total) + (c.missing ? ' (faltan ' + c.missing + ' precio' + (c.missing > 1 ? 's' : '') + ')' : '') : 'Escribe lo que cuesta cada pieza para ver el costo y los FPS por peso.';
    }
    function item(level, text) {
      var icon = level === 'ok' ? '✓' : level === 'bad' ? '✕' : level === 'warn' ? '!' : 'i';
      return h('li', { class: 'chk ' + level }, h('span', { class: 'chk-i', 'aria-hidden': 'true', text: icon }), h('span', { text: text }));
    }
    function update() {
      var st = A().state[r], cpu = part('cpu', st.cpu), gpu = part('gpu', st.gpu);
      if (!cpu || !gpu) return;
      boardSel.value = S.board[r]; psuSel.value = S.psu[r];
      checks.textContent = '';
      var ck = C().check(cpu.name, S.board[r]);
      checks.appendChild(item(ck.ok ? 'ok' : 'bad', ck.text));
      var pf = C().platformOf(cpu.name, S.board[r]);
      if (pf) checks.appendChild(item('info', 'Memoria: ' + (pf.mems.length > 1 ? 'DDR4 o DDR5, según la placa que elijas.' : pf.mems[0] + '. Una RAM de otro tipo no entra en la placa.')));
      var gw = C().gpuWatts(gpu.name), cw = C().cpuWatts(cpu.name);
      if (gw == null) checks.appendChild(item('info', 'No tengo el consumo de esta tarjeta.'));
      else { var ps = C().psuStatus(Number(S.psu[r]) || 0, cw, gw); checks.appendChild(item(ps.level, ps.text)); }
      rows.cpu.value = priceOf('cpu:' + st.cpu) || ''; rows.gpu.value = priceOf('gpu:' + st.gpu) || ''; rows.ram.value = priceOf('ram:' + st.ram) || '';
      totals();
    }
    addSync(update);
    on(function (src) { if (src !== 'rig' + r) update(); });

    function field(label, id, control) { return h('div', { class: 'field' }, h('label', { for: id, text: label }), control); }
    function priceRow(d, id, label) { return h('div', { class: 'price-row' }, h('label', { for: id, text: label }), h('span', { class: 'money' }, h('i', { 'aria-hidden': 'true', text: '$' }), rows[d])); }
    return h('details', { class: 'extras', open: true },
      h('summary', { text: 'Compatibilidad y presupuesto' }),
      h('div', { class: 'extras-in' },
        field('Placa madre', 'board-' + r, boardSel), field('Fuente de poder', 'psu-' + r, psuSel), checks,
        h('div', { class: 'lbl', text: 'Precios (opcional)' }),
        priceRow('cpu', 'price-' + r + '-cpu', 'Procesador'), priceRow('gpu', 'price-' + r + '-gpu', 'Tarjeta de video'), priceRow('ram', 'price-' + r + '-ram', 'RAM (kit)'), total));
  }

  // ---- Botón "Agregar a la lista" de la ficha de cada pieza -----------------------------
  function tileButton(kind, r, addSync) {
    var b = h('button', { type: 'button', class: 'btn ghost small tile-add' });
    function sync() {
      var st = A().state[r], p = part(kind, st[kind]);
      if (!p) return;
      var inl = inList(kind, p.slug, r);
      b.textContent = inl ? 'En la lista · quitar' : 'Agregar a la lista';
      b.setAttribute('aria-pressed', inl ? 'true' : 'false');
    }
    b.addEventListener('click', function () {
      var st = A().state[r], p = part(kind, st[kind]);
      if (!p) return;
      if (inList(kind, p.slug, r)) removeItem(kind, p.slug, r);
      else addItem(itemFrom(kind, p, r, null, kind === 'cpu' ? C().upgradeNeeds(p.name, S.board[r], p.name) : null));
    });
    addSync(sync); on(sync);
    return b;
  }

  // ---- Extras de cada opción del asesor --------------------------------------------------
  function optionHook(kind, r, o, li) {
    var p = part(kind, o.slug);
    if (!p) return;
    var st = A().state[r], needs = kind === 'cpu' ? curNeeds(o.name, r) : { board: null, ram: null, note: '' };
    var key = kind + ':' + o.slug;
    var inp = h('input', { type: 'number', min: '0', max: '99999999', step: '1000', inputmode: 'numeric', placeholder: 'Precio', 'aria-label': 'Precio de ' + o.name, value: priceOf(key) || '' });
    var info = h('span', { class: 'opt-cost' });
    function calc() {
      var pr = priceOf(key);
      info.textContent = pr && o.gain > 0 ? money(pr) + ' · ' + money(pr / o.gain) + ' por cada +1 %' : '';
    }
    inp.addEventListener('input', function () { setPrice(key, inp.value); calc(); notify('opt'); });
    calc();
    var badges = h('div', { class: 'badges' });
    if (kind === 'cpu') badges.appendChild(h('span', { class: 'badge ' + (needs.board ? 'warn' : 'ok'), text: needs.board ? needs.note : 'Misma placa: solo cambias el procesador' }));
    else {
      var gw = C().gpuWatts(o.name), cur = part('cpu', st.cpu);
      if (gw != null && cur) {
        var ps = C().psuStatus(Number(S.psu[r]) || 0, C().cpuWatts(cur.name), gw);
        badges.appendChild(h('span', { class: 'badge ' + (ps.level === 'bad' ? 'bad' : ps.level === 'warn' ? 'warn' : 'info'), text: ps.level === 'ok' ? 'Tu fuente alcanza' : 'Fuente recomendada: ' + (ps.rec > 1200 ? '1200 W o más' : ps.rec + ' W') }));
      }
    }
    var add = h('button', { type: 'button', class: 'btn ghost small', text: 'Agregar a la lista', 'aria-label': 'Agregar ' + o.name + ' a la lista de compras' });
    function sync() { var inl = inList(kind, o.slug, r); add.textContent = inl ? 'En la lista · quitar' : 'Agregar a la lista'; add.setAttribute('aria-pressed', inl ? 'true' : 'false'); }
    add.addEventListener('click', function () {
      if (inList(kind, o.slug, r)) removeItem(kind, o.slug, r); else addItem(itemFrom(kind, p, r, o.gain, needs));
    });
    sync();
    li.appendChild(h('div', { class: 'opt-extra' }, badges, h('div', { class: 'opt-tools' }, h('span', { class: 'money small' }, h('i', { 'aria-hidden': 'true', text: '$' }), inp), info, add)));
    on(function () { if (li.isConnected) sync(); });
  }

  // ---- Panel "Mi lista de compras" -------------------------------------------------------
  function mount(root) {
    var box = h('div', { class: 'shop' });
    root.appendChild(box);

    function accessories() {
      var acc = [], seen = {};
      S.list.forEach(function (i) {
        if (i.needs && i.needs.board && !seen['board:' + i.needs.board]) { seen['board:' + i.needs.board] = 1; acc.push({ key: 'board:' + i.needs.board, label: 'Placa madre ' + i.needs.board, tone: 'warn', note: 'Necesaria para el ' + i.name + '.' }); }
        if (i.needs && i.needs.ram && !seen['kit:' + i.needs.ram]) { seen['kit:' + i.needs.ram] = 1; acc.push({ key: 'kit:' + i.needs.ram, label: 'Memoria RAM ' + i.needs.ram, tone: 'warn', note: 'Tu RAM actual no sirve con esa placa.' }); }
      });
      ['a', 'b'].forEach(function (r) {
        var mine = S.list.filter(function (i) { return i.rig === r; });
        if (!mine.length || !A() || !A().catalog()) return;
        var st = A().state[r];
        var cpuI = mine.filter(function (i) { return i.kind === 'cpu'; }).pop(), gpuI = mine.filter(function (i) { return i.kind === 'gpu'; }).pop();
        var cp = cpuI ? cpuI.name : (part('cpu', st.cpu) || {}).name, gp = gpuI ? gpuI.name : (part('gpu', st.gpu) || {}).name;
        if (!cp || !gp) return;
        var gw = C().gpuWatts(gp);
        if (gw == null) return;
        var ps = C().psuStatus(Number(S.psu[r]) || 0, C().cpuWatts(cp), gw);
        if (ps.level === 'ok') return;
        var k = 'psu:' + ps.rec;
        if (seen[k]) return;
        seen[k] = 1;
        acc.push({ key: k, label: 'Fuente de poder de ' + (ps.rec > 1200 ? '1200 W o más' : ps.rec + ' W'), tone: ps.level === 'info' ? 'info' : ps.level, note: rigName(r) + ': ' + ps.text, optional: ps.level === 'info' });
      });
      return acc;
    }
    function totalOf(acc) {
      var t = 0;
      S.list.forEach(function (i) { t += priceOf(i.kind + ':' + i.slug); });
      acc.forEach(function (a) { t += priceOf(a.key); });
      return t;
    }
    function listText(acc) {
      var L = ['Lista de compras · ArmaTuRig', ''];
      S.list.forEach(function (i, n) {
        L.push((n + 1) + '. ' + i.name + ' (' + (i.kind === 'cpu' ? 'procesador' : 'tarjeta de video') + ', ' + rigName(i.rig) + ')' + (priceOf(i.kind + ':' + i.slug) ? ' - ' + money(priceOf(i.kind + ':' + i.slug)) : '') + (i.gain != null ? ' - sube ' + Math.round(i.gain) + ' % los FPS' : ''));
      });
      acc.forEach(function (a) { L.push('+ ' + a.label + (priceOf(a.key) ? ' - ' + money(priceOf(a.key)) : '')); });
      L.push('', 'Total: ' + money(totalOf(acc)));
      if (num(S.budget)) L.push('Presupuesto: ' + money(num(S.budget)));
      L.push('', 'Los precios los escribí yo; revisa que cada pieza siga disponible antes de comprar.');
      return L.join('\n');
    }

    var totalEl, budgetMsg, bar, fill;
    function updateTotals(acc) {
      var t = totalOf(acc), b = num(S.budget);
      totalEl.textContent = money(t);
      if (!b) { budgetMsg.textContent = 'Escribe tu presupuesto para ver cuánto te sobra.'; budgetMsg.className = 'bmsg'; bar.hidden = true; return; }
      bar.hidden = false;
      fill.style.width = Math.min(100, t / b * 100) + '%';
      var over = t > b;
      fill.className = over ? 'over' : '';
      budgetMsg.className = 'bmsg ' + (over ? 'bad' : 'ok');
      budgetMsg.textContent = over ? 'Te pasas por ' + money(t - b) + '.' : 'Te sobran ' + money(b - t) + '.';
    }

    function render() {
      box.textContent = '';
      if (!S.list.length) {
        box.appendChild(h('p', { class: 'empty', text: 'Tu lista está vacía. Usa «Agregar a la lista» en las recomendaciones o en la ficha de cada pieza, escribe los precios y mira el total y la compatibilidad.' }));
        return;
      }
      var acc = accessories(), ul = h('ul', { class: 'shop-list' });
      S.list.forEach(function (i) {
        var p = part(i.kind, i.slug) || i;
        var inp = h('input', { type: 'number', min: '0', max: '99999999', step: '1000', inputmode: 'numeric', placeholder: 'Precio', 'aria-label': 'Precio de ' + i.name, value: priceOf(i.kind + ':' + i.slug) || '' });
        inp.addEventListener('input', function () { setPrice(i.kind + ':' + i.slug, inp.value); updateTotals(accessories()); notify('shop'); });
        var rm = h('button', { type: 'button', class: 'x', 'aria-label': 'Quitar ' + i.name + ' de la lista', text: '×' });
        rm.addEventListener('click', function () { removeItem(i.kind, i.slug, i.rig); });
        ul.appendChild(h('li', { class: 'shop-item' },
          h('span', { class: 'si-art' }, window.PartArt ? window.PartArt.make(i.kind, { name: i.name, brand: i.brand, vram_gb: i.vram_gb }) : null),
          h('span', { class: 'si-t' }, h('strong', { text: i.name }), h('span', { text: (i.kind === 'cpu' ? 'Procesador' : 'Tarjeta de video') + ' para el ' + rigName(i.rig) + (i.gain != null ? ' · +' + Math.round(i.gain) + ' % FPS' : '') })),
          h('span', { class: 'money small' }, h('i', { 'aria-hidden': 'true', text: '$' }), inp), rm));
      });
      acc.forEach(function (a) {
        var inp = h('input', { type: 'number', min: '0', max: '99999999', step: '1000', inputmode: 'numeric', placeholder: 'Precio', 'aria-label': 'Precio: ' + a.label, value: priceOf(a.key) || '' });
        inp.addEventListener('input', function () { setPrice(a.key, inp.value); updateTotals(accessories()); notify('shop'); });
        ul.appendChild(h('li', { class: 'shop-item acc ' + a.tone },
          h('span', { class: 'si-art acc-i', 'aria-hidden': 'true', text: a.optional ? 'i' : '!' }),
          h('span', { class: 'si-t' }, h('strong', { text: a.label }), h('span', { text: (a.optional ? 'Revísala: ' : 'Necesaria: ') + a.note })),
          h('span', { class: 'money small' }, h('i', { 'aria-hidden': 'true', text: '$' }), inp)));
      });
      box.appendChild(ul);

      totalEl = h('strong', { class: 'total-v' });
      budgetMsg = h('span', { class: 'bmsg' });
      fill = h('i'); bar = h('div', { class: 'bbar' }, fill);
      var bud = h('input', { type: 'number', min: '0', max: '99999999', step: '10000', inputmode: 'numeric', id: 'budget', placeholder: 'Ej.: 800000', value: num(S.budget) || '' });
      bud.addEventListener('input', function () { S.budget = num(bud.value) ? String(num(bud.value)) : ''; save(); updateTotals(accessories()); });
      box.appendChild(h('div', { class: 'shop-sum' },
        h('div', { class: 'tot' }, h('span', { text: 'Total' }), totalEl),
        h('div', { class: 'bud' }, h('label', { for: 'budget', text: 'Mi presupuesto' }), h('span', { class: 'money' }, h('i', { 'aria-hidden': 'true', text: '$' }), bud), bar, budgetMsg)));
      updateTotals(acc);

      var copy = h('button', { type: 'button', class: 'btn small', text: 'Copiar lista' });
      var manual = h('textarea', { class: 'manual', readonly: true, rows: '6', 'aria-label': 'Lista para copiar' });
      manual.hidden = true;
      var status = h('span', { class: 'copied', role: 'status' });
      copy.addEventListener('click', function () {
        var text = listText(accessories());
        var done = function () { status.textContent = 'Lista copiada'; setTimeout(function () { status.textContent = ''; }, 2500); };
        var fallback = function () { manual.value = text; manual.hidden = false; manual.focus(); manual.select(); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
      });
      var dl = h('button', { type: 'button', class: 'btn ghost small', text: 'Descargar .txt' });
      dl.addEventListener('click', function () {
        var url = URL.createObjectURL(new Blob([listText(accessories())], { type: 'text/plain;charset=utf-8' }));
        var a = h('a', { href: url, download: 'lista-de-compras.txt' });
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
      var clr = h('button', { type: 'button', class: 'btn ghost small', text: 'Vaciar lista' });
      clr.addEventListener('click', function () { S.list = []; notify(); });
      box.appendChild(h('div', { class: 'shop-tools' }, copy, dl, clr, status));
      box.appendChild(manual);
      box.appendChild(h('p', { class: 'note', text: 'Los precios los escribes tú: la página no consulta tiendas. Todo se guarda solo en este navegador.' }));
    }
    on(function (src) { if (src !== 'shop') render(); });
    window.addEventListener('fps-ready', render);
    render();
  }

  load();
  window.FPSHooks = { rigPanel: rigPanel, tileButton: tileButton, option: optionHook, cost: costHook, compare: compareHook, mount: mount, subscribe: on, rerender: function () { notify(); } };
  var root = document.getElementById('shopRoot');
  if (root) mount(root);
})();
