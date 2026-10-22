/* Finanzas v7 – registrar en segundos: una línea ("230 oxxo"), dictado, favoritos de un toque y lo que anotas
 * desde las notificaciones o el widget de atajos (el APK lo guarda en el celular y aquí se sube).
 * Se carga después de app.js y extras.js.
 */

/* ===================== Entender una línea: "230 oxxo", "650 gasolina débito ayer", "1200 amazon 6 msi" ===================== */
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const RELLENO = /^(en|de|del|con|por|para|la|el|los|las|le|les|lo|un|una|al|a|y|gaste|gasté|pague|pagué|compre|compré|fue|fueron|me|mi|mis|pesos?|varos|baros|mxn|hoy|ayer|antier|anteayer|tarjeta|cuenta|ponle|registra|anota)$/i;
// Palabras que apuntan a una categoría aunque no digas el comercio
const PISTAS_CAT = [
  [/\b(gas|gasolina|gasolinera|diesel|magna|premium)\b/, 'Gasolina'],
  [/\b(comida|antojo|antojos|tacos?|cafe|desayuno|comida|cena|almuerzo|lonche|snack|botana|refresco|helado|pizza|hamburguesa|sushi|torta|burritos?)\b/, 'Comida y antojos'],
  [/\b(super|supermercado|despensa|mandado|casa|luz|agua|internet|renta|recarga)\b/, 'Familia y casa'],
  [/\b(salida|salidas|bar|antro|cine|fiesta|peda|chelas?|cervezas?|boliche|concierto)\b/, 'Salidas'],
  [/\b(carro|coche|auto|taller|llantas?|aceite|lavado|estacionamiento|caseta)\b/, 'Carro'],
  [/\b(farmacia|doctor|medico|medicina|dentista|consulta|corte|barberia|gimnasio|gym)\b/, 'Salud y cuidado personal'],
  [/\b(suscripcion|netflix|spotify|disney|seguro|icloud|youtube|celular|plan)\b/, 'Suscripciones y seguros'],
  [/\b(ropa|tenis|zapatos|regalo|amazon|mercado libre|juego|videojuego|gadget|audifonos)\b/, 'Gustos y compras'],
  [/\b(uber|didi|taxi|avion|vuelo|hotel|camion|viaje|airbnb)\b/, 'Viajes'],
];
// Cuál de tus cuentas mencionaste: "débito", "efectivo", "oro", "revolut"…
function cuentaMencionada(s, tipo) {
  const genericas = /^(cuenta|tarjeta|credito|debito|premium|grey|gris)$/;
  let mejor = null, puntos = 0;
  cuentasPara(tipo === 'Traspaso' ? 'Gasto' : tipo).concat(tipo === 'Traspaso' ? activas().filter(esDeuda) : []).forEach(c => {
    const palabras = sinAcentos(c.nombre).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !genericas.test(w));
    let p = palabras.filter(w => new RegExp('\\b' + w + '\\b').test(s)).length * 2;
    if (!p) return;
    if (/\bdebito\b/.test(s) && c.tipo === 'Débito') p += 1;
    if (/\b(credito|tarjeta de credito)\b/.test(s) && c.tipo === 'Crédito') p += 1;
    if (p > puntos) { puntos = p; mejor = c; }
  });
  if (!mejor && /\b(efectivo|cash|en mano)\b/.test(s)) mejor = activas().find(c => c.tipo === 'Efectivo');
  if (!mejor && /\bdebito\b/.test(s)) mejor = activas().find(c => c.tipo === 'Débito');
  return mejor;
}
function entenderLinea(texto, base) {
  base = base || hoy();
  const original = String(texto || '').trim();
  let s = ' ' + sinAcentos(original).replace(/\$/g, ' ').replace(/(\d),(\d{3})\b/g, '$1$2') + ' ';
  if (!original) return null;
  // "2 mil", "mil 500", "230 con 50"
  s = s.replace(/(\d+(?:\.\d+)?)\s*mil\s+(\d{1,3})\b/g, (_, a, b) => ' ' + (parseFloat(a) * 1000 + +b) + ' ').replace(/(\d+(?:\.\d+)?)\s*mil\b/g, (_, a) => ' ' + parseFloat(a) * 1000 + ' ')
       .replace(/\bmil\s+(\d{1,3})\b/g, (_, b) => ' ' + (1000 + +b) + ' ').replace(/\bmil\b/g, ' 1000 ').replace(/\b(\d+)\s+con\s+(\d{1,2})\b/g, '$1.$2');
  let resto = s;
  const quitar = re => { resto = resto.replace(re, ' '); };
  // Meses sin intereses
  let meses = null;
  const mm = s.match(/\b(\d{1,2})\s*(msi|meses sin intereses|meses)\b/);
  if (mm) { meses = +mm[1]; quitar(mm[0]); }
  // Fecha
  let fecha = base;
  const ff = resto.match(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/);
  if (/\b(antier|anteayer|antes de ayer)\b/.test(resto)) { fecha = sumarDias(base, -2); quitar(/\b(antier|anteayer|antes de ayer)\b/); }
  else if (/\bayer\b/.test(resto)) { fecha = sumarDias(base, -1); quitar(/\bayer\b/); }
  else if (ff && fechaFlexible(ff[0] + (ff[0].split(/[\/.-]/).length < 3 ? '/' + base.slice(0, 4) : ''))) { fecha = fechaFlexible(ff[0] + (ff[0].split(/[\/.-]/).length < 3 ? '/' + base.slice(0, 4) : '')); quitar(ff[0]); }
  else {
    const dw = DIAS_SEMANA.findIndex(d => new RegExp('\\b(el )?' + d + '\\b').test(resto));
    if (dw >= 0) { const hoyD = new Date(base + 'T12:00:00').getDay(); fecha = sumarDias(base, -(((hoyD - dw) + 7) % 7 || 7)); quitar(new RegExp('\\b(el )?' + DIAS_SEMANA[dw] + '\\b')); }
  }
  if (fecha > hoy()) fecha = hoy();
  // Monto: el primer número que no sea parte de la fecha ni de los meses
  const nm = resto.match(/\b\d+(?:\.\d{1,2})?\b/);
  const monto = nm ? r2(parseFloat(nm[0])) : null;
  if (nm) quitar(new RegExp('\\b' + nm[0].replace('.', '\\.') + '\\b'));
  // Tipo
  const persona = personasActivas().find(p => new RegExp('\\b' + sinAcentos(p.nombre) + '\\b').test(s));
  let tipo = 'Gasto';
  if (persona && /\b(preste|prestamo|le di prestado)\b/.test(s)) tipo = 'Presté';
  else if (persona && /\b(me pago|me pagaron|me devolvio|me regreso)\b/.test(s)) tipo = 'Me pagaron';
  else if (persona && /\b(me presto|me prestaron)\b/.test(s)) tipo = 'Me prestaron';
  else if (persona && /\b(le pague|le pagué)\b/.test(s)) tipo = 'Le pagué';
  else if (/\b(me devolvieron|reembolso|me reembolsaron)\b/.test(s)) tipo = 'Reembolso';
  else if (/\b(ingreso|quincena|nomina|sueldo|me pagaron|me depositaron|cobre|recibi|me cayo)\b/.test(s)) tipo = 'Ingreso';
  else if (/\b(pague|pago|abone|abono)\b.*\b(tarjeta|oro|credito|prestamo|revolut premium|mercado pago credito)\b/.test(s) && !/\b(con|en)\s+(la\s+)?(tarjeta|oro|credito)\b/.test(s)) tipo = 'Traspaso';
  if (persona) quitar(new RegExp('\\b' + sinAcentos(persona.nombre) + '\\b'));
  quitar(/\b(preste|prestamo|le di prestado|me pago|me pagaron|me devolvio|me regreso|me presto|me prestaron|le pague|me devolvieron|reembolso|me reembolsaron|ingreso|me depositaron|cobre|recibi|me cayo|abone|abono)\b/g);
  // Cuenta
  const c = cuentaMencionada(s, tipo);
  let cuenta = null, aCuenta = null;
  if (tipo === 'Traspaso') {
    aCuenta = c && esDeuda(c) ? c.nombre : cuentaGastos();
    const deb = DATA.cuentas.find(x => x.nombre === aCuenta);
    cuenta = (deb && deb.domiciliado) || cuentaPorDefecto('Traspaso') || (activas().find(x => x.tipo === 'Débito') || {}).nombre;
  } else cuenta = c && cuentasPara(tipo).some(x => x.nombre === c.nombre) ? c.nombre : cuentaPorDefecto(tipo);
  if (c) sinAcentos(c.nombre).split(/[^a-z0-9]+/).filter(w => w.length >= 2).forEach(w => quitar(new RegExp('\\b' + w + '\\b', 'g')));
  quitar(/\b(debito|credito|efectivo|cash|tarjeta|oro)\b/g);
  // Descripción: lo que queda, sin palabras de relleno en las orillas
  let palabras = resto.trim().split(/\s+/).filter(Boolean);
  while (palabras.length && RELLENO.test(palabras[0])) palabras.shift();
  while (palabras.length && RELLENO.test(palabras[palabras.length - 1])) palabras.pop();
  // Recupera mayúsculas y acentos del texto original cuando se puede
  const origPal = original.split(/\s+/);
  let desc = palabras.map(w => origPal.find(o => sinAcentos(o).replace(/[^a-z0-9]/g, '') === w) || w).join(' ');
  desc = titular(desc).slice(0, 60);
  // Categoría
  let categoria = null;
  if (tipo === 'Gasto' || tipo === 'Reembolso') {
    const cats = catsGasto().map(x => x.nombre);
    categoria = cats.find(n => s.includes(' ' + sinAcentos(n) + ' ')) || null;
    if (!categoria) { const p = PISTAS_CAT.find(x => x[0].test(s)); if (p && cats.indexOf(p[1]) >= 0) categoria = p[1]; }
    if (!categoria || categoria === 'Otros') categoria = adivinarCategoria(desc || original, 'Gasto') || categoria;
  } else if (tipo === 'Ingreso') categoria = adivinarCategoria(desc || original, 'Ingreso');
  if (!desc && categoria) desc = '';
  const cuentaObj = DATA.cuentas.find(x => x.nombre === cuenta);
  return { tipo, monto, fecha, cuenta, aCuenta, categoria, desc, persona: persona ? persona.nombre : null,
           meses: meses && tipo === 'Gasto' && cuentaObj && cuentaObj.tipo === 'Crédito' ? meses : null,
           ok: monto > 0 && !!cuenta && (tipo === 'Traspaso' ? !!aCuenta && aCuenta !== cuenta : esPersonaTipo(tipo) ? !!persona : !!categoria) };
}
function movDeLinea(e, extra) {
  return Object.assign({ id: uid(), fecha: e.fecha, tipo: e.tipo, monto: e.monto, cuenta: e.cuenta, aCuenta: e.tipo === 'Traspaso' ? e.aCuenta : '',
    categoria: e.tipo === 'Traspaso' || esPersonaTipo(e.tipo) ? '' : e.categoria, desc: e.desc || '', registrado: Date.now(),
    persona: esPersonaTipo(e.tipo) ? e.persona : '', fijo: '', meses: e.meses || null, ticket: '' }, extra || {});
}
function resumenLinea(e) {
  if (!e) return '';
  const partes = [e.tipo === 'Traspaso' ? 'Pago a ' + e.aCuenta : e.tipo, e.monto > 0 ? money(e.monto) : '¿cuánto?'];
  if (e.categoria) partes.push(emo(ICONO[e.categoria]).replace(/<[^>]+>/g, '').trim() + ' ' + e.categoria);
  if (e.persona) partes.push(e.persona);
  if (e.desc) partes.push('"' + e.desc + '"');
  partes.push(e.tipo === 'Traspaso' ? 'desde ' + e.cuenta : e.cuenta);
  if (e.meses) partes.push(e.meses + ' MSI');
  partes.push(e.fecha === hoy() ? 'hoy' : e.fecha === sumarDias(hoy(), -1) ? 'ayer' : fechaCorta(e.fecha));
  return partes.join(' · ');
}

