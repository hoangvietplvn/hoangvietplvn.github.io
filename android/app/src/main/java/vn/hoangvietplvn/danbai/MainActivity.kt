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
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader

// Hai tab: «Kéo bài» (công cụ) và «CMS» (đăng nhập và điền bài). Cả hai giữ trạng thái khi chuyển tab.
class MainActivity : ComponentActivity() {

    private lateinit var mainWeb: WebView
    private lateinit var cmsWeb: WebView
    private lateinit var toolPane: FrameLayout
    private lateinit var cmsPane: LinearLayout
    private lateinit var barText: TextView
    private lateinit var tabTool: Button
    private lateinit var tabCms: Button
    private lateinit var native: NativeBridge
    private var onCmsTab = false
    private var cmsStarted = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    // Bộ chọn tệp của hệ thống: ứng dụng chỉ nhận tệp người dùng chọn, không cần quyền truy cập thư viện.
    private val pickFiles = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback?.onReceiveValue(uris.toTypedArray())
        fileCallback = null
    }

    fun mainWebView(): WebView = mainWeb
    fun cmsWebView(): WebView = cmsWeb

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val fill = ViewGroup.LayoutParams.MATCH_PARENT
        val wrap = ViewGroup.LayoutParams.WRAP_CONTENT

        mainWeb = WebView(this)
        cmsWeb = WebView(this)
        toolPane = FrameLayout(this).apply {
            addView(mainWeb, FrameLayout.LayoutParams(fill, fill))
        }
        barText = TextView(this).apply {
            textSize = 13f
            maxLines = 3
            setPadding(24, 12, 24, 12)
        }
        cmsPane = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            addView(barText, LinearLayout.LayoutParams(fill, wrap))
            addView(cmsWeb, LinearLayout.LayoutParams(fill, 0, 1f))
        }
        val content = FrameLayout(this).apply {
            addView(toolPane, FrameLayout.LayoutParams(fill, fill))
            addView(cmsPane, FrameLayout.LayoutParams(fill, fill))
        }
        tabTool = Button(this).apply {
            text = "Kéo bài"
            setOnClickListener { selectTab(false) }
        }
        tabCms = Button(this).apply {
            text = "CMS"
            setOnClickListener { selectTab(true) }
        }
        val tabBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(tabTool, LinearLayout.LayoutParams(0, wrap, 1f))
            addView(tabCms, LinearLayout.LayoutParams(0, wrap, 1f))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(content, LinearLayout.LayoutParams(fill, 0, 1f))
            addView(tabBar, LinearLayout.LayoutParams(fill, wrap))
        }
        setContentView(root)

        // Giao diện «Kéo bài»: tải từ assets/app, chạy dưới địa chỉ https nội bộ để có localStorage.
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

        // Tab «CMS»: đăng nhập và cookie được giữ lại giữa các lần mở.
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
        selectTab(false)
    }

    // Chọn tab. Tab CMS tải trang lần đầu khi được mở.
    private fun selectTab(cms: Boolean) {
        onCmsTab = cms
        cmsPane.visibility = if (cms) View.VISIBLE else View.GONE
        toolPane.visibility = if (cms) View.GONE else View.VISIBLE
        tabCms.alpha = if (cms) 1f else 0.5f
        tabTool.alpha = if (cms) 0.5f else 1f
        if (cms && !cmsStarted) {
            cmsStarted = true
            cmsWeb.loadUrl(DEFAULT_CMS)
        }
    }

    // Gọi từ công cụ: chuyển sang tab CMS (tải trang nếu chưa tải).
    fun showCms(url: String) {
        runOnUiThread {
            if (!cmsStarted) {
                cmsStarted = true
                cmsWeb.loadUrl(url)
            }
            selectTab(true)
        }
    }

    // Gọi từ công cụ: quay về tab Kéo bài.
    fun hideCms() {
        runOnUiThread { selectTab(false) }
    }

    fun setBar(text: String) {
        runOnUiThread { barText.text = text }
    }

    @Deprecated("Dùng cho nút Quay lại của hệ thống")
    override fun onBackPressed() {
        when {
            onCmsTab && cmsWeb.canGoBack() -> cmsWeb.goBack()
            onCmsTab -> selectTab(false)
            mainWeb.canGoBack() -> mainWeb.goBack()
            else -> super.onBackPressed()
        }
    }

    companion object {
        private const val DEFAULT_CMS = "https://cms.phapluat.gov.vn/admin/content-articles/review"
    }
}
