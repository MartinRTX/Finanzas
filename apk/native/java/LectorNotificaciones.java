package com.martinrtx.finanzas;

import android.app.Notification;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

// Lee SOLO las notificaciones de tus apps de banco (BBVA, Revolut, Mercado Pago, Nu) que traen un monto,
// y las guarda en el celular para que la app te proponga registrarlas. No lee nada más ni manda nada a internet.
// Android pide que actives el permiso a mano: Ajustes > Notificaciones > Acceso a notificaciones > Finanzas.
public class LectorNotificaciones extends NotificationListenerService {
    static final String COLA = "detectados";
    static final Pattern MONTO = Pattern.compile("(\\$\\s?[\\d.,]+\\d|[\\d.,]+\\d\\s?(MXN|EUR|USD|€))");
    static final Pattern COMERCIO = Pattern.compile("\\b(?:en|at)\\s+([A-Z0-9][^,.\\n$]{1,40}?)(?=\\s+(?:con|por|el|with|on)\\b|[,.\\n]|$)");
    static final Set<String> BANCOS = new HashSet<>(Arrays.asList(
        "com.bancomer.mbanking", "com.bbva.bbvacontigo", "com.bbva.mx.bancomermovil",
        "com.revolut.revolut", "com.mercadopago.wallet", "com.nu.production"));

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || !BANCOS.contains(sbn.getPackageName())) return;
            Bundle x = sbn.getNotification().extras;
            if (x == null) return;
            String titulo = texto(x.getCharSequence(Notification.EXTRA_TITLE));
            CharSequence grande = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String cuerpo = texto(grande != null ? grande : x.getCharSequence(Notification.EXTRA_TEXT));
            String todo = (titulo + " " + cuerpo).trim();
            if (!todo.matches("(?s).*\\d.*") || !todo.matches("(?s).*(\\$|MXN|EUR|USD|€).*")) return;
            SharedPreferences p = FinanzasPlugin.prefs(this);
            JSONArray cola = new JSONArray(p.getString(COLA, "[]"));
            long ahora = System.currentTimeMillis();
            // Los bancos a veces repiten la misma notificación: se ignora si llegó igual hace menos de 2 minutos
            for (int i = 0; i < cola.length(); i++) {
                JSONObject o = cola.getJSONObject(i);
                if (todo.equals(o.optString("texto")) && ahora - o.optLong("cuando") < 120000) return;
            }
            JSONObject n = new JSONObject();
            n.put("id", sbn.getPackageName() + ":" + ahora);
            n.put("app", sbn.getPackageName());
            n.put("texto", todo);
            n.put("cuando", ahora);
            cola.put(n);
            while (cola.length() > 60) cola.remove(0);
            p.edit().putString(COLA, cola.toString()).apply();
            // Te pregunta en una notificación propia si la registras (con botones Registrar / Editar / No es gasto)
            if (p.getBoolean("avisar_detectados", true)) {
                Matcher m = MONTO.matcher(todo);
                String monto = m.find() ? m.group().trim() : "";
                Matcher c = COMERCIO.matcher(todo);
                String donde = c.find() ? " en " + c.group(1).trim() : "";
                Notificaciones.mostrarDetectado(this, n.getString("id"), "¿Registrar " + (monto.isEmpty() ? "esta compra" : monto) + donde + "?", todo);
            }
        } catch (Exception ignorado) { }
    }

    private static String texto(CharSequence c) { return c == null ? "" : c.toString(); }
}
