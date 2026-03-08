import React from "react";

const Brand = ({ t, size = 34, compact = false }) => (
  <div style={{ display:"flex", alignItems:"center", gap:compact ? 8 : 10, minWidth:0 }}>
    <img
      src="/groovify-icon.svg"
      alt="Groovify"
      style={{ width:size, height:size, flexShrink:0, display:"block" }}
    />
    <div style={{ display:"flex", alignItems:"baseline", gap:1, minWidth:0 }}>
      <span style={{ color:"#6366F1", fontSize:compact ? 20 : 24, fontWeight:900, letterSpacing:"-0.8px", lineHeight:1 }}>
        Groov
      </span>
      <span style={{ color:t.text, fontSize:compact ? 20 : 24, fontWeight:900, letterSpacing:"-0.8px", lineHeight:1 }}>
        ify
      </span>
    </div>
  </div>
);

export default Brand;
