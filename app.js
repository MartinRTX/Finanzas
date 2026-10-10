/* Finanzas v2.0 – app instalable de Martin.
 * Lee y escribe la hoja "Mis finanzas 2026" a través de Apps Script (la "API").
 * Lo que registras se guarda primero en el celular y se sube en cuanto hay señal.
 * Pestañas de la hoja: Registro, Cuentas, Categorías, Personas, Fijos y Config.
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
function jsq(s) { return esc(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
const r2 = n => Math.round(n * 100) / 100;
const FMT2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });
function money(n, sinCentavos) { const v = r2(n || 0); return (v < 0 ? '-' : '') + (sinCentavos ? FMT0 : FMT2).format(Math.abs(v)).replace('MX', ''); }

// Convierte lo que escribes en un número. Entiende "1,250.50", "250,50" (coma decimal), "$300" y sumas como "120+35".
function numeroDe(t) {
  t = String(t || '').replace(/[$\s]/g, '');
  if (!t) return NaN;
  const coma = (t.match(/,/g) || []).length, punto = (t.match(/\./g) || []).length;
  if (coma && punto) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');   // 1.250,50 o 1,250.50
  else if (coma === 1 && /,\d{1,2}$/.test(t)) t = t.replace(',', '.');         // 250,50
  else t = t.replace(/,/g, '');                                                // 1,250
  return parseFloat(t);
}
function parseMonto(s) {
  const t = String(s || '').trim();
  if (!t) return 0;
  if (/^[\d.,$\s+-]+$/.test(t) && /\d\s*[+-]\s*\d/.test(t)) {
    const partes = t.replace(/\s/g, '').match(/[+-]?[^+-]+/g) || [];
    const total = partes.reduce((s, p) => s + (p[0] === '-' ? -1 : 1) * numeroDe(p.replace(/^[+-]/, '')), 0);
    return isFinite(total) ? r2(total) : 0;
  }
  const n = numeroDe(t);
  return isFinite(n) ? r2(n) : 0;
}
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
function haceCuanto(ts) {
  if (!ts) return 'nunca';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return 'hace ' + m + ' min';
  const h = Math.round(m / 60);
  return h < 24 ? 'hace ' + h + ' h' : 'hace ' + Math.round(h / 24) + ' días';
}
let toastFn = null;
function toast(msg, accion) {
  const t = $('toast');
  toastFn = accion ? accion.fn : null;
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (accion ? '<button onclick="usarToast()">' + esc(accion.txt) + '</button>' : '');
  t.className = 'toast show';
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = 'toast'; toastFn = null; }, accion ? 5500 : 2600);
}
function usarToast() { const f = toastFn; $('toast').className = 'toast'; toastFn = null; if (f) f(); }
function vibrar(ms) { try { navigator.vibrate && navigator.vibrate(ms || 12); } catch (e) {} }

const ICONO = {
  'Comida y antojos': '🌮', 'Salidas': '🎉', 'Gasolina': '⛽', 'Carro': '🚗', 'Familia y casa': '🏠',
  'Salud y cuidado personal': '💊', 'Suscripciones y seguros': '🔁', 'Gustos y compras': '🛍️', 'Viajes': '✈️',
  'Intereses y comisiones': '🏦', 'Otros': '📦',
  'Sueldo': '💼', 'Bonos y apoyos': '🎁', 'Trabajos extra': '🧾', 'Regalos y familia': '💝', 'Rendimientos': '📈', 'Otro ingreso': '💵'
};
const emo = s => s ? '<span aria-hidden="true">' + s + '</span> ' : '';
const TIPOS_PERSONA = ['Presté', 'Me pagaron', 'Me prestaron', 'Le pagué'];
const esPersonaTipo = t => TIPOS_PERSONA.indexOf(t) >= 0;
const ACCION_PERSONA = { 'Presté': 'Le presté', 'Me pagaron': 'Me pagó', 'Me prestaron': 'Me prestó', 'Le pagué': 'Le pagué' };
const SALE_DINERO = t => t === 'Gasto' || t === 'Presté' || t === 'Le pagué';
function icono(m) {
  if (m.tipo === 'Traspaso') return '⇄';
  if (m.tipo === 'Ajuste') return '⚖️';
  if (esPersonaTipo(m.tipo)) return '🤝';
  return ICONO[m.categoria] || '•';
}
const ARROW_L = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const ARROW_R = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

/* ===================== Estado ===================== */
let API = LS.get('fin_api', ''), KEY = LS.get('fin_key', ''), DEMO = LS.get('fin_demo', false);
let BASE = null;      // lo último que mandó la hoja
let DATA = null;      // BASE + cambios que aún no se suben
let TAB = 'Inicio', MES = hoy().slice(0, 7), FILTRO = 'Todos', BUSCA = '';
let FORM = null;      // formulario abierto en la hoja inferior
let VER_AVISOS = false;
let flushing = false, flushTimer = null, cargando = false;
const esDeuda = c => c.tipo === 'Crédito' || c.tipo === 'Préstamo';
const activas = () => DATA.cuentas.filter(c => !c.archivada);
const personasActivas = () => DATA.personas.filter(p => !p.archivada);

