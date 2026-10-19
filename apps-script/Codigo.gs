/**
 * Finanzas v4 – API de la app (Apps Script pegado en la hoja "Mis finanzas 2026").
 *
 * Para actualizar:
 *  1. Extensiones > Apps Script. Borra todo y pega este archivo completo.
 *  2. En la línea de CLAVE pon tu clave de siempre (la misma que tiene la app). Guarda.
 *  3. Implementar > Gestionar implementaciones > ✏️ (editar) > Versión: Nueva versión > Implementar.
 *     Así la URL /exec sigue siendo la misma y la app no se tiene que volver a configurar.
 *
 * Este archivo vive en GitHub, que es público: ahí la clave NUNCA se escribe, solo en tu Apps Script.
 *
 * Pestañas que usa: Registro, Cuentas, Categorías, Personas, Fijos, Config y Metas.
 * Lo nuevo de la v4 se agrega solo la primera vez que abres la app:
 *  - Registro, columna L "Meses" (compras a meses sin intereses).
 *  - Cuentas, columnas M "Límite de crédito" y N "Pago domiciliado desde".
 *  - Pestaña "Metas" (metas de ahorro).
 */

const CLAVE = 'PON_AQUI_TU_CLAVE';

const H = { registro: 'Registro', cuentas: 'Cuentas', categorias: 'Categorías', personas: 'Personas', fijos: 'Fijos', config: 'Config', metas: 'Metas' };
const TIPOS_CUENTA = ['Débito', 'Ahorro', 'Efectivo', 'Crédito', 'Préstamo'];
const TIPOS_PERSONA = ['Presté', 'Me pagaron', 'Me prestaron', 'Le pagué'];
const TIPOS_MOV = ['Gasto', 'Ingreso', 'Traspaso', 'Reembolso', 'Ajuste'].concat(TIPOS_PERSONA);
// Registro: ID | Fecha | Tipo | Monto | Cuenta | A cuenta | Categoría | Descripción | Registrado | Persona | Fijo | Meses
const NCOL = 12;
// Cuentas: Cuenta | Tipo | Saldo al corte | Fecha de corte | Día de corte | Día de pago | Entradas | Salidas | Ajustes | Saldo actual | Tasa anual | Archivada | Límite de crédito | Pago domiciliado desde
const NCOL_CUENTAS = 14;
// Metas: ID | Meta | Objetivo | Fecha meta | Apartado | Ícono | Estado | Creada
const NCOL_METAS = 8;

/* ===================== Entrada ===================== */
function doGet(e) {
  return responder(() => {
    // Por GET solo se contesta "ping": los datos se piden por POST para que la clave nunca viaje en la URL (las URL quedan en registros).
    revisarClave(e.parameter.k);
    const accion = e.parameter.action || 'ping';
    if (accion === 'ping') return 'ok';
    throw new Error('Acción desconocida: ' + accion);
  });
}

function doPost(e) {
  return responder(() => {
    const cuerpo = JSON.parse(e.postData.contents);
    revisarClave(cuerpo.k);
    if (cuerpo.action === 'data') return leerTodo();      // la app pide los datos por POST para no poner la clave en la URL
    if (cuerpo.action !== 'batch') return ejecutar(cuerpo.action, cuerpo.args || []);
    const ops = (cuerpo.args && cuerpo.args[0]) || [];
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return ops.map(op => {
        try { ejecutar(op.action, op.args || []); return { id: op.id, ok: true }; }
        catch (err) { return { id: op.id, ok: false, error: String(err.message || err) }; }
      });
    } finally { lock.releaseLock(); }
  });
}

