/* Asistente de FPS. Entiende preguntas y órdenes en español y responde con los datos de la página.
 * No usa internet ni claves: son reglas sobre el mismo modelo que calcula los FPS. */
(function () {
  'use strict';
  var A = window.FPSApp;
  if (!A) return;
  var S = A.state;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fmt(n) { return Math.round(n).toLocaleString('es'); }
  function norm(t) {
    return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9.+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function h(tag, attrs) {
    var el = document.createElement(tag), a = attrs || {};
    Object.keys(a).forEach(function (k) {
      if (a[k] == null || a[k] === false) return;
      if (k === 'class') el.className = a[k]; else if (k === 'text') el.textContent = a[k]; else el.setAttribute(k, a[k] === true ? '' : a[k]);
    });
    for (var i = 2; i < arguments.length; i++) if (arguments[i] != null) el.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
    return el;
  }
  function svg(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function label(list, v) { var f = list.filter(function (x) { return x[0] === v; })[0]; return f ? f[1] : v; }
  function rigName(r) { return 'PC ' + r.toUpperCase(); }

  // ---- Lectura de ajustes dentro de la frase -----------------------------------------
  function negBefore(q, idx) {
    return /(^| )(sin|quita\w*|desactiv\w*|apag\w*|no|nada de)( |$)/.test(q.slice(Math.max(0, idx - 24), idx));
  }
  function parseSettings(q) {
    var ch = {}, s = q, m;
    m = /(generacion de (fotogramas|cuadros|frames)|fotogramas|cuadros extra|frame ?gen\w*|\bfg\b|dlss ?[34]|fsr ?[34])/.exec(s);
    if (m) { ch.fg = !negBefore(s, m.index); s = s.replace(m[0], ' '); }
    m = /(dlss|fsr|xess|escalado|upscal\w*)( (?:de |en |modo |a )?(calidad|quality|equilibrad\w*|balanced|rendimiento|performance))?/.exec(s);
    if (m) {
      var lvl = m[3] ? (/^(calidad|quality)/.test(m[3]) ? '1' : /^(equilibrad|balanced)/.test(m[3]) ? '2' : '3') : '2';
      ch.up = negBefore(s, m.index) ? '0' : lvl;
      s = s.replace(m[0], ' ');
    }
    m = /(trazado de rayos|ray ?tracing|rayos|\brt\b)/.exec(s);
    if (m) { ch.rt = !negBefore(s, m.index); s = s.replace(m[0], ' '); }
    s = s.replace(/ultra ?pa?no\w*|ultra ?wide|\b21 ?[: ]9\b/, ' 3440 ');
    if (/\b3440\b/.test(s)) ch.res = '3440';
    else if (/\b(2160|4k|uhd)p?\b/.test(s)) ch.res = '2160';
    else if (/\b(1440|2k|qhd)p?\b/.test(s)) ch.res = '1440';
    else if (/\b(1080|fhd|full ?hd)p?\b/.test(s)) ch.res = '1080';
    m = /\b(60|120|144|165|240|360) ?hz\b/.exec(s);
    if (m) ch.hz = { 60: '60', 120: '144', 144: '144', 165: '144', 240: '240', 360: '360' }[m[1]];
    m = /(calidad|graficos?|ajustes|settings|detalles?)( graficos?)?( en| a| de)? (baja|media|alta|ultra|low|medium|high)\b/.exec(s)
      || /\b(en|a|con) (baja|media|alta|ultra)\b/.exec(s);
    if (m) ch.q = { baja: 'low', low: 'low', media: 'mid', medium: 'mid', alta: 'high', high: 'high', ultra: 'ultra' }[m[m.length - 1]];
    return ch;
  }
  function describeSettings(ch) {
    var out = [];
    if (ch.res) out.push('resolución ' + label(A.labels.res, ch.res));
    if (ch.q) out.push('calidad ' + label(A.labels.q, ch.q).toLowerCase());
    if (ch.up != null) out.push(ch.up === '0' ? 'escalado apagado' : 'escalado en modo ' + label(A.labels.up, ch.up).toLowerCase());
    if (ch.rt != null) out.push(ch.rt ? 'trazado de rayos activado' : 'trazado de rayos apagado');
    if (ch.fg != null) out.push(ch.fg ? 'generación de fotogramas activada' : 'generación de fotogramas apagada');
    if (ch.hz) out.push('meta de ' + ch.hz + ' Hz');
    return out;
  }

  // ---- Piezas ---------------------------------------------------------------------------
  var KEEP = /^(rtx|gtx|rx|ti|super|xt|xtx|gre|ryzen|core|ultra|arc|x3d|plus|radeon|geforce|i3|i5|i7|i9|k|f|x)$/;
  function findPart(q) {
    var cat = A.catalog();
    var tokens = q.split(' ').filter(function (t) { return /\d/.test(t) || KEEP.test(t); });
    if (!tokens.some(function (t) { return /\d/.test(t); })) return null;
    function match(list) {
      function pick(loose) {
        return list.filter(function (p) {
          var nm = norm(p.name), parts = nm.split(' '), compact = nm.replace(/ /g, '');
          return tokens.every(function (t) { return parts.indexOf(t) >= 0 || (loose && t.length >= 4 && compact.indexOf(t) >= 0); });
        });
      }
      var exact = pick(false);
      return (exact.length ? exact : pick(true)).sort(function (x, y) { return norm(x.name).split(' ').length - norm(y.name).split(' ').length || (y.vram_gb || 0) - (x.vram_gb || 0); });
    }
    var c = match(cat.cpus), g = match(cat.gpus);
    var cpuHint = /\b(cpu|procesador|ryzen|core|intel|i[3579])\b/.test(q), gpuHint = /\b(gpu|tarjeta|grafica|video|rtx|gtx|radeon|rx|arc|geforce|nvidia)\b/.test(q);
    if (c.length && g.length) return cpuHint && !gpuHint ? { kind: 'cpu', part: c[0] } : { kind: 'gpu', part: g[0] };
    if (c.length) return { kind: 'cpu', part: c[0] };
    if (g.length) return { kind: 'gpu', part: g[0] };
    return { none: true };
  }
  function targetRigs(q) {
    if (/\b(ambos|los dos|las dos|cada uno)\b/.test(q)) return ['a', 'b'];
    if (/(pc|equipo|computador\w*|en|al|mi|el) b\b|\bsegundo\b/.test(q)) return ['b'];
    return ['a'];
  }
  var PRESET_RX = [[/\bentrada\b/, 0], [/\b(gama media|media gama)\b/, 1], [/\balta gama\b/, 2], [/\bextrema\b/, 3], [/\bclasic[oa]\b/, 4]];

  // ---- Juegos -----------------------------------------------------------------------------
  var ALIAS = [[/\b(cs2|csgo|cs go|counter)\b/, 'counter'], [/\b(lol|league)\b/, 'league'], [/\b(valo|valorant)\b/, 'valorant'], [/\bgta\b/, 'gta'],
    [/\b(rdr2|red dead)\b/, 'red dead'], [/\b(cod|warzone|call of duty)\b/, 'call of duty'], [/\bbg3|baldur\b/, 'baldur'], [/\b(tlou|last of us)\b/, 'last of us'],
    [/\b(spider ?man)\b/, 'spider'], [/\brivals\b/, 'rivals'], [/\b(bf6|battlefield)\b/, 'battlefield'], [/\btarkov\b/, 'tarkov'], [/\bwukong\b/, 'wukong'],
    [/\bcyberpunk\b/, 'cyberpunk'], [/\belden\b/, 'elden'], [/\bhogwarts\b/, 'hogwarts'], [/\bapex\b/, 'apex'], [/\bfortnite\b/, 'fortnite'],
    [/\boverwatch\b/, 'overwatch'], [/\brainbow|r6\b/, 'rainbow'], [/\bdota\b/, 'dota'], [/\bstarfield\b/, 'starfield']];
  function findGame(q) {
    var res = A.result();
    if (!res) return null;
    for (var i = 0; i < ALIAS.length; i++) {
      if (ALIAS[i][0].test(q)) {
        var g = res.games.filter(function (x) { return norm(x.name).indexOf(ALIAS[i][1]) >= 0; })[0];
        if (g) return g;
      }
    }
    return null;
  }

  // ---- Glosario ---------------------------------------------------------------------------
  var GLOSS = [
    [/(dlss|fsr|xess|escalado|upscal)/, 'DLSS, FSR y XeSS dibujan el juego a menor resolución y lo reescalan. Ganas FPS casi sin perder nitidez. Ayuda más en 1440p y 4K que en 1080p, y solo funciona en juegos compatibles.'],
    [/(rayos|ray ?tracing|\brt\b)/, 'El trazado de rayos calcula luces, sombras y reflejos de forma realista, pero cuesta muchos FPS. Las tarjetas NVIDIA recientes lo llevan mejor; las viejas y varias de AMD sufren más.'],
    [/(generacion de|frame ?gen|fotogramas|\bfg\b)/, 'La generación de fotogramas inventa cuadros entre los reales. El contador de FPS sube mucho, pero la respuesta al mouse sigue siendo la de los FPS reales y se agrega algo de latencia. Rinde mejor si ya tienes 60 FPS reales o más.'],
    [/(cuello|bottleneck)/, 'Un cuello de botella es la pieza que frena a las demás. Si la CPU no alcanza, la tarjeta espera y cambiarla casi no sube los FPS. Si la tarjeta es el límite, ayuda bajar la calidad o cambiarla.'],
    [/(1 ?%|minimos|low)/, 'Los mínimos 1 % son los FPS de los peores momentos. Importan porque un promedio alto con mínimos bajos se siente con tirones.'],
    [/(vram|memoria de video)/, 'La VRAM es la memoria de la tarjeta de video. Con 8 GB o menos, las resoluciones altas y las texturas pesadas pierden FPS.'],
    [/\bram\b/, 'La RAM es la memoria del PC. Con 8 GB bajan los FPS y empeoran los mínimos; 16 GB es lo normal y 32 GB rinde parecido en la mayoría de los juegos.'],
    [/(\bhz\b|monitor|frecuencia)/, 'Los Hz son las veces por segundo que tu monitor actualiza la imagen. Un monitor de 144 Hz muestra hasta 144 FPS, así que esa es tu meta. Cámbiala en «Mi monitor».'],
    [/(ultrapanoram|ultrawide|3440)/, 'Ultrapanorámico (3440×1440) tiene 2,4 veces los píxeles de 1080p: pide más a la tarjeta que 1440p y menos que 4K.'],
    [/(x3d|v ?cache)/, 'Los Ryzen X3D llevan una caché extra muy grande. En juegos eso sube mucho los FPS cuando la CPU es el límite, sobre todo en los competitivos.'],
    [/\bfps\b/, 'FPS son los cuadros por segundo. Más FPS se ve más fluido; 60 es lo mínimo cómodo y 144 o más se nota en juegos rápidos.'],
    [/(procesador|\bcpu\b)/, 'La CPU o procesador es el cerebro del PC. En juegos manda sobre todo en los competitivos y en los que mueven muchos objetos: si es lenta, la tarjeta de video queda esperando.'],
    [/(\bgpu\b|tarjeta de video|grafica)/, 'La GPU o tarjeta de video dibuja la imagen. Manda en los juegos pesados, en resoluciones altas y con trazado de rayos.'],
    [/(resolucion)/, 'La resolución es cuántos píxeles dibuja el juego. Más píxeles se ven más nítidos, pero la tarjeta de video trabaja más.']
  ];

  // ---- Dibujos: todo SVG propio, sin imágenes externas ------------------------------------
  function sv(tag, attrs) {
    var el = svg(tag, attrs);
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]);
    return el;
  }
  function txt(attrs, text) { var t = sv('text', attrs); t.textContent = text; return t; }

  // Byte, la mascota: parpadea, mueve la antena y "habla" mientras escribe.
  function robot(cls) {
    return sv('svg', { viewBox: '0 0 64 64', class: 'robot ' + (cls || ''), 'aria-hidden': 'true' },
      sv('line', { x1: 32, y1: 6, x2: 32, y2: 15, class: 'rb-line' }), sv('circle', { cx: 32, cy: 5, r: 3.4, class: 'rb-ant' }),
      sv('rect', { x: 3, y: 29, width: 6, height: 14, rx: 2.5, class: 'rb-ear' }), sv('rect', { x: 55, y: 29, width: 6, height: 14, rx: 2.5, class: 'rb-ear' }),
      sv('rect', { x: 9, y: 14, width: 46, height: 40, rx: 13, class: 'rb-head' }),
      sv('rect', { x: 15, y: 21, width: 34, height: 20, rx: 9, class: 'rb-visor' }),
      sv('rect', { x: 21, y: 27, width: 8, height: 8, rx: 3, class: 'rb-eye' }), sv('rect', { x: 35, y: 27, width: 8, height: 8, rx: 3, class: 'rb-eye' }),
      sv('path', { d: 'M25 47 Q32 51 39 47', class: 'rb-mouth' }),
      sv('circle', { cx: 17, cy: 46, r: 2.6, class: 'rb-cheek' }), sv('circle', { cx: 47, cy: 46, r: 2.6, class: 'rb-cheek' }));
  }
  function gpuIcon() {
    function fan(cx) { return sv('g', { class: 'pi-fan' }, sv('circle', { cx: cx, cy: 18, r: 7.5, class: 'pi-ring' }), sv('path', { d: 'M' + cx + ' 11v14M' + (cx - 7) + ' 18h14', class: 'pi-blade' })); }
    return sv('svg', { viewBox: '0 0 48 40', class: 'pic', 'aria-hidden': 'true' },
      sv('rect', { x: 2, y: 6, width: 44, height: 26, rx: 4, class: 'pi-body' }), fan(15), fan(33),
      sv('rect', { x: 6, y: 33, width: 30, height: 4, rx: 1, class: 'pi-pin' }));
  }
  function cpuIcon() {
    var pins = [];
    for (var i = 0; i < 4; i++) {
      var o = 12 + i * 6;
      pins.push(sv('path', { d: 'M' + o + ' 2v7M' + o + ' 35v7M2 ' + o + 'h7M35 ' + o + 'h7', class: 'pi-pins' }));
    }
    var svgEl = sv('svg', { viewBox: '0 0 44 44', class: 'pic', 'aria-hidden': 'true' });
    pins.forEach(function (x) { svgEl.appendChild(x); });
    svgEl.appendChild(sv('rect', { x: 9, y: 9, width: 26, height: 26, rx: 5, class: 'pi-body' }));
    svgEl.appendChild(sv('rect', { x: 16, y: 16, width: 12, height: 12, rx: 2.5, class: 'pi-die' }));
    return svgEl;
  }

  // Ilustraciones animadas para el saludo y para explicar términos.
  function figure(kind) {
    var f = sv('svg', { viewBox: '0 0 240 90', class: 'figure ' + kind, role: 'img', 'aria-label': { hero: 'Monitor con una curva de FPS', dlss: 'Pocos píxeles reescalados a muchos', fg: 'Cuadros reales con cuadros generados entre medio', rt: 'Un rayo de luz que rebota', bn: 'Un embudo: la pieza más lenta marca el ritmo' }[kind] });
    if (kind === 'hero') {
      f.appendChild(sv('rect', { x: 36, y: 6, width: 168, height: 62, rx: 7, class: 'fg-frame' }));
      f.appendChild(sv('path', { d: 'M104 68v10M136 68v10M92 80h56', class: 'fg-frame' }));
      f.appendChild(sv('path', { d: 'M48 56L72 46L94 52L120 30L146 38L170 22L192 28', class: 'fg-line draw' }));
      f.appendChild(sv('circle', { cx: 192, cy: 28, r: 3.5, class: 'fg-pt' }));
      f.appendChild(sv('g', { class: 'bob' }, sv('rect', { x: 6, y: 36, width: 34, height: 18, rx: 4, class: 'fg-chip' }), txt({ x: 23, y: 49, class: 'fg-tx', 'text-anchor': 'middle' }, 'CPU')));
      f.appendChild(sv('g', { class: 'bob d2' }, sv('rect', { x: 200, y: 50, width: 34, height: 18, rx: 4, class: 'fg-chip b' }), txt({ x: 217, y: 63, class: 'fg-tx', 'text-anchor': 'middle' }, 'GPU')));
    } else if (kind === 'dlss') {
      var g1 = sv('g', { class: 'fg-cells' }), g2 = sv('g', { class: 'fg-cells sharp' }), i, j;
      for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) g1.appendChild(sv('rect', { x: 24 + i * 14, y: 24 + j * 14, width: 11, height: 11, rx: 1.5 }));
      for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) g2.appendChild(sv('rect', { x: 140 + i * 11, y: 1 + j * 11, width: 9, height: 9, rx: 1 }));
      f.appendChild(g1); f.appendChild(sv('path', { d: 'M78 45h44m-8-8l8 8-8 8', class: 'fg-line arrow' })); f.appendChild(g2);
    } else if (kind === 'fg') {
      [20, 100, 180].forEach(function (x) { f.appendChild(sv('rect', { x: x, y: 24, width: 40, height: 34, rx: 5, class: 'fg-real' })); });
      [64, 144].forEach(function (x, k) { f.appendChild(sv('rect', { x: x, y: 29, width: 32, height: 24, rx: 4, class: 'fg-gen' + (k ? ' d2' : '') })); });
      f.appendChild(txt({ x: 40, y: 76, class: 'fg-tx', 'text-anchor': 'middle' }, 'real'));
      f.appendChild(txt({ x: 80, y: 76, class: 'fg-tx dim', 'text-anchor': 'middle' }, 'generado'));
      f.appendChild(txt({ x: 120, y: 76, class: 'fg-tx', 'text-anchor': 'middle' }, 'real'));
    } else if (kind === 'rt') {
      f.appendChild(sv('circle', { cx: 32, cy: 20, r: 9, class: 'fg-sun' }));
      f.appendChild(sv('path', { d: 'M42 24L122 50', class: 'fg-ray' }));
      f.appendChild(sv('circle', { cx: 132, cy: 52, r: 15, class: 'fg-frame' }));
      f.appendChild(sv('path', { d: 'M142 62L182 82L226 54', class: 'fg-ray b' }));
      f.appendChild(sv('path', { d: 'M16 84H232', class: 'fg-frame' }));
    } else if (kind === 'bn') {
      f.appendChild(sv('path', { d: 'M40 6H130L90 44V76H80V44Z', class: 'fg-frame' }));
      [0, 1, 2, 3].forEach(function (k) { f.appendChild(sv('circle', { cx: 58 + k * 18, cy: 14, r: 3.4, class: 'fg-dot d' + k })); });
      f.appendChild(txt({ x: 150, y: 30, class: 'fg-tx' }, 'La pieza más lenta'));
      f.appendChild(txt({ x: 150, y: 46, class: 'fg-tx' }, 'marca el ritmo'));
    }
    return f;
  }

  function countTo(el, to, suffix) {
    var t0 = performance.now(), dur = 800;
    if (reduced) { el.textContent = fmt(to) + suffix; return; }
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(to * k) + suffix;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function sparks() {
    var w = h('span', { class: 'sparks', 'aria-hidden': 'true' });
    for (var i = 0; i < 8; i++) { var d = h('i'); d.style.setProperty('--ang', (i * 45) + 'deg'); w.appendChild(d); }
    return w;
  }
  // Una fila de barra animada: nombre, barra (con marca opcional), cifra que sube y distintivo opcional.
  function barRow(o) {
    var fill = h('i', { class: 'cfill ' + (o.cls || '') }), track = h('span', { class: 'ctrack' }, fill);
    function mark(v, cls) { var m = h('i', { class: 'cmark ' + cls }); m.style.left = Math.min(100, v / o.max * 100) + '%'; track.appendChild(m); }
    if (o.marker != null) mark(o.marker, '');
    if (o.before != null) mark(o.before, 'before');
    var val = h('b', { text: '0' + (o.unit || '') });
    var row = h('div', { class: 'crow' }, h('span', { class: 'clab', text: o.label }), track, val);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { fill.style.width = Math.min(100, o.value / o.max * 100) + '%'; });
    });
    if (o.text) val.textContent = o.text; else countTo(val, o.value, o.unit || '');
    if (o.badge != null) {
      var b = h('span', { class: 'gainb ' + (o.badge >= 0 ? 'up' : 'down'), text: (o.badge >= 0 ? '+' : '−') + fmt(Math.abs(o.badge)) + ' %' });
      if (o.badge >= 10) b.appendChild(sparks());
      row.appendChild(b);
    }
    return row;
  }
  function bars(rows, max) {
    var w = h('div', { class: 'cbars' });
    rows.forEach(function (r) { r.max = max; w.appendChild(barRow(r)); });
    return w;
  }
  function summaryNode(before, after) {
    var max = 1, rows = [];
    Object.keys(after.rigs).forEach(function (r) {
      max = Math.max(max, after.rigs[r].avg, before && before.rigs[r] ? before.rigs[r].avg : 0);
    });
    max *= 1.12;
    Object.keys(after.rigs).forEach(function (r) {
      var a = after.rigs[r], b = before && before.rigs[r], d = b && b.avg ? (a.avg / b.avg - 1) * 100 : null;
      rows.push({ label: rigName(r), cls: r, value: a.avg, unit: ' FPS', before: d != null && Math.abs(d) >= 0.5 ? b.avg : null, badge: d != null && Math.abs(d) >= 0.5 ? d : null });
    });
    return bars(rows, max);
  }
  function partCard(kind, name, gain, who) {
    var cat = A.catalog(), list = kind === 'cpu' ? cat.cpus : cat.gpus;
    var found = list.filter(function (x) { return x.name === name; })[0];
    return h('div', { class: 'pcard' }, found && window.PartArt ? window.PartArt.make(kind, found) : (kind === 'cpu' ? cpuIcon() : gpuIcon()),
      h('div', { class: 'pc-t' }, h('strong', { text: name }), h('span', { text: who + ': cambiar ' + (kind === 'cpu' ? 'el procesador' : 'la tarjeta de video') })),
      h('span', { class: 'gainb up', text: '+' + fmt(gain) + ' %' }, gain >= 10 ? sparks() : null));
  }
  function bnNode(st) {
    var w = h('div', { class: 'cbn' });
    Object.keys(st.rigs).forEach(function (r) {
      var x = st.rigs[r], bar = h('div', { class: 'bn-bar', role: 'img', 'aria-label': 'Cuello de botella del ' + rigName(r) });
      ['cpu', 'gpu', 'eq', 'cap'].forEach(function (k) {
        var i = h('i', { class: 'c-' + k, title: { cpu: 'Limita la CPU', gpu: 'Limita la GPU', eq: 'Equilibrado', cap: 'Tope del juego' }[k] + ': ' + x.lim[k] });
        i.style.flexBasis = '0'; i.style.flexGrow = '0';
        requestAnimationFrame(function () { requestAnimationFrame(function () { i.style.flexGrow = String(x.lim[k]); }); });
        bar.appendChild(i);
      });
      w.appendChild(h('div', { class: 'crow' }, h('span', { class: 'clab', text: rigName(r) }), bar));
    });
    var lg = h('ul', { class: 'bn-legend' });
    [['cpu', 'CPU'], ['gpu', 'GPU'], ['eq', 'Equilibrado'], ['cap', 'Tope']].forEach(function (k) { lg.appendChild(h('li', null, h('span', { class: 'sq c-' + k[0] }), k[1])); });
    w.appendChild(lg);
    return w;
  }

  var GLOSS_FIG = ['dlss', 'rt', 'fg', 'bn'];
  function glossMsg(i) { return GLOSS_FIG[i] ? { text: GLOSS[i][1], figure: figure(GLOSS_FIG[i]) } : GLOSS[i][1]; }

  // ---- Interfaz ------------------------------------------------------------------------------
  var log, input, fabBtn, panel, nudge, hdrAv, started = false;

  function scroll() { log.scrollTop = log.scrollHeight; }
  function refreshTalking() { if (hdrAv) hdrAv.classList.toggle('talking', !!log.querySelector('.msg.typing')); }
  function avatar() { return h('span', { class: 'av' }, robot()); }
  function bubble(who, content) {
    var c = typeof content === 'string' ? { text: content } : content;
    var box = h('div', { class: 'msg ' + who });
    if (c.text) box.appendChild(h('p', { text: c.text }));
    if (c.blocks) c.blocks.forEach(function (b) {
      if (b.list) { var u = h('ul'); b.list.forEach(function (t) { u.appendChild(h('li', { text: t })); }); box.appendChild(u); }
      else box.appendChild(h('p', { text: b.p }));
    });
    if (c.figure) box.appendChild(c.figure);
    if (c.node) box.appendChild(c.node);
    if (c.list) { var ul = h('ul'); c.list.forEach(function (t) { ul.appendChild(h('li', { text: t })); }); box.appendChild(ul); }
    if (c.chips) {
      var row = h('div', { class: 'msg-chips' });
      c.chips.forEach(function (ch) { row.appendChild(chip(ch)); });
      box.appendChild(row);
    }
    var wrap = h('div', { class: 'row ' + who });
    if (who === 'bot') wrap.appendChild(avatar());
    wrap.appendChild(box);
    log.appendChild(wrap);
    scroll(); refreshTalking();
    return wrap;
  }
  function chip(ch) {
    var b = h('button', { type: 'button', class: 'chip', text: ch.label });
    b.addEventListener('click', function () {
      if (ch.run) { bubble('user', ch.label); ch.run(); } else send(ch.send || ch.label);
    });
    return b;
  }
  function typing() {
    var av = h('span', { class: 'av talking' }, robot());
    var t = h('div', { class: 'row bot' }, av, h('div', { class: 'msg bot typing', 'aria-label': 'El asistente está escribiendo' }, h('i'), h('i'), h('i')));
    log.appendChild(t); scroll(); refreshTalking();
    return t;
  }
  function say(content, delay) {
    var t = typing();
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); bubble('bot', content); }, reduced ? 0 : (delay == null ? 520 : delay));
  }
  // Muestra "escribiendo" hasta que la tarea termine.
  function sayAsync(promise, build) {
    var t = typing();
    promise.then(function (v) { if (t.parentNode) t.parentNode.removeChild(t); bubble('bot', build(v)); })
      .catch(function () { if (t.parentNode) t.parentNode.removeChild(t); bubble('bot', 'No pude consultar el servidor. Revisa que siga encendido e inténtalo otra vez.'); });
  }

  var DEFAULT_CHIPS = ['¿Qué me limita?', '¿Qué mejoro primero?', '¿Cuál rinde más?', '¿Cuántos juegos llegan a mi meta?', 'Ponlo en 1440p con rayos', '¿Qué es DLSS?'];

  // ---- Acciones con resumen "antes y después" -------------------------------------------------
  function hitsLines(after) {
    return Object.keys(after.rigs).map(function (r) { return rigName(r) + ': ' + after.rigs[r].hit + ' de ' + after.n + ' juegos llegan a ' + after.hz + ' FPS.'; });
  }
  function apply(mutator, intro, extra) {
    var before = A.stats();
    var done = false;
    var t = typing();
    A.onRender(function () {
      done = true;
      if (t.parentNode) t.parentNode.removeChild(t);
      var after = A.stats();
      var res = { text: intro, node: summaryNode(before, after), list: hitsLines(after) };
      if (extra) { var e = extra(); if (e) res.list = res.list.concat(e); }
      bubble('bot', res);
    });
    A.change(mutator);
    setTimeout(function () { if (!done) { if (t.parentNode) t.parentNode.removeChild(t); refreshTalking(); bubble('bot', 'Hice el cambio, pero no pude recalcular los FPS. Revisa la conexión con el servidor.'); } }, 8000);
  }

  function gameLine(g) {
    var st = A.stats(), parts = [];
    Object.keys(st.rigs).forEach(function (r) {
      var e = g[r], lim = { cpu: 'limita la CPU', gpu: 'limita la GPU', eq: 'equilibrado', cap: 'tope del juego' }[e.lim];
      parts.push(rigName(r) + ' da ' + fmt(e.fps) + ' FPS (' + lim + (e.fg ? ', con generación de fotogramas' : '') + ', mínimos ' + fmt(e.low) + ') y ' + (e.fps >= st.hz ? 'sí' : 'no') + ' llega a tu meta de ' + st.hz + '.');
    });
    return parts;
  }
  function gameBars(g) {
    var st = A.stats(), rows = [], max = st.hz * 1.1;
    Object.keys(st.rigs).forEach(function (r) { max = Math.max(max, g[r].fps * 1.1); rows.push({ label: rigName(r), cls: r, value: g[r].fps, unit: ' FPS', marker: st.hz }); });
    return bars(rows, max);
  }
  function settingsText() {
    return label(A.labels.res, S.res) + ', calidad ' + label(A.labels.q, S.q).toLowerCase() + (S.up !== '0' ? ', escalado ' + label(A.labels.up, S.up).toLowerCase() : '') +
      (S.rt ? ', con rayos' : '') + (S.fg ? ', con generación de fotogramas' : '');
  }

  // ---- Recomendar una pieza a partir de lo que el usuario tiene ----------------------------------
  function findParts(q) {
    var out = {};
    q.split(/ y | e |,| \+ | con | mas /).forEach(function (sg) {
      var f = findPart(sg);
      if (f && f.part && !out[f.kind]) out[f.kind] = f.part;
    });
    return out;
  }
  function askedKind(q) {
    var m = /\b(?:que|cual(?:es)?)\s+(?:\w+\s+){0,2}?(procesador|cpu|tarjeta|grafica|gpu|placa|pieza|componente)\b/.exec(q)
      || /\b(?:conviene|recomiendas|sugieres|aconsejas|cambio|cambiar|compro|comprar|mejorar|subir|actualizar)\b.*?\b(procesador|cpu|tarjeta|grafica|gpu)\b/.exec(q);
    if (!m) return null;
    return /^(procesador|cpu)$/.test(m[1]) ? 'cpu' : /^(pieza|componente)$/.test(m[1]) ? 'both' : 'gpu';
  }
  var lastKind = null;
  function recommend(kind, rig, budget) {
    var st = A.stats(), x = st.rigs[rig];
    if (!x) return;
    lastKind = kind;
    sayAsync(A.fetchAdvice(), function (adv) {
      var d = adv.rigs[rig], kinds = kind === 'both' ? ['cpu', 'gpu'] : [kind], lines = [], chips = [];
      var lead = 'Con tu ' + x.cpu + ' y tu ' + x.gpu + ' (' + settingsText() + '): ' +
        (x.lim.cpu > x.lim.gpu ? 'el procesador limita en ' + x.lim.cpu + ' de ' + st.n + ' juegos y la tarjeta en ' + x.lim.gpu + '.'
          : x.lim.gpu > x.lim.cpu ? 'la tarjeta limita en ' + x.lim.gpu + ' de ' + st.n + ' juegos y el procesador en ' + x.lim.cpu + '.'
            : 'procesador y tarjeta están parejos.');
      var cards = h('div', { class: 'cards' });
      kinds.forEach(function (k) {
        var name = k === 'cpu' ? 'procesador' : 'tarjeta de video', art = k === 'cpu' ? 'el ' : 'la ', one = k === 'cpu' ? 'un ' : 'una ', opts = (d[k] || []).slice().sort(function (a, b) { return a.gain - b.gain; });
        if (!opts.length) { lines.push('No hay ' + one + name + ' más potente que ' + (k === 'cpu' ? 'el tuyo' : 'la tuya') + ' en el catálogo.'); return; }
        var best = opts[opts.length - 1];
        if (best.gain < 5) { lines.push('Cambiar ' + art + name + ' casi no vale la pena: lo mejor que hay sube solo ' + fmt(best.gain) + ' %. El límite está en la otra pieza.'); return; }
        if (budget) {
          // Piezas de gama más baja que aún dan buena parte de la mejora.
          var value = opts.filter(function (o) { return o.gain >= best.gain * 0.5; })[0];
          var entry = opts.filter(function (o) { return o.gain >= 8; })[0] || opts[0];
          var picks = [entry, value].filter(function (o, i, a) { return a.indexOf(o) === i; });
          picks.forEach(function (o) { cards.appendChild(partCard(k, o.name, o.gain, o === value ? 'Mejor relación' : 'Más económica')); });
          var share = Math.round(value.gain / best.gain * 100);
          lines.push('Para ' + art + name + ' sin gastar de más: ' + value.name + ' (+' + fmt(value.gain) + ' %) logra ' + share + ' % de la mejora máxima con una pieza de gama más baja que ' + best.name + ' (+' + fmt(best.gain) + ' %).' +
            (entry !== value ? ' Lo mínimo que de verdad se nota es ' + entry.name + ' (+' + fmt(entry.gain) + ' %).' : ''));
          picks.forEach(function (o) {
            chips.push({ label: 'Probar ' + o.name, run: function () { apply(function () { S[rig][k] = o.slug; }, 'Probemos: puse ' + o.name + ' en el ' + rigName(rig) + '.'); } });
          });
          return;
        }
        var sweet = opts.filter(function (o) { return o.gain >= best.gain * 0.75; })[0];
        opts.forEach(function (o) { cards.appendChild(partCard(k, o.name, o.gain, o === sweet && sweet !== best ? 'Buen equilibrio' : o === best ? 'Lo máximo' : 'Opción')); });
        lines.push(sweet !== best
          ? 'Para ' + art + name + ': ' + sweet.name + ' (+' + fmt(sweet.gain) + ' %) consigue casi toda la mejora con una pieza menos potente que ' + best.name + ' (+' + fmt(best.gain) + ' %).'
          : 'Para ' + art + name + ': ' + best.name + ' es la mejor opción (+' + fmt(best.gain) + ' %).');
        [sweet, best].filter(function (o, i, a) { return a.indexOf(o) === i; }).forEach(function (o) {
          chips.push({ label: 'Probar ' + o.name, run: function () { apply(function () { S[rig][k] = o.slug; }, 'Probemos: puse ' + o.name + ' en el ' + rigName(rig) + '.'); } });
        });
      });
      lines.push(budget ? 'No tengo precios: las piezas de gama más baja o usadas suelen costar menos, pero compara tiendas antes de decidir.' : 'No tengo precios: compara cuánto cuesta cada una antes de decidir.');
      return { text: lead, node: cards.childNodes.length ? cards : null, list: lines, chips: chips };
    });
  }
  // Pone las piezas que el usuario dijo tener y luego recomienda.
  function ownsAndAsk(parts, kind, rig, budget) {
    var keys = Object.keys(parts);
    if (!keys.length) { recommend(kind, rig, budget); return; }
    var t = typing(), names = keys.map(function (k) { return parts[k].name; }).join(' y ');
    A.onRender(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
      refreshTalking();
      bubble('bot', 'Puse ' + names + ' en el ' + rigName(rig) + ' y calculé desde ahí.');
      recommend(kind, rig, budget);
    });
    A.change(function () { keys.forEach(function (k) { S[rig][k] = parts[k].slug; }); });
  }


  // ---- Asesor con IA (opcional) -----------------------------------------------------------------
  // Si el servidor tiene una clave configurada, las preguntas abiertas van a api/chat.php. Los cambios de
  // ajustes y los gráficos con datos siguen resolviéndose aquí con reglas. Sin clave, todo funciona igual.
  var llm = { enabled: false }, history = [];
  fetch('api/chat.php').then(function (r) { return r.json(); }).then(function (j) { llm.enabled = !!(j && j.enabled); updateBadge(); }).catch(function () {});

  function updateBadge() {
    if (!hdrAv) return;
    var sub = panel.querySelector('.hdr-t span');
    if (sub) { sub.textContent = ''; sub.appendChild(h('i', { class: 'live' })); sub.appendChild(document.createTextNode(llm.enabled ? 'Asesor con IA, en línea' : 'Asistente de FPS, en línea')); }
    var row = panel.querySelector('.chat-chips');
    if (llm.enabled && row && !row.querySelector('[data-ia]')) {
      var c = chip({ label: 'Asesórame para comprar', send: 'Quiero comprar una pieza nueva para mi PC. ¿Qué me recomiendas y qué te falta saber de mí?' });
      c.setAttribute('data-ia', '1'); row.insertBefore(c, row.firstChild);
    }
  }

  function llmPayload(text) {
    var o = { res: S.res, q: S.q, up: S.up, rt: S.rt ? 1 : 0, fg: S.fg ? 1 : 0, hz: S.hz, cpu_a: S.a.cpu, gpu_a: S.a.gpu, ram_a: S.a.ram, messages: history.slice(-10) };
    if (S.useB) { o.cpu_b = S.b.cpu; o.gpu_b = S.b.gpu; o.ram_b = S.b.ram; }
    return o;
  }

  // Quita formato markdown que el modelo a veces cuela y separa párrafos y listas.
  function formatReply(raw) {
    var chips = [], cat = A.catalog();
    var lines = String(raw).replace(/\r/g, '').split('\n').filter(function (ln) {
      var m = /^\s*ACCION:\s*(cpu|gpu)\s+(a|b)\s+([a-z0-9-]{1,60})\s*$/i.exec(ln);
      if (!m) return true;
      var kind = m[1].toLowerCase(), rig = m[2].toLowerCase(), list = kind === 'cpu' ? cat.cpus : cat.gpus;
      var part = list.filter(function (x) { return x.slug === m[3].toLowerCase(); })[0];
      if (part && (rig === 'a' || S.useB) && chips.length < 2) {
        chips.push({ label: 'Probar ' + part.name + ' en ' + rigName(rig), run: function () { apply(function () { S[rig][kind] = part.slug; }, 'Probemos: puse ' + part.name + ' en el ' + rigName(rig) + '.'); } });
      }
      return false;
    });
    var blocks = [], cur = null;
    lines.forEach(function (ln) {
      ln = ln.replace(/^#{1,6}\s*/, '').replace(/\*\*|__|`/g, '').replace(/^\s*[*•]\s+/, '- ');
      var li = /^\s*(?:-|\d+[.)])\s+(.*)$/.exec(ln);
      if (li) { if (!cur || !cur.list) { cur = { list: [] }; blocks.push(cur); } cur.list.push(li[1]); return; }
      if (!ln.trim()) { cur = null; return; }
      if (cur && cur.p != null) cur.p += ' ' + ln.trim(); else { cur = { p: ln.trim() }; blocks.push(cur); }
    });
    return { blocks: blocks.length ? blocks : [{ p: String(raw).trim() }], chips: chips };
  }

  function askLLM(text) {
    history.push({ role: 'user', content: text });
    history = history.slice(-10);
    var t = typing();
    fetch('api/chat.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(llmPayload(text)) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (o) {
        if (t.parentNode) t.parentNode.removeChild(t);
        if (!o.ok || !o.j.reply) { var e = new Error(o.j.error || 'error'); e.status = o.status; throw e; }
        history.push({ role: 'assistant', content: o.j.reply });
        history = history.slice(-10);
        var f = formatReply(o.j.reply);
        bubble('bot', { blocks: f.blocks, chips: f.chips.length ? f.chips : null });
      })
      .catch(function (e) {
        if (t.parentNode) t.parentNode.removeChild(t);
        history.pop();
        if (e && e.status === 429) { bubble('bot', e.message); return; }
        // La IA no respondió: seguimos con las reglas para no dejar al usuario sin respuesta.
        bubble('bot', 'La IA no está disponible ahora, así que te respondo con lo que sé hacer sin ella.');
        reply(text, true);
      });
  }

  // ¿Esto lo resuelven mejor las reglas (acciones sobre el comparador, gráficos con datos, glosario)?
  function wantsRules(q, game) {
    var words = q.split(' ').length;
    if (/^(pon\w*|cambia\w*|activa\w*|desactiva\w*|quita\w*|usa\w*|prueba\w*|probar|apaga\w*|enciende\w*|sube\w*|baja\w*|meta|restablec\w*|aplica\w*|instala\w*|reemplaza\w*|mete\w*|copia\w*|intercambi\w*|reinici\w*)\b/.test(q)) return true;
    if (/^(sin|con) /.test(q) && Object.keys(parseSettings(q)).length) return true;
    if (/(que me limita|cuello de botella|bottleneck|que mejoro primero|cual rinde|cuantos juegos|llegan a mi meta|mi meta)/.test(q) && words <= 7) return true;
    if (/^(hola|buenas|hey|ola|gracias|ayuda)\b/.test(q) && words <= 3) return true;
    if (game && words <= 6) return true;
    if (/(^| )(que|q) (es|son|significa|hace)\b|explica|para que sirve/.test(q) && words <= 6) {
      for (var i = 0; i < GLOSS.length; i++) if (GLOSS[i][0].test(q)) return true;
    }
    return false;
  }

  // "Tengo X y Y, ¿qué me conviene?": pone las piezas y deja que la IA asesore con ese equipo ya calculado.
  function ownedThenLLM(parts, rig, text) {
    var keys = Object.keys(parts);
    var t = typing(), done = false;
    function go() { if (done) return; done = true; if (t.parentNode) t.parentNode.removeChild(t); refreshTalking(); askLLM(text); }
    A.onRender(function () {
      if (done) return;
      bubble('bot', 'Puse ' + keys.map(function (k) { return parts[k].name; }).join(' y ') + ' en el ' + rigName(rig) + '.');
      go();
    });
    A.change(function () { keys.forEach(function (k) { S[rig][k] = parts[k].slug; }); });
    setTimeout(go, 8000);
  }

  // ---- Intenciones ------------------------------------------------------------------------------
  function reply(text, forceRules) {
    var q = norm(text), res = A.result();
    if (!q) return;
    if (!res) { say('Todavía estoy cargando los datos. Inténtalo en un segundo.'); return; }
    var game = findGame(q);

    if (/\b(restablec\w*|reinici\w*|resetea\w*|valores por defecto|empezar de nuevo)\b/.test(q)) {
      apply(function () { S.res = '1080'; S.q = 'high'; S.up = '0'; S.rt = false; S.fg = false; S.hz = '144'; }, 'Listo, volví los ajustes a 1080p, calidad alta, sin extras y meta de 144 Hz.');
      return;
    }
    if (/\b(intercambi\w*|invierte|invertir|cambia a con b|swap)\b/.test(q)) { apply(function () { var t = S.a; S.a = S.b; S.b = t; }, 'Intercambié los equipos: lo que era A ahora es B.'); return; }
    if (/\bcopia\w* (el )?(pc )?a (en|al|a) (el )?(pc )?b\b/.test(q)) { apply(function () { S.b = { cpu: S.a.cpu, gpu: S.a.gpu, ram: S.a.ram }; S.useB = true; }, 'Copié el PC A en el B.'); return; }

    if (llm.enabled && !forceRules && !wantsRules(q, game)) {
      var pp = findParts(q);
      if (Object.keys(pp).length && /\b(tengo|uso|juego con|mi pc (es|tiene|lleva)|mi equipo (es|tiene|lleva)|mi compu)\b/.test(q)) ownedThenLLM(pp, targetRigs(q)[0], text);
      else askLLM(text);
      return;
    }

    var gloss = /(^| )(que|q) (es|son|significa|hace)\b|explica|para que sirve|\bque significa\b/.test(q);
    if (gloss) {
      for (var i = 0; i < GLOSS.length; i++) if (GLOSS[i][0].test(q)) { say(glossMsg(i)); return; }
    }

    var parts = findParts(q), kindAsked = gloss ? null : askedKind(q);
    var owns = /\b(tengo|uso|juego con|mi pc (es|tiene|lleva)|mi equipo (es|tiene|lleva)|mi compu)\b/.test(q);
    var budget = /\b(barat\w*|econom\w*|ahorr\w*|presupuesto|menos plata|menos caro|accesible|costo beneficio|calidad precio|sin gastar|no tan caro|poca plata)\b/.test(q);
    if (!gloss && (kindAsked || budget || (owns && Object.keys(parts).length))) {
      ownsAndAsk(parts, kindAsked || lastKind || 'both', targetRigs(q)[0], budget);
      return;
    }

    var ch = parseSettings(q), keys = Object.keys(ch);
    var wantsPart = /\b(pon\w*|cambia\w*|usa\w*|prueba\w*|probar|instala\w*|reemplaza\w*|mete\w*)\b/.test(q);
    var ramM = /\b(8|16|32) ?gb( de)? ram\b|\bram (de |a )?(8|16|32)\b/.exec(q);
    if (ramM) {
      var gb = ramM[1] || ramM[3], rr = targetRigs(q);
      apply(function () { rr.forEach(function (r) { S[r].ram = gb; if (r === 'b') S.useB = true; }); }, 'Puse ' + gb + ' GB de RAM en el ' + rr.map(rigName).join(' y ') + '.');
      return;
    }
    var found = wantsPart && !game ? findPart(q) : null;
    if (found && found.part) {
      var rigs = targetRigs(q), p = found.part;
      apply(function () { rigs.forEach(function (r) { S[r][found.kind] = p.slug; if (r === 'b') S.useB = true; }); },
        'Puse ' + p.name + ' como ' + (found.kind === 'cpu' ? 'procesador' : 'tarjeta de video') + ' del ' + rigs.map(rigName).join(' y ') + '.');
      return;
    }
    if (found && found.none && !keys.length) {
      say({ text: 'No encontré esa pieza en el catálogo. Prueba escribiendo el nombre como aparece en el selector, por ejemplo «ponle una RTX 4070 al PC A» o «Ryzen 5 7600X en el B».', chips: [{ label: 'Ponle una RTX 4070 al PC A', send: 'ponle una RTX 4070 al PC A' }] });
      return;
    }
    for (var k = 0; k < PRESET_RX.length; k++) {
      if (PRESET_RX[k][0].test(q) && !/calidad|graficos/.test(q)) {
        var pr = A.presets[PRESET_RX[k][1]], pr2 = targetRigs(q);
        apply(function () { pr2.forEach(function (r) { S[r] = { cpu: pr[1], gpu: pr[2], ram: pr[3] }; if (r === 'b') S.useB = true; }); },
          'Apliqué el equipo «' + pr[0] + '» al ' + pr2.map(rigName).join(' y ') + '.');
        return;
      }
    }
    if (keys.length) {
      apply(function () {
        if (ch.res) S.res = ch.res; if (ch.q) S.q = ch.q; if (ch.up != null) S.up = ch.up;
        if (ch.rt != null) S.rt = ch.rt; if (ch.fg != null) S.fg = ch.fg; if (ch.hz) S.hz = ch.hz;
      }, 'Listo: ' + describeSettings(ch).join(', ') + '.', game ? function () { return gameLine(game); } : null);
      return;
    }

    if (/(cuello|bottleneck|limit\w*|frena|frenando|que me limita|por que (rinde|va|anda|tengo)|pocos fps)/.test(q)) {
      var st = A.stats();
      if (game) { say({ text: 'En ' + game.name + ' con ' + settingsText() + ':', node: gameBars(game), list: gameLine(game) }); return; }
      var lines = [], verdicts = [];
      Object.keys(st.rigs).forEach(function (r) {
        var x = st.rigs[r], top = ['cpu', 'gpu', 'eq', 'cap'].sort(function (m, n2) { return x.lim[n2] - x.lim[m]; })[0];
        lines.push(rigName(r) + ' (' + x.cpu + ' con ' + x.gpu + '): la CPU limita en ' + x.lim.cpu + ' de ' + st.n + ' juegos, la GPU en ' + x.lim.gpu + ', ' + x.lim.eq + ' equilibrados y ' + x.lim.cap + ' topados por el juego.');
        verdicts.push(top === 'cpu' ? rigName(r) + ': el procesador es lo que más lo frena.' : top === 'gpu' ? rigName(r) + ': la tarjeta de video es lo que más lo frena. Bajar la calidad o activar el escalado ayuda.' : rigName(r) + ': está bastante equilibrado.');
      });
      say({ text: 'Así se reparte el cuello de botella con ' + settingsText() + ':', figure: figure('bn'), node: bnNode(st), list: lines.concat(verdicts), chips: [{ label: '¿Qué mejoro primero?', send: '¿Qué mejoro primero?' }] });
      return;
    }

    if (/(mejor(o|ar|a)|upgrade|actualiz\w*|comprar|compro|invertir|que cambio|que le cambio|recomien\w*)/.test(q)) {
      var pr3 = A.fetchAdvice();
      sayAsync(pr3, function (adv) {
        var list = [], chips = [], cards = h('div', { class: 'cards' });
        Object.keys(adv.rigs).forEach(function (r) {
          var d = adv.rigs[r], bc = d.cpu.slice().sort(function (x, y) { return y.gain - x.gain; })[0], bg = d.gpu.slice().sort(function (x, y) { return y.gain - x.gain; })[0];
          if (!bc && !bg) { list.push(rigName(r) + ': ya tiene lo más potente del catálogo.'); return; }
          var cg = bc ? bc.gain : 0, gg = bg ? bg.gain : 0;
          var first = cg >= gg ? ['el procesador', bc, 'cpu'] : ['la tarjeta de video', bg, 'gpu'], second = cg >= gg ? ['la tarjeta de video', bg, 'gpu'] : ['el procesador', bc, 'cpu'];
          var t = rigName(r) + ': lo que más sube los FPS es cambiar ' + first[0] + ' por ' + first[1].name + ' (+' + fmt(first[1].gain) + ' %).';
          if (second[1]) t += ' Cambiar solo ' + second[0] + ' rinde menos (hasta +' + fmt(second[1].gain) + ' %).';
          list.push(t);
          cards.appendChild(partCard(first[2], first[1].name, first[1].gain, rigName(r)));
          (function (rr, f) { chips.push({ label: 'Probar ' + f[1].name + ' en ' + rigName(rr), run: function () { apply(function () { S[rr][f[2]] = f[1].slug; }, 'Probemos: puse ' + f[1].name + ' en el ' + rigName(rr) + '.'); } }); })(r, first);
        });
        list.push('No tengo precios, así que mira cuánto cuesta cada pieza antes de decidir.');
        return { text: 'Con ' + settingsText() + ' te recomiendo esto:', node: cards.childNodes.length ? cards : null, list: list, chips: chips };
      });
      return;
    }

    if (/(cual (rinde|es mejor|gana|va mejor)|compar\w*|diferencia|quien gana|mejor pc)/.test(q)) {
      var st2 = A.stats();
      if (!st2.rigs.b) { say({ text: 'Ahora estás viendo solo el PC A. Activa el PC B para compararlos.', chips: [{ label: 'Activar el PC B', run: function () { apply(function () { S.useB = true; }, 'Activé el PC B para comparar.'); } }] }); return; }
      var a = st2.rigs.a, b = st2.rigs.b, d = a.avg ? (b.avg / a.avg - 1) * 100 : 0;
      var lead = Math.abs(d) < 1 ? 'Rinden prácticamente igual.' : (d > 0 ? 'El PC B' : 'El PC A') + ' rinde ' + fmt(Math.abs(d > 0 ? d : (a.avg / b.avg - 1) * 100)) + ' % más.';
      say({ text: lead, node: bars([{ label: 'PC A', cls: 'a', value: a.avg, unit: ' FPS' }, { label: 'PC B', cls: 'b', value: b.avg, unit: ' FPS' }], Math.max(a.avg, b.avg) * 1.1), list: ['PC A: ' + fmt(a.avg) + ' FPS en promedio, ' + a.hit + ' de ' + st2.n + ' llegan a ' + st2.hz + '.', 'PC B: ' + fmt(b.avg) + ' FPS en promedio, ' + b.hit + ' de ' + st2.n + ' llegan a ' + st2.hz + '.'] });
      return;
    }

    if (game) { say({ text: game.name + ' con ' + settingsText() + ':', node: gameBars(game), list: gameLine(game) }); return; }

    if (/(llega\w*|alcanza\w*|cuantos juegos|mi meta|meta)/.test(q)) {
      var st3 = A.stats(), lst = [];
      Object.keys(st3.rigs).forEach(function (r) {
        var miss = res.games.filter(function (g) { return g[r].fps < st3.hz && (S.tag === 'all' || g.tag === S.tag); }).map(function (g) { return g.name; });
        lst.push(rigName(r) + ': llega a ' + st3.hz + ' FPS en ' + st3.rigs[r].hit + ' de ' + st3.n + ' juegos.' + (miss.length ? ' No llega en ' + miss.slice(0, 4).join(', ') + (miss.length > 4 ? ' y ' + (miss.length - 4) + ' más' : '') + '.' : ' Llega en todos.'));
      });
      say({ text: 'Con una meta de ' + st3.hz + ' FPS:', node: bars(Object.keys(st3.rigs).map(function (r) { return { label: rigName(r), cls: r, value: st3.rigs[r].hit, text: st3.rigs[r].hit + ' de ' + st3.n }; }), Math.max(st3.n, 1)), list: lst, chips: [{ label: 'Poner meta de 240 Hz', send: 'meta de 240 hz' }, { label: 'Poner meta de 60 Hz', send: 'meta de 60 hz' }] });
      return;
    }

    for (var g2 = 0; g2 < GLOSS.length; g2++) if (GLOSS[g2][0].test(q) && q.split(' ').length <= 4) { say(glossMsg(g2)); return; }

    if (/(gracias|genial|buenisimo|perfecto|excelente|vale|listo)\b/.test(q)) { say('¡De nada! Si quieres probar otra combinación, dime qué cambiar.'); return; }
    if (/(ayuda|que puedes|que sabes|como funciona|^hola|^buenas|^hey|^ola\b)/.test(q)) { welcome(true); return; }

    say({ text: 'No te entendí del todo. Puedo explicarte el cuello de botella, recomendarte qué mejorar, comparar tus dos PC o cambiar ajustes por ti. Por ejemplo:', list: ['«Algo más barato pero que rinda»', '«Tengo un i5-10400 y una RTX 5070 Ti, ¿qué procesador me conviene?»', '«Ponlo en 4K con DLSS en rendimiento»', '«Ponle una RTX 4070 al PC B»', '«¿Cómo anda en Cyberpunk?»', '«¿Qué es el trazado de rayos?»'] });
  }

  function welcome(again) {
    say({
      figure: figure('hero'),
      text: again ? 'Esto es lo que puedo hacer:' : llm.enabled
        ? 'Hola, soy Byte. Pregúntame lo que quieras sobre PC y juegos: te recomiendo piezas como lo haría alguien de una tienda que quiere que compres bien, no que compres más. Cuéntame tu presupuesto, tu monitor y qué juegas.'
        : 'Hola, soy Byte, el asistente del comparador. Respondo con los datos de tu comparación y puedo cambiar ajustes por ti. Soy un asistente de reglas, no una IA conectada a internet.',
      list: (llm.enabled ? ['Asesorarte para comprar: te pregunto qué necesitas y te cuento los pros y contras, incluso cuándo no conviene gastar'] : []).concat(['Explicar qué frena a cada PC y qué procesador o tarjeta te conviene según lo que ya tienes', 'Cambiar resolución, calidad, escalado, rayos, fotogramas y meta de Hz', 'Poner piezas por nombre («ponle una RTX 4070 al PC A») o un equipo de partida', 'Contarte cómo rinde un juego y explicarte términos como DLSS o VRAM'])
    }, again ? 300 : 500);
  }

  function send(text) {
    var t = String(text || '').trim();
    if (!t) return;
    bubble('user', t.slice(0, 300));
    reply(t.slice(0, 300));
  }

  function open(show) {
    panel.hidden = !show;
    fabBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
    fabBtn.classList.toggle('on', show);
    nudge.hidden = true; nudge.dataset.done = '1';
    if (show) {
      if (!started) { started = true; welcome(false); }
      setTimeout(function () { input.focus(); scroll(); }, 30);
    } else { fabBtn.focus(); }
  }

  function build() {
    fabBtn = h('button', { type: 'button', class: 'chat-fab', 'aria-expanded': 'false', 'aria-controls': 'chatPanel', 'aria-label': 'Abrir el asistente de FPS' },
      h('span', { class: 'ping' }), h('span', { class: 'ping p2' }), h('span', { class: 'orbit' }), robot('fab'), h('span', { class: 'fab-dot' }));
    fabBtn.addEventListener('click', function () { open(panel.hidden); });
    nudge = h('p', { class: 'chat-nudge', text: '¿Te ayudo a elegir piezas?' });
    nudge.hidden = true;
    setTimeout(function () { if (!started && panel.hidden && !nudge.dataset.done) { nudge.hidden = false; setTimeout(function () { nudge.hidden = true; }, 9000); } }, 2500);

    log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversación con el asistente' });
    input = h('input', { type: 'text', id: 'chatInput', maxlength: '300', autocomplete: 'off', placeholder: 'Pregunta o pide un cambio', 'aria-label': 'Escribe tu mensaje' });
    var form = h('form', { class: 'chat-form' }, input, h('button', { type: 'submit', class: 'btn', text: 'Enviar' }));
    form.addEventListener('submit', function (ev) { ev.preventDefault(); var v = input.value; input.value = ''; send(v); });

    var chips = h('div', { class: 'chat-chips' });
    DEFAULT_CHIPS.forEach(function (t) { chips.appendChild(chip({ label: t })); });

    var close = h('button', { type: 'button', class: 'chat-x', 'aria-label': 'Cerrar el asistente', text: '×' });
    close.addEventListener('click', function () { open(false); });
    hdrAv = h('span', { class: 'hdr-av' }, robot('big'));
    panel = h('section', { class: 'chat-panel', id: 'chatPanel', role: 'dialog', 'aria-label': 'Asistente de FPS' },
      h('header', null, hdrAv,
        h('div', { class: 'hdr-t' }, h('strong', { text: 'Byte' }), h('span', null, h('i', { class: 'live' }), 'Asistente de FPS, en línea')), close),
      log, chips, form);
    panel.hidden = true;
    panel.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); open(false); } });
    document.body.appendChild(h('div', { class: 'chat' }, panel, nudge, fabBtn));
  }

  build();
})();
