/* Finanzas v8 – planear y cuadrar: pagos programados de tus tarjetas (compras a meses de antes y promociones de
 * "compra hoy, paga después"), promesas de pago de quien te debe, "Cuadrar todo" con sugerencias y "¿Cómo voy a quedar?".
 * Todo se guarda en la hoja Config (sin cambiar el Apps Script). Se carga después de app.js, extras.js y rapido.js.
 */

/* ===================== Datos en Config ===================== */
function configJSON(clave, vacio) {
  try { const v = JSON.parse(DATA.config[clave] || 'null'); return v == null ? vacio : v; } catch (e) { return vacio; }
}
function guardarConfigJSON(clave, valor) { encolar('guardarConfig', [clave, JSON.stringify(valor)], true); }
const MES_RE = /^\d{4}-\d{2}$/, DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
// Pagos de un plan como { "2027-03": 5666.67 }, solo meses y montos válidos
function pagosLimpios(p) {
  const out = {};
  if (p && typeof p === 'object') Object.keys(p).forEach(mes => { const v = parseMonto(p[mes]); if (MES_RE.test(mes) && v > 0) out[mes] = r2(v); });
  return out;
}

/* ===================== Pagos programados por tarjeta =====================
 * Config "Pagos programados": [{ id, cuenta, desc, mov, pagos: { "2027-03": 5666.67, ... } }] (mes de la fecha límite).
 * Se suman a "Mensualidades anteriores" (el formato de la v7.4, que sigue valiendo hasta que edites el calendario).
 */
function planesPago() {
  const l = configJSON('Pagos programados', []);
  return (Array.isArray(l) ? l : []).filter(p => p && p.cuenta && p.id).map(p => ({ id: String(p.id), cuenta: String(p.cuenta), desc: String(p.desc || ''), mov: p.mov ? String(p.mov) : '', pagos: pagosLimpios(p.pagos) }));
}
function planesDe(c) {
  const out = planesPago().filter(p => p.cuenta === c.nombre);
  const legado = configJSON('Mensualidades anteriores', {});
  const viejos = pagosLimpios(legado && legado[c.nombre]);
  if (Object.keys(viejos).length) out.unshift({ id: 'legado', cuenta: c.nombre, desc: 'Compras a meses de antes', mov: '', pagos: viejos, legado: true });
  return out;
}
function guardarPlanes(lista) { guardarConfigJSON('Pagos programados', lista.map(p => ({ id: p.id, cuenta: p.cuenta, desc: p.desc, mov: p.mov || '', pagos: p.pagos }))); }
// El calendario viejo pasa a ser un plan normal la primera vez que lo editas
function migrarLegado(cuenta) {
  const legado = configJSON('Mensualidades anteriores', {});
  if (!legado || !legado[cuenta]) return;
  const viejos = pagosLimpios(legado[cuenta]);
  delete legado[cuenta];
  encolar('guardarConfig', ['Mensualidades anteriores', JSON.stringify(legado)], true);
  if (Object.keys(viejos).length) guardarPlanes(planesPago().concat([{ id: uid(), cuenta, desc: 'Compras a meses de antes', mov: '', pagos: viejos }]));
}
// Reparte un monto en n pagos iguales (el último absorbe los centavos), empezando en el mes `desde`
function repartir(total, n, desde) {
  const pagos = {}, cada = Math.floor(total / n * 100) / 100;
  for (let i = 0; i < n; i++) pagos[mesSig(desde, i)] = i === n - 1 ? r2(total - cada * (n - 1)) : cada;
  return pagos;
}
const tramosDe = pagos => {
  const meses = Object.keys(pagos).sort(), tramos = [];
  meses.forEach(mes => {
    const t = tramos[tramos.length - 1];
    if (t && t.monto === pagos[mes] && mesSig(t.hasta, 1) === mes) { t.hasta = mes; t.n++; } else tramos.push({ desde: mes, hasta: mes, monto: pagos[mes], n: 1 });
  });
  return tramos;
};
const nombreTramo = t => t.desde === t.hasta ? nombreMes(t.desde)
  : MESES[+t.desde.slice(5, 7) - 1] + (t.desde.slice(0, 4) === t.hasta.slice(0, 4) ? '' : ' ' + t.desde.slice(0, 4)) + ' – ' + nombreMes(t.hasta);

// En la hoja de la tarjeta: lo que ya está programado, plan por plan
function htmlPagosProgramados(c) {
  const ci = cicloTarjeta(c, hoy()), desde = ci ? ci.pago.slice(0, 7) : hoy().slice(0, 7);
  const planes = planesDe(c).map(p => { const pagos = {}; Object.keys(p.pagos).filter(m => m >= desde).forEach(m => { pagos[m] = p.pagos[m]; }); return Object.assign({}, p, { vivos: pagos }); })
    .filter(p => Object.keys(p.vivos).length);
  let h = '<div class="fl">Pagos programados<button class="more" ' + al('click', 'abrirPlanPago', c.nombre, '') + '>+ Agregar</button></div>';
  if (!planes.length) return h + '<p class="hint" style="margin-top:-4px">Si traes compras a meses de antes de usar la app, o una promoción de "paga después", agrégalas aquí y el pago de cada mes sale bien.</p>';
  const total = planes.reduce((s, p) => s + Object.values(p.vivos).reduce((a, v) => a + v, 0), 0);
  return h + '<div class="card" style="padding:4px 16px">' + planes.map(p =>
    '<button class="qrow rowbtn" style="width:100%;text-align:left" ' + al('click', 'abrirPlanPago', c.nombre, p.id) + '><span><b>' + esc(p.desc || 'Pagos programados') + '</b>' +
      tramosDe(p.vivos).map(t => '<br><span class="muted">' + nombreTramo(t) + (t.n > 1 ? ' · ' + money(t.monto) + ' al mes' : ' · ' + money(t.monto)) + '</span>').join('') +
    '</span><b class="num">' + money(Object.values(p.vivos).reduce((a, v) => a + v, 0)) + '</b></button>').join('') +
    '<div class="qrow tot"><span>Te faltan por pagar</span><b class="num">' + money(total) + '</b></div>' +
    '<div class="muted" style="padding-bottom:8px">Ya está contado en el pago de cada mes. Toca uno para editarlo.</div></div>';
}

