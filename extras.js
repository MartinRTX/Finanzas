/* Finanzas v6 – módulos extra: funciones activables, foto del ticket, importar estados de cuenta, patrimonio,
 * resumen mensual, próximos pagos, gastos hormiga, ¿me alcanza?, widget y gastos detectados en notificaciones.
 * Se carga después de app.js y usa sus utilidades (DATA, money, esc, abrirHoja…).
 */

/* ===================== Funciones que tú prendes o apagas (Ajustes → Funciones) ===================== */
const FUNCIONES = [
  ['ticket', '📷', 'Foto del ticket', 'Le tomas foto al ticket y la app llena monto, fecha y comercio; tú lo corriges antes de guardar.'],
  ['importar', '📄', 'Importar estado de cuenta', 'Subes el PDF o CSV de BBVA o Revolut, revisas y agregas lo que te faltó registrar.'],
  ['patrimonio', '📈', 'Evolución del patrimonio', 'Gráfica de tu patrimonio neto y tu deuda a lo largo del tiempo.'],
  ['resumen', '🗓️', 'Resumen mensual', 'Tu mes en una pantalla y, si quieres, por correo el día 1.'],
  ['proximos', '⏰', 'Próximos pagos', 'Tarjetas, cortes, fijos y quincenas de los próximos 30 días.'],
  ['hormiga', '🐜', 'Gastos hormiga', 'Cuánto se te va en gastos chiquitos que se repiten.'],
  ['alcanza', '🤔', '¿Me alcanza?', 'Antes de una compra grande: cómo queda tu presupuesto, tu tarjeta y tus metas.'],
  ['widget', '🧩', 'Widget de inicio', 'Lo que te queda de la quincena en tu pantalla de inicio, con botones + y Ticket.', 'apk'],
  ['lector', '🔔', 'Gastos de tus notificaciones', 'Detecta tus compras en las notificaciones de BBVA, Revolut, Mercado Pago y Nu para registrarlas con un toque.', 'apk'],
];
const fx = k => LS.get('fin_fx', {})[k] !== false;      // todo viene prendido; tú apagas lo que no quieras
function alternarFuncion(k) {
  const f = LS.get('fin_fx', {}); f[k] = !fx(k); LS.set('fin_fx', f);
  vibrar(8); pintar();
  if (k === 'lector' && fx('lector') && NATIVO) revisarLector();
  if (k === 'widget') programarWidget();
}
function htmlFunciones() {
  return '<div class="fl">Funciones</div><p class="hint" style="margin-top:-2px">Apaga lo que no uses y desaparece de la app.</p>' + FUNCIONES.map(([k, ic, t, d, apk]) =>
    '<button class="switch" role="switch" aria-checked="' + fx(k) + '" onclick="alternarFuncion(\'' + k + '\')"><span><b>' + ic + ' ' + t + '</b><br><span class="muted">' + d +
    (apk && !NATIVO ? ' Solo en la app de Android.' : '') + '</span></span><span class="knob" aria-hidden="true"></span></button>').join('') +
    (NATIVO && fx('widget') ? '<div class="card flat" style="margin-top:10px"><div class="t1">🧩 Agregar los widgets</div><div class="muted" style="margin:4px 0 8px">Mantén presionada tu pantalla de inicio → Widgets → Finanzas. Hay dos: <b>Finanzas</b> (lo que te queda, con + y Ticket) y <b>Finanzas: atajos</b> (tus gastos frecuentes: un toque y quedan anotados, sin abrir la app).</div>' +
      '<button class="switch" role="switch" aria-checked="' + LS.get('fin_widget_discreto', false) + '" onclick="LS.set(\'fin_widget_discreto\',!LS.get(\'fin_widget_discreto\',false));enviarWidget();pintarHoja()" style="margin-top:0"><span><b>Ocultar montos en el widget</b><br><span class="muted">Para que nadie vea tus números en tu pantalla.</span></span><span class="knob" aria-hidden="true"></span></button></div>' : '') +
    (NATIVO && fx('lector') ? '<div class="card flat" style="margin-top:10px" id="lectorEstado"><div class="t1">🔔 Permiso para leer notificaciones</div><div class="muted" style="margin:4px 0 8px">' +
      (LECTOR_ACTIVO ? '✓ Activo. Solo lee notificaciones de tus bancos; nada sale de tu celular.' : 'Android pide que lo actives a mano: Acceso a notificaciones → Finanzas → Permitir.') + '</div>' +
      (LECTOR_ACTIVO ? '' : '<button class="btn sm" onclick="nativo(\'Finanzas\',\'abrirPermisoLector\')">Dar permiso</button>') + '</div>' : '');
}

/* ===================== Acciones rápidas de Inicio ===================== */
function accionesRapidas() {
  const a = [];
  if (fx('ticket')) a.push(['📷', 'Ticket', 'abrirHojaTicket()']);
  if (fx('alcanza')) a.push(['🤔', '¿Me alcanza?', 'abrirAlcanza()']);
  if (fx('importar')) a.push(['📄', 'Importar', 'abrirImportar()']);
  if (fx('resumen')) a.push(['🗓️', 'Resumen', 'SUB_ANALISIS=\'Resumen\';irA(\'Análisis\')']);
  if (fx('patrimonio')) a.push(['📈', 'Patrimonio', 'SUB_ANALISIS=\'Patrimonio\';irA(\'Análisis\')']);
  return a.length ? '<div class="rapidas" role="group" aria-label="Acciones rápidas">' + a.map(x => '<button onclick="' + x[2] + '"><span aria-hidden="true">' + x[0] + '</span>' + x[1] + '</button>').join('') + '</div>' : '';
}

/* ===================== Reglas para adivinar la categoría ===================== */
const REGLAS_CAT = [
  [/pemex|gasolin|gas station|shell|\bbp\b|g500|mobil|oxxo gas|arco|hidrosina|petro/i, 'Gasolina'],
  [/farmac|benavides|similares|del ahorro|guadalajara|san pablo|doctor|hospital|laborator|dentist|optica|psic/i, 'Salud y cuidado personal'],
  [/netflix|spotify|disney|hbo|max\b|prime video|apple\.com|icloud|google|youtube|seguro|inbursa|gnp|axa|telcel|at&t|izzi|totalplay|megacable|gym|smart ?fit/i, 'Suscripciones y seguros'],
  [/uber|didi|cabify|vuelo|aeromexico|volaris|viva ?aerobus|hotel|airbnb|booking|expedia|tufesa|ado\b|caseta|peaje/i, 'Viajes'],
  [/autozone|llanta|taller|refaccion|verificaci|lavado|estacionam|parking|tenencia|placas/i, 'Carro'],
  [/cine|cinepolis|cinemex|bar\b|antro|cerveza|boliche|concierto|ticketmaster|eticket|boletos/i, 'Salidas'],
  [/liverpool|palacio|amazon|mercado ?libre|zara|h&m|nike|adidas|shein|sears|coppel|best buy|apple store|sanborns|walmart\.com/i, 'Gustos y compras'],
  [/walmart|soriana|chedraui|heb\b|h-e-b|costco|sam'?s|bodega|la comer|superama|city market|mercado|carnicer|tortiller|recarga|cfe|agua|predial/i, 'Familia y casa'],
  [/oxxo|7-?eleven|seven|starbucks|cafe|café|restaurant|taco|pizza|burger|mcdonald|kfc|subway|domino|little caesars|carls|wings|sushi|rappi|uber ?eats|didi ?food|panader|tienda/i, 'Comida y antojos'],
  [/inter[eé]s|comisi[oó]n|anualidad|iva comis/i, 'Intereses y comisiones'],
];
function adivinarCategoria(desc, tipo) {
  const d = sinAcentos(desc || '');
  if (!d) return null;
  const cats = (tipo === 'Ingreso' ? catsIngreso() : catsGasto()).map(c => c.nombre);
  // Primero lo que tú ya usaste para algo parecido
  const clave = normalizarDesc(desc);
  const prev = clave && DATA.movs.slice().sort(ordenMov).find(m => m.tipo === (tipo || 'Gasto') && m.categoria && normalizarDesc(m.desc) === clave);
  if (prev && cats.indexOf(prev.categoria) >= 0) return prev.categoria;
  if (tipo === 'Ingreso') return /nomina|sueldo|salario|quincena/.test(d) && cats.indexOf('Sueldo') >= 0 ? 'Sueldo' : (cats.indexOf('Otro ingreso') >= 0 ? 'Otro ingreso' : cats[0]);
  const r = REGLAS_CAT.find(x => x[0].test(d));
  return r && cats.indexOf(r[1]) >= 0 ? r[1] : (cats.indexOf('Otros') >= 0 ? 'Otros' : null);
}
const titular = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, x => x.toUpperCase());
// "1,234.50", "1.234,50", "$ 230" → número
function numeroFlexible(t) {
  let s = String(t).replace(/[^\d.,-]/g, '');
  if (/^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s) || /^-?\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
const MES_TXT = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
// Fechas como 2026-10-18, 18/10/2026, 18/10/26, 18-oct-2026, 18 oct 2026, Oct 18, 2026 o 18/OCT (sin año)
function fechaFlexible(t, anioDefault) {
  const s = sinAcentos(String(t || '')).trim();
  let m, d, mo, y;
  if ((m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = s.match(/(\d{1,2})[\s\/.\-]*([a-z]{3})[a-z]*\.?[\s\/.\-,]*(\d{2,4})?/)) && MES_TXT[m[2]]) { d = +m[1]; mo = MES_TXT[m[2]]; y = m[3] ? +m[3] : null; }
  else if ((m = s.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})?/)) && MES_TXT[m[1]]) { mo = MES_TXT[m[1]]; d = +m[2]; y = m[3] ? +m[3] : null; }
  else return null;
  if (y !== null && y !== undefined && y < 100) y += 2000;
  if (!y) {
    y = anioDefault || +hoy().slice(0, 4);
    if (!anioDefault && claveDia(new Date(y, mo - 1, d, 12)) > sumarDias(hoy(), 31)) y--;   // "18/DIC" en enero es del año pasado
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return y + '-' + pad(mo) + '-' + pad(d);
}

