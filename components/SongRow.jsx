// Song row component
import React, { useState } from "react";
import Wave from "./Wave";
import Img from "./Img";

const SongRow = ({ song, num, isCurrent, isPlaying, liked, onPlay, onLike, t, fmtTime }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onPlay}
      style={{ display:"flex", alignItems:"center", gap:12, padding:"7px 10px", borderRadius:10,
        cursor:"pointer", transition:"background .12s",
        background:hov || isCurrent ? t.rowHov : "transparent" }}>
      <div style={{ width:34, textAlign:"center", fontSize:12, flexShrink:0,
        color:isCurrent ? "#6366F1" : t.textMuted, fontWeight:isCurrent ? 700 : 400 }}>
        {isCurrent && isPlaying ? <Wave n={3} h={14} color="#6366F1" /> : num}
      </div>
      <div style={{ width:42, height:42, borderRadius:8, overflow:"hidden", flexShrink:0 }}>
        <Img src={song.artSm} style={{ width:42, height:42 }} />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13.5, fontWeight:isCurrent ? 700 : 500,
          color:isCurrent ? "#6366F1" : t.text,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.title}</div>
        <div style={{ fontSize:11.5, color:t.textSub, marginTop:1,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {song.artist} · {song.album}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <span style={{ fontSize:9, padding:"2px 7px", borderRadius:6, fontWeight:700,
          background:song.isPreview ? t.badgePrev : t.badgeFull,
          color:song.isPreview ? "#94A3B8" : "#10B981" }}>
          {song.isPreview ? "30s" : "FULL"}
        </span>
        <span style={{ fontSize:11, color:t.textMuted, minWidth:28 }}>{song.year || ""}</span>
        <button onClick={e => { e.stopPropagation(); onLike(); }}
          style={{ background:"none", border:"none", cursor:"pointer", fontSize:14,
            color:liked ? "#EF4444" : t.textMuted, padding:"2px 4px", lineHeight:1 }}>
          {liked ? "♥" : "♡"}
        </button>
        <span style={{ fontSize:11, color:t.textMuted, minWidth:36, textAlign:"right" }}>
          {fmtTime(song.dur)}
        </span>
      </div>
    </div>
  );
};

export default SongRow;
