# Finanzas – notas para Claude

App de finanzas personales de Martin: PWA en GitHub Pages (`main` → https://martinrtx.github.io/Finanzas/)
y APK de Android (Capacitor) que carga esa misma página. Los datos viven en una hoja de Google a través de Apps Script.

## Permiso para publicar (dado por Martin el 22 de octubre de 2026)

- Claude **puede fusionar a `main` por su cuenta** (crear el pull request y hacer merge) cuando las pruebas pasen.
  Fusionar a `main` publica la página y, si cambió `apk/` o el workflow, compila y publica el APK en Releases.
- Antes de fusionar: probar en el navegador (Playwright con `?demo=1`, tema claro y oscuro, sin errores en consola,
  y la prueba de inyección de nombres maliciosos). Si cambió `apk/` o `.github/workflows/apk.yml`, correr antes el
  workflow "APK Android" en la rama con `publicar: false` y confirmar que compila.
- Después de fusionar: esperar a que terminen "pages build and deployment" y, si aplica, "APK Android", y avisarle
  a Martin qué tiene que hacer (actualizar, reinstalar el APK o pegar un Apps Script nuevo).
- Nunca forzar push a `main` ni reescribir su historia.

## Lo que Martin hace a mano (no está en GitHub)

- **Apps Script**: `apps-script/Codigo.gs` es la copia de referencia. Él la pega en su proyecto de Apps Script, pone su
  clave en `CLAVE` y publica una versión nueva. **En el repo la clave siempre es `PON_AQUI_TU_CLAVE`** (el repo es público).
  Cuando cambie `Codigo.gs`, decirle exactamente qué pasos repetir (y si hay que ejecutar `autorizar`).
- **Instalar el APK** desde Releases. `Finanzas.apk` es la completa (lee notificaciones de bancos);
  `Finanzas-ligero.apk` no trae ese lector. Se firman con los secretos `KEYSTORE_B64` / `KEYSTORE_PASS` (ya existen:
  la llave del repo Gym), así que se instalan encima sin desinstalar.

## Estructura

- `index.html` (estilos y esqueleto), `app.js` (núcleo), `extras.js` (módulos v6), `rapido.js` (registro rápido v7).
- `sw.js`: al publicar cambios de la app, subir `VERSION` (y `VERSION_APP` en `app.js`) para que los celulares actualicen.
- `apk/`: cascarón Capacitor; `apk/native/java` (plugin, widgets, notificaciones, lector), `apk/res` (íconos y layouts),
  `apk/native/manifest-application.xml` (lo que se inserta en el manifiesto; el bloque `<!--LECTOR-->` se quita en la variante ligera).
- Comentarios, textos y nombres en español, con el mismo estilo del código que ya existe.
