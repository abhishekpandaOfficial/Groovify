const searchLocalMusicApi = async (term, { iTunesLimit = 18, audiusLimit = 8, fullOnly = false } = {}) => {
  const params = new URLSearchParams({
    term,
    itunesLimit: String(iTunesLimit),
    audiusLimit: String(audiusLimit),
    fullOnly: String(fullOnly),
  });
  const response = await fetch(`/api/music-search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Music search failed with ${response.status}`);
  }
  const payload = await response.json();
  return payload.songs || [];
};

const fetchArtistInfo = async (artistName) => {
  const params = new URLSearchParams({ artist: artistName });
  const response = await fetch(`/api/artist-info?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Artist info failed with ${response.status}`);
  }
  const payload = await response.json();
  return payload.artist || null;
};

// API utility functions
const fetchItunes = async (term, limit = 20) => {
  try {
    return await searchLocalMusicApi(term, { iTunesLimit: limit, audiusLimit: 0, fullOnly: false });
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
    const songs = await searchLocalMusicApi(term, { iTunesLimit: 0, audiusLimit: limit, fullOnly: false });
    return songs.map((song) => song.audiusTrackId ? { ...song, audio: getAudiusStreamUrl(song.audiusTrackId) } : song);
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
  try {
    const songs = await searchLocalMusicApi(term, {
      iTunesLimit: iL,
      audiusLimit: aL,
      fullOnly,
    });
    return dedupe(songs);
  } catch {
    return [];
  }
};

const refreshSongStream = async (song) => {
  if (!song || song.isPreview || !song.audiusTrackId) return song;
  return {
    ...song,
    audio: getAudiusStreamUrl(song.audiusTrackId),
  };
};

export { fetchArtistInfo, fetchItunes, fetchAudius, fetchBoth, dedupe, findPreviewFallback, refreshSongStream };
