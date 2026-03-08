// Album art image component
import React, { useState } from "react";

const Img = ({ src, style = {} }) => {
  const [err, setErr] = useState(false);
  if (!src || err) return (
    <div style={{ ...style, background:"linear-gradient(135deg,#1e1e38,#2a1a4e)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize: Math.min((style.width || 40), 44) * 0.5 }}>🎵</div>
  );
  return <img src={src} alt="" style={{ ...style, objectFit:"cover" }} onError={() => setErr(true)} />;
};

export default Img;