/* ===================== Barra rápida de Inicio ===================== */
let RAPIDO_TXT = '';
function barraRapida() {
  const e = RAPIDO_TXT.trim() ? entenderLinea(RAPIDO_TXT) : null;
  return '<div class="rapido-bar"><label class="sr" for="rapido">Registrar en una línea</label>' +
    '<input id="rapido" class="inp" placeholder="Escribe o dicta: 230 oxxo" enterkeyhint="send" autocomplete="off" value="' + esc(RAPIDO_TXT) + '" oninput="RAPIDO_TXT=this.value;previewRapido()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();enviarRapido()}">' +
    '<button class="iconbtn" onclick="dictar(\'barra\')" aria-label="Dictar un gasto">' + ICON_MIC + '</button>' +
    '<button class="iconbtn enviar" onclick="enviarRapido()" aria-label="Guardar">' + ICON_ENVIAR + '</button></div>' +
    '<div id="rapidoPrev" class="rapido-prev" aria-live="polite">' + htmlPreview(e) + '</div>' + htmlFavoritos();
}
const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const ICON_ENVIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
function htmlPreview(e) {
  if (!e) return '<span class="muted">Ej. "650 gasolina", "120 tacos débito ayer", "1200 amazon 6 msi", "le presté 500 a Aaron"</span>';
  return '<button class="prev ' + (e.ok ? 'ok' : '') + '" onclick="editarRapido()">' + esc(resumenLinea(e)) + '<span class="muted"> · ' + (e.ok ? 'Enter para guardar, toca para cambiar' : 'toca para completar') + '</span></button>';
}
function previewRapido() { const p = $('rapidoPrev'); if (p) p.innerHTML = htmlPreview(RAPIDO_TXT.trim() ? entenderLinea(RAPIDO_TXT) : null); }
function editarRapido() {
  const e = entenderLinea(RAPIDO_TXT); if (!e) return;
  RAPIDO_TXT = '';
  abrirRegistro({ tipo: e.tipo, monto: e.monto || '', desc: e.desc, categoria: e.categoria, cuenta: e.cuenta, aCuenta: e.aCuenta, persona: e.persona, fecha: e.fecha });
  if (e.meses) { FORM.msi = true; FORM.meses = e.meses; pintarHoja(); }
}
function enviarRapido() {
  const e = RAPIDO_TXT.trim() ? entenderLinea(RAPIDO_TXT) : null;
  if (!e) { const i = $('rapido'); if (i) i.focus(); return; }
  if (!e.ok) return editarRapido();
  const m = movDeLinea(e);
  encolar('guardarMov', [m]);
  LS.set('fin_ult_cuenta_' + m.tipo, m.cuenta);
  RAPIDO_TXT = ''; vibrar(15); pintar();
  toast((m.tipo === 'Gasto' ? 'Gasto' : m.tipo) + ' ' + money(m.monto) + (m.categoria ? ' · ' + m.categoria : '') + ' guardado', { txt: 'Deshacer', fn: () => encolar('borrarMov', [m.id]) });
}