function responder(fn) {
  let salida;
  try { salida = { ok: true, result: fn() }; }
  catch (err) { salida = { ok: false, error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

function revisarClave(k) {
  if (CLAVE === 'PON_AQUI_TU_CLAVE') throw new Error('Clave: falta poner tu clave en el código de Apps Script');
  if (!k || String(k) !== CLAVE) throw new Error('Clave incorrecta');
}

function ejecutar(accion, args) {
  switch (accion) {
    case 'guardarMov': return guardarMov(args[0]);
    case 'borrarMov': return borrarMov(args[0]);
    case 'guardarPresupuesto': return guardarPresupuesto(args[0], args[1]);
    case 'guardarCuenta': return guardarCuenta(args[0]);
    case 'guardarPersona': return guardarPersona(args[0]);
    case 'guardarFijo': return guardarFijo(args[0]);
    case 'borrarFijo': return borrarFijo(args[0]);
    case 'guardarConfig': return guardarConfig(args[0], args[1]);
    case 'guardarMeta': return guardarMeta(args[0]);
    case 'borrarMeta': return borrarMeta(args[0]);
    default: throw new Error('Acción desconocida: ' + accion);
  }
}

/* ===================== Utilidades ===================== */
function libro() { return SpreadsheetApp.getActiveSpreadsheet(); }
function hoja(nombre) {
  const h = libro().getSheetByName(nombre);
  if (!h) throw new Error('No existe la pestaña "' + nombre + '"');
  return h;
}
function zona() { return libro().getSpreadsheetTimeZone(); }
function aTexto(f) { return f instanceof Date ? Utilities.formatDate(f, zona(), 'yyyy-MM-dd') : (f ? String(f) : ''); }
function aFecha(t) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t))) throw new Error('Fecha inválida: ' + t);
  return Utilities.parseDate(t, zona(), 'yyyy-MM-dd');
}
function numero(v) { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s%]/g, '')); return isFinite(n) ? n : 0; }
function vacio(v) { return v === '' || v === null || v === undefined; }
function filas(h, ncol) { const n = h.getLastRow() - 1; return n > 0 ? h.getRange(2, 1, n, ncol).getValues() : []; }
function filaDe(h, col, valor) {
  const n = h.getLastRow() - 1;
  if (n <= 0) return 0;
  const vals = h.getRange(2, col, n, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(valor)) return i + 2;
  return 0;
}
function siguienteFila(h) {
  // Primera fila vacía en la columna A (las fórmulas de otras columnas no cuentan)
  const n = h.getLastRow();
  if (n < 2) return 2;
  const vals = h.getRange(2, 1, n - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i][0] !== '') return i + 3;
  return 2;
}
// Texto que escribes en la app: si empieza con = + @ Sheets lo trataría como fórmula (por ejemplo =IMPORTXML(...) podría sacar datos).
// El apóstrofo inicial lo deja como texto y no se ve en la celda.
function texto(v, max) { let t = String(v == null ? '' : v).trim().slice(0, max || 200); return /^[=+@]/.test(t) ? "'" + t : t; }
function dia(v) { return vacio(v) ? '' : Math.min(31, Math.max(1, Math.round(numero(v)))); }
function sumifs(col, fila, tipo, fechaCelda) {
  const R = 'Registro!';
  return 'SUMIFS(' + R + '$D:$D,' + R + col + ':' + col + ',$A' + fila + ',' + R + '$C:$C,"' + tipo + '",' + R + '$B:$B,">="&' + fechaCelda + ')';
}

// Columnas y pestañas nuevas de la v4: se crean solas si no existen
function asegurarEstructura() {
  const enc = (nombre, col, texto) => { const h = hoja(nombre), c = h.getRange(1, col); if (c.getValue() === '') c.setValue(texto).setFontWeight('bold'); };
  enc(H.registro, 12, 'Meses');
  enc(H.cuentas, 13, 'Límite de crédito');
  enc(H.cuentas, 14, 'Pago domiciliado desde');
  hojaMetas();
}
function hojaMetas() {
  let h = libro().getSheetByName(H.metas);
  if (!h) {
    h = libro().insertSheet(H.metas);
    h.getRange(1, 1, 1, NCOL_METAS).setValues([['ID', 'Meta', 'Objetivo', 'Fecha meta', 'Apartado', 'Ícono', 'Estado', 'Creada']]).setFontWeight('bold');
    h.getRange('C:C').setNumberFormat('$#,##0.00');
    h.getRange('E:E').setNumberFormat('$#,##0.00');
    h.getRange('D:D').setNumberFormat('dd/mm/yyyy');
    h.setFrozenRows(1);
  }
  return h;
}

