package com.bdm.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.bdm.R

class BdmDownloadForegroundService : Service() {

  companion object {
    const val CHANNEL_ID = "bdm_downloads_channel"
    const val CHANNEL_NAME = "BDM Video Downloads"
    const val FOREGROUND_NOTIFICATION_ID = 9001
    const val ACTION_START = "com.bdm.download.ACTION_START_FG"
    const val ACTION_STOP = "com.bdm.download.ACTION_STOP_FG"
    const val EXTRA_TITLE = "extra_title"
    const val EXTRA_PROGRESS_TEXT = "extra_progress_text"
    const val EXTRA_PROGRESS_PCT = "extra_progress_pct"
    const val EXTRA_INDETERMINATE = "extra_indeterminate"
  }

  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    acquireLocks()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      releaseLocks()
      try {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } catch (_: Exception) {}
      stopSelf()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "BDM Video Download Active"
    val progressText =
        intent?.getStringExtra(EXTRA_PROGRESS_TEXT)
            ?: "Downloading in background"
    val progressPct = (intent?.getIntExtra(EXTRA_PROGRESS_PCT, 0) ?: 0).coerceIn(0, 100)
    val indeterminate = intent?.getBooleanExtra(EXTRA_INDETERMINATE, false) ?: false

    ensureChannel()
    acquireLocks()

    val largeIconBitmap =
        try {
          BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
        } catch (_: Exception) {
          null
        }

    val builder =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_bdm)
            .setColor(0xFF7C5CFC.toInt())
            .setContentTitle(title)
            .setContentText(progressText)
            .setProgress(100, progressPct, indeterminate)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)

    if (largeIconBitmap != null) {
      builder.setLargeIcon(largeIconBitmap)
    }

    val notification = builder.build()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
            FOREGROUND_NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        )
      } else {
        startForeground(FOREGROUND_NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {}

    return START_STICKY
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
              description = "Keeps video downloads running when the screen is turned off"
              setShowBadge(false)
            }
        nm.createNotificationChannel(channel)
      } catch (_: Exception) {}
    }
  }

  private fun acquireLocks() {
    try {
      if (wakeLock == null) {
        val pm = applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock =
            pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BDM::DownloadWakeLock").apply {
              setReferenceCounted(false)
            }
      }
      if (wakeLock?.isHeld == false) {
        // Hold up to 3 hours max per download session for safety
        wakeLock?.acquire(3 * 60 * 60 * 1000L)
      }
    } catch (_: Exception) {}

    try {
      if (wifiLock == null) {
        val wm =
            applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        val mode =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            } else {
              WifiManager.WIFI_MODE_FULL_HIGH_PERF
            }
        wifiLock =
            wm.createWifiLock(mode, "BDM::DownloadWifiLock").apply {
              setReferenceCounted(false)
            }
      }
      if (wifiLock?.isHeld == false) {
        wifiLock?.acquire()
      }
    } catch (_: Exception) {}
  }

  private fun releaseLocks() {
    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
    } catch (_: Exception) {}
    try {
      if (wifiLock?.isHeld == true) {
        wifiLock?.release()
      }
    } catch (_: Exception) {}
  }

  override fun onDestroy() {
    releaseLocks()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
