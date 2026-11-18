package vn.hoangvietplvn.danbai

import android.net.Uri
import android.os.Bundle
import android.os.Message
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
import org.json.JSONObject

// Bốn tab: «Kéo bài» (công cụ), «Kho ảnh» (ảnh tự tải về), «PLQG» và «Moj» (đăng nhập CMS và điền bài).
// Màn hình CMS được đánh số: 1 = CMS PLQG, 2 = CMS Moj, 3 = cửa sổ kho ảnh do CMS Moj mở ra.
class MainActivity : ComponentActivity() {

    private lateinit var mainWeb: WebView
    private lateinit var khoWeb: WebView
    private lateinit var plqWeb: WebView
    private lateinit var mojWeb: WebView
    private lateinit var mojStack: FrameLayout
    private lateinit var panes: Array<View>
    private lateinit var bars: Array<TextView>
    private lateinit var tabs: Array<Button>
    private lateinit var native: NativeBridge
    private var popupWeb: WebView? = null
    private var popupId = 2
    private var currentTab = 0
    private val started = booleanArrayOf(false, false)
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    // Bộ chọn tệp của hệ thống: ứng dụng chỉ nhận tệp người dùng chọn, không cần quyền truy cập thư viện.
    private val pickFiles = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback?.onReceiveValue(uris.toTypedArray())
        fileCallback = null
    }

    fun mainWebView(): WebView = mainWeb

    fun cmsWebView(which: Int): WebView? = when (which) {
        1 -> plqWeb
        2 -> mojWeb
        3 -> popupWeb
        else -> null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val fill = ViewGroup.LayoutParams.MATCH_PARENT
        val wrap = ViewGroup.LayoutParams.WRAP_CONTENT

        mainWeb = WebView(this)
        khoWeb = WebView(this)
        plqWeb = WebView(this)
        mojWeb = WebView(this)
        native = NativeBridge(this)

        val toolPane = FrameLayout(this).apply { addView(mainWeb, FrameLayout.LayoutParams(fill, fill)) }
        val khoPane = FrameLayout(this).apply { addView(khoWeb, FrameLayout.LayoutParams(fill, fill)) }
        bars = Array(2) {
            TextView(this).apply {
                textSize = 13f
                maxLines = 3
                setPadding(24, 12, 24, 12)
            }
        }
        val plqPane = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bars[0], LinearLayout.LayoutParams(fill, wrap))
            addView(plqWeb, LinearLayout.LayoutParams(fill, 0, 1f))
        }
        // Cửa sổ kho ảnh của CMS Moj được đặt chồng lên trên màn hình CMS Moj.
        mojStack = FrameLayout(this).apply { addView(mojWeb, FrameLayout.LayoutParams(fill, fill)) }
        val mojPane = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bars[1], LinearLayout.LayoutParams(fill, wrap))
            addView(mojStack, LinearLayout.LayoutParams(fill, 0, 1f))
        }
        panes = arrayOf(toolPane, khoPane, plqPane, mojPane)
        val content = FrameLayout(this).apply {
            panes.forEach { addView(it, FrameLayout.LayoutParams(fill, fill)) }
        }
        val labels = arrayOf("Kéo bài", "Kho ảnh", "PLQG", "Moj")
        tabs = Array(labels.size) { i ->
            Button(this).apply {
                text = labels[i]
                setAllCaps(false)
                setOnClickListener { selectTab(i) }
            }
        }
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
        for (w in listOf(mainWeb, khoWeb)) {
            w.settings.javaScriptEnabled = true
            w.settings.domStorageEnabled = true
            w.settings.allowFileAccess = false
            w.webChromeClient = WebChromeClient()
            w.webViewClient = localClient
            w.addJavascriptInterface(native, "DanBaiNative")
        }

        // Các màn hình CMS: đăng nhập và cookie được giữ lại giữa các lần mở.
        CookieManager.getInstance().setAcceptCookie(true)
        setupCmsWeb(plqWeb, 1, false)
        setupCmsWeb(mojWeb, 2, true)

        mainWeb.loadUrl("https://appassets.androidplatform.net/assets/app/app.html")
        khoWeb.loadUrl("https://appassets.androidplatform.net/assets/app/kho.html")
        selectTab(0)
    }

    // Thiết lập một màn hình CMS. id là mã tab báo về cho công cụ; opensWindows = trang được phép mở cửa sổ con.
    private fun setupCmsWeb(w: WebView, id: Int, opensWindows: Boolean) {
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.javaScriptCanOpenWindowsAutomatically = true
        w.settings.setSupportMultipleWindows(opensWindows)
        w.addJavascriptInterface(CmsBridge(native), "AndroidCms")
        w.webChromeClient = object : WebChromeClient() {
            // Khi CMS mở ô chọn tệp (ví dụ khi bạn tải ảnh tay), dùng bộ chọn tệp của điện thoại.
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                pickFiles.launch("*/*")
                return true
            }

            // CMS Moj mở cửa sổ kho ảnh khi bấm «Chọn ảnh mới»: tạo một màn hình con, giữ liên kết với trang mở nó.
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                if (!opensWindows) return false
                val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
                transport.webView = openPopup()
                resultMsg.sendToTarget()
                return true
            }

            override fun onCloseWindow(window: WebView) {
                if (window === popupWeb) closePopup()
            }
        }
        w.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                if (url != null && url.startsWith("http")) notifyCms("loaded", id, url)
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                if (url != null && url.startsWith("http")) notifyCms("url", id, url)
            }
        }
    }

    private fun openPopup(): WebView {
        closePopup()
        val id = ++popupId
        val p = WebView(this)
        popupWeb = p
        setupCmsWeb(p, id, false)
        mojStack.addView(p, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        notifyCms("popup-open", id, "")
        return p
    }

    private fun closePopup() {
        val p = popupWeb ?: return
        popupWeb = null
        mojStack.removeView(p)
        mojStack.post { p.destroy() }
        notifyCms("popup-closed", popupId, "")
    }

    // Báo cho công cụ (tab Kéo bài) biết trang CMS đã tải xong, đổi địa chỉ, hoặc cửa sổ kho ảnh mở/đóng.
    private fun notifyCms(event: String, id: Int, url: String) {
        val script = "window.__cmsEvent && window.__cmsEvent(${JSONObject.quote(event)}, $id, ${JSONObject.quote(url)});"
        mainWeb.evaluateJavascript(script, null)
    }

    // Chọn tab (0 = Kéo bài, 1 = Kho ảnh, 2 = PLQG, 3 = Moj). Tab CMS tải trang lần đầu khi được mở.
    private fun selectTab(index: Int) {
        currentTab = index
        panes.forEachIndexed { i, v -> v.visibility = if (i == index) View.VISIBLE else View.GONE }
        tabs.forEachIndexed { i, b -> b.alpha = if (i == index) 1f else 0.5f }
        if (index == 2 && !started[0]) {
            started[0] = true
            plqWeb.loadUrl(DEFAULT_PLQ)
        }
        if (index == 3 && !started[1]) {
            started[1] = true
            mojWeb.loadUrl(DEFAULT_MOJ)
        }
    }

    // Gọi từ công cụ: chuyển sang tab CMS (which: 1 = PLQG, 2 = Moj).
    fun showCmsTab(which: Int) {
        runOnUiThread { selectTab(if (which == 1) 2 else 3) }
    }

    // Gọi từ công cụ: mở một địa chỉ trong màn hình CMS rồi chuyển sang tab đó.
    fun loadCms(which: Int, url: String) {
        runOnUiThread {
            val i = if (which == 1) 0 else 1
            started[i] = true
            if (which != 1) closePopup()
            (if (which == 1) plqWeb else mojWeb).loadUrl(url)
            selectTab(i + 2)
        }
    }

    // Gọi từ công cụ: tải lại trang CMS (như bấm F5).
    fun reloadCms(which: Int) {
        runOnUiThread {
            if (which != 1) closePopup()
            (if (which == 1) plqWeb else mojWeb).reload()
        }
    }

    // Gọi từ công cụ: quay về tab Kéo bài.
    fun hideCms() {
        runOnUiThread { selectTab(0) }
    }

    fun setBar(text: String) {
        runOnUiThread { bars.forEach { it.text = text } }
    }

    @Deprecated("Dùng cho nút Quay lại của hệ thống")
    override fun onBackPressed() {
        when {
            currentTab == 3 && popupWeb != null -> closePopup()
            currentTab == 3 && mojWeb.canGoBack() -> mojWeb.goBack()
            currentTab == 2 && plqWeb.canGoBack() -> plqWeb.goBack()
            currentTab != 0 -> selectTab(0)
            mainWeb.canGoBack() -> mainWeb.goBack()
            else -> super.onBackPressed()
        }
    }

    companion object {
        private const val DEFAULT_PLQ = "https://cms.phapluat.gov.vn/admin/content-articles/review"
        private const val DEFAULT_MOJ = "https://moj.gov.vn/cms/nghiep-vu/quan-ly-tin-tuc/chinh-sua-bai-viet"
    }
}
