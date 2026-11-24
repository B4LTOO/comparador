/* Compatibilidad y consumo (estimaciones). Todo se deduce del nombre de la pieza, así que no
   necesita datos nuevos en la base. Los vatios son aproximados: sirven para orientar, no para
   reemplazar la ficha del fabricante. */
(function () {
  'use strict';
  var BOARDS = [
    { id: 'auto', label: 'Según el procesador' },
    { id: 'AM4', socket: 'AM4', mem: 'DDR4', label: 'AM4 (memoria DDR4)' },
    { id: 'AM5', socket: 'AM5', mem: 'DDR5', label: 'AM5 (memoria DDR5)' },
    { id: 'LGA1151', socket: 'LGA1151', mem: 'DDR4', label: 'LGA1151 (memoria DDR4)' },
    { id: 'LGA1200', socket: 'LGA1200', mem: 'DDR4', label: 'LGA1200 (memoria DDR4)' },
    { id: 'LGA1700-D4', socket: 'LGA1700', mem: 'DDR4', label: 'LGA1700 con DDR4' },
    { id: 'LGA1700-D5', socket: 'LGA1700', mem: 'DDR5', label: 'LGA1700 con DDR5' },
    { id: 'LGA1851', socket: 'LGA1851', mem: 'DDR5', label: 'LGA1851 (memoria DDR5)' }
  ];

  // Socket y memorias posibles de un procesador, según su nombre.
  function cpuInfo(name) {
    var m = /^Ryzen \d (\d)/.exec(name);
    if (m) return Number(m[1]) <= 5 ? { socket: 'AM4', mem: ['DDR4'] } : { socket: 'AM5', mem: ['DDR5'] };
    if (/^Core Ultra/.test(name)) return { socket: 'LGA1851', mem: ['DDR5'] };
    m = /^Core i\d-(\d+)/.exec(name);
    if (m) {
      var d = m[1], gen = d.length === 4 ? d.slice(0, 1) : d.slice(0, 2);
      if (d.length === 4) return { socket: 'LGA1151', mem: ['DDR4'] };
      if (gen === '10' || gen === '11') return { socket: 'LGA1200', mem: ['DDR4'] };
      return { socket: 'LGA1700', mem: ['DDR4', 'DDR5'] };
    }
    return null;
  }

  // Plataforma del equipo: la placa elegida o, en automático, la que pide el procesador.
  function platformOf(cpuName, boardId) {
    var b = BOARDS.filter(function (x) { return x.id === boardId && x.socket; })[0];
    if (b) return { socket: b.socket, mems: [b.mem], label: b.label, manual: true };
    var c = cpuInfo(cpuName);
    return c ? { socket: c.socket, mems: c.mem, label: c.socket + ' (' + c.mem.join(' o ') + ')', manual: false } : null;
  }

  function check(cpuName, boardId) {
    var c = cpuInfo(cpuName), p = platformOf(cpuName, boardId);
    if (!c || !p) return { ok: true, text: 'Sin datos de socket para este procesador.' };
    if (c.socket === p.socket) return { ok: true, text: 'Procesador y placa calzan (' + c.socket + ').' };
    return { ok: false, text: 'El procesador usa ' + c.socket + ' y tu placa es ' + p.socket + ': no calzan.' };
  }

  // Qué hay que comprar de más para pasar de la plataforma actual a otro procesador.
  function upgradeNeeds(currentCpuName, boardId, candidateName) {
    var cur = platformOf(currentCpuName, boardId), cand = cpuInfo(candidateName);
    if (!cur || !cand || cand.socket === cur.socket) return { board: null, ram: null, note: '' };
    var ram = cand.mem.some(function (m) { return cur.mems.indexOf(m) >= 0; }) ? null : cand.mem[0];
    var note = 'Necesita placa madre ' + cand.socket + (ram ? ' y memoria ' + ram : '');
    if (!ram && cand.mem.length > 1) note += ' (puedes elegir una con DDR4 y reusar tu RAM)';
    return { board: cand.socket, ram: ram, note: note };
  }

  var GPU_W = {
    'RTX 5090': 575, 'RTX 5080': 360, 'RTX 5070 Ti': 300, 'RTX 5070': 250, 'RTX 5060 Ti 16GB': 180, 'RTX 5060 Ti 8GB': 180, 'RTX 5060': 145, 'RTX 5050': 130,
    'RTX 4090': 450, 'RTX 4080 Super': 320, 'RTX 4080': 320, 'RTX 4070 Ti Super': 285, 'RTX 4070 Ti': 285, 'RTX 4070 Super': 220, 'RTX 4070': 200,
    'RTX 4060 Ti 16GB': 165, 'RTX 4060 Ti 8GB': 160, 'RTX 4060': 115, 'RTX 3090 Ti': 450, 'RTX 3090': 350, 'RTX 3080 Ti': 350, 'RTX 3080': 320,
    'RTX 3070 Ti': 290, 'RTX 3070': 220, 'RTX 3060 Ti': 200, 'RTX 3060 12GB': 170, 'RTX 3050': 130, 'RTX 2070 Super': 215, 'RTX 2060 Super': 175,
    'RTX 2060': 160, 'GTX 1660 Super': 125, 'GTX 1650': 75, 'GTX 1060 6GB': 120, 'GTX 1050 Ti': 75,
    'RX 7900 XTX': 355, 'RX 7900 XT': 315, 'RX 7900 GRE': 260, 'RX 7800 XT': 263, 'RX 7700 XT': 245, 'RX 7600 XT': 190, 'RX 7600': 165,
    'RX 9070 XT': 304, 'RX 9070 GRE': 220, 'RX 9070': 220, 'RX 9060 XT 16GB': 160, 'RX 9060 XT 8GB': 150,
    'RX 6950 XT': 335, 'RX 6900 XT': 300, 'RX 6800 XT': 300, 'RX 6750 XT': 250, 'RX 6700 XT': 230, 'RX 6650 XT': 180, 'RX 6600 XT': 160, 'RX 6600': 132,
    'RX 5700 XT': 225, 'RX 580 8GB': 185, 'Arc A770 16GB': 225, 'Arc A750': 225, 'Arc B580': 190, 'Arc B570': 150, 'UHD 630': 0, '780M': 0
  };
  function gpuWatts(name) {
    var k = name.replace(/^(GeForce|Radeon|Intel)\s+/, '');
    return Object.prototype.hasOwnProperty.call(GPU_W, k) ? GPU_W[k] : null;
  }

  // Consumo típico jugando (no el pico): por familia y sufijo.
  function cpuWatts(name) {
    if (/^Ryzen/.test(name)) {
      if (/X3D/.test(name)) return 90;
      if (/^Ryzen 9/.test(name)) return 140;
      return /X$/.test(name) ? 105 : 65;
    }
    if (/^Core Ultra 9/.test(name)) return 200;
    if (/^Core Ultra 7/.test(name)) return 150;
    if (/^Core Ultra 5/.test(name)) return /K/.test(name) ? 110 : 65;
    if (/^Core i9/.test(name)) return 200;
    if (/^Core i7/.test(name)) return /K$/.test(name) ? 150 : 90;
    if (/^Core i5/.test(name)) return /K$/.test(name) ? 120 : 65;
    return 65;
  }

  var PSU_SIZES = [450, 550, 650, 750, 850, 1000, 1200];
  function psuRecommend(cpuW, gpuW) {
    var raw = (cpuW + gpuW + 100) * 1.4;
    for (var i = 0; i < PSU_SIZES.length; i++) if (PSU_SIZES[i] >= raw) return PSU_SIZES[i];
    return 1300;
  }
  // Estado de la fuente elegida: ok, info (sin dato), warn (justa) o bad (insuficiente).
  function psuStatus(watts, cpuW, gpuW) {
    var rec = psuRecommend(cpuW, gpuW), min = (cpuW + gpuW + 100) * 1.1;
    var recTxt = rec > 1200 ? '1200 W o más' : rec + ' W';
    if (!watts) return { level: 'info', rec: rec, text: 'Consumo estimado: ' + (cpuW + gpuW) + ' W entre procesador y tarjeta. Fuente recomendada: ' + recTxt + '.' };
    if (watts < min) return { level: 'bad', rec: rec, text: 'Tu fuente de ' + watts + ' W no alcanza para esta combinación. Se recomienda ' + recTxt + '.' };
    if (watts < rec) return { level: 'warn', rec: rec, text: 'Tu fuente de ' + watts + ' W alcanza justo. Con margen de sobra se recomienda ' + recTxt + '.' };
    return { level: 'ok', rec: rec, text: 'Tu fuente de ' + watts + ' W alcanza con margen (recomendada: ' + recTxt + ').' };
  }

  window.Compat = { BOARDS: BOARDS, PSU_SIZES: PSU_SIZES, cpuInfo: cpuInfo, platformOf: platformOf, check: check, upgradeNeeds: upgradeNeeds, gpuWatts: gpuWatts, cpuWatts: cpuWatts, psuRecommend: psuRecommend, psuStatus: psuStatus };
})();
