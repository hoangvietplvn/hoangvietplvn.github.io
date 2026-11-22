package vn.hoangvietplvn.nhacloss

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore

data class Track(
    val id: Long,
    val title: String,
    val artist: String,
    val album: String,
    val durationMs: Long,
    val ext: String,
    val uri: Uri,
) {
    val lossless: Boolean get() = ext in LOSSLESS_EXT

    companion object {
        // Chỉ liệt kê định dạng ExoPlayer phát được. ALAC thường nằm trong .m4a nhưng
        // MediaStore không phân biệt được với AAC, nên chỉ nhận đuôi .alac.
        val LOSSLESS_EXT = setOf("flac", "wav", "alac")

        fun scan(ctx: Context): List<Track> {
            val out = ArrayList<Track>()
            val proj = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DISPLAY_NAME,
            )
            val sel = "${MediaStore.Audio.Media.IS_RINGTONE}=0 AND " +
                "${MediaStore.Audio.Media.IS_NOTIFICATION}=0 AND " +
                "${MediaStore.Audio.Media.IS_ALARM}=0"
            val sort = "${MediaStore.Audio.Media.ARTIST} COLLATE NOCASE, " +
                "${MediaStore.Audio.Media.ALBUM} COLLATE NOCASE, ${MediaStore.Audio.Media.TRACK}"
            ctx.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, proj, sel, null, sort
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0)
                    val name = c.getString(5) ?: ""
                    val artist = c.getString(2)?.takeUnless { it == "<unknown>" } ?: "Không rõ nghệ sĩ"
                    out += Track(
                        id = id,
                        title = c.getString(1) ?: name,
                        artist = artist,
                        album = c.getString(3) ?: "",
                        durationMs = c.getLong(4),
                        ext = name.substringAfterLast('.', "").lowercase(),
                        uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id),
                    )
                }
            }
            return out
        }
    }
}