/* ===================== Lectura ===================== */
function leerTodo() {
  asegurarEstructura();
  const cuentas = filas(hoja(H.cuentas), NCOL_CUENTAS).filter(r => r[0] !== '').map(r => ({
    nombre: String(r[0]), tipo: String(r[1]), saldoCorte: numero(r[2]), fechaCorte: aTexto(r[3]),
    diaCorte: vacio(r[4]) ? null : numero(r[4]), diaPago: vacio(r[5]) ? null : numero(r[5]),
    tasa: vacio(r[10]) ? null : numero(r[10]), archivada: String(r[11]) === 'Sí',
    limite: vacio(r[12]) ? null : numero(r[12]), domiciliado: String(r[13] || '') }));
  const categorias = filas(hoja(H.categorias), 4).filter(r => r[0] !== '').map(r => ({
    nombre: String(r[0]), tipo: String(r[1]), presupuesto: vacio(r[2]) ? null : numero(r[2]), nota: String(r[3] || '') }));
  const personas = filas(hoja(H.personas), 8).filter(r => r[0] !== '').map(r => ({
    nombre: String(r[0]), saldoCorte: numero(r[1]), fechaCorte: aTexto(r[2]), nota: String(r[3] || ''), archivada: String(r[7]) === 'Sí' }));
  const fijos = filas(hoja(H.fijos), 9).filter(r => r[0] !== '').map(r => ({
    id: String(r[0]), nombre: String(r[1]), tipo: String(r[2]), monto: numero(r[3]), categoria: String(r[4] || ''),
    cuenta: String(r[5] || ''), dia: vacio(r[6]) ? null : numero(r[6]), activo: String(r[7]) !== 'No', aCuenta: String(r[8] || '') }));
  const metas = filas(hojaMetas(), NCOL_METAS).filter(r => r[0] !== '').map(r => ({
    id: String(r[0]), nombre: String(r[1]), objetivo: numero(r[2]), fecha: aTexto(r[3]), apartado: numero(r[4]),
    icono: String(r[5] || ''), cumplida: String(r[6]) === 'Cumplida', creada: aTexto(r[7]) }));
  const config = {};
  filas(hoja(H.config), 2).forEach(r => { if (r[0] !== '') config[String(r[0])] = r[1]; });
  const movs = filas(hoja(H.registro), NCOL).filter(r => r[0] !== '' && r[1] !== '').map(r => ({
    id: String(r[0]), fecha: aTexto(r[1]), tipo: String(r[2]), monto: numero(r[3]), cuenta: String(r[4]),
    aCuenta: String(r[5] || ''), categoria: String(r[6] || ''), desc: String(r[7] || ''),
    registrado: r[8] instanceof Date ? r[8].getTime() : null, persona: String(r[9] || ''), fijo: String(r[10] || ''),
    meses: vacio(r[11]) ? null : numero(r[11]) }));
  return { cuentas, categorias, personas, fijos, metas, config, movs, historial: leerHistorial(), hoja: libro().getName(), url: libro().getUrl(), zona: zona(), version: 4 };
}

/* ===================== Historial (jul 2025 – may 2026) =====================
 * Copia limpia de "Respuestas de formulario 2" con las categorías nuevas, solo para las gráficas.
 * La primera vez se genera sola en la pestaña "Historial". Si una categoría no te cuadra, corrígela ahí.
 * No incluye: pagos de tarjeta, inversiones, préstamos a otros ni saldos iniciales.
 */
