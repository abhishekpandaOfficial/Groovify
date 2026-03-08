import React from "react";
import Img from "./Img";

const ArtistCard = ({ artist, t, onClick }) => (
  <button onClick={onClick}
    style={{ textAlign:"left", padding:0, borderRadius:18, overflow:"hidden",
      border:`1px solid ${t.sideB}`, background:t.card, cursor:"pointer" }}>
    <div style={{ aspectRatio:"1", background:t.skelA }}>
      {artist.art
        ? <Img src={artist.art} style={{ width:"100%", height:"100%" }} />
        : <div style={{ width:"100%", height:"100%",
            background:"linear-gradient(135deg,#6366F1,#8B5CF6)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:40, fontWeight:900, color:"#fff" }}>
            {artist.name[0]}
          </div>
      }
    </div>
    <div style={{ padding:"12px 14px 14px" }}>
      <div style={{ fontSize:14, fontWeight:700, color:t.text, marginBottom:4,
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {artist.name}
      </div>
      {artist.description && (
        <div style={{ fontSize:11.5, color:t.textSub, lineHeight:1.45, marginBottom:6,
          display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
          {artist.description}
        </div>
      )}
      <div style={{ fontSize:11.5, color:t.textMuted }}>
        {artist.songs.length} songs
      </div>
    </div>
  </button>
);

export default ArtistCard;
