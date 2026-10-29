/* Finanzas v7.0 – app instalable de Martin (PWA y APK de Android con Capacitor).
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
// "Pagué" y "pague" encuentran lo mismo
function sinAcentos(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ===================== Botones sin código en el HTML =====================
 * En vez de un onclick con código, los botones llevan al('click', 'irA', 'Inicio'), que escribe
 * data-click="irA" data-click-a='["Inicio"]'. Un solo escuchador por tipo de evento llama a la función con
 * this = el elemento y EVENTO = el evento, igual que el onclick de antes. Así la CSP prohíbe todo script en línea
 * y un nombre o descripción con código nunca se puede ejecutar.
 */
let EVENTO = null;
function al(tipo, fn, ...args) { return 'data-' + tipo + '="' + fn + '"' + (args.length ? ' data-' + tipo + '-a="' + esc(JSON.stringify(args)) + '"' : ''); }
function accionDe(nombre) {
  const f = /^[A-Za-z_]\w*$/.test(nombre) ? window[nombre] : null;
  // solo funciones de la app, nunca las del navegador (alert, open, eval…)
  return typeof f === 'function' && !/\[native code\]/.test(Function.prototype.toString.call(f)) ? f : null;
}
[['click', 'click'], ['input', 'input'], ['change', 'change'], ['keydown', 'keydown'], ['focusin', 'focus'], ['mousedown', 'mousedown']].forEach(([evento, tipo]) => document.addEventListener(evento, ev => {
  // Recorre del elemento tocado hacia arriba, como hacían los onclick (un botón dentro de una tarjeta llama a los dos)
  for (const el of ev.composedPath()) {
    if (!el.getAttribute || ev.cancelBubble) break;
    const nombre = el.getAttribute('data-' + tipo);
    if (!nombre) continue;
    const f = accionDe(nombre);
    if (!f) { console.error('Acción desconocida: ' + nombre); continue; }
    let args = [];
    try { args = JSON.parse(el.getAttribute('data-' + tipo + '-a') || '[]'); } catch (e) {}
    EVENTO = ev;
    try { f.apply(el, args); } finally { EVENTO = null; }
  }
}));
// Acciones chicas que antes eran código suelto en el HTML
function recargar() { location.reload(); }
function campoForm(k) { if (FORM) FORM[k] = this.value; }
// Tocar una sugerencia no le quita el foco a la descripción (así el teclado no se cierra)
function sinQuitarFoco() { EVENTO.preventDefault(); }
function enterSuelta() { if (EVENTO.key === 'Enter') this.blur(); }
function enterToca() { if (EVENTO.key === 'Enter') this.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
function verAvisos() { VER_AVISOS = !VER_AVISOS; pintar(); }
function vistaHero(x) { VISTA_HERO = x; LS.set('fin_vista_hero', x); pintar(); }
function verSemana(s) { SUB_ANALISIS = 'Semana'; SEMANA = s; irA('Análisis'); }
function irAnalisis(sub) { SUB_ANALISIS = sub; irA('Análisis'); }
function verPersonas() { irA('Cuentas'); setTimeout(() => { const e = $('sec-personas'); e && e.scrollIntoView(); }, 60); }
function verMovsDelMes() { MES = hoy().slice(0, 7); BUSCA = ''; irA('Movimientos'); }
function moverMes(d) { MES = mesSig(MES, d); pintar(); }
function moverMesCat(d) { MES_CAT = mesSig(MES_CAT, d); pintar(); }
function buscar() { BUSCA = this.value; pintarLista(); }
function buscarCuenta(n) { BUSCA = n; cerrarHoja(); irA('Movimientos'); }
function filtrar(t) { FILTRO = t; pintar(); }
function verAnalisis(x) { SUB_ANALISIS = x; pintar(); }
function moverSemana(d) { SEMANA += d; pintar(); }
function elegirRango(r) { RANGO = r; pintar(); }
function pasoGuia(d) { FORM.paso += d; pintarHoja(); }
function escribirMonto() { if (FORM) { FORM.monto = this.value; verCalc(); } }
function escribirNuevaPersona() { if (FORM) { FORM.nuevaPNombre = this.value; FORM.persona = null; } }
function escribirDesc() { if (FORM) { FORM.desc = this.value; verSugDesc(this.value); } }
function enfocarDesc() { if (!REPINTANDO) { const e = this; setTimeout(() => e.scrollIntoView({ block: 'center' }), 350); } }
function cambiarDesc() { alEscribirDesc(this.value); }
function fechaHoy() { setForm('fecha', hoy()); }
function fechaElegida() { if (this.value) setForm('fecha', this.value); }
function tipoFijo(x) { FORM.categoria = null; setForm('tipo', x); }
function cambiarHora() { horaAviso(this.value); }
function cambiarConexion() { cerrarHoja(); mostrarSetup(); }
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
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (accion ? '<button ' + al('click', 'usarToast') + '>' + esc(accion.txt) + '</button>' : '');
  t.className = 'toast show';
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = 'toast'; toastFn = null; }, accion ? 5500 : 2600);
}
function usarToast() { const f = toastFn; $('toast').className = 'toast'; toastFn = null; if (f) f(); }
/* ----- App nativa (APK con Capacitor): mismos archivos; dentro del APK usa el motor háptico y notificaciones reales ----- */
const NATIVO = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
function nativo(plugin, metodo, opts) {
  try { return window.Capacitor.nativePromise(plugin, metodo, opts || {}).catch(() => null); } catch (e) { return Promise.resolve(null); }
}
// Un número: toque ligero (o medio si es 15+). Un patrón: aviso de error.
function vibrar(ms) {
  if (NATIVO) { if (Array.isArray(ms)) nativo('Haptics', 'notification', { type: 'ERROR' }); else nativo('Haptics', 'impact', { style: (ms || 12) >= 15 ? 'MEDIUM' : 'LIGHT' }); return; }
  try { navigator.vibrate && navigator.vibrate(ms || 12); } catch (e) {}
}

const ICONO = {
  'Comida y antojos': '🌮', 'Salidas': '🎉', 'Gasolina': '⛽', 'Carro': '🚗', 'Familia y casa': '🏠',
  'Salud y cuidado personal': '💊', 'Suscripciones y seguros': '🔁', 'Gustos y compras': '🛍️', 'Viajes': '✈️',
  'Intereses y comisiones': '🏦', 'Otros': '📦',
  'Sueldo': '💼', 'Bonos y apoyos': '🎁', 'Trabajos extra': '🧾', 'Regalos y familia': '💝', 'Rendimientos': '📈', 'Otro ingreso': '💵'
};
const emo = s => s ? '<span aria-hidden="true">' + s + '</span> ' : '';
// Color de cada categoría (iconos de los movimientos)
const COLOR = {
  'Comida y antojos': '#F59E0B', 'Salidas': '#EC4899', 'Gasolina': '#EF4444', 'Carro': '#64748B', 'Familia y casa': '#10B981',
  'Salud y cuidado personal': '#06B6D4', 'Suscripciones y seguros': '#8B5CF6', 'Gustos y compras': '#F472B6', 'Viajes': '#3B82F6',
  'Intereses y comisiones': '#B45309', 'Otros': '#94A3B8',
  'Sueldo': '#22C55E', 'Bonos y apoyos': '#84CC16', 'Trabajos extra': '#14B8A6', 'Regalos y familia': '#F43F5E', 'Rendimientos': '#0EA5E9', 'Otro ingreso': '#22C55E'
};
function colorMov(m) {
  if (m.tipo === 'Traspaso') return '#7C8A94';
  if (m.tipo === 'Ajuste') return '#A1A1AA';
  if (esPersonaTipo(m.tipo)) return '#6366F1';
  return COLOR[m.categoria] || '#94A3B8';
}
// Cada cuenta se pinta como su plástico: Oro dorada, BBVA azul, Revolut grafito, Mercado Pago celeste…
function estiloCuenta(c) {
  const n = c.nombre.toLowerCase();
  if (/oro|gold/.test(n)) return 'oro';
  if (/bbva/.test(n)) return 'bbva';
  if (/revolut/.test(n)) return 'revolut';
  if (/mercado/.test(n)) return 'mp';
  if (/\bnu\b/.test(n)) return 'nu';
  return { 'Débito': 'deb', 'Ahorro': 'aho', 'Efectivo': 'efe', 'Crédito': 'cred', 'Préstamo': 'pres' }[c.tipo] || 'deb';
}
const ICONO_CUENTA = { 'Débito': '💳', 'Ahorro': '🐷', 'Efectivo': '💵', 'Crédito': '💳', 'Préstamo': '🏦' };
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
const VERSION_APP = '7.3';
let API = LS.get('fin_api', ''), KEY = LS.get('fin_key', ''), DEMO = LS.get('fin_demo', false);
let BASE = null;      // lo último que mandó la hoja
let DATA = null;      // BASE + cambios que aún no se suben
let TAB = 'Inicio', MES = hoy().slice(0, 7), FILTRO = 'Todos', BUSCA = '';
let FORM = null;      // formulario abierto en la hoja inferior
let VER_AVISOS = false, ACCION = null, RECARGA_PENDIENTE = false;
let VISTA_HERO = LS.get('fin_vista_hero', 'Quincena'), SUB_ANALISIS = 'Este mes', RANGO = 6, SEMANA = 0, MES_CAT = null;
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
  if (!db || !db.patrimonio) {
    const f = '2026-10-10';
    const c = (nombre, tipo, saldo, dc, dp) => ({ nombre, tipo, saldoCorte: saldo, fechaCorte: f, diaCorte: dc || null, diaPago: dp || null, tasa: null, archivada: false });
    db = { cuentas: [c('BBVA Débito', 'Débito', 415), c('Revolut', 'Ahorro', 4907.75), c('Mercado Pago', 'Débito', 28), c('Efectivo', 'Efectivo', 100),
        Object.assign(c('BBVA Oro', 'Crédito', -35085.28, 9, 28), { limite: 60000 }), c('Revolut Premium Grey', 'Crédito', -11875.57), c('Mercado Pago Crédito', 'Crédito', -6087.24), c('Préstamo Mercado Pago', 'Préstamo', -3147.48)],
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
      patrimonio: [['2026-06-01', 3200, 61500, 25000, 0], ['2026-07-01', 2800, 60100, 25000, 0], ['2026-08-01', 4100, 58700, 25000, 0], ['2026-09-01', 5000, 57200, 25000, 0]]
        .map(x => ({ fecha: x[0], disp: x[1], deuda: x[2], teDeben: x[3], debes: x[4], neto: x[1] - x[2] - x[4] })),
      metas: [{ id: 'meta-viaje', nombre: 'Viaje a Japón', objetivo: 40000, fecha: '2027-06-30', apartado: 6500, icono: '✈️', cumplida: false }],
      config: { 'Abono mensual a deudas': 6000 }, movs: [{ id: 'demo-msi', fecha: '2026-10-12', tipo: 'Gasto', monto: 4800, cuenta: 'BBVA Oro', aCuenta: '', categoria: 'Gustos y compras', desc: 'Audífonos', registrado: Date.now(), persona: '', fijo: '', meses: 6 }],
      hoja: 'Modo ejemplo', version: 5 };
    LS.set('fin_demo_db', db);
  }
  return db;
}
// Historial de ejemplo: tus totales reales por mes y categoría (jul 2025 – may 2026), un movimiento por categoría
const RESUMEN_DEMO = {"2025-07":{"Salidas":1985,"Gasolina":2634,"Suscripciones y seguros":868,"Comida y antojos":852,"Familia y casa":2700,"Gustos y compras":1615,"I":12000,"Viajes":10181,"Carro":600,"Salud y cuidado personal":250,"Otros":391},"2025-08":{"Viajes":511,"Gustos y compras":30,"Comida y antojos":1225,"Salidas":1746,"Suscripciones y seguros":619,"Familia y casa":6508,"Salud y cuidado personal":845,"Otros":2887,"I":12571,"Gasolina":862},"2025-09":{"I":13000,"Gasolina":2599,"Familia y casa":200,"Suscripciones y seguros":3019,"Salud y cuidado personal":1950,"Salidas":1911,"Comida y antojos":59},"2025-10":{"Salidas":853,"I":16200,"Suscripciones y seguros":856,"Salud y cuidado personal":1950,"Gustos y compras":2295,"Gasolina":1775,"Familia y casa":211,"Viajes":2454,"Comida y antojos":710,"Intereses y comisiones":1084,"Carro":1665,"Otros":166},"2025-11":{"Suscripciones y seguros":323,"Gustos y compras":1261,"Salud y cuidado personal":1230,"Comida y antojos":135,"I":12920,"Otros":1467,"Salidas":2922,"Gasolina":983,"Carro":130,"Familia y casa":238},"2025-12":{"Suscripciones y seguros":2288,"Comida y antojos":158,"Salud y cuidado personal":1300,"I":23877,"Gustos y compras":710,"Salidas":8705,"Gasolina":1708,"Otros":240,"Familia y casa":50},"2026-01":{"Salidas":6006,"Gasolina":1537,"Suscripciones y seguros":791,"I":17279,"Gustos y compras":2282,"Salud y cuidado personal":1714,"Familia y casa":120,"Comida y antojos":220,"Viajes":47609,"R":14308,"Otros":1265,"Carro":6749},"2026-02":{"Salidas":3635,"Suscripciones y seguros":791,"Comida y antojos":330,"Gasolina":1535,"I":16602,"Salud y cuidado personal":650,"Carro":7310,"Gustos y compras":301},"2026-03":{"R":10702,"Suscripciones y seguros":1468,"Salud y cuidado personal":2303,"Comida y antojos":317,"Salidas":751,"Familia y casa":50,"Otros":250,"Gasolina":1428,"Viajes":334,"Carro":6742,"I":24000,"Gustos y compras":293},"2026-04":{"Viajes":44245,"Otros":5135,"Suscripciones y seguros":1112,"Salidas":2229,"Gustos y compras":302,"Gasolina":1509,"Comida y antojos":239,"I":15500,"R":22117,"Salud y cuidado personal":3900,"Familia y casa":50},"2026-05":{"Suscripciones y seguros":964,"Otros":1679,"Salud y cuidado personal":1926,"Familia y casa":25,"Viajes":39381,"Comida y antojos":28,"Gustos y compras":325,"R":36923,"Salidas":958,"I":7500,"Gasolina":300}};
function demoHistorial() {
  const h = [];
  Object.keys(RESUMEN_DEMO).forEach(mk => Object.keys(RESUMEN_DEMO[mk]).forEach(c => {
    const v = RESUMEN_DEMO[mk][c], f = mk + '-15';
    if (c === 'I') h.push({ fecha: f, tipo: 'Ingreso', monto: v, categoria: 'Sueldo', desc: 'Sueldo' });
    else if (c === 'R') h.push({ fecha: f, tipo: 'Reembolso', monto: v, categoria: 'Viajes', desc: 'Reembolsos del viaje' });
    else h.push({ fecha: f, tipo: 'Gasto', monto: v, categoria: c, desc: c === 'Gasolina' ? 'Gas Pemex' : c === 'Suscripciones y seguros' ? 'Seguro Inbursa' : c === 'Viajes' ? 'Eurotrip' : '' });
  }));
  return h;
}
function demoGet() { const d = JSON.parse(JSON.stringify(demoDB())); d.historial = demoHistorial(); return new Promise(r => setTimeout(() => r(d), 150)); }
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
  d.personas = d.personas || []; d.fijos = d.fijos || []; d.config = d.config || {}; d.historial = d.historial || []; d.metas = d.metas || [];
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
      ['diaCorte', 'diaPago', 'tasa', 'archivada', 'limite', 'domiciliado'].forEach(k => { if (k in c) ex[k] = c[k]; });
      if (c.nuevoNombre && c.nuevoNombre !== c.nombre) {
        d.movs.forEach(m => { if (m.cuenta === c.nombre) m.cuenta = c.nuevoNombre; if (m.aCuenta === c.nombre) m.aCuenta = c.nuevoNombre; });
        d.cuentas.forEach(x => { if (x.domiciliado === c.nombre) x.domiciliado = c.nuevoNombre; });
        d.fijos.forEach(f => { if (f.cuenta === c.nombre) f.cuenta = c.nuevoNombre; if (f.aCuenta === c.nombre) f.aCuenta = c.nuevoNombre; });
        ex.nombre = c.nuevoNombre;
      }
    } else d.cuentas.push({ nombre: c.nombre, tipo: c.tipo, saldoCorte: c.saldoCorte, fechaCorte: c.fechaCorte, diaCorte: c.diaCorte || null, diaPago: c.diaPago || null, tasa: c.tasa || null, archivada: false, limite: c.limite || null, domiciliado: '' });
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
  } else if (op.action === 'guardarMeta') {
    const m = Object.assign({}, a[0]), i = d.metas.findIndex(x => x.id === m.id);
    if (i >= 0) d.metas[i] = Object.assign({}, d.metas[i], m); else d.metas.push(m);
  } else if (op.action === 'borrarMeta') {
    d.metas = d.metas.filter(x => x.id !== a[0]);
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
    // Lo que la hoja aceptó se aplica a la copia local, así no hay que descargar toda la hoja cada vez
    if (BASE) {
      q.forEach(op => { const r = res.find(x => x.id === op.id); if (r && r.ok) aplicarOp(BASE, op, true); });
      LS.set('fin_base', BASE);
    }
    guardarCola(cola().filter(op => !listos.has(op.id)));
    flushing = false;
    recalcular(); pintar();
    if (Date.now() - LS.get('fin_ultima', 0) > 5 * 60000) actualizar();
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
    recalcular(); pagosDomiciliados(); pintar(); programarAvisos();
    if (avisar === true) toast('Actualizado ✓');
  } catch (e) {
    if (!DATA) {
      $('loading').innerHTML = '<div><div class="t1">No pude leer tu hoja</div><p class="muted">' + esc(mensajeError(e)) +
        '</p><button class="btn" ' + al('click', 'recargar') + '>Reintentar</button> <button class="btn ghost" ' + al('click', 'mostrarSetup') + '>Revisar conexión</button></div>';
    } else if (avisar === true || /Clave|JSON|Unexpected/.test(e.message)) toast(mensajeError(e));
  } finally { cargando = false; pintarSync(); }
}

