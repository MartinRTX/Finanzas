package com.martinrtx.finanzas;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Después de reiniciar el celular o actualizar la app, vuelve a poner el recordatorio y la notificación de registro rápido.
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        Notificaciones.programarRecordatorio(c);
        if (FinanzasPlugin.prefs(c).getBoolean("rapida_activa", false)) Notificaciones.mostrarRapida(c, null);
    }
}