/* ===================== Favoritos: tus gastos frecuentes en un toque ===================== */
function favoritos() {
  const desde = sumarDias(hoy(), -120), g = {};
  DATA.movs.filter(m => m.tipo === 'Gasto' && m.fecha >= desde && (m.desc || '').trim() && !m.fijo).forEach(m => {
    const k = normalizarDesc(m.desc) + '|' + m.categoria;
    const x = g[k] || (g[k] = { desc: m.desc.trim(), cat: m.categoria, cuentas: {}, montos: {}, n: 0 });
    x.n++; x.cuentas[m.cuenta] = (x.cuentas[m.cuenta] || 0) + 1; x.montos[m.monto] = (x.montos[m.monto] || 0) + 1;
  });
  const top = o => Object.keys(o).sort((a, b) => o[b] - o[a])[0];
  return Object.values(g).filter(x => x.n >= 2).map(x => {
    const mt = top(x.montos), cuenta = top(x.cuentas);
    return { desc: x.desc, cat: x.cat, cuenta: activas().some(c => c.nombre === cuenta) ? cuenta : cuentaPorDefecto('Gasto'), monto: x.montos[mt] >= Math.max(2, x.n * .6) ? +mt : null, n: x.n };
  }).sort((a, b) => b.n - a.n).slice(0, 8);
}
const etiquetaFav = f => (emo(ICONO[f.cat]).replace(/<[^>]+>/g, '').trim() + ' ' + f.desc).trim() + (f.monto ? ' ' + money(f.monto, f.monto % 1 === 0) : '');
function htmlFavoritos() {
  const fs = favoritos();
  if (!fs.length) return '';
  return '<div class="favs" role="group" aria-label="Tus gastos frecuentes">' + fs.map((f, i) => '<button onclick="usarFavorito(' + i + ')">' + esc(etiquetaFav(f)) + (f.monto ? '' : ' <span class="muted">…</span>') + '</button>').join('') + '</div>';
}
// Con monto fijo se guarda al instante (con Deshacer); si cambia cada vez, abre el registro con todo lo demás puesto
function usarFavorito(i, fav) {
  const f = fav || favoritos()[i]; if (!f) return;
  if (!f.monto) return abrirRegistro({ tipo: 'Gasto', desc: f.desc, categoria: f.cat, cuenta: f.cuenta });
  const m = movDeLinea({ tipo: 'Gasto', monto: f.monto, fecha: hoy(), cuenta: f.cuenta, categoria: f.cat, desc: f.desc });
  encolar('guardarMov', [m]); vibrar(15);
  toast(f.desc + ' ' + money(f.monto) + ' guardado', { txt: 'Deshacer', fn: () => encolar('borrarMov', [m.id]) });
}
// En el formulario: llena descripción, categoría, cuenta y (si es fijo) el monto, y deja todo editable
function aplicarFavorito(i) {
  const f = favoritos()[i]; if (!f || !FORM) return;
  FORM.desc = f.desc; FORM.categoria = f.cat; FORM.cuenta = f.cuenta; if (f.monto) FORM.monto = String(f.monto);
  FORM.err = ''; vibrar(8); pintarHoja();
  setTimeout(() => { const m = $('fMonto'); if (m && !f.monto) m.focus(); }, 50);
}
function favoritosWidget() {
  return favoritos().slice(0, 4).map(f => f.monto ? { l: etiquetaFav(f), t: '__fav__:' + JSON.stringify({ d: f.desc, c: f.cat, cu: f.cuenta, m: f.monto }) } : { l: etiquetaFav(f) + '…' });
}