function leerHistorial() {
  let h = libro().getSheetByName('Historial');
  if (!h) h = libro().insertSheet('Historial');
  if (h.getLastRow() < 2) generarHistorial(h);
  return filas(h, 5).filter(r => r[0] !== '').map(r => ({ fecha: aTexto(r[0]), tipo: String(r[1]), monto: numero(r[2]), categoria: String(r[3]), desc: String(r[4] || '') }));
}
function generarHistorial(h) {
  const f = libro().getSheetByName('Respuestas de formulario 2');
  if (!f) return;
  const n = f.getLastRow() - 1;
  if (n <= 0) return;
  const datos = f.getRange(2, 1, n, 8).getValues();
  // Fechas con año equivocado en el formulario (fila de la hoja -> fecha correcta)
  const FECHAS = { 249: '2025-08-22', 486: '2026-01-13', 487: '2026-01-13', 488: '2026-01-13', 528: '2026-01-31', 540: '2026-02-13' };
  const FUERA = { 142: 1, 143: 1, 148: 1, 269: 1 };   // saldos iniciales y un gasto cancelado
  const emi = /\bemi(lia)?\b/i, salida = [['Fecha', 'Tipo', 'Monto', 'Categoría', 'Descripción']];
  datos.forEach((r, i) => {
    const fila = i + 2;
    if (!(r[1] instanceof Date) || vacio(r[3]) || FUERA[fila]) return;
    const fecha = FECHAS[fila] ? aFecha(FECHAS[fila]) : r[1];
    let desc = String(r[2] || '').trim(), monto = Math.round(numero(r[3]) * 100) / 100;
    const tipo = String(r[4]), fIng = String(r[5] || ''), fGas = String(r[6] || '');
    if (tipo === 'Gastos') {
      if (['Pago Tarjeta de Credito', 'Inversion', 'N', 'Cosas que me deben', 'Prestamo'].indexOf(fGas) >= 0) return;
      if (fGas === 'Emilia' || emi.test(desc)) desc = '';
      salida.push([fecha, 'Gasto', monto, categoriaNueva(fGas, desc), desc]);
    } else if (tipo === 'Ingresos') {
      if (fIng === 'Dinero de eurotrip') salida.push([fecha, 'Reembolso', monto, 'Viajes', emi.test(desc) ? '' : desc]);
      else if (fIng === 'Sueldo') salida.push([fecha, 'Ingreso', monto, /apoyo|aguinaldo|despensa|vales|finiquito|bono/i.test(desc) ? 'Bonos y apoyos' : 'Sueldo', desc]);
    }
  });
  h.getRange(1, 1, salida.length, 5).setValues(salida);
  h.getRange(2, 1, salida.length - 1, 1).setNumberFormat('dd/mm/yyyy');
  h.getRange(2, 3, salida.length - 1, 1).setNumberFormat('$#,##0.00');
  h.setFrozenRows(1);
}
function categoriaNueva(fGas, desc) {
  const d = desc.toLowerCase();
  if (fGas === 'Antojo/Comida' || fGas === 'Restaurante') return 'Comida y antojos';
  if (fGas === 'Salidas' || fGas === 'Emilia') return 'Salidas';
  if (fGas === 'Gas') return 'Gasolina';
  if (fGas === 'Eurotrip') return 'Viajes';
  if (/inter[eé]s/.test(d)) return 'Intereses y comisiones';
  if (/carro|llanta|pick ?up|placas|ford|anticongelante|mantenimiento|lavada|desponche|fltro|filtro|autozone|pivote/.test(d)) return 'Carro';
  if (/psic|pepto|lentes|corte|desodorante|perfume|protector|ar[aá]ndano|barba/.test(d)) return 'Salud y cuidado personal';
  if (/spotify|google|inbursa|seguro|fortnite|bumble|tinder|pure|revolut premium|telcel paquete/.test(d)) return 'Suscripciones y seguros';
  if (/tata|nana|casa|luz|agua|garraf|recarga|dish|telmex|telcel/.test(d)) return 'Familia y casa';
  if (/vuelo|renta de cdmx|didi|uber|metro|bus|tufesa|i-94|pasaporte|acta|aeropuerto|viaje/.test(d)) return 'Viajes';
  if (fGas === 'Gusto/Material') return 'Gustos y compras';
  if (fGas === 'Cuotas Fijas') return /hamilton|light/.test(d) ? 'Salidas' : 'Suscripciones y seguros';
  return 'Otros';
}

