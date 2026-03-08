// Skeleton loader component
import React from "react";

const Skel = ({ w = 160, h = 200, t }) => (
  <div style={{ width:w, height:h, borderRadius:12, flexShrink:0,
    background:`linear-gradient(90deg,${t.skelA} 25%,${t.skelB} 50%,${t.skelA} 75%)`,
    backgroundSize:"600px 100%", animation:"shimmer 1.5s infinite" }} />
);

export default Skel;