/* ===================== Dictado ===================== */
let ESCUCHANDO = false;
async function dictar(destino) {
  if (ESCUCHANDO) return;
  let texto = null;
  ESCUCHANDO = true; document.body.classList.add('escuchando');
  try {
    if (NATIVO) {
      await window.Capacitor.nativePromise('SpeechRecognition', 'requestPermissions', {});
      const r = await window.Capacitor.nativePromise('SpeechRecognition', 'start', { language: 'es-MX', maxResults: 1, partialResults: false, popup: true });
      texto = r && r.matches && r.matches[0];
    } else {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { toast('Tu navegador no deja dictar; usa Chrome o la app de Android'); return; }
      toast('Te escucho…');
      texto = await new Promise((ok, mal) => {
        const rec = new SR(); let dado = null;
        rec.lang = 'es-MX'; rec.interimResults = false; rec.maxAlternatives = 1;
        rec.onresult = ev => { dado = ev.results[0][0].transcript; };
        rec.onerror = ev => mal(new Error(ev.error));
        rec.onend = () => ok(dado);
        rec.start();
      });
    }
  } catch (e) { toast(/not-allowed|denied|permission/i.test(String(e && e.message)) ? 'Dale permiso de micrófono a Finanzas' : 'No te escuché, intenta otra vez'); }
  finally { ESCUCHANDO = false; document.body.classList.remove('escuchando'); }
  if (!texto) return;
  if (destino === 'form' && FORM && FORM.vista === 'mov') {
    const e = entenderLinea(texto);
    if (!e) return;
    ['tipo', 'cuenta', 'aCuenta', 'categoria', 'persona', 'fecha'].forEach(k => { if (e[k]) FORM[k] = e[k]; });
    if (e.monto) FORM.monto = String(e.monto);
    if (e.desc) FORM.desc = e.desc;
    if (e.meses) { FORM.msi = true; FORM.meses = e.meses; }
    FORM.err = ''; pintarHoja(); vibrar(12);
    toast('Escuché: "' + texto + '"');
  } else {
    RAPIDO_TXT = texto;
    if (TAB !== 'Inicio') irA('Inicio'); else pintar();
    toast('Escuché: "' + texto + '". Revisa y toca guardar');
  }
}

