/* Pruebas de Finanzas: abre la app en modo ejemplo (?demo=1) en Chromium y revisa que todo funcione.
 * Correr: npm test   (o: node tests/pruebas.cjs)
 * GitHub las corre solas en cada cambio (.github/workflows/pruebas.yml). Si alguna falla, el proceso termina con error.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const fallas = [];
let pasaron = 0;
function ok(cond, nombre, detalle) {
  if (cond) { pasaron++; return; }
  fallas.push(nombre + (detalle !== undefined ? ' → ' + JSON.stringify(detalle) : ''));
  console.log('  ✗ ' + nombre + (detalle !== undefined ? ' → ' + JSON.stringify(detalle) : ''));
}

// Servidor estático mínimo (sin dependencias)
function servidor() {
  return new Promise(res => {
    const s = http.createServer((req, resp) => {
      let f = decodeURIComponent(req.url.split('?')[0]);
      if (f.endsWith('/')) f += 'index.html';
      const ruta = path.join(RAIZ, path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
      fs.readFile(ruta, (e, d) => {
        if (e) { resp.writeHead(404); return resp.end('no'); }
        resp.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta)] || 'application/octet-stream' });
        resp.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

async function nuevaPagina(b, base, opciones) {
  opciones = opciones || {};
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: opciones.tema || 'dark', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.errores.push(m.text()); });
  await p.addInitScript(sim => {
    localStorage.setItem('fin_guia', 'true');
    if (sim) {
      // Simula el APK: puente nativo con colas de prueba
      const colas = JSON.parse(sim);
      window.__llamadas = [];
      window.Capacitor = { isNativePlatform: () => true, nativePromise: (pl, m, o) => {
        window.__llamadas.push(pl + '.' + m);
        if (m === 'accionPendiente') { const a = colas.accion || null; colas.accion = null; return Promise.resolve({ accion: a }); }
        if (m === 'rapidos') { const l = colas.rapidos || []; colas.rapidos = []; return Promise.resolve({ lista: l }); }
        if (m === 'detectados') { const l = colas.detectados || []; colas.detectados = []; return Promise.resolve({ lista: l }); }
        if (m === 'lectorActivo') return Promise.resolve({ activo: true });
        if (m === 'requestPermissions' || m === 'checkPermissions') return Promise.resolve({ display: 'granted' });
        return Promise.resolve({});
      } };
    }
  }, opciones.apk ? JSON.stringify(opciones.apk) : null);
  await p.goto(base + '/?demo=1');
  await p.waitForFunction(() => typeof DATA !== 'undefined' && DATA && document.querySelector('#view').children.length > 0, null, { timeout: 15000 });
  await p.waitForTimeout(300);
  return p;
}

async function parser(b, base) {
  console.log('• Registro en una línea');
  const p = await nuevaPagina(b, base);
  const casos = await p.evaluate(() => {
    const e = t => entenderLinea(t);
    const dia1 = conDia(hoy().slice(0, 7), 1);
    return [
      ['230 oxxo', e('230 oxxo'), { monto: 230, categoria: 'Comida y antojos', fecha: hoy(), tipo: 'Gasto' }],
      ['650 gasolina débito ayer', e('650 gasolina débito ayer'), { monto: 650, categoria: 'Gasolina', fecha: sumarDias(hoy(), -1), cuenta: 'BBVA Débito' }],
      ['1200 amazon 6 msi', e('1200 amazon 6 msi'), { monto: 1200, meses: 6 }],
      ['7 eleven 85', e('7 eleven 85'), { monto: 85 }],
      ['starbucks 3 cafes 210', e('starbucks 3 cafes 210'), { monto: 210 }],
      ['gasolina 92 octanos 650', e('gasolina 92 octanos 650'), { monto: 650, categoria: 'Gasolina' }],
      ['mil quinientos de super', e('mil quinientos de super'), { monto: 1500, categoria: 'Familia y casa' }],
      ['doscientos treinta y cinco en tacos', e('doscientos treinta y cinco en tacos'), { monto: 235, categoria: 'Comida y antojos' }],
      ['cena 1.5 mil', e('cena 1.5 mil'), { monto: 1500 }],
      ['renta 4500 el 1', e('renta 4500 el 1'), { monto: 4500, fecha: dia1 <= hoy() ? dia1 : conDia(mesSig(hoy().slice(0, 7), -1), 1) }],
      ['una pizza 180', e('una pizza 180'), { monto: 180 }],
      ['le presté 500 a Aaron', e('le presté 500 a Aaron'), { monto: 500, tipo: 'Presté', persona: 'Aaron' }],
      ['quincena 7500', e('quincena 7500'), { monto: 7500, tipo: 'Ingreso', categoria: 'Sueldo' }],
      ['pagué 5000 a la oro', e('pagué 5000 a la oro'), { monto: 5000, tipo: 'Traspaso', aCuenta: 'BBVA Oro' }],
      ['gaste 1,250.50 en liverpool', e('gaste 1,250.50 en liverpool'), { monto: 1250.5, categoria: 'Gustos y compras' }],
      ['algo raro', e('algo raro'), { ok: false }],
    ];
  });
  casos.forEach(([frase, r, esperado]) => Object.keys(esperado).forEach(k => ok(r && r[k] === esperado[k], '"' + frase + '" ' + k, r && r[k])));
  ok(p.errores.length === 0, 'parser sin errores', p.errores);
  await p.context().close();
}

async function humo(b, base) {
  for (const tema of ['dark', 'light']) {
    console.log('• Pantallas y hojas (' + tema + ')');
    const p = await nuevaPagina(b, base, { tema });
    for (const [n, js] of [['Inicio', "irA('Inicio')"], ['Movimientos', "irA('Movimientos')"], ['Cuentas', "irA('Cuentas')"],
      ...['Este mes', 'Categorías', 'Resumen', 'Patrimonio', 'Tendencias', 'Semana'].map(t => ['Análisis/' + t, "SUB_ANALISIS='" + t + "';irA('Análisis')"])]) {
      await p.evaluate(js);
      const largo = await p.evaluate(() => document.querySelector('#view').innerText.length);
      ok(largo > 40, n + ' muestra contenido', largo);
    }
    for (const js of ['abrirRegistro({})', 'abrirAjustes()', 'abrirAlcanza()', 'abrirProximos()', 'abrirImportar()', 'abrirMeta()', "abrirDetalle('BBVA Oro')", "abrirCuenta('BBVA Oro')", 'abrirPlan()', 'abrirHojaTicket()']) {
      await p.evaluate(js); await p.waitForTimeout(80);
      ok(await p.evaluate(() => $('sheet').classList.contains('show') && $('sheet').innerText.length > 20), 'hoja ' + js);
      await p.evaluate(() => cerrarHojaReal()); await p.waitForTimeout(280);
    }
    // Abrir con datos ya guardados (así salía la pantalla en negro)
    await p.reload(); await p.waitForTimeout(800);
    ok(await p.evaluate(() => document.querySelector('#view').innerText.length > 40), 'al recargar con datos guardados Inicio no queda vacío');
    ok(p.errores.length === 0, 'sin errores en consola (' + tema + ')', p.errores);
    await p.context().close();
  }
}

async function formulario(b, base) {
  console.log('• Formulario de registro');
  const p = await nuevaPagina(b, base);
  await p.evaluate(() => { encolar('guardarMov', [movDeLinea(entenderLinea('230 oxxo centro'))], true); abrirRegistro({}); });
  await p.waitForTimeout(300);
  await p.fill('#fDesc', ''); await p.focus('#fDesc'); await p.keyboard.type('ox', { delay: 20 }); await p.waitForTimeout(150);
  const sug = await p.evaluate(() => [...document.querySelectorAll('#sugDesc button')].map(x => x.textContent));
  ok(sug.includes('Oxxo Centro'), 'sugerencias de descripción como botones', sug);
  ok(await p.evaluate(() => !document.querySelector('datalist')), 'sin lista nativa que tape el teclado');
  await p.click('#sugDesc button'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => $('fDesc').value === 'Oxxo Centro' && FORM.categoria === 'Comida y antojos'), 'tocar sugerencia llena descripción y categoría');
  // Repetido: pide confirmar
  await p.evaluate(() => { $('fMonto').value = '230'; FORM.monto = '230'; FORM.cuenta = 'BBVA Oro'; guardarMovForm(); });
  ok(await p.evaluate(() => FORM && /registraste lo mismo/.test(FORM.err)), 'avisa de gasto repetido');
  await p.evaluate(() => cerrarHojaReal()); await p.waitForTimeout(280);
  await p.evaluate(() => { abrirRegistro({ tipo: 'Gasto', monto: 85000, categoria: 'Viajes' }); guardarMovForm(); });
  ok(await p.evaluate(() => FORM && /sobre un cero/.test(FORM.err)), 'avisa de monto muy grande');
  await p.evaluate(() => cerrarHojaReal()); await p.waitForTimeout(280);
  // Hoja visible aunque la app se abra en segundo plano (requestAnimationFrame congelado)
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); abrirRegistro({}); });
  await p.waitForTimeout(150);
  ok(await p.evaluate(() => $('sheet').classList.contains('show') && getComputedStyle($('sheet')).transform === 'none'), 'hoja visible sin animación al abrir en segundo plano');
  ok(p.errores.length === 0, 'formulario sin errores', p.errores);
  await p.context().close();
}

async function inyeccion(b, base) {
  console.log('• Inyección de código en nombres y descripciones');
  const p = await nuevaPagina(b, base);
  const golpes = [];
  p.on('dialog', d => { golpes.push('dialog'); d.dismiss(); });
  await p.exposeFunction('pwned', w => golpes.push(w));
  await p.evaluate(() => {
    const x = n => `"><img src=x onerror=pwned('${n}')>'\\</script>`;
    DATA.cuentas.push({ nombre: x('cuenta'), tipo: 'Crédito', saldoCorte: -100, fechaCorte: '2026-10-01', diaCorte: 5, diaPago: 25, limite: 1000, archivada: false, domiciliado: x('domi') });
    DATA.personas.push({ nombre: x('persona'), saldoCorte: 50, fechaCorte: '2026-10-01', nota: x('nota') });
    DATA.metas.push({ id: x('metaid'), nombre: x('meta'), objetivo: 100, apartado: 10, icono: x('icono'), fecha: '2027-01-01' });
    DATA.fijos.push({ id: x('fijoid'), nombre: x('fijo'), tipo: 'Gasto', monto: 10, categoria: 'Otros', cuenta: '', dia: 3, activo: true });
    DATA.movs.push({ id: x('movid'), fecha: hoy(), tipo: 'Gasto', monto: 10, cuenta: DATA.cuentas.at(-1).nombre, categoria: 'Otros', desc: x('desc'), meses: 3 });
    DATA.movs.push({ id: 'x2', fecha: hoy(), tipo: 'Gasto', monto: 10, cuenta: 'Efectivo', categoria: 'Otros', desc: x('desc2') });
    DATA.historial.push({ fecha: '2026-05-10', tipo: 'Gasto', monto: 5, categoria: 'Otros', desc: x('hist') });
    DATA.config['Cuenta para gastos'] = DATA.cuentas.at(-1).nombre;
    window.__X = DATA.cuentas.at(-1).nombre; window.__P = DATA.personas.at(-1).nombre; window.__M = DATA.metas.at(-1).id; window.__F = DATA.fijos.at(-1).id; window.__MV = DATA.movs.at(-2).id;
  });
  const pasos = ["irA('Inicio')", "VISTA_HERO='Mes';pintar()", "irA('Movimientos')", "BUSCA='img';pintar()", "BUSCA='';SUB_ANALISIS='Categorías';MES_CAT='2026-05';irA('Análisis')",
    "SUB_ANALISIS='Tendencias';pintar()", "SUB_ANALISIS='Resumen';pintar()", "SUB_ANALISIS='Patrimonio';pintar()", "irA('Cuentas')", 'abrirDetalle(__X)', 'abrirCuenta(__X)', 'abrirCuadrar(__X)',
    'abrirPersona(__P)', 'abrirMeta(__M)', 'abrirFijo(__F)', 'editarMov(__MV)', 'abrirRegistro({})', 'abrirAjustes()', 'abrirAlcanza()', 'abrirProximos()',
    "agregarDetectados([{id:'x1',app:'com.bancomer.mbanking',texto:'Compra por $50.00 en '+__X+' con tu tarjeta',cuando:Date.now()}]);irA('Inicio')",
    "abrirImportar(__X)", "prepararRevision([{fecha:hoy(),desc:__X,monto:-50}],__X)", "RAPIDO_TXT='230 '+__X;irA('Inicio')", 'toast(__X)'];
  for (const s of pasos) { try { await p.evaluate(s); } catch (e) { ok(false, 'paso ' + s, e.message); } await p.waitForTimeout(60); }
  // Tocar los botones que llevan el nombre malicioso: abren lo correcto y no ejecutan nada
  await p.evaluate(() => { cerrarHojaReal(); irA('Cuentas'); }); await p.waitForTimeout(300);
  await p.locator('[data-click="abrirDetalle"]').filter({ hasText: 'pwned' }).first().click(); await p.waitForTimeout(120);
  ok(await p.evaluate(() => FORM && FORM.nombre === __X), 'el botón de una cuenta con nombre raro abre esa cuenta');
  await p.evaluate(() => cerrarHojaReal()); await p.waitForTimeout(280);
  ok(golpes.length === 0, 'ningún nombre malicioso ejecuta código', golpes);
  ok(p.errores.filter(e => !/Failed to load resource/.test(e)).length === 0, 'inyección sin errores', p.errores);
  await p.context().close();
}

// Revisa la pantalla actual: nada de onclick="…" y cada botón apunta a una función de la app con argumentos válidos
async function revisarAcciones(p) {
  return p.evaluate(() => {
    const malos = [];
    document.querySelectorAll('*').forEach(el => {
      for (const a of el.attributes) {
        if (/^on/i.test(a.name)) malos.push(el.tagName + ' ' + a.name);
        const m = a.name.match(/^data-(click|input|change|keydown|focus|mousedown)$/);
        if (m) {
          if (!accionDe(a.value)) malos.push(a.name + '=' + a.value);
          const args = el.getAttribute(a.name + '-a');
          if (args) try { if (!Array.isArray(JSON.parse(args))) malos.push(a.value + ' args'); } catch (e) { malos.push(a.value + ' args: ' + args); }
        }
      }
    });
    return malos;
  });
}

async function botones(b, base) {
  console.log('• Botones (sin código en el HTML, con CSP estricta)');
  const p = await nuevaPagina(b, base);
  // Todas las acciones escritas en el código existen como funciones de la app
  const fuente = ['index.html', 'app.js', 'extras.js', 'rapido.js'].map(f => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');
  const enLinea = fuente.match(/\son[a-z]+\s*=\s*\\?["']/gi);
  ok(!enLinea, 'el código no escribe atributos onclick, onmousedown, etc.', enLinea);
  const nombres = new Set([...fuente.matchAll(/al\('(?:click|input|change|keydown|focus|mousedown)', '(\w+)'/g)].map(m => m[1]).concat([...fuente.matchAll(/data-click="(\w+)"/g)].map(m => m[1]), ['detalleMes', 'detalleCatMes']));  // las de la gráfica llegan por variable
  const faltan = await p.evaluate(l => l.filter(n => !accionDe(n)), [...nombres]);
  ok(nombres.size > 80 && faltan.length === 0, 'cada acción del código es una función de la app (' + nombres.size + ')', faltan);
  ok(await p.evaluate(() => !accionDe('alert') && !accionDe('eval') && !accionDe('open')), 'no se puede llamar a funciones del navegador');
  ok(/script-src 'self';/.test(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')), 'CSP sin scripts en línea');
  // Recorre pantallas y hojas
  const malos = [];
  for (const js of ["irA('Inicio')", "irA('Movimientos')", "irA('Cuentas')", ...['Este mes', 'Categorías', 'Resumen', 'Patrimonio', 'Tendencias', 'Semana'].map(t => "SUB_ANALISIS='" + t + "';irA('Análisis')")]) {
    await p.evaluate(js); malos.push(...await revisarAcciones(p));
  }
  for (const js of ['abrirRegistro({})', "abrirRegistro({tipo:'Traspaso'})", 'abrirAjustes()', 'abrirAlcanza()', 'abrirProximos()', "abrirImportar('Revolut')", 'abrirMeta()', "abrirMeta(DATA.metas[0]&&DATA.metas[0].id)",
    "abrirDetalle('BBVA Oro')", "abrirCuenta('BBVA Oro')", 'abrirNuevaCuenta()', 'abrirNuevaPersona()', 'abrirPersona(DATA.personas[0].nombre)', 'abrirFijo()', 'abrirFijo(DATA.fijos[0].id)',
    'abrirPlan()', 'abrirHojaTicket()', 'abrirGuia()', "abrirCuadrar('BBVA Oro')", "abrirCategoria(DATA.categorias[0].nombre)"]) {
    try { await p.evaluate(js); } catch (e) { malos.push(js + ': ' + e.message); continue; }
    await p.waitForTimeout(60); malos.push(...(await revisarAcciones(p)).map(m => js + ' → ' + m));
    await p.evaluate(() => cerrarHojaReal()); await p.waitForTimeout(260);
  }
  ok(malos.length === 0, 'todas las pantallas sin onclick y con acciones válidas', [...new Set(malos)].slice(0, 10));

  // Toques de verdad (con un gasto de hace dos meses para que haya meses a dónde moverse)
  await p.evaluate(() => DATA.movs.push({ id: 'viejo', fecha: mesSig(hoy().slice(0, 7), -2) + '-10', tipo: 'Gasto', monto: 40, cuenta: 'Efectivo', categoria: 'Otros', desc: 'Viejo' }));
  await p.click('nav [data-tab="Movimientos"]'); await p.waitForTimeout(80);
  ok(await p.evaluate(() => $('nav').querySelector('[data-tab="Movimientos"]').classList.contains('on') || /Movimientos/.test($('titulo').textContent)), 'la barra de abajo cambia de pantalla');
  const mes = await p.evaluate(() => MES);
  await p.click('.monthbar .arrow:not([disabled]) >> nth=0'); await p.waitForTimeout(60);
  ok(await p.evaluate(m => MES === mesSig(m, -1) || MES === mesSig(m, 1), mes), 'flechas de mes');
  await p.fill('#buscar', 'oxxo'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => BUSCA === 'oxxo'), 'buscar escribe en BUSCA');
  await p.fill('#buscar', '');
  await p.click('.chips [data-click="filtrar"] >> nth=1'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FILTRO !== Object.keys(FILTROS)[0]), 'chip de filtro');
  await p.click('nav [data-tab="Análisis"]'); await p.waitForTimeout(60);
  await p.click('[data-click="verAnalisis"] >> text=Categorías'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => SUB_ANALISIS === 'Categorías'), 'chips de Análisis');
  await p.click('[data-click="verAnalisis"] >> text=Semana'); await p.waitForTimeout(60);
  await p.click('.monthbar .arrow >> nth=0'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => SEMANA === 1), 'semana anterior');
  // Teclado sobre la gráfica (Enter = tocar)
  await p.click('[data-click="verAnalisis"] >> text=Tendencias'); await p.waitForTimeout(60);
  const barra = p.locator('rect.hit').last();
  if (await barra.count()) { await barra.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => $('sheet').classList.contains('show') || /detalle|Categorías/.test(document.body.innerText)), 'Enter en una barra de la gráfica la abre');
    await p.evaluate(() => cerrarHojaReal()); await p.waitForTimeout(260); }
  // Registrar con toques
  const antes = await p.evaluate(() => DATA.movs.length);
  await p.click('nav .fab'); await p.waitForTimeout(250);
  await p.evaluate(() => LS.del('fin_draft'));
  await p.click('#fMonto'); await p.keyboard.type('125'); await p.keyboard.press('Enter'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FORM.monto === '125' && document.activeElement.id !== 'fMonto'), 'monto se escribe y Enter suelta el teclado');
  await p.fill('#fDesc', 'Prueba de botones'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FORM.desc === 'Prueba de botones'), 'descripción se escribe');
  await p.click('[data-click="fechaHoy"]'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FORM.fecha === hoy()), 'botón Hoy');
  await p.locator('[data-click="setForm"][data-click-a*="categoria"]').first().click(); await p.waitForTimeout(60);
  ok(await p.evaluate(() => !!FORM.categoria), 'elegir categoría con un toque');
  await p.click('[data-click="guardarMovForm"]'); await p.waitForTimeout(250);
  ok(await p.evaluate(n => DATA.movs.some(m => m.desc === 'Prueba de botones' && m.monto === 125), antes), 'guardar con toques registra el gasto',
    await p.evaluate(n => ({ n: DATA.movs.length - n, ult: DATA.movs.slice(-2).map(m => [m.desc, m.monto, m.fecha]) }), antes));
  // Guía: Siguiente y Atrás
  await p.evaluate(() => abrirGuia()); await p.waitForTimeout(150);
  await p.click('#sheet .actbar .btn:not(.ghost)'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FORM.paso === 1), 'guía: Siguiente');
  await p.click('#sheet .actbar .btn.ghost'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => FORM.paso === 0), 'guía: Atrás');
  await p.click('#scrim', { position: { x: 20, y: 20 } }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !$('sheet').classList.contains('show')), 'tocar fuera cierra la hoja');
  // Ajustes: tema
  await p.evaluate(() => abrirAjustes()); await p.waitForTimeout(150);
  await p.click('[data-click="elegirTema"][data-click-a*="light"]'); await p.waitForTimeout(60);
  ok(await p.evaluate(() => LS.get('fin_tema') === 'light' && document.documentElement.dataset.theme === 'light'), 'Ajustes: elegir tema claro');
  await p.evaluate(() => cerrarHojaReal()); await p.waitForTimeout(260);
  ok(p.errores.length === 0, 'botones sin errores (ni bloqueos de la CSP)', p.errores);
  await p.context().close();
}

async function apk(b, base) {
  console.log('• APK simulado: notificaciones, widget y duplicados');
  const ahora = Date.now();
  const p = await nuevaPagina(b, base, { apk: {
    rapidos: [
      { id: 'r1', texto: '120 tacos', origen: 'rapida', cuando: ahora - 3600e3 },
      { id: 'r2', texto: '__nada__', origen: 'recordatorio', cuando: ahora - 86400e3 },
      { id: 'r3', texto: '__fav__:' + JSON.stringify({ d: 'Café', c: 'Comida y antojos', cu: 'BBVA Oro', m: 65 }), origen: 'favorito', cuando: ahora },
      { id: 'r4', texto: 'no se que fue', origen: 'rapida', cuando: ahora } ],
    detectados: [
      { id: 'd1', app: 'com.bancomer.mbanking', texto: 'Compra por $230.00 en OXXO CENTRO con tu tarjeta de crédito', cuando: ahora - 600e3, confirmado: true },
      { id: 'd2', app: 'com.revolut.revolut', texto: 'Pagaste 89,00 MXN en Uber', cuando: ahora - 60e3 } ] } });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({ montos: DATA.movs.map(m => m.monto), bandeja: LS.get('fin_detectados', []).map(d => d.monto), sinGasto: LS.get('fin_singasto', []) }));
  ok(r.montos.includes(120) && r.montos.includes(65) && r.montos.includes(230), 'registra lo anotado, el favorito y la compra confirmada', r.montos);
  ok(r.bandeja.includes(89) && r.bandeja.includes(0), 'lo no confirmado queda en Inicio para revisar', r.bandeja);
  ok(r.sinGasto.length === 1, '"No gasté" queda anotado', r.sinGasto);
  // Confirmar una compra que ya registraste a mano no la duplica
  const dup = await p.evaluate(() => { const antes = DATA.movs.filter(m => m.monto === 77).length; encolar('guardarMov', [movDeLinea(entenderLinea('77 farmacia'))], true);
    const hecho = registrarDetectadoSolo({ id: 'z', banco: 'BBVA', monto: 77, comercio: 'Farmacia', tipo: 'Gasto', cuenta: 'BBVA Oro', cuando: Date.now() });
    return { hecho, cuantos: DATA.movs.filter(m => m.monto === 77).length - antes }; });
  ok(!dup.hecho && dup.cuantos === 1, 'compra confirmada no se duplica si ya la registraste', dup);
  ok(await p.evaluate(() => window.__llamadas.includes('Finanzas.actualizarWidget')), 'manda datos al widget');
  ok(p.errores.length === 0, 'APK sin errores', p.errores);
  await p.context().close();
  // "Editar" en la notificación abre esa compra
  const q = await nuevaPagina(b, base, { apk: { accion: 'detectado:com.bancomer.mbanking:111', detectados: [
    { id: 'com.bancomer.mbanking:111', app: 'com.bancomer.mbanking', texto: 'Compra por $230.00 en OXXO CENTRO con tu tarjeta de crédito', cuando: ahora - 60000 }] } });
  await q.waitForTimeout(1200);
  ok(await q.evaluate(() => !!FORM && FORM.vista === 'mov' && +FORM.monto === 230 && FORM.detectado === 'com.bancomer.mbanking:111' && $('sheet').classList.contains('show')), 'Editar desde la notificación abre la compra');
  ok(q.errores.length === 0, 'Editar sin errores', q.errores);
  await q.context().close();
}

async function importar(b, base) {
  console.log('• Importar estado de cuenta (CSV de Revolut)');
  const p = await nuevaPagina(b, base);
  const filas = await p.evaluate(async () => {
    abrirImportar('Revolut');
    const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n' +
      'CARD_PAYMENT,Current,2026-10-14 10:00:00,2026-10-15 09:00:00,Starbucks,-89.00,0.00,MXN,COMPLETED,4818.75\n' +
      'TOPUP,Current,2026-10-16 10:00:00,2026-10-16 10:01:00,Top-Up by *1234,1000.00,0.00,MXN,COMPLETED,5818.75\n' +
      'CARD_PAYMENT,Current,2026-10-17 10:00:00,2026-10-17 10:00:00,Uber,-150.00,0.00,MXN,REVERTED,5818.75\n' +
      'CARD_PAYMENT,Current,2026-10-17 12:00:00,2026-10-18 09:00:00,Zara Madrid,-25.00,0.00,EUR,COMPLETED,100.00';
    await leerArchivoImport(new File([csv], 'revolut.csv', { type: 'text/csv' }));
    return FORM.filas.map(f => [f.desc, f.monto, f.tipo, f.si]);
  });
  ok(filas.length === 3, 'ignora la compra revertida', filas);
  ok(filas[0] && filas[0][0] === 'Starbucks' && filas[0][1] === 89 && filas[0][2] === 'Gasto' && filas[0][3], 'compra normal marcada', filas[0]);
  ok(filas[2] && !filas[2][3], 'compra en euros desmarcada', filas[2]);
  ok(p.errores.length === 0, 'importar sin errores', p.errores);
  await p.context().close();
}

(async () => {
  const s = await servidor(), base = 'http://127.0.0.1:' + s.address().port;
  const b = await chromium.launch();
  try {
    for (const prueba of [parser, humo, formulario, inyeccion, botones, apk, importar]) await prueba(b, base);
  } catch (e) { ok(false, 'la prueba se cayó', e.message); }
  await b.close(); s.close();
  console.log('\n' + pasaron + ' revisiones pasaron, ' + fallas.length + ' fallaron.');
  if (fallas.length) { console.log(fallas.map(f => ' - ' + f).join('\n')); process.exit(1); }
})();
