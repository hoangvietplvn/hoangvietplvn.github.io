package vn.hoangvietplvn.danbai

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile

// Kho ảnh: ảnh lưu trong bộ nhớ riêng của ứng dụng (không cần quyền truy cập thư viện).
// Mỗi ảnh là một tệp; danh sách lưu trong index.json.
class ImageStore(context: Context) {

    private val dir = File(context.filesDir, "kho-anh").apply { mkdirs() }
    private val indexFile = File(dir, "index.json")
    private val lock = Any()
    private val idPattern = Regex("^i[0-9_]+$")

    private fun readIndex(): JSONArray = try {
        JSONArray(indexFile.readText())
    } catch (e: Exception) {
        JSONArray()
    }

    private fun writeIndex(arr: JSONArray) {
        indexFile.writeText(arr.toString())
    }

    private fun fileOf(id: String): File? = if (idPattern.matches(id)) File(dir, id) else null

    fun list(): String = synchronized(lock) { readIndex().toString() }

    fun add(name: String, mime: String, b64: String, source: String): String = synchronized(lock) {
        val id = "i" + System.currentTimeMillis() + "_" + (0..99999).random()
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        File(dir, id).writeBytes(bytes)
        val arr = readIndex()
        arr.put(
            JSONObject()
                .put("id", id)
                .put("name", name)
                .put("mime", mime)
                .put("size", bytes.size)
                .put("source", source)
                .put("added", System.currentTimeMillis())
        )
        writeIndex(arr)
        id
    }

    fun size(id: String): Int = synchronized(lock) {
        fileOf(id)?.takeIf { it.exists() }?.length()?.toInt() ?: 0
    }

    // Đoạn ảnh dạng base64 (offset và length là số byte gốc). Ghép các đoạn bằng cách nối chuỗi.
    fun chunk(id: String, offset: Int, length: Int): String = synchronized(lock) {
        val f = fileOf(id)?.takeIf { it.exists() }
        if (f == null) {
            ""
        } else {
            RandomAccessFile(f, "r").use { raf ->
                val n = minOf(length.toLong(), raf.length() - offset.toLong()).toInt()
                if (n <= 0) {
                    ""
                } else {
                    val buf = ByteArray(n)
                    raf.seek(offset.toLong())
                    raf.readFully(buf)
                    Base64.encodeToString(buf, Base64.NO_WRAP)
                }
            }
        }
    }

    fun delete(id: String) = synchronized(lock) {
        fileOf(id)?.delete()
        val arr = readIndex()
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.getString("id") != id) out.put(o)
        }
        writeIndex(out)
    }

    fun clear() = synchronized(lock) {
        dir.listFiles()?.forEach { if (it != indexFile) it.delete() }
        writeIndex(JSONArray())
    }
}
