package com.martinrtx.finanzas;

import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import java.util.Calendar;

// Notificaciones propias de Finanzas: registro rápido fijo, recordatorio de la noche y compras detectadas.
// Las tres dejan escribir el gasto ahí mismo ("230 oxxo"); se guarda en el celular y la app lo sube al abrirse.
final class Notificaciones {
    static final String CANAL_RAPIDO = "rapido", CANAL_DETECTADO = "detectados", CANAL_RECORDATORIO = "recordatorio";
    static final int ID_RAPIDA = 7001, ID_RECORDATORIO = 7002;
    static final String TEXTO = "texto";
    private static final int VERDE = 0xFF0D7A5E;

    private Notificaciones() { }

    static void canales(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager m = c.getSystemService(NotificationManager.class);
        NotificationChannel r = new NotificationChannel(CANAL_RAPIDO, "Registro rápido", NotificationManager.IMPORTANCE_LOW);
        r.setDescription("Notificación fija para escribir un gasto sin abrir la app");
        r.setShowBadge(false);
        m.createNotificationChannel(r);
        NotificationChannel d = new NotificationChannel(CANAL_DETECTADO, "Compras detectadas", NotificationManager.IMPORTANCE_DEFAULT);
        d.setDescription("Te pregunta si registras una compra que avisó tu banco");
        m.createNotificationChannel(d);
        NotificationChannel n = new NotificationChannel(CANAL_RECORDATORIO, "Recordatorio para registrar", NotificationManager.IMPORTANCE_DEFAULT);
        n.setDescription("Aviso en la noche si no registraste nada");
        m.createNotificationChannel(n);
    }

    static PendingIntent abrir(Context c, String accion, int codigo) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction("finanzas." + accion);
        i.putExtra(FinanzasWidget.EXTRA_ACCION, accion);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent accion(Context c, String accion, String dato, int codigo, boolean editable) {
        Intent i = new Intent(c, AccionesReceiver.class);
        i.setAction(accion);
        i.putExtra("dato", dato);
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        // La respuesta escrita necesita un PendingIntent mutable (Android le agrega el texto)
        f |= editable && Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(c, codigo, i, f);
    }

    private static NotificationCompat.Action responder(Context c, String etiqueta, String origen, int codigo) {
        RemoteInput ri = new RemoteInput.Builder(TEXTO).setLabel("Ej. 230 oxxo · 650 gasolina ayer").build();
        return new NotificationCompat.Action.Builder(R.drawable.ic_notif, etiqueta, accion(c, AccionesReceiver.RESPUESTA, origen, codigo, true))
            .addRemoteInput(ri).setAllowGeneratedReplies(false).build();
    }

    @SuppressLint("MissingPermission")
    private static void publicar(Context c, int id, NotificationCompat.Builder b) {
        try { NotificationManagerCompat.from(c).notify(id, b.build()); } catch (SecurityException sinPermiso) { /* el usuario no dio permiso de notificaciones */ }
    }

    static void cancelar(Context c, int id) { NotificationManagerCompat.from(c).cancel(id); }

    static void mostrarRapida(Context c, String linea) {
        canales(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL_RAPIDO)
            .setSmallIcon(R.drawable.ic_notif).setColor(VERDE)
            .setContentTitle("Registrar un gasto")
            .setContentText(linea != null ? linea : "Toca Escribir: \"230 oxxo\", \"650 gasolina débito\"…")
            .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false).setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(abrir(c, "gasto", 11))
            .addAction(responder(c, "Escribir", "rapida", 12))
            .addAction(new NotificationCompat.Action(R.drawable.ic_notif, "Ticket", abrir(c, "ticket", 13)))
            .addAction(new NotificationCompat.Action(R.drawable.ic_notif, "Dictar", abrir(c, "dictar", 14)));
        publicar(c, ID_RAPIDA, b);
    }

    static void mostrarRecordatorio(Context c) {
        canales(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL_RECORDATORIO)
            .setSmallIcon(R.drawable.ic_notif).setColor(VERDE)
            .setContentTitle("¿Gastaste algo hoy?")
            .setContentText("Escríbelo aquí mismo, por ejemplo \"120 tacos\". Si no, toca No gasté.")
            .setAutoCancel(true).setContentIntent(abrir(c, "gasto", 21))
            .addAction(responder(c, "Anotar", "recordatorio", 22))
            .addAction(new NotificationCompat.Action(R.drawable.ic_notif, "No gasté", accion(c, AccionesReceiver.NO_GASTE, "", 23, false)));
        publicar(c, ID_RECORDATORIO, b);
    }

    static int idDetectado(String id) { return 7100 + Math.abs(id.hashCode() % 800); }

    static void mostrarDetectado(Context c, String id, String titulo, String texto) {
        canales(c);
        int n = idDetectado(id);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CANAL_DETECTADO)
            .setSmallIcon(R.drawable.ic_notif).setColor(VERDE)
            .setContentTitle(titulo).setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto + "\nRegistrar lo guarda con la categoría que la app adivine; Editar abre la app."))
            .setAutoCancel(true).setContentIntent(abrir(c, "detectado", n * 4))
            .addAction(new NotificationCompat.Action(R.drawable.ic_notif, "Registrar", accion(c, AccionesReceiver.CONFIRMAR, id, n * 4 + 1, false)))
            .addAction(new NotificationCompat.Action(R.drawable.ic_notif, "Editar", abrir(c, "detectado", n * 4 + 2)))
            .addAction(new NotificationCompat.Action(R.drawable.ic_notif, "No es gasto", accion(c, AccionesReceiver.DESCARTAR, id, n * 4 + 3, false)));
        publicar(c, n, b);
    }

    // Recordatorio diario (inexacto, no gasta batería). Si ese día ya registraste algo, no suena.
    static void programarRecordatorio(Context c) {
        SharedPreferences p = FinanzasPlugin.prefs(c);
        AlarmManager am = c.getSystemService(AlarmManager.class);
        Intent i = new Intent(c, AccionesReceiver.class);
        i.setAction(AccionesReceiver.RECORDATORIO);
        PendingIntent pi = PendingIntent.getBroadcast(c, 31, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (!p.getBoolean("rec_activo", false)) return;
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, p.getInt("rec_hora", 21));
        cal.set(Calendar.MINUTE, p.getInt("rec_minuto", 0));
        cal.set(Calendar.SECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_MONTH, 1);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }
}