/* ===================== Cálculos ===================== */
// Con `hasta` (yyyy-mm-dd) da el saldo al final de ese día.
function saldo(c, hasta) {
  let s = c.saldoCorte;
  DATA.movs.forEach(m => {
    if (m.fecha < c.fechaCorte || (hasta && m.fecha > hasta)) return;
    if (m.cuenta === c.nombre) {
      if (m.tipo === 'Ingreso' || m.tipo === 'Reembolso' || m.tipo === 'Ajuste' || m.tipo === 'Me pagaron' || m.tipo === 'Me prestaron') s += m.monto;
      else s -= m.monto;   // Gasto, Traspaso (sale), Presté, Le pagué
    }
    if (m.tipo === 'Traspaso' && m.aCuenta === c.nombre) s += m.monto;
  });
  return r2(s);
}
// Positivo: te debe. Negativo: le debes.
function saldoPersona(p, hasta) {
  let s = p.saldoCorte;
  DATA.movs.forEach(m => {
    if (m.persona !== p.nombre || m.fecha < p.fechaCorte || (hasta && m.fecha > hasta)) return;
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
const proximaFecha = dia => { const d = proximoDia(dia); return d === null ? null : sumarDias(hoy(), d); };

/* ---- Tarjetas de crédito: corte, fecha límite y financiamiento ---- */
const conDia = (mk, d) => mk + '-' + pad(Math.min(d, diasDelMes(mk)));
// Una compra entra al siguiente corte (el día del corte cuenta) y se paga en la fecha límite que sigue a ese corte.
function cicloTarjeta(c, fecha) {
  if (!c || !c.diaCorte || !c.diaPago) return null;
  let corte = conDia(fecha.slice(0, 7), c.diaCorte);
  if (corte < fecha) corte = conDia(mesSig(fecha.slice(0, 7), 1), c.diaCorte);
  let pago = conDia(corte.slice(0, 7), c.diaPago);
  if (pago <= corte) pago = conDia(mesSig(corte.slice(0, 7), 1), c.diaPago);
  return { corte, pago, dias: difDias(fecha, pago), mejor: sumarDias(corte, 1) };
}
// El corte más reciente que ya pasó (el de hoy todavía no cierra)
function ultimoCorte(c) {
  if (!c.diaCorte) return null;
  const mk = hoy().slice(0, 7), k = conDia(mk, c.diaCorte);
  return k < hoy() ? k : conDia(mesSig(mk, -1), c.diaCorte);
}
/* ---- Meses sin intereses: la compra sube tu deuda completa, pero al estado de cuenta solo entra una mensualidad por corte ---- */
const esMSI = m => m.tipo === 'Gasto' && m.meses > 1;
const mensualidad = m => r2(m.monto / m.meses);
const PLAZOS_MSI = [3, 6, 9, 12, 18, 24];
// Cuántas mensualidades de una compra a meses entraron en los estados de cuenta que cierran hasta `corte`
function mensualidades(m, c, corte) {
  const ci = cicloTarjeta(c, m.fecha);
  if (!ci || ci.corte > corte) return 0;
  const n = (+corte.slice(0, 4) - +ci.corte.slice(0, 4)) * 12 + (+corte.slice(5, 7) - +ci.corte.slice(5, 7)) + 1;
  return Math.min(m.meses, n);
}
// Compras a meses que todavía tienen mensualidades por cobrar
function comprasMSI(c) {
  const k = ultimoCorte(c);
  return DATA.movs.filter(m => esMSI(m) && m.cuenta === c.nombre).map(m => {
    const pagadas = k ? mensualidades(m, c, k) : 0;
    return { m, pagadas, mensual: mensualidad(m), resta: r2(m.monto - mensualidad(m) * pagadas) };
  }).filter(x => x.pagadas < x.m.meses).sort((a, b) => (a.m.fecha < b.m.fecha ? 1 : -1));
}
// Estado de cuenta que cerró en `k`: lo que debías al corte, sin lo que todavía no te cobran de compras a meses.
// Es aproximado: sale de lo que registras (las compras a meses de antes de usar la app no las conoce).
function estadoCuenta(c, k) {
  const ci = cicloTarjeta(c, k);
  if (!ci || k < c.fechaCorte) return null;
  const antes = conDia(mesSig(k.slice(0, 7), -1), c.diaCorte);
  let diferido = 0, msi = 0;
  DATA.movs.forEach(m => {
    if (!esMSI(m) || m.cuenta !== c.nombre || m.fecha > k) return;
    const n = mensualidades(m, c, k);
    diferido += m.monto - mensualidad(m) * n;
    if (n > mensualidades(m, c, antes)) msi += mensualidad(m);
  });
  const alCorte = Math.max(0, -saldo(c, k) - diferido);
  const pagado = DATA.movs.filter(m => m.tipo === 'Traspaso' && m.aCuenta === c.nombre && m.fecha > k).reduce((s, m) => s + m.monto, 0);
  return { corte: k, limite: ci.pago, total: r2(alCorte), falta: r2(Math.max(0, alCorte - pagado)), msi: r2(msi) };
}
// Lo que falta pagar del último estado de cuenta para no generar intereses (mientras no pase la fecha límite)
function pagoSinIntereses(c) {
  const k = ultimoCorte(c), e = k && estadoCuenta(c, k);
  return e && e.limite >= hoy() ? e : null;
}
function htmlFinanciamiento(c, fecha, monto) {
  const ci = cicloTarjeta(c, fecha);
  let h = '<div class="finan" role="note"><span class="finan-ic" aria-hidden="true">💳</span><div>';
  if (ci) {
    h += 'Entra al corte del <b>' + fechaCorta(ci.corte) + '</b> y la pagas hasta el <b>' + fechaCorta(ci.pago) + '</b>: <b>' + ci.dias + ' días</b> de financiamiento sin intereses si pagas el total.';
    const max = cicloTarjeta(c, ci.mejor).dias;
    if (ci.dias < 25 && max - ci.dias >= 15) h += '<div class="muted" style="margin-top:4px">Si es algo grande y puede esperar, cómpralo el ' + fechaCorta(ci.mejor) + ': tendrías ' + max + ' días.</div>';
  } else h += 'Pon el día de corte y de pago de ' + esc(c.nombre) + ' (Cuentas → ' + esc(c.nombre) + ' → Editar) y te digo cuántos días de financiamiento te da cada compra.';
  if (monto > 0) h += '<div class="muted" style="margin-top:4px">Tu deuda en ' + esc(c.nombre) + ' quedaría en ' + money(-saldo(c) + monto - (FORM && FORM.id ? montoOriginal() : 0)) + '.</div>';
  return h + '</div></div>';
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
  ACCION = p.get('accion') || null;       // accesos directos del ícono: gasto, pagar, cuadrar
  if (p.toString()) history.replaceState(null, '', location.pathname);
  history.replaceState({ base: true }, '');
  ponerGuardia();
  window.addEventListener('popstate', alIrAtras);
  aplicarTema(LS.get('fin_tema', 'auto'));
  aplicarDiscreto();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema(LS.get('fin_tema', 'auto'))); } catch (e) {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const tenia = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Versión nueva: si estás capturando algo, espera a que cierres la hoja
      if (!tenia) return;
      if (FORM) { RECARGA_PENDIENTE = true; } else location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  }
  // Pide a Chrome que no borre lo guardado en el celular aunque falte espacio
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  if (bloqueoOn()) pedirHuella();
  if (!(API && KEY) && !DEMO) return mostrarSetup();
  BASE = LS.get('fin_base', null);
  if (BASE) { normalizar(BASE); recalcular(); pintar(); ejecutarAccion(); revisarNativo(); }
  actualizar().then(() => { ejecutarAccion(); revisarNativo(); if (!LS.get('fin_guia', false) && !FORM) abrirGuia(); });
  enviar();
  window.addEventListener('online', () => { pintarSync(); enviar(); });
  window.addEventListener('offline', pintarSync);
  window.addEventListener('pagehide', guardarBorrador);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { guardarBorrador(); programarAvisos(); OCULTA_DESDE = Date.now(); return; }
    if (bloqueoOn() && OCULTA_DESDE && Date.now() - OCULTA_DESDE > 60000) pedirHuella();
    if (FORM && !$('sheet').classList.contains('show')) { $('sheet').classList.remove('hide'); $('scrim').classList.remove('hide'); $('sheet').classList.add('show'); $('scrim').classList.add('show'); pintarHoja(); }
    if (!FORM) fondoInerte(false);
    // Al volver a la app solo se baja la hoja si pasó más de minuto y medio (antes se bajaba completa en cada cambio de app)
    enviar(); if (!FORM && Date.now() - LS.get('fin_ultima', 0) > 90000) actualizar(); revisarNativo();
  });
  setInterval(enviar, 30000);
  setInterval(pintarSync, 60000);
}
// Siempre queda una entrada extra en el historial (la "guardia"): el gesto atrás cierra la hoja abierta o regresa a Inicio,
// y en Inicio hay que hacerlo dos veces seguidas para salir (en el APK la app se va al fondo).
let ATRAS_T = 0;
function ponerGuardia() { if (!(history.state && (history.state.guardia || history.state.hoja))) history.pushState({ guardia: 1 }, ''); }
function alIrAtras() {
  if (FORM) { cerrarHojaReal(); return; }
  if (history.state && (history.state.guardia || history.state.hoja)) return;
  if (TAB !== 'Inicio') { irA('Inicio'); ponerGuardia(); return; }
  if (Date.now() - ATRAS_T < 2200) {
    ATRAS_T = 0;
    if (NATIVO) { nativo('App', 'minimizeApp'); ponerGuardia(); } else history.back();
    return;
  }
  ATRAS_T = Date.now();
  toast('Desliza atrás otra vez para salir');
  ponerGuardia();
}
function ejecutarAccion() {
  if (!ACCION || !DATA) return;
  const a = ACCION; ACCION = null;
  if (a === 'gasto') abrirRegistro({});
  else if (a === 'pagar') { const pl = planDeuda(abonoMensual()); abrirRegistro({ tipo: 'Traspaso', aCuenta: pl.orden[0] ? pl.orden[0].c.nombre : null }); }
  else if (a === 'cuadrar') irA('Cuentas');
  else if (a === 'metas') abrirMeta();
  else if (a === 'ticket') abrirHojaTicket();
}
function mostrarSetup() {
  $('loading').classList.add('hide'); $('view').innerHTML = ''; $('nav').classList.add('hide');
  $('setup').classList.remove('hide');
  $('cfgApi').value = API || ''; $('cfgKey').value = KEY || '';
  $('cfgCancel').classList.toggle('hide', !DATA);
}
function guardarConfigConexion() {
  // Si pegas el link completo (…?api=…&k=…) en la casilla de la URL, se toman los dos datos de ahí
  const pegado = $('cfgApi').value.trim();
  if (/[?&]api=/.test(pegado)) {
    try { const u = new URL(pegado); $('cfgApi').value = u.searchParams.get('api') || ''; $('cfgKey').value = u.searchParams.get('k') || $('cfgKey').value; } catch (e) {}
  }
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
function irA(t) {
  TAB = t; if (t !== 'Movimientos') { FILTRO = 'Todos'; }
  const v = $('view');
  if (document.visibilityState === 'visible') { v.classList.remove('anima'); void v.offsetWidth; v.classList.add('anima'); }
  pintar(); window.scrollTo(0, 0);
}
function pintar() {
  if (!DATA) return;
  $('loading').classList.add('hide'); $('setup').classList.add('hide'); $('nav').classList.remove('hide');
  document.querySelectorAll('nav.tabs [data-tab]').forEach(b => { const on = b.dataset.tab === TAB; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  $('titulo').textContent = TAB === 'Inicio' ? 'Finanzas' : TAB;
  const foco = document.activeElement && ['buscar', 'rapido'].indexOf(document.activeElement.id) >= 0 ? document.activeElement.id : null;
  // Si algo falla al armar la pantalla, se avisa en lugar de dejarla en negro
  try { $('view').innerHTML = TAB === 'Inicio' ? vistaInicio() : TAB === 'Movimientos' ? vistaMovs() : TAB === 'Análisis' ? vistaAnalisis() : vistaCuentas(); }
  catch (e) {
    console.error(e);
    $('view').innerHTML = '<div class="center"><div><div class="t1">No pude mostrar esta pantalla</div><p class="muted">' + esc(e && e.message) + '</p><button class="btn" ' + al('click', 'recargar') + '>Recargar</button></div></div>';
  }
  // En Análisis, la pestaña elegida siempre a la vista aunque esté al final de la fila
  const chipOn = document.querySelector('#view [aria-label="Análisis"] .chip.on');
  if (chipOn) chipOn.parentNode.scrollLeft = chipOn.offsetLeft - 16;
  if (foco && $(foco)) { const b = $(foco); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  pintarSync();
  if (FORM) pintarHoja();
  programarWidget();
}

function avisos(r) {
  const lista = [];
  DATA.cuentas.filter(c => esDeuda(c) && c.diaPago && !c.archivada).forEach(c => {
    const d = proximoDia(c.diaPago), s = saldo(c), ps = pagoSinIntereses(c);
    if (ps && ps.falta <= 0.5) return;      // ya pagaste lo del estado de cuenta
    if (d !== null && d <= 5 && s < 0) lista.push({ p: 0, cls: 'red', h: '<b>' + esc(c.nombre) + ':</b> fecha límite de pago ' + (d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días') + '. ' +
      (ps ? 'Paga <b>' + money(ps.falta) + '</b> para no generar intereses (debes ' + money(-s) + ' en total).' : 'Debes ' + money(-s) + '.') +
      (c.domiciliado ? ' Está domiciliado desde ' + esc(c.domiciliado) + ': se registra solo.' : ' <button class="linkbtn" ' + al('click', 'pagarEstado', c.nombre) + '>Registrar pago</button>') });
  });
  activas().filter(c => c.tipo === 'Crédito' && uso(c) >= 90).forEach(c => lista.push({ p: 0, cls: 'red', h: '<b>' + esc(c.nombre) + ' está casi al tope:</b> usas ' + Math.round(uso(c)) + '% de tu límite. Te quedan ' + money(Math.max(0, c.limite + saldo(c)), true) + '.' }));
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
  if (lista.length > 2) h += '<button class="btn sm ghost" style="margin:-2px 0 10px" ' + al('click', 'verAvisos') + '>' + (VER_AVISOS ? 'Ver menos avisos' : 'Ver ' + (lista.length - 2) + ' avisos más') + '</button>';
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
        esc(esMov ? (esPersonaTipo(a.tipo) ? a.persona + ': ' + ACCION_PERSONA[a.tipo].toLowerCase() : (a.desc || a.categoria || a.tipo)) + ' · ' + money(a.monto) : x.op.action) + '</span></div>' +
        '<div class="muted">' + esc(x.error) + '</div><div class="actions">' +
        (esMov ? '<button class="btn sm" ' + al('click', 'corregirRechazado', x.id) + '>Corregir</button>' : '<button class="btn sm" ' + al('click', 'reintentarRechazado', x.id) + '>Reintentar</button>') +
        '<button class="btn sm ghost" ' + al('click', 'descartarRechazado', x.id) + '>Descartar</button></div></div>';
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

/* ===================== Periodos: quincena y semana ===================== */
function rangoQuincena(f) {
  const mk = f.slice(0, 7), d = +f.slice(8, 10), ult = diasDelMes(mk);
  return d <= 15 ? { desde: mk + '-01', hasta: mk + '-15', n: 1, dias: 15 } : { desde: mk + '-16', hasta: mk + '-' + pad(ult), n: 2, dias: ult - 15 };
}
function etiquetaRango(r) { const a = new Date(r.desde + 'T12:00:00'), b = new Date(r.hasta + 'T12:00:00'); return a.getDate() + '–' + b.getDate() + ' ' + MESES[b.getMonth()].slice(0, 3); }
function gastoNeto(desde, hasta) {
  let g = 0;
  DATA.movs.forEach(m => { if (m.fecha >= desde && m.fecha <= hasta) { if (m.tipo === 'Gasto') g += m.monto; else if (m.tipo === 'Reembolso') g -= m.monto; } });
  return r2(g);
}
// Fijos que corresponden a un periodo (por su día; los que no tienen día van en la primera quincena)
function fijosDelPeriodo(desde, hasta, tipo) {
  const mk = desde.slice(0, 7), q1 = desde.slice(8, 10) === '01';
  return DATA.fijos.filter(f => fijoVigente(f) && f.tipo === tipo && (f.dia ? (mk + '-' + pad(Math.min(f.dia, diasDelMes(mk)))) >= desde && (mk + '-' + pad(Math.min(f.dia, diasDelMes(mk)))) <= hasta : q1));
}
function inicioSemana(f) { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return claveDia(d); }
function racha() {
  const sinGasto = new Set(LS.get('fin_singasto', [])), con = new Set(DATA.movs.map(m => m.fecha));
  let d = hoy(), n = 0;
  if (!con.has(d) && !sinGasto.has(d)) d = sumarDias(d, -1);       // hoy todavía no cuenta en contra
  while ((con.has(d) || sinGasto.has(d)) && d >= minCorte()) { n++; d = sumarDias(d, -1); }
  return n;
}
function hoyNoGaste() {
  const l = LS.get('fin_singasto', []); if (l.indexOf(hoy()) < 0) l.push(hoy());
  LS.set('fin_singasto', l.slice(-120)); vibrar(15); pintar(); toast('Anotado: hoy sin gastos ✓');
}
function resumenSemana(offset) {
  const ini = sumarDias(inicioSemana(hoy()), -7 * offset), fin = sumarDias(ini, 6);
  const iniA = sumarDias(ini, -7), finA = sumarDias(ini, -1);
  const deudas = new Set(DATA.cuentas.filter(esDeuda).map(c => c.nombre));
  const r = { ini, fin, neto: gastoNeto(ini, fin), antes: gastoNeto(iniA, finA), cat: {}, deuda: 0, cobrado: 0, ingresos: 0, dias: 0 };
  const dias = new Set();
  DATA.movs.forEach(m => {
    if (m.fecha < ini || m.fecha > fin) return;
    dias.add(m.fecha);
    if (m.tipo === 'Gasto') r.cat[m.categoria] = (r.cat[m.categoria] || 0) + m.monto;
    if (m.tipo === 'Reembolso') r.cat[m.categoria] = (r.cat[m.categoria] || 0) - m.monto;
    if (m.tipo === 'Ingreso') r.ingresos += m.monto;
    if (m.tipo === 'Me pagaron') r.cobrado += m.monto;
    // cambio de deuda: compras suben, pagos bajan, ajustes según signo
    if (deudas.has(m.cuenta)) { if (m.tipo === 'Gasto' || m.tipo === 'Presté' || m.tipo === 'Le pagué' || m.tipo === 'Traspaso') r.deuda += m.monto; if (m.tipo === 'Ajuste') r.deuda -= m.monto; }
    if (m.tipo === 'Traspaso' && deudas.has(m.aCuenta)) r.deuda -= m.monto;
  });
  LS.get('fin_singasto', []).forEach(d => { if (d >= ini && d <= fin) dias.add(d); });
  r.dias = dias.size;
  r.top = Object.keys(r.cat).map(k => ({ k, v: r2(r.cat[k]) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  return r;
}
function htmlSemana(s, compacto) {
  const dif = s.antes > 0 ? Math.round((s.neto - s.antes) / s.antes * 100) : null;
  const hoyK = hoy(), enCurso = hoyK >= s.ini && hoyK <= s.fin;
  const diasPos = enCurso ? difDias(s.ini, hoyK) + 1 : 7;
  let h = '<div class="row between"><span class="t1">' + (enCurso ? 'Tu semana hasta hoy' : 'Tu semana') + '</span><span class="muted">' + fechaCorta(s.ini) + ' – ' + fechaCorta(s.fin) + '</span></div>' +
    '<div class="wk"><div><div class="muted">Gastaste</div><div class="amt num">' + money(s.neto) + '</div>' +
    (dif !== null ? '<div class="sub ' + (dif > 0 ? 'red' : 'green') + '">' + (dif > 0 ? '▲ ' + dif + '% más' : dif < 0 ? '▼ ' + Math.abs(dif) + '% menos' : 'Igual') + ' que la anterior</div>' : '<div class="sub">Sin semana anterior para comparar</div>') + '</div>' +
    '<div><div class="muted">Tu deuda</div><div class="amt num ' + (s.deuda > 0 ? 'red' : s.deuda < 0 ? 'green' : '') + '">' + (s.deuda > 0 ? '▲ ' : s.deuda < 0 ? '▼ ' : '') + money(Math.abs(s.deuda)) + '</div><div class="sub">' + (s.deuda > 0 ? 'subió' : s.deuda < 0 ? 'bajó' : 'sin cambio') + '</div></div></div>';
  if (s.top.length) h += '<div class="muted" style="margin-top:10px">En qué: ' + s.top.map(t => esc(t.k) + ' ' + money(t.v, true)).join(', ') + '.</div>';
  h += '<div class="muted" style="margin-top:6px">Registraste ' + s.dias + ' de ' + diasPos + ' días' + (s.cobrado ? '. Te pagaron ' + money(s.cobrado, true) : '') + '.</div>';
  return h;
}

/* ===================== Inicio ===================== */
function vistaInicio() {
  const mk = hoy().slice(0, 7), r = resumenMes(mk), p = patrimonio(), esQ = VISTA_HERO === 'Quincena';
  const rq = rangoQuincena(hoy());
  const desde = esQ ? rq.desde : mk + '-01', hasta = esQ ? rq.hasta : mk + '-' + pad(diasDelMes(mk));
  const presupuesto = esQ ? r.presupuesto / 2 : r.presupuesto, neto = esQ ? gastoNeto(desde, hasta) : r.neto;
  const queda = r2(presupuesto - neto), totalDias = esQ ? rq.dias : diasDelMes(mk), dia = difDias(desde, hoy()) + 1;
  const pct = presupuesto > 0 ? Math.min(100, neto / presupuesto * 100) : 0, ritmo = presupuesto * dia / totalDias;
  const cls = neto > presupuesto ? 'over' : neto > ritmo ? 'warn' : '';
  const periodo = esQ ? 'esta quincena (' + etiquetaRango(rq) + ')' : 'en ' + MESES[+mk.slice(5, 7) - 1];
  const usadosMes = new Set(DATA.movs.filter(m => m.fijo && m.fecha.slice(0, 7) === mk).map(m => m.fijo));
  const pend = (esQ ? fijosDelPeriodo(desde, hasta, 'Gasto') : DATA.fijos.filter(f => fijoVigente(f) && f.tipo === 'Gasto')).filter(f => fijosPendientes(mk).some(x => x.id === f.id) && !usadosMes.has(f.id));
  const comprometido = r2(pend.reduce((s, f) => s + f.monto, 0));
  let h = '<section class="hero" aria-label="Presupuesto">' +
    '<div class="seg mini" role="group" aria-label="Ver por">' + ['Quincena', 'Mes'].map(x => '<button class="' + (VISTA_HERO === x ? 'on' : '') + '" aria-pressed="' + (VISTA_HERO === x) + '" ' + al('click', 'vistaHero', x) + '>' + x + '</button>').join('') + '</div>' +
    (queda >= 0 ? '<div class="lbl">Te quedan para gastar ' + periodo + '</div><div class="big num">' + money(queda, true) + '</div>'
                : '<div class="lbl">Te pasaste del presupuesto ' + periodo + ' por</div><div class="big neg num">' + money(-queda, true) + '</div>') +
    '<div class="of">Llevas ' + money(neto, true) + ' de ' + money(presupuesto, true) + '. ' + (neto > ritmo ? 'Vas más rápido de lo que alcanza.' : 'Vas a buen ritmo.') + '</div>' +
    '<div class="meter" role="img" aria-label="Gastado ' + Math.round(pct) + ' por ciento; día ' + dia + ' de ' + totalDias + '"><div class="' + cls + '" style="width:' + pct.toFixed(1) + '%"></div><i class="today" style="left:' + (dia / totalDias * 100).toFixed(1) + '%"></i></div>' +
    '<div class="legend"><span>Día ' + dia + ' de ' + totalDias + '</span><span>Lo sano a hoy: ' + money(ritmo, true) + '</span></div>' +
    (!esQ && dia >= 3 ? '<div class="fixed-line">A este ritmo terminas ' + MESES[+mk.slice(5, 7) - 1] + ' en <b>' + money(proyeccionMes(mk).proy, true) + '</b>.</div>' : '') +
    (comprometido > 0 ? '<div class="fixed-line">De lo que te queda, <b>' + money(comprometido) + '</b> ya está apartado para ' + esc(pend.map(f => f.nombre).join(', ')) + '.</div>' : '') +
    '</section>';

  // Racha
  const ra = racha(), hoyCon = DATA.movs.some(m => m.fecha === hoy()) || LS.get('fin_singasto', []).indexOf(hoy()) >= 0;
  h += '<div class="streak"><span>' + (ra ? '🔥 <b>' + ra + (ra === 1 ? ' día</b> registrando' : ' días</b> seguidos registrando') : 'Empieza tu racha: registra hoy') + '</span>' +
    (!hoyCon ? '<button class="btn sm ghost" ' + al('click', 'hoyNoGaste') + '>Hoy no gasté</button>' : '<span class="muted">Hoy ✓</span>') + '</div>';

  h += barraRapida();
  h += accionesRapidas();
  h += tarjetaRechazados();
  h += tarjetaDetectados();
  h += avisos(r);
  h += tarjetaResumenListo();
  h += tarjetaFinanciamiento();

  // Resumen del domingo (domingo: semana en curso; lunes: la que acaba de terminar)
  const dsem = new Date(hoy() + 'T12:00:00').getDay();
  if (dsem === 0 || dsem === 1) h += '<button class="card" ' + al('click', 'verSemana', dsem === 1 ? 1 : 0) + '>' + htmlSemana(resumenSemana(dsem === 1 ? 1 : 0)) + '</button>';

  // Plan de la quincena
  h += tarjetaQuincena(rq);
  h += tarjetaProximos();
  h += tarjetaMetas();

  // Deuda (compacta)
  const bajo = r2(p.deudaCorte - p.deuda), plan = planDeuda(abonoMensual());
  h += '<button class="card" ' + al('click', 'abrirPlan') + ' aria-label="Ver plan de deuda"><div class="debt-head"><span class="t1">Deuda con bancos</span><span class="amt red num">' + money(p.deuda) + '</span></div>' +
    '<div class="meter" style="height:8px" aria-hidden="true"><div style="width:' + (p.deudaCorte > 0 ? Math.max(0, Math.min(100, bajo / p.deudaCorte * 100)) : 0).toFixed(1) + '%"></div></div>' +
    '<div class="muted">' + (bajo > 0 ? 'Has bajado ' + money(bajo) + ' desde el ' + fechaCorta(minCorte()) + '.' : bajo < 0 ? 'Subió ' + money(-bajo) + ' desde el ' + fechaCorta(minCorte()) + '.' : 'Igual que el ' + fechaCorta(minCorte()) + '.') +
    (plan.meses ? ' Terminas hacia <b class="green">' + mesDentro(plan.meses) + '</b>; primero ' + esc(plan.orden[0].c.nombre) + '.' : '') + '</div><div class="chev" aria-hidden="true">›</div></button>';

  h += '<div class="grid2">' +
    '<div class="stat"><div class="muted">Disponible</div><div class="amt sm num">' + money(p.disp) + '</div>' +
      (apartadoMetas() ? '<div class="sub">Libre: ' + money(p.disp - apartadoMetas(), true) + ' (' + money(apartadoMetas(), true) + ' en metas)</div>' : '') + '</div>' +
    '<div class="stat"><div class="muted">Patrimonio neto</div><div class="amt sm num' + (p.neto < 0 ? ' red' : '') + '">' + money(p.neto) + '</div>' +
      (p.teDeben ? '<div class="sub">Si te pagan: ' + money(p.conCobros) + '</div>' : '') + '</div></div>';
  if (p.teDeben || p.debes) h += '<button class="card row between" style="margin-top:12px" ' + al('click', 'verPersonas') + '>' +
    '<span>' + (p.teDeben ? 'Te deben <b class="green num">' + money(p.teDeben) + '</b>' : '') + (p.teDeben && p.debes ? ' · ' : '') + (p.debes ? 'Debes <b class="red num">' + money(p.debes) + '</b>' : '') + '</span><span class="chev" aria-hidden="true">›</span></button>';

  const ult = DATA.movs.slice().sort(ordenMov).slice(0, 5);
  h += '<h2>Últimos movimientos' + (ult.length ? '<button class="more" ' + al('click', 'verMovsDelMes') + '>Ver todos</button>' : '') + '</h2>';
  h += ult.length ? '<div class="list">' + ult.map(filaMov).join('') + '</div>'
    : '<div class="list"><div class="empty">Aún no registras nada desde el corte.<br>Toca <b>+</b> cada vez que gastes o te paguen.</div></div>';
  return h;
}

/* Tu tarjeta para gastos: cuántos días de financiamiento te da hoy, cuándo corta y cuánto pagar */
function tarjetaFinanciamiento() {
  const n = cuentaGastos(), c = n && DATA.cuentas.find(x => x.nombre === n);
  if (!c || !esDeuda(c)) return '';
  const ci = cicloTarjeta(c, hoy()), ps = pagoSinIntereses(c);
  let h = '<div class="card fin-card"><button class="fin-head" ' + al('click', 'abrirDetalle', c.nombre) + ' aria-label="Ver ' + esc(c.nombre) + '">' +
    '<span class="mini-plas ' + estiloCuenta(c) + '" aria-hidden="true"></span><span class="tx"><span class="muted">Tu tarjeta para gastos</span><span class="t1">' + esc(c.nombre) + '</span></span><span class="chev" aria-hidden="true">›</span></button>';
  if (ci) {
    const dc = difDias(hoy(), ci.corte);
    h += '<div class="fin-big"><span class="amt num">' + ci.dias + ' días</span><span class="muted">de financiamiento para lo que compres hoy: lo pagas hasta el ' + fechaCorta(ci.pago) + '.</span></div>' +
      '<div class="qrow"><span>Próximo corte</span><b>' + (dc === 0 ? 'hoy' : dc === 1 ? 'mañana' : fechaCorta(ci.corte) + ' (en ' + dc + ' días)') + '</b></div>';
    if (dc <= 3) h += '<div class="qrow"><span>Mejor día para compras grandes</span><b>' + fechaCorta(ci.mejor) + ' (' + cicloTarjeta(c, ci.mejor).dias + ' días)</b></div>';
  } else h += '<p class="muted" style="margin:8px 0 0">Captura su día de corte y de pago para ver cuántos días de financiamiento te da.</p>';
  const msi = comprasMSI(c);
  if (msi.length) h += '<div class="qrow"><span>Mensualidades a meses (' + msi.length + ')</span><b class="num">' + money(msi.reduce((t, x) => t + x.mensual, 0)) + ' al mes</b></div>';
  if (c.limite) h += '<div class="qrow"><span>Crédito disponible</span><b class="num">' + money(Math.max(0, c.limite + saldo(c)), true) + ' · usas ' + Math.round(uso(c)) + '%</b></div>';
  if (ps && ps.falta > 0.5) {
    h += '<div class="qrow tot"><span>Para no pagar intereses</span><b class="num">' + money(ps.falta) + ' antes del ' + fechaCorta(ps.limite) + '</b></div>' +
      (c.domiciliado ? '<p class="hint">Domiciliado desde ' + esc(c.domiciliado) + ': el ' + fechaCorta(ps.limite) + ' se registra solo.</p>'
        : '<button class="btn block" style="margin-top:10px" ' + al('click', 'pagarEstado', c.nombre) + '>Pagar estado de cuenta · ' + money(ps.falta, true) + '</button>');
  } else if (ps && ps.total > 0.5) h += '<div class="qrow tot"><span>Estado de cuenta del ' + fechaCorta(ps.corte) + '</span><b class="green">Pagado ✓</b></div>';
  return h + '</div>';
}
// Pago del estado de cuenta en un toque: monto y cuenta ya puestos
function pagarEstado(n) {
  const c = DATA.cuentas.find(x => x.nombre === n), ps = c && pagoSinIntereses(c);
  abrirRegistro({ tipo: 'Traspaso', aCuenta: n, monto: ps ? ps.falta : null, cuenta: c && c.domiciliado ? c.domiciliado : null, desc: ps ? 'Pago estado de cuenta ' + fechaCorta(ps.corte) : '' });
}
// Tarjetas domiciliadas: en la fecha límite el banco cobra solo, así que la app registra ese pago (una vez por estado de cuenta)
function pagosDomiciliados() {
  if (!DATA) return;
  DATA.cuentas.filter(c => c.tipo === 'Crédito' && c.domiciliado && !c.archivada && c.diaCorte && c.diaPago).forEach(c => {
    const origen = DATA.cuentas.find(x => x.nombre === c.domiciliado && !x.archivada && !esDeuda(x));
    if (!origen) return;
    let k = ultimoCorte(c);
    for (let i = 0; i < 2 && k; i++, k = conDia(mesSig(k.slice(0, 7), -1), c.diaCorte)) {
      const e = estadoCuenta(c, k), marca = 'auto:' + k;
      // Solo pagos de la última semana, para no inventar pagos viejos al activar la domiciliación
      if (!e || e.limite > hoy() || difDias(e.limite, hoy()) > 7 || e.falta <= 0.5) continue;
      if (DATA.movs.some(m => m.fijo === marca && m.aCuenta === c.nombre)) continue;
      encolar('guardarMov', [{ id: uid(), fecha: e.limite, tipo: 'Traspaso', monto: e.falta, cuenta: origen.nombre, aCuenta: c.nombre, categoria: '',
        desc: 'Pago domiciliado, estado de cuenta ' + fechaCorta(k), registrado: Date.now(), persona: '', fijo: marca, meses: null }], true);
      toast('Registré el pago domiciliado de ' + c.nombre + ': ' + money(e.falta));
    }
  });
}

/* Plan de la quincena: cómo repartir lo que llega */
function tarjetaQuincena(rq) {
  const sueldo = DATA.movs.filter(m => m.tipo === 'Ingreso' && m.categoria === 'Sueldo' && m.fecha >= rq.desde && m.fecha <= rq.hasta).reduce((s, m) => s + m.monto, 0);
  const fq = DATA.fijos.find(f => f.tipo === 'Ingreso' && f.categoria === 'Sueldo' && fijoVigente(f));
  const esperado = sueldo || (fq ? fq.monto : 0);
  if (!esperado) return '';
  const presupuestoQ = resumenMes(rq.desde.slice(0, 7)).presupuesto / 2, abonoQ = abonoMensual() / 2;
  const deudas = new Set(DATA.cuentas.filter(esDeuda).map(c => c.nombre));
  const abonado = r2(DATA.movs.filter(m => m.tipo === 'Traspaso' && deudas.has(m.aCuenta) && !deudas.has(m.cuenta) && m.fecha >= rq.desde && m.fecha <= rq.hasta).reduce((s, m) => s + m.monto, 0));
  const metasQ = r2(metasActivas().reduce((t, m) => t + (planMeta(m).porQ || 0), 0));
  const sobra = r2(esperado - presupuestoQ - abonoQ - metasQ);
  const plan = planDeuda(abonoMensual()), destino = plan.orden[0] ? plan.orden[0].c.nombre : null;
  const falta = r2(Math.max(0, abonoQ - abonado));
  return '<div class="card"><div class="row between"><span class="t1">Plan de esta quincena</span><span class="muted">' + etiquetaRango(rq) + '</span></div>' +
    '<div class="qrow"><span>' + (sueldo ? 'Te llegaron' : 'Te van a llegar') + '</span><b class="num">' + money(esperado) + '</b></div>' +
    '<div class="qrow"><span>Para gastos del presupuesto (incluye fijos)</span><b class="num">− ' + money(presupuestoQ) + '</b></div>' +
    '<div class="qrow"><span>Abono a deudas</span><b class="num">− ' + money(abonoQ) + '</b></div>' +
    (metasQ ? '<div class="qrow"><span>Para tus metas</span><b class="num">− ' + money(metasQ) + '</b></div>' : '') +
    '<div class="qrow tot"><span>' + (sobra >= 0 ? (metasQ ? 'Te sobra libre' : 'Te sobra para ahorrar') : 'Te falta') + '</span><b class="num ' + (sobra >= 0 ? 'green' : 'red') + '">' + money(Math.abs(sobra)) + '</b></div>' +
    (abonoQ > 0 ? '<div class="meter" style="height:7px" aria-hidden="true"><div style="width:' + Math.min(100, abonado / abonoQ * 100).toFixed(1) + '%"></div></div><div class="row between"><span class="muted">Abonado: ' + money(abonado) + ' de ' + money(abonoQ) + '</span>' +
      (falta > 0 && destino ? '<button class="btn sm" ' + al('click', 'abrirRegistro', { tipo: 'Traspaso', aCuenta: destino, monto: falta }) + '>Abonar ' + money(falta, true) + '</button>' : '<span class="green t1">✓</span>') + '</div>' : '') +
    (!sueldo ? '<p class="hint">Cuando te llegue, regístrala con + → Ingreso → Quincena.</p>' : '') + '</div>';
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
    d2 = (m.tipo === 'Reembolso' ? 'Reembolso: ' : '') + m.categoria + ', ' + m.cuenta + (esMSI(m) ? ' · ' + m.meses + ' MSI' : '');
    if (m.tipo === 'Gasto') txt = '−' + money(m.monto); else { cls = ' in'; txt = '+' + money(m.monto); }
  }
  const t1 = esPersonaTipo(m.tipo) ? (m.persona + (m.desc ? ': ' + m.desc : '')) : (m.desc || (m.tipo === 'Traspaso' ? 'Traspaso' : m.tipo === 'Ajuste' ? 'Ajuste al cuadrar' : m.categoria));
  return '<button class="mv" ' + al('click', 'editarMov', m.id) + '><span class="ic" style="--c:' + colorMov(m) + '" aria-hidden="true">' + icono(m) + '</span>' +
    '<span class="tx"><div class="d1">' + esc(t1) + (m.ticket ? ' <span aria-label="con ticket">🧾</span>' : '') + (m._pend ? '<i class="pend" title="Sin subir"></i><span class="sr">sin subir</span>' : '') + '</div><div class="d2">' + esc(d2) + '</div></span>' +
    '<span class="m num' + cls + '">' + txt + (extra ? '<small>' + extra + '</small>' : '') + '</span></button>';
}

function barraMes() {
  const ini = primerMes(), fin = hoy().slice(0, 7);
  return '<div class="monthbar"><button class="arrow" aria-label="Mes anterior" ' + (MES <= ini ? 'disabled' : '') + ' ' + al('click', 'moverMes', -1) + '>' + ARROW_L + '</button>' +
    '<span class="nm" aria-live="polite">' + nombreMes(MES) + '</span>' +
    '<button class="arrow" aria-label="Mes siguiente" ' + (MES >= fin ? 'disabled' : '') + ' ' + al('click', 'moverMes', 1) + '>' + ARROW_R + '</button></div>';
}

const FILTROS = { 'Todos': null, 'Gastos': ['Gasto'], 'Ingresos': ['Ingreso'], 'Reembolsos': ['Reembolso'], 'Traspasos': ['Traspaso'], 'Personas': TIPOS_PERSONA, 'Ajustes': ['Ajuste'] };
function vistaMovs() {
  return (BUSCA.trim() ? '<div style="height:10px"></div>' : barraMes()) +
    '<label class="sr" for="buscar">Buscar movimientos</label>' +
    '<input id="buscar" class="search" type="search" placeholder="Buscar en todos los meses (Oxxo, Aaron, BBVA…)" value="' + esc(BUSCA) + '" ' + al('input', 'buscar') + '>' +
    '<div class="chips" role="group" aria-label="Filtrar por tipo" style="margin-bottom:4px">' + Object.keys(FILTROS).map(t => '<button class="chip' + (FILTRO === t ? ' on' : '') + '" aria-pressed="' + (FILTRO === t) + '" ' + al('click', 'filtrar', t) + '>' + t + '</button>').join('') + '</div>' +
    '<div id="lista">' + listaMovs() + '</div>';
}
function listaMovs() {
  const q = sinAcentos(BUSCA.trim()), tipos = FILTROS[FILTRO];
  const lista = DATA.movs.filter(m => (q || m.fecha.slice(0, 7) === MES) && (!tipos || tipos.indexOf(m.tipo) >= 0) &&
    (!q || sinAcentos([m.desc, m.categoria, m.cuenta, m.aCuenta, m.persona, m.tipo, String(m.monto)].join(' ')).includes(q))).sort(ordenMov);
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
  if (MES === hoy().slice(0, 7)) h += tarjetaProyeccion(MES);
  if (r.ajustes) h += '<div class="note">Este mes hubo ' + money(Math.abs(r.ajustes)) + ' en ajustes al cuadrar: dinero que ' + (r.ajustes < 0 ? 'salió' : 'entró') + ' sin registrarse. Ya está contado en el ahorro.</div>';
  if (r.prestado || r.cobrado) h += '<div class="note info">Prestaste ' + money(r.prestado) + ' y te pagaron ' + money(r.cobrado) + ' este mes. No cuenta como gasto ni ingreso.</div>';
  h += '<div class="list">' + catsGasto().map(c => {
    const n = netoCat(r, c.nombre), p = c.presupuesto || 0;
    const pct = p > 0 ? n / p * 100 : (n > 0 ? 100 : 0);
    const cls = n > p ? 'over' : pct >= 80 ? 'warn' : '';
    const resto = r2(p - n);
    return '<button class="cat" ' + al('click', 'abrirCategoria', c.nombre) + '><div class="top2"><span class="nm">' + emo(ICONO[c.nombre]) + esc(c.nombre) + '</span>' +
      '<span class="num t1' + (resto < 0 ? ' red' : '') + '">' + money(n, true) + '</span></div>' +
      '<div class="meter" aria-hidden="true"><div class="' + cls + '" style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
      '<div class="sub"><span>' + (p ? 'de ' + money(p, true) : 'Sin presupuesto') + '</span><span class="' + (resto < 0 ? 'red' : '') + '">' +
      (resto < 0 ? money(-resto, true) + ' de más' : p ? 'quedan ' + money(resto, true) : '') + '</span></div></button>';
  }).join('') + '</div>';
  h += '<p class="hint">Toca una categoría para ver sus movimientos o cambiar su presupuesto. El gasto neto ya descuenta los reembolsos.</p>';

  // Pagos fijos
  const usados = new Set(DATA.movs.filter(m => m.fijo && m.fecha.slice(0, 7) === MES).map(m => m.fijo));
  const fs = DATA.fijos.filter(fijoVigente);
  h += '<h2>Pagos fijos<button class="more" ' + al('click', 'abrirFijo') + '>Agregar</button></h2>';
  h += fs.length ? '<div class="list">' + fs.map(f => {
    const ok = usados.has(f.id);
    return '<div class="acc"><div class="tx"><div class="row between"><span class="t1">' + emo(ICONO[f.categoria]) + esc(f.nombre) + '</span><span class="amt sm num' + (f.tipo === 'Ingreso' ? ' green' : '') + '">' + money(f.monto) + '</span></div>' +
      '<div class="muted">' + esc(f.tipo === 'Ingreso' ? 'Ingreso' : f.tipo === 'Traspaso' ? 'Pago a ' + f.aCuenta : f.categoria) + (f.dia ? ', día ' + f.dia : '') + (f.cuenta ? ', ' + esc(f.cuenta) : '') + (ok ? ' · ✓ registrado en ' + MESES[+MES.slice(5, 7) - 1] : '') + '</div>' +
      '<div class="actions">' + (MES === hoy().slice(0, 7) ? '<button class="btn sm' + (ok ? ' ghost' : '') + '" ' + al('click', 'usarFijo', f.id) + '>' + (ok ? 'Registrar otra vez' : 'Registrar') + '</button>' : '') +
      '<button class="btn sm ghost" ' + al('click', 'abrirFijo', f.id) + '>Editar</button></div></div></div>';
  }).join('') + '</div>' : '<div class="list"><div class="empty">Sin pagos fijos. Agrega Spotify, seguros o tu quincena para registrarlos con un toque.</div></div>';
  const inactivos = DATA.fijos.filter(f => !fijoVigente(f));
  if (inactivos.length) h += '<details class="arch"><summary>Pausados o terminados (' + inactivos.length + ')</summary><div class="list">' + inactivos.map(f => '<div class="acc"><div class="tx"><span class="t1">' + esc(f.nombre) + '</span> <span class="muted">' + money(f.monto) + '</span><div class="actions"><button class="btn sm ghost" ' + al('click', 'abrirFijo', f.id) + '>Editar</button></div></div></div>').join('') + '</div></details>';
  return h;
}

/* ===================== Análisis ===================== */
// Todos los movimientos para gráficas: lo registrado en la app + el historial del formulario (jul 2025 – may 2026)
function movsAnalisis() {
  const corte = minCorte();
  return (DATA.historial || []).filter(h => h.fecha < corte).concat(DATA.movs.filter(m => m.tipo === 'Gasto' || m.tipo === 'Reembolso' || m.tipo === 'Ingreso'));
}
function porMes(lista) {
  const r = {};
  lista.forEach(m => {
    const k = m.fecha.slice(0, 7), x = r[k] || (r[k] = { gasto: 0, ingreso: 0, cat: {} });
    if (m.tipo === 'Gasto') { x.gasto += m.monto; x.cat[m.categoria] = (x.cat[m.categoria] || 0) + m.monto; }
    else if (m.tipo === 'Reembolso') { x.gasto -= m.monto; x.cat[m.categoria] = (x.cat[m.categoria] || 0) - m.monto; }
    else if (m.tipo === 'Ingreso') x.ingreso += m.monto;
  });
  return r;
}
function vistaAnalisis() {
  const subs = ['Este mes', 'Categorías', 'Resumen', 'Patrimonio', 'Tendencias', 'Semana'].filter(x => (x !== 'Resumen' || fx('resumen')) && (x !== 'Patrimonio' || fx('patrimonio')));
  if (subs.indexOf(SUB_ANALISIS) < 0) SUB_ANALISIS = 'Este mes';
  let h = '<div class="chips" role="group" aria-label="Análisis" style="margin:12px 0 10px">' + subs.map(x => '<button class="chip' + (SUB_ANALISIS === x ? ' on' : '') + '" aria-pressed="' + (SUB_ANALISIS === x) + '" ' + al('click', 'verAnalisis', x) + '>' + x + '</button>').join('') + '</div>';
  if (SUB_ANALISIS === 'Tendencias') return h + vistaTendencias();
  if (SUB_ANALISIS === 'Semana') return h + vistaSemana();
  if (SUB_ANALISIS === 'Categorías') return h + vistaCategorias();
  if (SUB_ANALISIS === 'Resumen') return h + vistaResumen();
  if (SUB_ANALISIS === 'Patrimonio') return h + vistaPatrimonio();
  return h + vistaPresupuesto();
}
function vistaSemana() {
  const s = resumenSemana(SEMANA);
  let h = '<div class="monthbar"><button class="arrow" aria-label="Semana anterior" ' + al('click', 'moverSemana', 1) + '>' + ARROW_L + '</button><span class="nm" style="font-size:16px;text-transform:none">' + (SEMANA === 0 ? 'Esta semana' : SEMANA === 1 ? 'Semana pasada' : 'Hace ' + SEMANA + ' semanas') + '</span>' +
    '<button class="arrow" aria-label="Semana siguiente" ' + (SEMANA === 0 ? 'disabled' : '') + ' ' + al('click', 'moverSemana', -1) + '>' + ARROW_R + '</button></div>';
  h += '<div class="card">' + htmlSemana(s) + '</div>';
  const movs = DATA.movs.filter(m => m.fecha >= s.ini && m.fecha <= s.fin).sort(ordenMov);
  h += '<h2>Movimientos de la semana</h2>' + (movs.length ? '<div class="list">' + movs.map(filaMov).join('') + '</div>' : '<div class="list"><div class="empty">Sin movimientos esta semana.</div></div>');
  return h;
}
function vistaTendencias() {
  const pm = porMes(movsAnalisis()), act = hoy().slice(0, 7);
  const todos = Object.keys(pm).sort(), primero = todos[0] || act;
  const meses = [];
  let k = RANGO ? mesSig(act, -(RANGO - 1)) : primero;
  if (k < primero) k = primero;
  for (; k <= act; k = mesSig(k, 1)) meses.push(k);
  const pres = resumenMes(act).presupuesto;
  let h = '<div class="chips" role="group" aria-label="Rango" style="margin:2px 0 8px">' + [[6, '6 meses'], [12, '1 año'], [0, 'Todo']].map(x => '<button class="chip' + (RANGO === x[0] ? ' on' : '') + '" aria-pressed="' + (RANGO === x[0]) + '" ' + al('click', 'elegirRango', x[0]) + '>' + x[1] + '</button>').join('') + '</div>';

  // 1) Gasto neto por mes
  const vals = meses.map(m => pm[m] ? r2(pm[m].gasto) : null);
  const conDatos = vals.filter(v => v !== null && v > 0);
  const prom = conDatos.length ? r2(conDatos.reduce((a, b) => a + b, 0) / conDatos.length) : 0;
  h += '<div class="card"><div class="t1">¿Cuánto gastas al mes?</div><div class="muted" style="margin:2px 0 10px">Gasto neto (ya descuenta reembolsos). Promedio: <b class="num">' + money(prom, true) + '</b>; presupuesto actual: ' + money(pres, true) + '.</div>' +
    graficaMeses(meses, vals, pres, pm) + '<div class="leyenda" style="margin-top:6px"><span><i class="sw"></i>Dentro del presupuesto</span><span><i class="sw" style="background:var(--debt)"></i>Arriba del presupuesto</span></div>' +
    '<div class="tip" id="tipMes" aria-live="polite">Toca una barra para ver el detalle.</div>' +
    '<details class="arch"><summary>Ver como tabla</summary><table class="tabla"><thead><tr><th>Mes</th><th>Ingresos</th><th>Gasto neto</th><th>Diferencia</th></tr></thead><tbody>' +
    meses.slice().reverse().map(m => pm[m] ? '<tr><td>' + nombreMes(m) + '</td><td class="num">' + money(pm[m].ingreso, true) + '</td><td class="num">' + money(pm[m].gasto, true) + '</td><td class="num ' + (pm[m].ingreso - pm[m].gasto < 0 ? 'red' : '') + '">' + money(pm[m].ingreso - pm[m].gasto, true) + '</td></tr>' : '<tr><td>' + nombreMes(m) + '</td><td colspan="3" class="muted">Sin registro</td></tr>').join('') + '</tbody></table></details></div>';

  // 2) Este mes contra tu promedio de los 3 meses anteriores con datos
  const previos = todos.filter(m => m < act && pm[m] && pm[m].gasto > 0).slice(-3);
  const cats = catsGasto().map(c => {
    const este = pm[act] ? r2(pm[act].cat[c.nombre] || 0) : 0;
    const promC = previos.length ? r2(previos.reduce((s, m) => s + (pm[m].cat[c.nombre] || 0), 0) / previos.length) : 0;
    return { n: c.nombre, este, prom: promC };
  }).filter(x => x.este > 0 || x.prom > 0).sort((a, b) => b.este - a.este || b.prom - a.prom);
  const maxC = Math.max(1, ...cats.map(x => Math.max(x.este, x.prom)));
  h += '<div class="card"><div class="t1">' + MESES[+act.slice(5, 7) - 1][0].toUpperCase() + MESES[+act.slice(5, 7) - 1].slice(1) + ' contra tu promedio</div>' +
    '<div class="muted" style="margin:2px 0 10px">' + (previos.length ? 'Promedio de ' + previos.map(m => MESES[+m.slice(5, 7) - 1].slice(0, 3)).join(', ') + '.' : 'Aún no hay meses anteriores para comparar.') + '</div>' +
    '<div class="leyenda"><span><i class="sw"></i>Este mes</span><span><i class="tk"></i>Promedio</span></div>' +
    (cats.length ? cats.map(x => '<div class="hb"><div class="row between"><span>' + emo(ICONO[x.n]) + esc(x.n) + '</span><span class="num">' + money(x.este, true) + (x.prom ? ' <span class="muted">/ ' + money(x.prom, true) + '</span>' : '') + '</span></div>' +
      '<div class="hbar" role="img" aria-label="' + esc(x.n) + ': ' + money(x.este, true) + ' este mes, promedio ' + money(x.prom, true) + '"><div style="width:' + (x.este / maxC * 100).toFixed(1) + '%"></div>' +
      (x.prom ? '<i style="left:' + (x.prom / maxC * 100).toFixed(1) + '%"></i>' : '') + '</div></div>').join('') : '<div class="empty">Sin gastos todavía.</div>') + '</div>';

  // 3) Lo que llama la atención
  const ideas = [];
  const sinViajes = conDatos.length ? r2(meses.filter(m => pm[m]).reduce((s, m) => s + pm[m].gasto - (pm[m].cat['Viajes'] || 0), 0) / Math.max(1, meses.filter(m => pm[m] && pm[m].gasto > 0).length)) : 0;
  if (sinViajes && prom - sinViajes > 500) ideas.push('Sin contar viajes gastas en promedio <b>' + money(sinViajes, true) + '</b> al mes. Los viajes suben tu promedio a ' + money(prom, true) + '.');
  const sube = cats.filter(x => x.prom > 150 && x.este > x.prom * 1.25 && x.este - x.prom > 200).sort((a, b) => (b.este - b.prom) - (a.este - a.prom))[0];
  if (sube) ideas.push('<b>' + esc(sube.n) + '</b> va ' + Math.round((sube.este / sube.prom - 1) * 100) + '% arriba de lo normal este mes (' + money(sube.este, true) + ' contra ' + money(sube.prom, true) + ').');
  const totC = {}; meses.forEach(m => { if (pm[m]) Object.keys(pm[m].cat).forEach(c => { totC[c] = (totC[c] || 0) + pm[m].cat[c]; }); });
  const totG = Object.values(totC).filter(v => v > 0).reduce((a, b) => a + b, 0);
  const topC = Object.keys(totC).sort((a, b) => totC[b] - totC[a])[0];
  if (topC && totG > 0) ideas.push('En este periodo, <b>' + esc(topC) + '</b> se llevó el ' + Math.round(totC[topC] / totG * 100) + '% de tu gasto (' + money(totC[topC], true) + ').');
  const pasados = meses.filter(m => pm[m] && pm[m].gasto > pres && m < act).length, conMes = meses.filter(m => pm[m] && m < act).length;
  if (conMes) ideas.push('Te pasaste del presupuesto actual (' + money(pres, true) + ') en ' + pasados + ' de ' + conMes + ' meses con registro.');
  if (meses.some(m => !pm[m])) ideas.push('Los meses en blanco no tienen registro (de junio a septiembre de 2026 no anotaste nada).');
  if (ideas.length) h += '<div class="card"><div class="t1">Lo que llama la atención</div><ul class="ideas">' + ideas.map(i => '<li>' + i + '</li>').join('') + '</ul></div>';

  // 4) En dónde más gastas (por descripción)
  const desde = meses[0] + '-01', grupos = {};
  movsAnalisis().forEach(m => {
    if (m.tipo !== 'Gasto' || m.fecha < desde || !m.desc) return;
    const key = normalizarDesc(m.desc);
    if (!key) return;
    const g = grupos[key] || (grupos[key] = { n: m.desc.trim(), v: 0, c: 0, cat: m.categoria });
    g.v += m.monto; g.c++;
  });
  const top = Object.values(grupos).sort((a, b) => b.v - a.v).slice(0, 8);
  if (top.length) h += '<div class="card"><div class="t1">En dónde más gastas</div><div class="muted" style="margin:2px 0 6px">Agrupado por descripción, ' + (RANGO ? 'últimos ' + RANGO + ' meses' : 'todo el historial') + '.</div>' +
    top.map((g, i) => '<div class="qrow"><span>' + (i + 1) + '. ' + emo(ICONO[g.cat]) + esc(g.n) + ' <span class="muted">(' + g.c + (g.c === 1 ? ' vez' : ' veces') + ')</span></span><b class="num">' + money(g.v, true) + '</b></div>').join('') + '</div>';
  h += tarjetaHormiga();
  return h;
}
function normalizarDesc(d) {
  const t = String(d || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // primeras dos palabras con significado ("gas pemex reforma" -> "gas pemex")
  const pal = t.split(' ').filter(w => w.length > 2 && ['para', 'con', 'del', 'los', 'las', 'que', 'una', 'por'].indexOf(w) < 0);
  return pal.slice(0, 2).join(' ') || t;
}
// Barras por mes en SVG: una serie, línea punteada del presupuesto, toque para ver el detalle
function graficaMeses(meses, vals, pres, pm, alTocar) {
  alTocar = alTocar || 'detalleMes';
  const W = 340, H = 170, pl = 6, pr = 6, pt = 14, pb = 26;
  const max = Math.max(pres, ...vals.map(v => v || 0)) * 1.1 || 1;
  const n = meses.length, bw = Math.min(34, (W - pl - pr) / n * 0.62), paso = (W - pl - pr) / n;
  const y = v => pt + (H - pt - pb) * (1 - v / max);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gasto neto por mes">';
  s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="ax"/>';
  meses.forEach((m, i) => {
    const v = vals[i], x = pl + paso * i + (paso - bw) / 2, cx = pl + paso * i + paso / 2;
    const lbl = MESES[+m.slice(5, 7) - 1].slice(0, 3) + (m.slice(5, 7) === '01' || i === 0 ? ' ' + m.slice(2, 4) : '');
    if (v === null) s += '<rect x="' + x + '" y="' + (y(0) - 18) + '" width="' + bw + '" height="18" rx="4" class="vacio"/>';
    else if (v > 0) {
      const top = y(v), hgt = Math.max(2, y(0) - top);
      s += '<path d="M' + x + ',' + (top + Math.min(4, hgt)) + ' q0,-' + Math.min(4, hgt) + ' ' + Math.min(4, hgt) + ',-' + Math.min(4, hgt) + ' h' + (bw - 2 * Math.min(4, hgt)) + ' q' + Math.min(4, hgt) + ',0 ' + Math.min(4, hgt) + ',' + Math.min(4, hgt) + ' V' + y(0) + ' H' + x + ' Z" class="bar' + (v > pres ? ' over' : '') + (m === hoy().slice(0, 7) ? ' cur' : '') + '"/>';
    }
    s += '<text x="' + cx + '" y="' + (H - 8) + '" class="lb">' + lbl + '</text>';
    // zona de toque más grande que la barra
    s += '<rect x="' + (pl + paso * i) + '" y="0" width="' + paso + '" height="' + H + '" class="hit" tabindex="0" role="button" aria-label="' + nombreMes(m) + ': ' + (v === null ? 'sin registro' : money(v, true)) + '" ' + al('click', alTocar, m) + ' ' + al('keydown', 'enterToca') + '/>';
  });
  if (pres > 0) s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(pres) + '" y2="' + y(pres) + '" class="ref"/><text x="' + (W - pr) + '" y="' + (y(pres) - 4) + '" class="lb ref-l">presupuesto</text>';
  return s + '</svg>';
}
function detalleMes(m) {
  const pm = porMes(movsAnalisis()), x = pm[m], el = $('tipMes');
  if (!el) return;
  if (!x) { el.innerHTML = '<b>' + nombreMes(m) + '</b>: sin registro.'; return; }
  const top = Object.keys(x.cat).filter(c => x.cat[c] > 0).sort((a, b) => x.cat[b] - x.cat[a]).slice(0, 3);
  el.innerHTML = '<b>' + nombreMes(m) + '</b>: gastaste ' + money(x.gasto, true) + (x.ingreso ? ' e ingresaron ' + money(x.ingreso, true) : '') + '. Lo principal: ' + top.map(c => esc(c) + ' ' + money(x.cat[c], true)).join(', ') + '.';
  vibrar(8);
}

/* ===================== Cuentas ===================== */
function vistaCuentas() {
  const p = patrimonio();
  const fila = c => {
    const s = saldo(c), deuda = esDeuda(c);
    let sub = c.tipo;
    if (deuda && c.diaPago) { const d = proximoDia(c.diaPago); sub += d === 0 ? ', pago hoy' : d === 1 ? ', pago mañana' : ', pago en ' + d + ' días'; }
    return '<button class="acc rowbtn" ' + al('click', 'abrirDetalle', c.nombre) + '><span class="aic ' + estiloCuenta(c) + '" aria-hidden="true">' + ICONO_CUENTA[c.tipo] + '</span><span class="tx"><span class="t1">' + esc(c.nombre) + '</span><span class="muted">' + esc(sub) + '</span></span>' +
      '<span class="amt sm num' + (deuda && s < 0 ? ' red' : '') + '">' + money(deuda ? -s : s) + '</span><span class="chev" aria-hidden="true">›</span></button>';
  };
  const filaP = x => {
    const s = saldoPersona(x);
    return '<button class="acc rowbtn" ' + al('click', 'abrirPersona', x.nombre) + '><span class="tx"><span class="t1">' + esc(x.nombre) + '</span><span class="muted">' + (s > 0 ? 'Te debe' : s < 0 ? 'Le debes' : 'A mano') + '</span></span>' +
      '<span class="amt sm num' + (s < 0 ? ' red' : s > 0 ? ' green' : '') + '">' + money(Math.abs(s)) + '</span><span class="chev" aria-hidden="true">›</span></button>';
  };
  let h = '<div class="grid2" style="margin:12px 0 4px">' +
    '<div class="stat"><div class="muted">Disponible</div><div class="amt sm num">' + money(p.disp) + '</div></div>' +
    '<div class="stat"><div class="muted">Deuda con bancos</div><div class="amt sm red num">' + money(p.deuda) + '</div></div></div>';
  h += '<h2>Tus tarjetas<button class="more" ' + al('click', 'abrirPlan') + '>Plan de deuda</button></h2><div class="plastics" role="list">' + activas().filter(esDeuda).map(plastico).join('') + '</div>';
  h += '<h2>Tu dinero</h2><div class="list">' + activas().filter(c => !esDeuda(c)).map(fila).join('') + '</div>';
  h += '<p class="hint">Toca una cuenta para pagar, mover, cuadrar o ver su historial. Cuadra cada domingo.</p>';
  const ps = personasActivas().map(x => ({ x: x, s: saldoPersona(x) }));
  const teDeben = ps.filter(o => o.s > 0).sort((a, b) => b.s - a.s), lesDebes = ps.filter(o => o.s < 0).sort((a, b) => a.s - b.s), aMano = ps.filter(o => o.s === 0);
  h += '<h2 id="sec-personas">Te deben<span class="amt sm green num">' + money(p.teDeben) + '</span></h2>' +
    (teDeben.length ? '<div class="list">' + teDeben.map(o => filaP(o.x)).join('') + '</div>' : '<div class="list"><div class="empty">Nadie te debe.</div></div>');
  h += '<h2>Les debes<span class="amt sm' + (p.debes ? ' red' : '') + ' num">' + money(p.debes) + '</span></h2>' +
    (lesDebes.length ? '<div class="list">' + lesDebes.map(o => filaP(o.x)).join('') + '</div>' : '<div class="list"><div class="empty">No le debes a nadie.</div></div>');
  if (aMano.length) h += '<h2>A mano</h2><div class="list">' + aMano.map(o => filaP(o.x)).join('') + '</div>';
  h += '<div class="actions" style="margin-top:12px"><button class="btn ghost" style="flex:1" ' + al('click', 'abrirNuevaPersona') + '>Agregar persona</button><button class="btn ghost" style="flex:1" ' + al('click', 'abrirNuevaCuenta') + '>Agregar cuenta</button></div>';
  const archC = DATA.cuentas.filter(c => c.archivada), archP = DATA.personas.filter(x => x.archivada);
  if (archC.length || archP.length) h += '<details class="arch"><summary>Archivadas (' + (archC.length + archP.length) + ')</summary><div class="list">' +
    archC.map(c => '<button class="acc rowbtn" ' + al('click', 'abrirCuenta', c.nombre) + '><span class="tx"><span class="t1">' + esc(c.nombre) + '</span><span class="muted">' + esc(c.tipo) + '</span></span><span class="chev">›</span></button>').join('') +
    archP.map(x => '<button class="acc rowbtn" ' + al('click', 'abrirPersona', x.nombre) + '><span class="tx"><span class="t1">' + esc(x.nombre) + '</span><span class="muted">Persona</span></span><span class="chev">›</span></button>').join('') + '</div></details>';
  h += '<button class="card row between" style="margin-top:20px" ' + al('click', 'abrirAjustes') + '><span><span class="t1">Ajustes</span><br><span class="muted">Tarjeta para gastos, tema, recordatorios, app Android y conexión</span></span><span class="chev" aria-hidden="true">›</span></button>';
  return h;
}
// Tarjeta de crédito o préstamo dibujada como plástico
function plastico(c) {
  const s = saldo(c), ci = cicloTarjeta(c, hoy()), d = c.diaPago ? proximoDia(c.diaPago) : null;
  const pie = ci ? 'Pagas el ' + fechaCorta(proximaFecha(c.diaPago)) + ' · Corta el ' + fechaCorta(ci.corte) : d !== null ? 'Pago en ' + d + ' días' : c.tipo;
  return '<button class="plas ' + estiloCuenta(c) + '" role="listitem" ' + al('click', 'abrirDetalle', c.nombre) + '>' +
    '<span class="plas-top"><span class="plas-nm">' + esc(c.nombre) + '</span>' + (c.nombre === cuentaGastos() ? '<span class="plas-tag">Para gastos</span>' : '<span class="plas-chip" aria-hidden="true"></span>') + '</span>' +
    '<span class="plas-lbl">' + (s <= 0 ? 'Debes' : 'Saldo a favor') + '</span><span class="plas-amt num">' + money(Math.abs(s)) + '</span>' +
    (uso(c) !== null ? '<span class="plas-uso" aria-label="Usas ' + Math.round(uso(c)) + '% de tu límite"><i style="width:' + Math.min(100, uso(c)).toFixed(1) + '%"></i></span><span class="plas-ft">Disponible ' + money(Math.max(0, c.limite + s), true) + ' · usas ' + Math.round(uso(c)) + '%</span>' : '') +
    '<span class="plas-ft">' + esc(pie) + '</span></button>';
}
// Porcentaje del límite de crédito que usas (null si no capturaste límite)
function uso(c) { return c.limite > 0 ? Math.max(0, -saldo(c)) / c.limite * 100 : null; }
function htmlUso(c) {
  const u = uso(c);
  if (u === null) return '';
  return '<div class="qrow"><span>Crédito disponible</span><b class="num">' + money(Math.max(0, c.limite + saldo(c))) + ' de ' + money(c.limite, true) + '</b></div>' +
    '<div class="meter" style="height:7px" role="img" aria-label="Usas ' + Math.round(u) + '% de tu límite"><div class="' + (u >= 90 ? 'over' : u > 30 ? 'warn' : '') + '" style="width:' + Math.min(100, u).toFixed(1) + '%"></div></div>' +
    '<div class="muted">Usas ' + Math.round(u) + '% de tu límite' + (u > 30 ? '. Para tu buró, lo ideal es que al corte quede debajo del 30% (' + money(c.limite * 0.3, true) + ').' : '. Vas bien para tu buró.') + '</div>';
}

/* ---- Detalle de una cuenta: acciones e historial ---- */
function abrirDetalle(n) { FORM = { vista: 'detalle', nombre: n }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaDetalle() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre);
  if (!c) return titulo('Cuenta') + '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button></div>';
  const s = saldo(c), deuda = esDeuda(c);
  const movs = DATA.movs.filter(m => m.cuenta === c.nombre || m.aCuenta === c.nombre).sort(ordenMov);
  const det = [c.tipo];
  if (c.diaCorte) det.push('corte día ' + c.diaCorte);
  if (c.diaPago) det.push('pago día ' + c.diaPago);
  if (c.tasa) det.push('tasa ' + (c.tasa * 100).toFixed(1) + '% anual');
  let h = titulo(esc(c.nombre));
  h += '<div class="card flat"><div class="muted">' + (deuda ? (s <= 0 ? 'Lo que debes' : 'Saldo a favor') : 'Saldo') + '</div><div class="amt num' + (deuda && s < 0 ? ' red' : '') + '" style="font-size:30px">' + money(deuda ? -s : s) + '</div>' +
    '<div class="muted">' + esc(det.join(', ')) + '</div><div class="muted">Al corte del ' + fechaCorta(c.fechaCorte) + ': ' + money(deuda ? -c.saldoCorte : c.saldoCorte) + '</div></div>';
  const ps = deuda ? pagoSinIntereses(c) : null, ci = deuda ? cicloTarjeta(c, hoy()) : null;
  if (ci) h += '<div class="card" style="margin-top:10px"><div class="qrow"><span>Lo que compres hoy lo pagas el</span><b>' + fechaCorta(ci.pago) + ' (' + ci.dias + ' días)</b></div>' +
    '<div class="qrow"><span>Próximo corte</span><b>' + fechaCorta(ci.corte) + '</b></div>' +
    (ps ? '<div class="qrow"><span>Estado de cuenta del ' + fechaCorta(ps.corte) + '</span><b class="num">' + money(ps.total) + '</b></div>' +
      '<div class="qrow tot"><span>' + (ps.falta > 0.5 ? 'Para no pagar intereses, antes del ' + fechaCorta(ps.limite) : 'Pago sin intereses') + '</span><b class="num ' + (ps.falta > 0.5 ? 'red' : 'green') + '">' + (ps.falta > 0.5 ? money(ps.falta) : 'Listo ✓') + '</b></div>' +
      (ps.msi ? '<div class="muted">Incluye ' + money(ps.msi) + ' de mensualidades a meses sin intereses.</div>' : '') +
      '<div class="muted">Aproximado con lo que registras' + (c.domiciliado ? '. Domiciliado desde ' + esc(c.domiciliado) + ': se registra solo en la fecha límite' : '') + '.</div>' : '') + '</div>';
  if (deuda && c.limite) h += '<div class="card">' + htmlUso(c) + '</div>';
  const msi = deuda ? comprasMSI(c) : [];
  if (msi.length) h += '<div class="fl">Compras a meses</div><div class="card" style="padding:4px 16px">' + msi.map(x =>
    '<div class="qrow"><span>' + esc(x.m.desc || x.m.categoria) + '<br><span class="muted">' + x.pagadas + ' de ' + x.m.meses + ' mensualidades · ' + money(x.mensual) + ' al mes</span></span><b class="num">' + money(x.resta) + '</b></div>').join('') +
    '<div class="qrow tot"><span>Te faltan por pagar</span><b class="num">' + money(msi.reduce((t, x) => t + x.resta, 0)) + '</b></div></div>';
  h += '<div class="actgrid">' +
    (deuda ? '<button class="btn" ' + al('click', 'abrirRegistro', ps && ps.falta > 0.5 ? { tipo: 'Traspaso', aCuenta: c.nombre, monto: ps.falta } : { tipo: 'Traspaso', aCuenta: c.nombre }) + '>Pagar</button>' : '<button class="btn" ' + al('click', 'abrirRegistro', { tipo: 'Traspaso', cuenta: c.nombre }) + '>Mover dinero</button>') +
    '<button class="btn ghost" ' + al('click', 'abrirCuadrar', c.nombre) + '>Cuadrar</button><button class="btn ghost" ' + al('click', 'abrirCuenta', c.nombre) + '>Editar</button></div>';
  if (fx('importar')) h += '<button class="btn ghost block" style="margin-top:8px" ' + al('click', 'abrirImportar', c.nombre) + '>📄 Importar estado de cuenta</button>';
  h += '<div class="fl" style="margin-top:16px">Movimientos' + (movs.length > 30 ? ' (últimos 30 de ' + movs.length + ')' : '') + '</div>';
  h += movs.length ? '<div class="list">' + movs.slice(0, 30).map(filaMov).join('') + '</div>' : '<div class="list"><div class="empty">Sin movimientos desde el corte.</div></div>';
  if (movs.length > 30) h += '<button class="btn ghost block" style="margin-top:10px" ' + al('click', 'buscarCuenta', c.nombre) + '>Ver todos</button>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button></div>';
  return h;
}

/* ---- Guía de la primera vez ---- */
const GUIA = [
  ['👋', 'Registra en el momento', 'Toca <b>+</b> cada vez que gastes o te paguen. Son 4 toques: monto, categoría, cuenta y Guardar. Si se te va la señal, se sube después.'],
  ['💳', 'Gasto, Traspaso o Personas', '<b>Gasto</b>: compraste algo (con débito, efectivo o tarjeta).<br><b>Traspaso</b>: pagaste una tarjeta o moviste dinero entre cuentas; no es gasto.<br><b>Personas</b>: le prestaste a alguien, te pagó, o tú debes.'],
  ['🧾', 'Reembolsos y gastos divididos', 'Si pagaste por varios, activa <b>Dividir con otros</b>: tu parte es gasto y lo demás queda como "te deben". Si alguien te devuelve lo de algo, es <b>Ingreso → Es un reembolso</b>.'],
  ['⚖️', 'Cuadra cada domingo', 'En Cuentas toca una cuenta → <b>Cuadrar</b> y escribe lo que dice tu banco. Así nunca vuelves a perder la pista como de junio a septiembre.'],
  ['📅', 'Tu quincena y tu deuda', 'Cuando registres tu quincena, Inicio te dice cuánto va a gastos y cuánto a deudas. En Análisis ves a dónde se va tu dinero mes con mes.'],
  ['🏦', 'Tu BBVA Oro y los meses sin intereses', 'Los gastos salen con tu Oro para aprovechar hasta ~50 días de financiamiento. Si compras a meses, activa <b>A meses sin intereses</b>: al estado de cuenta solo entra la mensualidad. En Inicio ves cuánto pagar para no generar intereses.'],
  ['🎯', 'Metas y proyección', 'Crea una <b>meta</b> para lo que quieres comprar y aparta cada quincena. En <b>Análisis → Categorías</b> ves en qué se fue tu dinero y la proyección te dice cómo vas a terminar el mes. El ojo de arriba oculta los montos.']
];
function abrirGuia() { FORM = { vista: 'guia', paso: 0 }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaGuia() {
  const g = GUIA[FORM.paso], ult = FORM.paso === GUIA.length - 1;
  return '<div class="guia"><div class="gi" aria-hidden="true">' + g[0] + '</div>' + titulo(g[1]) + '<p>' + g[2] + '</p>' +
    '<div class="dots" aria-label="Paso ' + (FORM.paso + 1) + ' de ' + GUIA.length + '">' + GUIA.map((_, i) => '<i class="' + (i === FORM.paso ? 'on' : '') + '"></i>').join('') + '</div></div>' +
    '<div class="actbar">' + (FORM.paso > 0 ? '<button class="btn ghost" ' + al('click', 'pasoGuia', -1) + '>Atrás</button>' : '<button class="btn ghost" ' + al('click', 'terminarGuia') + '>Saltar</button>') +
    '<button class="btn" ' + (ult ? al('click', 'terminarGuia') : al('click', 'pasoGuia', 1)) + '>' + (ult ? 'Empezar' : 'Siguiente') + '</button></div>';
}
function terminarGuia() { LS.set('fin_guia', true); cerrarHoja(); }

/* ===================== Hoja inferior ===================== */
function abrirHoja() {
  const s = $('sheet'), sc = $('scrim'), yaAbierta = s.classList.contains('show');
  if (!yaAbierta) {
    history.pushState({ hoja: true }, '');
    s.classList.remove('hide'); sc.classList.remove('hide');
    fondoInerte(true);
    // Si la app se está abriendo detrás de otra pantalla (notificación, widget), se muestra sin animación:
    // con requestAnimationFrame congelado la hoja se quedaba escondida y lo de atrás bloqueado
    if (document.visibilityState !== 'visible') s.classList.add('drag');
    void s.offsetWidth;
    s.classList.add('show'); sc.classList.add('show');
    setTimeout(() => s.classList.remove('drag'), 50);
    document.body.style.overflow = 'hidden';
  }
  s.scrollTop = 0;
}
// Con una hoja o el candado abiertos, el lector de pantalla y el tabulador no se van a lo de atrás
function fondoInerte(si) { ['.appbar', 'main', '#nav'].forEach(q => { const e = document.querySelector(q); if (e) e.inert = si; }); }
// Cerrar desde un botón: regresa en el historial para que el botón Atrás de Android no saque de la app
function cerrarHoja() { if (history.state && history.state.hoja) history.back(); else cerrarHojaReal(); }
function cerrarHojaReal() {
  guardarBorrador();
  FORM = null;
  if (RECARGA_PENDIENTE) { setTimeout(() => location.reload(), 300); }
  const s = $('sheet'), sc = $('scrim');
  s.classList.remove('show'); sc.classList.remove('show'); s.style.transform = '';
  document.body.style.overflow = '';
  fondoInerte(false);
  setTimeout(() => { if (!FORM) { s.classList.add('hide'); sc.classList.add('hide'); s.innerHTML = ''; } }, 260);
}
function pintarHoja() {
  if (!FORM) return;
  const f = { mov: hojaMov, cat: hojaCategoria, cuadrar: hojaCuadrar, cuenta: hojaCuenta, nuevaCuenta: hojaNuevaCuenta, persona: hojaPersona,
              nuevaPersona: hojaNuevaPersona, fijo: hojaFijo, plan: hojaPlan, detalle: hojaDetalle, guia: hojaGuia, ajustes: hojaAjustes, meta: hojaMeta, catMes: hojaCatMes, ticket: hojaTicket, importar: hojaImportar, proximos: hojaProximos, alcanza: hojaAlcanza }[FORM.vista];
  const a = document.activeElement, foco = a && a.id, sel = a && a.selectionStart, top = $('sheet').scrollTop;
  $('sheet').innerHTML = '<div class="grabzone" id="grab"><div class="grab"></div></div>' + f();
  $('sheet').scrollTop = top;
  if (foco && $(foco) && $('sheet').contains($(foco))) { REPINTANDO = true; const e = $(foco); e.focus(); try { if (sel != null) e.setSelectionRange(sel, sel); } catch (x) {} REPINTANDO = false; }
  // Si estabas escribiendo la descripción, las sugerencias siguen ahí aunque la app se haya vuelto a pintar (por ejemplo al sincronizar)
  if (foco === 'fDesc' && $('fDesc')) verSugDesc($('fDesc').value);
  activarArrastre();
}
let REPINTANDO = false;
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
             categoria: o.categoria || null, persona: o.persona || null, desc: o.desc || '', fecha: o.fecha && o.fecha <= hoy() ? o.fecha : hoy(), fijo: o.fijo || '', err: '',
             ticket: o.ticket || '', ticketMini: o.ticketMini || '', ticketTexto: o.ticketTexto || '', detectado: o.detectado || '', leido: !!o.leido, verTodas: false };
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
           persona: m.persona || null, desc: m.desc || '', fecha: m.fecha, fijo: m.fijo || '', registrado: m.registrado || null, err: m._error ? 'La hoja lo rechazó: ' + m._error : '', verTodas: true,
           msi: esMSI(m), meses: m.meses || null, ticket: m.ticket || '' };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function cuentasPara(tipo, rol) {
  const cs = activas();
  if (tipo === 'Gasto' || tipo === 'Presté' || tipo === 'Le pagué') return cs.filter(c => c.tipo !== 'Préstamo');
  if (tipo === 'Ingreso' || tipo === 'Reembolso' || tipo === 'Me pagaron' || tipo === 'Me prestaron') return cs.filter(c => !esDeuda(c));
  if (tipo === 'Traspaso') return rol === 'a' ? cs.filter(c => c.nombre !== FORM.cuenta) : cs.filter(c => c.tipo !== 'Préstamo');
  return cs;
}
// Tarjeta para gastos: la que elijas en Ajustes; si no eliges, tu BBVA Oro (para aprovechar el financiamiento).
function cuentaGastos() {
  const elegida = String(DATA.config['Cuenta para gastos'] || '');
  return elegida && cuentasPara('Gasto').some(c => c.nombre === elegida) ? elegida : tarjetaOro();
}
function tarjetaOro() {
  const cs = cuentasPara('Gasto').filter(c => c.tipo === 'Crédito');
  const oro = cs.find(c => /oro/i.test(c.nombre) && /bbva/i.test(c.nombre)) || cs.find(c => /oro/i.test(c.nombre));
  return oro ? oro.nombre : null;
}
function cuentaPorDefecto(t) {
  if (t === 'Gasto' && cuentaGastos()) return cuentaGastos();
  const ok = n => n && cuentasPara(t).some(c => c.nombre === n);
  const ult = ULT('cuenta_' + t);
  // Sin tarjeta para gastos elegida, la sugerencia de gasto no es una de crédito.
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
// Chips con las descripciones que ya usaste que coinciden con lo que escribes (la lista nativa tapaba el teclado)
function verSugDesc(v) {
  const el = $('sugDesc'); if (!el || !FORM) return;
  const q = sinAcentos(String(v || '').trim());
  const lista = q ? sugerenciasDesc(FORM.tipo).filter(d => sinAcentos(d).includes(q) && sinAcentos(d) !== q).slice(0, 8) : [];
  el.innerHTML = lista.map(d => '<button type="button" ' + al('mousedown', 'sinQuitarFoco') + ' ' + al('click', 'usarSugDesc', d) + '>' + esc(d) + '</button>').join('');
}
function usarSugDesc(d) { const i = $('fDesc'); if (i) i.value = d; FORM.desc = d; alEscribirDesc(d); verSugDesc(''); }
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
    '" aria-pressed="' + (FORM[campo] === c.nombre) + '" ' + al('click', 'setForm', campo, c.nombre) + '>' + esc(c.nombre) + '</button>').join('') + '</div>';
  let h = titulo(ed ? 'Editar movimiento' : 'Registrar');
  if (FORM.recuperado) h += '<div class="note info">Recuperé lo que estabas capturando. <button class="linkbtn" ' + al('click', 'empezarDeNuevo') + '>Empezar de nuevo</button></div>';
  if (FORM.detectado) h += '<div class="note info">🔔 Lo detecté en una notificación de tu banco. Revisa los datos antes de guardar.</div>';
  if (typeof htmlTicketForm === 'function') h += htmlTicketForm();
  if (!ed && t === 'Gasto' && !FORM.ticket && !FORM.ticketMini && fx('ticket')) h += '<button class="btn sm ghost block" style="margin:0 0 12px" ' + al('click', 'abrirHojaTicket') + '>📷 Llenar con la foto del ticket</button>';
  if (t === 'Ajuste') h += '<div class="note">Este ajuste se creó al cuadrar ' + esc(FORM.cuenta) + '. Puedes corregir el monto o eliminarlo.</div>';
  else {
    h += '<div class="seg" role="group" aria-label="Tipo de movimiento">' + ['Gasto', 'Ingreso', 'Traspaso', 'Personas'].map(x => {
      const destino = x === 'Personas' ? (persona ? t : 'Presté') : x;
      return '<button class="' + (grupo === x ? 'on' : '') + '" aria-pressed="' + (grupo === x) + '" ' + al('click', 'setForm', 'tipo', destino) + '>' + x + '</button>';
    }).join('') + '</div>';
  }
  // Pagos fijos de un toque
  if (!ed && (t === 'Gasto' || t === 'Ingreso' || t === 'Traspaso')) {
    const mk = hoy().slice(0, 7), usados = new Set(DATA.movs.filter(m => m.fijo && m.fecha.slice(0, 7) === mk).map(m => m.fijo));
    const fs = DATA.fijos.filter(f => fijoVigente(f) && f.tipo === t).sort((a, b) => usados.has(a.id) - usados.has(b.id));
    if (fs.length) h += '<div class="quick" role="group" aria-label="Pagos fijos">' + fs.map(f => '<button class="' + (usados.has(f.id) ? 'done' : '') + '" ' + al('click', 'aplicarFijo', f.id) + '>' +
      (usados.has(f.id) ? '✓ ' : '') + esc(f.nombre) + ' ' + money(f.monto, f.monto % 1 === 0) + '</button>').join('') + '</div>';
    const favs = t === 'Gasto' ? favoritos() : [];
    if (favs.length) h += '<div class="quick" role="group" aria-label="Tus gastos frecuentes">' + favs.map((f, i) => '<button class="fav" ' + al('click', 'aplicarFavorito', i) + '>' + esc(etiquetaFav(f)) + '</button>').join('') + '</div>';
  }
  if (!ed) h += '<button class="dictar-form" ' + al('click', 'dictar', 'form') + '>' + ICON_MIC + ' Dictar: "650 gasolina débito ayer"</button>';
  h += '<label class="amount"><span aria-hidden="true">$</span><input id="fMonto" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0.00" value="' + esc(FORM.monto) +
    '" ' + al('input', 'escribirMonto') + ' ' + al('keydown', 'enterSuelta') + ' aria-label="Monto"></label><div class="calc" id="calc">' + textoCalc(FORM.monto) + '</div>';

  if (t === 'Traspaso') {
    h += '<div class="fl">De</div>' + chipsCuenta(cuentasPara(t, 'de'), 'cuenta', 'Cuenta de origen');
    h += '<div class="fl">A</div>' + chipsCuenta(cuentasPara(t, 'a'), 'aCuenta', 'Cuenta de destino');
    const dest = DATA.cuentas.find(c => c.nombre === FORM.aCuenta);
    h += '<p class="hint">' + (dest && esDeuda(dest) ? 'Pago a ' + esc(dest.nombre) + ': baja tu deuda. No cuenta como gasto.' : 'Para pagar una tarjeta o el préstamo, pasar dinero entre cuentas o sacar efectivo. No cuenta como gasto.') + '</p>';
  } else if (persona) {
    h += '<div class="fl">¿Qué pasó?</div><div class="pick" role="group" aria-label="Acción">' + TIPOS_PERSONA.map(x => '<button class="' + (t === x ? 'on' : '') + '" aria-pressed="' + (t === x) + '" ' + al('click', 'setForm', 'tipo', x) + '>' + ACCION_PERSONA[x] + '</button>').join('') + '</div>';
    h += '<div class="fl">¿Quién?</div><div class="pick" role="group" aria-label="Persona">' + personasActivas().map(p => '<button class="' + (FORM.persona === p.nombre ? 'on' : '') + '" aria-pressed="' + (FORM.persona === p.nombre) + '" ' + al('click', 'setForm', 'persona', p.nombre) + '>' + esc(p.nombre) + '</button>').join('') +
      '<button class="mas" ' + al('click', 'setForm', 'nuevaP', true) + '>+ Otra persona</button></div>';
    if (FORM.nuevaP) h += '<input id="fNuevaP" class="inp" style="margin-top:8px" maxlength="40" placeholder="Nombre" value="' + esc(FORM.nuevaPNombre || '') + '" ' + al('input', 'escribirNuevaPersona') + '>';
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
    h += '<div class="pick" role="group" aria-label="Categoría">' + visibles.filter(Boolean).map(c => '<button class="' + (FORM.categoria === c.nombre ? 'on' : '') + '" aria-pressed="' + (FORM.categoria === c.nombre) + '" ' + al('click', 'setForm', 'categoria', c.nombre) + '>' +
      emo(ICONO[c.nombre]) + esc(c.nombre) + '</button>').join('') +
      (visibles.length < cats.length ? '<button class="mas" ' + al('click', 'setForm', 'verTodas', true) + '>Ver todas (' + cats.length + ')</button>' : '') + '</div>';
    if (t === 'Ingreso' || t === 'Reembolso') {
      h += '<button class="switch" role="switch" aria-checked="' + (t === 'Reembolso') + '" ' + al('click', 'setForm', 'tipo', (t === 'Reembolso' ? 'Ingreso' : 'Reembolso')) + '><span><b>Es un reembolso</b><br><span class="muted">Alguien te pagó su parte de algo que tú pagaste. Resta del gasto en vez de contar como ingreso.</span></span><span class="knob" aria-hidden="true"></span></button>';
    }
    h += '<div class="fl">' + (t === 'Gasto' ? '¿Con qué pagaste?' : '¿A dónde llegó?') + '</div>' + chipsCuenta(cuentasPara(t), 'cuenta', 'Cuenta');
    const c = DATA.cuentas.find(x => x.nombre === FORM.cuenta), monto = parseMonto(FORM.monto);
    if (t === 'Gasto' && c && esDeuda(c)) h += htmlFinanciamiento(c, FORM.fecha, monto);
    if (t === 'Gasto' && c && c.tipo === 'Crédito') h += htmlMSI(c, monto);
    if (t === 'Gasto' && !ed && !(FORM.msi && c && c.tipo === 'Crédito')) h += htmlDividir(monto);
  }
  const ph = { Gasto: 'Ej. Oxxo, gasolina Pemex', Ingreso: 'Ej. Quincena', Traspaso: 'Ej. Pago tarjeta', Reembolso: 'Ej. Aaron me pagó la pizza', Ajuste: '', 'Presté': 'Ej. Para la renta', 'Me pagaron': 'Ej. Abono', 'Me prestaron': '', 'Le pagué': '' }[t] || '';
  h += '<div class="fl"><label for="fDesc">Descripción</label></div><input id="fDesc" class="inp" maxlength="200" autocomplete="off" placeholder="' + ph + '" value="' + esc(FORM.desc) + '" ' + al('input', 'escribirDesc') + ' ' + al('focus', 'enfocarDesc') + ' ' + al('change', 'cambiarDesc') + '>' +
    '<div id="sugDesc" class="sug" role="group" aria-label="Descripciones que ya usaste"></div>';
  const ayer = sumarDias(hoy(), -1);
  h += '<div class="fl">Fecha</div><div class="datewrap pick" role="group" aria-label="Fecha">' +
    '<button class="' + (FORM.fecha === hoy() ? 'on' : '') + '" aria-pressed="' + (FORM.fecha === hoy()) + '" ' + al('click', 'fechaHoy') + '>Hoy</button>' +
    '<button class="' + (FORM.fecha === ayer ? 'on' : '') + '" aria-pressed="' + (FORM.fecha === ayer) + '" ' + al('click', 'setForm', 'fecha', ayer) + '>Ayer</button>' +
    '<input type="date" id="fFecha" value="' + FORM.fecha + '" max="' + hoy() + '" ' + al('change', 'fechaElegida') + ' aria-label="Otra fecha"></div>';
  const corte = minCorte();
  if (FORM.fecha < corte) h += '<p class="hint red">Esa fecha es anterior al corte (' + fechaCorta(corte) + '). Ese dinero ya está en los saldos del corte, así que no cambiará ningún saldo.</p>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="actbar">' + (ed ? '<button class="btn danger" ' + al('click', 'borrarMovForm') + '>Eliminar</button>' : '<button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button>') +
    '<button class="btn" ' + al('click', 'guardarMovForm') + '>' + (ed ? 'Guardar cambios' : 'Guardar') + '</button></div>';
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
/* ---- Compra a meses sin intereses ---- */
function htmlMSI(c, monto) {
  let h = '<button class="switch" role="switch" aria-checked="' + !!FORM.msi + '" ' + al('click', 'setForm', 'msi', !FORM.msi) + '><span><b>A meses sin intereses</b><br><span class="muted">Tu deuda sube completa, pero a cada estado de cuenta solo entra una mensualidad.</span></span><span class="knob" aria-hidden="true"></span></button>';
  if (!FORM.msi) return h;
  h += '<div class="fl">¿A cuántos meses?</div><div class="pick" role="group" aria-label="Meses">' + PLAZOS_MSI.map(n => '<button class="' + (FORM.meses === n ? 'on' : '') + '" aria-pressed="' + (FORM.meses === n) + '" ' + al('click', 'setForm', 'meses', n) + '>' + n + '</button>').join('') + '</div>';
  const ci = cicloTarjeta(c, FORM.fecha);
  if (FORM.meses && monto > 0) h += '<div class="finan" role="note"><span class="finan-ic" aria-hidden="true">🗓️</span><div>Pagarás <b>' + money(monto / FORM.meses) + ' al mes</b> durante ' + FORM.meses + ' meses' +
    (ci ? '. La primera entra al corte del ' + fechaCorta(ci.corte) + ' y la pagas el ' + fechaCorta(ci.pago) + '; la última, hacia ' + mesDeCorte(ci.corte, FORM.meses - 1) + '.' : '.') + '</div></div>';
  return h;
}
const mesDeCorte = (corte, n) => { const mk = mesSig(corte.slice(0, 7), n); return MESES[+mk.slice(5, 7) - 1] + ' ' + mk.slice(0, 4); };

/* ---- Dividir un gasto entre varios ---- */
function partesDividir(total) {
  const con = (FORM.con || []).slice();
  if (FORM.nuevaDivNombre && FORM.nuevaDivNombre.trim()) con.push(FORM.nuevaDivNombre.trim());
  const n = con.length;
  if (!n || total <= 0) return { con, cada: 0, tuya: total };
  const cada = Math.floor(total / (n + 1) * 100) / 100;
  return { con, cada, tuya: r2(total - cada * n) };
}
function htmlDividir(monto) {
  let h = '<button class="switch" role="switch" aria-checked="' + !!FORM.dividir + '" ' + al('click', 'setForm', 'dividir', !FORM.dividir) + '><span><b>Dividir con otros</b><br><span class="muted">Pagaste por varios: tu parte cuenta como gasto y lo de los demás queda como "te deben".</span></span><span class="knob" aria-hidden="true"></span></button>';
  if (!FORM.dividir) return h;
  const con = FORM.con || [];
  h += '<div class="fl">¿Con quién?</div><div class="pick" role="group" aria-label="Con quién">' + personasActivas().map(p => '<button class="' + (con.indexOf(p.nombre) >= 0 ? 'on' : '') + '" aria-pressed="' + (con.indexOf(p.nombre) >= 0) + '" ' + al('click', 'alternarCon', p.nombre) + '>' + esc(p.nombre) + '</button>').join('') +
    '<button class="mas" ' + al('click', 'setForm', 'nuevaDiv', true) + '>+ Otra persona</button></div>';
  if (FORM.nuevaDiv) h += '<input id="fNuevaDiv" class="inp" style="margin-top:8px" maxlength="40" placeholder="Nombre" value="' + esc(FORM.nuevaDivNombre || '') + '" ' + al('input', 'campoForm', 'nuevaDivNombre') + ' ' + al('change', 'pintarHoja') + '>';
  const pr = partesDividir(monto);
  if (pr.con.length && monto > 0) h += '<div class="card flat" style="margin-top:10px"><div class="qrow"><span>Tu parte (gasto)</span><b class="num">' + money(pr.tuya) + '</b></div>' +
    pr.con.map(n => '<div class="qrow"><span>' + esc(n) + ' te debe</span><b class="num green">' + money(pr.cada) + '</b></div>').join('') + '<div class="muted">Partes iguales entre ' + (pr.con.length + 1) + '.</div></div>';
  return h;
}
function alternarCon(n) { const c = (FORM.con || []).slice(), i = c.indexOf(n); if (i >= 0) c.splice(i, 1); else c.push(n); setForm('con', c); }
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
    : (t === 'Gasto' || t === 'Ingreso' || t === 'Reembolso') && !FORM.categoria ? 'Elige una categoría.'
    : usaMSI() && !FORM.meses ? 'Elige a cuántos meses sin intereses.' : '';
  if (falta) { FORM.err = falta; pintarHoja(); vibrar([20, 40, 20]); return; }
  const nuevo = !FORM.id, firma = t + '|' + monto + '|' + FORM.cuenta + '|' + FORM.fecha;
  if (FORM.confirmado !== firma) {
    const igual = nuevo && DATA.movs.find(m => m.tipo === t && m.monto === monto && m.cuenta === FORM.cuenta && m.fecha === FORM.fecha && Date.now() - (m.registrado || 0) < 15 * 60000);
    const aviso = monto >= 50000 && t !== 'Ajuste' ? '¿Seguro que fueron ' + money(monto) + '? Revisa que no sobre un cero. Toca Guardar otra vez para confirmar.'
      : igual ? 'Hace ' + Math.max(1, Math.round((Date.now() - igual.registrado) / 60000)) + ' min registraste lo mismo (' + money(monto) + ' con ' + FORM.cuenta + '). Si es otro, toca Guardar otra vez.' : '';
    if (aviso) { FORM.confirmado = firma; FORM.err = aviso; pintarHoja(); vibrar([20, 40, 20]); return; }
  }
  if (nuevaPersona) encolar('guardarPersona', [{ nombre: nuevaPersona, saldoCorte: 0, fechaCorte: minCorte() || hoy(), nota: '' }], true);
  if (t === 'Gasto' && nuevo && FORM.dividir && !usaMSI()) {
    const pr = partesDividir(monto);
    if (pr.con.length) return guardarDividido(pr, monto);
  }
  const m = { id: FORM.id || uid(), fecha: FORM.fecha, tipo: t, monto: monto, cuenta: FORM.cuenta, aCuenta: t === 'Traspaso' ? FORM.aCuenta : '',
              categoria: (t === 'Traspaso' || esPersonaTipo(t)) ? '' : FORM.categoria, desc: FORM.desc, registrado: FORM.registrado || Date.now(),
              persona: esPersonaTipo(t) ? FORM.persona : '', fijo: FORM.fijo || '', meses: usaMSI() ? FORM.meses : null, ticket: FORM.ticket || '' };
  quitarDetectado(FORM.detectado);
  LS.set('fin_ult_cuenta_' + t, m.cuenta);
  if (t === 'Ingreso') LS.set('fin_ult_cat_Ingreso', m.categoria);
  FORM._guardado = true; LS.del('fin_draft');
  encolar('guardarMov', [m]);
  vibrar(15);
  cerrarHoja();
  const nombre = { Gasto: 'Gasto guardado', Ingreso: 'Ingreso guardado', Traspaso: 'Traspaso guardado', Reembolso: 'Reembolso guardado', Ajuste: 'Ajuste guardado' }[t] || 'Guardado';
  toast(nuevo ? nombre : 'Cambios guardados', nuevo ? { txt: 'Deshacer', fn: () => encolar('borrarMov', [m.id]) } : null);
}
function usaMSI() { const c = DATA.cuentas.find(x => x.nombre === FORM.cuenta); return FORM.tipo === 'Gasto' && !!FORM.msi && !!c && c.tipo === 'Crédito'; }
function guardarDividido(pr, total) {
  const ids = [], reg = Date.now(), base = FORM.desc || FORM.categoria;
  pr.con.forEach(nom => {
    if (!DATA.personas.some(p => p.nombre.toLowerCase() === nom.toLowerCase())) encolar('guardarPersona', [{ nombre: nom, saldoCorte: 0, fechaCorte: minCorte() || hoy(), nota: '' }], true);
  });
  const nombreReal = nom => (DATA.personas.find(p => p.nombre.toLowerCase() === nom.toLowerCase()) || { nombre: nom }).nombre;
  const g = { id: uid(), fecha: FORM.fecha, tipo: 'Gasto', monto: pr.tuya, cuenta: FORM.cuenta, aCuenta: '', categoria: FORM.categoria, desc: (FORM.desc ? FORM.desc + ' · ' : '') + 'dividido entre ' + (pr.con.length + 1), registrado: reg, persona: '', fijo: '' };
  ids.push(g.id); encolar('guardarMov', [g], true);
  pr.con.forEach((nom, i) => {
    const m = { id: uid(), fecha: FORM.fecha, tipo: 'Presté', monto: pr.cada, cuenta: FORM.cuenta, aCuenta: '', categoria: '', desc: 'Su parte de: ' + base, registrado: reg + i + 1, persona: nombreReal(nom), fijo: '' };
    ids.push(m.id); encolar('guardarMov', [m], true);
  });
  LS.set('fin_ult_cuenta_Gasto', FORM.cuenta);
  FORM._guardado = true; LS.del('fin_draft');
  vibrar(15); cerrarHoja(); pintar();
  toast('Gasto dividido entre ' + (pr.con.length + 1), { txt: 'Deshacer', fn: () => ids.forEach(id => encolar('borrarMov', [id], true)) || pintar() });
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
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarPres') + '>Guardar presupuesto</button></div>';
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
  h += '<label class="amount"><span aria-hidden="true">$</span><input id="fReal" inputmode="decimal" placeholder="0.00" ' + al('input', 'difCuadrar') + '></label>';
  h += '<div id="difC" class="hint" aria-live="polite">La diferencia se registra como ajuste "Sin registrar" con fecha de hoy.</div>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarCuadre') + '>Cuadrar</button></div>';
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
function abrirCuenta(n) { const c = DATA.cuentas.find(x => x.nombre === n); FORM = { vista: 'cuenta', nombre: n, nuevo: n, diaCorte: c.diaCorte || '', diaPago: c.diaPago || '', tasa: c.tasa ? r2(c.tasa * 100) : '', limite: c.limite || '', domiciliado: c.domiciliado || '', err: '' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaCuenta() {
  const c = DATA.cuentas.find(x => x.nombre === FORM.nombre), deuda = esDeuda(c), s = saldo(c);
  let h = titulo('Editar ' + esc(c.nombre));
  h += '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" value="' + esc(FORM.nuevo) + '" ' + al('input', 'campoForm', 'nuevo') + '>';
  if (deuda) {
    h += '<div class="grid2"><div><div class="fl"><label for="fCorte">Día de corte</label></div><input id="fCorte" class="inp" inputmode="numeric" placeholder="Ej. 9" value="' + esc(FORM.diaCorte) + '" ' + al('input', 'campoForm', 'diaCorte') + '></div>' +
      '<div><div class="fl"><label for="fPago">Día límite de pago</label></div><input id="fPago" class="inp" inputmode="numeric" placeholder="Ej. 28" value="' + esc(FORM.diaPago) + '" ' + al('input', 'campoForm', 'diaPago') + '></div></div>' +
      '<div class="fl"><label for="fTasa">Tasa de interés anual (%)</label></div><input id="fTasa" class="inp" inputmode="decimal" placeholder="Está en tu estado de cuenta, ej. 45" value="' + esc(FORM.tasa) + '" ' + al('input', 'campoForm', 'tasa') + '>' +
      '<p class="hint">Con la fecha de pago, Inicio te avisa 5 días antes. Con la tasa, el plan de deuda sabe cuál pagar primero.</p>';
    if (c.tipo === 'Crédito') {
      h += '<div class="fl"><label for="fLim">Límite de crédito</label></div><label class="amount" style="padding:4px 14px"><span style="font-size:24px" aria-hidden="true">$</span><input id="fLim" inputmode="decimal" style="font-size:26px" placeholder="0" value="' + esc(FORM.limite) + '" ' + al('input', 'campoForm', 'limite') + '></label>' +
        '<p class="hint">Para ver cuánto crédito te queda y qué porcentaje usas (al buró le gusta debajo del 30%).</p>';
      h += '<div class="fl">Pago domiciliado</div><div class="pick" role="group" aria-label="Pago domiciliado desde">' +
        '<button class="' + (!FORM.domiciliado ? 'on' : '') + '" aria-pressed="' + !FORM.domiciliado + '" ' + al('click', 'setForm', 'domiciliado', '') + '>No está domiciliado</button>' +
        activas().filter(x => !esDeuda(x)).map(x => '<button class="' + (FORM.domiciliado === x.nombre ? 'on' : '') + '" aria-pressed="' + (FORM.domiciliado === x.nombre) + '" ' + al('click', 'setForm', 'domiciliado', x.nombre) + '>Desde ' + esc(x.nombre) + '</button>').join('') + '</div>' +
        '<p class="hint">Si tu banco cobra solo el "pago para no generar intereses", elige de qué cuenta sale: en la fecha límite la app registra el pago sola con el monto de tu estado de cuenta.</p>';
    }
  }
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="card flat" style="margin-top:16px"><div class="t1">' + (c.archivada ? 'Cuenta archivada' : 'Archivar cuenta') + '</div><div class="muted" style="margin:4px 0 8px">' +
    (c.archivada ? 'No aparece en tus listas ni al registrar.' : Math.abs(s) > 0.004 ? 'Para archivarla su saldo debe estar en $0 (ahora: ' + money(Math.abs(s)) + ').' : 'Ya está en $0. Al archivarla deja de aparecer en tus listas; su historial se queda.') + '</div>' +
    '<button class="btn sm ghost" ' + (!c.archivada && Math.abs(s) > 0.004 ? 'disabled' : '') + ' ' + al('click', 'archivarCuenta', (!c.archivada)) + '>' + (c.archivada ? 'Volver a activar' : 'Archivar') + '</button></div>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarCuentaForm') + '>Guardar</button></div>';
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
  if (c.tipo === 'Crédito') { const l = parseMonto(FORM.limite); cambios.limite = l > 0 ? Math.round(l) : null; cambios.domiciliado = FORM.domiciliado || ''; }
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
    '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" placeholder="Ej. Nu, Tarjeta Liverpool" value="' + esc(FORM.nombre) + '" ' + al('input', 'campoForm', 'nombre') + '>' +
    '<div class="fl">Tipo</div><div class="pick" role="group" aria-label="Tipo">' + tipos.map(t => '<button class="' + (FORM.tipo === t ? 'on' : '') + '" aria-pressed="' + (FORM.tipo === t) + '" ' + al('click', 'setForm', 'tipo', t) + '>' + t + '</button>').join('') + '</div>' +
    '<div class="fl"><label for="fSal">' + (deuda ? '¿Cuánto debes hoy?' : '¿Cuánto tiene hoy?') + '</label></div>' +
    '<label class="amount"><span aria-hidden="true">$</span><input id="fSal" inputmode="decimal" placeholder="0.00" value="' + esc(FORM.saldo) + '" ' + al('input', 'campoForm', 'saldo') + '></label>' +
    (FORM.err ? '<div class="note red" role="alert">' + esc(FORM.err) + '</div>' : '') +
    '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarNuevaCuenta') + '>Agregar</button></div>';
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
    '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" value="' + esc(FORM.nombre) + '" ' + al('input', 'campoForm', 'nombre') + '>' +
    '<div class="fl">Hoy</div><div class="pick" role="group" aria-label="Quién debe">' +
    '<button class="' + (FORM.dir === 'me' ? 'on' : '') + '" aria-pressed="' + (FORM.dir === 'me') + '" ' + al('click', 'setForm', 'dir', 'me') + '>Me debe</button>' +
    '<button class="' + (FORM.dir === 'yo' ? 'on' : '') + '" aria-pressed="' + (FORM.dir === 'yo') + '" ' + al('click', 'setForm', 'dir', 'yo') + '>Le debo</button></div>' +
    '<div class="fl"><label for="fSal">¿Cuánto? (0 si están a mano)</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fSal" inputmode="decimal" placeholder="0.00" value="' + esc(FORM.saldo) + '" ' + al('input', 'campoForm', 'saldo') + '></label>' +
    '<div class="fl"><label for="fNota">Nota</label></div><input id="fNota" class="inp" maxlength="200" placeholder="Ej. Le presté para su carro; me paga en diciembre" value="' + esc(FORM.nota) + '" ' + al('input', 'campoForm', 'nota') + '>' +
    '<p class="hint">Esto no mueve ninguna de tus cuentas: es lo que ya estaba prestado. Si le prestas hoy, usa + → Personas → Le presté.</p>' +
    (FORM.err ? '<div class="note red" role="alert">' + esc(FORM.err) + '</div>' : '') +
    '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarNuevaPersona') + '>Agregar</button></div>';
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
  if (!p.archivada) h += '<div class="actgrid">' + (s >= 0
      ? '<button class="btn" ' + (s === 0 ? 'disabled' : '') + ' ' + al('click', 'abrirRegistro', { tipo: 'Me pagaron', persona: p.nombre }) + '>Me pagó</button><button class="btn ghost" ' + al('click', 'abrirRegistro', { tipo: 'Presté', persona: p.nombre }) + '>Le presté</button><button class="btn ghost" ' + al('click', 'abrirRegistro', { tipo: 'Me prestaron', persona: p.nombre }) + '>Me prestó</button>'
      : '<button class="btn" ' + al('click', 'abrirRegistro', { tipo: 'Le pagué', persona: p.nombre }) + '>Le pagué</button><button class="btn ghost" ' + al('click', 'abrirRegistro', { tipo: 'Me prestaron', persona: p.nombre }) + '>Me prestó más</button><button class="btn ghost" ' + al('click', 'abrirRegistro', { tipo: 'Presté', persona: p.nombre }) + '>Le presté</button>') + '</div>';
  h += '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" value="' + esc(FORM.nuevo) + '" ' + al('input', 'campoForm', 'nuevo') + '>';
  h += '<div class="fl"><label for="fNota">Nota</label></div><input id="fNota" class="inp" maxlength="200" value="' + esc(FORM.nota) + '" ' + al('input', 'campoForm', 'nota') + '>';
  if (movs.length) h += '<div class="fl" style="margin-top:16px">Historial</div><div class="list">' + movs.map(filaMov).join('') + '</div>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="card flat" style="margin-top:16px"><div class="t1">' + (p.archivada ? 'Archivada' : 'Archivar') + '</div><div class="muted" style="margin:4px 0 8px">' +
    (p.archivada ? 'No aparece en tus listas.' : Math.abs(s) > 0.004 ? 'Para archivarla deben estar a mano.' : 'Están a mano. Al archivarla deja de aparecer; su historial se queda.') + '</div>' +
    '<button class="btn sm ghost" ' + (!p.archivada && Math.abs(s) > 0.004 ? 'disabled' : '') + ' ' + al('click', 'archivarPersona', (!p.archivada)) + '>' + (p.archivada ? 'Volver a activar' : 'Archivar') + '</button></div>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarPersonaForm') + '>Guardar</button></div>';
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
  h += '<div class="seg" role="group" aria-label="Tipo">' + ['Gasto', 'Ingreso', 'Traspaso'].map(x => '<button class="' + (FORM.tipo === x ? 'on' : '') + '" aria-pressed="' + (FORM.tipo === x) + '" ' + al('click', 'tipoFijo', x) + '>' + TIPO_FIJO[x] + '</button>').join('') + '</div>';
  h += '<div class="fl"><label for="fNom">Nombre</label></div><input id="fNom" class="inp" maxlength="40" placeholder="Ej. Spotify" value="' + esc(FORM.nombre) + '" ' + al('input', 'campoForm', 'nombre') + '>';
  h += '<div class="fl"><label for="fMontoF">Monto</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fMontoF" inputmode="decimal" placeholder="0.00" value="' + esc(FORM.monto) + '" ' + al('input', 'campoForm', 'monto') + '></label>';
  if (deudaFijo) h += '<div class="fl">¿A qué deuda?</div><div class="pick" role="group" aria-label="Deuda">' + activas().filter(esDeuda).map(c => '<button class="debtacc' + (FORM.aCuenta === c.nombre ? ' on' : '') + '" aria-pressed="' + (FORM.aCuenta === c.nombre) + '" ' + al('click', 'setForm', 'aCuenta', c.nombre) + '>' + esc(c.nombre) + '</button>').join('') + '</div><p class="hint">Cuenta como traspaso: baja tu deuda y no cuenta como gasto. Cuando esa deuda llegue a $0, deja de aparecer.</p>';
  else h += '<div class="fl">Categoría</div><div class="pick" role="group" aria-label="Categoría">' + cats.map(c => '<button class="' + (FORM.categoria === c.nombre ? 'on' : '') + '" aria-pressed="' + (FORM.categoria === c.nombre) + '" ' + al('click', 'setForm', 'categoria', c.nombre) + '>' + emo(ICONO[c.nombre]) + esc(c.nombre) + '</button>').join('') + '</div>';
  h += '<div class="fl">' + (deudaFijo ? '¿De qué cuenta pagas?' : 'Cuenta') + '</div><div class="pick" role="group" aria-label="Cuenta"><button class="' + (!FORM.cuenta ? 'on' : '') + '" aria-pressed="' + (!FORM.cuenta) + '" ' + al('click', 'setForm', 'cuenta', '') + '>Preguntar cada vez</button>' +
    cs.map(c => '<button class="' + (esDeuda(c) ? 'debtacc' : '') + (FORM.cuenta === c.nombre ? ' on' : '') + '" aria-pressed="' + (FORM.cuenta === c.nombre) + '" ' + al('click', 'setForm', 'cuenta', c.nombre) + '>' + esc(c.nombre) + '</button>').join('') + '</div>';
  h += '<div class="fl"><label for="fDia">Día del mes (opcional)</label></div><input id="fDia" class="inp" inputmode="numeric" placeholder="Ej. 2" value="' + esc(FORM.dia) + '" ' + al('input', 'campoForm', 'dia') + '>';
  if (FORM.id) h += '<button class="switch" role="switch" aria-checked="' + FORM.activo + '" ' + al('click', 'setForm', 'activo', !FORM.activo) + '><span><b>Activo</b><br><span class="muted">Si lo pausas, no cuenta como comprometido.</span></span><span class="knob" aria-hidden="true"></span></button>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  h += '<div class="actbar">' + (FORM.id ? '<button class="btn danger" ' + al('click', 'borrarFijoForm') + '>Eliminar</button>' : '<button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button>') + '<button class="btn" ' + al('click', 'guardarFijoForm') + '>Guardar</button></div>';
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

/* ---- Metas de ahorro ----
 * El "apartado" es dinero que ya tienes y separas para la meta (en tu cabeza o en tu cuenta de ahorro); no mueve saldos.
 * Con fecha, la app calcula cuánto apartar por quincena y lo resta en el plan de la quincena. */
const ICONOS_META = ['🎯', '✈️', '🚗', '📱', '💻', '🏠', '🎮', '🎁', '🎉', '🛡️'];
const metasActivas = () => DATA.metas.filter(m => !m.cumplida);
const apartadoMetas = () => r2(metasActivas().reduce((t, m) => t + (m.apartado || 0), 0));
function planMeta(m) {
  const falta = r2(Math.max(0, m.objetivo - (m.apartado || 0)));
  if (!m.fecha || falta <= 0) return { falta, porQ: falta > 0 ? null : 0, quincenas: null };
  const quincenas = Math.max(1, Math.ceil(difDias(hoy(), m.fecha) / 15.2));
  return { falta, porQ: r2(falta / quincenas), quincenas };
}
function tarjetaMetas() {
  const ms = metasActivas();
  if (!ms.length) return '<button class="card row between" ' + al('click', 'abrirMeta') + '><span><span class="t1">🎯 Metas de ahorro</span><br><span class="muted">¿Ahorras para algo grande? Ponle meta y fecha y te digo cuánto apartar por quincena.</span></span><span class="chev" aria-hidden="true">›</span></button>';
  return '<h2>Tus metas<button class="more" ' + al('click', 'abrirMeta') + '>Agregar</button></h2><div class="list" style="margin-bottom:12px">' + ms.map(m => {
    const pl = planMeta(m), pct = m.objetivo > 0 ? Math.min(100, (m.apartado || 0) / m.objetivo * 100) : 0;
    return '<button class="meta acc rowbtn" ' + al('click', 'abrirMeta', m.id) + '><span class="aic meta-ic" aria-hidden="true">' + esc(m.icono || '🎯') + '</span><span class="tx">' +
      '<span class="row between"><span class="t1">' + esc(m.nombre) + '</span><span class="num t1">' + Math.round(pct) + '%</span></span>' +
      '<span class="meter" style="height:7px;margin:6px 0 4px" aria-hidden="true"><div style="width:' + pct.toFixed(1) + '%"></div></span>' +
      '<span class="muted">' + money(m.apartado || 0, true) + ' de ' + money(m.objetivo, true) + (pl.falta <= 0 ? ' · ¡Lista! 🎉' : pl.porQ ? ' · aparta ' + money(pl.porQ, true) + ' por quincena' : '') +
      (m.fecha ? ' · ' + fechaCorta(m.fecha) : '') + '</span></span></button>';
  }).join('') + '</div>';
}
function abrirMeta(id) {
  const m = id && DATA.metas.find(x => x.id === id);
  FORM = m ? { vista: 'meta', id: m.id, nombre: m.nombre, objetivo: String(m.objetivo), fecha: m.fecha || '', apartado: String(m.apartado || 0), icono: m.icono || '🎯', mover: '', err: '' }
           : { vista: 'meta', id: null, nombre: '', objetivo: '', fecha: '', apartado: '', icono: '🎯', mover: '', err: '' };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function hojaMeta() {
  const m = FORM.id && DATA.metas.find(x => x.id === FORM.id);
  let h = titulo(m ? esc(m.icono || '🎯') + ' ' + esc(m.nombre) : 'Nueva meta de ahorro');
  if (m && !m.cumplida) {
    const pl = planMeta(m), pct = Math.min(100, (m.apartado || 0) / m.objetivo * 100);
    h += '<div class="card flat"><div class="muted">Llevas apartado</div><div class="amt num" style="font-size:30px">' + money(m.apartado || 0) + '</div>' +
      '<div class="meter" aria-hidden="true"><div style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="muted">' + (pl.falta > 0 ? 'Te faltan ' + money(pl.falta) + (pl.porQ ? ': ' + money(pl.porQ) + ' por quincena durante ' + pl.quincenas + (pl.quincenas === 1 ? ' quincena' : ' quincenas') : '') + '.' : '¡Ya juntaste todo! 🎉') + '</div></div>';
    h += '<div class="fl"><label for="fMover">Mover dinero de la meta</label></div><div class="row"><label class="amount" style="flex:1;padding:2px 14px;margin:0"><span style="font-size:22px" aria-hidden="true">$</span>' +
      '<input id="fMover" inputmode="decimal" style="font-size:24px" placeholder="0" value="' + esc(FORM.mover) + '" ' + al('input', 'campoForm', 'mover') + '></label></div>' +
      '<div class="actions"><button class="btn sm" style="flex:1" ' + al('click', 'moverMeta', 1) + '>+ Apartar</button><button class="btn sm ghost" style="flex:1" ' + al('click', 'moverMeta', -1) + '>− Sacar</button></div>' +
      '<p class="hint">Apartar no mueve dinero entre cuentas: solo separa lo que ya tienes para que no lo cuentes como libre. Tip: guárdalo en tu cuenta de ahorro.</p>';
  }
  h += '<div class="fl"><label for="fMNom">¿Para qué ahorras?</label></div><input id="fMNom" class="inp" maxlength="60" placeholder="Ej. Viaje a Japón, iPhone, fondo de emergencia" value="' + esc(FORM.nombre) + '" ' + al('input', 'campoForm', 'nombre') + '>';
  h += '<div class="fl">Ícono</div><div class="pick" role="group" aria-label="Ícono">' + ICONOS_META.map(i => '<button class="' + (FORM.icono === i ? 'on' : '') + '" aria-pressed="' + (FORM.icono === i) + '" ' + al('click', 'setForm', 'icono', i) + '>' + i + '</button>').join('') + '</div>';
  h += '<div class="fl"><label for="fMObj">¿Cuánto necesitas?</label></div><label class="amount" style="padding:4px 14px"><span style="font-size:24px" aria-hidden="true">$</span><input id="fMObj" inputmode="decimal" style="font-size:28px" placeholder="0" value="' + esc(FORM.objetivo) + '" ' + al('input', 'campoForm', 'objetivo') + '></label>';
  h += '<div class="fl"><label for="fMFecha">¿Para cuándo? (opcional)</label></div><input id="fMFecha" type="date" class="inp" min="' + hoy() + '" value="' + esc(FORM.fecha) + '" ' + al('change', 'campoForm', 'fecha') + '>';
  if (!m) h += '<div class="fl"><label for="fMAp">¿Ya tienes algo apartado?</label></div><label class="amount" style="padding:4px 14px"><span style="font-size:24px" aria-hidden="true">$</span><input id="fMAp" inputmode="decimal" style="font-size:28px" placeholder="0" value="' + esc(FORM.apartado) + '" ' + al('input', 'campoForm', 'apartado') + '></label>';
  if (FORM.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(FORM.err) + '</div>';
  if (m && !m.cumplida) h += '<button class="btn ghost block" style="margin-top:14px" ' + al('click', 'cumplirMeta') + '>🎉 Ya lo compré</button>';
  if (m) h += '<button class="btn danger block" style="margin-top:8px" ' + al('click', 'borrarMetaForm') + '>Eliminar meta</button>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarMetaForm') + '>Guardar</button></div>';
  return h;
}
function datosMeta() {
  const m = FORM.id && DATA.metas.find(x => x.id === FORM.id);
  return { id: FORM.id || uid(), nombre: String(FORM.nombre || '').trim(), objetivo: r2(parseMonto(FORM.objetivo)), fecha: FORM.fecha || '',
           apartado: m ? m.apartado || 0 : Math.max(0, r2(parseMonto(FORM.apartado))), icono: FORM.icono || '🎯', cumplida: m ? !!m.cumplida : false };
}
function guardarMetaForm() {
  const d = datosMeta();
  if (!d.nombre) { FORM.err = 'Ponle nombre a tu meta.'; return pintarHoja(); }
  if (d.objetivo <= 0) { FORM.err = 'Escribe cuánto necesitas.'; return pintarHoja(); }
  encolar('guardarMeta', [d]); vibrar(15); cerrarHoja(); toast('Meta guardada');
}
function moverMeta(signo) {
  const m = DATA.metas.find(x => x.id === FORM.id), v = parseMonto($('fMover').value);
  if (!m || v <= 0) return toast('Escribe cuánto');
  const nuevo = r2(Math.max(0, (m.apartado || 0) + signo * v));
  encolar('guardarMeta', [Object.assign({}, m, { apartado: nuevo })], true);
  FORM.mover = ''; vibrar(15); pintarHoja();
  toast(signo > 0 ? 'Apartaste ' + money(v) + ' para ' + m.nombre : 'Sacaste ' + money(Math.min(v, m.apartado || 0)) + ' de ' + m.nombre);
}
function cumplirMeta() {
  const m = DATA.metas.find(x => x.id === FORM.id); if (!m) return;
  encolar('guardarMeta', [Object.assign({}, m, { cumplida: true })], true);
  FORM = null;
  abrirRegistro({ tipo: 'Gasto', monto: m.apartado || m.objetivo, desc: m.nombre });
  toast('¡Felicidades! Registra la compra');
}
function borrarMetaForm() {
  const m = DATA.metas.find(x => x.id === FORM.id); if (!m) return;
  encolar('borrarMeta', [m.id]); cerrarHoja();
  toast(m.nombre + ' eliminada', { txt: 'Deshacer', fn: () => encolar('guardarMeta', [m]) });
}

/* ---- Proyección del mes: lo que llevas + tu ritmo diario por los días que faltan + los fijos que faltan ---- */
function proyeccionMes(mk) {
  const r = resumenMes(mk), D = diasDelMes(mk), d = Math.max(1, Math.min(D, difDias(mk + '-01', hoy()) + 1));
  const fijosReg = DATA.movs.filter(m => m.tipo === 'Gasto' && m.fijo && !/^auto:/.test(m.fijo) && m.fecha.slice(0, 7) === mk).reduce((t, m) => t + m.monto, 0);
  // Las compras a meses son puntuales: cuentan en lo que llevas, pero no en tu ritmo diario
  const msi = DATA.movs.filter(m => esMSI(m) && m.fecha.slice(0, 7) === mk).reduce((t, m) => t + m.monto, 0);
  const variable = Math.max(0, r.neto - fijosReg - msi);
  const pend = fijosPendientes(mk).filter(f => f.tipo === 'Gasto').reduce((t, f) => t + f.monto, 0);
  // Los primeros 10 días tu ritmo se mezcla con lo normal en tus meses anteriores (mediana, sin fijos), para que un día raro no dispare la cuenta
  const pm = porMes(movsAnalisis()), prev = Object.keys(pm).filter(k => k < mk && pm[k].gasto > 0).sort().slice(-3).map(k => pm[k].gasto).sort((a, b) => a - b);
  const fijosMes = DATA.fijos.filter(f => fijoVigente(f) && f.tipo === 'Gasto').reduce((t, f) => t + f.monto, 0);
  const diarioHist = prev.length ? Math.max(0, prev[Math.floor(prev.length / 2)] - fijosMes) / 30.4 : variable / d;
  const peso = Math.min(1, d / 10), diario = peso * (variable / d) + (1 - peso) * diarioHist;
  const restan = D - d;
  return { proy: r2(r.neto + diario * restan + pend), presupuesto: r.presupuesto, diario: r2(diario), restan, neto: r.neto, pend: r2(pend),
           maxDiario: restan > 0 ? r2((r.presupuesto - r.neto - pend) / restan) : null };
}
function tarjetaProyeccion(mk) {
  const p = proyeccionMes(mk), sobra = r2(p.presupuesto - p.proy), max = Math.max(p.proy, p.presupuesto) || 1;
  return '<div class="card"><div class="t1">Proyección de ' + MESES[+mk.slice(5, 7) - 1] + '</div>' +
    '<div class="muted" style="margin:2px 0 8px">Con tu ritmo de ' + money(p.diario, true) + ' al día' + (p.pend ? ' y ' + money(p.pend, true) + ' de fijos que faltan' : '') + '.</div>' +
    '<div class="row between"><span class="amt num' + (sobra < 0 ? ' red' : '') + '">' + money(p.proy, true) + '</span><span class="muted">presupuesto ' + money(p.presupuesto, true) + '</span></div>' +
    '<div class="hbar" style="margin:10px 0 8px" role="img" aria-label="Proyección ' + money(p.proy, true) + ' contra presupuesto ' + money(p.presupuesto, true) + '"><div class="' + (sobra < 0 ? 'over' : '') + '" style="width:' + (p.proy / max * 100).toFixed(1) + '%"></div><i style="left:' + (p.presupuesto / max * 100).toFixed(1) + '%"></i></div>' +
    '<div class="muted">' + (sobra >= 0 ? 'Terminarías con <b class="green">' + money(sobra, true) + '</b> debajo del presupuesto.' : 'Te pasarías por <b class="red">' + money(-sobra, true) + '</b>.') +
    (p.maxDiario !== null ? ' Para no pasarte, gasta máximo <b>' + money(Math.max(0, p.maxDiario), true) + ' al día</b> el resto del mes.' : '') + '</div></div>';
}

/* ---- Categorías: en qué se fue tu dinero un mes (como la hoja Presupuesto de tu Excel) y contra meses pasados ---- */
// Los 7 colores van a tus 7 categorías de más gasto en todo el historial (siempre el mismo color para la misma categoría); las demás van juntas en "Resto".
function slotsCategorias(pm) {
  const tot = {};
  Object.values(pm).forEach(x => Object.keys(x.cat).forEach(c => { tot[c] = (tot[c] || 0) + Math.max(0, x.cat[c]); }));
  const orden = Object.keys(tot).sort((a, b) => tot[b] - tot[a]), slot = {};
  orden.forEach((c, i) => { slot[c] = i < 7 ? i + 1 : 0; });
  return slot;
}
function vistaCategorias() {
  const pm = porMes(movsAnalisis()), act = hoy().slice(0, 7), conDatos = Object.keys(pm).filter(k => pm[k].gasto > 0).sort();
  if (!MES_CAT) { const ant = mesSig(act, -1); MES_CAT = pm[ant] && pm[ant].gasto > 0 ? ant : (conDatos.filter(k => k < act).pop() || act); }
  const ini = conDatos[0] || act, x = pm[MES_CAT];
  let h = '<div class="monthbar"><button class="arrow" aria-label="Mes anterior" ' + (MES_CAT <= ini ? 'disabled' : '') + ' ' + al('click', 'moverMesCat', -1) + '>' + ARROW_L + '</button>' +
    '<span class="nm" aria-live="polite">' + nombreMes(MES_CAT) + '</span><button class="arrow" aria-label="Mes siguiente" ' + (MES_CAT >= act ? 'disabled' : '') + ' ' + al('click', 'moverMesCat', 1) + '>' + ARROW_R + '</button></div>';
  if (!x || x.gasto <= 0) return h + '<div class="list"><div class="empty">Sin gastos registrados en ' + nombreMes(MES_CAT) + '.</div></div>';
  const slot = slotsCategorias(pm), cats = Object.keys(x.cat).filter(c => x.cat[c] > 0).sort((a, b) => x.cat[b] - x.cat[a]);
  const total = cats.reduce((t, c) => t + x.cat[c], 0);
  // Mes anterior con datos y promedio de los 3 anteriores, para comparar
  const previos = conDatos.filter(k => k < MES_CAT).slice(-3), anterior = previos[previos.length - 1];
  const prom = c => previos.length ? previos.reduce((t, k) => t + Math.max(0, pm[k].cat[c] || 0), 0) / previos.length : null;
  // Rebanadas: cada categoría con color propio; las que no tienen color se juntan en "Resto"
  const reb = [], otras = { n: 'Resto', v: 0, s: 0, cats: [] };
  cats.forEach(c => { if (slot[c]) reb.push({ n: c, v: x.cat[c], s: slot[c] }); else { otras.v += x.cat[c]; otras.cats.push(c); } });
  if (otras.v > 0) reb.push(otras);
  h += '<div class="card"><div class="t1">¿En qué se fue tu dinero?</div><div class="muted" style="margin:2px 0 6px">Gasto neto de ' + nombreMes(MES_CAT) + ' por categoría (ya descuenta reembolsos).</div>' +
    '<div class="dona-wrap">' + dona(reb, total) + '<div class="dona-ley">' + reb.map(r => '<button class="ley" ' + (r.n === 'Resto' ? '' : al('click', 'verCatMes', r.n)) + '><i class="sw s' + r.s + '"></i><span>' + esc(r.n) + '</span><b class="num">' + Math.round(r.v / total * 100) + '%</b></button>').join('') + '</div></div>' +
    (otras.cats.length ? '<p class="hint" style="margin-top:4px">Resto: ' + esc(otras.cats.join(', ')) + '.</p>' : '') + '</div>';
  h += '<div class="card" style="padding:6px 16px"><div class="cat-h"><span>Categoría</span><span>Gasto · % del mes</span></div>' + cats.map(c => {
    const v = x.cat[c], pa = anterior ? Math.max(0, pm[anterior].cat[c] || 0) : null, pr = prom(c);
    const dif = pa ? Math.round((v - pa) / pa * 100) : null;
    return '<button class="cat-row" ' + al('click', 'verCatMes', c) + '><span class="cat-nm"><i class="sw s' + (slot[c] || 0) + '"></i>' + emo(ICONO[c]) + esc(c) + '</span>' +
      '<span class="num"><b>' + money(v, true) + '</b> <span class="muted">' + (v / total * 100).toFixed(1) + '%</span></span>' +
      '<span class="cat-cmp muted">' + (anterior ? (dif === null ? 'Nuevo vs ' + MESES[+anterior.slice(5, 7) - 1].slice(0, 3) : '<span class="' + (dif > 0 ? 'red' : 'green') + '">' + (dif > 0 ? '▲ ' : dif < 0 ? '▼ ' : '') + Math.abs(dif) + '%</span> vs ' + MESES[+anterior.slice(5, 7) - 1].slice(0, 3)) : '') +
      (pr ? ' · promedio ' + money(pr, true) : '') + '</span></button>';
  }).join('') + '<div class="qrow tot"><span>Total</span><b class="num">' + money(total, true) + '</b></div></div>';
  h += '<p class="hint">Toca una categoría para ver cada gasto del mes y cómo ha ido en los meses pasados. "vs" compara contra el mes anterior con registro; el promedio es de los 3 anteriores.</p>';
  return h;
}
// Dona en SVG: rebanadas con 2px de separación, total al centro
function dona(reb, total) {
  const R = 62, C = 2 * Math.PI * R, gap = reb.length > 1 ? 2 : 0;
  let off = 0, s = '<svg class="dona" viewBox="0 0 160 160" role="img" aria-label="Gasto por categoría: ' + esc(reb.map(r => r.n + ' ' + Math.round(r.v / total * 100) + '%').join(', ')) + '">';
  reb.forEach(r => {
    const len = r.v / total * C;
    s += '<circle cx="80" cy="80" r="' + R + '" class="seg s' + r.s + '" stroke-dasharray="' + Math.max(0.5, len - gap).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"' +
      (r.n !== 'Resto' ? ' ' + al('click', 'verCatMes', r.n) + '' : '') + '><title>' + esc(r.n) + ': ' + money(r.v, true) + ' (' + Math.round(r.v / total * 100) + '%)</title></circle>';
    off += len;
  });
  return s + '<text x="80" y="76" class="dona-t num">' + money(total, true) + '</text><text x="80" y="96" class="dona-s">gasto neto</text></svg>';
}
function verCatMes(c) { FORM = { vista: 'catMes', cat: c, mes: MES_CAT }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaCatMes() {
  const c = FORM.cat, mk = FORM.mes, pm = porMes(movsAnalisis());
  const lista = movsAnalisis().filter(m => m.categoria === c && m.fecha.slice(0, 7) === mk && (m.tipo === 'Gasto' || m.tipo === 'Reembolso')).sort(ordenMov);
  const meses = []; for (let k = mesSig(mk, -5); k <= mk; k = mesSig(k, 1)) meses.push(k);
  const vals = meses.map(k => pm[k] ? r2(Math.max(0, pm[k].cat[c] || 0)) : null), cat = DATA.categorias.find(x => x.nombre === c && x.tipo === 'Gasto');
  let h = titulo(emo(ICONO[c]) + esc(c));
  h += '<div class="card flat"><div class="muted">' + nombreMes(mk) + '</div><div class="amt num" style="font-size:28px">' + money(pm[mk] ? pm[mk].cat[c] || 0 : 0) + '</div>' +
    '<div class="muted">' + (n => n + (n === 1 ? ' gasto' : ' gastos'))(lista.filter(m => m.tipo === 'Gasto').length) + (cat && cat.presupuesto ? ' · presupuesto ' + money(cat.presupuesto, true) : '') + '</div></div>';
  h += '<div class="fl">Últimos 6 meses</div><div class="card">' + graficaMeses(meses, vals, cat && cat.presupuesto || 0, pm, 'detalleCatMes') + '<div class="tip" id="tipCat" aria-live="polite">Toca una barra para ver el mes.</div></div>';
  h += '<div class="fl">Gastos de ' + nombreMes(mk) + '</div>';
  h += lista.length ? '<div class="list">' + lista.map(m => m.id ? filaMov(m) :
    '<div class="mv"><span class="ic" style="--c:' + colorMov(m) + '" aria-hidden="true">' + icono(m) + '</span><span class="tx"><div class="d1">' + esc(m.desc || m.categoria) + '</div><div class="d2">' + fechaLarga(m.fecha) + ' · del historial</div></span><span class="m num' + (m.tipo === 'Reembolso' ? ' in' : '') + '">' + (m.tipo === 'Reembolso' ? '+' : '−') + money(m.monto) + '</span></div>').join('') + '</div>'
    : '<div class="list"><div class="empty">Sin gastos.</div></div>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button></div>';
  return h;
}
function detalleCatMes(mk) {
  const pm = porMes(movsAnalisis()), el = $('tipCat'), v = pm[mk] ? pm[mk].cat[FORM.cat] || 0 : null;
  if (!el) return;
  el.innerHTML = '<b>' + nombreMes(mk) + '</b>: ' + (v === null ? 'sin registro.' : money(v, true) + (pm[mk].gasto > 0 ? ', el ' + Math.round(v / pm[mk].gasto * 100) + '% de lo que gastaste ese mes.' : '.'));
  vibrar(8);
}

/* ---- Bloqueo con huella (solo en el APK) ---- */
let OCULTA_DESDE = 0;
const bloqueoOn = () => NATIVO && LS.get('fin_huella', false);
async function pedirHuella() {
  if (!bloqueoOn()) { $('lock').classList.add('hide'); return; }
  $('lock').classList.remove('hide'); fondoInerte(true);
  try {
    await window.Capacitor.nativePromise('NativeBiometric', 'verifyIdentity', { reason: 'Abrir Finanzas', title: 'Finanzas', subtitle: 'Usa tu huella para entrar', negativeButtonText: 'Cancelar', maxAttempts: 5 });
    $('lock').classList.add('hide'); fondoInerte(!!FORM); vibrar(12);
  } catch (e) { /* se queda bloqueada; el botón vuelve a pedirla */ }
}
async function alternarHuella() {
  if (LS.get('fin_huella', false)) { LS.set('fin_huella', false); pintarHoja(); return toast('Bloqueo con huella desactivado'); }
  let ok = false;
  try {
    const d = await window.Capacitor.nativePromise('NativeBiometric', 'isAvailable', {});
    if (!d || !d.isAvailable) return toast('Tu celular no tiene huella registrada');
    await window.Capacitor.nativePromise('NativeBiometric', 'verifyIdentity', { reason: 'Activar el bloqueo', title: 'Finanzas', subtitle: 'Confirma con tu huella', negativeButtonText: 'Cancelar', maxAttempts: 5 });
    ok = true;
  } catch (e) { toast('No se activó el bloqueo'); }
  if (ok) { LS.set('fin_huella', true); toast('Listo: Finanzas pedirá tu huella al abrir'); }
  pintarHoja();
}

/* ---- Modo discreto: tapa los montos para usar la app en público o enseñar la pantalla ---- */
function aplicarDiscreto() {
  const on = LS.get('fin_discreto', false), b = $('ojo');
  document.body.classList.toggle('discreto', on);
  if (b) { b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Mostrar montos' : 'Ocultar montos'); }
}
function alternarDiscreto() { LS.set('fin_discreto', !LS.get('fin_discreto', false)); aplicarDiscreto(); vibrar(8); toast(LS.get('fin_discreto', false) ? 'Montos ocultos' : 'Montos visibles'); }

/* ---- Respaldo: todo vive en tu hoja de Google; además puedes bajar un CSV o una copia completa ---- */
// Una celda que empieza con = + - @ se volvería fórmula al abrir el CSV en Excel o Sheets: se le antepone un apóstrofo
const celdaCSV = v => { let t = v == null ? '' : String(v); if (/^[=+\-@]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t; return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
function descargar(nombre, tipo, contenido) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo })), a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function exportarCSV() {
  const cols = ['fecha', 'tipo', 'monto', 'cuenta', 'aCuenta', 'categoria', 'persona', 'desc', 'meses'];
  const filas = DATA.movs.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map(m => cols.map(k => celdaCSV(m[k])).join(','));
  descargar('finanzas-movimientos-' + hoy() + '.csv', 'text/csv;charset=utf-8', '\ufeff' + ['Fecha,Tipo,Monto,Cuenta,A cuenta,Categoría,Persona,Descripción,Meses'].concat(filas).join('\n'));
  toast('Descargué ' + DATA.movs.length + ' movimientos');
}
function exportarRespaldo() {
  const copia = Object.assign({}, DATA, { exportado: new Date().toISOString(), app: VERSION_APP });
  descargar('finanzas-respaldo-' + hoy() + '.json', 'application/json', JSON.stringify(copia, null, 1));
  toast('Respaldo descargado');
}

/* ---- Ajustes ---- */
const APK_URL = 'https://github.com/MartinRTX/Finanzas/releases/tag/apk';
const TEMAS = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']];
function aplicarTema(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  const oscuro = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', oscuro ? '#0A0F0D' : '#F1F5F3'));
}
function elegirTema(t) { LS.set('fin_tema', t); aplicarTema(t); vibrar(8); pintarHoja(); }
function abrirAjustes() { if (!DATA) return; FORM = { vista: 'ajustes' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaAjustes() {
  const tema = LS.get('fin_tema', 'auto'), elegida = String(DATA.config['Cuenta para gastos'] || ''), oro = tarjetaOro(), av = avisosCfg();
  const valida = elegida && cuentasPara('Gasto').some(c => c.nombre === elegida);
  const sw = (on, fn, titulo, sub) => '<button class="switch" role="switch" aria-checked="' + !!on + '" ' + fn + '><span><b>' + titulo + '</b><br><span class="muted">' + sub + '</span></span><span class="knob" aria-hidden="true"></span></button>';
  let h = titulo('Ajustes');
  h += '<div class="fl">Tarjeta para gastos</div><div class="pick" role="group" aria-label="Tarjeta para gastos">' +
    '<button class="' + (!valida ? 'on' : '') + '" aria-pressed="' + !valida + '" ' + al('click', 'elegirCuentaGastos', '') + '>Automática' + (oro ? ' (' + esc(oro) + ')' : '') + '</button>' +
    cuentasPara('Gasto').map(c => '<button class="' + (esDeuda(c) ? 'debtacc' : '') + (valida && elegida === c.nombre ? ' on' : '') + '" aria-pressed="' + (valida && elegida === c.nombre) + '" ' + al('click', 'elegirCuentaGastos', c.nombre) + '>' + esc(c.nombre) + '</button>').join('') + '</div>' +
    '<p class="hint">Es la que aparece elegida cada vez que registras un gasto. Pagar con crédito y liquidar el total antes de la fecha límite te da hasta ~50 días de financiamiento sin intereses.</p>';
  h += htmlFunciones();
  h += '<div class="fl">Tema</div><div class="seg" role="group" aria-label="Tema">' + TEMAS.map(x => '<button class="' + (tema === x[0] ? 'on' : '') + '" aria-pressed="' + (tema === x[0]) + '" ' + al('click', 'elegirTema', x[0]) + '>' + x[1] + '</button>').join('') + '</div>';
  h += '<div class="fl">Notificaciones</div>';
  if (NATIVO) {
    h += sw(av.pagos, al('click', 'alternarAviso', 'pagos'), 'Pagos de tarjetas', '2 días antes y el día límite, con lo que tienes que pagar para no generar intereses. También te avisa cuando corta tu tarjeta para gastos.') +
      sw(av.diario, al('click', 'alternarAviso', 'diario'), '🌙 Recordatorio en la noche', 'Si ese día no registraste nada, te pregunta "¿Gastaste algo hoy?" y le contestas ahí mismo ("120 tacos") o tocas No gasté.') + htmlNotificaciones();
    h += '<div class="fl">Seguridad</div>' + sw(LS.get('fin_huella', false), al('click', 'alternarHuella'), 'Bloqueo con huella', 'Pide tu huella al abrir la app y al volver después de un minuto.');
    if (av.diario) h += '<div class="row between" style="margin-top:8px"><label for="fHora" class="muted">Hora del recordatorio</label><input id="fHora" type="time" class="inp" style="width:auto" value="' + esc(av.hora) + '" ' + al('change', 'cambiarHora') + '></div>';
  } else {
    h += '<div class="card flat"><div class="t1">App para Android</div><div class="muted" style="margin:4px 0 10px">Con la app instalada (APK) te llegan avisos de pago de tus tarjetas y el recordatorio diario, y vibra de verdad.</div>' +
      '<div class="actions"><a class="btn sm" href="' + APK_URL + '" target="_blank" rel="noopener">Descargar APK</a>' + (!DEMO ? '<button class="btn sm ghost" ' + al('click', 'copiarLinkApp') + '>Copiar link para la app</button>' : '') + '</div>' +
      '<p class="hint">Abre la app, pega el link en "URL de Apps Script" y listo: no tienes que escribir la clave.</p></div>';
  }
  h += '<div class="fl">Tus datos</div><div class="card flat"><div class="muted" style="margin-bottom:10px">Todo se guarda en tu hoja de Google; lo del celular es una copia para que funcione sin señal.</div><div class="actions">' +
    (BASE && BASE.url ? '<a class="btn sm" href="' + esc(BASE.url) + '" target="_blank" rel="noopener">Abrir mi hoja</a>' : '') +
    (!NATIVO ? '<button class="btn sm ghost" ' + al('click', 'exportarCSV') + '>Bajar CSV</button><button class="btn sm ghost" ' + al('click', 'exportarRespaldo') + '>Bajar respaldo</button>' : '') + '</div></div>';
  const ver = BASE && BASE.version ? BASE.version : 1;
  h += '<div class="fl">Conexión</div><div class="card flat"><div class="muted">' + (DEMO ? 'Estás en modo ejemplo: nada se guarda en tu hoja.' :
    'Conectada a ' + esc(BASE && BASE.hoja ? BASE.hoja : 'tu hoja de Google') + '. Última actualización: ' + haceCuanto(LS.get('fin_ultima', 0)) + '.') + '</div>' +
    (!DEMO ? '<div class="muted" style="margin-top:4px">App v' + VERSION_APP + (NATIVO ? ' (Android)' : '') + ' · Apps Script v' + ver + (ver < 4 ? ' <b class="red">(falta actualizar el código de Apps Script a la v4)</b>' : ' ✓') + '</div>' : '') +
    '<div class="actions"><button class="btn sm ghost" ' + al('click', 'abrirGuia') + '>Ver guía</button>' + (DEMO ? '<button class="btn sm" ' + al('click', 'salirDemo') + '>Salir del modo ejemplo</button>' : '<button class="btn sm ghost" ' + al('click', 'actualizar', true) + '>Actualizar ahora</button>') +
    '<button class="btn sm ghost" ' + al('click', 'cambiarConexion') + '>Cambiar conexión</button>' + (NATIVO && !DEMO ? '<button class="btn sm ghost" ' + al('click', 'copiarLinkApp') + '>Copiar link</button>' : '') + '</div></div>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button></div>';
  return h;
}
function elegirCuentaGastos(n) {
  encolar('guardarConfig', ['Cuenta para gastos', n], true);
  vibrar(8); pintarHoja();
  toast(n ? 'Tus gastos se registrarán con ' + n : 'Tarjeta para gastos automática' + (tarjetaOro() ? ': ' + tarjetaOro() : ''));
}
// Link con tu URL y tu clave: para configurar la app de Android sin escribir nada. No lo compartas.
function copiarLinkApp() {
  const link = location.origin + location.pathname + '?api=' + encodeURIComponent(API) + '&k=' + encodeURIComponent(KEY);
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Link copiado: pégalo en la app (lleva tu clave, no lo compartas)'),
    () => toast('No pude copiar el link'));
}

/* ---- Recordatorios (solo en el APK): pagos de tarjeta, corte de la tarjeta para gastos y registro diario ---- */
const avisosCfg = () => Object.assign({ pagos: true, diario: false, hora: '21:00' }, LS.get('fin_avisos', {}));
async function alternarAviso(k) {
  const cfg = avisosCfg();
  cfg[k] = !cfg[k];
  if (cfg[k]) {
    const p = await nativo('LocalNotifications', 'requestPermissions');
    if (!p || p.display !== 'granted') { cfg[k] = false; toast('Permite las notificaciones de Finanzas en los ajustes de Android'); }
  }
  LS.set('fin_avisos', cfg); vibrar(8); pintarHoja(); programarAvisos(); aplicarNotifNativas();
}
function horaAviso(v) { if (!/^\d{2}:\d{2}$/.test(v)) return; const cfg = avisosCfg(); cfg.hora = v; LS.set('fin_avisos', cfg); programarAvisos(); aplicarNotifNativas(); toast('Te recuerdo a las ' + v); }
let programando = false;
async function programarAvisos() {
  if (!NATIVO || !DATA || programando) return;
  programando = true;
  try {
    const pend = await nativo('LocalNotifications', 'getPending');
    const viejos = ((pend && pend.notifications) || []).map(n => ({ id: n.id }));
    if (viejos.length) await nativo('LocalNotifications', 'cancel', { notifications: viejos });
    const cfg = avisosCfg();
    if (!cfg.pagos && !cfg.diario) return;
    const perm = await nativo('LocalNotifications', 'checkPermissions');
    if (!perm || perm.display !== 'granted') return;
    await nativo('LocalNotifications', 'createChannel', { id: 'finanzas', name: 'Pagos y recordatorios', description: 'Fechas límite de tus tarjetas y recordatorio para registrar', importance: 4, visibility: 1, vibration: true });
    const ns = [], ahora = Date.now();
    const agenda = (id, fecha, hora, title, body) => { const d = new Date(fecha + 'T' + hora + ':00'); if (d.getTime() > ahora + 60000) ns.push({ id, title, body, channelId: 'finanzas', smallIcon: 'ic_notif', iconColor: '#0D7A5E', schedule: { at: d, allowWhileIdle: true } }); };
    if (cfg.pagos) {
      DATA.cuentas.filter(c => esDeuda(c) && c.diaPago && !c.archivada).forEach((c, i) => {
        const ps = pagoSinIntereses(c), deuda = -saldo(c);
        if (ps ? ps.falta <= 0.5 : deuda <= 0.5) return;
        const lim = ps ? ps.limite : proximaFecha(c.diaPago), cuanto = ps ? 'Paga ' + money(ps.falta) + ' para no generar intereses.' : 'Debes ' + money(deuda) + '.';
        agenda(1000 + i * 10, sumarDias(lim, -2), '10:00', c.nombre + ': pago en 2 días', 'Fecha límite: ' + fechaLarga(lim) + '. ' + cuanto);
        agenda(1001 + i * 10, lim, '09:00', c.nombre + ': hoy es tu fecha límite', cuanto);
      });
      const g = DATA.cuentas.find(c => c.nombre === cuentaGastos()), ci = g && esDeuda(g) && cicloTarjeta(g, hoy());
      if (ci) agenda(1900, ci.corte, '20:00', 'Hoy corta tu ' + g.nombre, 'Desde mañana tus compras se pagan hasta el ' + fechaCorta(cicloTarjeta(g, ci.mejor).pago) + ': el mejor momento para compras grandes.');
    }
    // El recordatorio de la noche lo pone el código nativo (deja contestar en la notificación): ver aplicarNotifNativas()
    if (ns.length) await nativo('LocalNotifications', 'schedule', { notifications: ns });
  } finally { programando = false; }
}

/* ---- Plan de deuda ---- */
function abrirPlan() { FORM = { vista: 'plan', abono: String(abonoMensual() || '') }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaPlan() {
  const abono = parseMonto(FORM.abono), plan = planDeuda(abono), p = patrimonio();
  let h = titulo('Plan para salir de deudas');
  h += '<div class="fl"><label for="fAbono">¿Cuánto puedes abonar al mes en total?</label></div><label class="amount"><span aria-hidden="true">$</span><input id="fAbono" inputmode="decimal" value="' + esc(FORM.abono) + '" ' + al('input', 'campoForm', 'abono') + ' ' + al('change', 'pintarHoja') + '></label>';
  h += '<p class="hint">Referencia: 2 quincenas de $7,500 menos tu presupuesto de ' + money(resumenMes(hoy().slice(0, 7)).presupuesto, true) + ' dejan unos ' + money(15000 - resumenMes(hoy().slice(0, 7)).presupuesto, true) + '.</p>';
  if (!plan.orden.length) return h + '<div class="note info">No tienes deudas con bancos. 🎉</div><div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button></div>';
  if (plan.meses) h += '<div class="card" style="margin-top:12px"><div class="muted">Terminas de pagar ' + money(p.deuda, true) + ' en</div><div class="amt">' + plan.meses + ' meses</div><div class="muted">Hacia ' + mesDentro(plan.meses) + (plan.interes ? ', con unos ' + money(plan.interes, true) + ' de intereses' : '') + '.</div></div>';
  else if (abono > 0) h += '<div class="note red">Con ' + money(abono, true) + ' al mes los intereses crecen más rápido de lo que pagas. Sube el abono.</div>';
  h += '<div class="fl">Orden de pago</div><div class="card" style="padding:4px 16px">' + plan.orden.map((d, i) =>
    '<div class="plan-row"><span class="n">' + (i + 1) + '</span><span><b>' + esc(d.c.nombre) + '</b><br><span class="muted">' + (d.c.tasa ? 'Tasa ' + (d.c.tasa * 100).toFixed(1) + '%' : 'Sin tasa capturada') + (d.fin ? ', liquidada hacia ' + mesDentro(d.fin) : '') + '</span></span><span class="num">' + money(-saldo(d.c)) + '</span></div>').join('') + '</div>';
  h += '<p class="hint">Todo lo que puedas abonar va a la #1; a las demás les pagas solo el mínimo hasta que la #1 quede en cero, y luego sigues con la #2. ' +
    (plan.sinTasa ? '<b>Faltan tasas:</b> sin ellas ordeno por saldo y el cálculo no incluye intereses. Captúralas en Cuentas → Editar (vienen en tu estado de cuenta como "tasa anual").' : 'Se ordena de mayor a menor tasa: así pagas menos intereses.') + '</p>';
  h += '<p class="hint">El cálculo no incluye compras nuevas a crédito. Si sigues usando las tarjetas, la fecha se aleja.</p>';
  h += '<div class="actbar"><button class="btn ghost" ' + al('click', 'cerrarHoja') + '>Cerrar</button><button class="btn" ' + al('click', 'guardarAbono') + '>Guardar abono</button></div>';
  return h;
}
function guardarAbono() { const v = parseMonto($('fAbono').value); if (v <= 0) return toast('Escribe cuánto puedes abonar'); encolar('guardarConfig', ['Abono mensual a deudas', v]); cerrarHoja(); toast('Abono mensual guardado'); }

// Arranca cuando ya cargaron todos los archivos (extras.js y rapido.js van después de este): si Inicio se pinta antes,
// le faltan funciones y la pantalla se queda en negro
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
