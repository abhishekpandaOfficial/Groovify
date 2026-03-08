// API utility functions
const fetchItunes = async (term, limit = 20) => {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}&country=in`;
    const r = await fetch(url);
    const d = await r.json();
    return (d.results || []).filter(x => x.previewUrl).map(x => ({
      id:        `it_${x.trackId}`,
      title:     x.trackName || "Unknown",
      artist:    x.artistName || "Unknown",
      album:     x.collectionName || "Single",
      artSm:     (x.artworkUrl60  || "").replace("60x60bb",   "120x120bb"),
      art:       (x.artworkUrl100 || "").replace("100x100bb", "400x400bb"),
      artBig:    (x.artworkUrl100 || "").replace("100x100bb", "600x600bb"),
      audio:     x.previewUrl,
      dur:       x.trackTimeMillis ? x.trackTimeMillis / 1000 : 30,
      year:      x.releaseDate ? +x.releaseDate.slice(0, 4) : null,
      genre:     x.primaryGenreName || "Music",
      source:    "iTunes Preview",
      storeUrl:  x.trackViewUrl,
      isPreview: true,
    }));
  } catch { return []; }
};

const findPreviewFallback = async (song) => {
  if (!song?.title) return null;
  const query = [song.title, song.artist].filter(Boolean).join(" ");
  const results = await fetchItunes(query, 10);
  const normalizedTitle = (song.title || "").toLowerCase().trim();
  const normalizedArtist = (song.artist || "").toLowerCase().trim();

  const bestMatch = results.find((candidate) => {
    const sameTitle = (candidate.title || "").toLowerCase().trim() === normalizedTitle;
    const sameArtist = (candidate.artist || "").toLowerCase().trim() === normalizedArtist;
    return sameTitle || sameArtist;
  }) || results[0];

  if (!bestMatch) return null;

  return {
    ...song,
    audio: bestMatch.audio,
    artSm: song.artSm || bestMatch.artSm,
    art: song.art || bestMatch.art,
    artBig: song.artBig || bestMatch.artBig,
    source: `${song.source} -> iTunes Preview`,
    storeUrl: song.storeUrl || bestMatch.storeUrl,
    isPreview: true,
  };
};

const AUDIUS_HOST = "https://api.audius.co";

const getAudiusStreamUrl = (trackId) =>
  `${AUDIUS_HOST}/v1/tracks/${trackId}/stream?app_name=Groovify`;

const fetchAudius = async (term, limit = 10) => {
  try {
    const r = await fetch(`${AUDIUS_HOST}/v1/tracks/search?query=${encodeURIComponent(term)}&limit=${limit}&app_name=Groovify`);
    const d = await r.json();
    return (d.data || []).filter(x => !x.is_delete && x.duration > 0).map(x => ({
      id:        `au_${x.id}`,
      audiusTrackId: x.id,
      title:     x.title || "Unknown",
      artist:    x.user?.name || "Unknown",
      album:     x.album || "Single",
      artSm:     x.artwork?.["150x150"] || "",
      art:       x.artwork?.["480x480"] || x.artwork?.["150x150"] || "",
      artBig:    x.artwork?.["1000x1000"] || x.artwork?.["480x480"] || "",
      audio:     getAudiusStreamUrl(x.id),
      dur:       x.duration || 180,
      year:      x.release_date ? +x.release_date.slice(0, 4) : null,
      genre:     x.genre || "Music",
      source:    "Audius (Full)",
      storeUrl:  `https://audius.co${x.permalink || ""}`,
      isPreview: false,
    }));
  } catch { return []; }
};

const dedupe = arr => {
  const seen = new Set();
  return arr.filter(s => {
    const k = `${s.title.toLowerCase().trim()}|${s.artist.toLowerCase().trim()}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
};

const fetchBoth = async (term, iL = 18, aL = 8, options = {}) => {
  const { fullOnly = false } = options;
  const [it, au] = await Promise.all([fetchItunes(term, iL), fetchAudius(term, aL)]);
  const merged = dedupe([...au, ...it]);
  return fullOnly ? merged.filter((song) => !song.isPreview) : merged;
};

const refreshSongStream = async (song) => {
  if (!song || song.isPreview || !song.audiusTrackId) return song;
  return {
    ...song,
    audio: getAudiusStreamUrl(song.audiusTrackId),
  };
};

export { fetchItunes, fetchAudius, fetchBoth, dedupe, findPreviewFallback, refreshSongStream };
