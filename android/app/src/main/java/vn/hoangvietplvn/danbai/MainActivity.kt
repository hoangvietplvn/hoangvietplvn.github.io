package vn.hoangvietplvn.danbai

import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {

    private lateinit var mainWeb: WebView
    private lateinit var cmsBox: LinearLayout
    private lateinit var cmsWeb: WebView
    private lateinit var native: NativeBridge
    private var cmsVisible = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback?.onReceiveValue(uris.toTypedArray())
        fileCallback = null
    }

    fun mainWebView(): WebView = mainWeb
    fun cmsWebView(): WebView = cmsWeb

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        mainWeb = WebView(this)
        cmsWeb = WebView(this)
        cmsBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
        }
        val back = Button(this).apply {
            text = "← Quay lại ứng dụng"
            setOnClickListener { hideCms() }
        }
        cmsBox.addView(back, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        cmsBox.addView(cmsWeb, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(mainWeb, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(cmsBox, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Giao diện chính: tải từ thư mục assets/app, chạy dưới địa chỉ https nội bộ để có localStorage.
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        mainWeb.settings.javaScriptEnabled = true
        mainWeb.settings.domStorageEnabled = true
        mainWeb.settings.allowFileAccess = false
        mainWeb.webChromeClient = WebChromeClient()
        mainWeb.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"
        }
        native = NativeBridge(this)
        mainWeb.addJavascriptInterface(native, "DanBaiNative")

        // Màn hình CMS: đăng nhập và cookie được giữ lại giữa các lần mở.
        CookieManager.getInstance().setAcceptCookie(true)
        cmsWeb.settings.javaScriptEnabled = true
        cmsWeb.settings.domStorageEnabled = true
        cmsWeb.addJavascriptInterface(CmsBridge(native), "AndroidCms")
        cmsWeb.webChromeClient = object : WebChromeClient() {
            // Khi CMS mở ô chọn tệp (ví dụ khi bạn tải ảnh tay), dùng bộ chọn tệp của điện thoại.
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                pickFiles.launch("*/*")
                return true
            }
        }
        cmsWeb.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                mainWeb.evaluateJavascript("window.__cmsEvent && window.__cmsEvent('loaded');", null)
            }
        }

        mainWeb.loadUrl("https://appassets.androidplatform.net/assets/app/app.html")
    }

    fun showCms(url: String) {
        runOnUiThread {
            if (cmsWeb.url == null) cmsWeb.loadUrl(url)
            cmsBox.visibility = View.VISIBLE
            cmsVisible = true
        }
    }

    fun hideCms() {
        runOnUiThread {
            cmsBox.visibility = View.GONE
            cmsVisible = false
        }
    }

    @Deprecated("Dùng cho nút Quay lại của hệ thống")
    override fun onBackPressed() {
        when {
            cmsVisible && cmsWeb.canGoBack() -> cmsWeb.goBack()
            cmsVisible -> hideCms()
            mainWeb.canGoBack() -> mainWeb.goBack()
            else -> super.onBackPressed()
        }
    }
}
