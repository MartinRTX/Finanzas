/* Finanzas v1.0 – app instalable de Martin.
 * Lee y escribe la hoja "Mis finanzas 2026" a través del script de Apps Script (la "API").
 * Todo lo que registras se guarda primero en el celular y se sube en cuanto hay señal.
 * Pestañas que usa: Registro, Cuentas y Categorías.
 */

/* ===================== Utilidades ===================== */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
function claveDia(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function hoy() { return claveDia(new Date()); }
function sumarDias(k, n) { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return claveDia(d); }
function difDias(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function jsq(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
const r2 = n => Math.round(n * 100) / 100;
const FMT2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });
function money(n, sinCentavos) { const v = r2(n || 0); return (v < 0 ? '-' : '') + (sinCentavos ? FMT0 : FMT2).format(Math.abs(v)).replace('MX', ''); }
function parseMonto(s) { const n = parseFloat(String(s || '').replace(/[$,\s]/g, '')); return isFinite(n) ? r2(n) : 0; }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DSEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function nombreMes(mk) { return MESES[+mk.slice(5, 7) - 1] + ' ' + mk.slice(0, 4); }
function mesSig(mk, n) { const d = new Date(mk + '-15T12:00:00'); d.setMonth(d.getMonth() + n); return claveDia(d).slice(0, 7); }
function diasDelMes(mk) { return new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate(); }
function fechaLarga(k) {
  if (k === hoy()) return 'Hoy';
  if (k === sumarDias(hoy(), -1)) return 'Ayer';
  const d = new Date(k + 'T12:00:00');
  return DSEM[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
}
function fechaCorta(k) { const d = new Date(k + 'T12:00:00'); return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3); }
let toastFn = null;
function toast(msg, accion) {
  const t = $('toast');
  toastFn = accion ? accion.fn : null;
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (accion ? '<button onclick="usarToast()">' + esc(accion.txt) + '</button>' : '');
  t.className = 'toast show';
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = 'toast'; toastFn = null; }, accion ? 5000 : 2400);
}
function usarToast() { const f = toastFn; $('toast').className = 'toast'; toastFn = null; if (f) f(); }

const ICONO = {
  'Comida y antojos': '🌮', 'Salidas': '🎉', 'Gasolina': '⛽', 'Carro': '🚗', 'Familia y casa': '🏠',
  'Salud y cuidado personal': '💊', 'Suscripciones y seguros': '🔁', 'Gustos y compras': '🛍️', 'Viajes': '✈️',
  'Préstamos a otros': '🤝', 'Intereses y comisiones': '🏦', 'Otros': '📦',
  'Sueldo': '💼', 'Bonos y apoyos': '🎁', 'Trabajos extra': '🧾', 'Regalos y familia': '💝', 'Rendimientos': '📈', 'Otro ingreso': '💵'
};
const icono = m => m.tipo === 'Traspaso' ? '⇄' : m.tipo === 'Ajuste' ? '⚖️' : (ICONO[m.categoria] || '•');
const ARROW_L = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const ARROW_R = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

/* ===================== Estado ===================== */
let API = LS.get('fin_api', ''), KEY = LS.get('fin_key', ''), DEMO = LS.get('fin_demo', false);
let BASE = null;      // lo último que mandó la hoja
let DATA = null;      // BASE + cambios que aún no se suben
let TAB = 'Inicio', MES = hoy().slice(0, 7), FILTRO = 'Todos', BUSCA = '';
let FORM = null;      // formulario abierto en la hoja inferior
let flushing = false, flushTimer = null;
const esDeuda = c => c.tipo === 'Crédito' || c.tipo === 'Préstamo';