/* ===================== Movimientos ===================== */
function guardarMov(m) {
  if (!m || !m.id) throw new Error('Movimiento sin ID');
  if (TIPOS_MOV.indexOf(m.tipo) < 0) throw new Error('Tipo inválido: ' + m.tipo);
  const cuentas = filas(hoja(H.cuentas), 2).map(r => ({ n: String(r[0]), t: String(r[1]) }));
  const nombres = cuentas.map(c => c.n);
  const cats = filas(hoja(H.categorias), 2).map(r => ({ n: String(r[0]), t: String(r[1]) }));
  const personas = filas(hoja(H.personas), 1).map(r => String(r[0]));
  const monto = Math.round(numero(m.monto) * 100) / 100;
  if (m.tipo === 'Ajuste' ? monto === 0 : monto <= 0) throw new Error('Monto inválido');
  if (nombres.indexOf(m.cuenta) < 0) throw new Error('Cuenta desconocida: ' + m.cuenta);
  const esPersona = TIPOS_PERSONA.indexOf(m.tipo) >= 0;
  if (m.tipo === 'Traspaso') {
    if (nombres.indexOf(m.aCuenta) < 0) throw new Error('Cuenta destino desconocida: ' + m.aCuenta);
    if (m.aCuenta === m.cuenta) throw new Error('El traspaso necesita dos cuentas distintas');
  } else if (esPersona) {
    if (personas.indexOf(m.persona) < 0) throw new Error('Persona desconocida: ' + m.persona);
  } else if (m.tipo !== 'Ajuste') {
    const tipoCat = m.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto';
    if (!cats.some(c => c.n === m.categoria && c.t === tipoCat)) throw new Error('Categoría inválida: ' + m.categoria);
  }
  // Meses sin intereses: solo gastos con tarjeta de crédito, de 2 a 48 meses
  let meses = '';
  if (!vacio(m.meses) && numero(m.meses) > 1) {
    const c = cuentas.find(x => x.n === m.cuenta);
    if (m.tipo !== 'Gasto' || !c || c.t !== 'Crédito') throw new Error('Los meses sin intereses son solo para gastos con tarjeta de crédito');
    meses = Math.min(48, Math.round(numero(m.meses)));
  }
  const fila = [m.id, aFecha(m.fecha), m.tipo, monto, m.cuenta,
    m.tipo === 'Traspaso' ? m.aCuenta : '',
    m.tipo === 'Ajuste' ? 'Sin registrar' : (m.tipo === 'Traspaso' || esPersona ? '' : m.categoria),
    texto(m.desc, 200), m.registrado ? new Date(m.registrado) : new Date(),
    esPersona ? m.persona : '', String(m.fijo || ''), meses];
  const h = hoja(H.registro), r = filaDe(h, 1, m.id);
  // Si ya existe (reintento o edición) se sobrescribe; así nunca se duplica.
  h.getRange(r || siguienteFila(h), 1, 1, NCOL).setValues([fila]);
  return true;
}

function borrarMov(id) {
  const h = hoja(H.registro), r = filaDe(h, 1, id);
  if (r) h.deleteRow(r);
  return true;
}

function guardarPresupuesto(categoria, monto) {
  const h = hoja(H.categorias), fs = filas(h, 2);
  for (let i = 0; i < fs.length; i++) {
    if (String(fs[i][0]) === categoria && String(fs[i][1]) === 'Gasto') { h.getRange(i + 2, 3).setValue(Math.max(0, Math.round(numero(monto)))); return true; }
  }
  throw new Error('Categoría no encontrada: ' + categoria);
}

