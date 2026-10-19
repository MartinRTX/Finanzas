package com.martinrtx.finanzas;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Actividad principal: registra el plugin propio de Finanzas y guarda la acción que pidió el widget
// (por ejemplo "gasto") para que la app la lea al abrir.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinanzasPlugin.class);
        super.onCreate(savedInstanceState);
        guardarAccion(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        guardarAccion(intent);
    }

    private void guardarAccion(Intent intent) {
        if (intent == null) return;
        String accion = intent.getStringExtra(FinanzasWidget.EXTRA_ACCION);
        if (accion != null) FinanzasPlugin.guardarAccion(this, accion);
    }
}
