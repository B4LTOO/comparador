/* Ilustraciones de piezas: tarjetas de video y procesadores dibujados en SVG según marca y gama.
   No son fotos de producto: son dibujos de referencia que cambian con la marca, la memoria y la familia. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]);
    return e;
  }
  function txt(attrs, s) { var t = el('text', attrs); t.textContent = s; return t; }
  var uid = 0;

  var BRAND = {
    NVIDIA: { c: '#76b900', d: '#4b7800' },
    AMD: { c: '#ed1c24', d: '#9c0f15' },
    Intel: { c: '#0a8fe0', d: '#0560a0' }
  };

  // Nombre corto para grabar en la pieza: «RTX 5070 Ti», «Ryzen 7», «Core i5».
  function gpuLabel(n) { return n.replace(/^GeForce\s+/, '').replace(/^Radeon\s+/, '').replace(/\s+\d+GB$/, ''); }
  function cpuLabel(n) {
    var m = /^(Ryzen \d|Core Ultra \d|Core i\d)/.exec(n);
    return m ? m[1] : n;
  }
  function cpuModel(n) { return n.replace(/^(Ryzen \d|Core Ultra \d|Core i\d)[ -]?/, ''); }

  function gpu(part) {
    var b = BRAND[part.brand], id = 'pa' + (++uid);
    var svg = el('svg', { viewBox: '0 0 160 84', class: 'part-art gpu', role: 'img', 'aria-label': 'Ilustración de ' + part.name });
    if (!b) {   // gráficos integrados: un chip pequeño
      svg.appendChild(el('rect', { x: 44, y: 14, width: 72, height: 56, rx: 7, fill: '#3a4150' }));
      svg.appendChild(el('rect', { x: 56, y: 26, width: 48, height: 32, rx: 4, fill: '#586277' }));
      svg.appendChild(txt({ x: 80, y: 46, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#e8ecf3' }, 'iGPU'));
      return svg;
    }
    var vram = part.vram_gb || 8, fans = vram >= 16 ? 3 : 2, tall = vram >= 12;
    var top = tall ? 6 : 14, h = tall ? 58 : 44, x0 = 6, w = 148;
    var defs = el('defs', {}, el('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0, 'stop-color': '#3b4251' }), el('stop', { offset: 1, 'stop-color': '#232833' })));
    svg.appendChild(defs);
    // conector PCIe
    svg.appendChild(el('rect', { x: 28, y: top + h, width: 70, height: 6, rx: 1, fill: '#d9b45a' }));
    for (var i = 0; i < 14; i++) svg.appendChild(el('rect', { x: 30 + i * 5, y: top + h + 1.5, width: 2.4, height: 3.5, fill: '#8a6d24' }));
    // cuerpo
    svg.appendChild(el('rect', { x: x0, y: top, width: w, height: h, rx: 7, fill: 'url(#' + id + ')', stroke: '#11141a', 'stroke-width': 1.5 }));
    // franja de marca
    svg.appendChild(el('rect', { x: x0 + 8, y: top + h - 7, width: w - 16, height: 3, rx: 1.5, fill: b.c }));
    // ventiladores
    var fr = Math.min(h / 2 - 6, 20), gap = (w - 16) / fans;
    for (var f = 0; f < fans; f++) {
      var cx = x0 + 8 + gap * f + gap / 2, cy = top + (h - 7) / 2 + 1;
      var g = el('g', { class: 'fan' });
      g.style.transformOrigin = cx + 'px ' + cy + 'px';
      g.appendChild(el('circle', { cx: cx, cy: cy, r: fr, fill: '#14171d', stroke: '#4b5364', 'stroke-width': 1.2 }));
      for (var k = 0; k < 7; k++) {
        var a = k * 360 / 7;
        g.appendChild(el('path', { d: 'M' + cx + ' ' + cy + ' q' + (fr * 0.5) + ' -' + (fr * 0.2) + ' ' + (fr * 0.85) + ' -' + (fr * 0.55) + ' q-' + (fr * 0.25) + ' ' + (fr * 0.55) + ' -' + (fr * 0.85) + ' ' + (fr * 0.55) + 'z', fill: '#2c323e', stroke: '#454d5e', 'stroke-width': .5, transform: 'rotate(' + a + ' ' + cx + ' ' + cy + ')' }));
      }
      svg.appendChild(g);
      svg.appendChild(el('circle', { cx: cx, cy: cy, r: fr * 0.22, fill: b.c }));
    }
    // placa trasera y toma de energía
    svg.appendChild(el('rect', { x: x0 + w - 4, y: top + 6, width: 4, height: h - 12, rx: 1.5, fill: '#aeb6c4' }));
    svg.appendChild(el('rect', { x: x0 + w - 36, y: top - 3, width: 26, height: 4, rx: 1.5, fill: '#14171d' }));
    svg.appendChild(txt({ x: x0 + 12, y: top + 9, 'font-size': 7.5, 'font-weight': 700, fill: b.c, 'font-family': 'system-ui,sans-serif' }, part.brand === 'NVIDIA' ? 'GEFORCE' : part.brand === 'AMD' ? 'RADEON' : 'ARC'));
    return svg;
  }

  function cpu(part) {
    var b = BRAND[part.brand] || BRAND.Intel, id = 'pa' + (++uid), amd = part.brand === 'AMD';
    var x3d = /X3D/.test(part.name), label = cpuLabel(part.name), model = cpuModel(part.name);
    var svg = el('svg', { viewBox: '0 0 84 84', class: 'part-art cpu', role: 'img', 'aria-label': 'Ilustración de ' + part.name });
    svg.appendChild(el('defs', {}, el('linearGradient', { id: id, x1: 0, y1: 0, x2: 1, y2: 1 },
      el('stop', { offset: 0, 'stop-color': '#e9edf3' }), el('stop', { offset: .55, 'stop-color': '#c3cad6' }), el('stop', { offset: 1, 'stop-color': '#a8b1c0' }))));
    // sustrato verde-gris y contactos dorados
    svg.appendChild(el('rect', { x: 6, y: 6, width: 72, height: 72, rx: 6, fill: amd ? '#3d4a3f' : '#2f4a46' }));
    for (var i = 0; i < 9; i++) for (var j = 0; j < 9; j++) {
      if (i > 1 && i < 7 && j > 1 && j < 7) continue;
      svg.appendChild(el('circle', { cx: 12 + i * 7.5, cy: 12 + j * 7.5, r: 1.3, fill: '#d9b45a' }));
    }
    // tapa metálica
    svg.appendChild(el('path', { d: amd ? 'M20 18h44a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z' : 'M18 18h48a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z', fill: 'url(#' + id + ')', stroke: '#7d8697', 'stroke-width': 1 }));
    if (amd) { svg.appendChild(el('rect', { x: 24, y: 22, width: 36, height: 3, rx: 1.5, fill: '#9aa3b3' })); svg.appendChild(el('rect', { x: 24, y: 59, width: 36, height: 3, rx: 1.5, fill: '#9aa3b3' })); }
    svg.appendChild(el('rect', { x: 28, y: 29, width: 28, height: 4, rx: 2, fill: b.c }));
    svg.appendChild(txt({ x: 42, y: 45, 'text-anchor': 'middle', 'font-size': label.length > 8 ? 8 : 10, 'font-weight': 800, fill: '#2a3140', 'font-family': 'system-ui,sans-serif' }, label));
    svg.appendChild(txt({ x: 42, y: 56, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 600, fill: '#4a5366', 'font-family': 'system-ui,sans-serif' }, model.slice(0, 12)));
    // triángulo marcador
    svg.appendChild(el('path', { d: 'M6 6h9L6 15z', fill: '#d9b45a' }));
    if (x3d) svg.appendChild(el('rect', { x: 50, y: 62, width: 14, height: 4, rx: 2, fill: b.d }));
    return svg;
  }

  window.PartArt = { make: function (kind, part) { return kind === 'cpu' ? cpu(part) : gpu(part); } };
})();
