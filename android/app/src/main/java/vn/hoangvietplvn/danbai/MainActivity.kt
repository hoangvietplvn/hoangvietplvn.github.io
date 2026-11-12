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

// Ba tab: «Kéo bài» (công cụ), «Kho ảnh» (ảnh tự tải về) và «CMS» (đăng nhập và điền bài).
class MainActivity : ComponentActivity() {

    private lateinit var mainWeb: WebView
    private lateinit var khoWeb: WebView
    private lateinit var cmsWeb: WebView
    private lateinit var toolPane: FrameLayout
    private lateinit var khoPane: FrameLayout
    private lateinit var cmsPane: LinearLayout
    private lateinit var barText: TextView
    private lateinit var tabs: Array<Button>
    private lateinit var native: NativeBridge
    private var currentTab = 0
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
        khoWeb = WebView(this)
        cmsWeb = WebView(this)
        toolPane = FrameLayout(this).apply { addView(mainWeb, FrameLayout.LayoutParams(fill, fill)) }
        khoPane = FrameLayout(this).apply { addView(khoWeb, FrameLayout.LayoutParams(fill, fill)) }
        barText = TextView(this).apply {
            textSize = 13f
            maxLines = 3
            setPadding(24, 12, 24, 12)
        }
        cmsPane = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(barText, LinearLayout.LayoutParams(fill, wrap))
            addView(cmsWeb, LinearLayout.LayoutParams(fill, 0, 1f))
        }
        val content = FrameLayout(this).apply {
            addView(toolPane, FrameLayout.LayoutParams(fill, fill))
            addView(khoPane, FrameLayout.LayoutParams(fill, fill))
            addView(cmsPane, FrameLayout.LayoutParams(fill, fill))
        }
        tabs = arrayOf(
            Button(this).apply { text = "Kéo bài"; setOnClickListener { selectTab(0) } },
            Button(this).apply { text = "Kho ảnh"; setOnClickListener { selectTab(1) } },
            Button(this).apply { text = "CMS"; setOnClickListener { selectTab(2) } },
        )
        val tabBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            tabs.forEach { addView(it, LinearLayout.LayoutParams(0, wrap, 1f)) }
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(content, LinearLayout.LayoutParams(fill, 0, 1f))
            addView(tabBar, LinearLayout.LayoutParams(fill, wrap))
        }
        setContentView(root)

        // Tải giao diện từ assets/app, chạy dưới địa chỉ https nội bộ để có localStorage.
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        val localClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"
        }

        native = NativeBridge(this)
        for (w in listOf(mainWeb, khoWeb)) {
            w.settings.javaScriptEnabled = true
            w.settings.domStorageEnabled = true
            w.settings.allowFileAccess = false
            w.webChromeClient = WebChromeClient()
            w.webViewClient = localClient
            w.addJavascriptInterface(native, "DanBaiNative")
        }

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
        khoWeb.loadUrl("https://appassets.androidplatform.net/assets/app/kho.html")
        selectTab(0)
    }

    // Chọn tab (0 = Kéo bài, 1 = Kho ảnh, 2 = CMS). Tab CMS tải trang lần đầu khi được mở.
    private fun selectTab(index: Int) {
        currentTab = index
        toolPane.visibility = if (index == 0) View.VISIBLE else View.GONE
        khoPane.visibility = if (index == 1) View.VISIBLE else View.GONE
        cmsPane.visibility = if (index == 2) View.VISIBLE else View.GONE
        tabs.forEachIndexed { i, b -> b.alpha = if (i == index) 1f else 0.5f }
        if (index == 2 && !cmsStarted) {
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
            selectTab(2)
        }
    }

    // Gọi từ công cụ: quay về tab Kéo bài.
    fun hideCms() {
        runOnUiThread { selectTab(0) }
    }

    fun setBar(text: String) {
        runOnUiThread { barText.text = text }
    }

    @Deprecated("Dùng cho nút Quay lại của hệ thống")
    override fun onBackPressed() {
        when {
            currentTab == 2 && cmsWeb.canGoBack() -> cmsWeb.goBack()
            currentTab == 2 -> selectTab(0)
            currentTab == 1 -> selectTab(0)
            mainWeb.canGoBack() -> mainWeb.goBack()
            else -> super.onBackPressed()
        }
    }

    companion object {
        private const val DEFAULT_CMS = "https://cms.phapluat.gov.vn/admin/content-articles/review"
    }
}