/* ===================== Lo que anotaste fuera de la app (notificaciones y widget de atajos) ===================== */
async function revisarRapidos() {
  if (!NATIVO || !DATA) return;
  const r = await nativo('Finanzas', 'rapidos'), lista = (r && r.lista) || [];
  if (!lista.length) return;
  let hechos = 0, revisar = 0;
  const det = LS.get('fin_detectados', []);
  lista.forEach(x => {
    const t = String(x.texto || ''), base = claveDia(new Date(x.cuando || Date.now()));
    if (t === '__nada__') { const l = LS.get('fin_singasto', []); if (l.indexOf(base) < 0) l.push(base); LS.set('fin_singasto', l.slice(-120)); return; }
    if (/^__descartar__:/.test(t)) { descartarDetectadoSilencioso(t.slice(13)); return; }
    if (/^__confirmar__:/.test(t)) { const d = det.find(y => y.id === t.slice(13)); if (d && registrarDetectadoSolo(d)) hechos++; return; }
    if (/^__fav__:/.test(t)) {
      try { const f = JSON.parse(t.slice(8)); encolar('guardarMov', [movDeLinea({ tipo: 'Gasto', monto: f.m, fecha: base, cuenta: f.cu, categoria: f.c, desc: f.d })], true); hechos++; } catch (e) { /* favorito viejo */ }
      return;
    }
    const e = entenderLinea(t, base);
    if (e && e.ok) { encolar('guardarMov', [movDeLinea(e, { registrado: x.cuando || Date.now() })], true); hechos++; }
    else { det.push({ id: x.id, banco: 'Anotado', texto: t, cuando: x.cuando, monto: e && e.monto || 0, comercio: t, tipo: e ? e.tipo : 'Gasto', cuenta: e ? e.cuenta : null, linea: t }); revisar++; }
  });
  LS.set('fin_detectados', det.slice(-40));
  pintar();
  if (hechos || revisar) toast((hechos ? 'Registré ' + hechos + (hechos === 1 ? ' gasto' : ' gastos') + ' que anotaste fuera de la app' : '') + (revisar ? (hechos ? '; ' : '') + revisar + ' para revisar en Inicio' : ''));
}
// Compras detectadas que confirmaste con "Registrar" en la notificación: se guardan solas
function registrarDetectadoSolo(d) {
  const tipo = d.tipo === 'Ingreso' || d.tipo === 'Reembolso' ? d.tipo : 'Gasto';
  const cuenta = d.cuenta && cuentasPara(tipo).some(c => c.nombre === d.cuenta) ? d.cuenta : cuentaPorDefecto(tipo);
  const categoria = adivinarCategoria(d.comercio, tipo === 'Ingreso' ? 'Ingreso' : 'Gasto');
  if (!(d.monto > 0) || !cuenta || !categoria || d.otraMoneda) return false;
  encolar('guardarMov', [movDeLinea({ tipo, monto: d.monto, fecha: claveDia(new Date(d.cuando)), cuenta, categoria, desc: d.comercio })], true);
  quitarDetectado(d.id);
  return true;
}
function descartarDetectadoSilencioso(id) { quitarDetectado(id); }