/* ===================== API ===================== */
function mensajeError(e) {
  const m = String(e && e.message || e);
  if (/Clave/.test(m)) return 'La clave de la app no coincide con la de Apps Script.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Sin conexión con Google. Revisa tu internet; lo que registres se guarda en el celular.';
  if (/JSON|Unexpected token|<!DOCTYPE/i.test(m)) return 'Apps Script no dejó entrar. Revisa que la implementación diga "Cualquier usuario" y que sea la versión nueva.';
  return m;
}
async function llamar(cuerpo) {
  const r = await fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ k: KEY }, cuerpo)) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error de la API');
  return j.result;
}
async function apiData() {
  if (DEMO) return demoGet();
  try { return await llamar({ action: 'data' }); }
  catch (e) {
    if (!/Acción desconocida/.test(e.message)) throw e;
    // Apps Script todavía en versión 1: lee por GET y avisa que falta actualizarlo
    const r = await fetch(API + '?action=data&k=' + encodeURIComponent(KEY), { redirect: 'follow' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error de la API');
    toast('Falta actualizar el código de Apps Script a la versión 2');
    return j.result;
  }
}
async function apiBatch(ops) { return DEMO ? demoPost(ops) : llamar({ action: 'batch', args: [ops] }); }

/* ===================== Modo de ejemplo (sin hoja) ===================== */
function demoDB() {
  let db = LS.get('fin_demo_db', null);
  if (!db || !db.personas) {
    const f = '2026-10-10';
    const c = (nombre, tipo, saldo, dc, dp) => ({ nombre, tipo, saldoCorte: saldo, fechaCorte: f, diaCorte: dc || null, diaPago: dp || null, tasa: null, archivada: false });
    db = { cuentas: [c('BBVA Débito', 'Débito', 415), c('Revolut', 'Ahorro', 4907.75), c('Mercado Pago', 'Débito', 28), c('Efectivo', 'Efectivo', 100),
        c('BBVA Oro', 'Crédito', -35085.28, 9, 28), c('Revolut Premium Grey', 'Crédito', -11875.57), c('Mercado Pago Crédito', 'Crédito', -6087.24), c('Préstamo Mercado Pago', 'Préstamo', -3147.48)],
      categorias: [['Comida y antojos', 400], ['Salidas', 2000], ['Gasolina', 1500], ['Carro', 800], ['Familia y casa', 300],
        ['Salud y cuidado personal', 1800], ['Suscripciones y seguros', 1000], ['Gustos y compras', 700], ['Viajes', 0],
        ['Intereses y comisiones', 0], ['Otros', 500]].map(x => ({ nombre: x[0], tipo: 'Gasto', presupuesto: x[1], nota: '' }))
        .concat(['Sueldo', 'Bonos y apoyos', 'Trabajos extra', 'Regalos y familia', 'Rendimientos', 'Otro ingreso'].map(n => ({ nombre: n, tipo: 'Ingreso', presupuesto: null, nota: '' }))),
      personas: [['Aaron', 19500], ['Lore', 2500], ['Ale', 3000]].map(x => ({ nombre: x[0], saldoCorte: x[1], fechaCorte: f, nota: 'Prestado de débito o efectivo antes del corte', archivada: false })),
      fijos: [{ id: 'fijo-spotify', nombre: 'Spotify', tipo: 'Gasto', monto: 139, categoria: 'Suscripciones y seguros', cuenta: '', dia: 2, activo: true },
        { id: 'fijo-inbursa', nombre: 'Seguro Inbursa', tipo: 'Gasto', monto: 652.4, categoria: 'Suscripciones y seguros', cuenta: '', dia: null, activo: true },
        { id: 'fijo-revolut', nombre: 'Revolut Premium', tipo: 'Gasto', monto: 172.84, categoria: 'Suscripciones y seguros', cuenta: '', dia: null, activo: true },
        { id: 'fijo-quincena', nombre: 'Quincena', tipo: 'Ingreso', monto: 7500, categoria: 'Sueldo', cuenta: '', dia: null, activo: true },
        { id: 'fijo-prestamo-mp', nombre: 'Pago préstamo Mercado Pago', tipo: 'Traspaso', monto: 1049.16, categoria: '', cuenta: '', dia: 6, activo: true, aCuenta: 'Préstamo Mercado Pago' }],
      config: { 'Abono mensual a deudas': 6000 }, movs: [], hoja: 'Modo ejemplo', version: 2 };
    LS.set('fin_demo_db', db);
  }
  return db;
}
function demoGet() { return new Promise(r => setTimeout(() => r(JSON.parse(JSON.stringify(demoDB()))), 150)); }
function demoPost(ops) {
  const db = demoDB();
  const res = ops.map(op => { aplicarOp(db, op, true); return { id: op.id, ok: true }; });
  LS.set('fin_demo_db', db);
  return new Promise(r => setTimeout(() => r(res), 250));
}

/* ===================== Cambios locales y cola sin señal ===================== */
function cola() { return LS.get('fin_queue', []); }
function guardarCola(q) { if (!LS.set('fin_queue', q)) toast('El celular no tiene espacio para guardar esto sin señal'); pintarSync(); }
function normalizar(d) {
  d.cuentas = d.cuentas || []; d.categorias = d.categorias || []; d.movs = d.movs || [];
  d.personas = d.personas || []; d.fijos = d.fijos || []; d.config = d.config || {};
  return d;
}
function aplicarOp(d, op, servidor) {
  normalizar(d);
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
    if (ex) {
      ['diaCorte', 'diaPago', 'tasa', 'archivada'].forEach(k => { if (k in c) ex[k] = c[k]; });
      if (c.nuevoNombre && c.nuevoNombre !== c.nombre) {
        d.movs.forEach(m => { if (m.cuenta === c.nombre) m.cuenta = c.nuevoNombre; if (m.aCuenta === c.nombre) m.aCuenta = c.nuevoNombre; });
        d.fijos.forEach(f => { if (f.cuenta === c.nombre) f.cuenta = c.nuevoNombre; if (f.aCuenta === c.nombre) f.aCuenta = c.nuevoNombre; });
        ex.nombre = c.nuevoNombre;
      }
    } else d.cuentas.push({ nombre: c.nombre, tipo: c.tipo, saldoCorte: c.saldoCorte, fechaCorte: c.fechaCorte, diaCorte: c.diaCorte || null, diaPago: c.diaPago || null, tasa: c.tasa || null, archivada: false });
  } else if (op.action === 'guardarPersona') {
    const p = a[0], ex = d.personas.find(x => x.nombre === p.nombre);
    if (ex) {
      ['nota', 'archivada'].forEach(k => { if (k in p) ex[k] = p[k]; });
      if (p.nuevoNombre && p.nuevoNombre !== p.nombre) { d.movs.forEach(m => { if (m.persona === p.nombre) m.persona = p.nuevoNombre; }); ex.nombre = p.nuevoNombre; }
    } else d.personas.push({ nombre: p.nombre, saldoCorte: p.saldoCorte || 0, fechaCorte: p.fechaCorte, nota: p.nota || '', archivada: false });
  } else if (op.action === 'guardarFijo') {
    const f = Object.assign({}, a[0]), i = d.fijos.findIndex(x => x.id === f.id);
    if (i >= 0) d.fijos[i] = f; else d.fijos.push(f);
  } else if (op.action === 'borrarFijo') {
    d.fijos = d.fijos.filter(x => x.id !== a[0]);
  } else if (op.action === 'guardarConfig') {
    d.config[a[0]] = a[1];
  }
}
function recalcular() {
  if (!BASE) return;
  DATA = normalizar(JSON.parse(JSON.stringify(BASE)));
  cola().forEach(op => aplicarOp(DATA, op, false));
}
function encolar(action, args, silencioso) {
  const q = cola();
  q.push({ id: uid(), action: action, args: args });
  guardarCola(q);
  recalcular();
  if (!silencioso) pintar();
  clearTimeout(flushTimer); flushTimer = setTimeout(enviar, 700);
}
async function enviar() {
  const q = cola();
  if (flushing || !q.length || !(API || DEMO)) return;
  flushing = true; pintarSync();
  let rechazados = 0;
  try {
    const res = await apiBatch(q.map(op => ({ id: op.id, action: op.action, args: op.args })));
    const listos = new Set(), guardar = LS.get('fin_rechazados', []);
    res.forEach(r => {
      listos.add(r.id);
      if (!r.ok) {
        const op = q.find(o => o.id === r.id);
        if (op) { guardar.push({ id: uid(), op: op, error: r.error || 'Error', cuando: Date.now() }); rechazados++; }
      }
    });
    LS.set('fin_rechazados', guardar.slice(-20));
    guardarCola(cola().filter(op => !listos.has(op.id)));
    flushing = false;
    await actualizar();
  } catch (e) {
    if (/Clave/.test(e.message)) toast(mensajeError(e));
    clearTimeout(flushTimer); flushTimer = setTimeout(enviar, 20000);
  } finally { flushing = false; pintarSync(); }
  if (rechazados) { toast('La hoja no aceptó ' + (rechazados === 1 ? 'un movimiento' : rechazados + ' movimientos') + '; revísalo en Inicio'); pintar(); }
}
function pintarSync() {
  const n = cola().length, el = $('sync');
  if (!el) return;
  if (flushing) { el.className = 'sync'; el.textContent = 'Subiendo…'; }
  else if (n) { el.className = 'sync pend'; el.textContent = n + ' sin subir' + (navigator.onLine ? '' : ', sin señal'); }
  else if (cargando) { el.className = 'sync'; el.textContent = 'Actualizando…'; }
  else if (DEMO) { el.className = 'sync'; el.textContent = 'Modo ejemplo'; }
  else { el.className = 'sync'; el.textContent = '✓ Al día'; }
  el.setAttribute('aria-label', el.textContent + '. Última actualización ' + haceCuanto(LS.get('fin_ultima', 0)) + '. Toca para actualizar.');
}
function tocarSync() {
  if (cola().length) { enviar(); return; }
  toast('Actualizando… (última vez ' + haceCuanto(LS.get('fin_ultima', 0)) + ')');
  actualizar(true);
}
async function actualizar(avisar) {
  cargando = true; pintarSync();
  try {
    BASE = normalizar(await apiData());
    LS.set('fin_base', BASE); LS.set('fin_ultima', Date.now());
    recalcular(); pintar();
    if (avisar === true) toast('Actualizado ✓');
  } catch (e) {
    if (!DATA) {
      $('loading').innerHTML = '<div><div class="t1">No pude leer tu hoja</div><p class="muted">' + esc(mensajeError(e)) +
        '</p><button class="btn" onclick="location.reload()">Reintentar</button> <button class="btn ghost" onclick="mostrarSetup()">Revisar conexión</button></div>';
    } else if (avisar === true || /Clave|JSON|Unexpected/.test(e.message)) toast(mensajeError(e));
  } finally { cargando = false; pintarSync(); }
}

/* ===================== Cálculos ===================== */
function saldo(c) {
  let s = c.saldoCorte;
  DATA.movs.forEach(m => {
    if (m.fecha < c.fechaCorte) return;
    if (m.cuenta === c.nombre) {
      if (m.tipo === 'Ingreso' || m.tipo === 'Reembolso' || m.tipo === 'Ajuste' || m.tipo === 'Me pagaron' || m.tipo === 'Me prestaron') s += m.monto;
      else s -= m.monto;   // Gasto, Traspaso (sale), Presté, Le pagué
    }
    if (m.tipo === 'Traspaso' && m.aCuenta === c.nombre) s += m.monto;
  });
  return r2(s);
}
// Positivo: te debe. Negativo: le debes.
function saldoPersona(p) {
  let s = p.saldoCorte;
  DATA.movs.forEach(m => {
    if (m.persona !== p.nombre || m.fecha < p.fechaCorte) return;
    if (m.tipo === 'Presté' || m.tipo === 'Le pagué') s += m.monto;
    else if (m.tipo === 'Me pagaron' || m.tipo === 'Me prestaron') s -= m.monto;
  });
  return r2(s);
}
function patrimonio() {
  let disp = 0, deuda = 0, deudaCorte = 0, teDeben = 0, debes = 0;
  DATA.cuentas.forEach(c => { const s = saldo(c); if (esDeuda(c)) { deuda += -s; deudaCorte += -c.saldoCorte; } else disp += s; });
  DATA.personas.forEach(p => { const s = saldoPersona(p); if (s > 0) teDeben += s; else debes += -s; });
  return { disp: r2(disp), deuda: r2(deuda), deudaCorte: r2(deudaCorte), teDeben: r2(teDeben), debes: r2(debes), neto: r2(disp - deuda - debes), conCobros: r2(disp - deuda - debes + teDeben) };
}
function catsGasto() { return DATA.categorias.filter(c => c.tipo === 'Gasto'); }
function catsIngreso() { return DATA.categorias.filter(c => c.tipo === 'Ingreso'); }
function resumenMes(mk) {
  const r = { ingresos: 0, gastos: 0, reembolsos: 0, ajustes: 0, cat: {}, conTarjeta: 0, pagosDeuda: 0, prestado: 0, cobrado: 0, sueldo: 0 };
  const deudas = new Set(DATA.cuentas.filter(esDeuda).map(c => c.nombre));
  DATA.movs.forEach(m => {
    if (m.fecha.slice(0, 7) !== mk) return;
    if (m.tipo === 'Ingreso') { r.ingresos += m.monto; if (m.categoria === 'Sueldo') r.sueldo += m.monto; }
    else if (m.tipo === 'Ajuste') r.ajustes += m.monto;
    else if (m.tipo === 'Presté') r.prestado += m.monto;
    else if (m.tipo === 'Me pagaron') r.cobrado += m.monto;
    else if (m.tipo === 'Gasto' || m.tipo === 'Reembolso') {
      const c = r.cat[m.categoria] || (r.cat[m.categoria] = { gasto: 0, reemb: 0 });
      if (m.tipo === 'Gasto') { r.gastos += m.monto; c.gasto += m.monto; if (deudas.has(m.cuenta)) r.conTarjeta += m.monto; }
      else { r.reembolsos += m.monto; c.reemb += m.monto; }
    } else if (m.tipo === 'Traspaso' && deudas.has(m.aCuenta) && !deudas.has(m.cuenta)) r.pagosDeuda += m.monto;
  });
  r.neto = r2(r.gastos - r.reembolsos);
  r.ahorro = r2(r.ingresos - r.neto + r.ajustes);
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
  const h = new Date(hoy() + 'T12:00:00');
  for (let k = 0; k < 2; k++) {
    const y = h.getFullYear(), mo = h.getMonth() + k, ult = new Date(y, mo + 1, 0).getDate();
    const d = difDias(hoy(), claveDia(new Date(y, mo, Math.min(dia, ult), 12)));
    if (d >= 0) return d;
  }
  return null;
}
// Pagos fijos del mes que todavía no registras
function fijosPendientes(mk) {
  const usados = new Set(DATA.movs.filter(m => m.fijo && m.fecha.slice(0, 7) === mk).map(m => m.fijo));
  const corte = minCorte();
  // Si el día del pago cayó antes del corte, ese mes ya está dentro de los saldos del corte
  const antesDelCorte = f => f.dia && (mk + '-' + pad(Math.min(f.dia, diasDelMes(mk)))) < corte;
  return DATA.fijos.filter(f => fijoVigente(f) && !usados.has(f.id) && !antesDelCorte(f));
}
function fijoVigente(f) {
  if (f.activo === false) return false;
  if (f.tipo !== 'Traspaso') return true;
  const d = DATA.cuentas.find(c => c.nombre === f.aCuenta);
  return !!d && !d.archivada && saldo(d) < -0.5;
}
const TIPO_FIJO = { Gasto: 'Gasto', Ingreso: 'Ingreso', Traspaso: 'Pago de deuda' };
function minCorte() { return DATA.cuentas.reduce((a, c) => (!a || c.fechaCorte < a ? c.fechaCorte : a), ''); }
const abonoMensual = () => { const v = parseMonto(DATA.config['Abono mensual a deudas']); return v > 0 ? v : 0; };

// Plan de deuda: todo el abono va a la deuda prioritaria (mayor tasa; si no hay tasa, la de mayor saldo), y al liquidarla pasa a la siguiente.
function planDeuda(abono) {
  const ds = DATA.cuentas.filter(c => esDeuda(c) && !c.archivada).map(c => ({ c: c, s: Math.max(0, -saldo(c)), t: c.tasa || 0, fin: null }))
    .filter(d => d.s > 0.5)
    .sort((a, b) => (b.t - a.t) || (b.s - a.s));
  const orden = ds.map(d => d);
  const sinTasa = ds.some(d => !d.c.tasa);
  if (!ds.length) return { orden: [], meses: 0, interes: 0, sinTasa: false };
  if (abono <= 0) return { orden, meses: null, interes: 0, sinTasa };
  let mes = 0, interes = 0;
  while (ds.some(d => d.s > 0.5) && mes < 240) {
    mes++;
    ds.forEach(d => { if (d.s > 0.5 && d.t) { const i = d.s * d.t / 12; d.s += i; interes += i; } });
    let disp = abono;
    for (const d of ds) { if (d.s <= 0.5 || disp <= 0) continue; const p = Math.min(disp, d.s); d.s -= p; disp -= p; if (d.s <= 0.5 && !d.fin) d.fin = mes; }
  }
  return { orden, meses: mes >= 240 ? null : mes, interes: r2(interes), sinTasa };
}
function mesDentro(n) { const d = new Date(hoy() + 'T12:00:00'); d.setMonth(d.getMonth() + n); return MESES[d.getMonth()] + ' ' + d.getFullYear(); }

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
  history.replaceState({ base: true }, '');
  window.addEventListener('popstate', () => { if (FORM) cerrarHojaReal(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const tenia = !!navigator.serviceWorker.controller;
    let recargada = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (tenia && !recargada) { recargada = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  }
  if (!(API && KEY) && !DEMO) return mostrarSetup();
  BASE = LS.get('fin_base', null);
  if (BASE) { normalizar(BASE); recalcular(); pintar(); }
  actualizar(); enviar();
  window.addEventListener('online', () => { pintarSync(); enviar(); });
  window.addEventListener('offline', pintarSync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { enviar(); if (!FORM) actualizar(); } });
  setInterval(enviar, 30000);
  setInterval(pintarSync, 60000);
}
function mostrarSetup() {
  $('loading').classList.add('hide'); $('view').innerHTML = ''; $('nav').classList.add('hide');
  $('setup').classList.remove('hide');
  $('cfgApi').value = API || ''; $('cfgKey').value = KEY || '';
}
function guardarConfigConexion() {
  const a = $('cfgApi').value.trim(), k = $('cfgKey').value.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(a) || !k) return toast('Revisa la URL y la clave');
  if (DEMO) { LS.del('fin_queue'); LS.del('fin_base'); }
  LS.set('fin_api', a); LS.set('fin_key', k); LS.set('fin_demo', false);
  location.reload();
}
function modoDemo() { LS.set('fin_demo', true); LS.del('fin_base'); location.reload(); }
function salirDemo() {
  ['fin_demo', 'fin_demo_db', 'fin_queue', 'fin_base', 'fin_api', 'fin_key', 'fin_rechazados', 'fin_draft'].forEach(LS.del);
  location.reload();
}

/* ===================== Pintar ===================== */
function irA(t) { TAB = t; if (t !== 'Movimientos') { FILTRO = 'Todos'; } pintar(); window.scrollTo(0, 0); }
function pintar() {
  if (!DATA) return;
  $('loading').classList.add('hide'); $('setup').classList.add('hide'); $('nav').classList.remove('hide');
  document.querySelectorAll('nav.tabs [data-tab]').forEach(b => { const on = b.dataset.tab === TAB; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  $('titulo').textContent = TAB === 'Inicio' ? 'Finanzas' : TAB;
  const foco = document.activeElement && document.activeElement.id === 'buscar';
  $('view').innerHTML = TAB === 'Inicio' ? vistaInicio() : TAB === 'Movimientos' ? vistaMovs() : TAB === 'Presupuesto' ? vistaPresupuesto() : vistaCuentas();
  if (foco && $('buscar')) { const b = $('buscar'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  pintarSync();
  if (FORM) pintarHoja();
}

function avisos(r) {
  const lista = [];
  DATA.cuentas.filter(c => esDeuda(c) && c.diaPago && !c.archivada).forEach(c => {
    const d = proximoDia(c.diaPago), s = saldo(c);
    if (d !== null && d <= 5 && s < 0) lista.push({ p: 0, cls: 'red', h: '<b>' + esc(c.nombre) + ':</b> fecha límite de pago ' + (d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días') + '. Debes ' + money(-s) + '. <button class="linkbtn" onclick="abrirRegistro({tipo:\'Traspaso\',aCuenta:\'' + jsq(c.nombre) + '\'})">Registrar pago</button>' });
  });
  const pasadas = [], cerca = [];
  catsGasto().forEach(c => {
    const n = netoCat(r, c.nombre), p = c.presupuesto || 0;
    if (n > 0 && n > p) pasadas.push(c.nombre + ' (' + money(n - p, true) + ' de más)');
    else if (p > 0 && n >= p * 0.8) cerca.push(c.nombre);
  });
  if (pasadas.length) lista.push({ p: 1, cls: 'red', h: '<b>Te pasaste en:</b> ' + esc(pasadas.join(', ')) + '.' });
  if (cerca.length) lista.push({ p: 2, cls: '', h: '<b>Cerca del límite:</b> ' + esc(cerca.join(', ')) + '.' });
  const ult = DATA.movs.reduce((a, m) => (m.fecha > a ? m.fecha : a), minCorte());
  const sin = ult ? difDias(ult, hoy()) : 0;
  if (sin >= 3) lista.push({ p: 3, cls: '', h: 'Llevas ' + sin + ' días sin registrar nada. Si gastaste algo, anótalo; si no te acuerdas, usa <b>Cuadrar</b> en Cuentas.' });
  lista.sort((a, b) => a.p - b.p);
  if (!lista.length) return '';
  const vis = VER_AVISOS ? lista : lista.slice(0, 2);
  let h = vis.map(a => '<div class="note ' + a.cls + '">' + a.h + '</div>').join('');
  if (lista.length > 2) h += '<button class="btn sm ghost" style="margin:-2px 0 10px" onclick="VER_AVISOS=!VER_AVISOS;pintar()">' + (VER_AVISOS ? 'Ver menos avisos' : 'Ver ' + (lista.length - 2) + ' avisos más') + '</button>';
  return h;
}
function tarjetaRechazados() {
  const rs = LS.get('fin_rechazados', []);
  if (!rs.length) return '';
  return '<div class="card" style="border-color:var(--debt)"><div class="t1 red">No se subieron a tu hoja</div>' +
    '<p class="muted" style="margin:4px 0 6px">Están guardados aquí. Corrígelos o descártalos.</p>' +
    rs.map(x => {
      const a = x.op.args && x.op.args[0], esMov = x.op.action === 'guardarMov' && a;
      return '<div style="padding:10px 0;border-top:1px solid var(--line)"><div class="row between"><span class="t1" style="font-size:15px">' +
        esc(esMov ? (a.desc || a.categoria || a.tipo) + ' · ' + money(a.monto) : x.op.action) + '</span></div>' +
        '<div class="muted">' + esc(x.error) + '</div><div class="actions">' +
        (esMov ? '<button class="btn sm" onclick="corregirRechazado(\'' + x.id + '\')">Corregir</button>' : '<button class="btn sm" onclick="reintentarRechazado(\'' + x.id + '\')">Reintentar</button>') +
        '<button class="btn sm ghost" onclick="descartarRechazado(\'' + x.id + '\')">Descartar</button></div></div>';
    }).join('') + '</div>';
}
function quitarRechazado(id) { const rs = LS.get('fin_rechazados', []), x = rs.find(r => r.id === id); LS.set('fin_rechazados', rs.filter(r => r.id !== id)); return x; }
function descartarRechazado(id) { quitarRechazado(id); pintar(); toast('Descartado'); }
function reintentarRechazado(id) { const x = quitarRechazado(id); if (x) encolar(x.op.action, x.op.args); }
function corregirRechazado(id) {
  const x = quitarRechazado(id); if (!x) return;
  const m = x.op.args[0];
  abrirFormMov(Object.assign({}, m, { _error: x.error }));
}

function vistaInicio() {
  const mk = hoy().slice(0, 7), r = resumenMes(mk), p = patrimonio();
  const queda = r2(r.presupuesto - r.neto), dia = +hoy().slice(8, 10), dias = diasDelMes(mk);
  const pct = r.presupuesto > 0 ? Math.min(100, r.neto / r.presupuesto * 100) : 0;
  const ritmo = r.presupuesto * dia / dias;
  const cls = r.neto > r.presupuesto ? 'over' : r.neto > ritmo ? 'warn' : '';
  const mesN = MESES[+mk.slice(5, 7) - 1];
  const pend = fijosPendientes(mk).filter(f => f.tipo === 'Gasto'), comprometido = r2(pend.reduce((s, f) => s + f.monto, 0));
  const pendD = fijosPendientes(mk).filter(f => f.tipo === 'Traspaso'), pagosDeuda = r2(pendD.reduce((s, f) => s + f.monto, 0));
  let h = '<section class="hero" aria-label="Presupuesto del mes">' +
    (queda >= 0
      ? '<div class="lbl">Te quedan para gastar en ' + mesN + '</div><div class="big num">' + money(queda, true) + '</div>'
      : '<div class="lbl">Te pasaste del presupuesto de ' + mesN + ' por</div><div class="big neg num">' + money(-queda, true) + '</div>') +
    '<div class="of">Llevas ' + money(r.neto, true) + ' de ' + money(r.presupuesto, true) + '. ' +
      (r.neto > ritmo ? 'Vas más rápido de lo que alcanza el mes.' : 'Vas a buen ritmo.') + '</div>' +
    '<div class="meter" role="img" aria-label="Gastado ' + Math.round(pct) + ' por ciento del presupuesto; hoy es el día ' + dia + ' de ' + dias + '"><div class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></div><i class="today" style="left:' + (dia / dias * 100).toFixed(1) + '%"></i></div>' +
    '<div class="legend"><span>Día ' + dia + ' de ' + dias + '</span><span>Lo sano a hoy: ' + money(ritmo, true) + '</span></div>' +
    (comprometido > 0 ? '<div class="fixed-line">De lo que te queda, <b>' + money(comprometido) + '</b> ya está apartado para fijos pendientes (' + esc(pend.map(f => f.nombre).join(', ')) + ').</div>' : '') +
    (pagosDeuda > 0 ? '<div class="fixed-line">Aparte, este mes te toca pagar <b>' + money(pagosDeuda) + '</b> de ' + esc(pendD.map(f => f.nombre + (f.dia ? ' (día ' + f.dia + ')' : '')).join(', ')) + '.</div>' : '') +
    '</section>';
  h += tarjetaRechazados();
  h += avisos(r);

  // Deuda y plan
  const bajo = r2(p.deudaCorte - p.deuda);
  const deudas = DATA.cuentas.filter(c => esDeuda(c) && !c.archivada).map(c => ({ c: c, s: -saldo(c) })).sort((a, b) => b.s - a.s);
  const max = Math.max(1, ...deudas.map(d => d.s));
  const plan = planDeuda(abonoMensual());
  h += '<div class="card"><div class="debt-head"><span class="t1">Deuda con bancos</span><span class="amt red num">' + money(p.deuda) + '</span></div>' +
    '<div class="muted" style="margin-top:4px">' + (bajo > 0 ? 'Has bajado ' + money(bajo) + ' desde el corte del ' + fechaCorta(minCorte()) + '.' : bajo < 0 ? 'Subió ' + money(-bajo) + ' desde el corte del ' + fechaCorta(minCorte()) + '.' : 'Igual que en el corte del ' + fechaCorta(minCorte()) + '.') + '</div>' +
    '<div class="meter" style="height:8px" role="img" aria-label="Pagado ' + (p.deudaCorte > 0 ? Math.max(0, Math.round(bajo / p.deudaCorte * 100)) : 0) + ' por ciento de la deuda del corte"><div style="width:' + (p.deudaCorte > 0 ? Math.max(0, Math.min(100, bajo / p.deudaCorte * 100)) : 0).toFixed(1) + '%"></div></div>' +
    '<div class="debt-list">' + deudas.map(d => '<div class="debt-item"><span>' + esc(d.c.nombre) + '</span><span class="num">' + money(d.s) + '</span>' +
      '<div class="bar"><div style="width:' + Math.max(0, d.s / max * 100).toFixed(1) + '%"></div></div></div>').join('') + '</div>' +
    '<div class="muted" style="margin-top:12px">Este mes: cargaste ' + money(r.conTarjeta) + ' a crédito y abonaste ' + money(r.pagosDeuda) + '.</div>' +
    (plan.orden.length ? '<div class="plan-line"><span>' + (plan.meses ? 'Con ' + money(abonoMensual(), true) + ' al mes terminas en <b>' + mesDentro(plan.meses) + '</b>.' : 'Define cuánto abonarás al mes.') +
      ' Primero: <b>' + esc(plan.orden[0].c.nombre) + '</b>.</span><button class="btn sm ghost" onclick="abrirPlan()">Ver plan</button></div>' : '') + '</div>';

  h += '<div class="grid2">' +
    '<div class="stat"><div class="muted">Disponible</div><div class="amt sm num">' + money(p.disp) + '</div></div>' +
    '<div class="stat"><div class="muted">Patrimonio neto</div><div class="amt sm num' + (p.neto < 0 ? ' red' : '') + '">' + money(p.neto) + '</div>' +
      (p.teDeben ? '<div class="sub">Si te pagan: ' + money(p.conCobros) + '</div>' : '') + '</div>' +
    '<div class="stat"><div class="muted">Ingresos del mes</div><div class="amt sm num">' + money(r.ingresos) + '</div>' +
      (!r.sueldo ? '<div class="sub">Aún no registras tu quincena</div>' : '') + '</div>' +
    '<div class="stat"><div class="muted">Ahorro del mes</div><div class="amt sm num' + (r.ahorro < 0 ? ' red' : ' green') + '">' + money(r.ahorro) + '</div>' +
      (r.ahorro < 0 && !r.sueldo ? '<div class="sub">Normal antes de la quincena</div>' : '') + '</div></div>';

  // Personas
  const conSaldo = DATA.personas.filter(x => !x.archivada).map(x => ({ x: x, s: saldoPersona(x) })).filter(o => Math.abs(o.s) > 0.004).sort((a, b) => b.s - a.s);
  if (conSaldo.length) {
    h += '<h2>Personas<button class="more" onclick="irA(\'Cuentas\');setTimeout(()=>{const e=$(\'sec-personas\');e&&e.scrollIntoView()},50)">Ver todo</button></h2><div class="card" style="padding:6px 16px">' +
      (p.teDeben ? '<div class="row between" style="padding:10px 0"><span class="t1">Te deben</span><span class="amt sm green num">' + money(p.teDeben) + '</span></div>' : '') +
      (p.debes ? '<div class="row between" style="padding:10px 0"><span class="t1">Les debes</span><span class="amt sm red num">' + money(p.debes) + '</span></div>' : '') +
      conSaldo.slice(0, 4).map(o => '<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><span>' + esc(o.x.nombre) + '</span><span class="num ' + (o.s > 0 ? '' : 'red') + '">' + (o.s > 0 ? 'te debe ' : 'le debes ') + money(Math.abs(o.s)) + '</span></div>').join('') + '</div>';
  }

  const ult = DATA.movs.slice().sort(ordenMov).slice(0, 6);
  h += '<h2>Últimos movimientos' + (ult.length ? '<button class="more" onclick="MES=hoy().slice(0,7);BUSCA=\'\';irA(\'Movimientos\')">Ver todos</button>' : '') + '</h2>';
  h += ult.length ? '<div class="list">' + ult.map(filaMov).join('') + '</div>'
    : '<div class="list"><div class="empty">Aún no registras nada desde el corte.<br>Toca <b>+</b> cada vez que gastes o te paguen.</div></div>';
  return h;
}

function ordenMov(a, b) { return a.fecha === b.fecha ? (b.registrado || 0) - (a.registrado || 0) : (a.fecha < b.fecha ? 1 : -1); }
function filaMov(m) {
  const c = DATA.cuentas.find(x => x.nombre === m.cuenta), deuda = c && esDeuda(c);
  let d2, cls = '', txt, extra = '';
  if (m.tipo === 'Traspaso') { d2 = m.cuenta + ' → ' + m.aCuenta; cls = ' tr'; txt = money(m.monto); }
  else if (m.tipo === 'Ajuste') {
    d2 = 'Sin registrar, ' + m.cuenta;
    if (deuda) { txt = (m.monto < 0 ? '+' : '−') + money(Math.abs(m.monto)); extra = 'a tu deuda'; cls = m.monto < 0 ? ' out' : ' in'; if (m.monto > 0) extra = 'menos deuda'; }
    else { txt = (m.monto > 0 ? '+' : '−') + money(Math.abs(m.monto)); cls = m.monto > 0 ? ' in' : ' tr'; }
  } else if (esPersonaTipo(m.tipo)) {
    d2 = ACCION_PERSONA[m.tipo] + ', ' + m.cuenta; txt = (SALE_DINERO(m.tipo) ? '−' : '+') + money(m.monto); cls = SALE_DINERO(m.tipo) ? '' : ' in';
  } else {
    d2 = (m.tipo === 'Reembolso' ? 'Reembolso: ' : '') + m.categoria + ', ' + m.cuenta;
    if (m.tipo === 'Gasto') txt = '−' + money(m.monto); else { cls = ' in'; txt = '+' + money(m.monto); }
  }
  const t1 = esPersonaTipo(m.tipo) ? (m.persona + (m.desc ? ': ' + m.desc : '')) : (m.desc || (m.tipo === 'Traspaso' ? 'Traspaso' : m.tipo === 'Ajuste' ? 'Ajuste al cuadrar' : m.categoria));
  return '<button class="mv" onclick="editarMov(\'' + jsq(m.id) + '\')"><span class="ic" aria-hidden="true">' + icono(m) + '</span>' +
    '<span class="tx"><div class="d1">' + esc(t1) + (m._pend ? '<i class="pend" title="Sin subir"></i><span class="sr">sin subir</span>' : '') + '</div><div class="d2">' + esc(d2) + '</div></span>' +
    '<span class="m num' + cls + '">' + txt + (extra ? '<small>' + extra + '</small>' : '') + '</span></button>';
}

function barraMes() {
  const ini = primerMes(), fin = hoy().slice(0, 7);
  return '<div class="monthbar"><button class="arrow" aria-label="Mes anterior" ' + (MES <= ini ? 'disabled' : '') + ' onclick="MES=mesSig(MES,-1);pintar()">' + ARROW_L + '</button>' +
    '<span class="nm" aria-live="polite">' + nombreMes(MES) + '</span>' +
    '<button class="arrow" aria-label="Mes siguiente" ' + (MES >= fin ? 'disabled' : '') + ' onclick="MES=mesSig(MES,1);pintar()">' + ARROW_R + '</button></div>';
}

const FILTROS = { 'Todos': null, 'Gastos': ['Gasto'], 'Ingresos': ['Ingreso'], 'Reembolsos': ['Reembolso'], 'Traspasos': ['Traspaso'], 'Personas': TIPOS_PERSONA, 'Ajustes': ['Ajuste'] };
function vistaMovs() {
  return (BUSCA.trim() ? '<div style="height:10px"></div>' : barraMes()) +
    '<label class="sr" for="buscar">Buscar movimientos</label>' +
    '<input id="buscar" class="search" type="search" placeholder="Buscar en todos los meses (Oxxo, Aaron, BBVA…)" value="' + esc(BUSCA) + '" oninput="BUSCA=this.value;pintarLista()">' +
    '<div class="chips" role="group" aria-label="Filtrar por tipo" style="margin-bottom:4px">' + Object.keys(FILTROS).map(t => '<button class="chip' + (FILTRO === t ? ' on' : '') + '" aria-pressed="' + (FILTRO === t) + '" onclick="FILTRO=\'' + t + '\';pintar()">' + t + '</button>').join('') + '</div>' +
    '<div id="lista">' + listaMovs() + '</div>';
}
function listaMovs() {
  const q = BUSCA.trim().toLowerCase(), tipos = FILTROS[FILTRO];
  const lista = DATA.movs.filter(m => (q || m.fecha.slice(0, 7) === MES) && (!tipos || tipos.indexOf(m.tipo) >= 0) &&
    (!q || [m.desc, m.categoria, m.cuenta, m.aCuenta, m.persona, m.tipo, String(m.monto)].join(' ').toLowerCase().includes(q))).sort(ordenMov);
  if (!lista.length) return '<div class="list" style="margin-top:12px"><div class="empty">' + (q ? 'No encontré "' + esc(BUSCA.trim()) + '" en ningún mes.' : FILTRO !== 'Todos' ? 'Nada de este tipo en ' + nombreMes(MES) + '.' : 'Sin movimientos en ' + nombreMes(MES) + '.') + '</div></div>';
  let h = q ? '<div class="muted" style="margin:10px 2px 0">' + lista.length + ' resultado' + (lista.length === 1 ? '' : 's') + ' en todos los meses</div>' : '';
  const dias = {};
  lista.forEach(m => (dias[m.fecha] = dias[m.fecha] || []).push(m));
  let mesActual = '';
  Object.keys(dias).sort().reverse().forEach(f => {
    if (q && f.slice(0, 7) !== mesActual) { mesActual = f.slice(0, 7); h += '<div class="mhead">' + nombreMes(mesActual) + '</div>'; }
    const g = dias[f].filter(m => m.tipo === 'Gasto').reduce((s, m) => s + m.monto, 0);
    h += '<div class="day"><span>' + fechaLarga(f) + '</span><span class="num">' + (g ? 'Gastaste ' + money(g) : '') + '</span></div>' +
      '<div class="list">' + dias[f].map(filaMov).join('') + '</div>';
  });
  return h;
}
function pintarLista() { const v = $('lista'); if (!v) return; const tenia = !!BUSCA.trim(); v.innerHTML = listaMovs();
  // al empezar o terminar una búsqueda cambia la barra del mes
  const barra = document.querySelector('#view .monthbar');
  if (tenia === !!barra) { const pos = $('buscar').selectionStart; pintar(); const b = $('buscar'); if (b) { b.focus(); b.setSelectionRange(pos, pos); } } }

function vistaPresupuesto() {
  const r = resumenMes(MES), queda = r2(r.presupuesto - r.neto);
  let h = barraMes();
  h += '<div class="grid2" style="margin-bottom:12px">' +
    '<div class="stat"><div class="muted">Gasto neto</div><div class="amt sm num">' + money(r.neto) + '</div></div>' +
    '<div class="stat"><div class="muted">' + (queda < 0 ? 'Te pasaste por' : 'Te queda') + '</div><div class="amt sm num' + (queda < 0 ? ' red' : '') + '">' + money(Math.abs(queda)) + '</div></div>' +
    '<div class="stat"><div class="muted">Ingresos</div><div class="amt sm num">' + money(r.ingresos) + '</div></div>' +
    '<div class="stat"><div class="muted">Ahorro</div><div class="amt sm num' + (r.ahorro < 0 ? ' red' : ' green') + '">' + money(r.ahorro) + '</div></div></div>';
  if (r.ajustes) h += '<div class="note">Este mes hubo ' + money(Math.abs(r.ajustes)) + ' en ajustes al cuadrar: dinero que ' + (r.ajustes < 0 ? 'salió' : 'entró') + ' sin registrarse. Ya está contado en el ahorro.</div>';
  if (r.prestado || r.cobrado) h += '<div class="note info">Prestaste ' + money(r.prestado) + ' y te pagaron ' + money(r.cobrado) + ' este mes. No cuenta como gasto ni ingreso.</div>';
  h += '<div class="list">' + catsGasto().map(c => {
    const n = netoCat(r, c.nombre), p = c.presupuesto || 0;
    const pct = p > 0 ? n / p * 100 : (n > 0 ? 100 : 0);
    const cls = n > p ? 'over' : pct >= 80 ? 'warn' : '';
    const resto = r2(p - n);
    return '<button class="cat" onclick="abrirCategoria(\'' + jsq(c.nombre) + '\')"><div class="top2"><span class="nm">' + emo(ICONO[c.nombre]) + esc(c.nombre) + '</span>' +
      '<span class="num t1' + (resto < 0 ? ' red' : '') + '">' + money(n, true) + '</span></div>' +
      '<div class="meter" aria-hidden="true"><div class="' + cls + '" style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
      '<div class="sub"><span>' + (p ? 'de ' + money(p, true) : 'Sin presupuesto') + '</span><span class="' + (resto < 0 ? 'red' : '') + '">' +
      (resto < 0 ? money(-resto, true) + ' de más' : p ? 'quedan ' + money(resto, true) : '') + '</span></div></button>';
  }).join('') + '</div>';
  h += '<p class="hint">Toca una categoría para ver sus movimientos o cambiar su presupuesto. El gasto neto ya descuenta los reembolsos.</p>';

  // Pagos fijos
  const usados = new Set(DATA.movs.filter(m => m.fijo && m.fecha.slice(0, 7) === MES).map(m => m.fijo));
  const fs = DATA.fijos.filter(fijoVigente);
  h += '<h2>Pagos fijos<button class="more" onclick="abrirFijo()">Agregar</button></h2>';
  h += fs.length ? '<div class="list">' + fs.map(f => {
    const ok = usados.has(f.id);
    return '<div class="acc"><div class="tx"><div class="row between"><span class="t1">' + emo(ICONO[f.categoria]) + esc(f.nombre) + '</span><span class="amt sm num' + (f.tipo === 'Ingreso' ? ' green' : '') + '">' + money(f.monto) + '</span></div>' +
      '<div class="muted">' + esc(f.tipo === 'Ingreso' ? 'Ingreso' : f.tipo === 'Traspaso' ? 'Pago a ' + f.aCuenta : f.categoria) + (f.dia ? ', día ' + f.dia : '') + (f.cuenta ? ', ' + esc(f.cuenta) : '') + (ok ? ' · ✓ registrado en ' + MESES[+MES.slice(5, 7) - 1] : '') + '</div>' +
      '<div class="actions">' + (MES === hoy().slice(0, 7) ? '<button class="btn sm' + (ok ? ' ghost' : '') + '" onclick="usarFijo(\'' + jsq(f.id) + '\')">' + (ok ? 'Registrar otra vez' : 'Registrar') + '</button>' : '') +
      '<button class="btn sm ghost" onclick="abrirFijo(\'' + jsq(f.id) + '\')">Editar</button></div></div></div>';
  }).join('') + '</div>' : '<div class="list"><div class="empty">Sin pagos fijos. Agrega Spotify, seguros o tu quincena para registrarlos con un toque.</div></div>';
  const inactivos = DATA.fijos.filter(f => !fijoVigente(f));
  if (inactivos.length) h += '<details class="arch"><summary>Pausados o terminados (' + inactivos.length + ')</summary><div class="list">' + inactivos.map(f => '<div class="acc"><div class="tx"><span class="t1">' + esc(f.nombre) + '</span> <span class="muted">' + money(f.monto) + '</span><div class="actions"><button class="btn sm ghost" onclick="abrirFijo(\'' + jsq(f.id) + '\')">Editar</button></div></div></div>').join('') + '</div></details>';
  return h;
}

function vistaCuentas() {
  const p = patrimonio();
  const fila = c => {
    const s = saldo(c), deuda = esDeuda(c), n = jsq(c.nombre);
    const det = [c.tipo + (deuda ? (s <= 0 ? ', lo que debes' : ', saldo a favor') : '')];
    if (c.diaCorte) det.push('corte día ' + c.diaCorte);
    if (c.diaPago) det.push('pago día ' + c.diaPago);
    if (c.tasa) det.push('tasa ' + (c.tasa * 100).toFixed(1) + '% anual');
    return '<div class="acc"><div class="tx"><div class="row between"><span class="t1">' + esc(c.nombre) + '</span>' +
      '<span class="amt sm num' + (deuda && s < 0 ? ' red' : '') + '">' + money(deuda ? -s : s) + '</span></div>' +
      '<div class="muted">' + esc(det.join(', ')) + '</div>' +
      '<div class="actions">' +
      (deuda ? '<button class="btn sm" onclick="abrirRegistro({tipo:\'Traspaso\',aCuenta:\'' + n + '\'})">Pagar</button>' :
        '<button class="btn sm ghost" onclick="abrirRegistro({tipo:\'Traspaso\',cuenta:\'' + n + '\'})">Mover</button>') +
      '<button class="btn sm ghost" onclick="abrirCuadrar(\'' + n + '\')">Cuadrar</button>' +
      '<button class="btn sm ghost" onclick="abrirCuenta(\'' + n + '\')">Editar</button></div></div></div>';
  };
  const filaP = x => {
    const s = saldoPersona(x), n = jsq(x.nombre);
    return '<div class="acc"><div class="tx"><div class="row between"><span class="t1">' + esc(x.nombre) + '</span>' +
      '<span class="amt sm num' + (s < 0 ? ' red' : s > 0 ? ' green' : '') + '">' + money(Math.abs(s)) + '</span></div>' +
      '<div class="muted">' + (s > 0 ? 'Te debe' : s < 0 ? 'Le debes' : 'A mano') + (x.nota ? ', ' + esc(x.nota) : '') + '</div><div class="actions">' +
      (s > 0 ? '<button class="btn sm" onclick="abrirRegistro({tipo:\'Me pagaron\',persona:\'' + n + '\'})">Me pagó</button><button class="btn sm ghost" onclick="abrirRegistro({tipo:\'Presté\',persona:\'' + n + '\'})">Prestar más</button>' :
       s < 0 ? '<button class="btn sm" onclick="abrirRegistro({tipo:\'Le pagué\',persona:\'' + n + '\'})">Le pagué</button><button class="btn sm ghost" onclick="abrirRegistro({tipo:\'Me prestaron\',persona:\'' + n + '\'})">Me prestó más</button>' :
       '<button class="btn sm ghost" onclick="abrirRegistro({tipo:\'Presté\',persona:\'' + n + '\'})">Le presté</button><button class="btn sm ghost" onclick="abrirRegistro({tipo:\'Me prestaron\',persona:\'' + n + '\'})">Me prestó</button>') +
      '<button class="btn sm ghost" onclick="abrirPersona(\'' + n + '\')">Editar</button></div></div></div>';
  };
  let h = '<div class="grid2" style="margin:12px 0 4px">' +
    '<div class="stat"><div class="muted">Disponible</div><div class="amt sm num">' + money(p.disp) + '</div></div>' +
    '<div class="stat"><div class="muted">Deuda con bancos</div><div class="amt sm red num">' + money(p.deuda) + '</div></div></div>';
  const dinero = activas().filter(c => !esDeuda(c)), deudas = activas().filter(esDeuda);
  h += '<h2>Tu dinero</h2><div class="list">' + dinero.map(fila).join('') + '</div>';
  h += '<h2>Lo que debes a bancos<button class="more" onclick="abrirPlan()">Plan de deuda</button></h2><div class="list">' + deudas.map(fila).join('') + '</div>';
  h += '<p class="hint">Cuadrar: escribe el saldo que ves en la app del banco y la diferencia se registra como ajuste. Hazlo cada domingo.</p>';
  const ps = personasActivas().map(x => ({ x: x, s: saldoPersona(x) }));
  const teDeben = ps.filter(o => o.s > 0).sort((a, b) => b.s - a.s), lesDebes = ps.filter(o => o.s < 0).sort((a, b) => a.s - b.s), aMano = ps.filter(o => o.s === 0);
  h += '<h2 id="sec-personas">Te deben<span class="amt sm green num">' + money(p.teDeben) + '</span></h2>' +
    (teDeben.length ? '<div class="list">' + teDeben.map(o => filaP(o.x)).join('') + '</div>' : '<div class="list"><div class="empty">Nadie te debe.</div></div>');
  h += '<h2>Les debes<span class="amt sm' + (p.debes ? ' red' : '') + ' num">' + money(p.debes) + '</span></h2>' +
    (lesDebes.length ? '<div class="list">' + lesDebes.map(o => filaP(o.x)).join('') + '</div>' : '<div class="list"><div class="empty">No le debes a nadie.</div></div>');
  if (aMano.length) h += '<h2>A mano</h2><div class="list">' + aMano.map(o => filaP(o.x)).join('') + '</div>';
  h += '<div class="actions" style="margin-top:12px"><button class="btn ghost" style="flex:1" onclick="abrirNuevaPersona()">Agregar persona</button><button class="btn ghost" style="flex:1" onclick="abrirNuevaCuenta()">Agregar cuenta</button></div>';
  const archC = DATA.cuentas.filter(c => c.archivada), archP = DATA.personas.filter(x => x.archivada);
  if (archC.length || archP.length) h += '<details class="arch"><summary>Archivadas (' + (archC.length + archP.length) + ')</summary><div class="list">' +
    archC.map(c => '<div class="acc"><div class="tx"><span class="t1">' + esc(c.nombre) + '</span><div class="muted">' + esc(c.tipo) + '</div><div class="actions"><button class="btn sm ghost" onclick="abrirCuenta(\'' + jsq(c.nombre) + '\')">Editar</button></div></div></div>').join('') +
    archP.map(x => '<div class="acc"><div class="tx"><span class="t1">' + esc(x.nombre) + '</span><div class="muted">Persona</div><div class="actions"><button class="btn sm ghost" onclick="abrirPersona(\'' + jsq(x.nombre) + '\')">Editar</button></div></div></div>').join('') + '</div></details>';
  h += '<h2>Conexión</h2><div class="card flat"><div class="muted">' + (DEMO ? 'Estás en modo ejemplo: nada se guarda en tu hoja.' :
    'Conectada a ' + esc(BASE && BASE.hoja ? BASE.hoja : 'tu hoja de Google') + '. Última actualización: ' + haceCuanto(LS.get('fin_ultima', 0)) + '.') + '</div>' +
    (!DEMO ? '<p class="hint">Por seguridad, borra del historial de Chrome el link con tu clave. Si alguien lo vio, cambia la clave en Apps Script y vuelve a conectar.</p>' : '') +
    '<div class="actions">' + (DEMO ? '<button class="btn sm" onclick="salirDemo()">Salir del modo ejemplo</button>' : '<button class="btn sm ghost" onclick="actualizar(true)">Actualizar ahora</button>') +
    '<button class="btn sm ghost" onclick="mostrarSetup()">Cambiar conexión</button></div></div>';
  return h;
}

/* ===================== Hoja inferior ===================== */
function abrirHoja() {
  const s = $('sheet'), sc = $('scrim'), yaAbierta = s.classList.contains('show');
  if (!yaAbierta) {
    history.pushState({ hoja: true }, '');
    s.classList.remove('hide'); sc.classList.remove('hide');
    requestAnimationFrame(() => { s.classList.add('show'); sc.classList.add('show'); });
    document.body.style.overflow = 'hidden';
  }
  s.scrollTop = 0;
}
// Cerrar desde un botón: regresa en el historial para que el botón Atrás de Android no saque de la app
function cerrarHoja() { if (history.state && history.state.hoja) history.back(); else cerrarHojaReal(); }
function cerrarHojaReal() {
  guardarBorrador();
  FORM = null;
  const s = $('sheet'), sc = $('scrim');
  s.classList.remove('show'); sc.classList.remove('show'); s.style.transform = '';
  document.body.style.overflow = '';
  setTimeout(() => { if (!FORM) { s.classList.add('hide'); sc.classList.add('hide'); s.innerHTML = ''; } }, 260);
}
function pintarHoja() {
  if (!FORM) return;
  const f = { mov: hojaMov, cat: hojaCategoria, cuadrar: hojaCuadrar, cuenta: hojaCuenta, nuevaCuenta: hojaNuevaCuenta, persona: hojaPersona,
              nuevaPersona: hojaNuevaPersona, fijo: hojaFijo, plan: hojaPlan }[FORM.vista];
  const a = document.activeElement, foco = a && a.id, sel = a && a.selectionStart, top = $('sheet').scrollTop;
  $('sheet').innerHTML = '<div class="grabzone" id="grab"><div class="grab"></div></div>' + f();
  $('sheet').scrollTop = top;
  if (foco && $(foco) && $('sheet').contains($(foco))) { const e = $(foco); e.focus(); try { if (sel != null) e.setSelectionRange(sel, sel); } catch (x) {} }
  activarArrastre();
}
// Deslizar hacia abajo desde la parte de arriba de la hoja para cerrarla
function activarArrastre() {
  const g = $('grab'), s = $('sheet');
  if (!g || g._ok) return;
  g._ok = true;
  let y0 = null, dy = 0;
  g.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; s.classList.add('drag'); }, { passive: true });
  g.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); s.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
  g.addEventListener('touchend', () => { s.classList.remove('drag'); if (dy > 90) cerrarHoja(); else s.style.transform = ''; y0 = null; });
}
const titulo = t => '<h3 id="hojaTitulo" tabindex="-1">' + t + '</h3>';
function enfocarTitulo() { setTimeout(() => { const t = $('hojaTitulo'); if (t) t.focus({ preventScroll: true }); }, 280); }

/* ---- Borrador: si cierras sin guardar, lo capturado no se pierde ---- */
function guardarBorrador() {
  if (!FORM || FORM.vista !== 'mov' || FORM.id || FORM._guardado) return;
  const m = $('fMonto'), d = $('fDesc');
  if (m) FORM.monto = m.value; if (d) FORM.desc = d.value;
  if (String(FORM.monto || '').trim() || String(FORM.desc || '').trim()) { LS.set('fin_draft', { f: FORM, ts: Date.now() }); }
  else LS.del('fin_draft');
}

/* ---- Registrar / editar movimiento ---- */
const ULT = (k, d) => LS.get('fin_ult_' + k, d);
function abrirRegistro(o) {
  o = o || {};
  const b = LS.get('fin_draft', null);
  if (!o.tipo && !o.fijo && b && Date.now() - b.ts < 86400000) {
    FORM = Object.assign({}, b.f, { vista: 'mov', recuperado: true, err: '' });
  } else {
    LS.del('fin_draft');
    FORM = { vista: 'mov', id: null, tipo: o.tipo || 'Gasto', monto: o.monto != null ? String(o.monto) : '', cuenta: o.cuenta || null, aCuenta: o.aCuenta || null,
             categoria: o.categoria || null, persona: o.persona || null, desc: o.desc || '', fecha: hoy(), fijo: o.fijo || '', err: '', verTodas: false };
    autocompletar();
  }
  abrirHoja(); pintarHoja();
  setTimeout(() => { const m = $('fMonto'); if (m && !m.value) m.focus(); else enfocarTitulo(); }, 300);
}
function empezarDeNuevo() { LS.del('fin_draft'); FORM = null; abrirRegistro({}); }
function editarMov(id) {
  const m = DATA.movs.find(x => x.id === id);
  if (!m) return;
  abrirFormMov(m);
}
function abrirFormMov(m) {
  FORM = { vista: 'mov', id: m.id, tipo: m.tipo, monto: String(m.monto), cuenta: m.cuenta, aCuenta: m.aCuenta || null, categoria: m.categoria || null,
           persona: m.persona || null, desc: m.desc || '', fecha: m.fecha, fijo: m.fijo || '', registrado: m.registrado || null, err: m._error ? 'La hoja lo rechazó: ' + m._error : '', verTodas: true };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function cuentasPara(tipo, rol) {
  const cs = activas();
  if (tipo === 'Gasto' || tipo === 'Presté' || tipo === 'Le pagué') return cs.filter(c => c.tipo !== 'Préstamo');
  if (tipo === 'Ingreso' || tipo === 'Reembolso' || tipo === 'Me pagaron' || tipo === 'Me prestaron') return cs.filter(c => !esDeuda(c));
  if (tipo === 'Traspaso') return rol === 'a' ? cs.filter(c => c.nombre !== FORM.cuenta) : cs.filter(c => c.tipo !== 'Préstamo');
  return cs;
}
function cuentaPorDefecto(t) {
  const ok = n => n && cuentasPara(t).some(c => c.nombre === n);
  const ult = ULT('cuenta_' + t);
  // Para gastos, la sugerencia nunca es una tarjeta de crédito: usar crédito tiene que ser una decisión.
  if (ok(ult) && !(t === 'Gasto' && esDeuda(DATA.cuentas.find(c => c.nombre === ult) || {}))) return ult;
  const d = cuentasPara(t).find(c => c.tipo === 'Débito') || cuentasPara(t).find(c => !esDeuda(c));
  return d ? d.nombre : null;
}
function autocompletar() {
  const t = FORM.tipo;
  const valida = (n, rol) => n && cuentasPara(t, rol).some(c => c.nombre === n);
  if (t === 'Traspaso') {
    if (!valida(FORM.cuenta)) FORM.cuenta = FORM.aCuenta ? ((activas().find(c => !esDeuda(c) && c.nombre !== FORM.aCuenta) || {}).nombre || null) : null;
    if (FORM.aCuenta === FORM.cuenta) FORM.aCuenta = null;
  } else if (!valida(FORM.cuenta)) FORM.cuenta = cuentaPorDefecto(t);
  const cats = t === 'Ingreso' ? catsIngreso() : catsGasto();
  if (t === 'Traspaso' || esPersonaTipo(t) || !cats.some(c => c.nombre === FORM.categoria)) FORM.categoria = t === 'Ingreso' ? ULT('cat_Ingreso', null) : (t === 'Gasto' || t === 'Reembolso' ? null : FORM.categoria);
  if (esPersonaTipo(t) && FORM.persona && !personasActivas().some(p => p.nombre === FORM.persona)) FORM.persona = null;
}
function setForm(k, v) {
  const m = $('fMonto'), d = $('fDesc');
  if (m) FORM.monto = m.value; if (d) FORM.desc = d.value;
  FORM[k] = v; FORM.err = '';
  if (k === 'tipo' && FORM.vista === 'mov') autocompletar();
  if (k === 'cuenta' && FORM.aCuenta === v) FORM.aCuenta = null;
  vibrar(8);
  pintarHoja();
}
// Categorías: las que más usas primero (últimos 90 días)
function catsOrdenadas(tipo) {
  const cats = tipo === 'Ingreso' ? catsIngreso() : catsGasto();
  const desde = sumarDias(hoy(), -90), cnt = {};
  DATA.movs.forEach(m => { if (m.fecha >= desde && (m.tipo === 'Gasto' || m.tipo === 'Ingreso')) cnt[m.categoria] = (cnt[m.categoria] || 0) + 1; });
  return cats.map((c, i) => ({ c, i, n: cnt[c.nombre] || 0 })).sort((a, b) => (b.n - a.n) || (a.i - b.i)).map(x => x.c);
}
function sugerenciasDesc(tipo) {
  const vistos = new Set(), out = [];
  DATA.movs.slice().sort(ordenMov).forEach(m => { const d = (m.desc || '').trim(); if (d && m.tipo === tipo && !vistos.has(d.toLowerCase())) { vistos.add(d.toLowerCase()); out.push(d); } });
  return out.slice(0, 60);
}
// Al escribir una descripción que ya usaste, propone la misma categoría y cuenta
function alEscribirDesc(v) {
  if (!FORM || FORM.vista !== 'mov') return;
  FORM.desc = v;
  if (FORM.id) return;
  const m = DATA.movs.slice().sort(ordenMov).find(x => x.tipo === FORM.tipo && (x.desc || '').trim().toLowerCase() === v.trim().toLowerCase());
  if (m && (!FORM.categoria || !FORM.cuenta)) {
    if (!FORM.categoria && m.categoria) FORM.categoria = m.categoria;
    if (!FORM.cuenta && m.cuenta) FORM.cuenta = m.cuenta;
    pintarHoja();
  }
}
function usarFijo(id) {
  const f = DATA.fijos.find(x => x.id === id); if (!f) return;
  LS.del('fin_draft');
  FORM = null;
  abrirRegistro({ tipo: f.tipo, monto: f.monto, categoria: f.tipo === 'Traspaso' ? null : f.categoria, cuenta: f.cuenta || null, aCuenta: f.tipo === 'Traspaso' ? f.aCuenta : null, desc: f.nombre, fijo: f.id });
}
function aplicarFijo(id) {
  const f = DATA.fijos.find(x => x.id === id); if (!f) return;
  FORM.tipo = f.tipo; FORM.monto = String(f.monto); FORM.categoria = f.tipo === 'Traspaso' ? null : f.categoria; FORM.desc = f.nombre; FORM.fijo = f.id; FORM.err = '';
  if (f.tipo === 'Traspaso') FORM.aCuenta = f.aCuenta;
  autocompletar();
  if (f.cuenta && cuentasPara(f.tipo).some(c => c.nombre === f.cuenta)) FORM.cuenta = f.cuenta;
  vibrar(8); pintarHoja();
}
function hojaMov() {
  const t = FORM.tipo, ed = !!FORM.id, persona = esPersonaTipo(t);
  const grupo = t === 'Reembolso' ? 'Ingreso' : persona ? 'Personas' : t;
  const chipsCuenta = (lista, campo, etiqueta) => '<div class="pick" role="group" aria-label="' + etiqueta + '">' + lista.map(c => '<button class="' + (esDeuda(c) ? 'debtacc' : '') + (FORM[campo] === c.nombre ? ' on' : '') +
    '" aria-pressed="' + (FORM[campo] === c.nombre) + '" onclick="setForm(\'' + campo + '\',\'' + jsq(c.nombre) + '\')">' + esc(c.nombre) + '</button>').join('') + '</div>';
  let h = titulo(ed ? 'Editar movimiento' : 'Registrar');
  if (FORM.recuperado) h += '<div class="note info">Recuperé lo que estabas capturando. <button class="linkbtn" onclick="empezarDeNuevo()">Empezar de nuevo</button></div>';
  if (t === 'Ajuste') h += '<div class="note">Este ajuste se creó al cuadrar ' + esc(FORM.cuenta) + '. Puedes corregir el monto o eliminarlo.</div>';
  else {
    h += '<div class="seg" role="group" aria-label="Tipo de movimiento">' + ['Gasto', 'Ingreso', 'Traspaso', 'Personas'].map(x => {
      const destino = x === 'Personas' ? (persona ? t : 'Presté') : x;
      return '<button class="' + (grupo === x ? 'on' : '') + '" aria-pressed="' + (grupo === x) + '" onclick="setForm(\'tipo\',\'' + destino + '\')">' + x + '</button>';
    }).join('') + '</div>';
  }
  // Pagos fijos de un toque
  if (!ed && (t === 'Gasto' || t === 'Ingreso' || t === 'Traspaso')) {
    const mk = hoy().slice(0, 7), usados = new Set(DATA.movs.filter(m => m.fijo && m.fecha.slice(0, 7) === mk).map(m => m.fijo));
    const fs = DATA.fijos.filter(f => fijoVigente(f) && f.tipo === t).sort((a, b) => usados.has(a.id) - usados.has(b.id));
    if (fs.length) h += '<div class="quick" role="group" aria-label="Pagos fijos">' + fs.map(f => '<button class="' + (usados.has(f.id) ? 'done' : '') + '" onclick="aplicarFijo(\'' + jsq(f.id) + '\')">' +
      (usados.has(f.id) ? '✓ ' : '') + esc(f.nombre) + ' ' + money(f.monto, f.monto % 1 === 0) + '</button>').join('') + '</div>';
  }
  h += '<label class="amount"><span aria-hidden="true">$</span><input id="fMonto" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0.00" value="' + esc(FORM.monto) +
    '" oninput="if(FORM){FORM.monto=this.value;verCalc()}" onkeydown="if(event.key===\'Enter\')this.blur()" aria-label="Monto"></label><div class="calc" id="calc">' + textoCalc(FORM.monto) + '</div>';

  if (t === 'Traspaso') {
    h += '<div class="fl">De</div>' + chipsCuenta(cuentasPara(t, 'de'), 'cuenta', 'Cuenta de origen');
    h += '<div class="fl">A</div>' + chipsCuenta(cuentasPara(t, 'a'), 'aCuenta', 'Cuenta de destino');
    const dest = DATA.cuentas.find(c => c.nombre === FORM.aCuenta);
    h += '<p class="hint">' + (dest && esDeuda(dest) ? 'Pago a ' + esc(dest.nombre) + ': baja tu deuda. No cuenta como gasto.' : 'Para pagar una tarjeta o el préstamo, pasar dinero entre cuentas o sacar efectivo. No cuenta como gasto.') + '</p>';
  } else if (persona) {
    h += '<div class="fl">¿Qué pasó?</div><div class="pick" role="group" aria-label="Acción">' + TIPOS_PERSONA.map(x => '<button class="' + (t === x ? 'on' : '') + '" aria-pressed="' + (t === x) + '" onclick="setForm(\'tipo\',\'' + x + '\')">' + ACCION_PERSONA[x] + '</button>').join('') + '</div>';
    h += '<div class="fl">¿Quién?</div><div class="pick" role="group" aria-label="Persona">' + personasActivas().map(p => '<button class="' + (FORM.persona === p.nombre ? 'on' : '') + '" aria-pressed="' + (FORM.persona === p.nombre) + '" onclick="setForm(\'persona\',\'' + jsq(p.nombre) + '\')">' + esc(p.nombre) + '</button>').join('') +
      '<button class="mas" onclick="setForm(\'nuevaP\',true)">+ Otra persona</button></div>';
    if (FORM.nuevaP) h += '<input id="fNuevaP" class="inp" style="margin-top:8px" maxlength="40" placeholder="Nombre" value="' + esc(FORM.nuevaPNombre || '') + '" oninput="if(FORM){FORM.nuevaPNombre=this.value;FORM.persona=null}">';
    const sale = SALE_DINERO(t);
    h += '<div class="fl">' + (sale ? '¿De qué cuenta salió?' : '¿A dónde llegó?') + '</div>' + chipsCuenta(cuentasPara(t), 'cuenta', 'Cuenta');
    const p = DATA.personas.find(x => x.nombre === FORM.persona), monto = parseMonto(FORM.monto);
    if (p && monto > 0) {
      const antes = saldoPersona(p) - (FORM.id ? efectoPersona(DATA.movs.find(m => m.id === FORM.id)) : 0);
      const despues = r2(antes + (t === 'Presté' || t === 'Le pagué' ? monto : -monto));
      h += '<p class="hint">' + esc(p.nombre) + (despues > 0 ? ' te quedaría debiendo ' + money(despues) : despues < 0 ? ': le quedarías debiendo ' + money(-despues) : ' y tú quedarían a mano') + '.</p>';
      if (t === 'Me pagaron' && antes > 0 && monto > antes) h += '<p class="hint red">Es más de lo que te debía (' + money(antes) + '). Revisa el monto.</p>';
      if (t === 'Presté' && esDeuda(DATA.cuentas.find(c => c.nombre === FORM.cuenta) || {})) h += '<p class="hint red">Prestar con tarjeta de crédito: tú pagas los intereses de ese dinero.</p>';
    }
  } else if (t !== 'Ajuste') {
    const cats = catsOrdenadas(t === 'Ingreso' ? 'Ingreso' : 'Gasto');
    const visibles = FORM.verTodas || cats.length <= 7 ? cats : cats.slice(0, 6);
    if (FORM.categoria && visibles.indexOf(cats.find(c => c.nombre === FORM.categoria)) < 0) visibles.push(cats.find(c => c.nombre === FORM.categoria));
    h += '<div class="fl">' + (t === 'Ingreso' ? '¿De dónde viene?' : t === 'Reembolso' ? '¿Qué gasto te devolvieron?' : '¿En qué?') + '</div>';
    h += '<div class="pick" role="group" aria-label="Categoría">' + visibles.filter(Boolean).map(c => '<button class="' + (FORM.categoria === c.nombre ? 'on' : '') + '" aria-pressed="' + (FORM.categoria === c.nombre) + '" onclick="setForm(\'categoria\',\'' + jsq(c.nombre) + '\')">' +
      emo(ICONO[c.nombre]) + esc(c.nombre) + '</button>').join('') +
      (visibles.length < cats.length ? '<button class="mas" onclick="setForm(\'verTodas\',true)">Ver todas (' + cats.length + ')</button>' : '') + '</div>';
    if (t === 'Ingreso' || t === 'Reembolso') {
      h += '<button class="switch" role="switch" aria-checked="' + (t === 'Reembolso') + '" onclick="setForm(\'tipo\',\'' + (t === 'Reembolso' ? 'Ingreso' : 'Reembolso') + '\')"><span><b>Es un reembolso</b><br><span class="muted">Alguien te pagó su parte de algo que tú pagaste. Resta del gasto en vez de contar como ingreso.</span></span><span class="knob" aria-hidden="true"></span></button>';
    }
    h += '<div class="fl">' + (t === 'Gasto' ? '¿Con qué pagaste?' : '¿A dónde llegó?') + '</div>' + chipsCuenta(cuentasPara(t), 'cuenta', 'Cuenta');
    const c = DATA.cuentas.find(x => x.nombre === FORM.cuenta), monto = parseMonto(FORM.monto);
    if (t === 'Gasto' && c && esDeuda(c)) h += '<p class="hint red">Con tarjeta de crédito: sube tu deuda de ' + esc(c.nombre) + (monto > 0 ? ' a ' + money(-saldo(c) + monto - (FORM.id ? montoOriginal() : 0)) : '') + '.</p>';
  }
  const ph = { Gasto: 'Ej. Oxxo, gasolina Pemex', Ingreso: 'Ej. Quincena', Traspaso: 'Ej. Pago tarjeta', Reembolso: 'Ej. Aaron me pagó la pizza', Ajuste: '', 'Presté': 'Ej. Para la renta', 'Me pagaron': 'Ej. Abono', 'Me prestaron': '', 'Le pagué': '' }[t] || '';
  h += '<div class="fl"><label for="fDesc">Descripción</label></div><input id="fDesc" class="inp" maxlength="200" list="dlDesc" autocomplete="off" placeholder="' + ph + '" value="' + esc(FORM.desc) + '" oninput="if(FORM){FORM.desc=this.value}" onchange="alEscribirDesc(this.value)">' +
    '<datalist id="dlDesc">' + sugerenciasDesc(t).map(d => '<option value="' + esc(d) + '">').join('') + '</datalist>';
  const ayer = sumarDias(hoy(), -1);
  h += '<div class="fl">Fecha</div><div class="datewrap pick" role="group" aria-label="Fecha">' +
    '<button class="' + (FORM.fecha === hoy() ? 'on' : '') + '" aria-pressed="' + (FORM.fecha === hoy()) + '" onclick="setForm(\'fecha\',hoy())">Hoy</button>' +
    '<button class="' + (FORM.fecha === ayer ? 'on' : '') + '" aria-pressed="' + (FORM.fecha === ayer) + '" onclick="setForm(\'fecha\',\'' + ayer + '\')">Ayer</button>' +
    '<input type="date" id="fFecha" value="' + FORM.fecha + '" max="' + hoy() + '" onchange="if(this.value)setForm(\'fecha\',this.value)" aria-label="Otra fecha"></div>';
  const corte = minCorte();
  if (FORM.fecha < corte) h += '<p class="hint red">Esa fecha es anterior al corte (' + fechaCorta(corte) + '). Ese dinero ya está en los saldos del corte, así que no cambiará ningún saldo.</p>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="actbar">' + (ed ? '<button class="btn danger" onclick="borrarMovForm()">Eliminar</button>' : '<button class="btn ghost" onclick="cerrarHoja()">Cerrar</button>') +
    '<button class="btn" onclick="guardarMovForm()">' + (ed ? 'Guardar cambios' : 'Guardar') + '</button></div>';
  return h;
}
function montoOriginal() { const m = DATA.movs.find(x => x.id === FORM.id); return m && m.tipo === 'Gasto' && m.cuenta === FORM.cuenta ? m.monto : 0; }
function efectoPersona(m) { if (!m || !esPersonaTipo(m.tipo) || m.persona !== FORM.persona) return 0; return (m.tipo === 'Presté' || m.tipo === 'Le pagué') ? m.monto : -m.monto; }
function textoCalc(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  const n = parseMonto(t);
  if (/\d\s*[+-]\s*\d/.test(t)) return '= ' + money(n);
  if (/,\d{1,2}$/.test(t) && !/\./.test(t)) return 'Se guardará como ' + money(n);
  return '';
}
function verCalc() { const c = $('calc'); if (c && $('fMonto')) c.textContent = textoCalc($('fMonto').value); }
function guardarMovForm() {
  const t = FORM.tipo;
  FORM.monto = $('fMonto') ? $('fMonto').value : FORM.monto;
  FORM.desc = $('fDesc') ? $('fDesc').value.trim() : FORM.desc;
  const monto = parseMonto(FORM.monto);
  let nuevaPersona = null;
  if (esPersonaTipo(t) && FORM.nuevaP && String(FORM.nuevaPNombre || '').trim()) {
    const nom = FORM.nuevaPNombre.trim();
    const ex = DATA.personas.find(p => p.nombre.toLowerCase() === nom.toLowerCase());
    if (ex) FORM.persona = ex.nombre; else { nuevaPersona = nom; FORM.persona = nom; }
  }
  const falta = t === 'Ajuste' ? (monto === 0 ? 'Escribe el monto.' : '')
    : monto <= 0 ? 'Escribe cuánto fue.'
    : esPersonaTipo(t) && !FORM.persona ? 'Elige con quién fue.'
    : !FORM.cuenta ? (t === 'Gasto' ? 'Elige con qué pagaste.' : t === 'Traspaso' ? 'Elige de qué cuenta sale.' : SALE_DINERO(t) ? 'Elige de qué cuenta salió.' : 'Elige a qué cuenta llegó.')
    : t === 'Traspaso' && !FORM.aCuenta ? 'Elige a qué cuenta va.'
    : (t === 'Gasto' || t === 'Ingreso' || t === 'Reembolso') && !FORM.categoria ? 'Elige una categoría.' : '';
  if (falta) { FORM.err = falta; pintarHoja(); vibrar([20, 40, 20]); return; }
  const nuevo = !FORM.id;
  if (nuevaPersona) encolar('guardarPersona', [{ nombre: nuevaPersona, saldoCorte: 0, fechaCorte: minCorte() || hoy(), nota: '' }], true);
  const m = { id: FORM.id || uid(), fecha: FORM.fecha, tipo: t, monto: monto, cuenta: FORM.cuenta, aCuenta: t === 'Traspaso' ? FORM.aCuenta : '',
              categoria: (t === 'Traspaso' || esPersonaTipo(t)) ? '' : FORM.categoria, desc: FORM.desc, registrado: FORM.registrado || Date.now(),
              persona: esPersonaTipo(t) ? FORM.persona : '', fijo: FORM.fijo || '' };
  LS.set('fin_ult_cuenta_' + t, m.cuenta);
  if (t === 'Ingreso') LS.set('fin_ult_cat_Ingreso', m.categoria);
  FORM._guardado = true; LS.del('fin_draft');
  encolar('guardarMov', [m]);
  vibrar(15);
  cerrarHoja();
  const nombre = { Gasto: 'Gasto guardado', Ingreso: 'Ingreso guardado', Traspaso: 'Traspaso guardado', Reembolso: 'Reembolso guardado', Ajuste: 'Ajuste guardado' }[t] || 'Guardado';
  toast(nuevo ? nombre : 'Cambios guardados', nuevo ? { txt: 'Deshacer', fn: () => encolar('borrarMov', [m.id]) } : null);
}
function borrarMovForm() {
  const m = DATA.movs.find(x => x.id === FORM.id);
  if (!m) return cerrarHoja();
  const copia = Object.assign({}, m); delete copia._pend;
  FORM._guardado = true;
  encolar('borrarMov', [m.id]);
  cerrarHoja();
  toast('Movimiento eliminado', { txt: 'Deshacer', fn: () => encolar('guardarMov', [copia]) });
}

/* ---- Categoría: movimientos y presupuesto ---- */
function abrirCategoria(n) { FORM = { vista: 'cat', nombre: n }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaCategoria() {
  const c = DATA.categorias.find(x => x.nombre === FORM.nombre && x.tipo === 'Gasto');
  const movs = DATA.movs.filter(m => m.categoria === FORM.nombre && m.fecha.slice(0, 7) === MES && (m.tipo === 'Gasto' || m.tipo === 'Reembolso')).sort(ordenMov);
  let h = titulo(emo(ICONO[c.nombre]) + esc(c.nombre));
  if (c.nota) h += '<p class="hint" style="margin-top:-4px;margin-bottom:10px">' + esc(c.nota) + '</p>';
  h += '<div class="fl"><label for="fPres">Presupuesto mensual</label></div><label class="amount" style="padding:4px 14px"><span style="font-size:24px" aria-hidden="true">$</span>' +
    '<input id="fPres" inputmode="decimal" style="font-size:28px" value="' + (c.presupuesto || 0) + '"></label>';
  h += '<div class="fl" style="margin-top:18px">En ' + nombreMes(MES) + '</div>';
  h += movs.length ? '<div class="list">' + movs.map(filaMov).join('') + '</div>' : '<div class="list"><div class="empty">Sin movimientos este mes.</div></div>';
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="guardarPres()">Guardar presupuesto</button></div>';
  return h;
}
function guardarPres() {
  const v = Math.round(parseMonto($('fPres').value)), n = FORM.nombre;
  encolar('guardarPresupuesto', [n, v]);
  cerrarHoja(); toast('Presupuesto de ' + n + ' guardado');
}

/* ---- Cuadrar una cuenta con el saldo real ---- */
function abrirCuadrar(n) { FORM = { vista: 'cuadrar', nombre: n }; abrirHoja(); pintarHoja(); setTimeout(() => { const i = $('fReal'); if (i) i.focus(); }, 300); }
function hojaCuadrar() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre), s = saldo(c), deuda = esDeuda(c);
  let h = titulo('Cuadrar ' + esc(c.nombre));
  h += '<div class="card flat"><div class="muted">' + (deuda ? 'Lo que debes según la app' : 'Saldo según la app') + '</div><div class="amt num">' + money(deuda ? -s : s) + '</div></div>';
  h += '<div class="fl"><label for="fReal">' + (deuda ? '¿Cuánto debes según tu banco? (saldo usado)' : '¿Cuánto tienes según tu banco?') + '</label></div>';
  h += '<label class="amount"><span aria-hidden="true">$</span><input id="fReal" inputmode="decimal" placeholder="0.00" oninput="difCuadrar()"></label>';
  h += '<div id="difC" class="hint" aria-live="polite">La diferencia se registra como ajuste "Sin registrar" con fecha de hoy.</div>';
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="guardarCuadre()">Cuadrar</button></div>';
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
  const m = { id: uid(), fecha: hoy(), tipo: 'Ajuste', monto: d, cuenta: nombre, aCuenta: '', categoria: 'Sin registrar', desc: 'Ajuste al cuadrar', registrado: Date.now(), persona: '', fijo: '' };
  encolar('guardarMov', [m]);
  cerrarHoja(); toast(nombre + ' cuadrada', { txt: 'Deshacer', fn: () => encolar('borrarMov', [m.id]) });
}

/* ---- Editar cuenta: nombre, fechas, tasa, archivar ---- */
function abrirCuenta(n) { const c = DATA.cuentas.find(x => x.nombre === n); FORM = { vista: 'cuenta', nombre: n, nuevo: n, diaCorte: c.diaCorte || '', diaPago: c.diaPago || '', tasa: c.tasa ? r2(c.tasa * 100) : '', err: '' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaCuenta() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre), deuda = esDeuda(c), s = saldo(c);
  let h = titulo('Editar ' + esc(c.nombre));
  h += '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" value="' + esc(FORM.nuevo) + '" oninput="if(FORM){FORM.nuevo=this.value}">';
  if (deuda) {
    h += '<div class="grid2"><div><div class="fl"><label for="fCorte">Día de corte</label></div><input id="fCorte" class="inp" inputmode="numeric" placeholder="Ej. 9" value="' + esc(FORM.diaCorte) + '" oninput="if(FORM){FORM.diaCorte=this.value}"></div>' +
      '<div><div class="fl"><label for="fPago">Día límite de pago</label></div><input id="fPago" class="inp" inputmode="numeric" placeholder="Ej. 28" value="' + esc(FORM.diaPago) + '" oninput="if(FORM){FORM.diaPago=this.value}"></div></div>' +
      '<div class="fl"><label for="fTasa">Tasa de interés anual (%)</label></div><input id="fTasa" class="inp" inputmode="decimal" placeholder="Está en tu estado de cuenta, ej. 45" value="' + esc(FORM.tasa) + '" oninput="if(FORM){FORM.tasa=this.value}">' +
      '<p class="hint">Con la fecha de pago, Inicio te avisa 5 días antes. Con la tasa, el plan de deuda sabe cuál pagar primero.</p>';
  }
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="card flat" style="margin-top:16px"><div class="t1">' + (c.archivada ? 'Cuenta archivada' : 'Archivar cuenta') + '</div><div class="muted" style="margin:4px 0 8px">' +
    (c.archivada ? 'No aparece en tus listas ni al registrar.' : Math.abs(s) > 0.004 ? 'Para archivarla su saldo debe estar en $0 (ahora: ' + money(Math.abs(s)) + ').' : 'Ya está en $0. Al archivarla deja de aparecer en tus listas; su historial se queda.') + '</div>' +
    '<button class="btn sm ghost" ' + (!c.archivada && Math.abs(s) > 0.004 ? 'disabled' : '') + ' onclick="archivarCuenta(' + (!c.archivada) + ')">' + (c.archivada ? 'Volver a activar' : 'Archivar') + '</button></div>';
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="guardarCuentaForm()">Guardar</button></div>';
  return h;
}
function guardarCuentaForm() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre), nuevo = (FORM.nuevo || '').trim();
  const dia = v => { const n = parseInt(v, 10); return n >= 1 && n <= 31 ? n : null; };
  if (!nuevo) { FORM.err = 'Ponle nombre.'; return pintarHoja(); }
  if (nuevo !== c.nombre && DATA.cuentas.some(x => x.nombre.toLowerCase() === nuevo.toLowerCase())) { FORM.err = 'Ya tienes una cuenta con ese nombre.'; return pintarHoja(); }
  const t = parseMonto(FORM.tasa);
  const cambios = { nombre: c.nombre };
  if (esDeuda(c)) { cambios.diaCorte = dia(FORM.diaCorte); cambios.diaPago = dia(FORM.diaPago); cambios.tasa = t > 0 ? r2(t) / 100 : null; }
  if (nuevo !== c.nombre) cambios.nuevoNombre = nuevo;
  encolar('guardarCuenta', [cambios]);
  cerrarHoja(); toast('Cuenta guardada');
}
function archivarCuenta(si) { encolar('guardarCuenta', [{ nombre: FORM.nombre, archivada: si }]); const n = FORM.nombre; cerrarHoja(); toast(n + (si ? ' archivada' : ' activa de nuevo')); }

/* ---- Cuenta nueva ---- */
function abrirNuevaCuenta() { FORM = { vista: 'nuevaCuenta', tipo: 'Débito', nombre: '', saldo: '' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaNuevaCuenta() {
  const tipos = ['Débito', 'Ahorro', 'Efectivo', 'Crédito', 'Préstamo'], deuda = FORM.tipo === 'Crédito' || FORM.tipo === 'Préstamo';
  return titulo('Agregar cuenta o tarjeta') +
    '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" placeholder="Ej. Nu, Tarjeta Liverpool" value="' + esc(FORM.nombre) + '" oninput="if(FORM){FORM.nombre=this.value}">' +
    '<div class="fl">Tipo</div><div class="pick" role="group" aria-label="Tipo">' + tipos.map(t => '<button class="' + (FORM.tipo === t ? 'on' : '') + '" aria-pressed="' + (FORM.tipo === t) + '" onclick="setForm(\'tipo\',\'' + t + '\')">' + t + '</button>').join('') + '</div>' +
    '<div class="fl"><label for="fSal">' + (deuda ? '¿Cuánto debes hoy?' : '¿Cuánto tiene hoy?') + '</label></div>' +
    '<label class="amount"><span aria-hidden="true">$</span><input id="fSal" inputmode="decimal" placeholder="0.00" value="' + esc(FORM.saldo) + '" oninput="if(FORM){FORM.saldo=this.value}"></label>' +
    (FORM.err ? '<div class="note red" role="alert">' + esc(FORM.err) + '</div>' : '') +
    '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="guardarNuevaCuenta()">Agregar</button></div>';
}
function guardarNuevaCuenta() {
  const nombre = $('fNom').value.trim(), s = parseMonto($('fSal').value), deuda = FORM.tipo === 'Crédito' || FORM.tipo === 'Préstamo';
  if (!nombre) { FORM.err = 'Ponle nombre a la cuenta.'; return pintarHoja(); }
  if (DATA.cuentas.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) { FORM.err = 'Ya tienes una cuenta con ese nombre.'; return pintarHoja(); }
  encolar('guardarCuenta', [{ nombre: nombre, tipo: FORM.tipo, saldoCorte: deuda ? -Math.abs(s) : s, fechaCorte: hoy(), diaCorte: null, diaPago: null }]);
  cerrarHoja(); toast(nombre + ' agregada');
}

/* ---- Personas ---- */
function abrirNuevaPersona() { FORM = { vista: 'nuevaPersona', nombre: '', saldo: '', dir: 'me', nota: '' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaNuevaPersona() {
  return titulo('Agregar persona') +
    '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" value="' + esc(FORM.nombre) + '" oninput="if(FORM){FORM.nombre=this.value}">' +
    '<div class="fl">Hoy</div><div class="pick" role="group" aria-label="Quién debe">' +
    '<button class="' + (FORM.dir === 'me' ? 'on' : '') + '" aria-pressed="' + (FORM.dir === 'me') + '" onclick="setForm(\'dir\',\'me\')">Me debe</button>' +
    '<button class="' + (FORM.dir === 'yo' ? 'on' : '') + '" aria-pressed="' + (FORM.dir === 'yo') + '" onclick="setForm(\'dir\',\'yo\')">Le debo</button></div>' +
    '<div class="fl"><label for="fSal">¿Cuánto? (0 si están a mano)</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fSal" inputmode="decimal" placeholder="0.00" value="' + esc(FORM.saldo) + '" oninput="if(FORM){FORM.saldo=this.value}"></label>' +
    '<div class="fl"><label for="fNota">Nota</label></div><input id="fNota" class="inp" maxlength="200" placeholder="Ej. Le presté para su carro; me paga en diciembre" value="' + esc(FORM.nota) + '" oninput="if(FORM){FORM.nota=this.value}">' +
    '<p class="hint">Esto no mueve ninguna de tus cuentas: es lo que ya estaba prestado. Si le prestas hoy, usa + → Personas → Le presté.</p>' +
    (FORM.err ? '<div class="note red" role="alert">' + esc(FORM.err) + '</div>' : '') +
    '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="guardarNuevaPersona()">Agregar</button></div>';
}
function guardarNuevaPersona() {
  const nombre = $('fNom').value.trim(), s = Math.abs(parseMonto($('fSal').value));
  if (!nombre) { FORM.err = 'Escribe el nombre.'; return pintarHoja(); }
  if (DATA.personas.some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) { FORM.err = 'Ya existe una persona con ese nombre.'; return pintarHoja(); }
  encolar('guardarPersona', [{ nombre: nombre, saldoCorte: FORM.dir === 'yo' ? -s : s, fechaCorte: hoy(), nota: $('fNota').value.trim() }]);
  cerrarHoja(); toast(nombre + ' agregada');
}
function abrirPersona(n) { const p = DATA.personas.find(x => x.nombre === n); FORM = { vista: 'persona', nombre: n, nuevo: n, nota: p.nota || '', err: '' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaPersona() {
  const p = DATA.personas.find(x => x.nombre === FORM.nombre), s = saldoPersona(p);
  const movs = DATA.movs.filter(m => m.persona === p.nombre).sort(ordenMov);
  let h = titulo(esc(p.nombre));
  h += '<div class="card flat"><div class="muted">' + (s > 0 ? 'Te debe' : s < 0 ? 'Le debes' : 'Están a mano') + '</div><div class="amt num ' + (s > 0 ? 'green' : s < 0 ? 'red' : '') + '">' + money(Math.abs(s)) + '</div>' +
    '<div class="muted">Al corte del ' + fechaCorta(p.fechaCorte) + ': ' + (p.saldoCorte >= 0 ? 'te debía ' : 'le debías ') + money(Math.abs(p.saldoCorte)) + '</div></div>';
  h += '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" value="' + esc(FORM.nuevo) + '" oninput="if(FORM){FORM.nuevo=this.value}">';
  h += '<div class="fl"><label for="fNota">Nota</label></div><input id="fNota" class="inp" maxlength="200" value="' + esc(FORM.nota) + '" oninput="if(FORM){FORM.nota=this.value}">';
  if (movs.length) h += '<div class="fl" style="margin-top:16px">Historial</div><div class="list">' + movs.map(filaMov).join('') + '</div>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="card flat" style="margin-top:16px"><div class="t1">' + (p.archivada ? 'Archivada' : 'Archivar') + '</div><div class="muted" style="margin:4px 0 8px">' +
    (p.archivada ? 'No aparece en tus listas.' : Math.abs(s) > 0.004 ? 'Para archivarla deben estar a mano.' : 'Están a mano. Al archivarla deja de aparecer; su historial se queda.') + '</div>' +
    '<button class="btn sm ghost" ' + (!p.archivada && Math.abs(s) > 0.004 ? 'disabled' : '') + ' onclick="archivarPersona(' + (!p.archivada) + ')">' + (p.archivada ? 'Volver a activar' : 'Archivar') + '</button></div>';
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="guardarPersonaForm()">Guardar</button></div>';
  return h;
}
function guardarPersonaForm() {
  const p = DATA.personas.find(x => x.nombre === FORM.nombre), nuevo = (FORM.nuevo || '').trim();
  if (!nuevo) { FORM.err = 'Escribe el nombre.'; return pintarHoja(); }
  if (nuevo !== p.nombre && DATA.personas.some(x => x.nombre.toLowerCase() === nuevo.toLowerCase())) { FORM.err = 'Ya existe una persona con ese nombre.'; return pintarHoja(); }
  const cambios = { nombre: p.nombre, nota: FORM.nota.trim() };
  if (nuevo !== p.nombre) cambios.nuevoNombre = nuevo;
  encolar('guardarPersona', [cambios]);
  cerrarHoja(); toast('Guardado');
}
function archivarPersona(si) { encolar('guardarPersona', [{ nombre: FORM.nombre, archivada: si }]); const n = FORM.nombre; cerrarHoja(); toast(n + (si ? ' archivada' : ' activa de nuevo')); }

/* ---- Pagos fijos ---- */
function abrirFijo(id) {
  const f = id ? DATA.fijos.find(x => x.id === id) : null;
  FORM = { vista: 'fijo', id: f ? f.id : null, nombre: f ? f.nombre : '', tipo: f ? f.tipo : 'Gasto', monto: f ? String(f.monto) : '', categoria: f ? f.categoria : null,
           cuenta: f ? f.cuenta : '', aCuenta: f ? (f.aCuenta || '') : '', dia: f && f.dia ? String(f.dia) : '', activo: f ? f.activo !== false : true, err: '' };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function hojaFijo() {
  const deudaFijo = FORM.tipo === 'Traspaso';
  const cats = FORM.tipo === 'Ingreso' ? catsIngreso() : catsGasto();
  const cs = FORM.tipo === 'Gasto' ? activas().filter(c => c.tipo !== 'Préstamo') : activas().filter(c => !esDeuda(c));
  let h = titulo(FORM.id ? 'Editar pago fijo' : 'Nuevo pago fijo');
  h += '<div class="seg" role="group" aria-label="Tipo">' + ['Gasto', 'Ingreso', 'Traspaso'].map(x => '<button class="' + (FORM.tipo === x ? 'on' : '') + '" aria-pressed="' + (FORM.tipo === x) + '" onclick="FORM.categoria=null;setForm(\'tipo\',\'' + x + '\')">' + TIPO_FIJO[x] + '</button>').join('') + '</div>';
  h += '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" placeholder="Ej. Spotify" value="' + esc(FORM.nombre) + '" oninput="if(FORM){FORM.nombre=this.value}">';
  h += '<div class="fl"><label for="fMontoF">Monto</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fMontoF" inputmode="decimal" placeholder="0.00" value="' + esc(FORM.monto) + '" oninput="if(FORM){FORM.monto=this.value}"></label>';
  if (deudaFijo) h += '<div class="fl">¿A qué deuda?</div><div class="pick" role="group" aria-label="Deuda">' + activas().filter(esDeuda).map(c => '<button class="debtacc' + (FORM.aCuenta === c.nombre ? ' on' : '') + '" aria-pressed="' + (FORM.aCuenta === c.nombre) + '" onclick="setForm(\'aCuenta\',\'' + jsq(c.nombre) + '\')">' + esc(c.nombre) + '</button>').join('') + '</div><p class="hint">Cuenta como traspaso: baja tu deuda y no cuenta como gasto. Cuando esa deuda llegue a $0, deja de aparecer.</p>';
  else h += '<div class="fl">Categoría</div><div class="pick" role="group" aria-label="Categoría">' + cats.map(c => '<button class="' + (FORM.categoria === c.nombre ? 'on' : '') + '" aria-pressed="' + (FORM.categoria === c.nombre) + '" onclick="setForm(\'categoria\',\'' + jsq(c.nombre) + '\')">' + emo(ICONO[c.nombre]) + esc(c.nombre) + '</button>').join('') + '</div>';
  h += '<div class="fl">' + (deudaFijo ? '¿De qué cuenta pagas?' : 'Cuenta') + '</div><div class="pick" role="group" aria-label="Cuenta"><button class="' + (!FORM.cuenta ? 'on' : '') + '" aria-pressed="' + (!FORM.cuenta) + '" onclick="setForm(\'cuenta\',\'\')">Preguntar cada vez</button>' +
    cs.map(c => '<button class="' + (esDeuda(c) ? 'debtacc' : '') + (FORM.cuenta === c.nombre ? ' on' : '') + '" aria-pressed="' + (FORM.cuenta === c.nombre) + '" onclick="setForm(\'cuenta\',\'' + jsq(c.nombre) + '\')">' + esc(c.nombre) + '</button>').join('') + '</div>';
  h += '<div class="fl"><label for="fDia">Día del mes (opcional)</label></div><input id="fDia" class="inp" inputmode="numeric" placeholder="Ej. 2" value="' + esc(FORM.dia) + '" oninput="if(FORM){FORM.dia=this.value}">';
  if (FORM.id) h += '<button class="switch" role="switch" aria-checked="' + FORM.activo + '" onclick="setForm(\'activo\',' + !FORM.activo + ')"><span><b>Activo</b><br><span class="muted">Si lo pausas, no cuenta como comprometido.</span></span><span class="knob" aria-hidden="true"></span></button>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="actbar">' + (FORM.id ? '<button class="btn danger" onclick="borrarFijoForm()">Eliminar</button>' : '<button class="btn ghost" onclick="cerrarHoja()">Cerrar</button>') + '<button class="btn" onclick="guardarFijoForm()">Guardar</button></div>';
  return h;
}
function guardarFijoForm() {
  const nombre = (FORM.nombre || '').trim(), monto = parseMonto(FORM.monto), dia = parseInt(FORM.dia, 10);
  if (!nombre) { FORM.err = 'Ponle nombre.'; return pintarHoja(); }
  if (monto <= 0) { FORM.err = 'Escribe el monto.'; return pintarHoja(); }
  if (FORM.tipo === 'Traspaso' ? !FORM.aCuenta : !FORM.categoria) { FORM.err = FORM.tipo === 'Traspaso' ? 'Elige a qué deuda va el pago.' : 'Elige una categoría.'; return pintarHoja(); }
  encolar('guardarFijo', [{ id: FORM.id || 'fijo-' + uid(), nombre: nombre, tipo: FORM.tipo, monto: monto, categoria: FORM.tipo === 'Traspaso' ? '' : FORM.categoria, cuenta: FORM.cuenta || '',
    aCuenta: FORM.tipo === 'Traspaso' ? FORM.aCuenta : '', dia: dia >= 1 && dia <= 31 ? dia : null, activo: FORM.activo }]);
  cerrarHoja(); toast('Pago fijo guardado');
}
function borrarFijoForm() {
  const f = DATA.fijos.find(x => x.id === FORM.id); if (!f) return cerrarHoja();
  const copia = Object.assign({}, f);
  encolar('borrarFijo', [f.id]);
  cerrarHoja(); toast(f.nombre + ' eliminado', { txt: 'Deshacer', fn: () => encolar('guardarFijo', [copia]) });
}

/* ---- Plan de deuda ---- */
function abrirPlan() { FORM = { vista: 'plan', abono: String(abonoMensual() || '') }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaPlan() {
  const abono = parseMonto(FORM.abono), plan = planDeuda(abono), p = patrimonio();
  let h = titulo('Plan para salir de deudas');
  h += '<div class="fl"><label for="fAbono">¿Cuánto puedes abonar al mes en total?</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fAbono" inputmode="decimal" value="' + esc(FORM.abono) + '" oninput="if(FORM){FORM.abono=this.value}" onchange="pintarHoja()"></label>';
  h += '<p class="hint">Referencia: 2 quincenas de $7,500 menos tu presupuesto de ' + money(resumenMes(hoy().slice(0, 7)).presupuesto, true) + ' dejan unos ' + money(15000 - resumenMes(hoy().slice(0, 7)).presupuesto, true) + '.</p>';
  if (!plan.orden.length) return h + '<div class="note info">No tienes deudas con bancos. 🎉</div><div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button></div>';
  if (plan.meses) h += '<div class="card" style="margin-top:12px"><div class="muted">Terminas de pagar ' + money(p.deuda, true) + ' en</div><div class="amt">' + plan.meses + ' meses</div><div class="muted">Hacia ' + mesDentro(plan.meses) + (plan.interes ? ', con unos ' + money(plan.interes, true) + ' de intereses' : '') + '.</div></div>';
  else if (abono > 0) h += '<div class="note red">Con ' + money(abono, true) + ' al mes los intereses crecen más rápido de lo que pagas. Sube el abono.</div>';
  h += '<div class="fl">Orden de pago</div><div class="card" style="padding:4px 16px">' + plan.orden.map((d, i) =>
    '<div class="plan-row"><span class="n">' + (i + 1) + '</span><span><b>' + esc(d.c.nombre) + '</b><br><span class="muted">' + (d.c.tasa ? 'Tasa ' + (d.c.tasa * 100).toFixed(1) + '%' : 'Sin tasa capturada') + (d.fin ? ', liquidada hacia ' + mesDentro(d.fin) : '') + '</span></span><span class="num">' + money(-saldo(d.c)) + '</span></div>').join('') + '</div>';
  h += '<p class="hint">Todo lo que puedas abonar va a la #1; a las demás les pagas solo el mínimo hasta que la #1 quede en cero, y luego sigues con la #2. ' +
    (plan.sinTasa ? '<b>Faltan tasas:</b> sin ellas ordeno por saldo y el cálculo no incluye intereses. Captúralas en Cuentas → Editar (vienen en tu estado de cuenta como "tasa anual").' : 'Se ordena de mayor a menor tasa: así pagas menos intereses.') + '</p>';
  h += '<p class="hint">El cálculo no incluye compras nuevas a crédito. Si sigues usando las tarjetas, la fecha se aleja.</p>';
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="guardarAbono()">Guardar abono</button></div>';
  return h;
}
function guardarAbono() { const v = parseMonto($('fAbono').value); if (v <= 0) return toast('Escribe cuánto puedes abonar'); encolar('guardarConfig', ['Abono mensual a deudas', v]); cerrarHoja(); toast('Abono mensual guardado'); }

arrancar();
