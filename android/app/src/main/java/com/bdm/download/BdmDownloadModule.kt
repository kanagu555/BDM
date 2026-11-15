package com.bdm.download

import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.graphics.BitmapFactory
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.bdm.R
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.reactnativecommunity.webview.RNCWebView
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONArray

class BdmDownloadModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  companion object {
    const val NAME = "BdmDownloadModule"
    const val EVENT_DOWNLOAD_PROGRESS = "BDM_DOWNLOAD_PROGRESS"
    const val EVENT_STREAM_DETECTED = "BDM_STREAM_DETECTED"
    private const val NOTIFICATION_CHANNEL_ID = "bdm_downloads_channel"
    private const val NOTIFICATION_CHANNEL_NAME = "BDM Video Downloads"
    private const val PREFS_NAME = "bdm_persistent_store"
    private const val PREF_KEY_APP_STATE = "app_state_json"
  }

  private data class ProbedStreamInfo(
      val finalUrl: String,
      val fileSize: Long,
      val mimeType: String,
      val extension: String,
      val isValidMedia: Boolean = true,
      val resumable: Boolean = false
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
    @Volatile var completedSegments: Int = 0
    @Volatile var localUri: String? = null
    @Volatile var errorMessage: String? = null
    @Volatile var cancelled: Boolean = false
    @Volatile var paused: Boolean = false
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
  private val sniffedHeadersByUrl = ConcurrentHashMap<String, Map<String, String>>()
  private val sniffedUrlLastSeen = ConcurrentHashMap<String, Long>()
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

  private fun unescapeDisplayTitle(raw: String): String {
    var result = raw
    val unicodeRegex = Regex("""\\u([0-9a-fA-F]{4})""")
    result =
        unicodeRegex.replace(result) { match ->
          val code = match.groupValues[1].toInt(16)
          code.toChar().toString()
        }
    return result
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .trim()
  }

  private fun updateNotification(task: CustomDownloadTask) {
    try {
      ensureNotificationChannel()
      val cleanTitle = unescapeDisplayTitle(task.title.ifBlank { task.fileName })
      val largeIconBitmap =
          try {
            BitmapFactory.decodeResource(reactContext.resources, R.mipmap.ic_launcher)
          } catch (_: Exception) {
            null
          }

      val builder =
          NotificationCompat.Builder(reactContext, NOTIFICATION_CHANNEL_ID)
              .setSmallIcon(R.drawable.ic_stat_bdm)
              .setColor(0xFF7C5CFC.toInt())
              .setContentTitle(cleanTitle)
              .setOnlyAlertOnce(true)
              .setPriority(NotificationCompat.PRIORITY_LOW)

      if (largeIconBitmap != null) {
        builder.setLargeIcon(largeIconBitmap)
      }

      when (task.status) {
        "downloading", "pending" -> {
          // While downloading, update the single Foreground Service notification (ID 9001)
          // so only ONE notification appears in the shade with progress + screen-off protection.
          syncForegroundServiceState(task)
          notificationManager.cancel(task.notificationId)
        }
        "completed" -> {
          builder
              .setSmallIcon(R.drawable.ic_stat_bdm)
              .setContentText("Download complete • Downloads/BDM/${task.fileName}")
              .setProgress(0, 0, false)
              .setOngoing(false)
              .setAutoCancel(true)
          notificationManager.notify(task.notificationId, builder.build())
        }
        "failed" -> {
          builder
              .setSmallIcon(R.drawable.ic_stat_bdm)
              .setContentText(task.errorMessage ?: "Download failed")
              .setProgress(0, 0, false)
              .setOngoing(false)
              .setAutoCancel(true)
          notificationManager.notify(task.notificationId, builder.build())
        }
        "cancelled", "paused" -> {
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
    map.putInt("completedSegments", task.completedSegments)
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
      val runningTasks =
          customTasks.values.filter { it.status == "downloading" || it.status == "pending" }
      if (runningTasks.isNotEmpty()) {
        val displayTask = activeTask ?: runningTasks.first()
        val pct = displayTask.progress.toInt().coerceIn(0, 100)
        val cleanTitle = unescapeDisplayTitle(displayTask.title.ifBlank { displayTask.fileName })
        val progressText =
            if (runningTasks.size > 1) {
              "Downloading ${runningTasks.size} videos ($pct%) • Downloads/BDM"
            } else if (displayTask.totalBytes > 0L) {
              "Downloading ($pct%) • Downloads/BDM/${displayTask.fileName}"
            } else {
              "Downloading • Downloads/BDM/${displayTask.fileName}"
            }

        val intent =
            Intent(reactContext, BdmDownloadForegroundService::class.java).apply {
              action = BdmDownloadForegroundService.ACTION_START
              putExtra(BdmDownloadForegroundService.EXTRA_TITLE, cleanTitle)
              putExtra(BdmDownloadForegroundService.EXTRA_PROGRESS_TEXT, progressText)
              putExtra(BdmDownloadForegroundService.EXTRA_PROGRESS_PCT, pct)
              putExtra(
                  BdmDownloadForegroundService.EXTRA_INDETERMINATE,
                  displayTask.totalBytes <= 0L
              )
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
      rangeStartByte: Long = 0L,
      extraHeaders: Map<String, String>? = null
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
            val headerUa =
                extraHeaders?.entries?.firstOrNull { it.key.equals("User-Agent", true) }?.value
            val resolvedUa = if (!userAgent.isNullOrBlank()) userAgent else headerUa
            if (!resolvedUa.isNullOrBlank()) {
              setRequestProperty("User-Agent", resolvedUa)
            }
            val headerRef =
                extraHeaders?.entries?.firstOrNull { it.key.equals("Referer", true) }?.value
            val resolvedRef = if (!currentReferer.isNullOrBlank()) currentReferer else headerRef
            if (!resolvedRef.isNullOrBlank()) {
              setRequestProperty("Referer", resolvedRef)
            } else {
              try {
                val parsed = Uri.parse(currentUrl)
                val origin = "${parsed.scheme}://${parsed.host}/"
                setRequestProperty("Referer", origin)
              } catch (_: Exception) {}
            }
            val headerOrigin =
                extraHeaders?.entries?.firstOrNull { it.key.equals("Origin", true) }?.value
            if (!headerOrigin.isNullOrBlank()) {
              setRequestProperty("Origin", headerOrigin)
            }
            val headerCookie =
                extraHeaders?.entries?.firstOrNull { it.key.equals("Cookie", true) }?.value
            if (!headerCookie.isNullOrBlank()) {
              setRequestProperty("Cookie", headerCookie)
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
        val isNonVideoContent =
            rawContentType.contains("text/html") ||
                rawContentType.contains("application/xhtml") ||
                rawContentType.contains("application/json") ||
                rawContentType.contains("text/plain") ||
                rawContentType.contains("javascript") ||
                rawContentType.contains("text/css") ||
                rawContentType.contains("image/")
        if (isNonVideoContent) {
          return ProbedStreamInfo(
              finalUrl = finalUrl,
              fileSize = 0L,
              mimeType = defaultMime,
              extension = defaultExt,
              isValidMedia = false
          )
        }
        val ext =
            if (rawContentType.contains("webm") ||
                finalUrl.substringBefore("?").endsWith(".webm", ignoreCase = true) ||
                defaultExt == "webm") {
              "webm"
            } else {
              "mp4"
            }
        val mime = if (ext == "webm") "video/webm" else "video/mp4"
        val acceptRanges = (conn.getHeaderField("Accept-Ranges") ?: "").lowercase()
        val isResumable = code == 206 || (acceptRanges.contains("bytes") && !acceptRanges.contains("none"))
        ProbedStreamInfo(
            finalUrl = finalUrl,
            fileSize = totalBytes,
            mimeType = mime,
            extension = ext,
            isValidMedia = true,
            resumable = isResumable
        )
      } else {
        ProbedStreamInfo(
            finalUrl = rawUrl,
            fileSize = 0L,
            mimeType = defaultMime,
            extension = defaultExt,
            isValidMedia = false
        )
      }
    } catch (_: Exception) {
      ProbedStreamInfo(
          finalUrl = rawUrl,
          fileSize = 0L,
          mimeType = defaultMime,
          extension = defaultExt,
          isValidMedia = false
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

  private fun findRncWebViews(root: View, out: MutableList<RNCWebView>) {
    if (root is RNCWebView) {
      out.add(root)
    } else if (root is ViewGroup) {
      for (i in 0 until root.childCount) {
        findRncWebViews(root.getChildAt(i), out)
      }
    }
  }

  @ReactMethod
  fun attachWebViewSniffer(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    activity.runOnUiThread {
      try {
        val views = ArrayList<RNCWebView>()
        findRncWebViews(activity.window.decorView, views)
        var attached = false
        for (wv in views) {
          val currentClient = wv.rncWebViewClient
          if (currentClient !is BdmSniffingWebViewClient) {
            wv.webViewClient =
                BdmSniffingWebViewClient { sniffedUrl, headers ->
                  onWebViewMediaSniffed(sniffedUrl, headers)
                }
            attached = true
          } else {
            attached = true
          }
        }
        promise.resolve(attached)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  private fun emitStreamDetected(videos: List<WritableMap>) {
    if (videos.isEmpty() || !reactContext.hasActiveReactInstance()) return
    try {
      val arr = Arguments.createArray()
      for (v in videos) {
        arr.pushMap(v)
      }
      val payload = Arguments.createMap()
      payload.putArray("videos", arr)
      reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_STREAM_DETECTED, payload)
    } catch (_: Exception) {}
  }

  private fun fetchTextWithHeaders(url: String, headers: Map<String, String>): String? {
    var conn: HttpURLConnection? = null
    return try {
      val (resolved, _) = openFollowRedirects(url, null, null, false, 0L, headers)
      conn = resolved
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

  private fun parseHlsPlaylistDurationAndFirstSegment(
      playlistText: String,
      baseUri: URI
  ): Pair<Double, String?> {
    var durationSum = 0.0
    var firstSegmentUrl: String? = null
    val lines = playlistText.lines()
    for (rawLine in lines) {
      val line = rawLine.trim()
      if (line.startsWith("#EXTINF:", ignoreCase = true)) {
        val durStr = line.substringAfter(":").substringBefore(",").trim()
        val d = durStr.toDoubleOrNull()
        if (d != null && d > 0.0) {
          durationSum += d
        }
      } else if (line.isNotEmpty() && !line.startsWith("#")) {
        if (firstSegmentUrl == null) {
          firstSegmentUrl =
              try {
                baseUri.resolve(line).toString()
              } catch (_: Exception) {
                null
              }
        }
      }
    }
    return Pair(durationSum, firstSegmentUrl)
  }

  private fun onWebViewMediaSniffed(url: String, headers: Map<String, String>) {
    val now = System.currentTimeMillis()
    val prevSeen = sniffedUrlLastSeen[url]
    if (prevSeen != null && (now - prevSeen) < 15000L) {
      return
    }
    sniffedUrlLastSeen[url] = now
    sniffedHeadersByUrl[url] = headers

    probeExecutor.execute {
      try {
        val lower = url.lowercase()
        val isHls = lower.substringBefore("?").endsWith(".m3u8") || lower.contains(".m3u8?")
        if (isHls) {
          val playlistText = fetchTextWithHeaders(url, headers) ?: return@execute
          if (!playlistText.contains("#EXTM3U", ignoreCase = true)) {
            return@execute
          }

          val baseUri =
              try {
                URI(url)
              } catch (_: Exception) {
                return@execute
              }

          if (playlistText.contains("#EXT-X-STREAM-INF", ignoreCase = true)) {
            // Master playlist with multiple quality variants (1080p, 720p, 360p, etc.)
            data class HlsVariant(
                val variantUrl: String,
                val bandwidth: Long,
                val resolution: String?,
                val qualityLabel: String?
            )
            val variants = ArrayList<HlsVariant>()
            val lines = playlistText.lines()
            var pendingAttrs: String? = null
            for (rawLine in lines) {
              val line = rawLine.trim()
              if (line.startsWith("#EXT-X-STREAM-INF:", ignoreCase = true)) {
                pendingAttrs = line.substringAfter(":")
              } else if (pendingAttrs != null && line.isNotEmpty() && !line.startsWith("#")) {
                val resolvedVariant =
                    try {
                      baseUri.resolve(line).toString()
                    } catch (_: Exception) {
                      null
                    }
                if (resolvedVariant != null) {
                  sniffedHeadersByUrl[resolvedVariant] = headers
                  val bwMatch = Regex("""BANDWIDTH=(\d+)""").find(pendingAttrs)
                  val bandwidth = bwMatch?.groupValues?.get(1)?.toLongOrNull() ?: 0L
                  val resMatch = Regex("""RESOLUTION=(\d+x\d+)""").find(pendingAttrs)
                  val resolution = resMatch?.groupValues?.get(1)
                  val height = resolution?.substringAfter("x")?.toIntOrNull()
                  val qLabel =
                      when {
                        height != null && height >= 2160 -> "2160p"
                        height != null && height >= 1440 -> "1440p"
                        height != null && height >= 1080 -> "1080p"
                        height != null && height >= 720 -> "720p"
                        height != null && height >= 480 -> "480p"
                        height != null && height >= 360 -> "360p"
                        height != null && height >= 240 -> "240p"
                        else -> extractQualityLabel(pendingAttrs, resolvedVariant)
                      }
                  variants.add(HlsVariant(resolvedVariant, bandwidth, resolution, qLabel))
                }
                pendingAttrs = null
              }
            }

            if (variants.isEmpty()) return@execute

            // Probe first variant playlist to get exact video duration
            var durationSec = 0.0
            try {
              val firstMediaText = fetchTextWithHeaders(variants[0].variantUrl, headers)
              if (firstMediaText != null) {
                durationSec =
                    parseHlsPlaylistDurationAndFirstSegment(
                            firstMediaText,
                            URI(variants[0].variantUrl)
                        )
                        .first
              }
            } catch (_: Exception) {}

            val sortedVariants = variants.sortedByDescending { it.bandwidth }
            val emittedList = ArrayList<WritableMap>()
            for (v in sortedVariants) {
              val estimatedSize =
                  if (v.bandwidth > 0L && durationSec > 0.0) {
                    ((v.bandwidth.toDouble() * durationSec) / 8.0).toLong()
                  } else {
                    0L
                  }
              val map = Arguments.createMap()
              map.putString("url", v.variantUrl)
              map.putString("originalUrl", url)
              map.putString("extension", "mp4")
              map.putString("mimeType", "application/x-mpegURL")
              map.putBoolean("resumable", true)
              if (!v.qualityLabel.isNullOrBlank()) {
                map.putString("quality", v.qualityLabel)
              }
              if (estimatedSize > 0L) {
                map.putDouble("fileSize", estimatedSize.toDouble())
              }
              if (durationSec > 0.0) {
                map.putDouble("durationSeconds", kotlin.math.round(durationSec))
              }
              emittedList.add(map)
            }
            emitStreamDetected(emittedList)
          } else if (playlistText.contains("#EXTINF", ignoreCase = true)) {
            // Single media playlist (e.g. index-f3.m3u8)
            val (durationSec, firstSegUrl) =
                parseHlsPlaylistDurationAndFirstSegment(playlistText, baseUri)
            val segCount =
                playlistText.lines().count { l ->
                  val t = l.trim()
                  t.isNotEmpty() && !t.startsWith("#")
                }
            var estimatedSize = 0L
            if (firstSegUrl != null && segCount > 0) {
              val segProbe = probeStreamMetadata(firstSegUrl, null, null, "mp4")
              if (segProbe.fileSize > 0L) {
                estimatedSize = segProbe.fileSize * segCount
              }
            }
            val qLabel = extractQualityLabel(null, url)
            val map = Arguments.createMap()
            map.putString("url", url)
            map.putString("originalUrl", url)
            map.putString("extension", "mp4")
            map.putString("mimeType", "application/x-mpegURL")
            map.putBoolean("resumable", true)
            if (!qLabel.isNullOrBlank()) {
              map.putString("quality", qLabel)
            }
            if (estimatedSize > 0L) {
              map.putDouble("fileSize", estimatedSize.toDouble())
            }
            if (durationSec > 0.0) {
              map.putDouble("durationSeconds", kotlin.math.round(durationSec))
            }
            emitStreamDetected(listOf(map))
          }
        } else {
          val probed = probeStreamMetadata(url, null, null, "mp4")
          if (!probed.isValidMedia) {
            return@execute
          }
          // Skip tiny non-video responses (< 50 KB)
          if (probed.fileSize in 1L..51200L) {
            return@execute
          }
          sniffedHeadersByUrl[probed.finalUrl] = headers
          val qLabel = extractQualityLabel(null, url) ?: extractQualityLabel(null, probed.finalUrl)
          val map = Arguments.createMap()
          map.putString("url", probed.finalUrl)
          map.putString("originalUrl", url)
          map.putString("extension", probed.extension)
          map.putString("mimeType", probed.mimeType)
          map.putBoolean("resumable", probed.resumable)
          if (!qLabel.isNullOrBlank()) {
            map.putString("quality", qLabel)
          }
          if (probed.fileSize > 0L) {
            map.putDouble("fileSize", probed.fileSize.toDouble())
          }
          emitStreamDetected(listOf(map))
        }
      } catch (_: Exception) {}
    }
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
        map.putBoolean("resumable", probed.resumable)
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
      val cleanTitle = unescapeDisplayTitle(title.ifBlank { fileName })
      val safeFileName = sanitizeFileName(unescapeDisplayTitle(fileName), ext)
      val resolvedMime = mimeType.ifBlank { "video/$ext" }
      val downloadId = nextCustomDownloadId.incrementAndGet().toString()
      val notificationId = (downloadId.hashCode() and 0x7FFFFFFF).coerceAtLeast(1001)

      val task =
          CustomDownloadTask(
              downloadId = downloadId,
              url = trimmedUrl,
              fileName = safeFileName,
              title = cleanTitle.ifBlank { safeFileName },
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

  private fun getPartialsDir(): File {
    val dir = File(reactContext.filesDir, "bdm_partials")
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return dir
  }

  private fun getDirectPartFile(downloadId: String): File =
      File(getPartialsDir(), "bdm_part_$downloadId.tmp")

  private fun getHlsPartTsFile(downloadId: String): File =
      File(getPartialsDir(), "bdm_hls_$downloadId.ts")

  private fun getHlsPartMp4File(downloadId: String): File =
      File(getPartialsDir(), "bdm_hls_$downloadId.mp4")

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
    try {
      val directPart = getDirectPartFile(task.downloadId)
      if (directPart.exists()) directPart.delete()
    } catch (_: Exception) {}
    try {
      val hlsTs = getHlsPartTsFile(task.downloadId)
      if (hlsTs.exists()) hlsTs.delete()
    } catch (_: Exception) {}
    try {
      val hlsMp4 = getHlsPartMp4File(task.downloadId)
      if (hlsMp4.exists()) hlsMp4.delete()
    } catch (_: Exception) {}
  }

  private fun remuxTsToMp4(inputTsFile: File, outputMp4File: File): Boolean {
    var extractor: MediaExtractor? = null
    var muxer: MediaMuxer? = null
    return try {
      extractor = MediaExtractor()
      extractor.setDataSource(inputTsFile.absolutePath)
      val trackCount = extractor.trackCount
      if (trackCount <= 0) {
        return false
      }

      muxer = MediaMuxer(outputMp4File.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val trackIndexMap = HashMap<Int, Int>()
      var maxInputSize = 512 * 1024

      for (i in 0 until trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("video/") || mime.startsWith("audio/")) {
          val muxerTrackIndex = muxer.addTrack(format)
          trackIndexMap[i] = muxerTrackIndex
          extractor.selectTrack(i)
          if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
            val s = format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
            if (s > maxInputSize) maxInputSize = s
          }
        }
      }

      if (trackIndexMap.isEmpty()) {
        return false
      }

      muxer.start()
      val buffer = ByteBuffer.allocate(maxInputSize)
      val bufferInfo = MediaCodec.BufferInfo()

      while (true) {
        val sampleTrackIndex = extractor.sampleTrackIndex
        if (sampleTrackIndex < 0) {
          break
        }
        val muxerTrackIndex = trackIndexMap[sampleTrackIndex]
        if (muxerTrackIndex == null) {
          extractor.advance()
          continue
        }
        val sampleSize = extractor.readSampleData(buffer, 0)
        if (sampleSize < 0) {
          break
        }
        bufferInfo.offset = 0
        bufferInfo.size = sampleSize
        bufferInfo.presentationTimeUs = extractor.sampleTime.coerceAtLeast(0L)
        @Suppress("DEPRECATION")
        bufferInfo.flags = extractor.sampleFlags
        muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo)
        extractor.advance()
      }

      muxer.stop()
      outputMp4File.exists() && outputMp4File.length() > 1024L
    } catch (_: Exception) {
      false
    } finally {
      try {
        muxer?.release()
      } catch (_: Exception) {}
      try {
        extractor?.release()
      } catch (_: Exception) {}
    }
  }

  private fun downloadBytesWithRetry(
      url: String,
      userAgent: String?,
      headers: Map<String, String>?,
      task: CustomDownloadTask
  ): ByteArray {
    var lastErr: Exception? = null
    for (attempt in 1..6) {
      if (task.cancelled) {
        throw InterruptedException("Download cancelled")
      }
      var conn: HttpURLConnection? = null
      try {
        val (resolvedConn, _) = openFollowRedirects(url, null, userAgent, false, 0L, headers)
        conn = resolvedConn
        task.connection = conn
        val code = conn.responseCode
        if (code !in 200..299) {
          throw IllegalStateException("Segment HTTP $code")
        }
        return conn.inputStream.use { it.readBytes() }
      } catch (e: Exception) {
        lastErr = e
        if (task.cancelled) break
        try {
          Thread.sleep((attempt * 1000L).coerceAtMost(4000L))
        } catch (_: InterruptedException) {}
      } finally {
        try {
          conn?.disconnect()
        } catch (_: Exception) {}
        task.connection = null
      }
    }
    throw lastErr ?: IllegalStateException("Failed to download HLS segment")
  }

  private fun executeHlsDownload(task: CustomDownloadTask, userAgent: String?) {
    val tempTsFile = getHlsPartTsFile(task.downloadId)
    val tempMp4File = getHlsPartMp4File(task.downloadId)
    var outStream: OutputStream? = null

    try {
      syncForegroundServiceState(task)
      emitTaskState(task)

      val headers = sniffedHeadersByUrl[task.url] ?: emptyMap()
      var playlistUrl = task.url
      var playlistText =
          fetchTextWithHeaders(playlistUrl, headers)
              ?: String(downloadBytesWithRetry(playlistUrl, userAgent, headers, task), Charsets.UTF_8)

      // If master playlist was passed directly, select highest bandwidth variant
      if (playlistText.contains("#EXT-X-STREAM-INF", ignoreCase = true)) {
        val baseUri = URI(playlistUrl)
        var bestUrl: String? = null
        var bestBw = -1L
        var pendingBw = 0L
        var waitingUrl = false
        for (rawLine in playlistText.lines()) {
          val line = rawLine.trim()
          if (line.startsWith("#EXT-X-STREAM-INF:", ignoreCase = true)) {
            val bwMatch = Regex("""BANDWIDTH=(\d+)""").find(line)
            pendingBw = bwMatch?.groupValues?.get(1)?.toLongOrNull() ?: 0L
            waitingUrl = true
          } else if (waitingUrl && line.isNotEmpty() && !line.startsWith("#")) {
            val resolved = baseUri.resolve(line).toString()
            if (pendingBw >= bestBw) {
              bestBw = pendingBw
              bestUrl = resolved
            }
            waitingUrl = false
          }
        }
        if (bestUrl != null) {
          playlistUrl = bestUrl
          playlistText =
              fetchTextWithHeaders(playlistUrl, headers)
                  ?: String(
                      downloadBytesWithRetry(playlistUrl, userAgent, headers, task),
                      Charsets.UTF_8
                  )
        }
      }

      val baseUri = URI(playlistUrl)
      data class HlsSegment(
          val url: String,
          val keyUri: String?,
          val keyIv: ByteArray?,
          val sequenceIndex: Int
      )

      val segments = ArrayList<HlsSegment>()
      var initMapUrl: String? = null
      var currentKeyUri: String? = null
      var currentKeyIv: ByteArray? = null
      var mediaSeq = 0

      for (rawLine in playlistText.lines()) {
        val line = rawLine.trim()
        if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:", ignoreCase = true)) {
          mediaSeq = line.substringAfter(":").trim().toIntOrNull() ?: 0
        } else if (line.startsWith("#EXT-X-MAP:", ignoreCase = true)) {
          val uriMatch = Regex("""URI="([^"]+)"""").find(line)
          if (uriMatch != null) {
            initMapUrl = baseUri.resolve(uriMatch.groupValues[1]).toString()
          }
        } else if (line.startsWith("#EXT-X-KEY:", ignoreCase = true)) {
          if (line.contains("METHOD=NONE", ignoreCase = true)) {
            currentKeyUri = null
            currentKeyIv = null
          } else if (line.contains("METHOD=AES-128", ignoreCase = true)) {
            val uriMatch = Regex("""URI="([^"]+)"""").find(line)
            if (uriMatch != null) {
              currentKeyUri = baseUri.resolve(uriMatch.groupValues[1]).toString()
              val ivMatch = Regex("""IV=0x([0-9a-fA-F]+)""").find(line)
              currentKeyIv =
                  if (ivMatch != null) {
                    val hex = ivMatch.groupValues[1].padStart(32, '0').takeLast(32)
                    ByteArray(16) { idx ->
                      hex.substring(idx * 2, idx * 2 + 2).toInt(16).toByte()
                    }
                  } else {
                    null
                  }
            }
          }
        } else if (line.isNotEmpty() && !line.startsWith("#")) {
          val segUrl = baseUri.resolve(line).toString()
          segments.add(
              HlsSegment(
                  url = segUrl,
                  keyUri = currentKeyUri,
                  keyIv = currentKeyIv,
                  sequenceIndex = mediaSeq + segments.size
              )
          )
        }
      }

      if (segments.isEmpty()) {
        throw IllegalStateException("No downloadable video segments found in HLS playlist.")
      }

      val keyCache = HashMap<String, ByteArray>()
      var lastEmitTime = System.currentTimeMillis()
      val isResuming = task.completedSegments > 0 && tempTsFile.exists() && tempTsFile.length() > 0L
      val startSegmentIdx = if (isResuming) task.completedSegments.coerceIn(0, segments.size) else 0
      if (!isResuming) {
        task.bytesDownloaded = 0L
        task.completedSegments = 0
      } else {
        task.bytesDownloaded = tempTsFile.length()
      }

      FileOutputStream(tempTsFile, isResuming).use { tsOut ->
        if (!isResuming && initMapUrl != null && !task.cancelled && !task.paused) {
          val initBytes = downloadBytesWithRetry(initMapUrl, userAgent, headers, task)
          tsOut.write(initBytes)
          task.bytesDownloaded += initBytes.size
        }

        val totalSegments = segments.size
        for (i in startSegmentIdx until totalSegments) {
          if (task.cancelled || task.paused) {
            break
          }
          val seg = segments[i]
          var segBytes = downloadBytesWithRetry(seg.url, userAgent, headers, task)
          if (task.cancelled || task.paused) {
            break
          }

          if (seg.keyUri != null) {
            val keyBytes =
                keyCache[seg.keyUri]
                    ?: downloadBytesWithRetry(seg.keyUri, userAgent, headers, task).also {
                      keyCache[seg.keyUri] = it
                    }
            val ivBytes =
                seg.keyIv
                    ?: ByteArray(16).apply {
                      val seq = seg.sequenceIndex
                      this[12] = ((seq ushr 24) and 0xFF).toByte()
                      this[13] = ((seq ushr 16) and 0xFF).toByte()
                      this[14] = ((seq ushr 8) and 0xFF).toByte()
                      this[15] = (seq and 0xFF).toByte()
                    }
            val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(keyBytes, "AES"),
                IvParameterSpec(ivBytes)
            )
            segBytes = cipher.doFinal(segBytes)
          }

          tsOut.write(segBytes)
          task.bytesDownloaded += segBytes.size

          val completedSegs = i + 1
          task.completedSegments = completedSegs
          val avgSegBytes = task.bytesDownloaded / completedSegs.coerceAtLeast(1)
          task.totalBytes = avgSegBytes * totalSegments
          task.progress = ((completedSegs.toDouble() / totalSegments.toDouble()) * 95.0).coerceIn(0.0, 95.0)

          val now = System.currentTimeMillis()
          if (now - lastEmitTime >= 450L || completedSegs == totalSegments) {
            lastEmitTime = now
            emitTaskState(task)
          }
        }
        tsOut.flush()
      }

      if (task.cancelled) {
        cleanupPartialDownload(task)
        task.status = "cancelled"
        task.progress = 0.0
        emitTaskState(task)
        return
      }

      if (task.paused) {
        task.status = "paused"
        emitTaskState(task)
        return
      }

      // Remux MPEG-TS stream into a clean, universally playable MP4 file
      task.progress = 96.0
      emitTaskState(task)

      val sourceForOutput =
          if (initMapUrl == null && remuxTsToMp4(tempTsFile, tempMp4File)) {
            tempMp4File
          } else {
            tempTsFile
          }

      task.progress = 98.0
      emitTaskState(task)

      val output = createDownloadOutputStream(task)
      outStream = output
      FileInputStream(sourceForOutput).use { input ->
        val buf = ByteArray(128 * 1024)
        var read: Int
        while (input.read(buf).also { read = it } != -1) {
          output.write(buf, 0, read)
        }
      }
      output.flush()
      output.close()
      outStream = null

      val finalSize = sourceForOutput.length()
      if (finalSize > 0L) {
        task.bytesDownloaded = finalSize
        task.totalBytes = finalSize
      }

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
      try {
        if (tempTsFile.exists()) tempTsFile.delete()
      } catch (_: Exception) {}
      try {
        if (tempMp4File.exists()) tempMp4File.delete()
      } catch (_: Exception) {}
    } catch (e: Exception) {
      try {
        outStream?.close()
      } catch (_: Exception) {}

      if (task.cancelled) {
        cleanupPartialDownload(task)
        task.status = "cancelled"
        task.progress = 0.0
      } else if (task.paused) {
        task.status = "paused"
      } else {
        cleanupPartialDownload(task)
        task.status = "failed"
        task.errorMessage = e.message ?: "HLS video download failed."
      }
      emitTaskState(task)
    } finally {
      try {
        outStream?.close()
      } catch (_: Exception) {}
      if (!task.paused) {
        try {
          if (tempMp4File.exists()) tempMp4File.delete()
        } catch (_: Exception) {}
      }
      syncForegroundServiceState(null)
    }
  }

  private fun executeCustomDownload(task: CustomDownloadTask, userAgent: String?) {
    val lowerUrl = task.url.lowercase()
    if (lowerUrl.substringBefore("?").endsWith(".m3u8") ||
        lowerUrl.contains(".m3u8?") ||
        task.mimeType.contains("mpegurl", ignoreCase = true)) {
      executeHlsDownload(task, userAgent)
      return
    }

    val partFile = getDirectPartFile(task.downloadId)
    var conn: HttpURLConnection? = null
    var outStream: OutputStream? = null

    try {
      syncForegroundServiceState(task)
      emitTaskState(task)

      if (partFile.exists()) {
        task.bytesDownloaded = partFile.length()
      } else {
        task.bytesDownloaded = 0L
      }

      val buffer = ByteArray(64 * 1024)
      var lastEmitTime = System.currentTimeMillis()
      var resumeAttempt = 0
      val maxResumeAttempts = 20

      val sniffedHeaders = sniffedHeadersByUrl[task.url]

      while (!task.cancelled && !task.paused) {
        try {
          val resumeOffset = if (partFile.exists()) partFile.length() else 0L
          task.bytesDownloaded = resumeOffset
          val (resolvedConn, _) =
              openFollowRedirects(task.url, null, userAgent, false, resumeOffset, sniffedHeaders)
          conn = resolvedConn
          task.connection = conn

          if (task.cancelled || task.paused) {
            conn.disconnect()
            break
          }

          val responseCode = conn.responseCode
          if (responseCode !in 200..299) {
            throw IllegalStateException("Server returned HTTP $responseCode.")
          }

          // If we asked for Range > 0 and server returned 206, append; if server returned 200, restart cleanly
          val appendMode = resumeOffset > 0L && responseCode == 206
          if (!appendMode) {
            task.bytesDownloaded = 0L
          }

          if (task.totalBytes <= 0L) {
            val totalBytes = parseTotalBytesFromHeaders(conn)
            if (totalBytes > 0L) {
              task.totalBytes = totalBytes
            }
          }

          emitTaskState(task)

          FileOutputStream(partFile, appendMode).use { partOut ->
            var bytesRead: Int
            resolvedConn.inputStream.use { input ->
              while (input.read(buffer).also { bytesRead = it } != -1) {
                if (task.cancelled || task.paused) {
                  break
                }
                partOut.write(buffer, 0, bytesRead)
                task.bytesDownloaded += bytesRead
                // Reset retry counter whenever data is actively flowing
                resumeAttempt = 0

                if (task.totalBytes > 0L) {
                  task.progress =
                      ((task.bytesDownloaded.toDouble() / task.totalBytes.toDouble()) * 98.0)
                          .coerceIn(0.0, 98.0)
                }

                val now = System.currentTimeMillis()
                if (now - lastEmitTime >= 450L) {
                  lastEmitTime = now
                  emitTaskState(task)
                }
              }
            }
            partOut.flush()
          }

          // Check if full file has been downloaded or if stream ended normally
          if (task.cancelled ||
              task.paused ||
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

          if (task.cancelled || task.paused) {
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

      if (task.cancelled) {
        cleanupPartialDownload(task)
        task.status = "cancelled"
        task.progress = 0.0
        emitTaskState(task)
        return
      }

      if (task.paused) {
        task.status = "paused"
        emitTaskState(task)
        return
      }

      // Stream completed partial file into public Downloads/BDM
      task.progress = 99.0
      emitTaskState(task)

      val output = createDownloadOutputStream(task)
      outStream = output
      FileInputStream(partFile).use { input ->
        val copyBuf = ByteArray(128 * 1024)
        var r: Int
        while (input.read(copyBuf).also { r = it } != -1) {
          output.write(copyBuf, 0, r)
        }
      }
      output.flush()
      output.close()
      outStream = null

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
      try {
        if (partFile.exists()) partFile.delete()
      } catch (_: Exception) {}
    } catch (e: Exception) {
      try {
        outStream?.close()
      } catch (_: Exception) {}

      if (task.cancelled) {
        cleanupPartialDownload(task)
        task.status = "cancelled"
        task.progress = 0.0
      } else if (task.paused) {
        task.status = "paused"
      } else {
        cleanupPartialDownload(task)
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

          val rawTitleMatch =
              Regex("""var\s+title\s*=\s*["']([^"']+)["']""").find(html)?.groupValues?.get(1)
                  ?: Regex("""<title>([^<]+)</title>""", RegexOption.IGNORE_CASE)
                      .find(html)
                      ?.groupValues
                      ?.get(1)
                      ?.trim()
                  ?: "Embedded Video"
          val titleMatch = unescapeDisplayTitle(rawTitleMatch)

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
                  """["']((?:https?:\\?/\\?/[^"'\s]+|\/stream\/\d{3,4}\/[^"'\s]+)(?:\.mp4|\.webm)?)["']""",
                  RegexOption.IGNORE_CASE
              )
          directStreamRegex.findAll(html).forEach { match ->
            val candidate = match.groupValues[1].replace("\\/", "/")
            val lower = candidate.lowercase()
            val cleanLower = lower.substringBefore("?").substringBefore("#")
            if (Regex("""/stream/\d{3,4}/""").containsMatchIn(cleanLower) ||
                cleanLower.endsWith(".mp4") ||
                cleanLower.endsWith(".webm")) {
              queueCandidate(candidate, null, if (cleanLower.contains(".webm")) "webm" else "mp4")
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
          if (!probed.isValidMedia) {
            continue
          }
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
          itemMap.putBoolean("resumable", probed.resumable)
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
  fun pauseDownload(downloadIdStr: String, promise: Promise) {
    try {
      val customTask = customTasks[downloadIdStr]
      if (customTask != null) {
        customTask.paused = true
        customTask.status = "paused"
        try {
          customTask.connection?.disconnect()
        } catch (_: Exception) {}
        emitTaskState(customTask)
        syncForegroundServiceState(null)
        promise.resolve(true)
        return
      }
      promise.resolve(false)
    } catch (e: Exception) {
      promise.reject("PAUSE_ERROR", e.message ?: "Failed to pause download", e)
    }
  }

  @ReactMethod
  fun resumeDownload(
      downloadIdStr: String,
      url: String,
      fileName: String,
      title: String,
      mimeType: String,
      totalBytesHint: Double,
      completedSegmentsHint: Int,
      userAgent: String?,
      promise: Promise
  ) {
    try {
      var task = customTasks[downloadIdStr]
      if (task == null) {
        val ext = if (mimeType.contains("webm", ignoreCase = true)) "webm" else "mp4"
        val cleanTitle = unescapeDisplayTitle(title.ifBlank { fileName })
        val safeFileName = sanitizeFileName(unescapeDisplayTitle(fileName), ext)
        val resolvedMime = mimeType.ifBlank { "video/$ext" }
        val notificationId = (downloadIdStr.hashCode() and 0x7FFFFFFF).coerceAtLeast(1001)
        task =
            CustomDownloadTask(
                downloadId = downloadIdStr,
                url = url.trim(),
                fileName = safeFileName,
                title = cleanTitle.ifBlank { safeFileName },
                mimeType = resolvedMime,
                notificationId = notificationId
            )
        if (totalBytesHint > 0) {
          task.totalBytes = totalBytesHint.toLong()
        }
        if (completedSegmentsHint > 0) {
          task.completedSegments = completedSegmentsHint
        }
        customTasks[downloadIdStr] = task
      }

      task.paused = false
      task.cancelled = false
      task.status = "downloading"
      task.errorMessage = null

      val activeTask = task
      promise.resolve(true)
      downloadExecutor.execute {
        executeCustomDownload(activeTask, userAgent)
      }
    } catch (e: Exception) {
      promise.reject("RESUME_ERROR", e.message ?: "Failed to resume download", e)
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
  fun loadPersistedState(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val stateJson = prefs.getString(PREF_KEY_APP_STATE, null)
      promise.resolve(stateJson)
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun savePersistedState(stateJson: String, promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit().putString(PREF_KEY_APP_STATE, stateJson).apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  private fun findMediaStoreOrDiskUriByFileName(fileNameHint: String?): Uri? {
    if (fileNameHint.isNullOrBlank()) {
      return null
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      var cursor: Cursor? = null
      try {
        val projection = arrayOf(MediaStore.MediaColumns._ID)
        val selection = "${MediaStore.MediaColumns.DISPLAY_NAME} = ?"
        val selectionArgs = arrayOf(fileNameHint)
        val sortOrder = "${MediaStore.MediaColumns.DATE_ADDED} DESC"
        cursor =
            reactContext.contentResolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )
        if (cursor != null && cursor.moveToFirst()) {
          val idIdx = cursor.getColumnIndex(MediaStore.MediaColumns._ID)
          if (idIdx >= 0) {
            val mediaId = cursor.getLong(idIdx)
            return Uri.withAppendedPath(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                mediaId.toString()
            )
          }
        }
      } catch (_: Exception) {} finally {
        cursor?.close()
      }
    }

    try {
      val downloadsRoot =
          Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      val candidateFile = File(File(downloadsRoot, "BDM"), fileNameHint)
      if (candidateFile.exists()) {
        return Uri.fromFile(candidateFile)
      }
    } catch (_: Exception) {}
    return null
  }

  private fun resolvePlayableContentUri(
      downloadIdStr: String,
      localUriHint: String?,
      fileNameHint: String?
  ): Uri? {
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

    if (!localUriHint.isNullOrBlank()) {
      try {
        val parsed = Uri.parse(localUriHint)
        val scheme = parsed.scheme?.lowercase()
        if (scheme == "content") {
          return parsed
        } else if (scheme == "file") {
          val path = parsed.path
          if (!path.isNullOrBlank() && File(path).exists()) {
            return parsed
          }
        }
      } catch (_: Exception) {}
    }

    val byFileName = findMediaStoreOrDiskUriByFileName(fileNameHint)
    if (byFileName != null) {
      return byFileName
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
  fun removeDownloadedFile(
      downloadIdStr: String,
      localUriHint: String?,
      fileNameHint: String?,
      promise: Promise
  ) {
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

      val resolvedUri = resolvePlayableContentUri(downloadIdStr, localUriHint, fileNameHint)
      if (resolvedUri != null) {
        try {
          if (resolvedUri.scheme?.lowercase() == "content") {
            reactContext.contentResolver.delete(resolvedUri, null, null)
          } else if (resolvedUri.scheme?.lowercase() == "file") {
            val path = resolvedUri.path
            if (!path.isNullOrBlank()) {
              File(path).delete()
            }
          }
        } catch (_: Exception) {}
      }

      val dmId = downloadIdStr.toLongOrNull()
      if (dmId != null) {
        try {
          downloadManager.remove(dmId)
        } catch (_: Exception) {}
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("REMOVE_ERROR", e.message ?: "Failed to delete file", e)
    }
  }

  @ReactMethod
  fun openDownloadedFile(
      downloadIdStr: String,
      mimeType: String,
      localUriHint: String?,
      fileNameHint: String?,
      promise: Promise
  ) {
    try {
      val contentUri = resolvePlayableContentUri(downloadIdStr, localUriHint, fileNameHint)
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
      localUriHint: String?,
      fileNameHint: String?,
      promise: Promise
  ) {
    try {
      val contentUri = resolvePlayableContentUri(downloadIdStr, localUriHint, fileNameHint)
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