/* ===================== Foto del ticket ===================== */
function abrirHojaTicket() { FORM = { vista: 'ticket', estado: 'elegir' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaTicket() {
  let h = titulo('Foto del ticket');
  if (FORM.mini) h += '<img class="ticket-mini grande" src="' + FORM.mini + '" alt="Tu ticket">';
  if (FORM.estado === 'leyendo') h += '<div class="center" style="min-height:120px"><div><div class="spin" aria-hidden="true"></div><p class="muted">Leyendo tu ticket…</p></div></div>';
  else {
    if (FORM.err) h += '<div class="note red" role="alert">' + esc(FORM.err) + '</div>';
    h += '<p class="hint" style="margin-top:0">Ponlo sobre una superficie lisa, con buena luz y que se vea el TOTAL. Después revisas lo que leí antes de guardar.</p>' +
      '<div class="actgrid" style="grid-template-columns:1fr 1fr"><button class="btn" onclick="elegirTicket(true)">📷 Tomar foto</button><button class="btn ghost" onclick="elegirTicket(false)">🖼️ De la galería</button></div>' +
      (FORM.err ? '<button class="btn ghost block" style="margin-top:8px" onclick="FORM=null;abrirRegistro({tipo:\'Gasto\'})">Capturar a mano</button>' : '');
  }
  return h + '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button></div>';
}
function elegirTicket(camara) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = 'image/*';
  if (camara) i.setAttribute('capture', 'environment');
  i.onchange = () => { if (i.files && i.files[0]) leerTicket(i.files[0]); };
  i.click();
}
// Reduce la foto (lado mayor 1600 px, JPEG) para subirla rápido; también una miniatura para la vista previa
function comprimirImagen(file, max, calidad) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const esc2 = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * esc2); c.height = Math.round(img.height * esc2);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No pude abrir la imagen')); };
    img.src = url;
  });
}
async function leerTicket(file) {
  FORM = { vista: 'ticket', estado: 'leyendo' }; abrirHoja(); pintarHoja();
  try {
    const [grande, mini] = await Promise.all([comprimirImagen(file, 1600, .78), comprimirImagen(file, 360, .7)]);
    if (FORM && FORM.vista === 'ticket') { FORM.mini = mini; pintarHoja(); }
    if (!DEMO && !navigator.onLine) throw new Error('Necesitas internet para leer el ticket. Puedes capturarlo a mano.');
    const r = DEMO ? await new Promise(ok => setTimeout(() => ok({ url: '', texto: TICKET_DEMO }), 700))
                   : await llamar({ action: 'subirTicket', args: [{ base64: grande.split(',')[1] }] });
    const t = datosTicket(r.texto || '');
    FORM = null;
    abrirRegistro({ tipo: 'Gasto', monto: t.total || '', desc: t.comercio || '', categoria: t.categoria, fecha: t.fecha, ticket: r.url || '', ticketMini: mini, ticketTexto: r.texto || '', leido: true });
    vibrar(15);
  } catch (e) {
    if (!FORM || FORM.vista !== 'ticket') return;
    FORM.estado = 'elegir'; FORM.err = /Drive API/.test(e.message) ? e.message : mensajeError(e); pintarHoja();
  }
}
const TICKET_DEMO = 'OXXO\nCADENA COMERCIAL OXXO SA DE CV\nSUC CENTRO HERMOSILLO\n' + hoy().split('-').reverse().join('/') + ' 14:32\nCOCA COLA 600ML 21.00\nSABRITAS ORIGINAL 19.50\nSUBTOTAL 40.50\nTOTAL $40.50\nEFECTIVO 50.00\nCAMBIO 9.50';
// Del texto del ticket saca total, fecha, comercio y categoría. Todo es propuesta: tú lo revisas.
function datosTicket(texto) {
  const lineas = String(texto).split(/\n+/).map(l => l.trim()).filter(Boolean);
  const montos = l => (l.match(/\$?\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})|\$?\s*\d+[.,]\d{2}\b/g) || []).map(numeroFlexible).filter(n => n !== null && n > 0 && n < 500000);
  let total = null;
  lineas.forEach((l, i) => {
    if (!/\btotal\b|importe a pagar|a pagar|total a pagar/i.test(l) || /sub\s*-?total|art[ií]culos|piezas|ahorr|descuento|\biva\b|propina sugerida/i.test(l)) return;
    const ms = montos(l).length ? montos(l) : montos(lineas[i + 1] || '');
    if (ms.length) total = Math.max(total || 0, ms[ms.length - 1]);
  });
  if (!total) { const todos = lineas.flatMap(montos); if (todos.length) total = Math.max(...todos); }
  let fecha = null;
  for (const l of lineas) { const f = fechaFlexible(l); if (f && f <= hoy() && f >= sumarDias(hoy(), -400)) { fecha = f; break; } }
  const conocidos = /oxxo|7-?eleven|walmart|soriana|chedraui|heb|costco|sam'?s|starbucks|pemex|liverpool|farmacias? [a-z]+|benavides|la comer|bodega aurrera|home depot|coppel|sanborns|cinepolis|cinemex|mcdonald'?s|burger king|little caesars|domino'?s|kfc|carl'?s jr|superama|city market|fresko|7 eleven|circle k|extra\b|ahorro/i;
  let comercio = (lineas.find(l => conocidos.test(l)) || '').match(conocidos);
  comercio = comercio ? comercio[0] : (lineas.find(l => /[a-záéíóúñ]{3}/i.test(l) && !/rfc|r\.f\.c|ticket|folio|fecha|hora|caja|cajero|tel|sucursal|s\.?a\.? de c\.?v|www|http|calle|col\.|c\.p\./i.test(l)) || '');
  comercio = titular(comercio.replace(/[^a-záéíóúñü0-9 '&.-]/gi, ' ')).slice(0, 40);
  return { total: total ? r2(total) : null, fecha: fecha || hoy(), comercio, categoria: adivinarCategoria(comercio + ' ' + lineas.slice(0, 4).join(' '), 'Gasto') };
}
function htmlTicketForm() {
  if (!FORM.ticketMini && !FORM.ticket) return '';
  let h = '<div class="ticket-box">' + (FORM.ticketMini ? '<img class="ticket-mini" src="' + FORM.ticketMini + '" alt="Foto del ticket">' : '<span class="ticket-ico" aria-hidden="true">🧾</span>') + '<div>';
  if (FORM.leido) h += '<b>Lo leí de tu ticket.</b> Revisa el monto, la fecha, el comercio y la categoría; cambia lo que quieras antes de guardar.';
  else h += '<b>Este gasto tiene foto del ticket.</b>';
  if (FORM.ticket) h += ' <a href="' + esc(FORM.ticket) + '" target="_blank" rel="noopener">Ver foto</a>';
  if (FORM.ticketTexto) h += '<details><summary>Texto que leí</summary><pre class="ticket-txt">' + esc(FORM.ticketTexto.slice(0, 1500)) + '</pre></details>';
  return h + '</div></div>';
}

/* ===================== Importar estado de cuenta (BBVA, Revolut u otro) ===================== */
function abrirImportar(cuenta) {
  FORM = { vista: 'importar', paso: 'elegir', cuenta: cuenta || (activas().find(c => c.nombre === cuentaGastos()) || activas()[0] || {}).nombre, filas: [], err: '', texto: '', pass: '' };
  abrirHoja(); pintarHoja(); enfocarTitulo();
}
function hojaImportar() {
  const F = FORM;
  let h = titulo('Importar estado de cuenta');
  if (F.paso === 'leyendo') return h + '<div class="center" style="min-height:160px"><div><div class="spin" aria-hidden="true"></div><p class="muted">Leyendo ' + esc(F.archivo || 'tu estado de cuenta') + '…</p></div></div>';
  if (F.paso === 'revisar') return h + htmlRevisarImport();
  h += '<p class="hint" style="margin-top:0">Agrega lo que te faltó registrar. Primero revisas todo; lo que ya tienes registrado sale desmarcado.</p>';
  h += '<div class="fl">¿De qué cuenta es?</div><div class="pick" role="group" aria-label="Cuenta">' + activas().map(c => '<button class="' + (F.cuenta === c.nombre ? 'on' : '') + '" aria-pressed="' + (F.cuenta === c.nombre) + '" onclick="setForm(\'cuenta\',\'' + jsq(c.nombre) + '\')">' + esc(c.nombre) + '</button>').join('') + '</div>';
  if (F.err) h += '<div class="note red" style="margin-top:12px" role="alert">' + esc(F.err) + '</div>';
  if (F.pedirPass) h += '<div class="fl"><label for="fPass">Contraseña del PDF</label></div><input id="fPass" class="inp" type="password" autocomplete="off" value="' + esc(F.pass) + '" oninput="if(FORM){FORM.pass=this.value}"><button class="btn block" style="margin-top:8px" onclick="leerArchivoImport(FORM._file)">Abrir</button>';
  h += '<div class="actgrid" style="grid-template-columns:1fr 1fr;margin-top:14px"><button class="btn" onclick="elegirArchivoImport()">📄 Elegir PDF o CSV</button><button class="btn ghost" onclick="FORM.pegar=!FORM.pegar;pintarHoja()">📋 Pegar texto</button></div>';
  if (F.pegar) h += '<textarea id="fPegar" class="inp area" rows="7" placeholder="Copia los movimientos del PDF o de la página del banco y pégalos aquí" oninput="if(FORM){FORM.texto=this.value}">' + esc(F.texto) + '</textarea><button class="btn block" style="margin-top:8px" onclick="procesarTextoImport(FORM.texto.split(/\\n/), \'texto pegado\')">Leer movimientos</button>';
  h += '<details class="arch"><summary>¿Dónde lo descargo?</summary><ul class="ideas">' +
    '<li><b>BBVA:</b> en la app o en bbva.mx → tu tarjeta → Estados de cuenta → descargar PDF. También sirve "Movimientos" → exportar.</li>' +
    '<li><b>Revolut:</b> en la app → tu cuenta → ⋯ → Estado de cuenta → Excel/CSV (mejor que PDF) → elige el periodo.</li>' +
    '<li><b>Otro banco:</b> cualquier PDF o CSV con fecha, descripción y monto por renglón. Si no lee bien, copia y pega el texto.</li></ul></details>';
  return h + '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button></div>';
}
function elegirArchivoImport() {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.pdf,.csv,.txt,application/pdf,text/csv,text/plain';
  i.onchange = () => { if (i.files && i.files[0]) leerArchivoImport(i.files[0]); };
  i.click();
}
async function leerArchivoImport(file) {
  if (!file) return;
  const F = FORM; F._file = file; F.archivo = file.name; F.paso = 'leyendo'; F.err = ''; pintarHoja();
  try {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const lineas = await textoPDF(file, F.pass);
      F.pedirPass = false;
      procesarTextoImport(lineas, file.name);
    } else {
      const t = await file.text();
      if (/^[^\n]*(fecha|date|started)[^\n]*[,;\t]/i.test(t.split(/\r?\n/).find(l => l.trim()) || '')) procesarFilas(leerCSV(t), file.name);
      else procesarTextoImport(t.split(/\r?\n/), file.name);
    }
  } catch (e) {
    if (FORM !== F) return;
    F.paso = 'elegir';
    if (e && e.name === 'PasswordException') { F.pedirPass = true; F.err = F.pass ? 'Contraseña incorrecta.' : 'Este PDF tiene contraseña.'; }
    else F.err = 'No pude leer el archivo: ' + (e.message || e);
    pintarHoja();
  }
}
// Texto de un PDF, renglón por renglón (agrupa los pedazos que están a la misma altura)
async function textoPDF(file, pass) {
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password: pass || undefined, isEvalSupported: false }).promise;
  const lineas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent(), grupos = {};
    tc.items.forEach(it => { if (!it.str.trim()) return; const y = Math.round(it.transform[5] / 4) * 4; (grupos[y] = grupos[y] || []).push(it); });
    Object.keys(grupos).map(Number).sort((a, b) => b - a).forEach(y => lineas.push(grupos[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return lineas;
}
// CSV con comillas; separador coma, punto y coma o tabulador
function leerCSV(t) {
  const prim = t.split(/\r?\n/)[0], sep = (prim.match(/;/g) || []).length > (prim.match(/,/g) || []).length ? ';' : prim.indexOf('\t') >= 0 ? '\t' : ',';
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') q = false; else campo += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(x => x.trim()));
}
// Filas de CSV → movimientos. Reconoce Revolut (inglés o español) y exportaciones con Cargo/Abono o Importe.
function procesarFilas(filas, nombre) {
  const enc = filas[0].map(x => sinAcentos(x).trim()), col = re => enc.findIndex(x => re.test(x));
  const cFecha = col(/^(completed date|fecha de finalizacion|fecha de operacion|fecha)$/) >= 0 ? col(/^(completed date|fecha de finalizacion|fecha de operacion|fecha)$/) : col(/date|fecha/);
  const cDesc = col(/descrip|concepto|detalle|description|comercio/), cMonto = col(/^(amount|importe|monto|cantidad)$/), cCargo = col(/cargo|retiro|debit|salida/), cAbono = col(/abono|deposito|credit|entrada/);
  const cFee = col(/^(fee|comision)$/), cMon = col(/currency|divisa|moneda/), cEstado = col(/^(state|estado)$/), cTipo = col(/^(type|tipo)$/);
  if (cFecha < 0 || cDesc < 0 || (cMonto < 0 && cCargo < 0)) { FORM.paso = 'elegir'; FORM.err = 'No reconocí las columnas del CSV (necesito fecha, descripción y monto).'; return pintarHoja(); }
  const movs = [];
  filas.slice(1).forEach(f => {
    const fecha = fechaFlexible(f[cFecha]); if (!fecha) return;
    if (cEstado >= 0 && f[cEstado] && !/complet|terminad/i.test(f[cEstado])) return;     // rechazadas o revertidas
    let monto = cMonto >= 0 ? numeroFlexible(f[cMonto]) : (numeroFlexible(f[cAbono]) || 0) - (numeroFlexible(f[cCargo]) || 0);
    if (monto === null || !monto) return;
    if (cFee >= 0) monto -= Math.abs(numeroFlexible(f[cFee]) || 0);
    movs.push({ fecha, desc: String(f[cDesc] || '').trim(), monto: r2(monto), moneda: cMon >= 0 ? String(f[cMon] || '').trim().toUpperCase() : '', tipoBanco: cTipo >= 0 ? String(f[cTipo] || '') : '' });
  });
  prepararRevision(movs, nombre);
}
// Texto de estado de cuenta (PDF o pegado): renglones que empiezan con fecha y terminan con montos
function procesarTextoImport(lineas, nombre) {
  const c = DATA.cuentas.find(x => x.nombre === FORM.cuenta), credito = c && esDeuda(c);
  const reFecha = /^\s*(\d{1,2}[\/.\-](?:\d{1,2}|[a-z]{3})[a-z]*(?:[\/.\-]\d{2,4})?|\d{1,2}\s+[a-z]{3}[a-z]*\.?(?:\s+\d{4})?|[a-z]{3}[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i;
  const reMonto = /[-+]?\s?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}(?:\s?(?:mxn|eur|usd))?|[-+]?\d+\.\d{2}/gi;
  const anio = +((lineas.join(' ').match(/\b(20\d{2})\b/) || [])[1] || hoy().slice(0, 4));
  const movs = []; let saldoPrev = null;
  lineas.forEach(l => {
    const lim = String(l).replace(/\s+/g, ' ').trim(), mf = lim.match(reFecha);
    if (!mf) return;
    const fecha = fechaFlexible(mf[1], /\d{4}/.test(mf[1]) ? null : anio);
    if (!fecha) return;
    let resto = lim.slice(mf[0].length).replace(reFecha, '').trim();          // a veces vienen dos fechas (operación y cargo)
    const montos = resto.match(reMonto) || [];
    if (!montos.length) return;
    const vals = montos.map(x => ({ t: x, n: numeroFlexible(x) }));
    let desc = resto; montos.forEach(x => { desc = desc.replace(x, ''); });
    desc = desc.replace(/\s+/g, ' ').replace(/[+$]+\s*$/, '').trim();
    if (!desc || /^(saldo|total|subtotal|pago minimo|pago para no generar)/i.test(sinAcentos(desc))) return;
    let m = vals[0].n, entrada = /^-/.test(vals[0].t.trim()) || /\babono|su pago|pago recibido|pago tdc|deposito|devolucion|bonificacion|reembolso|nomina|transferencia recibida|spei recibido/i.test(sinAcentos(desc));
    // Débito con columna de saldo: si el saldo subió, entró dinero
    if (!credito && vals.length >= 2) { const s = vals[vals.length - 1].n; if (saldoPrev !== null) entrada = s > saldoPrev; saldoPrev = s; }
    m = Math.abs(m);
    if (!m) return;
    movs.push({ fecha, desc, monto: entrada ? m : -m });
  });
  if (!movs.length) { FORM.paso = 'elegir'; FORM.err = 'No encontré movimientos en ' + nombre + '. Prueba con el CSV o copia y pega los renglones.'; FORM.pegar = true; return pintarHoja(); }
  prepararRevision(movs, nombre);
}
// Arma la tabla de revisión: tipo y categoría propuestos, y marca lo que ya está registrado
function prepararRevision(movs, nombre) {
  const c = DATA.cuentas.find(x => x.nombre === FORM.cuenta), credito = c && esDeuda(c);
  const origenPago = c && (c.domiciliado || (activas().find(x => x.tipo === 'Débito') || {}).nombre);
  const usados = new Set();
  FORM.filas = movs.sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((x, i) => {
    let tipo = x.monto < 0 ? 'Gasto' : credito ? (/pago|abono/i.test(sinAcentos(x.desc)) ? 'Pago' : 'Reembolso') : 'Ingreso';
    if (/^(TOPUP|TRANSFER|EXCHANGE)$/i.test(x.tipoBanco || '')) tipo = x.monto < 0 ? 'Omitir' : 'Omitir';
    const otraMoneda = x.moneda && x.moneda !== 'MXN';
    const dup = DATA.movs.find(m => !usados.has(m.id) && (m.cuenta === FORM.cuenta || m.aCuenta === FORM.cuenta) && Math.abs(m.monto - Math.abs(x.monto)) < 0.51 && Math.abs(difDias(m.fecha, x.fecha)) <= 3);
    if (dup) usados.add(dup.id);
    const antes = c && x.fecha < c.fechaCorte;
    const nota = dup ? 'Ya registrado: ' + (dup.desc || dup.categoria) + ' (' + fechaCorta(dup.fecha) + ')' : antes ? 'Antes de tu saldo inicial (' + fechaCorta(c.fechaCorte) + ')' : otraMoneda ? 'En ' + x.moneda + ': conviértelo a pesos' : tipo === 'Omitir' ? 'Traspaso o recarga: regístralo a mano si hace falta' : '';
    return { i, fecha: x.fecha, desc: titular(x.desc).slice(0, 80), monto: Math.abs(x.monto), tipo, categoria: tipo === 'Gasto' || tipo === 'Reembolso' ? adivinarCategoria(x.desc, 'Gasto') : tipo === 'Ingreso' ? adivinarCategoria(x.desc, 'Ingreso') : null,
             origen: origenPago, si: !dup && !antes && !otraMoneda && tipo !== 'Omitir', nota };
  });
  FORM.archivo = nombre; FORM.paso = 'revisar'; pintarHoja();
}
function htmlRevisarImport() {
  const F = FORM, sel = F.filas.filter(f => f.si), sale = sel.filter(f => f.tipo === 'Gasto').reduce((t, f) => t + f.monto, 0), entra = sel.filter(f => f.tipo !== 'Gasto').reduce((t, f) => t + f.monto, 0);
  const tipos = ['Gasto', 'Ingreso', 'Reembolso', 'Pago', 'Omitir'];
  let h = '<div class="card flat"><div class="t1">' + F.filas.length + ' movimientos en ' + esc(F.archivo) + '</div><div class="muted">' + esc(F.cuenta) + ' · ' +
    F.filas.filter(f => !f.si).length + ' desmarcados (ya registrados, antes de tu saldo inicial u omitidos). Seleccionados: ' + sel.length + ' · salen ' + money(sale, true) + ' · entran ' + money(entra, true) + '.</div>' +
    '<div class="actions"><button class="btn sm ghost" onclick="FORM.filas.forEach(f=>f.si=true);pintarHoja()">Marcar todos</button><button class="btn sm ghost" onclick="FORM.filas.forEach(f=>f.si=false);pintarHoja()">Ninguno</button><button class="btn sm ghost" onclick="FORM.paso=\'elegir\';pintarHoja()">Otro archivo</button></div></div>';
  h += F.filas.map((f, k) => {
    const cats = f.tipo === 'Ingreso' ? catsIngreso() : catsGasto();
    return '<div class="imp' + (f.si ? '' : ' off') + '"><label class="imp-chk"><input type="checkbox" ' + (f.si ? 'checked' : '') + ' onchange="FORM.filas[' + k + '].si=this.checked;pintarHoja()" aria-label="Importar"></label><div class="imp-c">' +
      '<div class="imp-r"><input type="date" value="' + f.fecha + '" max="' + hoy() + '" onchange="FORM.filas[' + k + '].fecha=this.value" aria-label="Fecha">' +
      '<input class="imp-m num" inputmode="decimal" value="' + f.monto + '" onchange="FORM.filas[' + k + '].monto=parseMonto(this.value);pintarHoja()" aria-label="Monto"></div>' +
      '<input class="imp-d" value="' + esc(f.desc) + '" maxlength="80" oninput="FORM.filas[' + k + '].desc=this.value" aria-label="Descripción">' +
      '<div class="imp-r"><select onchange="FORM.filas[' + k + '].tipo=this.value;FORM.filas[' + k + '].categoria=this.value===\'Ingreso\'?adivinarCategoria(FORM.filas[' + k + '].desc,\'Ingreso\'):adivinarCategoria(FORM.filas[' + k + '].desc,\'Gasto\');pintarHoja()" aria-label="Tipo">' +
      tipos.map(t => '<option' + (t === f.tipo ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      (f.tipo === 'Gasto' || f.tipo === 'Ingreso' || f.tipo === 'Reembolso' ? '<select onchange="FORM.filas[' + k + '].categoria=this.value" aria-label="Categoría">' + cats.map(c => '<option' + (c.nombre === f.categoria ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</select>' :
        f.tipo === 'Pago' ? '<select onchange="FORM.filas[' + k + '].origen=this.value" aria-label="Pagado desde">' + activas().filter(c => !esDeuda(c)).map(c => '<option' + (c.nombre === f.origen ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('') + '</select>' : '') + '</div>' +
      (f.nota ? '<div class="muted imp-n">' + esc(f.nota) + '</div>' : '') + '</div></div>';
  }).join('');
  return h + '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" ' + (sel.length ? '' : 'disabled') + ' onclick="confirmarImport()">Agregar ' + sel.length + '</button></div>';
}
function confirmarImport() {
  const F = FORM, c = DATA.cuentas.find(x => x.nombre === F.cuenta);
  let n = 0;
  F.filas.filter(f => f.si && f.monto > 0 && f.tipo !== 'Omitir').forEach(f => {
    const base = { id: uid(), fecha: f.fecha, monto: r2(f.monto), desc: f.desc, registrado: Date.now() + n, persona: '', fijo: 'imp', meses: null, aCuenta: '', categoria: '' };
    let m;
    if (f.tipo === 'Pago') { if (!f.origen || !c || !esDeuda(c)) return; m = Object.assign(base, { tipo: 'Traspaso', cuenta: f.origen, aCuenta: F.cuenta }); }
    else m = Object.assign(base, { tipo: f.tipo, cuenta: F.cuenta, categoria: f.categoria || (f.tipo === 'Ingreso' ? 'Otro ingreso' : 'Otros') });
    encolar('guardarMov', [m], true); n++;
  });
  cerrarHoja(); pintar();
  toast('Agregué ' + n + (n === 1 ? ' movimiento' : ' movimientos') + ' a ' + F.cuenta);
}

/* ===================== Evolución del patrimonio ===================== */
function patrimonioAl(f) {
  let disp = 0, deuda = 0, teDeben = 0, debes = 0;
  DATA.cuentas.forEach(c => { if (c.fechaCorte > f) return; const s = saldo(c, f); if (esDeuda(c)) deuda += -s; else disp += s; });
  DATA.personas.forEach(p => { if (p.fechaCorte > f) return; const s = saldoPersona(p, f); if (s > 0) teDeben += s; else debes += -s; });
  return { disp: r2(disp), deuda: r2(deuda), teDeben: r2(teDeben), debes: r2(debes), neto: r2(disp - deuda - debes) };
}
// Puntos: las fotos mensuales guardadas en la hoja antes de tu corte, y desde el corte semana a semana (o mes a mes si ya es mucho tiempo)
function seriePatrimonio() {
  const ini = minCorte(), fin = hoy(), pts = [];
  (DATA.patrimonio || []).filter(x => !ini || x.fecha < ini).forEach(x => pts.push(Object.assign({ f: x.fecha }, x)));
  if (!ini) return pts;
  const mensual = difDias(ini, fin) > 120;
  for (let f = ini; f < fin; f = mensual ? conDia(mesSig(f.slice(0, 7), 1), 1) : sumarDias(f, 7)) pts.push(Object.assign({ f }, patrimonioAl(f)));
  pts.push(Object.assign({ f: fin }, patrimonioAl(fin)));
  return pts;
}
const compacto = n => (n < 0 ? '-' : '') + '$' + (Math.abs(n) >= 1000 ? (Math.abs(n) / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : Math.round(Math.abs(n)));
function vistaPatrimonio() {
  const s = seriePatrimonio();
  if (s.length < 2) return '<div class="list"><div class="empty">Aún no hay suficiente historia. Vuelve en unos días.</div></div>';
  const a = s[0], z = s[s.length - 1], dn = r2(z.neto - a.neto), dd = r2(z.deuda - a.deuda), dias = Math.max(1, difDias(a.f, z.f));
  const ritmo = r2(-dd / dias * 30.4);
  let h = '<div class="grid2" style="margin-bottom:12px">' +
    '<div class="stat"><div class="muted">Patrimonio neto</div><div class="amt sm num' + (z.neto < 0 ? ' red' : '') + '">' + money(z.neto, true) + '</div><div class="sub ' + (dn >= 0 ? 'green' : 'red') + '">' + (dn >= 0 ? '▲ ' : '▼ ') + money(Math.abs(dn), true) + ' desde ' + fechaCorta(a.f) + '</div></div>' +
    '<div class="stat"><div class="muted">Deuda con bancos</div><div class="amt sm num red">' + money(z.deuda, true) + '</div><div class="sub ' + (dd <= 0 ? 'green' : 'red') + '">' + (dd <= 0 ? '▼ bajó ' : '▲ subió ') + money(Math.abs(dd), true) + '</div></div></div>';
  h += '<div class="card"><div class="t1">Tu patrimonio y tu deuda</div><div class="muted" style="margin:2px 0 8px">Desde ' + fechaCorta(a.f) + (s.length > 2 ? ', ' + (difDias(s[1].f, s[2] ? s[2].f : z.f) > 20 ? 'mes a mes' : 'semana a semana') : '') + '.</div>' +
    '<div class="leyenda"><span><i class="sw s1"></i>Patrimonio neto</span><span><i class="sw s2"></i>Deuda con bancos</span></div>' +
    graficaLineas(s.map(x => x.f), [{ v: s.map(x => x.neto), c: 's1' }, { v: s.map(x => x.deuda), c: 's2' }]) +
    '<div class="tip" id="tipPat" aria-live="polite">Toca la gráfica para ver cada fecha.</div>' +
    '<details class="arch"><summary>Ver como tabla</summary><table class="tabla"><thead><tr><th>Fecha</th><th>Disponible</th><th>Deuda</th><th>Neto</th></tr></thead><tbody>' +
    s.slice().reverse().map(x => '<tr><td>' + fechaCorta(x.f) + '</td><td class="num">' + money(x.disp, true) + '</td><td class="num">' + money(x.deuda, true) + '</td><td class="num">' + money(x.neto, true) + '</td></tr>').join('') + '</tbody></table></details></div>';
  if (dias >= 14 && ritmo > 0) h += '<div class="note info">A tu ritmo actual tu deuda baja unos <b>' + money(ritmo, true) + ' al mes</b>' + (z.deuda > 0 ? '; terminarías de pagarla hacia <b>' + mesDentro(Math.ceil(z.deuda / ritmo)) + '</b>.' : '.') + '</div>';
  else if (dias >= 14 && ritmo < 0) h += '<div class="note red">Tu deuda va subiendo unos <b>' + money(-ritmo, true) + ' al mes</b>. Revisa el plan de deuda.</div>';
  h += '<p class="hint">Cada mes la app guarda una foto de tus saldos en la pestaña "Patrimonio" de tu hoja, así la historia no se pierde.</p>';
  return h;
}
// Gráfica de líneas: una sola escala, líneas de 2px, puntos de 8px, toque para ver el detalle
function graficaLineas(fechas, series) {
  const W = 340, H = 180, pl = 40, pr = 8, pt = 10, pb = 24, todos = series.flatMap(s => s.v);
  let min = Math.min(0, ...todos), max = Math.max(...todos);
  if (max === min) max = min + 1;
  // Marcas redondas (1, 2, 2.5 o 5 por potencia de 10) que incluyen el cero
  const bruto = (max - min) / 3, p10 = Math.pow(10, Math.floor(Math.log10(bruto))), paso0 = [1, 2, 2.5, 5, 10].map(k => k * p10).find(k => k >= bruto);
  min = Math.floor(min / paso0) * paso0; max = Math.ceil(max / paso0) * paso0;
  const marcasY = []; for (let v = min; v <= max + paso0 / 2; v += paso0) marcasY.push(v);
  const x = i => pl + (W - pl - pr) * (fechas.length === 1 ? .5 : i / (fechas.length - 1)), y = v => pt + (H - pt - pb) * (1 - (v - min) / (max - min));
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución de tu patrimonio y tu deuda">';
  marcasY.forEach(v => { s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="lb" x="' + (pl - 4) + '" y="' + (y(v) + 3) + '" style="text-anchor:end">' + compacto(v) + '</text>'; });
  if (min < 0 && max > 0) s += '<line class="ax" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
  series.forEach(se => {
    s += '<polyline class="ln ' + se.c + '" points="' + se.v.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '"/>';
    if (fechas.length <= 40) se.v.forEach((v, i) => { s += '<circle class="pt ' + se.c + '" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="4"/>'; });
  });
  const marcas = fechas.length <= 3 ? fechas.map((_, i) => i) : [0, Math.floor((fechas.length - 1) / 2), fechas.length - 1];
  marcas.forEach(i => { s += '<text class="lb" x="' + x(i) + '" y="' + (H - 6) + '"' + (i === 0 ? ' style="text-anchor:start"' : i === fechas.length - 1 ? ' style="text-anchor:end"' : '') + '>' + fechaCorta(fechas[i]) + '</text>'; });
  const paso = (W - pl - pr) / Math.max(1, fechas.length - 1);
  fechas.forEach((f, i) => { s += '<rect class="hit" x="' + (x(i) - paso / 2) + '" y="0" width="' + paso + '" height="' + H + '" tabindex="0" role="button" aria-label="' + fechaCorta(f) + '" onclick="detallePat(' + i + ')" onkeydown="if(event.key===\'Enter\')detallePat(' + i + ')"/>'; });
  return s + '</svg>';
}
function detallePat(i) {
  const s = seriePatrimonio()[i], el = $('tipPat');
  if (!s || !el) return;
  el.innerHTML = '<b>' + fechaLarga(s.f) + '</b>: patrimonio ' + money(s.neto, true) + ' · deuda ' + money(s.deuda, true) + ' · disponible ' + money(s.disp, true) + (s.teDeben ? ' · te deben ' + money(s.teDeben, true) : '') + '.';
  vibrar(8);
}

/* ===================== Resumen mensual ===================== */
let MES_RES = null;
function resumenDe(mk) {
  const pm = porMes(movsAnalisis()), x = pm[mk] || { gasto: 0, ingreso: 0, cat: {} }, prevK = Object.keys(pm).filter(k => k < mk && pm[k].gasto > 0).sort().pop(), p = prevK ? pm[prevK] : null;
  const ini = mk + '-01', fin = mk + '-' + pad(diasDelMes(mk)), corte = minCorte();
  const deuda = ini > corte ? r2(patrimonioAl(fin > hoy() ? hoy() : fin).deuda - patrimonioAl(sumarDias(ini, -1)).deuda) : null;
  const gastos = movsAnalisis().filter(m => m.tipo === 'Gasto' && m.fecha.slice(0, 7) === mk).sort((a, b) => b.monto - a.monto);
  const dias = new Set(movsAnalisis().filter(m => m.fecha.slice(0, 7) === mk).map(m => m.fecha).concat(LS.get('fin_singasto', []).filter(d => d.slice(0, 7) === mk))).size;
  const cats = Object.keys(x.cat).filter(c => x.cat[c] > 0).sort((a, b) => x.cat[b] - x.cat[a]);
  const cambios = p ? cats.concat(Object.keys(p.cat)).filter((c, i, a) => a.indexOf(c) === i).map(c => ({ c, d: r2((x.cat[c] || 0) - (p.cat[c] || 0)) })).sort((a, b) => a.d - b.d) : [];
  return { mk, x, p, prevK, deuda, gastos, dias, cats, mejor: cambios[0] && cambios[0].d < 0 ? cambios[0] : null, peor: cambios.length && cambios[cambios.length - 1].d > 0 ? cambios[cambios.length - 1] : null,
           pres: resumenMes(mk).presupuesto, ahorro: r2(x.ingreso - x.gasto) };
}
function vistaResumen() {
  const act = hoy().slice(0, 7);
  if (!MES_RES) MES_RES = mesSig(act, -1);
  const R = resumenDe(MES_RES), x = R.x, nom = MESES[+MES_RES.slice(5, 7) - 1], dif = R.p && R.p.gasto > 0 ? Math.round((x.gasto - R.p.gasto) / R.p.gasto * 100) : null;
  let h = '<div class="monthbar"><button class="arrow" aria-label="Mes anterior" onclick="MES_RES=mesSig(MES_RES,-1);pintar()">' + ARROW_L + '</button><span class="nm" aria-live="polite">' + nombreMes(MES_RES) + '</span>' +
    '<button class="arrow" aria-label="Mes siguiente" ' + (MES_RES >= act ? 'disabled' : '') + ' onclick="MES_RES=mesSig(MES_RES,1);pintar()">' + ARROW_R + '</button></div>';
  if (!x.gasto && !x.ingreso) return h + '<div class="list"><div class="empty">Sin registros en ' + nombreMes(MES_RES) + '.</div></div>';
  h += '<section class="hero" style="margin-top:0"><div class="lbl">' + (MES_RES === act ? 'Llevas gastado en ' + nom : 'En ' + nom + ' gastaste') + '</div><div class="big num">' + money(x.gasto, true) + '</div>' +
    '<div class="of">' + (R.pres ? 'de ' + money(R.pres, true) + ' de presupuesto' : '') + (dif !== null ? (R.pres ? ' · ' : '') + (dif > 0 ? '▲ ' + dif + '% más' : dif < 0 ? '▼ ' + Math.abs(dif) + '% menos' : 'igual') + ' que ' + MESES[+R.prevK.slice(5, 7) - 1] : '') + '</div>' +
    (R.pres ? '<div class="meter" aria-hidden="true"><div class="' + (x.gasto > R.pres ? 'over' : '') + '" style="width:' + Math.min(100, x.gasto / R.pres * 100).toFixed(1) + '%"></div></div>' : '') + '</section>';
  h += '<div class="grid2" style="margin-bottom:12px">' +
    '<div class="stat"><div class="muted">Ingresos</div><div class="amt sm num">' + money(x.ingreso, true) + '</div></div>' +
    '<div class="stat"><div class="muted">Ahorro</div><div class="amt sm num ' + (R.ahorro >= 0 ? 'green' : 'red') + '">' + money(R.ahorro, true) + '</div>' + (x.ingreso ? '<div class="sub">' + Math.round(R.ahorro / x.ingreso * 100) + '% de lo que entró</div>' : '') + '</div>' +
    (R.deuda !== null ? '<div class="stat"><div class="muted">Tu deuda</div><div class="amt sm num ' + (R.deuda <= 0 ? 'green' : 'red') + '">' + (R.deuda <= 0 ? '▼ ' : '▲ ') + money(Math.abs(R.deuda), true) + '</div><div class="sub">' + (R.deuda <= 0 ? 'bajó' : 'subió') + ' en el mes</div></div>' : '') +
    '<div class="stat"><div class="muted">Días registrados</div><div class="amt sm num">' + R.dias + '</div><div class="sub">de ' + (MES_RES === act ? +hoy().slice(8, 10) : diasDelMes(MES_RES)) + '</div></div></div>';
  if (R.cats.length) h += '<div class="card"><div class="t1">En qué se fue</div>' + R.cats.slice(0, 5).map(c => '<div class="qrow"><span>' + emo(ICONO[c]) + esc(c) + ' <span class="muted">' + Math.round(x.cat[c] / x.gasto * 100) + '%</span></span><b class="num">' + money(x.cat[c], true) + '</b></div>').join('') +
    '<button class="btn sm ghost" style="margin-top:8px" onclick="SUB_ANALISIS=\'Categorías\';MES_CAT=\'' + MES_RES + '\';pintar()">Ver todas las categorías</button></div>';
  const lo = [];
  if (R.mejor) lo.push('👍 Gastaste <b>' + money(-R.mejor.d, true) + ' menos</b> en ' + esc(R.mejor.c) + ' que en ' + MESES[+R.prevK.slice(5, 7) - 1] + '.');
  if (R.peor) lo.push('👀 <b>' + esc(R.peor.c) + '</b> subió ' + money(R.peor.d, true) + '.');
  if (R.pres && x.gasto <= R.pres) lo.push('✅ Cerraste dentro de tu presupuesto.');
  else if (R.pres) lo.push('⚠️ Te pasaste ' + money(x.gasto - R.pres, true) + ' del presupuesto.');
  metasActivas().forEach(m => lo.push((m.icono || '🎯') + ' ' + esc(m.nombre) + ': llevas ' + Math.round((m.apartado || 0) / m.objetivo * 100) + '%.'));
  if (lo.length) h += '<div class="card"><div class="t1">Lo que destaca</div><ul class="ideas">' + lo.map(l => '<li>' + l + '</li>').join('') + '</ul></div>';
  if (R.gastos.length) h += '<div class="card"><div class="t1">Tus 5 gastos más grandes</div>' + R.gastos.slice(0, 5).map(g => '<div class="qrow"><span>' + emo(ICONO[g.categoria]) + esc(g.desc || g.categoria) + ' <span class="muted">' + fechaCorta(g.fecha) + '</span></span><b class="num">' + money(g.monto, true) + '</b></div>').join('') + '</div>';
  // Correo
  const ver = BASE && BASE.version || 1;
  h += '<div class="fl">Resumen por correo</div>';
  if (DEMO) h += '<div class="card flat muted">En modo ejemplo no se mandan correos.</div>';
  else if (ver < 5) h += '<div class="note">Para recibirlo por correo actualiza el código de Apps Script a la v5.</div>';
  else h += '<button class="switch" role="switch" aria-checked="' + !!BASE.resumenActivo + '" onclick="alternarResumenCorreo()"><span><b>Mandármelo el día 1 de cada mes</b><br><span class="muted">A ' + esc(BASE.correo || 'tu correo de Google') + ', con tus números, categorías, gastos grandes y metas.</span></span><span class="knob" aria-hidden="true"></span></button>' +
    '<button class="btn ghost block" style="margin-top:8px" onclick="mandarResumen(\'' + MES_RES + '\')">✉️ Mandar el de ' + nom + ' ahora</button>';
  return h;
}
async function alternarResumenCorreo() {
  const nuevo = !BASE.resumenActivo;
  try { const r = await llamar({ action: 'configurarResumen', args: [nuevo] }); BASE.resumenActivo = r.activo; LS.set('fin_base', BASE); recalcular(); pintar(); toast(r.activo ? 'Listo: te llegará a ' + r.correo + ' cada día 1' : 'Ya no te llegará por correo'); }
  catch (e) { toast(mensajeError(e)); }
}
async function mandarResumen(mk) {
  toast('Mandando…');
  try { const r = await llamar({ action: 'enviarResumen', args: [mk] }); toast('Mandado a ' + r.correo + ' ✓'); }
  catch (e) { toast(mensajeError(e)); }
}
// En Inicio, los primeros 5 días del mes: el resumen del mes que acaba de terminar
function tarjetaResumenListo() {
  if (!fx('resumen') || +hoy().slice(8, 10) > 5) return '';
  const mk = mesSig(hoy().slice(0, 7), -1), R = resumenDe(mk);
  if (!R.x.gasto) return '';
  return '<button class="card row between" onclick="MES_RES=\'' + mk + '\';SUB_ANALISIS=\'Resumen\';irA(\'Análisis\')"><span><span class="t1">🗓️ Tu resumen de ' + MESES[+mk.slice(5, 7) - 1] + ' está listo</span><br><span class="muted">Gastaste ' + money(R.x.gasto, true) +
    (R.ahorro >= 0 ? ' y ahorraste ' + money(R.ahorro, true) : ' y gastaste ' + money(-R.ahorro, true) + ' más de lo que entró') + '.</span></span><span class="chev" aria-hidden="true">›</span></button>';
}

/* ===================== Próximos pagos ===================== */
function eventosProximos(dias) {
  const lim = sumarDias(hoy(), dias), ev = [], mk = hoy().slice(0, 7);
  const add = (fecha, ic, t, monto, cls, accion) => { if (fecha && fecha >= hoy() && fecha <= lim) ev.push({ fecha, ic, t, monto, cls, accion }); };
  activas().filter(esDeuda).forEach(c => {
    const ps = c.tipo === 'Crédito' ? pagoSinIntereses(c) : null;
    if (ps && ps.falta > 0.5) add(ps.limite, '💳', c.nombre + ': fecha límite' + (c.domiciliado ? ' (domiciliado)' : ''), ps.falta, 'out', 'pagarEstado(\'' + jsq(c.nombre) + '\')');
    else if (!ps && c.diaPago && saldo(c) < -0.5 && c.tipo === 'Crédito') add(proximaFecha(c.diaPago), '💳', c.nombre + ': fecha límite', null, 'out', 'abrirDetalle(\'' + jsq(c.nombre) + '\')');
    const ci = c.tipo === 'Crédito' ? cicloTarjeta(c, hoy()) : null;
    if (ci) add(ci.corte, '✂️', 'Corta ' + c.nombre, null, 'tr', 'abrirDetalle(\'' + jsq(c.nombre) + '\')');
  });
  const usados = new Set(DATA.movs.filter(m => m.fijo && m.fecha.slice(0, 7) === mk).map(m => m.fijo));
  DATA.fijos.filter(f => fijoVigente(f) && f.dia).forEach(f => {
    for (let k = 0; k < 2; k++) {
      const mes = mesSig(mk, k), fecha = conDia(mes, f.dia);
      if (k === 0 && usados.has(f.id)) continue;
      add(fecha, f.tipo === 'Ingreso' ? '💰' : f.tipo === 'Traspaso' ? '🏦' : emo(ICONO[f.categoria]).replace(/<[^>]+>/g, '').trim() || '📌', f.nombre, f.monto, f.tipo === 'Ingreso' ? 'in' : 'out', 'usarFijo(\'' + jsq(f.id) + '\')');
    }
  });
  metasActivas().filter(m => m.fecha).forEach(m => add(m.fecha, m.icono || '🎯', 'Meta: ' + m.nombre, Math.max(0, m.objetivo - (m.apartado || 0)), 'tr', 'abrirMeta(\'' + jsq(m.id) + '\')'));
  return ev.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}
function filaEvento(e) {
  const d = difDias(hoy(), e.fecha);
  return '<button class="mv" onclick="' + e.accion + '"><span class="ic" aria-hidden="true">' + e.ic + '</span><span class="tx"><div class="d1">' + esc(e.t) + '</div><div class="d2">' + (d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : fechaLarga(e.fecha)) + '</div></span>' +
    (e.monto ? '<span class="m num ' + (e.cls === 'in' ? 'in' : '') + '">' + (e.cls === 'in' ? '+' : '') + money(e.monto, true) + '</span>' : '') + '</button>';
}
function tarjetaProximos() {
  if (!fx('proximos')) return '';
  const ev = eventosProximos(10);
  if (!ev.length) return '';
  return '<h2>Próximos pagos<button class="more" onclick="abrirProximos()">Ver 30 días</button></h2><div class="list" style="margin-bottom:12px">' + ev.slice(0, 4).map(filaEvento).join('') + '</div>';
}
function abrirProximos() { FORM = { vista: 'proximos' }; abrirHoja(); pintarHoja(); enfocarTitulo(); }
function hojaProximos() {
  const ev = eventosProximos(30), sale = ev.filter(e => e.cls === 'out' && e.monto).reduce((t, e) => t + e.monto, 0), entra = ev.filter(e => e.cls === 'in' && e.monto).reduce((t, e) => t + e.monto, 0);
  return titulo('Próximos 30 días') + '<div class="grid2" style="margin-bottom:12px"><div class="stat"><div class="muted">Por pagar</div><div class="amt sm num red">' + money(sale, true) + '</div></div><div class="stat"><div class="muted">Por recibir</div><div class="amt sm num green">' + money(entra, true) + '</div></div></div>' +
    (ev.length ? '<div class="list">' + ev.map(filaEvento).join('') + '</div>' : '<div class="list"><div class="empty">Nada en los próximos 30 días.</div></div>') +
    '<p class="hint">Incluye fechas límite de tus tarjetas (con el pago para no generar intereses), cortes, pagos fijos con día y fechas de tus metas.</p><div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button></div>';
}

/* ===================== Gastos hormiga ===================== */
let UMBRAL_HORMIGA = LS.get('fin_umbral_hormiga', 150);
function tarjetaHormiga() {
  if (!fx('hormiga')) return '';
  const desde = sumarDias(hoy(), -90), chicos = movsAnalisis().filter(m => m.tipo === 'Gasto' && m.monto <= UMBRAL_HORMIGA && m.fecha >= desde);
  // Si tu registro empieza después de hace 3 meses, el promedio se saca con los días que sí hay
  const ini = chicos.reduce((x, m) => (m.fecha < x ? m.fecha : x), hoy()), total = chicos.reduce((t, m) => t + m.monto, 0), dias = Math.max(30, difDias(ini, hoy()) + 1);
  const alMes = total / dias * 30.4, grupos = {};
  chicos.forEach(m => { const k = normalizarDesc(m.desc) || m.categoria; const g = grupos[k] || (grupos[k] = { n: (m.desc || m.categoria).trim(), v: 0, c: 0, cat: m.categoria }); g.v += m.monto; g.c++; });
  const top = Object.values(grupos).sort((a, b) => b.v - a.v).slice(0, 5);
  return '<div class="card"><div class="row between"><span class="t1">🐜 Gastos hormiga</span><span class="chips" style="padding:0">' + [100, 150, 250].map(u => '<button class="chip mini' + (u === UMBRAL_HORMIGA ? ' on' : '') + '" onclick="UMBRAL_HORMIGA=' + u + ';LS.set(\'fin_umbral_hormiga\',' + u + ');pintar()">≤' + u + '</button>').join('') + '</span></div>' +
    '<div class="muted" style="margin:4px 0 8px">Compras de ' + money(UMBRAL_HORMIGA, true) + ' o menos en los últimos 3 meses.</div>' +
    (chicos.length ? '<div class="row between"><span><span class="amt num">' + money(alMes, true) + '</span> <span class="muted">al mes</span></span><span class="muted">' + chicos.length + ' compras · al año ' + money(alMes * 12, true) + '</span></div>' +
      top.map(g => '<div class="qrow"><span>' + emo(ICONO[g.cat]) + esc(g.n) + ' <span class="muted">(' + g.c + (g.c === 1 ? ' vez' : ' veces') + ')</span></span><b class="num">' + money(g.v, true) + '</b></div>').join('') +
      (alMes > 300 ? '<p class="hint">Si bajas esto a la mitad, en un año juntas ' + money(alMes * 6, true) + '.</p>' : '')
      : '<div class="empty" style="padding:12px">Sin gastos chiquitos en este periodo. 👏</div>') + '</div>';
}

/* ===================== ¿Me alcanza? ===================== */
function abrirAlcanza() { FORM = { vista: 'alcanza', monto: '', cuenta: cuentaGastos() || (activas().find(c => !esDeuda(c)) || {}).nombre }; abrirHoja(); pintarHoja(); setTimeout(() => { const i = $('fAlc'); if (i) i.focus(); }, 300); }
function hojaAlcanza() {
  const F = FORM, monto = parseMonto(F.monto), c = DATA.cuentas.find(x => x.nombre === F.cuenta);
  let h = titulo('¿Me alcanza?');
  h += '<label class="amount"><span aria-hidden="true">$</span><input id="fAlc" inputmode="decimal" placeholder="¿Cuánto cuesta?" value="' + esc(F.monto) + '" oninput="if(FORM){FORM.monto=this.value}" onchange="pintarHoja()" onkeydown="if(event.key===\'Enter\')this.blur()" aria-label="Precio"></label>';
  h += '<div class="fl">¿Con qué pagarías?</div><div class="pick" role="group" aria-label="Con qué">' + cuentasPara('Gasto').map(x => '<button class="' + (F.cuenta === x.nombre ? 'on' : '') + '" aria-pressed="' + (F.cuenta === x.nombre) + '" onclick="setForm(\'cuenta\',\'' + jsq(x.nombre) + '\')">' + esc(x.nombre) + '</button>').join('') + '</div>';
  if (!(monto > 0)) return h + '<p class="hint">Escribe el precio y te digo cómo queda tu quincena, tu tarjeta y tus metas.</p><div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button></div>';
  const rq = rangoQuincena(hoy()), presQ = resumenMes(hoy().slice(0, 7)).presupuesto / 2, quedaQ = r2(presQ - gastoNeto(rq.desde, rq.hasta)), p = patrimonio(), libre = r2(p.disp - apartadoMetas());
  const meta = metasActivas().find(m => (m.apartado || 0) >= monto), credito = c && c.tipo === 'Crédito';
  let ver, cls;
  if (monto <= quedaQ && (credito || libre >= monto)) { cls = 'info'; ver = '✅ <b>Te alcanza con tu presupuesto.</b> Te quedarían ' + money(quedaQ - monto, true) + ' para el resto de la quincena.' + (credito && libre < monto ? ' Ojo: para la fecha de pago necesitas juntar ' + money(monto - Math.max(0, libre), true) + ' más de dinero libre.' : ''); }
  else if (monto <= quedaQ) { cls = ''; ver = '🟡 <b>Está en tu presupuesto, pero hoy no tienes ese dinero libre:</b> tus cuentas tienen menos de lo que apartaste en metas.'; }
  else if (meta) { cls = 'info'; ver = '✅ <b>Te alcanza con tu meta ' + esc(meta.nombre) + '</b> (' + money(meta.apartado, true) + ' apartados). Usa "Ya lo compré" en la meta.'; }
  else if (libre >= monto) { cls = ''; ver = '🟡 <b>Tienes el dinero, pero no está en tu presupuesto:</b> te pasarías ' + money(monto - Math.max(0, quedaQ), true) + ' esta quincena y saldría de tu colchón.'; }
  else { cls = 'red'; ver = '🔴 <b>Hoy no te alcanza:</b> te faltan ' + money(monto - Math.max(0, libre), true) + ' de tu dinero libre.' + (credito ? ' Con tarjeta solo se pospone el pago.' : ''); }
  h += '<div class="note ' + cls + '" style="margin-top:14px">' + ver + '</div>';
  h += '<div class="card"><div class="qrow"><span>Te queda esta quincena</span><b class="num' + (quedaQ - monto < 0 ? ' red' : '') + '">' + money(quedaQ, true) + ' → ' + money(quedaQ - monto, true) + '</b></div>' +
    '<div class="qrow"><span>Dinero libre (sin metas)</span><b class="num' + (libre - monto < 0 ? ' red' : '') + '">' + money(libre, true) + ' → ' + money(libre - monto, true) + '</b></div>' +
    (credito && c.limite ? '<div class="qrow"><span>Crédito disponible en ' + esc(c.nombre) + '</span><b class="num' + (c.limite + saldo(c) - monto < 0 ? ' red' : '') + '">' + money(Math.max(0, c.limite + saldo(c) - monto), true) + '</b></div>' : '') + '</div>';
  if (credito) {
    const ci = cicloTarjeta(c, hoy());
    if (ci) { const max = cicloTarjeta(c, ci.mejor).dias; h += '<div class="finan"><span class="finan-ic" aria-hidden="true">💳</span><div>Si lo compras hoy lo pagas el <b>' + fechaCorta(ci.pago) + '</b> (' + ci.dias + ' días).' + (max - ci.dias >= 10 ? ' Si esperas al <b>' + fechaCorta(ci.mejor) + '</b>, tendrías <b>' + max + ' días</b>.' : '') + '</div></div>'; }
    h += '<div class="fl">A meses sin intereses</div><div class="card" style="padding:4px 16px">' + [3, 6, 12].map(n => '<div class="qrow"><span>' + n + ' meses</span><b class="num">' + money(monto / n, true) + ' al mes <span class="muted">(' + Math.round(monto / n / Math.max(1, presQ * 2) * 100) + '% de tu presupuesto)</span></b></div>').join('') + '</div>';
  }
  h += '<div class="actbar"><button class="btn ghost" onclick="cerrarHoja()">Cerrar</button><button class="btn" onclick="const m=parseMonto(FORM.monto),c=FORM.cuenta;FORM=null;abrirRegistro({tipo:\'Gasto\',monto:m,cuenta:c})">Registrar compra</button></div>';
  return h;
}

/* ===================== Widget (APK) ===================== */
let widgetT = null;
function programarWidget() { if (!NATIVO || !DATA) return; clearTimeout(widgetT); widgetT = setTimeout(enviarWidget, 800); }
function enviarWidget() {
  if (!NATIVO || !DATA) return;
  if (!fx('widget')) return nativo('Finanzas', 'actualizarWidget', { etiqueta: 'Finanzas', monto: '', sub: 'Toca para abrir', sub2: '' });
  const rq = rangoQuincena(hoy()), pres = resumenMes(hoy().slice(0, 7)).presupuesto / 2, queda = r2(pres - gastoNeto(rq.desde, rq.hasta)), oculto = LS.get('fin_widget_discreto', false);
  const g = DATA.cuentas.find(c => c.nombre === cuentaGastos()), ci = g && cicloTarjeta(g, hoy()), ps = g && pagoSinIntereses(g);
  nativo('Finanzas', 'actualizarWidget', {
    etiqueta: queda >= 0 ? 'Te quedan esta quincena' : 'Te pasaste esta quincena',
    monto: oculto ? '$ ••••' : money(Math.abs(queda), true), rojo: queda < 0,
    sub: ci ? g.nombre + ': compra hoy, pagas el ' + fechaCorta(ci.pago) + ' (' + ci.dias + ' días)' : '',
    sub2: ps && ps.falta > 0.5 ? 'Paga ' + (oculto ? '••••' : money(ps.falta, true)) + ' antes del ' + fechaCorta(ps.limite) : (racha() ? '🔥 ' + racha() + ' días registrando' : ''),
    favs: JSON.stringify(favoritosWidget()),
    registradoHoy: DATA.movs.some(m => m.fecha === hoy()) || LS.get('fin_singasto', []).indexOf(hoy()) >= 0 });
}

/* ===================== Gastos detectados en notificaciones (APK) ===================== */
let LECTOR_ACTIVO = false;
async function revisarLector() {
  if (!NATIVO || !fx('lector')) return;
  const a = await nativo('Finanzas', 'lectorActivo');
  LECTOR_ACTIVO = !!(a && a.activo);
  const d = await nativo('Finanzas', 'detectados');
  if (!d || !d.lista || !d.lista.length) return;
  // Los que confirmaste con "Registrar" en la notificación se guardan solos; los demás quedan en Inicio para revisar
  let solos = 0;
  d.lista.filter(x => x.confirmado).forEach(x => { const n = leerNotificacion(x); if (n && registrarDetectadoSolo(n)) solos++; else if (n) agregarDetectados([x]); });
  agregarDetectados(d.lista.filter(x => !x.confirmado));
  if (DATA) pintar();
  if (solos) toast('Registré ' + solos + (solos === 1 ? ' compra' : ' compras') + ' que confirmaste en la notificación');
}
// Al abrir o volver a la app: la acción que pidió el widget (+ o Ticket) y los gastos detectados
async function revisarNativo() {
  if (!NATIVO || !DATA) return;
  const a = await nativo('Finanzas', 'accionPendiente');
  const ac = a && a.accion;
  // "Editar" en la notificación de una compra: primero se traen las compras detectadas y luego se abre esa en el formulario
  if (ac && /^detectado/.test(ac)) {
    await revisarLector();
    const id = ac.split(':').slice(1).join(':'), d = LS.get('fin_detectados', []).find(x => x.id === id);
    if (d) registrarDetectado(id); else if (TAB !== 'Inicio') irA('Inicio');
    if (!revisarNativo.listo) { revisarNativo.listo = true; aplicarNotifNativas(); }
    return revisarRapidos();
  }
  if (ac === 'gasto') abrirRegistro({});
  else if (ac === 'ticket') abrirHojaTicket();
  else if (ac === 'dictar') { if (TAB !== 'Inicio') irA('Inicio'); dictar('barra'); }
  else if (ac && /^plantilla:\d+$/.test(ac)) { const f = favoritos()[+ac.split(':')[1]]; if (f) abrirRegistro({ tipo: 'Gasto', desc: f.desc, categoria: f.cat, cuenta: f.cuenta, monto: f.monto || '' }); }
  if (!revisarNativo.listo) { revisarNativo.listo = true; aplicarNotifNativas(); }
  await revisarLector();
  await revisarRapidos();
}
const APPS_BANCO = { 'com.bancomer.mbanking': 'BBVA', 'com.bbva.bbvacontigo': 'BBVA', 'com.bbva.mx.bancomermovil': 'BBVA', 'com.revolut.revolut': 'Revolut', 'com.mercadopago.wallet': 'Mercado Pago', 'com.nu.production': 'Nu' };
function leerNotificacion(n) {
  const t = String(n.texto || ''), s = sinAcentos(t);
  if (/rechaz|declin|no se pudo|no fue posible|intento|codigo|clave|token|inicio de sesion|seguridad/.test(s)) return null;
  const mm = t.match(/(?:\$|MXN|€|EUR|USD)\s?([\d.,]+\d)|([\d.,]+\d)\s?(?:MXN|€|EUR|USD|pesos)/i);
  const monto = mm ? numeroFlexible(mm[1] || mm[2]) : null;
  if (!monto || monto <= 0) return null;
  const banco = APPS_BANCO[n.app] || 'Banco', entra = /recibiste|te depositaron|deposito|abono|transferencia recibida|reembolso|devolucion|te enviaron|received|refund/.test(s);
  const mc = t.match(/\b(?:en|at|a)\s+([A-Z0-9][^,.\n$]{1,40}?)(?=\s+(?:con|por|el|desde|de tu|with|on)\b|[,.\n]|$)/);
  const comercio = mc ? titular(mc[1]).slice(0, 40) : '';
  const busca = re => activas().find(c => re.test(sinAcentos(c.nombre)));
  let cuenta = null;
  if (banco === 'BBVA') cuenta = /debito/.test(s) ? (busca(/bbva/) && activas().find(c => /bbva/i.test(c.nombre) && c.tipo === 'Débito')) : (/credito|oro/.test(s) ? DATA.cuentas.find(c => c.nombre === cuentaGastos()) : null);
  else if (banco === 'Revolut') cuenta = /credit/.test(s) ? activas().find(c => /revolut/i.test(c.nombre) && c.tipo === 'Crédito') : activas().find(c => /revolut/i.test(c.nombre) && !esDeuda(c));
  else if (banco === 'Mercado Pago') cuenta = /credito/.test(s) ? activas().find(c => /mercado/i.test(c.nombre) && c.tipo === 'Crédito') : activas().find(c => /mercado/i.test(c.nombre) && c.tipo === 'Débito');
  else if (banco === 'Nu') cuenta = busca(/\bnu\b/);
  const otraMoneda = /€|EUR|USD/.test(t) && !/MXN|\$/.test(t);
  return { id: n.id, banco, texto: t, cuando: n.cuando, monto: r2(monto), comercio, tipo: /devolucion|reembolso|refund/.test(s) ? 'Reembolso' : entra ? 'Ingreso' : 'Gasto', cuenta: cuenta ? cuenta.nombre : null, otraMoneda };
}
function agregarDetectados(lista) {
  const actual = LS.get('fin_detectados', []), ids = new Set(actual.map(x => x.id));
  lista.map(leerNotificacion).filter(x => x && !ids.has(x.id)).forEach(x => actual.push(x));
  LS.set('fin_detectados', actual.slice(-40));
}
function tarjetaDetectados() {
  if (!fx('lector')) return '';
  const ds = LS.get('fin_detectados', []);
  if (!ds.length) return '';
  return '<h2>Detecté en tus notificaciones<button class="more" onclick="LS.set(\'fin_detectados\',[]);pintar()">Descartar todo</button></h2><div class="list" style="margin-bottom:12px">' + ds.slice().reverse().slice(0, 4).map(d =>
    '<div class="mv"><span class="ic" aria-hidden="true">🔔</span><span class="tx"><div class="d1">' + esc(d.comercio || d.banco) + '</div><div class="d2">' + esc(d.banco) + ' · ' + haceCuanto(d.cuando) + (d.otraMoneda ? ' · otra moneda' : '') + '</div></span>' +
    '<span class="m num' + (d.tipo === 'Gasto' ? '' : ' in') + '">' + (d.monto > 0 ? (d.tipo === 'Gasto' ? '−' : '+') + money(d.monto) : '¿?') + '</span></div>' +
    '<div class="det-acc"><button class="btn sm" onclick="registrarDetectado(\'' + jsq(d.id) + '\')">Registrar</button><button class="btn sm ghost" onclick="descartarDetectado(\'' + jsq(d.id) + '\')">No es gasto</button></div>').join('') + '</div>' +
    (ds.length > 4 ? '<p class="hint" style="margin-top:-6px">Y ' + (ds.length - 4) + ' más.</p>' : '');
}
function registrarDetectado(id) {
  const d = LS.get('fin_detectados', []).find(x => x.id === id); if (!d) return;
  if (d.linea) { const e = entenderLinea(d.linea, claveDia(new Date(d.cuando))) || {}; return abrirRegistro({ tipo: e.tipo || 'Gasto', monto: e.monto || '', desc: e.desc || d.linea, categoria: e.categoria, cuenta: e.cuenta, aCuenta: e.aCuenta, persona: e.persona, fecha: e.fecha, detectado: id }); }
  abrirRegistro({ tipo: d.tipo, monto: d.monto, desc: d.comercio, cuenta: d.cuenta, categoria: adivinarCategoria(d.comercio, d.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto'), fecha: claveDia(new Date(d.cuando)), detectado: id, leido: true });
}
function descartarDetectado(id) { LS.set('fin_detectados', LS.get('fin_detectados', []).filter(x => x.id !== id)); vibrar(8); pintar(); }
function quitarDetectado(id) { if (id) LS.set('fin_detectados', LS.get('fin_detectados', []).filter(x => x.id !== id)); }
