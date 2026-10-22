package com.martinrtx.finanzas;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Toast;
import androidx.core.app.RemoteInput;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

// Recibe lo que tocas en las notificaciones y en el widget de atajos, sin abrir la app.
// Todo se guarda en la cola "rapidos" del celular; la app la sube a tu hoja la siguiente vez que se abre.
public class AccionesReceiver extends BroadcastReceiver {
    static final String RESPUESTA = "finanzas.RESPUESTA", NO_GASTE = "finanzas.NO_GASTE", CONFIRMAR = "finanzas.CONFIRMAR",
        DESCARTAR = "finanzas.DESCARTAR", FAVORITO = "finanzas.FAVORITO", RECORDATORIO = "finanzas.RECORDATORIO";
    static final String RAPIDOS = "rapidos";

    static String hoy() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    static void agregarRapido(Context c, String texto, String origen) {
        try {
            SharedPreferences p = FinanzasPlugin.prefs(c);
            JSONArray cola = new JSONArray(p.getString(RAPIDOS, "[]"));
            JSONObject o = new JSONObject();
            long ahora = System.currentTimeMillis();
            o.put("id", origen + ":" + ahora);
            o.put("texto", texto);
            o.put("origen", origen);
            o.put("cuando", ahora);
            cola.put(o);
            while (cola.length() > 100) cola.remove(0);
            p.edit().putString(RAPIDOS, cola.toString()).apply();
        } catch (Exception ignorado) { }
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (a == null) return;
        SharedPreferences p = FinanzasPlugin.prefs(c);
        String dato = intent.getStringExtra("dato");
        switch (a) {
            case RECORDATORIO:
                if (!hoy().equals(p.getString("ultimo_dia", ""))) Notificaciones.mostrarRecordatorio(c);
                break;
            case RESPUESTA: {
                Bundle r = RemoteInput.getResultsFromIntent(intent);
                CharSequence t = r == null ? null : r.getCharSequence(Notificaciones.TEXTO);
                if (t == null || t.toString().trim().isEmpty()) break;
                agregarRapido(c, t.toString().trim(), dato == null ? "rapida" : dato);
                p.edit().putString("ultimo_dia", hoy()).apply();
                // Android espera que la notificación se actualice después de una respuesta
                if ("rapida".equals(dato)) Notificaciones.mostrarRapida(c, "Anotado: " + t + " ✓  (se sube al abrir Finanzas)");
                else Notificaciones.cancelar(c, Notificaciones.ID_RECORDATORIO);
                break;
            }
            case NO_GASTE:
                agregarRapido(c, "__nada__", "recordatorio");
                p.edit().putString("ultimo_dia", hoy()).apply();
                Notificaciones.cancelar(c, Notificaciones.ID_RECORDATORIO);
                Toast.makeText(c, "Anotado: hoy sin gastos", Toast.LENGTH_SHORT).show();
                break;
            case CONFIRMAR:
            case DESCARTAR:
                if (dato == null) break;
                marcarDetectado(c, dato, CONFIRMAR.equals(a));
                Notificaciones.cancelar(c, Notificaciones.idDetectado(dato));
                if (CONFIRMAR.equals(a)) Toast.makeText(c, "Listo: se registra al abrir Finanzas", Toast.LENGTH_SHORT).show();
                break;
            case FAVORITO:
                try {
                    JSONObject f = new JSONArray(p.getString("w_favs", "[]")).getJSONObject(Integer.parseInt(dato));
                    agregarRapido(c, f.getString("t"), "favorito");
                    p.edit().putString("ultimo_dia", hoy()).apply();
                    Toast.makeText(c, "Anotado: " + f.optString("l"), Toast.LENGTH_SHORT).show();
                } catch (Exception ignorado) { }
                break;
            default:
        }
    }

    // Confirmar deja la compra detectada marcada para que la app la registre sola; descartar la quita.
    private static void marcarDetectado(Context c, String id, boolean confirmar) {
        try {
            SharedPreferences p = FinanzasPlugin.prefs(c);
            JSONArray cola = new JSONArray(p.getString(LectorNotificaciones.COLA, "[]")), nueva = new JSONArray();
            boolean visto = false;
            for (int i = 0; i < cola.length(); i++) {
                JSONObject o = cola.getJSONObject(i);
                if (id.equals(o.optString("id"))) { visto = true; if (confirmar) { o.put("confirmado", true); nueva.put(o); } }
                else nueva.put(o);
            }
            p.edit().putString(LectorNotificaciones.COLA, nueva.toString()).apply();
            // Si la app ya la había leído, se avisa por la otra cola
            if (!visto) agregarRapido(c, (confirmar ? "__confirmar__:" : "__descartar__:") + id, "detectado");
        } catch (Exception ignorado) { }
    }
}
