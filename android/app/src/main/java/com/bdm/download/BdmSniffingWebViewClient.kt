package com.bdm.download

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import com.reactnativecommunity.webview.RNCWebViewClient

class BdmSniffingWebViewClient(
    private val onMediaRequestSniffed: (url: String, headers: Map<String, String>) -> Unit
) : RNCWebViewClient() {

  companion object {
    private val SEGMENT_FILE_REGEX =
        Regex("""(?:^|/)(?:seg[-_]|segment[-_]|chunk[-_]|frag[-_]|part[-_])""", RegexOption.IGNORE_CASE)
  }

  override fun shouldInterceptRequest(
      view: WebView?,
      request: WebResourceRequest?
  ): WebResourceResponse? {
    try {
      val uri = request?.url
      val url = uri?.toString()
      if (!url.isNullOrBlank() &&
          (url.startsWith("http://", ignoreCase = true) ||
              url.startsWith("https://", ignoreCase = true))) {
        val pathWithoutQuery = url.substringBefore("?").substringBefore("#").lowercase()
        val isHlsManifest =
            pathWithoutQuery.endsWith(".m3u8") ||
                url.lowercase().contains(".m3u8?")
        val isDirectVideo =
            (pathWithoutQuery.endsWith(".mp4") ||
                pathWithoutQuery.endsWith(".webm") ||
                pathWithoutQuery.endsWith(".m4v")) &&
                !SEGMENT_FILE_REGEX.containsMatchIn(pathWithoutQuery)

        if (isHlsManifest || isDirectVideo) {
          val headers = request.requestHeaders ?: emptyMap()
          onMediaRequestSniffed(url, headers)
        }
      }
    } catch (_: Exception) {}

    return super.shouldInterceptRequest(view, request)
  }
}
