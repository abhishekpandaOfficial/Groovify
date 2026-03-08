const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

const searchCache = new Map();
const pendingSearches = new Map();
const artistInfoCache = new Map();

const jsonHeaders = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "User-Agent": "Groovify/1.0 (+https://groovify.local)",
};

const buildCacheKey = ({ term, iTunesLimit, audiusLimit, fullOnly }) =>
  [term.trim().toLowerCase(), iTunesLimit, audiusLimit, fullOnly ? "full" : "mixed"].join("::");

const getCached = (key) => {
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return cached.value;
};

const setCached = (key, value) => {
  searchCache.set(key, { ts: Date.now(), value });
};

const getArtistInfoCached = (key) => {
  const cached = artistInfoCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > SEARCH_CACHE_TTL_MS) {
    artistInfoCache.delete(key);
    return null;
  }
  return cached.value;
};

const setArtistInfoCached = (key, value) => {
  artistInfoCache.set(key, { ts: Date.now(), value });
};

const clampLimit = (value, fallback) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.floor(value), 30));
};

const dedupeSongs = (songs) => {
  const seen = new Set();
  return songs.filter((song) => {
    const key = `${(song.title || "").toLowerCase().trim()}|${(song.artist || "").toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: jsonHeaders });
  if (!response.ok) {
    const error = new Error(`Upstream request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const searchItunes = async (term, limit = 20) => {
  if (!limit) return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}&country=in`;
    const data = await fetchJson(url);
    return (data.results || []).filter((track) => track.previewUrl).map((track) => ({
      id: `it_${track.trackId}`,
      title: track.trackName || "Unknown",
      artist: track.artistName || "Unknown",
      album: track.collectionName || "Single",
      artSm: (track.artworkUrl60 || "").replace("60x60bb", "120x120bb"),
      art: (track.artworkUrl100 || "").replace("100x100bb", "400x400bb"),
      artBig: (track.artworkUrl100 || "").replace("100x100bb", "600x600bb"),
      audio: track.previewUrl,
      dur: track.trackTimeMillis ? track.trackTimeMillis / 1000 : 30,
      year: track.releaseDate ? Number(track.releaseDate.slice(0, 4)) : null,
      genre: track.primaryGenreName || "Music",
      source: "iTunes Preview",
      storeUrl: track.trackViewUrl,
      isPreview: true,
    }));
  } catch {
    return [];
  }
};

const searchAudius = async (term, limit = 10) => {
  if (!limit) return [];
  try {
    const url = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(term)}&limit=${limit}&app_name=Groovify`;
    const data = await fetchJson(url);
    return (data.data || []).filter((track) => !track.is_delete && track.duration > 0).map((track) => ({
      id: `au_${track.id}`,
      audiusTrackId: track.id,
      title: track.title || "Unknown",
      artist: track.user?.name || "Unknown",
      album: track.album || "Single",
      artSm: track.artwork?.["150x150"] || "",
      art: track.artwork?.["480x480"] || track.artwork?.["150x150"] || "",
      artBig: track.artwork?.["1000x1000"] || track.artwork?.["480x480"] || "",
      audio: `https://api.audius.co/v1/tracks/${track.id}/stream?app_name=Groovify`,
      dur: track.duration || 180,
      year: track.release_date ? Number(track.release_date.slice(0, 4)) : null,
      genre: track.genre || "Music",
      source: "Audius (Full)",
      storeUrl: `https://audius.co${track.permalink || ""}`,
      isPreview: false,
    }));
  } catch (error) {
    if (error?.status === 429) return [];
    return [];
  }
};

const searchMusic = async ({
  term = "",
  iTunesLimit = 18,
  audiusLimit = 8,
  fullOnly = false,
}) => {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return [];

  const cacheKey = buildCacheKey({
    term: normalizedTerm,
    iTunesLimit,
    audiusLimit,
    fullOnly,
  });
  const cached = getCached(cacheKey);
  if (cached) return cached;
  if (pendingSearches.has(cacheKey)) {
    return pendingSearches.get(cacheKey);
  }

  const searchPromise = (async () => {
    const [itunes, audius] = await Promise.all([
      searchItunes(normalizedTerm, clampLimit(iTunesLimit, 18)),
      searchAudius(normalizedTerm, clampLimit(audiusLimit, 8)),
    ]);
    const merged = dedupeSongs([...audius, ...itunes]);
    const result = fullOnly ? merged.filter((song) => !song.isPreview) : merged;
    setCached(cacheKey, result);
    return result;
  })();

  pendingSearches.set(cacheKey, searchPromise);
  try {
    return await searchPromise;
  } finally {
    pendingSearches.delete(cacheKey);
  }
};

const parseSearchParams = (requestUrl) => {
  const url = new URL(requestUrl, "http://localhost");
  return {
    term: url.searchParams.get("term") || "",
    iTunesLimit: clampLimit(Number(url.searchParams.get("itunesLimit") || 18), 18),
    audiusLimit: clampLimit(Number(url.searchParams.get("audiusLimit") || 8), 8),
    fullOnly: url.searchParams.get("fullOnly") === "true",
  };
};

const writeJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const fetchArtistInfo = async (artistName) => {
  const normalizedName = artistName.trim();
  if (!normalizedName) return null;

  const cacheKey = normalizedName.toLowerCase();
  const cached = getArtistInfoCached(cacheKey);
  if (cached) return cached;

  try {
    const fetchSummary = async (title) =>
      fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);

    let summary;
    try {
      summary = await fetchSummary(normalizedName);
    } catch {
      const search = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${normalizedName} singer musician`)}&utf8=1&format=json&origin=*`);
      const bestMatch = search?.query?.search?.[0]?.title;
      if (!bestMatch) throw new Error("No artist summary found");
      summary = await fetchSummary(bestMatch);
    }

    const artistInfo = {
      name: summary.title || normalizedName,
      description: summary.description || "",
      extract: summary.extract || "",
      image: summary.originalimage?.source || summary.thumbnail?.source || "",
      pageUrl: summary.content_urls?.desktop?.page || "",
    };
    setArtistInfoCached(cacheKey, artistInfo);
    return artistInfo;
  } catch {
    const fallback = {
      name: normalizedName,
      description: "",
      extract: "",
      image: "",
      pageUrl: "",
    };
    setArtistInfoCached(cacheKey, fallback);
    return fallback;
  }
};

const handleMusicSearchRequest = async (req, res) => {
  if (req.method !== "GET") {
    writeJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const params = parseSearchParams(req.url || "/api/music-search");
    if (!params.term.trim()) {
      writeJson(res, 400, { error: "Missing search term" });
      return;
    }

    const songs = await searchMusic(params);
    writeJson(res, 200, { songs });
  } catch {
    writeJson(res, 500, { error: "Music search is temporarily unavailable." });
  }
};

const handleArtistInfoRequest = async (req, res) => {
  if (req.method !== "GET") {
    writeJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const url = new URL(req.url || "/api/artist-info", "http://localhost");
    const artist = url.searchParams.get("artist") || "";
    if (!artist.trim()) {
      writeJson(res, 400, { error: "Missing artist name" });
      return;
    }

    const info = await fetchArtistInfo(artist);
    writeJson(res, 200, { artist: info });
  } catch {
    writeJson(res, 500, { error: "Artist info is temporarily unavailable." });
  }
};

export { fetchArtistInfo, handleArtistInfoRequest, handleMusicSearchRequest, searchMusic };