/* ===================== API ===================== */
async function apiGet(action) {
  if (DEMO) return demoGet();
  const r = await fetch(API + '?action=' + action + '&k=' + encodeURIComponent(KEY), { redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error de la API');
  return j.result;
}
async function apiPost(action, args) {
  if (DEMO) return demoPost(args[0]);
  // text/plain evita la verificación previa de CORS que Apps Script no contesta
  const r = await fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ k: KEY, action: action, args: args }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error de la API');
  return j.result;
}

/* ===================== Modo de ejemplo (sin hoja) ===================== */
function demoDB() {
  let db = LS.get('fin_demo_db', null);
  if (!db) {
    const f = '2026-10-10';
    db = { cuentas: [
      { nombre: 'BBVA Débito', tipo: 'Débito', saldoCorte: 415, fechaCorte: f, diaCorte: null, diaPago: null },
      { nombre: 'Revolut', tipo: 'Ahorro', saldoCorte: 4907.75, fechaCorte: f, diaCorte: null, diaPago: null },
      { nombre: 'Mercado Pago', tipo: 'Débito', saldoCorte: 28, fechaCorte: f, diaCorte: null, diaPago: null },
      { nombre: 'Efectivo', tipo: 'Efectivo', saldoCorte: 100, fechaCorte: f, diaCorte: null, diaPago: null },
      { nombre: 'BBVA Oro', tipo: 'Crédito', saldoCorte: -35085.28, fechaCorte: f, diaCorte: null, diaPago: null },
      { nombre: 'Revolut Premium Grey', tipo: 'Crédito', saldoCorte: -11875.57, fechaCorte: f, diaCorte: null, diaPago: null },
      { nombre: 'Mercado Pago Crédito', tipo: 'Crédito', saldoCorte: -6087.24, fechaCorte: f, diaCorte: null, diaPago: null },
      { nombre: 'Préstamo Mercado Pago', tipo: 'Préstamo', saldoCorte: -3147.48, fechaCorte: f, diaCorte: null, diaPago: null }],
      categorias: [['Comida y antojos', 400], ['Salidas', 2000], ['Gasolina', 1500], ['Carro', 800], ['Familia y casa', 300],
        ['Salud y cuidado personal', 1800], ['Suscripciones y seguros', 1000], ['Gustos y compras', 700], ['Viajes', 0],
        ['Préstamos a otros', 0], ['Intereses y comisiones', 0], ['Otros', 500]].map(c => ({ nombre: c[0], tipo: 'Gasto', presupuesto: c[1], nota: '' }))
        .concat(['Sueldo', 'Bonos y apoyos', 'Trabajos extra', 'Regalos y familia', 'Rendimientos', 'Otro ingreso'].map(n => ({ nombre: n, tipo: 'Ingreso', presupuesto: null, nota: '' }))),
      movs: [] };
    LS.set('fin_demo_db', db);
  }
  return db;
}
function demoGet() { return Promise.resolve(JSON.parse(JSON.stringify(demoDB()))); }
function demoPost(ops) {
  const db = demoDB();
  const res = ops.map(op => { aplicarOp(db, op, true); return { id: op.id, ok: true }; });
  LS.set('fin_demo_db', db);
  return new Promise(r => setTimeout(() => r(res), 250));
}

/* ===================== Cambios locales y cola sin señal ===================== */
function cola() { return LS.get('fin_queue', []); }
function guardarCola(q) {
  if (!LS.set('fin_queue', q)) toast('El celular no tiene espacio para guardar esto sin señal');
  pintarSync();
}
function aplicarOp(d, op, servidor) {
  const a = op.args || [];
  if (op.action === 'guardarMov') {
    const m = Object.assign({}, a[0]);
    if (!servidor) m._pend = true; else delete m._pend;
    if (m.tipo === 'Ajuste') m.categoria = 'Sin registrar';
    const i = d.movs.findIndex(x => x.id === m.id);
    if (i >= 0) d.movs[i] = m; else d.movs.push(m);
  } else if (op.action === 'borrarMov') {
    d.movs = d.movs.filter(x => x.id !== a[0]);
  } else if (op.action === 'guardarPresupuesto') {
    const c = d.categorias.find(x => x.nombre === a[0] && x.tipo === 'Gasto');
    if (c) c.presupuesto = Math.max(0, Math.round(a[1]));
  } else if (op.action === 'guardarCuenta') {
    const c = a[0], ex = d.cuentas.find(x => x.nombre === c.nombre);
    if (ex) { ex.diaCorte = c.diaCorte || null; ex.diaPago = c.diaPago || null; }
    else d.cuentas.push({ nombre: c.nombre, tipo: c.tipo, saldoCorte: c.saldoCorte, fechaCorte: c.fechaCorte, diaCorte: c.diaCorte || null, diaPago: c.diaPago || null });
  }
}
function recalcular() {
  if (!BASE) return;
  DATA = JSON.parse(JSON.stringify(BASE));
  cola().forEach(op => aplicarOp(DATA, op, false));
}
function encolar(action, args) {
  const q = cola();
  q.push({ id: uid(), action: action, args: args });
  guardarCola(q);
  recalcular(); pintar();
  clearTimeout(flushTimer); flushTimer = setTimeout(enviar, 800);
}
async function enviar(manual) {
  const q = cola();
  if (manual === true && !q.length) { actualizar(); return; }
  if (flushing || !q.length || !(API || DEMO)) return;
  flushing = true; pintarSync();
  const errores = [];
  try {
    const res = await apiPost('batch', [q.map(op => ({ id: op.id, action: op.action, args: op.args }))]);
    const listos = new Set();
    res.forEach(r => { listos.add(r.id); if (!r.ok) errores.push(r.error || 'Error'); });
    guardarCola(cola().filter(op => !listos.has(op.id)));
    await actualizar();
  } catch (e) {
    if (/Clave/.test(e.message)) toast('La clave no coincide; revisa la conexión en Cuentas');
    clearTimeout(flushTimer); flushTimer = setTimeout(enviar, 20000);
  } finally { flushing = false; pintarSync(); }
  if (errores.length) {
    LS.set('fin_errores', LS.get('fin_errores', []).concat(errores.map(e => ({ msg: e, cuando: hoy() }))).slice(-10));
    toast('La hoja no aceptó ' + (errores.length === 1 ? 'un movimiento' : errores.length + ' movimientos') + '; revisa el aviso en Inicio');
    pintar();
  }
}
function pintarSync() {
  const n = cola().length, el = $('sync');
  if (!el) return;
  if (flushing) { el.className = 'sync'; el.textContent = 'Subiendo…'; }
  else if (n) { el.className = 'sync pend'; el.textContent = n + ' sin subir' + (navigator.onLine ? '' : ', sin señal'); }
  else if (DEMO) { el.className = 'sync'; el.textContent = 'Modo ejemplo'; }
  else { el.className = 'sync ok'; el.textContent = '✓ Al día'; }
}
async function actualizar() {
  try {
    BASE = await apiGet('data');
    LS.set('fin_base', BASE);
    recalcular(); pintar();
  } catch (e) {
    if (!DATA) {
      $('loading').innerHTML = '<div><div class="t1">No pude leer tu hoja</div><p class="muted">' + esc(e.message) +
        '</p><button class="btn" onclick="location.reload()">Reintentar</button> <button class="btn ghost" onclick="mostrarSetup()">Revisar conexión</button></div>';
    } else if (/Clave/.test(e.message)) toast('La clave no coincide; revisa la conexión en Cuentas');
  }
}

/* ===================== Cálculos ===================== */
function saldo(c) {
  let s = c.saldoCorte;
  DATA.movs.forEach(m => {
    if (m.fecha < c.fechaCorte) return;
    if (m.cuenta === c.nombre) {
      if (m.tipo === 'Ingreso' || m.tipo === 'Reembolso' || m.tipo === 'Ajuste') s += m.monto;
      else if (m.tipo === 'Gasto' || m.tipo === 'Traspaso') s -= m.monto;
    }
    if (m.tipo === 'Traspaso' && m.aCuenta === c.nombre) s += m.monto;
  });
  return r2(s);
}
function patrimonio() {
  let disp = 0, deuda = 0, deudaCorte = 0;
  DATA.cuentas.forEach(c => {
    const s = saldo(c);
    if (esDeuda(c)) { deuda += -s; deudaCorte += -c.saldoCorte; } else disp += s;
  });
  return { disp: r2(disp), deuda: r2(deuda), deudaCorte: r2(deudaCorte), neto: r2(disp - deuda) };
}
function catsGasto() { return DATA.categorias.filter(c => c.tipo === 'Gasto'); }
function catsIngreso() { return DATA.categorias.filter(c => c.tipo === 'Ingreso'); }
function resumenMes(mk) {
  const r = { ingresos: 0, gastos: 0, reembolsos: 0, ajustes: 0, cat: {}, conTarjeta: 0, pagosDeuda: 0 };
  const deudas = new Set(DATA.cuentas.filter(esDeuda).map(c => c.nombre));
  DATA.movs.forEach(m => {
    if (m.fecha.slice(0, 7) !== mk) return;
    if (m.tipo === 'Ingreso') r.ingresos += m.monto;
    else if (m.tipo === 'Ajuste') r.ajustes += m.monto;
    else if (m.tipo === 'Gasto' || m.tipo === 'Reembolso') {
      const c = r.cat[m.categoria] || (r.cat[m.categoria] = { gasto: 0, reemb: 0 });
      if (m.tipo === 'Gasto') { r.gastos += m.monto; c.gasto += m.monto; if (deudas.has(m.cuenta)) r.conTarjeta += m.monto; }
      else { r.reembolsos += m.monto; c.reemb += m.monto; }
    } else if (m.tipo === 'Traspaso' && deudas.has(m.aCuenta) && !deudas.has(m.cuenta)) r.pagosDeuda += m.monto;
  });
  r.neto = r2(r.gastos - r.reembolsos);
  r.ahorro = r2(r.ingresos - r.neto + r.ajustes);   // los ajustes negativos son dinero que salió sin registrar
  r.presupuesto = catsGasto().reduce((s, c) => s + (c.presupuesto || 0), 0);
  return r;
}
const netoCat = (r, n) => { const c = r.cat[n]; return c ? r2(c.gasto - c.reemb) : 0; };
function primerMes() {
  let mk = DATA.cuentas.reduce((a, c) => (c.fechaCorte && c.fechaCorte.slice(0, 7) < a ? c.fechaCorte.slice(0, 7) : a), hoy().slice(0, 7));
  DATA.movs.forEach(m => { if (m.fecha.slice(0, 7) < mk) mk = m.fecha.slice(0, 7); });
  return mk;
}
function proximoDia(dia) {
  // Días que faltan para el próximo "día N" del mes (si el mes es corto, usa su último día)
  const h = new Date(hoy() + 'T12:00:00');
  for (let k = 0; k < 2; k++) {
    const y = h.getFullYear(), mo = h.getMonth() + k;
    const ult = new Date(y, mo + 1, 0).getDate();
    const f = claveDia(new Date(y, mo, Math.min(dia, ult), 12));
    const d = difDias(hoy(), f);
    if (d >= 0) return d;
  }
  return null;
}

/* ===================== Arranque ===================== */
function arrancar() {
  const p = new URLSearchParams(location.search);
  if (p.get('api') && p.get('k')) {
    API = p.get('api').trim(); KEY = p.get('k').trim(); DEMO = false;
    LS.set('fin_api', API); LS.set('fin_key', KEY); LS.set('fin_demo', false);
    toast('App conectada a tu hoja ✓');
  }
  if (p.get('demo') === '1' && !API) { DEMO = true; LS.set('fin_demo', true); }
  if (p.toString()) history.replaceState(null, '', location.pathname);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const tenia = !!navigator.serviceWorker.controller;
    let recargada = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (tenia && !recargada) { recargada = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  }
  if (!(API && KEY) && !DEMO) return mostrarSetup();
  BASE = LS.get('fin_base', null);
  if (BASE) { recalcular(); pintar(); }
  actualizar(); enviar();
  window.addEventListener('online', () => { pintarSync(); enviar(); });
  window.addEventListener('offline', pintarSync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { enviar(); actualizar(); } });
  setInterval(enviar, 30000);
}
function mostrarSetup() {
  $('loading').classList.add('hide'); $('view').innerHTML = ''; $('nav').classList.add('hide');
  $('setup').classList.remove('hide');
  $('cfgApi').value = API || ''; $('cfgKey').value = KEY || '';
}
function guardarConfig() {
  const a = $('cfgApi').value.trim(), k = $('cfgKey').value.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(a) || !k) return toast('Revisa la URL y la clave');
  if (DEMO) { LS.del('fin_queue'); LS.del('fin_base'); }
  LS.set('fin_api', a); LS.set('fin_key', k); LS.set('fin_demo', false);
  location.reload();
}
function modoDemo() { LS.set('fin_demo', true); LS.del('fin_base'); location.reload(); }
function salirDemo() {
  LS.del('fin_demo'); LS.del('fin_demo_db'); LS.del('fin_queue'); LS.del('fin_base'); LS.del('fin_api'); LS.del('fin_key');
  location.reload();
}

