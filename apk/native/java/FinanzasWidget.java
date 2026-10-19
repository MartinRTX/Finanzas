package com.martinrtx.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

// Widget de la pantalla de inicio: lo que te queda de la quincena, tu tarjeta para gastos y un botón + para registrar.
// La app le manda los textos ya listos cada vez que cambian tus datos.
public class FinanzasWidget extends AppWidgetProvider {
    static final String EXTRA_ACCION = "finanzas_accion";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, vista(context));
    }

    static void actualizarTodos(Context context) {
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        int[] ids = m.getAppWidgetIds(new ComponentName(context, FinanzasWidget.class));
        for (int id : ids) m.updateAppWidget(id, vista(context));
    }

    private static PendingIntent abrir(Context context, String accion, int codigo) {
        Intent i = new Intent(context, MainActivity.class);
        i.setAction("finanzas." + accion);
        i.putExtra(EXTRA_ACCION, accion);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews vista(Context context) {
        SharedPreferences p = FinanzasPlugin.prefs(context);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_finanzas);
        String monto = p.getString("w_monto", "");
        v.setTextViewText(R.id.w_etiqueta, p.getString("w_etiqueta", "Finanzas"));
        v.setTextViewText(R.id.w_monto, monto.isEmpty() ? "Abre la app" : monto);
        v.setTextColor(R.id.w_monto, p.getBoolean("w_rojo", false) ? Color.parseColor("#FF8A78") : Color.WHITE);
        String sub = p.getString("w_sub", ""), sub2 = p.getString("w_sub2", "");
        v.setTextViewText(R.id.w_sub, sub);
        v.setViewVisibility(R.id.w_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_sub2, sub2);
        v.setViewVisibility(R.id.w_sub2, sub2.isEmpty() ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(R.id.w_raiz, abrir(context, "abrir", 1));
        v.setOnClickPendingIntent(R.id.w_mas, abrir(context, "gasto", 2));
        v.setOnClickPendingIntent(R.id.w_foto, abrir(context, "ticket", 3));
        return v;
    }
}
