// App constants
const CATALOG = [
  { key:"bollywood",  label:"🎬 Bollywood",  queries:["Arijit Singh songs","Jubin Nautiyal hits","Bollywood top songs"],          cat:"bollywood" },
  { key:"telugu",     label:"⭐ Telugu",     queries:["Telugu hit songs","Anirudh Telugu","Devi Sri Prasad songs"],             cat:"telugu" },
  { key:"odia",       label:"🌊 Odia",       queries:["Odia hit songs","Humane Sagar songs","Odia new songs"],                  cat:"odia" },
  { key:"punjabi",    label:"🎵 Punjabi",    queries:["Punjabi hit songs","Diljit Dosanjh songs","Karan Aujla songs"],           cat:"punjabi" },
  { key:"tamil",      label:"🎭 Tamil",      queries:["Tamil hit songs","AR Rahman Tamil","Anirudh songs"],                     cat:"tamil" },
  { key:"kannada",    label:"🎶 Kannada",    queries:["Kannada hit songs","KGF songs","Ravi Basrur songs"],                     cat:"kannada" },
  { key:"english",    label:"🌐 English",    queries:["English pop hits","global english songs","indie pop english","UK top songs","US chart songs"], cat:"english" },
  { key:"spanish",    label:"💃 Spanish",    queries:["Spanish pop hits","latin hits","reggaeton popular songs","musica latina popular","spanish romantic songs"], cat:"spanish" },
  { key:"afro",       label:"🔥 Afro",       queries:["Afrobeats hits","afro pop songs","nigerian hit songs"],                  cat:"afro" },
  { key:"folk",       label:"🪘 Folk",       queries:["Indian folk songs","Baul songs Bengal","Garba Gujarati folk"],            cat:"folk" },
  { key:"worldfolk",  label:"🌍 World Folk", queries:["Irish folk songs","Arabic folk songs","Latin folk songs"],               cat:"worldfolk" },
  { key:"producer",   label:"🎛 Producer Cuts", queries:["produced by metro boomin songs","anirudh producer songs","dj remix producer tracks"], cat:"producer" },
  { key:"classic",    label:"🏆 Classics",   queries:["Lata Mangeshkar songs","Kishore Kumar songs","90s Bollywood songs"],      cat:"classic" },
  { key:"devotional", label:"🙏 Devotional", queries:["Bhakti songs Hindi","Jagannath bhajan","Bhajan songs India"],             cat:"devotional" },
];

const INDUSTRIES = [
  { id:"all",       label:"All",        emoji:"🌏", color:"#6366F1" },
  { id:"bollywood", label:"Bollywood",  emoji:"🎬", color:"#EF4444" },
  { id:"telugu",    label:"Telugu",     emoji:"⭐", color:"#F59E0B" },
  { id:"odia",      label:"Odia",       emoji:"🌊", color:"#10B981" },
  { id:"punjabi",   label:"Punjabi",    emoji:"🎵", color:"#F97316" },
  { id:"tamil",     label:"Tamil",      emoji:"🎭", color:"#8B5CF6" },
  { id:"kannada",   label:"Kannada",    emoji:"🎶", color:"#06B6D4" },
  { id:"english",   label:"English",    emoji:"🌐", color:"#3B82F6" },
  { id:"spanish",   label:"Spanish",    emoji:"💃", color:"#E11D48" },
  { id:"afro",      label:"Afro",       emoji:"🔥", color:"#F97316" },
  { id:"folk",      label:"Folk",       emoji:"🪘", color:"#D97706" },
  { id:"worldfolk", label:"World Folk", emoji:"🌍", color:"#0F766E" },
  { id:"producer",  label:"Producer",   emoji:"🎛", color:"#A855F7" },
  { id:"classic",   label:"Classics",   emoji:"🏆", color:"#EC4899" },
  { id:"devotional",label:"Devotional", emoji:"🙏", color:"#22C55E" },
];

const YEARS = [
  { id:"2025", label:"2025", from:2025, to:2025 },
  { id:"2024", label:"2024", from:2024, to:2024 },
  { id:"2023", label:"2023", from:2023, to:2023 },
  { id:"2022", label:"2022", from:2022, to:2022 },
  { id:"2021", label:"2021", from:2021, to:2021 },
  { id:"2020", label:"2020", from:2020, to:2020 },
  { id:"2019", label:"2019", from:2019, to:2019 },
  { id:"2015s",label:"2015–17",from:2015,to:2017 },
  { id:"2010s",label:"2010–14",from:2010,to:2014 },
  { id:"2000s",label:"2000s", from:2000, to:2009 },
  { id:"1990s",label:"1990s", from:1990, to:1999 },
  { id:"classic",label:"Classic",from:1950,to:1989 },
];

const CONTENT_FILTERS = [
  { id:"all",    label:"All" },
  { id:"full",   label:"Full Songs" },
  { id:"remix",  label:"Remix" },
  { id:"mashup", label:"Mashup" },
  { id:"producer", label:"Producer" },
];

export { CATALOG, CONTENT_FILTERS, INDUSTRIES, YEARS };
