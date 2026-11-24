// Comprueba que todas las piezas del catálogo tengan socket y consumo, y las reglas de compatibilidad.
const fs = require('fs');
global.window = {};
require('../public/assets/compat.js');
const C = window.Compat;
const cat = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let fails = 0;
function check(name, cond, extra) { console.log((cond ? 'ok   ' : 'FAIL ') + name + (!cond && extra ? ' ' + extra : '')); if (!cond) fails++; }

const noSocket = cat.cpus.filter(c => !C.cpuInfo(c.name)).map(c => c.name);
check('todos los procesadores tienen socket', noSocket.length === 0, noSocket.join(', '));
const noW = cat.gpus.filter(g => C.gpuWatts(g.name) === null).map(g => g.name);
check('todas las tarjetas tienen consumo', noW.length === 0, noW.join(', '));
check('consumo de procesadores razonable', cat.cpus.every(c => { const w = C.cpuWatts(c.name); return w >= 35 && w <= 250; }));

check('Ryzen 5 5600 es AM4/DDR4', JSON.stringify(C.cpuInfo('Ryzen 5 5600')) === '{"socket":"AM4","mem":["DDR4"]}');
check('Ryzen 7 9800X3D es AM5/DDR5', C.cpuInfo('Ryzen 7 9800X3D').socket === 'AM5');
check('Core i5-8400 es LGA1151', C.cpuInfo('Core i5-8400').socket === 'LGA1151');
check('Core i5-10400 es LGA1200', C.cpuInfo('Core i5-10400').socket === 'LGA1200');
check('Core i7-14700K es LGA1700 con DDR4 o DDR5', C.cpuInfo('Core i7-14700K').mem.length === 2);
check('Core Ultra 7 265K es LGA1851', C.cpuInfo('Core Ultra 7 265K').socket === 'LGA1851');

let u = C.upgradeNeeds('Ryzen 5 5600', 'auto', 'Ryzen 7 9800X3D');
check('AM4 → AM5 pide placa y DDR5', u.board === 'AM5' && u.ram === 'DDR5');
u = C.upgradeNeeds('Core i5-10400', 'auto', 'Core i7-14700K');
check('LGA1200 → LGA1700 pide placa, RAM reutilizable', u.board === 'LGA1700' && u.ram === null);
u = C.upgradeNeeds('Ryzen 5 5600', 'auto', 'Ryzen 7 5800X3D');
check('mismo socket no pide nada', u.board === null && u.ram === null);
u = C.upgradeNeeds('Ryzen 5 5600', 'AM5', 'Ryzen 7 9800X3D');
check('con placa AM5 elegida, un AM5 no pide nada', u.board === null);
check('procesador AM5 en placa AM4 no calza', C.check('Ryzen 7 9800X3D', 'AM4').ok === false);
check('procesador AM4 en placa AM4 calza', C.check('Ryzen 5 5600', 'AM4').ok === true);

check('fuente: RTX 5070 Ti + i5-10400 recomienda 750 W', C.psuRecommend(C.cpuWatts('Core i5-10400'), C.gpuWatts('GeForce RTX 5070 Ti')) === 750);
check('fuente de 450 W es insuficiente para una RTX 5090', C.psuStatus(450, 150, 575).level === 'bad');
check('fuente de 1200 W alcanza con margen', C.psuStatus(1200, 150, 300).level === 'ok');
check('sin fuente indicada es informativo', C.psuStatus(0, 150, 300).level === 'info');

if (fails) { console.log('\nFallaron ' + fails + ' pruebas de compatibilidad'); process.exit(1); }
console.log('\nPruebas de compatibilidad: todo bien');
