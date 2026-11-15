package com.bdm.download

import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
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
import java.io.FileOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONArray

class BdmDownloadModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  companion object {
    const val NAME = "BdmDownloadModule"
    const val EVENT_DOWNLOAD_PROGRESS = "BDM_DOWNLOAD_PROGRESS"
    private const val NOTIFICATION_CHANNEL_ID = "bdm_downloads_channel"
    private const val NOTIFICATION_CHANNEL_NAME = "BDM Video Downloads"
  }

  private data class ProbedStreamInfo(
      val finalUrl: String,
      val fileSize: Long,
      val mimeType: String,
      val extension: String
  )

  private class CustomDownloadTask(
      val downloadId: String,
      val url: String,
      val fileName: String,
      val title: String,
      val mimeType: String,
      val notificationId: Int
  ) {
    @Volatile var status: String = "downloading"
    @Volatile var bytesDownloaded: Long = 0L
    @Volatile var totalBytes: Long = 0L
    @Volatile var progress: Double = 0.0
    @Volatile var localUri: String? = null
    @Volatile var errorMessage: String? = null
    @Volatile var cancelled: Boolean = false
    @Volatile var connection: HttpURLConnection? = null
    @Volatile var contentUri: Uri? = null
    @Volatile var destFile: File? = null
  }

  private val downloadManager: DownloadManager by lazy {
    reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  }

  private val notificationManager: NotificationManager by lazy {
    reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  }

  private val customTasks = ConcurrentHashMap<String, CustomDownloadTask>()
  private val nextCustomDownloadId = AtomicLong(System.currentTimeMillis())
  private val downloadExecutor = Executors.newCachedThreadPool()
  private val probeExecutor = Executors.newCachedThreadPool()

  init {
    reactContext.addLifecycleEventListener(this)
    ensureNotificationChannel()
  }

  override fun getName(): String = NAME

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val channel =
            NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
              description = "Shows progress and completion for BDM video downloads"
              setShowBadge(false)
            }
        notificationManager.createNotificationChannel(channel)
      } catch (_: Exception) {}
    }
  }

  private fun updateNotification(task: CustomDownloadTask) {
    try {
      ensureNotificationChannel()
      val builder =
          NotificationCompat.Builder(reactContext, NOTIFICATION_CHANNEL_ID)
              .setSmallIcon(android.R.drawable.stat_sys_download)
              .setContentTitle(task.title.ifBlank { task.fileName })
              .setOnlyAlertOnce(true)
              .setPriority(NotificationCompat.PRIORITY_LOW)

      when (task.status) {
        "downloading", "pending" -> {
          val pct = task.progress.toInt().coerceIn(0, 100)
          builder
              .setSmallIcon(android.R.drawable.stat_sys_download)
              .setContentText(
                  if (task.totalBytes > 0L) {
                    "Downloading ($pct%) • Downloads/BDM/${task.fileName}"
                  } else {
                    "Downloading • Downloads/BDM/${task.fileName}"
                  }
              )
              .setProgress(100, pct, task.totalBytes <= 0L)
              .setOngoing(true)
          notificationManager.notify(task.notificationId, builder.build())
        }
        "completed" -> {
          builder
              .setSmallIcon(android.R.drawable.stat_sys_download_done)
              .setContentText("Download complete • Downloads/BDM/${task.fileName}")
              .setProgress(0, 0, false)
              .setOngoing(false)
              .setAutoCancel(true)
          notificationManager.notify(task.notificationId, builder.build())
        }
        "failed" -> {
          builder
              .setSmallIcon(android.R.drawable.stat_notify_error)
              .setContentText(task.errorMessage ?: "Download failed")
              .setProgress(0, 0, false)
              .setOngoing(false)
              .setAutoCancel(true)
          notificationManager.notify(task.notificationId, builder.build())
        }
        "cancelled" -> {
          notificationManager.cancel(task.notificationId)
        }
      }
    } catch (_: Exception) {}
  }

  private fun buildTaskWritableMap(task: CustomDownloadTask): WritableMap {
    val map = Arguments.createMap()
    map.putString("downloadId", task.downloadId)
    map.putString("status", task.status)
    map.putDouble("bytesDownloaded", task.bytesDownloaded.toDouble())
    map.putDouble("totalBytes", task.totalBytes.toDouble())
    map.putDouble("progress", task.progress)
    if (!task.localUri.isNullOrBlank()) {
      map.putString("localUri", task.localUri)
    }
    if (!task.errorMessage.isNullOrBlank()) {
      map.putString("errorMessage", task.errorMessage)
    }
    return map
  }

  private fun emitProgressEvent(payload: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    try {
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_DOWNLOAD_PROGRESS, payload)
    } catch (_: Exception) {}
  }

  private fun syncForegroundServiceState(activeTask: CustomDownloadTask?) {
    try {
      val hasActive =
          customTasks.values.any { it.status == "downloading" || it.status == "pending" }
      if (hasActive) {
        val intent =
            Intent(reactContext, BdmDownloadForegroundService::class.java).apply {
              action = BdmDownloadForegroundService.ACTION_START
              if (activeTask != null) {
                val pct = activeTask.progress.toInt().coerceIn(0, 100)
                putExtra(
                    BdmDownloadForegroundService.EXTRA_TITLE,
                    activeTask.title.ifBlank { activeTask.fileName }
                )
                putExtra(
                    BdmDownloadForegroundService.EXTRA_PROGRESS_TEXT,
                    "Downloading ($pct%) • Screen-off protection active"
                )
              }
            }
        ContextCompat.startForegroundService(reactContext, intent)
      } else {
        val stopIntent =
            Intent(reactContext, BdmDownloadForegroundService::class.java).apply {
              action = BdmDownloadForegroundService.ACTION_STOP
            }
        reactContext.startService(stopIntent)
      }
    } catch (_: Exception) {}
  }

  private fun emitTaskState(task: CustomDownloadTask) {
    emitProgressEvent(buildTaskWritableMap(task))
    updateNotification(task)
  }

  private fun sanitizeFileName(rawName: String, fallbackExt: String): String {
    val cleaned =
        rawName
            .replace(Regex("[<>:\"/\\\\|?*\\x00-\\x1F]"), "_")
            .replace(Regex("\\s+"), "_")
            .replace(Regex("_+"), "_")
            .trim('_')
    val base = if (cleaned.isNotEmpty()) cleaned else "BDM_Video_${System.currentTimeMillis()}"
    val lower = base.lowercase()
    return if (lower.endsWith(".mp4") || lower.endsWith(".webm")) {
      base
    } else {
      "$base.$fallbackExt"
    }
  }

  private fun parseTotalBytesFromHeaders(conn: HttpURLConnection): Long {
    val contentRange = conn.getHeaderField("Content-Range")
    if (!contentRange.isNullOrBlank() && contentRange.contains("/")) {
      val totalPart = contentRange.substringAfterLast("/").trim()
      val rangeTotal = totalPart.toLongOrNull()
      if (rangeTotal != null && rangeTotal > 0L) {
        return rangeTotal
      }
    }
    val contentLengthHeader = conn.getHeaderField("Content-Length")?.trim()?.toLongOrNull()
    if (contentLengthHeader != null && contentLengthHeader > 0L) {
      return contentLengthHeader
    }
    val lenLong = conn.contentLengthLong
    return if (lenLong > 0L) lenLong else 0L
  }

  private fun openFollowRedirects(
      initialUrl: String,
      refererUrl: String?,
      userAgent: String?,
      isProbeOnly: Boolean,
      rangeStartByte: Long = 0L
  ): Pair<HttpURLConnection, String> {
    var currentUrl = initialUrl
    var currentReferer = refererUrl
    var redirects = 0

    while (redirects <= 6) {
      val conn =
          (URL(currentUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = if (isProbeOnly) 7000 else 20000
            readTimeout = if (isProbeOnly) 7000 else 45000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "*/*")
            setRequestProperty("Accept-Encoding", "identity")
            setRequestProperty("Connection", "keep-alive")
            if (!userAgent.isNullOrBlank()) {
              setRequestProperty("User-Agent", userAgent)
            }
            if (!currentReferer.isNullOrBlank()) {
              setRequestProperty("Referer", currentReferer)
            } else {
              try {
                val parsed = Uri.parse(currentUrl)
                val origin = "${parsed.scheme}://${parsed.host}/"
                setRequestProperty("Referer", origin)
              } catch (_: Exception) {}
            }
            if (isProbeOnly) {
              setRequestProperty("Range", "bytes=0-0")
            } else if (rangeStartByte > 0L) {
              setRequestProperty("Range", "bytes=$rangeStartByte-")
            }
          }

      val code = conn.responseCode
      if (code in listOf(301, 302, 303, 307, 308)) {
        val location = conn.getHeaderField("Location")
        conn.disconnect()
        if (location.isNullOrBlank()) {
          throw IllegalStateException("Redirect missing Location header (HTTP $code)")
        }
        val nextUrl =
            try {
              URI(currentUrl).resolve(location.trim()).toString()
            } catch (_: Exception) {
              location.trim()
            }
        currentUrl = nextUrl
        redirects++
        continue
      }

      return Pair(conn, currentUrl)
    }

    throw IllegalStateException("Too many HTTP redirects while resolving video stream.")
  }

  private fun probeStreamMetadata(
      rawUrl: String,
      refererUrl: String?,
      userAgent: String?,
      extHint: String
  ): ProbedStreamInfo {
    val defaultExt =
        if (extHint.equals("webm", ignoreCase = true) ||
            rawUrl.substringBefore("?").endsWith(".webm", ignoreCase = true)) {
          "webm"
        } else {
          "mp4"
        }
    val defaultMime = if (defaultExt == "webm") "video/webm" else "video/mp4"

    var conn: HttpURLConnection? = null
    return try {
      val (resolvedConn, finalUrl) = openFollowRedirects(rawUrl, refererUrl, userAgent, true)
      conn = resolvedConn
      val code = conn.responseCode
      if (code in 200..299) {
        val totalBytes = parseTotalBytesFromHeaders(conn)
        val rawContentType = (conn.contentType ?: "").lowercase()
        val ext =
            if (rawContentType.contains("webm") ||
                finalUrl.substringBefore("?").endsWith(".webm", ignoreCase = true) ||
                defaultExt == "webm") {
              "webm"
            } else {
              "mp4"
            }
        val mime = if (ext == "webm") "video/webm" else "video/mp4"
        ProbedStreamInfo(
            finalUrl = finalUrl,
            fileSize = totalBytes,
            mimeType = mime,
            extension = ext
        )
      } else {
        ProbedStreamInfo(
            finalUrl = rawUrl,
            fileSize = 0L,
            mimeType = defaultMime,
            extension = defaultExt
        )
      }
    } catch (_: Exception) {
      ProbedStreamInfo(
          finalUrl = rawUrl,
          fileSize = 0L,
          mimeType = defaultMime,
          extension = defaultExt
      )
    } finally {
      try {
        conn?.disconnect()
      } catch (_: Exception) {}
    }
  }

  private fun extractQualityLabel(label: String?, url: String): String? {
    if (!label.isNullOrBlank()) {
      val qMatch =
          Regex("""\b(2160p|1440p|1080p|720p|480p|360p|240p|144p|4k|hd|sd)\b""", RegexOption.IGNORE_CASE)
              .find(label)
      if (qMatch != null) {
        return qMatch.groupValues[1].lowercase().replace("4k", "2160p")
      }
      val numMatch = Regex("""^\s*(\d{3,4})\s*$""").find(label)
      if (numMatch != null) {
        return "${numMatch.groupValues[1]}p"
      }
    }
    val streamPathMatch = Regex("""/stream/(\d{3,4})/""", RegexOption.IGNORE_CASE).find(url)
    if (streamPathMatch != null) {
      return "${streamPathMatch.groupValues[1]}p"
    }
    val urlQualityMatch =
        Regex("""(?:^|[_.\-/=])(2160p|1440p|1080p|720p|480p|360p|240p|144p)(?:$|[_.\-&?])""", RegexOption.IGNORE_CASE)
            .find(url)
    if (urlQualityMatch != null) {
      return urlQualityMatch.groupValues[1].lowercase()
    }
    return null
  }

  @ReactMethod
  fun probeVideoMetadata(
      url: String,
      refererUrl: String?,
      userAgent: String?,
      promise: Promise
  ) {
    probeExecutor.execute {
      try {
        val trimmed = url.trim()
        if (!trimmed.startsWith("http://", ignoreCase = true) &&
            !trimmed.startsWith("https://", ignoreCase = true)) {
          promise.resolve(null)
          return@execute
        }
        val probed = probeStreamMetadata(trimmed, refererUrl, userAgent, "mp4")
        val map = Arguments.createMap()
        map.putString("url", probed.finalUrl)
        map.putString("originalUrl", trimmed)
        map.putString("title", "")
        map.putString("extension", probed.extension)
        map.putString("mimeType", probed.mimeType)
        if (probed.fileSize > 0L) {
          map.putDouble("fileSize", probed.fileSize.toDouble())
        }
        val quality = extractQualityLabel(null, trimmed) ?: extractQualityLabel(null, probed.finalUrl)
        if (!quality.isNullOrBlank()) {
          map.putString("quality", quality)
        }
        promise.resolve(map)
      } catch (_: Exception) {
        promise.resolve(null)
      }
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
      val downloadId = nextCustomDownloadId.incrementAndGet().toString()
      val notificationId = (downloadId.hashCode() and 0x7FFFFFFF).coerceAtLeast(1001)

      val task =
          CustomDownloadTask(
              downloadId = downloadId,
              url = trimmedUrl,
              fileName = safeFileName,
              title = title.ifBlank { safeFileName },
              mimeType = resolvedMime,
              notificationId = notificationId
          )
      customTasks[downloadId] = task

      val response = Arguments.createMap()
      response.putString("downloadId", downloadId)
      response.putString("fileName", safeFileName)
      response.putString("relativePath", "Downloads/BDM/$safeFileName")
      promise.resolve(response)

      downloadExecutor.execute {
        executeCustomDownload(task, userAgent)
      }
    } catch (e: Exception) {
      promise.reject("START_DOWNLOAD_ERROR", e.message ?: "Failed to start download", e)
    }
  }

  private fun createDownloadOutputStream(task: CustomDownloadTask): OutputStream {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        val resolver = reactContext.contentResolver
        val values =
            ContentValues().apply {
              put(MediaStore.MediaColumns.DISPLAY_NAME, task.fileName)
              put(MediaStore.MediaColumns.MIME_TYPE, task.mimeType)
              put(
                  MediaStore.MediaColumns.RELATIVE_PATH,
                  "${Environment.DIRECTORY_DOWNLOADS}/BDM"
              )
            }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        if (uri != null) {
          val out = resolver.openOutputStream(uri)
          if (out != null) {
            task.contentUri = uri
            task.localUri = uri.toString()
            return out
          }
        }
      } catch (_: Exception) {}
    }

    val publicDownloads =
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    val bdmDir = File(publicDownloads, "BDM")
    if (!bdmDir.exists()) {
      bdmDir.mkdirs()
    }
    var candidateFile = File(bdmDir, task.fileName)
    if (candidateFile.exists() && !candidateFile.delete()) {
      val base = task.fileName.substringBeforeLast(".")
      val ext = task.fileName.substringAfterLast(".", "mp4")
      candidateFile = File(bdmDir, "${base}_${System.currentTimeMillis()}.$ext")
    }
    task.destFile = candidateFile
    task.localUri = Uri.fromFile(candidateFile).toString()
    return FileOutputStream(candidateFile)
  }

  private fun cleanupPartialDownload(task: CustomDownloadTask) {
    try {
      task.contentUri?.let { uri ->
        reactContext.contentResolver.delete(uri, null, null)
      }
    } catch (_: Exception) {}
    try {
      task.destFile?.let { file ->
        if (file.exists()) {
          file.delete()
        }
      }
    } catch (_: Exception) {}
  }

  private fun executeCustomDownload(task: CustomDownloadTask, userAgent: String?) {
    var conn: HttpURLConnection? = null
    var outStream: OutputStream? = null

    try {
      syncForegroundServiceState(task)
      emitTaskState(task)

      val output = createDownloadOutputStream(task)
      outStream = output

      val buffer = ByteArray(64 * 1024)
      var lastEmitTime = System.currentTimeMillis()
      var resumeAttempt = 0
      val maxResumeAttempts = 20

      while (!task.cancelled) {
        try {
          val resumeOffset = task.bytesDownloaded
          val (resolvedConn, _) =
              openFollowRedirects(task.url, null, userAgent, false, resumeOffset)
          conn = resolvedConn
          task.connection = conn

          if (task.cancelled) {
            conn.disconnect()
            break
          }

          val responseCode = conn.responseCode
          if (responseCode !in 200..299) {
            throw IllegalStateException("Server returned HTTP $responseCode.")
          }

          if (task.totalBytes <= 0L) {
            val totalBytes = parseTotalBytesFromHeaders(conn)
            if (totalBytes > 0L) {
              task.totalBytes = totalBytes
            }
          }

          emitTaskState(task)

          var bytesRead: Int
          conn.inputStream.use { input ->
            while (input.read(buffer).also { bytesRead = it } != -1) {
              if (task.cancelled) {
                break
              }
              output.write(buffer, 0, bytesRead)
              task.bytesDownloaded += bytesRead
              // Reset retry counter whenever data is actively flowing
              resumeAttempt = 0

              if (task.totalBytes > 0L) {
                task.progress =
                    ((task.bytesDownloaded.toDouble() / task.totalBytes.toDouble()) * 100.0)
                        .coerceIn(0.0, 99.9)
              }

              val now = System.currentTimeMillis()
              if (now - lastEmitTime >= 450L) {
                lastEmitTime = now
                emitTaskState(task)
              }
            }
          }

          output.flush()

          // Check if full file has been downloaded or if stream ended normally
          if (task.cancelled ||
              task.totalBytes <= 0L ||
              task.bytesDownloaded >= task.totalBytes) {
            break
          } else {
            throw java.io.EOFException("Stream closed early before reaching totalBytes")
          }
        } catch (streamErr: Exception) {
          try {
            conn?.disconnect()
          } catch (_: Exception) {}
          conn = null
          task.connection = null

          if (task.cancelled) {
            break
          }

          resumeAttempt++
          if (resumeAttempt > maxResumeAttempts) {
            throw streamErr
          }

          // Wait briefly and auto-resume from task.bytesDownloaded using HTTP Range header
          try {
            val backoffMs = (resumeAttempt * 1500L).coerceAtMost(5000L)
            Thread.sleep(backoffMs)
          } catch (_: InterruptedException) {}
        }
      }

      output.flush()
      output.close()
      outStream = null

      if (task.cancelled) {
        cleanupPartialDownload(task)
        task.status = "cancelled"
        task.progress = 0.0
        emitTaskState(task)
        return
      }

      if (task.totalBytes <= 0L && task.bytesDownloaded > 0L) {
        task.totalBytes = task.bytesDownloaded
      }

      // If saved via File, register with MediaScanner so content:// URI is available
      val file = task.destFile
      if (file != null && task.contentUri == null) {
        try {
          MediaScannerConnection.scanFile(
              reactContext,
              arrayOf(file.absolutePath),
              arrayOf(task.mimeType)
          ) { _, scannedUri ->
            if (scannedUri != null) {
              task.contentUri = scannedUri
              task.localUri = scannedUri.toString()
            }
          }
        } catch (_: Exception) {}
      }

      task.status = "completed"
      task.progress = 100.0
      emitTaskState(task)
    } catch (e: Exception) {
      try {
        outStream?.close()
      } catch (_: Exception) {}
      cleanupPartialDownload(task)

      if (task.cancelled) {
        task.status = "cancelled"
        task.progress = 0.0
      } else {
        task.status = "failed"
        task.errorMessage = e.message ?: "Network HTTP transfer error."
      }
      emitTaskState(task)
    } finally {
      try {
        outStream?.close()
      } catch (_: Exception) {}
      try {
        conn?.disconnect()
      } catch (_: Exception) {}
      task.connection = null
      syncForegroundServiceState(null)
    }
  }

  private fun fetchHtmlContent(
      targetUrl: String,
      refererUrl: String?,
      userAgent: String?
  ): String? {
    var conn: HttpURLConnection? = null
    return try {
      conn =
          (URL(targetUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            instanceFollowRedirects = true
            if (!userAgent.isNullOrBlank()) {
              setRequestProperty("User-Agent", userAgent)
            }
            if (!refererUrl.isNullOrBlank()) {
              setRequestProperty("Referer", refererUrl)
            }
          }
      if (conn.responseCode in 200..299) {
        conn.inputStream.bufferedReader().use { it.readText() }
      } else {
        null
      }
    } catch (_: Exception) {
      null
    } finally {
      try {
        conn?.disconnect()
      } catch (_: Exception) {}
    }
  }

  @ReactMethod
  fun extractVideosFromEmbedUrl(
      embedUrl: String,
      refererUrl: String?,
      userAgent: String?,
      promise: Promise
  ) {
    probeExecutor.execute {
      try {
        val trimmedEmbed = embedUrl.trim()
        if (!trimmedEmbed.startsWith("http://", ignoreCase = true) &&
            !trimmedEmbed.startsWith("https://", ignoreCase = true)) {
          promise.resolve(Arguments.createArray())
          return@execute
        }

        val resultArray = Arguments.createArray()
        val seenPreRedirectUrls = HashSet<String>()
        val seenFinalUrls = HashSet<String>()
        val visitedPages = HashSet<String>()

        data class RawCandidate(
            val resolvedUrl: String,
            val pageUrl: String,
            val baseTitle: String,
            val label: String?,
            val extHint: String
        )

        val candidates = ArrayList<RawCandidate>()

        fun scanPageHtml(pageUrl: String, refUrl: String?, depth: Int) {
          if (depth > 2 || !visitedPages.add(pageUrl)) {
            return
          }
          val html = fetchHtmlContent(pageUrl, refUrl, userAgent) ?: return
          val baseUri =
              try {
                URI(pageUrl)
              } catch (_: Exception) {
                return
              }

          val titleMatch =
              Regex("""var\s+title\s*=\s*["']([^"']+)["']""").find(html)?.groupValues?.get(1)
                  ?: Regex("""<title>([^<]+)</title>""", RegexOption.IGNORE_CASE)
                      .find(html)
                      ?.groupValues
                      ?.get(1)
                      ?.trim()
                  ?: "Embedded Video"

          fun queueCandidate(rawUrl: String, label: String?, extHint: String) {
            val cleaned = rawUrl.replace("\\/", "/").trim()
            if (cleaned.isEmpty() ||
                cleaned.startsWith("blob:", ignoreCase = true) ||
                cleaned.startsWith("data:", ignoreCase = true) ||
                cleaned.contains(".m3u8", ignoreCase = true) ||
                cleaned.contains(".mpd", ignoreCase = true)) {
              return
            }
            val resolvedUrl =
                try {
                  baseUri.resolve(cleaned).toString()
                } catch (_: Exception) {
                  return
                }
            if (!resolvedUrl.startsWith("http://", ignoreCase = true) &&
                !resolvedUrl.startsWith("https://", ignoreCase = true)) {
              return
            }
            if (!seenPreRedirectUrls.add(resolvedUrl)) {
              return
            }
            candidates.add(
                RawCandidate(
                    resolvedUrl = resolvedUrl,
                    pageUrl = pageUrl,
                    baseTitle = titleMatch,
                    label = label,
                    extHint = extHint
                )
            )
          }

          // 1. Parse `var qualities = [...]` JSON arrays (used by OPlayer / 9animez / multi-quality embeds)
          val qualitiesRegex = Regex("""var\s+qualities\s*=\s*(\[[^\]]+\])""")
          qualitiesRegex.findAll(html).forEach { match ->
            try {
              val arr = JSONArray(match.groupValues[1])
              for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val qUrl = obj.optString("url", "")
                val qName = obj.optString("name", "")
                val qType = obj.optString("type", "")
                if (qUrl.isNotBlank() && !qType.equals("hls", ignoreCase = true)) {
                  val ext = if (qType.contains("webm", ignoreCase = true)) "webm" else "mp4"
                  queueCandidate(qUrl, qName, ext)
                }
              }
            } catch (_: Exception) {}
          }

          // 2. Parse <a class="dl-item" href="..." download="..."> links on embed download pages
          val dlItemRegex =
              Regex(
                  """<a\b[^>]*?\bhref\s*=\s*["']([^"']+/stream/[^"']+)["'][^>]*>([\s\S]*?)</a>""",
                  RegexOption.IGNORE_CASE
              )
          dlItemRegex.findAll(html).forEach { match ->
            val href = match.groupValues[1]
            val innerHtml = match.groupValues[2]
            val qBadge =
                Regex("""\b(\d{3,4}p)\b""", RegexOption.IGNORE_CASE)
                    .find(innerHtml)
                    ?.groupValues
                    ?.get(1)
            queueCandidate(href, qBadge, "mp4")
          }

          // 3. Parse <video> and <source> tags (including label / res / size / type attributes)
          val mediaTagRegex =
              Regex(
                  """<(?:video|source)\b([^>]+)>""",
                  RegexOption.IGNORE_CASE
              )
          mediaTagRegex.findAll(html).forEach { match ->
            val attrs = match.groupValues[1]
            val src =
                Regex("""\bsrc\s*=\s*["']([^"']+)["']""", RegexOption.IGNORE_CASE)
                    .find(attrs)
                    ?.groupValues
                    ?.get(1)
                    ?: return@forEach
            val typeAttr =
                Regex("""\btype\s*=\s*["']([^"']+)["']""", RegexOption.IGNORE_CASE)
                    .find(attrs)
                    ?.groupValues
                    ?.get(1)
                    ?: ""
            val labelAttr =
                Regex(
                        """\b(?:label|res|size|data-quality|title)\s*=\s*["']([^"']+)["']""",
                        RegexOption.IGNORE_CASE
                    )
                    .find(attrs)
                    ?.groupValues
                    ?.get(1)
            val ext = if (typeAttr.contains("webm", ignoreCase = true)) "webm" else "mp4"
            queueCandidate(src, labelAttr, ext)
          }

          // 4. Parse direct .mp4 / .webm URLs or /stream/<res>/ paths in inline player scripts
          val directStreamRegex =
              Regex(
                  """["']((?:https?:\\?/\\?/[^"'\s]+|\/stream\/\d+\/[^"'\s]+)(?:\.mp4|\.webm)?)["']""",
                  RegexOption.IGNORE_CASE
              )
          directStreamRegex.findAll(html).forEach { match ->
            val candidate = match.groupValues[1].replace("\\/", "/")
            val lower = candidate.lowercase()
            if (lower.contains("/stream/") ||
                lower.substringBefore("?").endsWith(".mp4") ||
                lower.substringBefore("?").endsWith(".webm")) {
              queueCandidate(candidate, null, if (lower.contains(".webm")) "webm" else "mp4")
            }
          }

          // 5. Follow embedded <iframe src="..."> player URLs on the page (up to depth 2)
          if (depth < 2) {
            val iframeRegex =
                Regex(
                    """<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""",
                    RegexOption.IGNORE_CASE
                )
            var iframeCount = 0
            iframeRegex.findAll(html).forEach { match ->
              if (iframeCount >= 3) return@forEach
              val rawIframeSrc = match.groupValues[1].trim()
              val resolvedIframe =
                  try {
                    baseUri.resolve(rawIframeSrc).toString()
                  } catch (_: Exception) {
                    return@forEach
                  }
              val lower = resolvedIframe.lowercase()
              if ((lower.startsWith("http://") || lower.startsWith("https://")) &&
                  !lower.contains("google.com") &&
                  !lower.contains("doubleclick.net") &&
                  !lower.contains("chatbro.com") &&
                  !lower.contains("facebook.com")) {
                iframeCount++
                scanPageHtml(resolvedIframe, pageUrl, depth + 1)
              }
            }
          }
        }

        scanPageHtml(trimmedEmbed, refererUrl, 0)

        // Probe each candidate to resolve 302 redirects (e.g. workers.dev signed stream URL) and exact fileSize
        for (cand in candidates) {
          val probed =
              probeStreamMetadata(
                  cand.resolvedUrl,
                  cand.pageUrl,
                  userAgent,
                  cand.extHint
              )
          if (!seenFinalUrls.add(probed.finalUrl)) {
            continue
          }

          val quality =
              extractQualityLabel(cand.label, cand.resolvedUrl)
                  ?: extractQualityLabel(null, probed.finalUrl)

          val displayLabel = quality ?: cand.label
          val fullTitle =
              if (!displayLabel.isNullOrBlank() &&
                  !cand.baseTitle.contains(displayLabel, ignoreCase = true)) {
                "${cand.baseTitle} ($displayLabel)"
              } else {
                cand.baseTitle
              }

          val itemMap = Arguments.createMap()
          itemMap.putString("url", probed.finalUrl)
          itemMap.putString("originalUrl", cand.resolvedUrl)
          itemMap.putString("title", fullTitle)
          itemMap.putString("extension", probed.extension)
          itemMap.putString("mimeType", probed.mimeType)
          if (!quality.isNullOrBlank()) {
            itemMap.putString("quality", quality.uppercase().replace("P", "p"))
          }
          if (probed.fileSize > 0L) {
            itemMap.putDouble("fileSize", probed.fileSize.toDouble())
          }
          resultArray.pushMap(itemMap)
        }

        promise.resolve(resultArray)
      } catch (_: Exception) {
        promise.resolve(Arguments.createArray())
      }
    }
  }

  private fun queryLegacyDownloadInternal(dmId: Long): WritableMap? {
    val query = DownloadManager.Query().setFilterById(dmId)
    var cursor: Cursor? = null
    try {
      cursor = downloadManager.query(query)
      if (cursor != null && cursor.moveToFirst()) {
        val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        val downloadedIdx =
            cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
        val totalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
        val localUriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)

        val rawStatus = if (statusIdx >= 0) cursor.getInt(statusIdx) else -1
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
        return map
      }
      return null
    } catch (_: Exception) {
      return null
    } finally {
      cursor?.close()
    }
  }

  @ReactMethod
  fun queryDownload(downloadIdStr: String, promise: Promise) {
    try {
      val customTask = customTasks[downloadIdStr]
      if (customTask != null) {
        promise.resolve(buildTaskWritableMap(customTask))
        return
      }
      val dmId = downloadIdStr.toLongOrNull()
      if (dmId != null) {
        val legacy = queryLegacyDownloadInternal(dmId)
        if (legacy != null) {
          promise.resolve(legacy)
          return
        }
      }
      promise.reject("QUERY_FAILED", "Unable to query download $downloadIdStr")
    } catch (e: Exception) {
      promise.reject("QUERY_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cancelDownload(downloadIdStr: String, promise: Promise) {
    try {
      val customTask = customTasks[downloadIdStr]
      if (customTask != null) {
        customTask.cancelled = true
        customTask.status = "cancelled"
        try {
          customTask.connection?.disconnect()
        } catch (_: Exception) {}
        cleanupPartialDownload(customTask)
        emitTaskState(customTask)
        promise.resolve(true)
        return
      }

      val dmId = downloadIdStr.toLongOrNull()
      if (dmId != null) {
        val removedCount = downloadManager.remove(dmId)
        promise.resolve(removedCount > 0)
        return
      }
      promise.resolve(false)
    } catch (e: Exception) {
      promise.reject("CANCEL_ERROR", e.message ?: "Failed to cancel download", e)
    }
  }

  @ReactMethod
  fun removeDownloadedFile(downloadIdStr: String, promise: Promise) {
    try {
      val customTask = customTasks.remove(downloadIdStr)
      if (customTask != null) {
        customTask.cancelled = true
        try {
          customTask.connection?.disconnect()
        } catch (_: Exception) {}
        cleanupPartialDownload(customTask)
        notificationManager.cancel(customTask.notificationId)
        promise.resolve(true)
        return
      }

      val dmId = downloadIdStr.toLongOrNull()
      if (dmId != null) {
        val removedCount = downloadManager.remove(dmId)
        promise.resolve(removedCount > 0)
        return
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("REMOVE_ERROR", e.message ?: "Failed to delete file", e)
    }
  }

  private fun resolvePlayableContentUri(downloadIdStr: String): Uri? {
    val customTask = customTasks[downloadIdStr]
    if (customTask != null) {
      if (customTask.contentUri != null) {
        return customTask.contentUri
      }
      val destFile = customTask.destFile
      if (destFile != null && destFile.exists()) {
        return Uri.fromFile(destFile)
      }
    }
    val dmId = downloadIdStr.toLongOrNull()
    if (dmId != null) {
      return try {
        downloadManager.getUriForDownloadedFile(dmId)
      } catch (_: Exception) {
        null
      }
    }
    return null
  }

  @ReactMethod
  fun openDownloadedFile(downloadIdStr: String, mimeType: String, promise: Promise) {
    try {
      val contentUri = resolvePlayableContentUri(downloadIdStr)
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
      val contentUri = resolvePlayableContentUri(downloadIdStr)
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

  override fun onHostResume() {}

  override fun onHostPause() {}

  override fun onHostDestroy() {}
}