/* ===================== Cuentas ===================== */
function guardarCuenta(c) {
  const h = hoja(H.cuentas), r = filaDe(h, 1, c.nombre);
  if (r) {
    if ('diaCorte' in c || 'diaPago' in c) h.getRange(r, 5, 1, 2).setValues([[dia(c.diaCorte), dia(c.diaPago)]]);
    if ('tasa' in c) h.getRange(r, 11).setValue(vacio(c.tasa) ? '' : numero(c.tasa));
    if ('archivada' in c) h.getRange(r, 12).setValue(c.archivada ? 'Sí' : '');
    if ('limite' in c) h.getRange(r, 13).setValue(vacio(c.limite) || numero(c.limite) <= 0 ? '' : Math.round(numero(c.limite)));
    if ('domiciliado' in c) {
      if (c.domiciliado && !filaDe(h, 1, c.domiciliado)) throw new Error('Cuenta desconocida: ' + c.domiciliado);
      h.getRange(r, 14).setValue(c.domiciliado || '');
    }
    if (c.nuevoNombre && c.nuevoNombre !== c.nombre) renombrar(c.nombre, texto(c.nuevoNombre, 40), H.cuentas, [[H.registro, 5], [H.registro, 6], [H.fijos, 6], [H.fijos, 9], [H.cuentas, 14]]);
    return true;
  }
  if (TIPOS_CUENTA.indexOf(c.tipo) < 0) throw new Error('Tipo de cuenta inválido: ' + c.tipo);
  if (!texto(c.nombre, 40)) throw new Error('La cuenta necesita nombre');
  const n = siguienteFila(h), d = '$D' + n;
  h.getRange(n, 1, 1, 13).setValues([[
    texto(c.nombre, 40), c.tipo, numero(c.saldoCorte), aFecha(c.fechaCorte), dia(c.diaCorte), dia(c.diaPago),
    '=' + ['Ingreso', 'Reembolso', 'Me pagaron', 'Me prestaron'].map(t => sumifs('$E', n, t, d)).join('+') + '+' + sumifs('$F', n, 'Traspaso', d),
    '=' + ['Gasto', 'Traspaso', 'Presté', 'Le pagué'].map(t => sumifs('$E', n, t, d)).join('+'),
    '=' + sumifs('$E', n, 'Ajuste', d),
    '=C' + n + '+G' + n + '-H' + n + '+I' + n,
    vacio(c.tasa) ? '' : numero(c.tasa), '', vacio(c.limite) ? '' : Math.round(numero(c.limite)) ]]);
  return true;
}

/* ===================== Personas (me deben / yo debo) ===================== */
// Personas: Persona | Saldo al corte (+ te debe, − le debes) | Fecha de corte | Nota | Le prestaste o le pagaste | Te pagó o te prestó | Saldo actual | Archivada
function guardarPersona(p) {
  const h = hoja(H.personas), r = filaDe(h, 1, p.nombre);
  if (r) {
    if ('nota' in p) h.getRange(r, 4).setValue(texto(p.nota, 200));
    if ('archivada' in p) h.getRange(r, 8).setValue(p.archivada ? 'Sí' : '');
    if (p.nuevoNombre && p.nuevoNombre !== p.nombre) renombrar(p.nombre, texto(p.nuevoNombre, 40), H.personas, [[H.registro, 10]]);
    return true;
  }
  if (!String(p.nombre || '').trim()) throw new Error('La persona necesita nombre');
  const n = siguienteFila(h), d = '$C' + n;
  h.getRange(n, 1, 1, 8).setValues([[
    texto(p.nombre, 40), numero(p.saldoCorte), aFecha(p.fechaCorte), texto(p.nota, 200),
    '=' + sumifs('$J', n, 'Presté', d) + '+' + sumifs('$J', n, 'Le pagué', d),
    '=' + sumifs('$J', n, 'Me pagaron', d) + '+' + sumifs('$J', n, 'Me prestaron', d),
    '=B' + n + '+E' + n + '-F' + n, '' ]]);
  return true;
}