/* ===================== Pintar ===================== */
function irA(t) { TAB = t; if (t !== 'Movimientos') FILTRO = 'Todos'; pintar(); window.scrollTo(0, 0); }
function pintar() {
  if (!DATA) return;
  $('loading').classList.add('hide'); $('setup').classList.add('hide'); $('nav').classList.remove('hide');
  document.querySelectorAll('nav.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === TAB));
  $('titulo').textContent = TAB === 'Inicio' ? 'Finanzas' : TAB;
  $('view').innerHTML = TAB === 'Inicio' ? vistaInicio() : TAB === 'Movimientos' ? vistaMovs() : TAB === 'Presupuesto' ? vistaPresupuesto() : vistaCuentas();
  pintarSync();
  if (FORM) pintarHoja();
}

function avisos(r, mk) {
  let h = '';
  const err = LS.get('fin_errores', []);
  if (err.length) h += '<div class="note red"><b>La hoja no aceptó ' + (err.length === 1 ? 'un movimiento' : err.length + ' movimientos') + '.</b> ' +
    esc(err.slice(-2).map(e => e.msg).join('; ')) + '. Quedó fuera de la hoja; vuelve a registrarlo. ' +
    '<button class="btn sm ghost" style="margin-top:6px" onclick="LS.del(\'fin_errores\');pintar()">Entendido</button></div>';
  // Tarjetas con pago cerca
  DATA.cuentas.filter(c => esDeuda(c) && c.diaPago).forEach(c => {
    const d = proximoDia(c.diaPago), s = saldo(c);
    if (d !== null && d <= 5 && s < 0) h += '<div class="note red"><b>' + esc(c.nombre) + ':</b> fecha de pago ' + (d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días') + '. Debes ' + money(-s) + '.</div>';
  });
  // Categorías pasadas o cerca del límite
  const pasadas = [], cerca = [];
  catsGasto().forEach(c => {
    const n = netoCat(r, c.nombre), p = c.presupuesto || 0;
    if (n > 0 && n > p) pasadas.push(c.nombre + ' (' + money(n - p, true) + ' de más)');
    else if (p > 0 && n >= p * 0.8) cerca.push(c.nombre);
  });
  if (pasadas.length) h += '<div class="note red"><b>Te pasaste en:</b> ' + esc(pasadas.join(', ')) + '.</div>';
  if (cerca.length) h += '<div class="note"><b>Cerca del límite:</b> ' + esc(cerca.join(', ')) + '.</div>';
  // Recordatorio de registrar
  const ult = DATA.movs.reduce((a, m) => (m.fecha > a ? m.fecha : a), DATA.cuentas.reduce((a, c) => (c.fechaCorte > a ? c.fechaCorte : a), ''));
  const sin = ult ? difDias(ult, hoy()) : 0;
  if (sin >= 3) h += '<div class="note">Llevas ' + sin + ' días sin registrar nada. Si gastaste algo, anótalo ahora; si no te acuerdas, usa <b>Cuadrar</b> en Cuentas.</div>';
  return h;
}

function vistaInicio() {
  const mk = hoy().slice(0, 7), r = resumenMes(mk), p = patrimonio();
  const queda = r2(r.presupuesto - r.neto), dia = +hoy().slice(8, 10), dias = diasDelMes(mk);
  const pct = r.presupuesto > 0 ? Math.min(100, r.neto / r.presupuesto * 100) : 0;
  const ritmo = r.presupuesto * dia / dias;
  const cls = r.neto > r.presupuesto ? 'over' : r.neto > ritmo ? 'warn' : '';
  let h = '<div class="hero">' +
    '<div class="lbl">Te quedan para gastar en ' + MESES[+mk.slice(5, 7) - 1] + '</div>' +
    '<div class="big' + (queda < 0 ? ' neg' : '') + '">' + money(queda, true) + '</div>' +
    '<div class="of">Llevas ' + money(r.neto, true) + ' de ' + money(r.presupuesto, true) + '. ' +
      (r.neto > ritmo ? 'Vas más rápido que el ritmo del mes.' : 'Vas dentro del ritmo del mes.') + '</div>' +
    '<div class="meter"><div class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></div><i class="today" style="left:' + (dia / dias * 100).toFixed(1) + '%"></i></div>' +
    '<div class="legend"><span>Día ' + dia + ' de ' + dias + '</span><span>Ritmo de hoy: ' + money(ritmo, true) + '</span></div></div>';
  h += avisos(r, mk);

  // Deuda
  const bajo = r2(p.deudaCorte - p.deuda);
  const deudas = DATA.cuentas.filter(esDeuda).map(c => ({ c: c, s: -saldo(c) })).sort((a, b) => b.s - a.s);
  const max = Math.max(1, ...deudas.map(d => d.s));
  h += '<div class="card"><div class="debt-head"><span class="t1">Deuda total</span><span class="amt red">' + money(p.deuda) + '</span></div>' +
    '<div class="muted" style="margin-top:4px">' + (bajo > 0 ? 'Has bajado ' + money(bajo) + ' desde el corte.' : bajo < 0 ? 'Subió ' + money(-bajo) + ' desde el corte.' : 'Sin cambios desde el corte del ' + fechaCorta(DATA.cuentas[0] ? DATA.cuentas[0].fechaCorte : hoy()) + '.') + '</div>' +
    '<div class="meter" style="height:8px"><div style="width:' + (p.deudaCorte > 0 ? Math.max(0, Math.min(100, bajo / p.deudaCorte * 100)) : 0).toFixed(1) + '%"></div></div>' +
    '<div class="debt-list">' + deudas.map(d => '<div class="debt-item"><span>' + esc(d.c.nombre) + '</span><span class="num">' + money(d.s) + '</span>' +
      '<div class="bar"><div style="width:' + Math.max(0, d.s / max * 100).toFixed(1) + '%"></div></div></div>').join('') + '</div>' +
    '<div class="muted" style="margin-top:12px">Este mes: cargaste ' + money(r.conTarjeta) + ' a crédito y abonaste ' + money(r.pagosDeuda) + '.</div></div>';

  h += '<div class="grid2">' +
    '<div class="stat"><div class="muted">Disponible</div><div class="amt sm">' + money(p.disp) + '</div></div>' +
    '<div class="stat"><div class="muted">Patrimonio neto</div><div class="amt sm' + (p.neto < 0 ? ' red' : '') + '">' + money(p.neto) + '</div></div>' +
    '<div class="stat"><div class="muted">Ingresos del mes</div><div class="amt sm">' + money(r.ingresos) + '</div></div>' +
    '<div class="stat"><div class="muted">Ahorro del mes</div><div class="amt sm' + (r.ahorro < 0 ? ' red' : ' green') + '">' + money(r.ahorro) + '</div></div></div>';

  const ult = DATA.movs.slice().sort(ordenMov).slice(0, 6);
  h += '<h2>Últimos movimientos' + (ult.length ? '<button class="more" onclick="MES=hoy().slice(0,7);irA(\'Movimientos\')">Ver todos</button>' : '') + '</h2>';
  h += ult.length ? '<div class="list">' + ult.map(filaMov).join('') + '</div>'
    : '<div class="list"><div class="empty">Aún no registras nada desde el corte.<br>Toca <b>+</b> cada vez que gastes o te paguen.</div></div>';
  return h;
}

function ordenMov(a, b) { return a.fecha === b.fecha ? (b.registrado || 0) - (a.registrado || 0) : (a.fecha < b.fecha ? 1 : -1); }
function filaMov(m) {
  let d2, cls = '', signo = '-';
  if (m.tipo === 'Traspaso') { d2 = m.cuenta + ' → ' + m.aCuenta; cls = ' tr'; signo = ''; }
  else if (m.tipo === 'Ajuste') { d2 = 'Sin registrar, ' + m.cuenta; cls = ' tr'; signo = m.monto > 0 ? '+' : '-'; }
  else { d2 = m.categoria + ', ' + m.cuenta; if (m.tipo !== 'Gasto') { cls = ' in'; signo = '+'; } }
  const t1 = m.desc || (m.tipo === 'Traspaso' ? 'Traspaso' : m.tipo === 'Ajuste' ? 'Ajuste' : m.categoria);
  return '<button class="mv" onclick="editarMov(\'' + jsq(m.id) + '\')"><span class="ic">' + icono(m) + '</span>' +
    '<span class="tx"><div class="d1">' + esc(t1) + (m._pend ? '<i class="pend" title="Sin subir"></i>' : '') + '</div><div class="d2">' +
    (m.tipo === 'Reembolso' ? 'Reembolso: ' : '') + esc(d2) + '</div></span>' +
    '<span class="m' + cls + '">' + signo + money(Math.abs(m.monto)) + '</span></button>';
}

function barraMes() {
  const ini = primerMes(), fin = hoy().slice(0, 7);
  return '<div class="monthbar"><button class="arrow" aria-label="Mes anterior" ' + (MES <= ini ? 'disabled' : '') + ' onclick="MES=mesSig(MES,-1);pintar()">' + ARROW_L + '</button>' +
    '<span class="nm">' + nombreMes(MES) + '</span>' +
    '<button class="arrow" aria-label="Mes siguiente" ' + (MES >= fin ? 'disabled' : '') + ' onclick="MES=mesSig(MES,1);pintar()">' + ARROW_R + '</button></div>';
}

function vistaMovs() {
  const tipos = { 'Todos': null, 'Gastos': 'Gasto', 'Ingresos': 'Ingreso', 'Traspasos': 'Traspaso', 'Reembolsos': 'Reembolso', 'Ajustes': 'Ajuste' };
  const q = BUSCA.trim().toLowerCase();
  const lista = DATA.movs.filter(m => m.fecha.slice(0, 7) === MES && (!tipos[FILTRO] || m.tipo === tipos[FILTRO]) &&
    (!q || (m.desc + ' ' + m.categoria + ' ' + m.cuenta + ' ' + m.aCuenta).toLowerCase().includes(q))).sort(ordenMov);
  let h = barraMes() +
    '<input class="search" type="search" placeholder="Buscar (Oxxo, gasolina, BBVA…)" value="' + esc(BUSCA) + '" oninput="BUSCA=this.value;pintarLista()">' +
    '<div class="chips" style="margin-bottom:4px">' + Object.keys(tipos).map(t => '<button class="chip' + (FILTRO === t ? ' on' : '') + '" onclick="FILTRO=\'' + t + '\';pintar()">' + t + '</button>').join('') + '</div>' +
    '<div id="lista">' + listaPorDia(lista) + '</div>';
  return h;
}
function pintarLista() {
  const v = $('lista'); if (!v) return;
  const tmp = document.createElement('div'); tmp.innerHTML = vistaMovs();
  v.innerHTML = tmp.querySelector('#lista').innerHTML;
}
function listaPorDia(lista) {
  if (!lista.length) return '<div class="list" style="margin-top:12px"><div class="empty">' + (BUSCA || FILTRO !== 'Todos' ? 'Nada coincide con el filtro.' : 'Sin movimientos en ' + nombreMes(MES) + '.') + '</div></div>';
  const dias = {};
  lista.forEach(m => (dias[m.fecha] = dias[m.fecha] || []).push(m));
  return Object.keys(dias).sort().reverse().map(f => {
    const g = dias[f].filter(m => m.tipo === 'Gasto').reduce((s, m) => s + m.monto, 0);
    return '<div class="day"><span>' + fechaLarga(f) + '</span><span class="num">' + (g ? 'Gastaste ' + money(g) : '') + '</span></div>' +
      '<div class="list">' + dias[f].map(filaMov).join('') + '</div>';
  }).join('');
}

function vistaPresupuesto() {
  const r = resumenMes(MES), queda = r2(r.presupuesto - r.neto);
  let h = barraMes();
  h += '<div class="grid2" style="margin-bottom:12px">' +
    '<div class="stat"><div class="muted">Gasto neto</div><div class="amt sm">' + money(r.neto) + '</div></div>' +
    '<div class="stat"><div class="muted">Te queda</div><div class="amt sm' + (queda < 0 ? ' red' : '') + '">' + money(queda) + '</div></div>' +
    '<div class="stat"><div class="muted">Ingresos</div><div class="amt sm">' + money(r.ingresos) + '</div></div>' +
    '<div class="stat"><div class="muted">Ahorro</div><div class="amt sm' + (r.ahorro < 0 ? ' red' : ' green') + '">' + money(r.ahorro) + '</div></div></div>';
  if (r.ajustes) h += '<div class="note">Este mes hubo ' + money(Math.abs(r.ajustes)) + ' en ajustes al cuadrar cuentas: dinero que ' + (r.ajustes < 0 ? 'salió' : 'entró') + ' sin registrarse. Ya está descontado del ahorro.</div>';
  const cats = catsGasto().map(c => ({ c: c, n: netoCat(r, c.nombre), p: c.presupuesto || 0 }))
    .sort((a, b) => (b.p ? b.n / b.p : b.n ? 99 : -1) - (a.p ? a.n / a.p : a.n ? 99 : -1));
  h += '<div class="list">' + cats.map(x => {
    const pct = x.p > 0 ? x.n / x.p * 100 : (x.n > 0 ? 100 : 0);
    const cls = x.n > x.p ? 'over' : pct >= 80 ? 'warn' : '';
    const resto = r2(x.p - x.n);
    return '<button class="cat" onclick="abrirCategoria(\'' + jsq(x.c.nombre) + '\')"><div class="top2"><span class="nm">' + (ICONO[x.c.nombre] || '') + ' ' + esc(x.c.nombre) + '</span>' +
      '<span class="num t1">' + money(x.n, true) + '</span></div>' +
      '<div class="meter"><div class="' + cls + '" style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
      '<div class="sub"><span>' + (x.p ? 'de ' + money(x.p, true) : 'Sin presupuesto') + '</span><span class="' + (resto < 0 ? 'red' : '') + '">' +
      (resto < 0 ? money(-resto, true) + ' de más' : x.p ? 'quedan ' + money(resto, true) : '') + '</span></div></button>';
  }).join('') + '</div>';
  h += '<p class="hint">Toca una categoría para ver sus movimientos o cambiar su presupuesto. El gasto neto ya descuenta los reembolsos.</p>';
  return h;
}

function vistaCuentas() {
  const p = patrimonio();
  const fila = c => {
    const s = saldo(c), deuda = esDeuda(c), n = jsq(c.nombre);
    let extra = '';
    if (deuda && (c.diaCorte || c.diaPago)) extra = '<div class="muted">' + (c.diaCorte ? 'Corte el día ' + c.diaCorte : '') + (c.diaCorte && c.diaPago ? ', ' : '') + (c.diaPago ? 'pago el día ' + c.diaPago : '') + '</div>';
    return '<div class="acc"><div class="tx"><div class="row between"><span class="t1">' + esc(c.nombre) + '</span>' +
      '<span class="amt sm' + (deuda && s < 0 ? ' red' : '') + '">' + money(deuda ? -s : s) + '</span></div>' +
      '<div class="muted">' + esc(c.tipo) + (deuda ? (s <= 0 ? ', lo que debes' : ', saldo a favor') : '') + '</div>' + extra +
      '<div class="actions">' +
      (deuda ? '<button class="btn sm" onclick="abrirRegistro({tipo:\'Traspaso\',aCuenta:\'' + n + '\'})">Pagar</button>' : '') +
      '<button class="btn sm ghost" onclick="abrirCuadrar(\'' + n + '\')">Cuadrar</button>' +
      (deuda ? '<button class="btn sm ghost" onclick="abrirDias(\'' + n + '\')">Fechas</button>' :
        '<button class="btn sm ghost" onclick="abrirRegistro({tipo:\'Traspaso\',cuenta:\'' + n + '\'})">Mover</button>') +
      '</div></div></div>';
  };
  let h = '<div class="grid2" style="margin:6px 0 4px">' +
    '<div class="stat"><div class="muted">Disponible</div><div class="amt sm">' + money(p.disp) + '</div></div>' +
    '<div class="stat"><div class="muted">Deuda</div><div class="amt sm red">' + money(p.deuda) + '</div></div></div>';
  h += '<h2>Tu dinero</h2><div class="list">' + DATA.cuentas.filter(c => !esDeuda(c)).map(fila).join('') + '</div>';
  h += '<h2>Lo que debes</h2><div class="list">' + DATA.cuentas.filter(esDeuda).map(fila).join('') + '</div>';
  h += '<p class="hint">Cuadrar: escribe el saldo que ves en la app del banco y la diferencia se registra como ajuste. Hazlo cada domingo.</p>';
  h += '<button class="btn ghost block" style="margin-top:12px" onclick="abrirNuevaCuenta()">Agregar cuenta o tarjeta</button>';
  h += '<h2>Conexión</h2><div class="card flat"><div class="muted">' + (DEMO ? 'Estás en modo ejemplo: nada se guarda en tu hoja.' :
    'Conectada a ' + esc(BASE && BASE.hoja ? BASE.hoja : 'tu hoja de Google') + '.') + '</div>' +
    '<div class="actions" style="display:flex;gap:6px;margin-top:10px">' +
    (DEMO ? '<button class="btn sm" onclick="salirDemo()">Salir del modo ejemplo</button>' : '<button class="btn sm ghost" onclick="enviar(true)">Actualizar ahora</button>') +
    '<button class="btn sm ghost" onclick="mostrarSetup()">Cambiar conexión</button></div></div>';
  return h;
}

/* ===================== Hoja inferior ===================== */
function abrirHoja() {
  const s = $('sheet'), sc = $('scrim');
  s.classList.remove('hide'); sc.classList.remove('hide');
  requestAnimationFrame(() => { s.classList.add('show'); sc.classList.add('show'); });
  document.body.style.overflow = 'hidden';
}
function cerrarHoja() {
  FORM = null;
  const s = $('sheet'), sc = $('scrim');
  s.classList.remove('show'); sc.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => { if (!FORM) { s.classList.add('hide'); sc.classList.add('hide'); s.innerHTML = ''; } }, 260);
}
function pintarHoja() {
  if (!FORM) return;
  const f = { mov: hojaMov, cat: hojaCategoria, cuadrar: hojaCuadrar, dias: hojaDias, cuenta: hojaNuevaCuenta }[FORM.vista];
  const foco = document.activeElement && document.activeElement.id;
  $('sheet').innerHTML = '<div class="grab"></div>' + f();
  if (foco && $(foco) && foco !== 'fMonto') $(foco).focus();
}

/* ---- Registrar / editar movimiento ---- */
const ULT = (k, d) => LS.get('fin_ult_' + k, d);
function abrirRegistro(o) {
  o = o || {};
  const tipo = o.tipo || 'Gasto';
  FORM = { vista: 'mov', id: null, tipo: tipo, monto: '', cuenta: o.cuenta || null, aCuenta: o.aCuenta || null, categoria: null, desc: '', fecha: hoy(), err: '' };
  autocompletar();
  abrirHoja(); pintarHoja();
  setTimeout(() => { const m = $('fMonto'); if (m) m.focus(); }, 280);
}
function editarMov(id) {
  const m = DATA.movs.find(x => x.id === id);
  if (!m) return;
  FORM = { vista: 'mov', id: m.id, tipo: m.tipo, monto: String(m.monto), cuenta: m.cuenta, aCuenta: m.aCuenta || null, categoria: m.categoria || null,
           desc: m.desc || '', fecha: m.fecha, registrado: m.registrado || null, err: '' };
  abrirHoja(); pintarHoja();
}
function cuentasPara(tipo, rol) {
  const cs = DATA.cuentas;
  if (tipo === 'Gasto') return cs.filter(c => c.tipo !== 'Préstamo');
  if (tipo === 'Ingreso' || tipo === 'Reembolso') return cs.filter(c => !esDeuda(c));
  if (tipo === 'Traspaso') return rol === 'a' ? cs.filter(c => c.nombre !== FORM.cuenta) : cs.filter(c => c.tipo !== 'Préstamo');
  return cs;
}
function autocompletar() {
  const t = FORM.tipo;
  const valida = (n, rol) => n && cuentasPara(t, rol).some(c => c.nombre === n);
  if (!valida(FORM.cuenta)) FORM.cuenta = valida(ULT('cuenta_' + t)) ? ULT('cuenta_' + t) : (t === 'Traspaso' && FORM.aCuenta ? (DATA.cuentas.find(c => !esDeuda(c) && c.nombre !== FORM.aCuenta) || {}).nombre : null);
  if (t === 'Traspaso' && FORM.aCuenta === FORM.cuenta) FORM.aCuenta = null;
  const cats = t === 'Ingreso' ? catsIngreso() : catsGasto();
  if (t === 'Traspaso' || !cats.some(c => c.nombre === FORM.categoria)) FORM.categoria = t === 'Ingreso' ? ULT('cat_Ingreso', null) : null;
}
function setForm(k, v) {
  FORM[k] = v; FORM.err = '';
  if (k === 'tipo' && FORM.vista === 'mov') autocompletar();
  if (k === 'cuenta' && FORM.aCuenta === v) FORM.aCuenta = null;
  pintarHoja();
}
function hojaMov() {
  const t = FORM.tipo, ed = !!FORM.id;
  const tipos = ['Gasto', 'Ingreso', 'Traspaso', 'Reembolso'];
  const chipsCuenta = (lista, campo) => '<div class="pick">' + lista.map(c => '<button class="' + (esDeuda(c) ? 'debtacc' : '') + (FORM[campo] === c.nombre ? ' on' : '') +
    '" onclick="setForm(\'' + campo + '\',\'' + jsq(c.nombre) + '\')">' + esc(c.nombre) + '</button>').join('') + '</div>';
  let h = '<h3>' + (ed ? 'Editar movimiento' : 'Registrar') + '</h3>';
  if (t === 'Ajuste') h += '<div class="note">Este ajuste se creó al cuadrar ' + esc(FORM.cuenta) + '. Puedes corregir el monto o eliminarlo.</div>';
  else h += '<div class="seg">' + tipos.map(x => '<button class="' + (t === x ? 'on' : '') + '" onclick="setForm(\'tipo\',\'' + x + '\')">' + x + '</button>').join('') + '</div>';
  h += '<label class="amount"><span>$</span><input id="fMonto" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + esc(FORM.monto) +
    '" oninput="FORM.monto=this.value" onkeydown="if(event.key===\'Enter\')this.blur()" aria-label="Monto"></label>';
  if (t === 'Traspaso') {
    h += '<div class="fl">De</div>' + chipsCuenta(cuentasPara(t, 'de'), 'cuenta');
    h += '<div class="fl">A</div>' + chipsCuenta(cuentasPara(t, 'a'), 'aCuenta');
    h += '<p class="hint">Para pagar una tarjeta o el préstamo, pasar dinero entre cuentas o sacar efectivo. No cuenta como gasto.</p>';
  } else if (t !== 'Ajuste') {
    h += '<div class="fl">' + (t === 'Gasto' ? '¿Con qué pagaste?' : '¿A dónde llegó?') + '</div>' + chipsCuenta(cuentasPara(t), 'cuenta');
    const cats = t === 'Ingreso' ? catsIngreso() : catsGasto();
    h += '<div class="fl">' + (t === 'Ingreso' ? '¿De dónde viene?' : t === 'Reembolso' ? '¿Qué gasto te devolvieron?' : '¿En qué?') + '</div>';
    h += '<div class="pick">' + cats.map(c => '<button class="' + (FORM.categoria === c.nombre ? 'on' : '') + '" onclick="setForm(\'categoria\',\'' + jsq(c.nombre) + '\')">' +
      (ICONO[c.nombre] || '') + ' ' + esc(c.nombre) + '</button>').join('') + '</div>';
    if (t === 'Reembolso') h += '<p class="hint">Cuando alguien te paga su parte de algo que tú pagaste. Resta del gasto de esa categoría en vez de contar como ingreso.</p>';
  }
  const ph = { Gasto: 'Ej. Oxxo, gasolina Pemex', Ingreso: 'Ej. Quincena', Traspaso: 'Ej. Pago tarjeta', Reembolso: 'Ej. Aaron me pagó la pizza', Ajuste: '' }[t];
  h += '<div class="fl">Descripción</div><input id="fDesc" class="inp" maxlength="200" placeholder="' + ph + '" value="' + esc(FORM.desc) + '" oninput="FORM.desc=this.value">';
  const ayer = sumarDias(hoy(), -1);
  h += '<div class="fl">Fecha</div><div class="datewrap pick">' +
    '<button class="' + (FORM.fecha === hoy() ? 'on' : '') + '" onclick="setForm(\'fecha\',hoy())">Hoy</button>' +
    '<button class="' + (FORM.fecha === ayer ? 'on' : '') + '" onclick="setForm(\'fecha\',\'' + ayer + '\')">Ayer</button>' +
    '<input type="date" id="fFecha" value="' + FORM.fecha + '" max="' + hoy() + '" onchange="if(this.value)setForm(\'fecha\',this.value)" aria-label="Otra fecha"></div>';
  const corte = minCorte();
  if (FORM.fecha < corte) h += '<p class="hint red">Esa fecha es anterior al corte (' + fechaCorta(corte) + '). Ese dinero ya está dentro de los saldos del corte, así que no cambiará ningún saldo.</p>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px">' + esc(FORM.err) + '</div>';
  h += '<div class="actbar">' + (ed ? '<button class="btn danger" onclick="borrarMovForm()">Eliminar</button>' : '<button class="btn ghost" onclick="cerrarHoja()">Cancelar</button>') +
    '<button class="btn" onclick="guardarMovForm()">' + (ed ? 'Guardar cambios' : 'Guardar') + '</button></div>';
  return h;
}
function minCorte() { return DATA.cuentas.reduce((a, c) => (!a || c.fechaCorte < a ? c.fechaCorte : a), ''); }
function guardarMovForm() {
  const t = FORM.tipo, monto = parseMonto($('fMonto') ? $('fMonto').value : FORM.monto);
  FORM.monto = $('fMonto') ? $('fMonto').value : FORM.monto;
  FORM.desc = $('fDesc') ? $('fDesc').value.trim() : FORM.desc;
  const falta = t === 'Ajuste' ? (monto === 0 ? 'Escribe el monto.' : '')
    : monto <= 0 ? 'Escribe cuánto fue.'
    : !FORM.cuenta ? (t === 'Gasto' ? 'Elige con qué pagaste.' : t === 'Traspaso' ? 'Elige de qué cuenta sale.' : 'Elige a qué cuenta llegó.')
    : t === 'Traspaso' && !FORM.aCuenta ? 'Elige a qué cuenta va.'
    : t !== 'Traspaso' && !FORM.categoria ? 'Elige una categoría.' : '';
  if (falta) { FORM.err = falta; pintarHoja(); return; }
  const nuevo = !FORM.id;
  const m = { id: FORM.id || uid(), fecha: FORM.fecha, tipo: t, monto: monto, cuenta: FORM.cuenta, aCuenta: t === 'Traspaso' ? FORM.aCuenta : '',
              categoria: t === 'Traspaso' ? '' : FORM.categoria, desc: FORM.desc, registrado: FORM.registrado || Date.now() };
  LS.set('fin_ult_cuenta_' + t, m.cuenta);
  if (t === 'Ingreso') LS.set('fin_ult_cat_Ingreso', m.categoria);
  encolar('guardarMov', [m]);
  cerrarHoja();
  toast(nuevo ? (t === 'Gasto' ? 'Gasto guardado' : t + ' guardado') : 'Cambios guardados', nuevo ? { txt: 'Deshacer', fn: () => encolar('borrarMov', [m.id]) } : null);
}
function borrarMovForm() {
  const m = DATA.movs.find(x => x.id === FORM.id);
  if (!m) return cerrarHoja();
  const copia = Object.assign({}, m); delete copia._pend;
  encolar('borrarMov', [m.id]);
  cerrarHoja();
  toast('Movimiento eliminado', { txt: 'Deshacer', fn: () => encolar('guardarMov', [copia]) });
}

/* ---- Categoría: movimientos y presupuesto ---- */
function abrirCategoria(n) { FORM = { vista: 'cat', nombre: n }; abrirHoja(); pintarHoja(); }
function hojaCategoria() {
  const c = DATA.categorias.find(x => x.nombre === FORM.nombre && x.tipo === 'Gasto');
  const movs = DATA.movs.filter(m => m.categoria === FORM.nombre && m.fecha.slice(0, 7) === MES && (m.tipo === 'Gasto' || m.tipo === 'Reembolso')).sort(ordenMov);
  let h = '<h3>' + (ICONO[c.nombre] || '') + ' ' + esc(c.nombre) + '</h3>';
  if (c.nota) h += '<p class="hint" style="margin-top:-6px;margin-bottom:10px">' + esc(c.nota) + '</p>';
  h += '<div class="fl">Presupuesto mensual</div><div class="row"><label class="amount" style="flex:1;margin:0;padding:4px 14px"><span style="font-size:24px">$</span>' +
    '<input id="fPres" inputmode="numeric" style="font-size:28px" value="' + (c.presupuesto || 0) + '" aria-label="Presupuesto mensual"></label>' +
    '<button class="btn" onclick="guardarPres()">Guardar</button></div>';
  h += '<div class="fl" style="margin-top:18px">En ' + nombreMes(MES) + '</div>';
  h += movs.length ? '<div class="list">' + movs.map(filaMov).join('') + '</div>' : '<div class="list"><div class="empty">Sin movimientos este mes.</div></div>';
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button></div>';
  return h;
}
function guardarPres() {
  const v = Math.round(parseMonto($('fPres').value));
  const n = FORM.nombre;
  encolar('guardarPresupuesto', [n, v]);
  cerrarHoja(); toast('Presupuesto de ' + n + ' guardado');
}

/* ---- Cuadrar una cuenta con el saldo real ---- */
function abrirCuadrar(n) { FORM = { vista: 'cuadrar', nombre: n }; abrirHoja(); pintarHoja(); setTimeout(() => { const i = $('fReal'); if (i) i.focus(); }, 280); }
function hojaCuadrar() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre), s = saldo(c), deuda = esDeuda(c);
  let h = '<h3>Cuadrar ' + esc(c.nombre) + '</h3>';
  h += '<div class="card flat"><div class="muted">' + (deuda ? 'Lo que debes según la app' : 'Saldo según la app') + '</div><div class="amt">' + money(deuda ? -s : s) + '</div></div>';
  h += '<div class="fl">' + (deuda ? '¿Cuánto debes según tu banco? (saldo usado)' : '¿Cuánto tienes según tu banco?') + '</div>';
  h += '<label class="amount"><span>$</span><input id="fReal" inputmode="decimal" placeholder="0.00" oninput="difCuadrar()" aria-label="Saldo real"></label>';
  h += '<div id="difC" class="hint">La diferencia se registra como ajuste "Sin registrar" con fecha de hoy.</div>';
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cancelar</button><button class="btn" onclick="guardarCuadre()">Cuadrar</button></div>';
  return h;
}
function difCuadre() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre), s = saldo(c), v = $('fReal').value;
  if (v.trim() === '') return null;
  const real = parseMonto(v);
  return r2((esDeuda(c) ? -real : real) - s);
}
function difCuadrar() {
  const d = difCuadre(), el = $('difC'), c = DATA.cuentas.find(x => x.nombre === FORM.nombre);
  if (d === null) { el.textContent = 'La diferencia se registra como ajuste "Sin registrar" con fecha de hoy.'; return; }
  if (d === 0) { el.innerHTML = '<b class="green">Cuadra exacto.</b> No hay nada que ajustar.'; return; }
  const txt = esDeuda(c) ? (d < 0 ? 'Debes ' + money(-d) + ' más de lo registrado: hubo cargos que no anotaste.' : 'Debes ' + money(d) + ' menos de lo registrado.')
    : (d < 0 ? 'Faltan ' + money(-d) + ': salió dinero que no anotaste.' : 'Sobran ' + money(d) + ': entró dinero que no anotaste.');
  el.innerHTML = '<b class="' + (d < 0 ? 'red' : 'green') + '">' + txt + '</b> Si te acuerdas en qué fue, mejor regístralo como gasto o ingreso; si no, se guarda como ajuste.';
}
function guardarCuadre() {
  const d = difCuadre();
  if (d === null) return toast('Escribe el saldo que ves en tu banco');
  if (d === 0) { cerrarHoja(); return toast('Cuadra exacto ✓'); }
  const nombre = FORM.nombre;
  const m = { id: uid(), fecha: hoy(), tipo: 'Ajuste', monto: d, cuenta: nombre, aCuenta: '', categoria: 'Sin registrar', desc: 'Ajuste al cuadrar', registrado: Date.now() };
  encolar('guardarMov', [m]);
  cerrarHoja(); toast(nombre + ' cuadrada', { txt: 'Deshacer', fn: () => encolar('borrarMov', [m.id]) });
}

