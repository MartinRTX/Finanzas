package com.martinrtx.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

// Widget de atajos: tus 4 gastos más frecuentes. Si tienen monto fijo se anotan con un toque sin abrir la app;
// si no, abren el registro ya con la descripción y la categoría puestas.
public class AtajosWidget extends AppWidgetProvider {
    private static final int[] BOTONES = { R.id.a1, R.id.a2, R.id.a3, R.id.a4 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, vista(context));
    }

    static void actualizarTodos(Context context) {
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        for (int id : m.getAppWidgetIds(new ComponentName(context, AtajosWidget.class))) m.updateAppWidget(id, vista(context));
    }

    static RemoteViews vista(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_atajos);
        JSONArray favs;
        try { favs = new JSONArray(FinanzasPlugin.prefs(c).getString("w_favs", "[]")); } catch (Exception e) { favs = new JSONArray(); }
        v.setViewVisibility(R.id.a_vacio, favs.length() == 0 ? View.VISIBLE : View.GONE);
        for (int i = 0; i < BOTONES.length; i++) {
            JSONObject f = favs.optJSONObject(i);
            if (f == null) { v.setViewVisibility(BOTONES[i], View.GONE); continue; }
            v.setViewVisibility(BOTONES[i], View.VISIBLE);
            v.setTextViewText(BOTONES[i], f.optString("l"));
            PendingIntent pi;
            if (f.has("t")) {
                Intent b = new Intent(c, AccionesReceiver.class);
                b.setAction(AccionesReceiver.FAVORITO);
                b.putExtra("dato", String.valueOf(i));
                pi = PendingIntent.getBroadcast(c, 50 + i, b, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            } else pi = Notificaciones.abrir(c, "plantilla:" + i, 60 + i);
            v.setOnClickPendingIntent(BOTONES[i], pi);
        }
        v.setOnClickPendingIntent(R.id.a_mas, Notificaciones.abrir(c, "gasto", 70));
        return v;
    }
}