/* ===================== Notificaciones del APK (registro rápido, recordatorio con respuesta, compras detectadas) ===================== */
const notifCfg = () => Object.assign({ rapida: false, detectados: true }, LS.get('fin_notif', {}));
function aplicarNotifNativas() {
  if (!NATIVO) return;
  const n = notifCfg(), av = avisosCfg(), [hh, mi] = String(av.hora || '21:00').split(':').map(Number);
  nativo('Finanzas', 'configurar', { rapida: !!n.rapida, detectados: fx('lector') && n.detectados !== false, recordatorio: !!av.diario, hora: hh || 21, minuto: mi || 0 });
}
async function alternarNotif(k) {
  const n = notifCfg(); n[k] = !n[k];
  if (n[k]) {
    const p = await nativo('LocalNotifications', 'requestPermissions');
    if (!p || p.display !== 'granted') { n[k] = false; toast('Permite las notificaciones de Finanzas en los ajustes de Android'); }
  }
  LS.set('fin_notif', n); vibrar(8); aplicarNotifNativas(); pintarHoja();
}
function htmlNotificaciones() {
  if (!NATIVO) return '';
  const n = notifCfg(), sw = (on, fn, t, d) => '<button class="switch" role="switch" aria-checked="' + !!on + '" onclick="' + fn + '"><span><b>' + t + '</b><br><span class="muted">' + d + '</span></span><span class="knob" aria-hidden="true"></span></button>';
  return sw(n.rapida, "alternarNotif('rapida')", '✍️ Notificación para registrar', 'Queda fija en tu barra de notificaciones: tocas Escribir, pones "230 oxxo" y listo, sin abrir la app. También trae Ticket y Dictar.') +
    '<div class="card flat" style="margin-top:10px"><div class="t1">⚡ Más formas rápidas</div><ul class="ideas" style="margin-top:4px">' +
      '<li>Mantén presionado el ícono de Finanzas: <b>Gasto</b>, <b>Dictar</b> y <b>Ticket</b>.</li>' +
      '<li>Desliza dos veces hacia abajo, toca el lápiz del panel rápido y agrega <b>Registrar gasto</b>.</li></ul></div>' +
    (fx('lector') ? sw(n.detectados !== false, "alternarNotif('detectados')", '🔔 Preguntarme por cada compra', 'Cuando tu banco avise de una compra, te llega "¿Registrar $230 en OXXO?" con botones Registrar, Editar y No es gasto.') : '');
}