/* ---- Fechas de corte y pago de una tarjeta ---- */
function abrirDias(n) { FORM = { vista: 'dias', nombre: n }; abrirHoja(); pintarHoja(); }
function hojaDias() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre);
  return '<h3>Fechas de ' + esc(c.nombre) + '</h3>' +
    '<p class="hint" style="margin-top:-4px">Con la fecha de pago, Inicio te avisa 5 días antes. Pagar el total antes de esa fecha evita intereses.</p>' +
    '<div class="grid2" style="margin-top:12px"><div><div class="fl">Día de corte</div><input id="fCorte" class="inp" inputmode="numeric" placeholder="Ej. 9" value="' + (c.diaCorte || '') + '"></div>' +
    '<div><div class="fl">Día límite de pago</div><input id="fPago" class="inp" inputmode="numeric" placeholder="Ej. 29" value="' + (c.diaPago || '') + '"></div></div>' +
    '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cancelar</button><button class="btn" onclick="guardarDias()">Guardar fechas</button></div>';
}
function guardarDias() {
  const dia = v => { const n = parseInt(v, 10); return n >= 1 && n <= 31 ? n : null; };
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre);
  encolar('guardarCuenta', [{ nombre: c.nombre, diaCorte: dia($('fCorte').value), diaPago: dia($('fPago').value) }]);
  cerrarHoja(); toast('Fechas guardadas');
}

