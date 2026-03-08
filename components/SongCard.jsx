// Song card component
import React, { useState } from "react";
import Wave from "./Wave";
import Img from "./Img";

const SongCard = ({ song, isCurrent, isPlaying, liked, onPlay, onLike, size = 160, t }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ borderRadius:14, overflow:"hidden", cursor:"pointer", flexShrink:0,
        width:size, background:isCurrent ? t.active : hov ? t.hover : t.card,
        border:`1px solid ${isCurrent ? "rgba(99,102,241,0.35)" : hov ? t.cardB : t.divider}`,
        transform:hov ? "translateY(-5px)" : "none",
        boxShadow:isCurrent ? "0 0 28px rgba(99,102,241,0.2)" : hov ? "0 12px 36px rgba(0,0,0,0.15)" : "none",
        transition:"all .28s cubic-bezier(.4,0,.2,1)" }}>
      <div style={{ width:"100%", height:size, position:"relative", overflow:"hidden" }}>
        <Img src={song.art} style={{ width:"100%", height:"100%",
          transition:"transform .4s", transform:hov || isCurrent ? "scale(1.06)" : "scale(1)" }} />
        <div style={{ position:"absolute", inset:0,
          background:"linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)" }} />
        <div style={{ position:"absolute", top:8, left:8, fontSize:8, fontWeight:700,
          letterSpacing:.8, padding:"2px 7px", borderRadius:6,
          background:"rgba(0,0,0,0.55)", backdropFilter:"blur(8px)",
          color:song.isPreview ? "#94A3B8" : "#34D399" }}>
          {song.isPreview ? "PREVIEW" : "FULL"}
        </div>
        {(hov || isCurrent) && (
          <div style={{ position:"absolute", bottom:10, right:10 }}
            onClick={e => { e.stopPropagation(); onPlay(); }}>
            <div style={{ width:36, height:36, borderRadius:"50%",
              background:isCurrent && isPlaying ? "rgba(255,255,255,0.2)" : "#6366F1",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 4px 16px rgba(0,0,0,0.4)" }}>
              {isCurrent && isPlaying ? <Wave n={3} h={13} color="#fff" /> : <span style={{ color:"#fff", fontSize:13 }}>▶</span>}
            </div>
          </div>
        )}
        {isCurrent && isPlaying && !hov && (
          <div style={{ position:"absolute", bottom:10, right:10 }}>
            <Wave n={4} h={15} color="#6366F1" />
          </div>
        )}
      </div>
      <div style={{ padding:"11px 12px 12px" }}>
        <div style={{ fontSize:13, fontWeight:600, color:isCurrent ? "#6366F1" : t.text,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:2 }}>
          {song.title}
        </div>
        <div style={{ fontSize:11.5, color:t.textSub, overflow:"hidden",
          textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{song.artist}</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8 }}>
          <span style={{ fontSize:10, color:t.textMuted, fontWeight:500 }}>{song.year || song.genre || ""}</span>
          <button onClick={e => { e.stopPropagation(); onLike(); }}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:13,
              color:liked ? "#EF4444" : t.textMuted, lineHeight:1, padding:0 }}>
            {liked ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SongCard;