// Cambia un nombre en su pestaña y en todas las columnas que lo usan.
function renombrar(viejo, nuevo, hojaPrincipal, referencias) {
  const hp = hoja(hojaPrincipal);
  if (filaDe(hp, 1, nuevo)) throw new Error('Ya existe "' + nuevo + '"');
  hp.getRange(filaDe(hp, 1, viejo), 1).setValue(nuevo);
  referencias.forEach(([nom, col]) => {
    const h = hoja(nom), n = h.getLastRow() - 1;
    if (n <= 0) return;
    const rg = h.getRange(2, col, n, 1), vals = rg.getValues();
    let cambio = false;
    vals.forEach(v => { if (String(v[0]) === viejo) { v[0] = nuevo; cambio = true; } });
    if (cambio) rg.setValues(vals);
  });
}

/* ===================== Pagos fijos ===================== */
// Fijos: ID | Nombre | Tipo | Monto | Categoría | Cuenta | Día del mes | Activo | A cuenta (solo pagos a deudas)
function guardarFijo(f) {
  if (!f || !f.id || !String(f.nombre || '').trim()) throw new Error('Pago fijo incompleto');
  if (['Gasto', 'Ingreso', 'Traspaso'].indexOf(f.tipo) < 0) throw new Error('Tipo de pago fijo inválido');
  if (f.tipo === 'Traspaso' && !filaDe(hoja(H.cuentas), 1, f.aCuenta)) throw new Error('Elige a qué deuda va el pago');
  const h = hoja(H.fijos), r = filaDe(h, 1, f.id);
  const fila = [f.id, texto(f.nombre, 60), f.tipo, Math.round(numero(f.monto) * 100) / 100, f.tipo === 'Traspaso' ? '' : (f.categoria || ''),
                f.cuenta || '', dia(f.dia), f.activo === false ? 'No' : 'Sí', f.tipo === 'Traspaso' ? f.aCuenta : ''];
  h.getRange(r || siguienteFila(h), 1, 1, 9).setValues([fila]);
  return true;
}
function borrarFijo(id) { const h = hoja(H.fijos), r = filaDe(h, 1, id); if (r) h.deleteRow(r); return true; }

/* ===================== Metas de ahorro ===================== */
// El "apartado" es dinero que separas en tu cabeza (o en tu cuenta de ahorro) para esa meta; no mueve saldos.
function guardarMeta(m) {
  if (!m || !m.id || !String(m.nombre || '').trim()) throw new Error('La meta necesita nombre');
  if (numero(m.objetivo) <= 0) throw new Error('La meta necesita un monto');
  const h = hojaMetas(), r = filaDe(h, 1, m.id);
  const creada = r ? h.getRange(r, 8).getValue() : new Date();
  h.getRange(r || siguienteFila(h), 1, 1, NCOL_METAS).setValues([[
    m.id, texto(m.nombre, 60), Math.round(numero(m.objetivo) * 100) / 100, m.fecha ? aFecha(m.fecha) : '',
    Math.max(0, Math.round(numero(m.apartado) * 100) / 100), String(m.icono || '').slice(0, 8), m.cumplida ? 'Cumplida' : 'Activa', creada ]]);
  return true;
}
function borrarMeta(id) { const h = hojaMetas(), r = filaDe(h, 1, id); if (r) h.deleteRow(r); return true; }

function guardarConfig(clave, valor) {
  const h = hoja(H.config), r = filaDe(h, 1, clave);
  if (r) h.getRange(r, 2).setValue(valor); else h.getRange(siguienteFila(h), 1, 1, 2).setValues([[clave, valor]]);
  return true;
}

/* Para probar desde el editor: Ejecutar > probar. Revisa el registro de ejecución. */
function probar() {
  const d = leerTodo();
  Logger.log(d.cuentas.length + ' cuentas, ' + d.personas.length + ' personas, ' + d.fijos.length + ' fijos, ' + d.metas.length + ' metas, ' + d.movs.length + ' movimientos');
}
