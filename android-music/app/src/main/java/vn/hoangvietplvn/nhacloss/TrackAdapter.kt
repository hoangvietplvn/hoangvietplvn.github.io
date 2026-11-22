package vn.hoangvietplvn.nhacloss

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class TrackAdapter(private val onClick: (Int) -> Unit) : RecyclerView.Adapter<TrackAdapter.VH>() {
    private var items: List<Track> = emptyList()
    private var currentId: String? = null

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val title: TextView = v.findViewById(R.id.title)
        val sub: TextView = v.findViewById(R.id.sub)
        val badge: TextView = v.findViewById(R.id.badge)
    }

    fun submit(list: List<Track>) {
        items = list
        notifyDataSetChanged()
    }

    fun setCurrent(mediaId: String?) {
        if (mediaId == currentId) return
        currentId = mediaId
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_track, parent, false))

    override fun onBindViewHolder(h: VH, position: Int) {
        val t = items[position]
        h.title.text = t.title
        h.sub.text = if (t.album.isBlank()) t.artist else "${t.artist} • ${t.album}"
        h.badge.text = t.ext.uppercase()
        val playing = t.id.toString() == currentId
        h.title.setTypeface(null, if (playing) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
        h.itemView.setOnClickListener { onClick(h.bindingAdapterPosition) }
    }

    override fun getItemCount() = items.size
}
