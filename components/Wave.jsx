// Wave animation component
import React from "react";

const Wave = ({ n = 4, h = 18, color = "#6366F1", gap = 3 }) => (
  <div style={{ display:"flex", alignItems:"flex-end", gap, height:h, flexShrink:0 }}>
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} style={{ width:3, background:color, borderRadius:2,
        animation:`wv .8s ease-in-out ${i * .15}s infinite` }} />
    ))}
  </div>
);

export default Wave;
