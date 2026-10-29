/* Tema elegido en Ajustes, antes de pintar para que no parpadee (archivo aparte: la CSP no deja scripts en línea) */
try { var t = JSON.parse(localStorage.getItem('fin_tema')); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
