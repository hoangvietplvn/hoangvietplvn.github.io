package vn.hoangvietplvn.nhacloss

import android.Manifest
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.CheckBox
import android.widget.ImageButton
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.common.util.concurrent.ListenableFuture
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null

    private lateinit var adapter: TrackAdapter
    private lateinit var count: TextView
    private lateinit var empty: TextView
    private lateinit var onlyLossless: CheckBox
    private lateinit var nowTitle: TextView
    private lateinit var nowInfo: TextView
    private lateinit var seek: SeekBar
    private lateinit var posText: TextView
    private lateinit var durText: TextView
    private lateinit var btnPlay: ImageButton
    private lateinit var btnShuffle: ImageButton
    private lateinit var btnRepeat: ImageButton

    private var all: List<Track> = emptyList()
    private var shown: List<Track> = emptyList()
    private var seeking = false
    private val handler = Handler(Looper.getMainLooper())

    private val ticker = object : Runnable {
        override fun run() {
            updateProgress()
            handler.postDelayed(this, 500)
        }
    }

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = updateUi()
    }

    private val permLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { res ->
        val audioKey = audioPermission()
        if (res[audioKey] == true) loadTracks() else showEmpty(getString(R.string.need_permission))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        count = findViewById(R.id.count)
        empty = findViewById(R.id.empty)
        onlyLossless = findViewById(R.id.onlyLossless)
        nowTitle = findViewById(R.id.nowTitle)
        nowInfo = findViewById(R.id.nowInfo)
        seek = findViewById(R.id.seek)
        posText = findViewById(R.id.posText)
        durText = findViewById(R.id.durText)
        btnPlay = findViewById(R.id.btnPlay)
        btnShuffle = findViewById(R.id.btnShuffle)
        btnRepeat = findViewById(R.id.btnRepeat)

        adapter = TrackAdapter { pos -> playAt(pos) }
        findViewById<RecyclerView>(R.id.list).apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = this@MainActivity.adapter
        }

        val prefs = getSharedPreferences("cfg", MODE_PRIVATE)
        onlyLossless.isChecked = prefs.getBoolean("onlyLossless", true)
        onlyLossless.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean("onlyLossless", checked).apply()
            applyFilter()
        }

        btnPlay.setOnClickListener {
            val c = controller ?: return@setOnClickListener
            if (c.isPlaying) c.pause() else {
                if (c.mediaItemCount == 0 && shown.isNotEmpty()) playAt(0) else c.play()
            }
        }
        findViewById<View>(R.id.btnNext).setOnClickListener { controller?.seekToNext() }
        findViewById<View>(R.id.btnPrev).setOnClickListener { controller?.seekToPrevious() }
        btnShuffle.setOnClickListener {
            controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled }
        }
        btnRepeat.setOnClickListener {
            controller?.let {
                it.repeatMode = when (it.repeatMode) {
                    Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                    Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                    else -> Player.REPEAT_MODE_OFF
                }
            }
        }
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar, p: Int, fromUser: Boolean) {
                if (fromUser) posText.text = fmt(p.toLong())
            }
            override fun onStartTrackingTouch(s: SeekBar) { seeking = true }
            override fun onStopTrackingTouch(s: SeekBar) {
                seeking = false
                controller?.seekTo(s.progress.toLong())
            }
        })

        ensurePermissionsThenLoad()
    }

    override fun onStart() {
        super.onStart()
        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        val f = MediaController.Builder(this, token).buildAsync()
        controllerFuture = f
        f.addListener({
            if (f.isCancelled) return@addListener
            val c = try { f.get() } catch (e: Exception) { return@addListener }
            controller = c
            c.addListener(listener)
            updateUi()
        }, ContextCompat.getMainExecutor(this))
        // Chỉ cập nhật thanh tiến trình khi app đang hiện, để không đánh thức CPU khi chạy nền.
        handler.post(ticker)
    }

    override fun onStop() {
        handler.removeCallbacks(ticker)
        controller?.removeListener(listener)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controller = null
        controllerFuture = null
        super.onStop()
    }

    // ---- quyền & thư viện ----

    private fun audioPermission() =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO
        else Manifest.permission.READ_EXTERNAL_STORAGE

    private fun ensurePermissionsThenLoad() {
        val need = ArrayList<String>()
        if (checkSelfPermission(audioPermission()) != PackageManager.PERMISSION_GRANTED) need += audioPermission()
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isEmpty()) loadTracks() else permLauncher.launch(need.toTypedArray())
    }

    private fun loadTracks() {
        Thread {
            val list = Track.scan(this)
            runOnUiThread {
                all = list
                applyFilter()
            }
        }.start()
    }

    private fun applyFilter() {
        shown = if (onlyLossless.isChecked) all.filter { it.lossless } else all
        adapter.submit(shown)
        count.text = "${shown.size} bài"
        if (shown.isEmpty()) showEmpty(getString(R.string.empty)) else empty.visibility = View.GONE
    }

    private fun showEmpty(msg: String) {
        empty.text = msg
        empty.visibility = View.VISIBLE
    }

    // ---- phát nhạc ----

    private fun playAt(pos: Int) {
        val c = controller ?: return
        if (pos !in shown.indices) return
        val items = shown.map { t ->
            MediaItem.Builder()
                .setMediaId(t.id.toString())
                .setUri(t.uri)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(t.title)
                        .setArtist(t.artist)
                        .setAlbumTitle(t.album)
                        .build()
                )
                .build()
        }
        c.setMediaItems(items, pos, 0L)
        c.prepare()
        c.play()
    }

    // ---- giao diện ----

    private fun updateUi() {
        val c = controller ?: return
        btnPlay.setImageResource(if (c.isPlaying) R.drawable.ic_pause else R.drawable.ic_play)
        btnShuffle.alpha = if (c.shuffleModeEnabled) 1f else 0.4f
        btnRepeat.alpha = if (c.repeatMode == Player.REPEAT_MODE_OFF) 0.4f else 1f
        val item = c.currentMediaItem
        adapter.setCurrent(item?.mediaId)
        nowTitle.text = item?.mediaMetadata?.title ?: getString(R.string.not_playing)
        nowInfo.text = formatInfo(c, item?.mediaId)
        updateProgress()
    }

    private fun formatInfo(c: MediaController, mediaId: String?): String {
        val track = shown.firstOrNull { it.id.toString() == mediaId } ?: all.firstOrNull { it.id.toString() == mediaId }
        val group = c.currentTracks.groups.firstOrNull { it.type == C.TRACK_TYPE_AUDIO && it.isSelected }
        val f = group?.takeIf { it.length > 0 }?.getTrackFormat(0)
        val parts = ArrayList<String>()
        track?.let { parts += it.ext.uppercase() }
        if (f != null) {
            val bits = when (f.pcmEncoding) {
                C.ENCODING_PCM_16BIT -> 16
                C.ENCODING_PCM_24BIT -> 24
                C.ENCODING_PCM_32BIT, C.ENCODING_PCM_FLOAT -> 32
                else -> 0
            }
            if (bits > 0) parts += "$bits-bit"
            if (f.sampleRate > 0) parts += String.format(Locale.US, "%.1f kHz", f.sampleRate / 1000.0)
            if (f.bitrate > 0) parts += "${f.bitrate / 1000} kbps"
        }
        return parts.joinToString(" • ")
    }

    private fun updateProgress() {
        val c = controller ?: return
        val dur = c.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        seek.max = dur.toInt()
        durText.text = fmt(dur)
        if (!seeking) {
            seek.progress = c.currentPosition.toInt()
            posText.text = fmt(c.currentPosition)
        }
    }

    private fun fmt(ms: Long): String {
        val s = ms / 1000
        return String.format(Locale.US, "%d:%02d", s / 60, s % 60)
    }
}
