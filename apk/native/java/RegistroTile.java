package com.martinrtx.finanzas;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.TileService;

// Botón en el panel de ajustes rápidos (deslizas hacia abajo dos veces): abre la app directo en "Registrar".
public class RegistroTile extends TileService {
    @Override
    @SuppressWarnings("deprecation")
    public void onClick() {
        Intent i = new Intent(this, MainActivity.class);
        i.setAction("finanzas.gasto");
        i.putExtra(FinanzasWidget.EXTRA_ACCION, "gasto");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(this, 41, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        else startActivityAndCollapse(i);
    }
}