/* ---- Editar un plan: descripción y pagos mes por mes ---- */
function abrirPlanPago(cuenta, id) {
  if (id === 'legado') { migrarLegado(cuenta); const p = planesPago().filter(x => x.cuenta === cuenta).pop(); id = p ? p.id : ''; }
  const p = id ? planesPago().find(x => x.id === id) : null;
  const ci = cicloTarjeta(DATA.cuentas.find(c => c.nombre === cuenta), hoy());
  FORM = { vista: 'planPago', cuenta, id: p ? p.id : '', desc: p ? p.desc : '', mov: p ? p.mov : '',
           filas: p ? Object.keys(p.pagos).sort().map(m => ({ mes: m, monto: String(p.pagos[m]) })) : [],
           total: '', n: 3, desde: ci ? ci.pago.slice(0, 7) : mesSig(hoy().slice(0, 7), 1), err: '' };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function hojaPlanPago() {
  const F = FORM;
  let h = titulo(F.id ? 'Pagos programados' : 'Agregar pagos programados') + '<p class="muted" style="margin-top:-6px">' + esc(F.cuenta) + ' · por mes de fecha límite</p>';
  h += '<div class="fl"><label for="fPDesc">¿Qué es?</label></div><input id="fPDesc" class="inp" maxlength="60" placeholder="Ej. Título (paga en marzo), compras a meses de antes" value="' + esc(F.desc) + '" ' + al('input', 'campoForm', 'desc') + '>';
  if (!F.filas.length) {
    h += '<div class="fl"><label for="fPTot">¿Cuánto en total?</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fPTot" inputmode="decimal" placeholder="0.00" value="' + esc(F.total) + '" ' + al('input', 'campoForm', 'total') + '></label>';
    h += '<div class="fl">¿En cuántos pagos?</div><div class="pick" role="group" aria-label="Pagos">' + [1, 3, 6, 9, 12, 18, 24].map(n => '<button class="' + (F.n === n ? 'on' : '') + '" aria-pressed="' + (F.n === n) + '" ' + al('click', 'setForm', 'n', n) + '>' + n + '</button>').join('') + '</div>';
    h += '<div class="fl">El primer pago, en</div><div class="pick" role="group" aria-label="Primer pago">' + [0, 1, 2, 3, 4, 5].map(k => { const m = mesSig(hoy().slice(0, 7), k); return '<button class="' + (F.desde === m ? 'on' : '') + '" aria-pressed="' + (F.desde === m) + '" ' + al('click', 'setForm', 'desde', m) + '>' + MESES[+m.slice(5, 7) - 1].slice(0, 3) + (m.slice(0, 4) !== hoy().slice(0, 4) ? ' ' + m.slice(2, 4) : '') + '</button>'; }).join('') + '</div>';
    const t = parseMonto(F.total);
    if (t > 0) h += '<div class="finan" role="note"><span class="finan-ic" aria-hidden="true">🗓️</span><div>' + (F.n === 1 ? 'Un pago de <b>' + money(t) + '</b>' : '<b>' + money(t / F.n) + ' al mes</b> durante ' + F.n + ' meses') + ', de ' + nombreMes(F.desde) + (F.n > 1 ? ' a ' + nombreMes(mesSig(F.desde, F.n - 1)) : '') + '.</div></div>';
    h += '<button class="btn ghost block" style="margin-top:10px" ' + al('click', 'planMesAMes') + '>Capturar mes por mes (si cada pago es distinto)</button>';
  } else {
    h += '<div class="fl">Pagos</div><div class="card" style="padding:6px 12px">' + F.filas.map((f, i) =>
      '<div class="row" style="gap:8px;align-items:center;margin:6px 0"><input type="month" class="inp" style="flex:1.2;min-width:0" value="' + esc(f.mes) + '" aria-label="Mes" ' + al('change', 'planFila', i, 'mes') + '>' +
      '<input class="inp num" inputmode="decimal" style="flex:1;min-width:0" value="' + esc(f.monto) + '" aria-label="Monto" ' + al('input', 'planFila', i, 'monto') + '>' +
      '<button class="iconbtn" aria-label="Quitar ese mes" ' + al('click', 'planQuitarFila', i) + '>✕</button></div>').join('') +
      '<button class="btn sm ghost" style="margin:6px 0" ' + al('click', 'planAgregarFila') + '>+ Otro mes</button></div>';
    const tot = F.filas.reduce((s, f) => s + (parseMonto(f.monto) || 0), 0);
    h += '<div class="qrow tot"><span>Total</span><b class="num">' + money(tot) + '</b></div>';
  }
  if (F.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(F.err) + '</div>';
  h += '<div class="actbar">' + (F.id ? '<button class="btn danger" ' + al('click', 'borrarPlanPago') + '>Eliminar</button>' : '<button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button>') +
    '<button class="btn" ' + al('click', 'guardarPlanPago') + '>Guardar</button></div>';
  return h;
}
function planMesAMes() {
  const t = parseMonto(FORM.total), pagos = t > 0 ? repartir(t, FORM.n, FORM.desde) : { [FORM.desde]: '' };
  FORM.filas = Object.keys(pagos).sort().map(m => ({ mes: m, monto: String(pagos[m]) })); pintarHoja();
}
function planFila(i, campo) { if (FORM && FORM.filas[i]) FORM.filas[i][campo] = this.value; }
function planQuitarFila(i) { FORM.filas.splice(i, 1); pintarHoja(); }
function planAgregarFila() {
  const ult = FORM.filas[FORM.filas.length - 1];
  FORM.filas.push({ mes: ult && MES_RE.test(ult.mes) ? mesSig(ult.mes, 1) : FORM.desde, monto: ult ? ult.monto : '' }); pintarHoja();
}
function guardarPlanPago() {
  const F = FORM, desc = String(F.desc || '').trim().slice(0, 60);
  const pagos = F.filas.length ? pagosLimpios(F.filas.reduce((o, f) => { if (MES_RE.test(f.mes)) o[f.mes] = r2((o[f.mes] || 0) + (parseMonto(f.monto) || 0)); return o; }, {}))
    : (parseMonto(F.total) > 0 ? repartir(parseMonto(F.total), F.n, F.desde) : {});
  if (!Object.keys(pagos).length) { F.err = F.filas.length ? 'Escribe al menos un pago con su mes.' : 'Escribe cuánto es en total.'; return pintarHoja(); }
  const lista = planesPago().filter(p => p.id !== F.id);
  lista.push({ id: F.id || uid(), cuenta: F.cuenta, desc: desc || 'Pagos programados', mov: F.mov || '', pagos });
  guardarPlanes(lista);
  const n = F.cuenta; cerrarHoja(); vibrar(15); toast('Pagos programados guardados'); abrirDetalle(n);
}
function borrarPlanPago() {
  const F = FORM, antes = planesPago(), n = F.cuenta;
  guardarPlanes(antes.filter(p => p.id !== F.id));
  cerrarHoja(); abrirDetalle(n);
  toast('Plan eliminado', { txt: 'Deshacer', fn: () => { guardarPlanes(antes); pintar(); } });
}

/* ---- "Compra hoy, paga después": desde el formulario de un gasto con tarjeta de crédito ---- */
function planDeMov(id) { return id ? planesPago().find(p => p.mov === id) : null; }
function htmlPagaDespues(c, monto) {
  const F = FORM;
  let h = '<button class="switch" role="switch" aria-checked="' + !!F.despues + '" ' + al('click', 'alternarPagaDespues') + '><span><b>Promoción: empiezo a pagar después</b><br><span class="muted">Como "compra hoy y paga en marzo a 3 meses". No entra a tus próximos estados de cuenta hasta el mes que elijas.</span></span><span class="knob" aria-hidden="true"></span></button>';
  if (!F.despues) return h;
  h += '<div class="fl">El primer pago, en</div><div class="pick" role="group" aria-label="Primer pago">' + [1, 2, 3, 4, 5, 6].map(k => { const m = mesSig(hoy().slice(0, 7), k); return '<button class="' + (F.despuesDesde === m ? 'on' : '') + '" aria-pressed="' + (F.despuesDesde === m) + '" ' + al('click', 'setForm', 'despuesDesde', m) + '>' + MESES[+m.slice(5, 7) - 1].slice(0, 3) + (m.slice(0, 4) !== hoy().slice(0, 4) ? ' ' + m.slice(2, 4) : '') + '</button>'; }).join('') + '</div>';
  h += '<div class="fl">¿En cuántos pagos?</div><div class="pick" role="group" aria-label="Pagos">' + [1, 3, 6, 12].map(n => '<button class="' + (F.despuesN === n ? 'on' : '') + '" aria-pressed="' + (F.despuesN === n) + '" ' + al('click', 'setForm', 'despuesN', n) + '>' + n + '</button>').join('') + '</div>';
  if (monto > 0 && F.despuesDesde && F.despuesN) h += '<div class="finan" role="note"><span class="finan-ic" aria-hidden="true">🗓️</span><div>' + (F.despuesN === 1 ? 'Lo pagas completo' : 'Pagarás <b>' + money(monto / F.despuesN) + ' al mes</b>') + ' con la fecha límite de ' + nombreMes(F.despuesDesde) + (F.despuesN > 1 ? ' a ' + nombreMes(mesSig(F.despuesDesde, F.despuesN - 1)) : '') + '. Tu deuda sube completa desde hoy.</div></div>';
  return h;
}
function alternarPagaDespues() {
  if ($('fMonto')) FORM.monto = $('fMonto').value; if ($('fDesc')) FORM.desc = $('fDesc').value;
  FORM.despues = !FORM.despues; if (FORM.despues) { FORM.msi = false; FORM.despuesDesde = FORM.despuesDesde || mesSig(hoy().slice(0, 7), 3); FORM.despuesN = FORM.despuesN || 3; }
  vibrar(8); pintarHoja();
}
// Después de guardar el movimiento: crea, cambia o quita su plan
function sincronizarPlanMov(m, F) {
  const lista = planesPago(), previo = lista.find(p => p.mov === m.id), otros = lista.filter(p => p.mov !== m.id);
  const c = DATA.cuentas.find(x => x.nombre === m.cuenta);
  if (F.despues && m.tipo === 'Gasto' && c && c.tipo === 'Crédito' && F.despuesDesde && F.despuesN) {
    otros.push({ id: previo ? previo.id : uid(), cuenta: m.cuenta, desc: (m.desc || m.categoria) + ' (paga después)', mov: m.id, pagos: repartir(m.monto, F.despuesN, F.despuesDesde) });
    guardarPlanes(otros);
  } else if (previo) guardarPlanes(otros);
}

/* ===================== Promesas de pago =====================
 * Config "Promesas de pago": [{ id, persona, creada, pagos: [{ f: "2026-11-20", m: 1000 }] }]
 * Lo que te pagan desde que se creó la promesa va cubriendo los pagos en orden.
 */
function promesas() {
  const l = configJSON('Promesas de pago', []);
  return (Array.isArray(l) ? l : []).filter(p => p && p.persona && Array.isArray(p.pagos)).map(p => ({ id: String(p.id), persona: String(p.persona), creada: DIA_RE.test(p.creada) ? p.creada : hoy(),
    pagos: p.pagos.filter(x => x && DIA_RE.test(x.f) && parseMonto(x.m) > 0).map(x => ({ f: x.f, m: r2(parseMonto(x.m)) })).sort((a, b) => (a.f < b.f ? -1 : 1)) }));
}
// Estado de una promesa: cuáles pagos ya se cumplieron, cuáles vienen y cuáles van atrasados
function estadoPromesa(pr) {
  const p = DATA.personas.find(x => x.nombre === pr.persona);
  const debe = p ? Math.max(0, saldoPersona(p)) : 0;
  let pagado = DATA.movs.filter(m => m.persona === pr.persona && m.tipo === 'Me pagaron' && m.fecha >= pr.creada).reduce((s, m) => s + m.monto, 0), queda = debe;
  const items = pr.pagos.map(x => {
    const cubre = Math.min(x.m, pagado); pagado = r2(pagado - cubre);
    const falta = r2(Math.min(x.m - cubre, queda)); queda = r2(queda - falta);
    return { f: x.f, m: x.m, falta, hecho: falta <= 0.004, atrasado: falta > 0.004 && x.f < hoy() };
  });
  return { pr, debe, items, pendiente: r2(items.reduce((s, x) => s + x.falta, 0)), atrasado: r2(items.filter(x => x.atrasado).reduce((s, x) => s + x.falta, 0)) };
}
const promesasDe = nombre => promesas().filter(p => p.persona === nombre).map(estadoPromesa);
// Pagos que todavía esperas (de hoy en adelante), para Próximos pagos y ¿Cómo voy a quedar?
function cobrosEsperados() {
  const out = [];
  promesas().forEach(pr => estadoPromesa(pr).items.forEach(x => { if (x.falta > 0.004 && x.f >= hoy()) out.push({ fecha: x.f, monto: x.falta, persona: pr.persona }); }));
  return out;
}
function htmlPromesas(p) {
  const ls = promesasDe(p.nombre).filter(e => e.items.some(x => !x.hecho));
  let h = '<div class="fl">Promesa de pago' + (saldoPersona(p) > 0 ? '<button class="more" ' + al('click', 'abrirPromesa', p.nombre, '') + '>+ Agregar</button>' : '') + '</div>';
  if (!ls.length) return saldoPersona(p) > 0 ? h + '<p class="hint" style="margin-top:-4px">¿Quedó de pagarte en partes? Anótalo y la app te dice cuándo esperar cada pago y si va atrasado.</p>' : '';
  return h + ls.map(e => '<div class="card" style="padding:4px 16px">' + e.items.map(x =>
    '<div class="qrow"><span>' + fechaLarga(x.f) + (x.hecho ? ' <span class="muted">· pagado ✓</span>' : x.atrasado ? ' <b class="red">· atrasado</b>' : '') + '</span><b class="num' + (x.hecho ? ' green' : '') + '">' + money(x.hecho ? x.m : x.falta) + '</b></div>').join('') +
    '<div class="qrow tot"><span>Por cobrar</span><b class="num">' + money(e.pendiente) + '</b></div>' +
    '<button class="btn sm ghost" style="margin:4px 0 10px" ' + al('click', 'abrirPromesa', p.nombre, e.pr.id) + '>Editar</button></div>').join('');
}
const FRECUENCIAS = [['una', 'Una vez', 0], ['semana', 'Cada semana', 7], ['catorcena', 'Cada catorcena', 14], ['quincena', 'Cada quincena', 15], ['mes', 'Cada mes', 30]];
function abrirPromesa(persona, id) {
  const pr = id ? promesas().find(x => x.id === id) : null, p = DATA.personas.find(x => x.nombre === persona);
  FORM = { vista: 'promesa', persona, id: pr ? pr.id : '', creada: pr ? pr.creada : hoy(), err: '',
           filas: pr ? pr.pagos.map(x => ({ f: x.f, m: String(x.m) })) : [], monto: '', primera: sumarDias(hoy(), 1), frec: 'catorcena', n: '', debe: p ? Math.max(0, saldoPersona(p)) : 0 };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function hojaPromesa() {
  const F = FORM;
  let h = titulo('Promesa de ' + esc(F.persona)) + '<p class="muted" style="margin-top:-6px">Te debe ' + money(F.debe) + '</p>';
  if (!F.filas.length) {
    h += '<div class="fl"><label for="fPrM">¿Cuánto en cada pago?</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fPrM" inputmode="decimal" placeholder="0.00" value="' + esc(F.monto) + '" ' + al('input', 'campoForm', 'monto') + ' ' + al('change', 'pintarHoja') + '></label>';
    h += '<div class="fl"><label for="fPrF">El primer pago</label></div><input id="fPrF" type="date" class="inp" value="' + esc(F.primera) + '" ' + al('change', 'promesaPrimera') + '>';
    h += '<div class="fl">¿Cada cuándo?</div><div class="pick" role="group" aria-label="Frecuencia">' + FRECUENCIAS.map(f => '<button class="' + (F.frec === f[0] ? 'on' : '') + '" aria-pressed="' + (F.frec === f[0]) + '" ' + al('click', 'setForm', 'frec', f[0]) + '>' + f[1] + '</button>').join('') + '</div>';
    const m = parseMonto(F.monto), auto = m > 0 ? Math.max(1, Math.ceil(F.debe / m - 0.001)) : 1;
    if (F.frec !== 'una') h += '<div class="fl"><label for="fPrN">¿Cuántos pagos?</label></div><input id="fPrN" class="inp" inputmode="numeric" placeholder="' + auto + ' (hasta liquidar)" value="' + esc(F.n) + '" ' + al('input', 'campoForm', 'n') + ' ' + al('change', 'pintarHoja') + '>';
    const filas = filasPromesa();
    if (filas.length) h += '<div class="card" style="padding:4px 16px;margin-top:10px">' + filas.map(x => '<div class="qrow"><span>' + fechaLarga(x.f) + '</span><b class="num">' + money(x.m) + '</b></div>').join('') + '</div>';
  } else {
    h += '<div class="fl">Pagos</div><div class="card" style="padding:6px 12px">' + F.filas.map((x, i) =>
      '<div class="row" style="gap:8px;align-items:center;margin:6px 0"><input type="date" class="inp" style="flex:1.2;min-width:0" value="' + esc(x.f) + '" aria-label="Fecha" ' + al('change', 'promesaFila', i, 'f') + '>' +
      '<input class="inp num" inputmode="decimal" style="flex:1;min-width:0" value="' + esc(x.m) + '" aria-label="Monto" ' + al('input', 'promesaFila', i, 'm') + '>' +
      '<button class="iconbtn" aria-label="Quitar ese pago" ' + al('click', 'promesaQuitarFila', i) + '>✕</button></div>').join('') + '</div>';
  }
  if (F.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(F.err) + '</div>';
  h += '<div class="actbar">' + (F.id ? '<button class="btn danger" ' + al('click', 'borrarPromesa') + '>Eliminar</button>' : '<button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button>') +
    '<button class="btn" ' + al('click', 'guardarPromesa') + '>Guardar</button></div>';
  return h;
}
function promesaPrimera() { if (DIA_RE.test(this.value)) FORM.primera = this.value; pintarHoja(); }
function promesaFila(i, k) { if (FORM && FORM.filas[i]) FORM.filas[i][k] = this.value; }
function promesaQuitarFila(i) { FORM.filas.splice(i, 1); pintarHoja(); }
// Calendario a partir de monto, primera fecha y frecuencia (el último pago es lo que falte para liquidar)
function filasPromesa() {
  const F = FORM, m = parseMonto(F.monto);
  if (!(m > 0) || !DIA_RE.test(F.primera)) return [];
  const fr = FRECUENCIAS.find(x => x[0] === F.frec) || FRECUENCIAS[0];
  const n = fr[2] ? Math.min(52, Math.max(1, parseInt(F.n, 10) || Math.ceil(F.debe / m - 0.001) || 1)) : 1, out = [];
  let resta = F.debe > 0 ? F.debe : m * n;
  for (let i = 0; i < n && resta > 0.004; i++) {
    const f = fr[0] === 'mes' ? conDia(mesSig(F.primera.slice(0, 7), i), +F.primera.slice(8, 10)) : fr[0] === 'quincena' ? sumarDias(F.primera, Math.round(i * 15.2)) : sumarDias(F.primera, i * fr[2]);
    const v = r2(Math.min(m, resta)); out.push({ f, m: v }); resta = r2(resta - v);
  }
  return out;
}
function guardarPromesa() {
  const F = FORM, pagos = (F.filas.length ? F.filas.map(x => ({ f: x.f, m: r2(parseMonto(x.m)) })) : filasPromesa()).filter(x => DIA_RE.test(x.f) && x.m > 0);
  if (!pagos.length) { F.err = 'Escribe cuánto te va a pagar y cuándo.'; return pintarHoja(); }
  const lista = promesas().filter(x => x.id !== F.id);
  lista.push({ id: F.id || uid(), persona: F.persona, creada: F.creada, pagos });
  guardarConfigJSON('Promesas de pago', lista);
  const n = F.persona; cerrarHoja(); vibrar(15); toast('Promesa guardada'); abrirPersona(n);
}
function borrarPromesa() {
  const F = FORM, antes = promesas(), n = F.persona;
  guardarConfigJSON('Promesas de pago', antes.filter(x => x.id !== F.id));
  cerrarHoja(); abrirPersona(n);
  toast('Promesa eliminada', { txt: 'Deshacer', fn: () => { guardarConfigJSON('Promesas de pago', antes); pintar(); } });
}

/* ===================== Cuadrar todo =====================
 * Escribes lo que dice cada banco y la app busca la causa de cada diferencia: un traspaso entre tus cuentas,
 * un pago fijo, una compra que detectó en tus notificaciones, un abono de alguien que te debe, rendimientos…
 */
function abrirCuadrarTodo() {
  const prev = LS.get('fin_cuadre', null);
  FORM = { vista: 'cuadrarTodo', reales: prev && prev.dia === hoy() ? prev.reales : {}, revisar: false };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
const cuentasCuadrables = () => activas().filter(c => c.tipo !== 'Préstamo' || saldo(c) < -0.004);
// Diferencia en "saldo" (como lo guarda la app): positiva si tu banco tiene más (o debes menos) que la app
function difCuenta(c) {
  const v = FORM.reales[c.nombre];
  if (v == null || String(v).trim() === '') return null;
  const real = parseMonto(v);
  return r2((esDeuda(c) ? -real : real) - saldo(c));
}
function hojaCuadrarTodo() {
  const F = FORM, cs = cuentasCuadrables();
  let h = titulo('Cuadrar todo') + '<p class="muted" style="margin-top:-6px">Escribe lo que dice cada banco. Las tarjetas y préstamos: lo que debes (saldo usado).</p>';
  h += '<div class="list">' + cs.map(c => {
    const s = saldo(c), d = difCuenta(c), deuda = esDeuda(c);
    return '<div class="acc" style="align-items:center"><span class="tx" style="display:flex;flex-direction:column;gap:1px"><span class="t1">' + esc(c.nombre) + '</span><span class="muted" style="font-size:13px">App: ' + (deuda ? 'debes ' : '') + money(deuda ? -s : s) +
      (d === null ? '' : d === 0 ? ' · <b class="green">cuadra ✓</b>' : ' · <b class="red">' + (d > 0 ? '+' : '−') + money(Math.abs(d)) + '</b>') + '</span></span>' +
      '<input class="inp num" inputmode="decimal" style="width:120px;flex:none" placeholder="' + (deuda ? 'Debes' : 'Tienes') + '" aria-label="Saldo de ' + esc(c.nombre) + ' en tu banco" value="' + esc(F.reales[c.nombre] || '') + '" ' + al('input', 'realCuadre', c.nombre) + ' ' + al('change', 'pintarHoja') + '></div>';
  }).join('') + '</div>';
  const difs = cs.map(c => ({ c, d: difCuenta(c) })).filter(x => x.d !== null && x.d !== 0);
  const llenas = cs.filter(c => difCuenta(c) !== null).length;
  if (llenas && !difs.length) h += '<div class="note info" style="margin-top:12px"><b>Todo cuadra ✓</b> Las ' + llenas + ' cuentas que escribiste coinciden con la app.</div>';
  if (difs.length) h += '<h2 style="margin-top:16px">Diferencias</h2>' + difs.map(x => htmlDiferencia(x.c, x.d, difs)).join('');
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button>' +
    (difs.length ? '<button class="btn" ' + al('click', 'ajustarRestantes') + '>Ajustar lo que falte</button>' : '<button class="btn" ' + al('click', 'pintarHoja') + '>Revisar</button>') + '</div>';
  return h;
}
function realCuadre(n) { FORM.reales[n] = this.value; LS.set('fin_cuadre', { dia: hoy(), reales: FORM.reales }); }
// Posibles causas de una diferencia, de la más probable a la menos
function sugerenciasCuadre(c, d, difs) {
  const out = [], abs = Math.abs(d), igual = (a, b) => Math.abs(a - b) < 0.01, deuda = esDeuda(c);
  // 1. Un traspaso entre dos de tus cuentas que no registraste (una baja lo mismo que la otra sube)
  difs.filter(x => x.c.nombre !== c.nombre && igual(x.d, -d)).forEach(x => {
    const de = d < 0 ? c : x.c, a = d < 0 ? x.c : c;
    if (de.tipo !== 'Préstamo') out.push({ t: (esDeuda(a) ? 'Pago de ' + a.nombre + ' desde ' : 'Traspaso de ') + de.nombre + (esDeuda(a) ? '' : ' a ' + a.nombre), mov: { tipo: 'Traspaso', monto: abs, cuenta: de.nombre, aCuenta: a.nombre, categoria: '', desc: esDeuda(a) ? 'Pago ' + a.nombre : 'Traspaso' } });
  });
  // 2. Un pago fijo de este mes que no registraste
  fijosPendientes(hoy().slice(0, 7)).filter(f => igual(f.monto, abs)).forEach(f => {
    if (f.tipo === 'Gasto' && d < 0) out.push({ t: '¿Es ' + f.nombre + '?', mov: { tipo: 'Gasto', monto: abs, cuenta: c.nombre, categoria: f.categoria, desc: f.nombre, fijo: f.id } });
    if (f.tipo === 'Ingreso' && d > 0 && !deuda) out.push({ t: '¿Es ' + f.nombre + '?', mov: { tipo: 'Ingreso', monto: abs, cuenta: c.nombre, categoria: f.categoria, desc: f.nombre, fijo: f.id } });
  });
  // 3. Una compra que detectó la app en tus notificaciones
  if (d < 0) LS.get('fin_detectados', []).filter(x => igual(x.monto, abs)).forEach(x => out.push({ t: '¿Es ' + (x.comercio || 'la compra detectada') + '?', mov: { tipo: 'Gasto', monto: abs, cuenta: c.nombre, categoria: adivinarCategoria(x.comercio, 'Gasto') || 'Otros', desc: x.comercio || '' }, detectado: x.id }));
  // 4. Alguien que te debe te pagó (lo prometido o lo que debe completo)
  if (d > 0 && !deuda) personasActivas().filter(p => saldoPersona(p) > 0).forEach(p => {
    const prometido = promesasDe(p.nombre).some(e => e.items.some(x => x.falta > 0 && igual(x.falta, abs)));
    if (prometido || igual(saldoPersona(p), abs)) out.push({ t: '¿Te pagó ' + p.nombre + '?', mov: { tipo: 'Me pagaron', monto: abs, cuenta: c.nombre, categoria: '', desc: 'Abono', persona: p.nombre } });
  });
  // 5. Rendimientos chicos en tu ahorro o débito
  if (d > 0 && !deuda && abs <= Math.max(500, Math.abs(saldo(c)) * 0.02) && catsIngreso().some(x => x.nombre === 'Rendimientos'))
    out.push({ t: 'Rendimientos', mov: { tipo: 'Ingreso', monto: abs, cuenta: c.nombre, categoria: 'Rendimientos', desc: 'Rendimientos ' + c.nombre } });
  // 6. En una tarjeta: intereses o comisiones
  if (d < 0 && deuda && catsGasto().some(x => x.nombre === 'Intereses y comisiones'))
    out.push({ t: 'Intereses o comisión', mov: { tipo: 'Gasto', monto: abs, cuenta: c.nombre, categoria: 'Intereses y comisiones', desc: 'Intereses o comisión' } });
  return out;
}
function htmlDiferencia(c, d, difs) {
  const deuda = esDeuda(c), sug = sugerenciasCuadre(c, d, difs);
  const txt = deuda ? (d < 0 ? 'Debes ' + money(-d) + ' más que en la app' : 'Debes ' + money(d) + ' menos que en la app')
    : (d < 0 ? 'Tienes ' + money(-d) + ' menos que en la app' : 'Tienes ' + money(d) + ' más que en la app');
  return '<div class="card"><div class="t1">' + esc(c.nombre) + '</div><div class="muted" style="margin:2px 0 8px">' + txt + '. ' + (sug.length ? '¿Fue alguno de estos?' : '¿Te acuerdas qué fue?') + '</div>' +
    '<div class="sug" style="margin:0;padding:0;flex-wrap:wrap">' + sug.map(s => '<button type="button" ' + al('click', 'aplicarSugerencia', c.nombre, sug.indexOf(s)) + '>' + esc(s.t) + '</button>').join('') +
      '<button type="button" ' + al('click', 'cuadreRegistrar', c.nombre) + '>' + (d < 0 ? (deuda ? 'Una compra' : 'Un gasto') : deuda ? 'Un pago o reembolso' : 'Un ingreso') + '…</button>' +
      '<button type="button" ' + al('click', 'cuadreAjuste', c.nombre) + '>No sé: ajuste</button></div></div>';
}
function difsActuales() { return cuentasCuadrables().map(c => ({ c, d: difCuenta(c) })).filter(x => x.d !== null && x.d !== 0); }
function aplicarSugerencia(n, i) {
  const difs = difsActuales(), x = difs.find(y => y.c.nombre === n);
  const s = x && sugerenciasCuadre(x.c, x.d, difs)[i];
  if (!s) return pintarHoja();
  const m = movDeLinea({ tipo: s.mov.tipo, monto: s.mov.monto, fecha: hoy(), cuenta: s.mov.cuenta, aCuenta: s.mov.aCuenta || '', categoria: s.mov.categoria, desc: s.mov.desc, persona: s.mov.persona || null }, { fijo: s.mov.fijo || '' });
  encolar('guardarMov', [m], true);
  if (s.detectado) quitarDetectado(s.detectado);
  vibrar(15); pintarHoja();
  toast(s.t.replace(/^¿|\?$/g, '') + ' · registrado', { txt: 'Deshacer', fn: () => { encolar('borrarMov', [m.id], true); pintarHoja(); } });
}
// Abre el registro con el monto y la cuenta puestos; al cerrar regresas a Cuadrar todo
function cuadreRegistrar(n) {
  const difs = difsActuales(), x = difs.find(y => y.c.nombre === n); if (!x) return;
  const deuda = esDeuda(x.c), abs = Math.abs(x.d);
  const o = x.d < 0 ? { tipo: 'Gasto', monto: abs, cuenta: n } : deuda ? { tipo: 'Traspaso', monto: abs, aCuenta: n } : { tipo: 'Ingreso', monto: abs, cuenta: n };
  abrirRegistro(o);
  if (FORM) FORM.desdeCuadre = true;       // al guardar regresas aquí, con lo que ya habías escrito
}
function cuadreAjuste(n) {
  const x = difsActuales().find(y => y.c.nombre === n); if (!x) return;
  const m = { id: uid(), fecha: hoy(), tipo: 'Ajuste', monto: x.d, cuenta: n, aCuenta: '', categoria: 'Sin registrar', desc: 'Ajuste al cuadrar', registrado: Date.now(), persona: '', fijo: '' };
  encolar('guardarMov', [m], true); vibrar(15); pintarHoja();
  toast(n + ' cuadrada', { txt: 'Deshacer', fn: () => { encolar('borrarMov', [m.id], true); pintarHoja(); } });
}
function ajustarRestantes() {
  const ids = [];
  difsActuales().forEach(x => { const m = { id: uid(), fecha: hoy(), tipo: 'Ajuste', monto: x.d, cuenta: x.c.nombre, aCuenta: '', categoria: 'Sin registrar', desc: 'Ajuste al cuadrar', registrado: Date.now() + ids.length, persona: '', fijo: '' }; ids.push(m.id); encolar('guardarMov', [m], true); });
  LS.del('fin_cuadre'); cerrarHoja(); pintar();
  toast(ids.length ? 'Todo cuadrado (' + ids.length + (ids.length === 1 ? ' ajuste)' : ' ajustes)') : 'Todo cuadra ✓', ids.length ? { txt: 'Deshacer', fn: () => { ids.forEach(id => encolar('borrarMov', [id], true)); pintar(); } } : null);
}
/* ===================== ¿Cómo voy a quedar? =====================
 * Simula día por día hasta la fecha que elijas: lo que tienes hoy + quincenas, cobros y otros ingresos
 * − pagos de tarjetas (estado de cuenta, compras a meses y pagos programados) − pagos fijos − tu gasto para vivir.
 */
// Ingresos extra que esperas (aguinaldo, un bono…): Config "Ingresos esperados": [{ id, f, m, d }]
function ingresosEsperados() {
  const l = configJSON('Ingresos esperados', []);
  return (Array.isArray(l) ? l : []).filter(x => x && DIA_RE.test(x.f) && parseMonto(x.m) > 0).map(x => ({ id: String(x.id), f: x.f, m: r2(parseMonto(x.m)), d: String(x.d || 'Ingreso extra') }));
}
// Días del mes en que te cae la quincena, sacados de tus sueldos registrados (o 15 y fin de mes)
function diasQuincena() {
  const desde = sumarDias(hoy(), -120), cnt = {};
  DATA.movs.filter(m => m.tipo === 'Ingreso' && m.categoria === 'Sueldo' && m.fecha >= desde).forEach(m => {
    const d = +m.fecha.slice(8, 10), ult = d >= diasDelMes(m.fecha.slice(0, 7)) - 1 ? 'fin' : d; cnt[ult] = (cnt[ult] || 0) + 1;
  });
  const top = arr => arr.sort((a, b) => cnt[b] - cnt[a])[0];
  const q1 = top(Object.keys(cnt).filter(k => k !== 'fin' && +k <= 15)), q2 = top(Object.keys(cnt).filter(k => k === 'fin' || +k > 15));
  return [q1 ? +q1 : 15, q2 && q2 !== 'fin' ? +q2 : 'fin'];
}
const diaEn = (mk, d) => conDia(mk, d === 'fin' ? diasDelMes(mk) : Math.min(+d, diasDelMes(mk)));
// Lo que gastas para vivir al mes: tus presupuestos menos los pagos fijos que ya cuentan aparte
function vivirMensual() {
  const pres = catsGasto().reduce((s, c) => s + (c.presupuesto || 0), 0);
  const fijos = DATA.fijos.filter(f => fijoVigente(f) && f.tipo === 'Gasto').reduce((s, f) => s + f.monto, 0);
  if (pres > 0) return Math.max(0, r2(pres - fijos));
  const desde = sumarDias(hoy(), -60);
  return r2(DATA.movs.filter(m => m.fecha >= desde && m.tipo === 'Gasto' && !m.fijo).reduce((s, m) => s + m.monto, 0) / 2);
}
function flujo(hasta, opc) {
  opc = opc || {};
  const hoyK = hoy(), ev = [], add = (fecha, monto, t, ic, grupo) => { if (fecha >= hoyK && fecha <= hasta && Math.abs(monto) > 0.004) ev.push({ fecha, monto: r2(monto), t, ic, grupo }); };
  const inicio = r2(activas().filter(c => !esDeuda(c)).reduce((s, c) => s + saldo(c), 0));
  // Tarjetas de crédito: el estado de cuenta abierto y los siguientes (compras a meses, pagos programados y lo que ya compraste)
  activas().filter(c => c.tipo === 'Crédito' && c.diaCorte && c.diaPago).forEach(c => {
    let pagado = 0;
    const ps = pagoSinIntereses(c);
    if (ps && ps.falta > 0.5) { add(ps.limite, -ps.falta, 'Pago ' + c.nombre, '💳', 'tarjeta'); pagado += ps.falta; }
    let k = cicloTarjeta(c, hoyK).corte;
    for (let i = 0; i < 24; i++, k = conDia(mesSig(k.slice(0, 7), 1), c.diaCorte)) {
      const e = estadoCuenta(c, k); if (!e || e.limite > hasta) break;
      const debe = r2(Math.max(0, e.total - pagado));
      if (debe > 0.5) add(e.limite, -debe, 'Pago ' + c.nombre, '💳', 'tarjeta');
      pagado += debe;
    }
  });
  // Pagos fijos (ingresos, gastos y abonos a préstamos) mes por mes
  const q = diasQuincena(), meses = [];
  for (let mk = hoyK.slice(0, 7); mk <= hasta.slice(0, 7); mk = mesSig(mk, 1)) meses.push(mk);
  const usadoEn = (f, desde, hastaF) => DATA.movs.some(m => m.fijo === f.id && m.fecha >= desde && m.fecha <= hastaF);
  DATA.fijos.filter(fijoVigente).forEach(f => {
    const destino = f.tipo === 'Traspaso' ? DATA.cuentas.find(c => c.nombre === f.aCuenta) : null;
    if (destino && destino.tipo === 'Crédito') return;      // a las tarjetas ya les toca su estado de cuenta
    let tope = destino ? -saldo(destino) : Infinity;
    const sueldo = f.tipo === 'Ingreso' && !f.dia && (f.categoria === 'Sueldo' || /quincena|nomina|sueldo/i.test(f.nombre));
    meses.forEach(mk => {
      const fechas = sueldo ? q.map(d => diaEn(mk, d)) : [diaEn(mk, f.dia || 1)];
      fechas.forEach((fecha, j) => {
        const periodo = sueldo ? (j === 0 ? [mk + '-01', mk + '-15'] : [mk + '-16', mk + '-' + diasDelMes(mk)]) : [mk + '-01', mk + '-' + diasDelMes(mk)];
        if (usadoEn(f, periodo[0], periodo[1])) return;
        if (sueldo && DATA.movs.some(m => m.tipo === 'Ingreso' && m.categoria === 'Sueldo' && m.fecha >= periodo[0] && m.fecha <= periodo[1])) return;
        if (fecha < hoyK) fecha = hoyK;       // ya pasó su día y no lo registras: cuenta como pendiente hoy
        let monto = f.monto;
        if (destino) { monto = Math.min(monto, tope); tope -= monto; if (monto <= 0.004) return; }
        add(fecha, f.tipo === 'Ingreso' ? monto : -monto, f.nombre, f.tipo === 'Ingreso' ? '💰' : f.tipo === 'Traspaso' ? '🏦' : '📌', f.tipo === 'Ingreso' ? 'ingreso' : 'fijo');
      });
    });
  });
  // Ingresos extra que esperas y lo que te prometieron pagar
  ingresosEsperados().forEach(x => add(x.f, x.m, x.d, '🎁', 'extra'));
  if (opc.promesas !== false) cobrosEsperados().forEach(x => add(x.fecha, x.monto, x.persona + ' te paga', '🤝', 'promesa'));
  ev.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : b.monto - a.monto));
  // Gasto para vivir: lo que te queda del presupuesto de este mes y el presupuesto completo de los que siguen
  const vm = vivirMensual(), mk0 = hoyK.slice(0, 7), r = resumenMes(mk0);
  const gastadoMes = r2(r.neto - DATA.movs.filter(m => m.fijo && m.tipo === 'Gasto' && m.fecha.slice(0, 7) === mk0).reduce((s, m) => s + m.monto, 0));
  const porDia = f => { const mk = f.slice(0, 7); return mk === mk0 ? Math.max(0, vm - gastadoMes) / (diasDelMes(mk) - +hoyK.slice(8, 10) + 1) : vm / diasDelMes(mk); };
  // Saldo día por día
  let s = inicio, vivir = 0, bajo = { s: inicio, f: hoyK }, i = 0;
  const serie = [];
  for (let f = hoyK; f <= hasta; f = sumarDias(f, 1)) {
    const v = porDia(f); s -= v; vivir += v;
    for (; i < ev.length && ev[i].fecha === f; i++) { s += ev[i].monto; ev[i].saldo = r2(s); }
    serie.push({ f, s: r2(s) });
    if (s < bajo.s) bajo = { s: r2(s), f };
  }
  const total = g => r2(ev.filter(e => e.grupo === g).reduce((t, e) => t + e.monto, 0));
  return { inicio, final: r2(s), bajo, ev, serie, vivir: r2(vivir), vm,
           tarjetas: total('tarjeta'), fijos: total('fijo'), ingresos: total('ingreso'), extra: total('extra'), promesas: total('promesa') };
}
const FLUJO_OPC = [['fin', 'Fin de mes'], ['sig', 'Fin del otro mes'], ['3m', '3 meses'], ['6m', '6 meses']];
function fechaFlujo(k) {
  const mk = hoy().slice(0, 7);
  if (k === 'fin') return mk + '-' + diasDelMes(mk);
  if (k === 'sig') { const s = mesSig(mk, 1); return s + '-' + diasDelMes(s); }
  if (k === '3m') return sumarDias(hoy(), 91);
  if (k === '6m') return sumarDias(hoy(), 182);
  return DIA_RE.test(k) && k > hoy() ? k : fechaFlujo('sig');
}
function abrirFlujo() {
  const k = LS.get('fin_flujo', 'sig');
  FORM = { vista: 'flujo', k, hasta: fechaFlujo(k), promesas: LS.get('fin_flujo_promesas', true), ver: false };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function elegirFlujo(k) { FORM.k = k; FORM.hasta = fechaFlujo(k); LS.set('fin_flujo', k); vibrar(8); pintarHoja(); }
function flujoFecha() { if (DIA_RE.test(this.value) && this.value > hoy()) { FORM.k = this.value; FORM.hasta = this.value; LS.set('fin_flujo', this.value); pintarHoja(); } }
function flujoPromesas() { FORM.promesas = !FORM.promesas; LS.set('fin_flujo_promesas', FORM.promesas); vibrar(8); pintarHoja(); }
function hojaFlujo() {
  const F = FORM, r = flujo(F.hasta, { promesas: F.promesas }), sinProm = F.promesas && r.promesas ? flujo(F.hasta, { promesas: false }) : null;
  let h = titulo('¿Cómo voy a quedar?');
  h += '<div class="chips" role="group" aria-label="Hasta cuándo">' + FLUJO_OPC.map(o => '<button class="chip' + (F.k === o[0] ? ' on' : '') + '" aria-pressed="' + (F.k === o[0]) + '" ' + al('click', 'elegirFlujo', o[0]) + '>' + o[1] + '</button>').join('') + '</div>';
  h += '<div class="row" style="gap:8px;align-items:center;margin:6px 0 12px"><label for="fFlujo" class="muted">Hasta el</label><input id="fFlujo" type="date" class="inp" style="width:auto" min="' + sumarDias(hoy(), 1) + '" value="' + F.hasta + '" ' + al('change', 'flujoFecha') + '></div>';
  h += '<div class="card flat"><div class="muted">El ' + fechaLarga(F.hasta) + ' tendrías</div><div class="amt num' + (r.final < 0 ? ' red' : '') + '" style="font-size:34px">' + money(r.final) + '</div>' +
    '<div class="muted">Lo más bajo: <b class="' + (r.bajo.s < 0 ? 'red' : '') + '">' + money(r.bajo.s) + '</b> el ' + fechaLarga(r.bajo.f) + (r.bajo.s < 0 ? '. Ese día no te alcanzaría.' : '.') + '</div>' +
    (sinProm ? '<div class="muted">Si no te pagan lo prometido: ' + money(sinProm.final) + ' (lo más bajo ' + money(sinProm.bajo.s) + ').</div>' : '') + '</div>';
  h += graficaFlujo(r.serie, r.bajo);
  const fila = (t, v, cls) => '<div class="qrow"><span>' + t + '</span><b class="num ' + (cls || '') + '">' + (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v)) + '</b></div>';
  h += '<div class="card" style="padding:4px 16px">' + fila('Tienes hoy', r.inicio) + fila('Quincenas e ingresos fijos', r.ingresos, 'green') + (r.extra ? fila('Ingresos extra', r.extra, 'green') : '') +
    (r.promesas ? fila('Lo que te prometieron pagar', r.promesas, 'green') : '') + fila('Pagos de tarjetas', r.tarjetas, 'red') + fila('Pagos fijos y préstamos', r.fijos, 'red') +
    fila('Vivir (tus presupuestos, ' + money(r.vm, true) + ' al mes)', -r.vivir, 'red') + '<div class="qrow tot"><span>Te quedan</span><b class="num' + (r.final < 0 ? ' red' : '') + '">' + money(r.final) + '</b></div></div>';
  h += '<button class="switch" role="switch" aria-checked="' + !!F.promesas + '" ' + al('click', 'flujoPromesas') + '><span><b>Contar lo que te prometieron pagar</b><br><span class="muted">Las promesas de pago que anotaste en cada persona (Cuentas → Te deben).</span></span><span class="knob" aria-hidden="true"></span></button>';
  h += '<div class="fl">Día por día<button class="more" ' + al('click', 'abrirIngresoEsperado') + '>+ Ingreso extra</button></div>';
  h += r.ev.length ? '<div class="list">' + r.ev.map(e => '<div class="mv"><span class="ic" aria-hidden="true">' + e.ic + '</span><span class="tx"><div class="d1">' + esc(e.t) + '</div><div class="d2">' + fechaLarga(e.fecha) + ' · te quedan ' + money(e.saldo, true) + '</div></span>' +
    '<span class="m num ' + (e.monto > 0 ? 'in' : '') + '">' + (e.monto > 0 ? '+' : '') + money(e.monto, true) + '</span></div>').join('') + '</div>' : '<div class="list"><div class="empty">Sin pagos ni ingresos en esas fechas.</div></div>';
  const extras = ingresosEsperados().filter(x => x.f >= hoy());
  if (extras.length) h += '<div class="fl">Ingresos extra que esperas</div><div class="card" style="padding:4px 16px">' + extras.map(x => '<div class="qrow"><span>' + esc(x.d) + '<br><span class="muted">' + fechaLarga(x.f) + '</span></span><span><b class="num">' + money(x.m) + '</b> <button class="linkbtn" ' + al('click', 'borrarIngresoEsperado', x.id) + '>Quitar</button></span></div>').join('') + '</div>';
  h += '<p class="hint">Cuenta tus quincenas (los días en que te suelen caer), tus pagos fijos, lo que pagas de cada tarjeta para no generar intereses (con compras a meses y pagos programados) y tu gasto diario según tus presupuestos. Lo que compres con tarjeta cuenta el día que lo gastas.</p>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button></div>';
  return h;
}
function graficaFlujo(serie, bajo) {
  if (serie.length < 2) return '';
  const W = 340, H = 130, pad = 8, vals = serie.map(x => x.s), max = Math.max(0, ...vals), min = Math.min(0, ...vals), rango = (max - min) || 1;
  const x = i => pad + (W - 2 * pad) * i / (serie.length - 1), y = v => pad + (H - 2 * pad) * (max - v) / rango;
  const pts = serie.map((p, i) => x(i).toFixed(1) + ',' + y(p.s).toFixed(1)).join(' '), ib = serie.findIndex(p => p.f === bajo.f);
  return '<div class="card" style="padding:10px 8px"><svg viewBox="0 0 ' + W + ' ' + H + '" class="flujo-g" role="img" aria-label="Tu saldo día por día; lo más bajo ' + money(bajo.s, true) + ' el ' + fechaCorta(bajo.f) + '">' +
    '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" class="cero"/>' +
    '<polyline points="' + pts + '" class="linea"/>' +
    (ib >= 0 ? '<circle cx="' + x(ib).toFixed(1) + '" cy="' + y(bajo.s).toFixed(1) + '" r="4" class="' + (bajo.s < 0 ? 'bajo neg' : 'bajo') + '"/>' : '') + '</svg>' +
    '<div class="legend"><span>Hoy</span><span>' + fechaCorta(serie[serie.length - 1].f) + '</span></div></div>';
}
function abrirIngresoEsperado() { FORM = { vista: 'ingresoEsperado', d: '', m: '', f: sumarDias(hoy(), 7), err: '', volver: FORM && FORM.vista === 'flujo' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaIngresoEsperado() {
  const F = FORM;
  let h = titulo('Ingreso extra que esperas') + '<p class="muted" style="margin-top:-6px">Aguinaldo, un bono, una venta… Solo cuenta para "¿Cómo voy a quedar?" hasta que lo registres.</p>';
  h += '<div class="fl"><label for="fIeD">¿Qué es?</label></div><input id="fIeD" class="inp" maxlength="40" placeholder="Ej. Aguinaldo" value="' + esc(F.d) + '" ' + al('input', 'campoForm', 'd') + '>';
  h += '<div class="fl"><label for="fIeM">¿Cuánto?</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fIeM" inputmode="decimal" placeholder="0.00" value="' + esc(F.m) + '" ' + al('input', 'campoForm', 'm') + '></label>';
  h += '<div class="fl"><label for="fIeF">¿Cuándo?</label></div><input id="fIeF" type="date" class="inp" min="' + hoy() + '" value="' + esc(F.f) + '" ' + al('change', 'campoForm', 'f') + '>';
  if (F.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(F.err) + '</div>';
  return h + '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarIngresoEsperado') + '>Guardar</button></div>';
}
function guardarIngresoEsperado() {
  const F = FORM, m = parseMonto(F.m);
  if (!(m > 0)) { F.err = 'Escribe cuánto.'; return pintarHoja(); }
  if (!DIA_RE.test(F.f) || F.f < hoy()) { F.err = 'Elige una fecha de hoy en adelante.'; return pintarHoja(); }
  guardarConfigJSON('Ingresos esperados', ingresosEsperados().filter(x => x.f >= sumarDias(hoy(), -60)).concat([{ id: uid(), f: F.f, m: r2(m), d: String(F.d || '').trim().slice(0, 40) || 'Ingreso extra' }]));
  const volver = F.volver; cerrarHoja(); toast('Ingreso esperado guardado');
  if (volver) setTimeout(abrirFlujo, 300);
}
function borrarIngresoEsperado(id) {
  const antes = ingresosEsperados();
  guardarConfigJSON('Ingresos esperados', antes.filter(x => x.id !== id)); pintarHoja();
  toast('Quitado', { txt: 'Deshacer', fn: () => { guardarConfigJSON('Ingresos esperados', antes); pintarHoja(); } });
}
// Tarjeta de Inicio: cómo terminas el otro mes y tu día más apretado
function tarjetaFlujo() {
  if (!fx('flujo') || !DATA.cuentas.length) return '';
  let r;
  try { r = flujo(fechaFlujo('sig'), { promesas: LS.get('fin_flujo_promesas', true) }); } catch (e) { return ''; }
  return '<button class="card row between" ' + al('click', 'abrirFlujo') + '><span><span class="t1">📆 ¿Cómo voy a quedar?</span><br><span class="muted">El ' + fechaCorta(fechaFlujo('sig')) + ' tendrías <b class="' + (r.final < 0 ? 'red' : 'green') + '">' + money(r.final, true) + '</b>' +
    (r.bajo.s < r.final - 1 ? '; lo más bajo, ' + money(r.bajo.s, true) + ' el ' + fechaCorta(r.bajo.f) : '') + '.</span></span><span class="chev" aria-hidden="true">›</span></button>';
}