/* ---- Cuenta nueva ---- */
function abrirNuevaCuenta() { FORM = { vista: 'cuenta', tipo: 'Débito', nombre: '', saldo: '' }; abrirHoja(); pintarHoja(); }
function hojaNuevaCuenta() {
  const tipos = ['Débito', 'Ahorro', 'Efectivo', 'Crédito', 'Préstamo'], deuda = FORM.tipo === 'Crédito' || FORM.tipo === 'Préstamo';
  return '<h3>Agregar cuenta o tarjeta</h3>' +
    '<div class="fl">Nombre</div><input id="fNom" class="inp" maxlength="40" placeholder="Ej. Nu, Tarjeta Liverpool" value="' + esc(FORM.nombre) + '" oninput="FORM.nombre=this.value">' +
    '<div class="fl">Tipo</div><div class="pick">' + tipos.map(t => '<button class="' + (FORM.tipo === t ? 'on' : '') + '" onclick="setForm(\'tipo\',\'' + t + '\')">' + t + '</button>').join('') + '</div>' +
    '<div class="fl">' + (deuda ? '¿Cuánto debes hoy?' : '¿Cuánto tiene hoy?') + '</div>' +
    '<label class="amount"><span>$</span><input id="fSal" inputmode="decimal" placeholder="0.00" value="' + esc(FORM.saldo) + '" oninput="FORM.saldo=this.value" aria-label="Saldo de hoy"></label>' +
    (FORM.err ? '<div class="note red">' + esc(FORM.err) + '</div>' : '') +
    '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cancelar</button><button class="btn" onclick="guardarNuevaCuenta()">Agregar</button></div>';
}
function guardarNuevaCuenta() {
  const nombre = $('fNom').value.trim(), s = parseMonto($('fSal').value), deuda = FORM.tipo === 'Crédito' || FORM.tipo === 'Préstamo';
  if (!nombre) { FORM.err = 'Ponle nombre a la cuenta.'; return pintarHoja(); }
  if (DATA.cuentas.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) { FORM.err = 'Ya tienes una cuenta con ese nombre.'; return pintarHoja(); }
  encolar('guardarCuenta', [{ nombre: nombre, tipo: FORM.tipo, saldoCorte: deuda ? -Math.abs(s) : s, fechaCorte: hoy(), diaCorte: null, diaPago: null }]);
  cerrarHoja(); toast(nombre + ' agregada');
}

arrancar();
