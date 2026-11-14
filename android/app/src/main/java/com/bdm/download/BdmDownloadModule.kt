package com.bdm.download

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class BdmDownloadModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  companion object {
    const val NAME = "BdmDownloadModule"
    const val EVENT_DOWNLOAD_PROGRESS = "BDM_DOWNLOAD_PROGRESS"
    private const val POLL_INTERVAL_MS = 650L
  }

  private val downloadManager: DownloadManager by lazy {
    reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  }

  private val trackedIds = ConcurrentHashMap<Long, Boolean>()
  private val mainHandler = Handler(Looper.getMainLooper())
  private var isPolling = false
  private var isReceiverRegistered = false

  private val pollRunnable = object : Runnable {
    override fun run() {
      if (trackedIds.isEmpty()) {
        isPolling = false
        return
      }
      pollActiveDownloads()
      if (trackedIds.isNotEmpty()) {
        mainHandler.postDelayed(this, POLL_INTERVAL_MS)
      } else {
        isPolling = false
      }
    }
  }

  private val downloadCompleteReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == DownloadManager.ACTION_DOWNLOAD_COMPLETE) {
        val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
        if (id != -1L && trackedIds.containsKey(id)) {
          val stateMap = querySingleDownloadInternal(id)
          if (stateMap != null) {
            val status = stateMap.getString("status")
            emitProgressEvent(stateMap)
            if (status == "completed" || status == "failed" || status == "cancelled") {
              trackedIds.remove(id)
            }
          }
        }
      }
    }
  }

  init {
    reactContext.addLifecycleEventListener(this)
    registerReceiverIfNeeded()
  }

  override fun getName(): String = NAME

  private fun registerReceiverIfNeeded() {
    if (isReceiverRegistered) return
    try {
      val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
      ContextCompat.registerReceiver(
          reactContext,
          downloadCompleteReceiver,
          filter,
          ContextCompat.RECEIVER_EXPORTED
      )
      isReceiverRegistered = true
    } catch (_: Exception) {}
  }

  private fun unregisterReceiverIfNeeded() {
    if (!isReceiverRegistered) return
    try {
      reactContext.unregisterReceiver(downloadCompleteReceiver)
    } catch (_: Exception) {}
    isReceiverRegistered = false
  }

  private fun startPollingIfNeeded() {
    if (isPolling) return
    isPolling = true
    mainHandler.post(pollRunnable)
  }

  private fun emitProgressEvent(payload: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    try {
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_DOWNLOAD_PROGRESS, payload)
    } catch (_: Exception) {}
  }

  private fun pollActiveDownloads() {
    val activeKeys = trackedIds.keys.toList()
    for (dmId in activeKeys) {
      val map = querySingleDownloadInternal(dmId)
      if (map != null) {
        val status = map.getString("status")
        emitProgressEvent(map)
        if (status == "completed" || status == "failed" || status == "cancelled") {
          trackedIds.remove(dmId)
        }
      } else {
        trackedIds.remove(dmId)
      }
    }
  }

  private fun querySingleDownloadInternal(dmId: Long): WritableMap? {
    val query = DownloadManager.Query().setFilterById(dmId)
    var cursor: Cursor? = null
    try {
      cursor = downloadManager.query(query)
      if (cursor != null && cursor.moveToFirst()) {
        val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        val reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
        val downloadedIdx =
            cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
        val totalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
        val localUriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)

        val rawStatus = if (statusIdx >= 0) cursor.getInt(statusIdx) else -1
        val rawReason = if (reasonIdx >= 0) cursor.getInt(reasonIdx) else 0
        val bytesDownloaded =
            if (downloadedIdx >= 0) cursor.getLong(downloadedIdx).coerceAtLeast(0L) else 0L
        val totalBytes =
            if (totalIdx >= 0) cursor.getLong(totalIdx).coerceAtLeast(0L) else 0L
        val localUri = if (localUriIdx >= 0) cursor.getString(localUriIdx) else null

        val mappedStatus =
            when (rawStatus) {
              DownloadManager.STATUS_PENDING -> "pending"
              DownloadManager.STATUS_RUNNING -> "downloading"
              DownloadManager.STATUS_PAUSED -> "paused"
              DownloadManager.STATUS_SUCCESSFUL -> "completed"
              DownloadManager.STATUS_FAILED -> "failed"
              else -> "pending"
            }

        val progress =
            if (mappedStatus == "completed") {
              100.0
            } else if (totalBytes > 0L) {
              ((bytesDownloaded.toDouble() / totalBytes.toDouble()) * 100.0).coerceIn(
                  0.0,
                  99.9
              )
            } else {
              0.0
            }

        val map = Arguments.createMap()
        map.putString("downloadId", dmId.toString())
        map.putString("status", mappedStatus)
        map.putDouble("bytesDownloaded", bytesDownloaded.toDouble())
        map.putDouble("totalBytes", totalBytes.toDouble())
        map.putDouble("progress", progress)
        if (!localUri.isNullOrBlank()) {
          map.putString("localUri", localUri)
        }
        if (mappedStatus == "failed") {
          map.putString("errorMessage", formatFailureReason(rawReason))
        }
        return map
      } else {
        val cancelledMap = Arguments.createMap()
        cancelledMap.putString("downloadId", dmId.toString())
        cancelledMap.putString("status", "cancelled")
        cancelledMap.putDouble("bytesDownloaded", 0.0)
        cancelledMap.putDouble("totalBytes", 0.0)
        cancelledMap.putDouble("progress", 0.0)
        return cancelledMap
      }
    } catch (_: Exception) {
      return null
    } finally {
      cursor?.close()
    }
  }

  private fun formatFailureReason(reason: Int): String {
    return when (reason) {
      DownloadManager.ERROR_CANNOT_RESUME -> "Download cannot be resumed."
      DownloadManager.ERROR_DEVICE_NOT_FOUND -> "External storage not found."
      DownloadManager.ERROR_FILE_ALREADY_EXISTS -> "File already exists."
      DownloadManager.ERROR_FILE_ERROR -> "Storage file write error."
      DownloadManager.ERROR_HTTP_DATA_ERROR -> "Network HTTP transfer error."
      DownloadManager.ERROR_INSUFFICIENT_SPACE -> "Insufficient storage space on device."
      DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "Too many HTTP redirects."
      DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "Server returned an unhandled HTTP error."
      else -> "Download failed (code $reason)."
    }
  }

  private fun sanitizeFileName(rawName: String, fallbackExt: String): String {
    val cleaned =
        rawName
            .replace(Regex("[<>:\"/\\\\|?*\\x00-\\x1F]"), "_")
            .replace(Regex("\\s+"), "_")
            .trim('_')
    val base = if (cleaned.isNotEmpty()) cleaned else "BDM_Video_${System.currentTimeMillis()}"
    val lower = base.lowercase()
    return if (lower.endsWith(".mp4") || lower.endsWith(".webm")) {
      base
    } else {
      "$base.$fallbackExt"
    }
  }

  @ReactMethod
  fun startDownload(
      url: String,
      fileName: String,
      title: String,
      mimeType: String,
      userAgent: String?,
      promise: Promise
  ) {
    try {
      val trimmedUrl = url.trim()
      if (!trimmedUrl.startsWith("http://", ignoreCase = true) &&
          !trimmedUrl.startsWith("https://", ignoreCase = true)) {
        promise.reject("INVALID_URL", "Only direct HTTP/HTTPS URLs are supported.")
        return
      }

      val ext = if (mimeType.contains("webm", ignoreCase = true)) "webm" else "mp4"
      val safeFileName = sanitizeFileName(fileName, ext)
      val resolvedMime = mimeType.ifBlank { "video/$ext" }

      // Ensure Downloads/BDM directory exists when accessible
      try {
        val publicDownloads =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val bdmDir = File(publicDownloads, "BDM")
        if (!bdmDir.exists()) {
          bdmDir.mkdirs()
        }
      } catch (_: Exception) {}

      val request =
          DownloadManager.Request(Uri.parse(trimmedUrl))
              .setTitle(title.ifBlank { safeFileName })
              .setDescription("BDM • Saving to Downloads/BDM/$safeFileName")
              .setMimeType(resolvedMime)
              .setNotificationVisibility(
                  DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
              )
              .setAllowedOverMetered(true)
              .setAllowedOverRoaming(true)
              .setDestinationInExternalPublicDir(
                  Environment.DIRECTORY_DOWNLOADS,
                  "BDM/$safeFileName"
              )

      if (!userAgent.isNullOrBlank()) {
        request.addRequestHeader("User-Agent", userAgent)
      }

      val dmId = downloadManager.enqueue(request)
      trackedIds[dmId] = true
      registerReceiverIfNeeded()
      startPollingIfNeeded()

      val response = Arguments.createMap()
      response.putString("downloadId", dmId.toString())
      response.putString("fileName", safeFileName)
      response.putString("relativePath", "Downloads/BDM/$safeFileName")
      promise.resolve(response)
    } catch (e: Exception) {
      promise.reject("START_DOWNLOAD_ERROR", e.message ?: "Failed to start download", e)
    }
  }

  @ReactMethod
  fun queryDownload(downloadIdStr: String, promise: Promise) {
    try {
      val dmId = downloadIdStr.toLongOrNull()
      if (dmId == null) {
        promise.reject("INVALID_ID", "Invalid downloadManagerId: $downloadIdStr")
        return
      }
      val result = querySingleDownloadInternal(dmId)
      if (result != null) {
        promise.resolve(result)
      } else {
        promise.reject("QUERY_FAILED", "Unable to query download $downloadIdStr")
      }
    } catch (e: Exception) {
      promise.reject("QUERY_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cancelDownload(downloadIdStr: String, promise: Promise) {
    try {
      val dmId = downloadIdStr.toLongOrNull()
      if (dmId == null) {
        promise.reject("INVALID_ID", "Invalid downloadManagerId: $downloadIdStr")
        return
      }
      trackedIds.remove(dmId)
      val removedCount = downloadManager.remove(dmId)
      promise.resolve(removedCount > 0)
    } catch (e: Exception) {
      promise.reject("CANCEL_ERROR", e.message ?: "Failed to cancel download", e)
    }
  }

  @ReactMethod
  fun removeDownloadedFile(downloadIdStr: String, promise: Promise) {
    try {
      val dmId = downloadIdStr.toLongOrNull()
      if (dmId == null) {
        promise.reject("INVALID_ID", "Invalid downloadManagerId: $downloadIdStr")
        return
      }
      trackedIds.remove(dmId)
      val removedCount = downloadManager.remove(dmId)
      promise.resolve(removedCount > 0)
    } catch (e: Exception) {
      promise.reject("REMOVE_ERROR", e.message ?: "Failed to delete file", e)
    }
  }

  @ReactMethod
  fun openDownloadedFile(downloadIdStr: String, mimeType: String, promise: Promise) {
    try {
      val dmId = downloadIdStr.toLongOrNull()
      if (dmId == null) {
        promise.reject("INVALID_ID", "Invalid downloadManagerId: $downloadIdStr")
        return
      }
      val contentUri = downloadManager.getUriForDownloadedFile(dmId)
      if (contentUri == null) {
        promise.reject(
            "FILE_NOT_FOUND",
            "Downloaded video file is no longer available on storage."
        )
        return
      }

      val resolvedMime = mimeType.ifBlank { "video/*" }
      val viewIntent =
          Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, resolvedMime)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }

      val chooser =
          Intent.createChooser(viewIntent, "Open Video").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
      reactContext.startActivity(chooser)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_FILE_ERROR", e.message ?: "Unable to open video file", e)
    }
  }

  @ReactMethod
  fun shareDownloadedFile(
      downloadIdStr: String,
      mimeType: String,
      title: String,
      promise: Promise
  ) {
    try {
      val dmId = downloadIdStr.toLongOrNull()
      if (dmId == null) {
        promise.reject("INVALID_ID", "Invalid downloadManagerId: $downloadIdStr")
        return
      }
      val contentUri = downloadManager.getUriForDownloadedFile(dmId)
      if (contentUri == null) {
        promise.reject(
            "FILE_NOT_FOUND",
            "Downloaded video file is no longer available on storage."
        )
        return
      }

      val resolvedMime = mimeType.ifBlank { "video/*" }
      val shareIntent =
          Intent(Intent.ACTION_SEND).apply {
            type = resolvedMime
            putExtra(Intent.EXTRA_STREAM, contentUri)
            putExtra(Intent.EXTRA_SUBJECT, title.ifBlank { "Shared Video from BDM" })
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }

      val chooser =
          Intent.createChooser(shareIntent, "Share Video").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
      reactContext.startActivity(chooser)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SHARE_FILE_ERROR", e.message ?: "Unable to share video file", e)
    }
  }

  @ReactMethod
  @Suppress("UNUSED_PARAMETER")
  fun addListener(eventName: String) {
    // Required for RN NativeEventEmitter
  }

  @ReactMethod
  @Suppress("UNUSED_PARAMETER")
  fun removeListeners(count: Int) {
    // Required for RN NativeEventEmitter
  }

  override fun onHostResume() {
    registerReceiverIfNeeded()
    if (trackedIds.isNotEmpty()) {
      startPollingIfNeeded()
    }
  }

  override fun onHostPause() {}

  override fun onHostDestroy() {
    mainHandler.removeCallbacks(pollRunnable)
    isPolling = false
    unregisterReceiverIfNeeded()
  }
}
