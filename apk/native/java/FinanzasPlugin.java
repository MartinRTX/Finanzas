package com.martinrtx.finanzas;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

// Puente entre la app web y lo nativo: datos del widget, acción pendiente del widget
// y los gastos que detectó el lector de notificaciones de los bancos.
@CapacitorPlugin(name = "Finanzas")
public class FinanzasPlugin extends Plugin {
    static final String PREFS = "finanzas";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void guardarAccion(Context c, String accion) { prefs(c).edit().putString("accion", accion).apply(); }

    @PluginMethod
    public void actualizarWidget(PluginCall call) {
        SharedPreferences.Editor e = prefs(getContext()).edit();
        e.putString("w_etiqueta", call.getString("etiqueta", ""));
        e.putString("w_monto", call.getString("monto", ""));
        e.putString("w_sub", call.getString("sub", ""));
        e.putString("w_sub2", call.getString("sub2", ""));
        e.putBoolean("w_rojo", Boolean.TRUE.equals(call.getBoolean("rojo", false)));
        e.apply();
        FinanzasWidget.actualizarTodos(getContext());
        call.resolve();
    }

    @PluginMethod
    public void accionPendiente(PluginCall call) {
        SharedPreferences p = prefs(getContext());
        JSObject r = new JSObject();
        r.put("accion", p.getString("accion", null));
        p.edit().remove("accion").apply();
        call.resolve(r);
    }

    // Devuelve los gastos detectados y vacía la cola (la app los guarda de su lado)
    @PluginMethod
    public void detectados(PluginCall call) {
        SharedPreferences p = prefs(getContext());
        String cola = p.getString(LectorNotificaciones.COLA, "[]");
        p.edit().putString(LectorNotificaciones.COLA, "[]").apply();
        JSObject r = new JSObject();
        try { r.put("lista", new JSONArray(cola)); } catch (Exception ex) { r.put("lista", new JSONArray()); }
        call.resolve(r);
    }

    @PluginMethod
    public void lectorActivo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("activo", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        call.resolve(r);
    }

    @PluginMethod
    public void abrirPermisoLector(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
