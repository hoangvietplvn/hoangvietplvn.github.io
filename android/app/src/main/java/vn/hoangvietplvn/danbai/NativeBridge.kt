package vn.hoangvietplvn.danbai

import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

// Cầu nối cho trang giao diện (app.html). Mọi lệnh mạng chạy bằng mã gốc, nên không bị chặn truy cập chéo domain.
class NativeBridge(private val activity: MainActivity) {

    private val io = Executors.newCachedThreadPool()
    private val store = ConcurrentHashMap<String, ByteArray>()
    private var seq = 0

    // Tải một địa chỉ (link Google Docs, bài báo, ảnh). Kết quả để lại trong bộ nhớ, giao diện đọc theo từng phần.
    @JavascriptInterface
    fun fetchBytes(callbackId: String, url: String) {
        io.execute {
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = true
                conn.connectTimeout = 20_000
                conn.readTimeout = 180_000
                conn.setRequestProperty("User-Agent", USER_AGENT)
                CookieManager.getInstance().getCookie(url)?.let { conn.setRequestProperty("Cookie", it) }
                val code = conn.responseCode
                val stream = if (code >= 400) conn.errorStream else conn.inputStream
                val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)
                val key = synchronized(this) { "b" + (++seq) }
                store[key] = bytes
                val payload = JSONObject()
                    .put("status", code)
                    .put("url", conn.url.toString())
                    .put("type", conn.contentType ?: "")
                    .put("size", bytes.size)
                    .put("id", key)
                callback(callbackId, payload.toString())
            } catch (e: Exception) {
                callback(callbackId, JSONObject().put("error", e.message ?: e.toString()).toString())
            }
        }
    }

    // Đọc một đoạn của kết quả tải (dạng base64), gọi từ giao diện.
    @JavascriptInterface
    fun getChunk(key: String, offset: Int, length: Int): String {
        val bytes = store[key] ?: return ""
        val end = minOf(bytes.size, offset + length)
        if (offset >= end) return ""
        return Base64.encodeToString(bytes, offset, end - offset, Base64.NO_WRAP)
    }

    @JavascriptInterface
    fun release(key: String) {
        store.remove(key)
    }

    // Hiện màn hình CMS (tải trang nếu chưa tải).
    @JavascriptInterface
    fun showCms(callbackId: String, url: String) {
        activity.showCms(url)
        callback(callbackId, "{\"ok\":true}")
    }

    @JavascriptInterface
    fun hideCms() {
        activity.hideCms()
    }

    // Hiện thông báo điền CMS trên thanh của màn hình CMS.
    @JavascriptInterface
    fun setBar(text: String) {
        activity.setBar(text)
    }

    // Chạy một hàm (đã chuyển thành chuỗi mã) trong trang CMS, với các đối số dạng JSON.
    @JavascriptInterface
    fun cmsRun(callbackId: String, code: String, argsJson: String) {
        val id = JSONObject.quote(callbackId)
        val script = "(async()=>{try{const fn=($code);const r=await fn(...($argsJson));" +
            "AndroidCms.done($id, JSON.stringify(r===undefined?null:r));}" +
            "catch(e){AndroidCms.fail($id, String((e&&e.message)||e));}})();"
        activity.runOnUiThread { activity.cmsWebView().evaluateJavascript(script, null) }
    }

    // Nạp một tệp mã (cms-fill.js, cms-pick.js) vào trang CMS.
    @JavascriptInterface
    fun cmsEvalAsset(callbackId: String, name: String) {
        val text = activity.assets.open("app/$name").bufferedReader().use { it.readText() }
        activity.runOnUiThread {
            activity.cmsWebView().evaluateJavascript(text, null)
            callback(callbackId, "{\"ok\":true}")
        }
    }

    // Trả kết quả về giao diện chính. raw là một đối tượng JS (ví dụ {"status":200,...}).
    fun callback(callbackId: String, raw: String) {
        val script = "window.__natCb(${JSONObject.quote(callbackId)}, $raw);"
        activity.runOnUiThread { activity.mainWebView().evaluateJavascript(script, null) }
    }

    companion object {
        const val USER_AGENT = "Mozilla/5.0 (Linux; Android 16; SM-F966) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36"
    }
}

// Cầu nối riêng cho trang CMS: nhận kết quả của hàm đã chạy.
class CmsBridge(private val native: NativeBridge) {
    @JavascriptInterface
    fun done(callbackId: String, json: String) {
        native.callback(callbackId, "{\"result\":$json}")
    }

    @JavascriptInterface
    fun fail(callbackId: String, message: String) {
        native.callback(callbackId, "{\"error\":${JSONObject.quote(message)}}")
    }
}
