const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

const FEATURED_ARTISTS = [
  "Arijit Singh",
  "Shreya Ghoshal",
  "A. R. Rahman",
  "Anirudh Ravichander",
  "Diljit Dosanjh",
  "Sonu Nigam",
  "Lata Mangeshkar",
  "Kishore Kumar",
  "Sid Sriram",
  "Badshah",
  "Taylor Swift",
  "Bad Bunny",
];

const normalizeArtistName = (name) => (name || "").replace(/\s+/g, " ").trim();

const slugifyArtist = (name) =>
  normalizeArtistName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const formatArtistSong = (song) => ({
  id: `artist_${song.id}`,
  title: song.title,
  artist: song.artist_name || song.credit_name || "Independent Artist",
  album: song.album || "Single",
  artSm: song.cover_url || "",
  art: song.cover_url || "",
  artBig: song.cover_url || "",
  audio: song.audio_path && supabaseUrl
    ? `${supabaseUrl}/functions/v1/song-stream?id=${song.id}`
    : song.audio_url || "",
  dur: song.duration || 180,
  year: song.release_year || null,
  genre: song.genre || "Music",
  language: song.language || null,
  source: song.source || "Groovify Artists",
  credit: song.credit_name || song.artist_name || "Independent Artist",
  storeUrl: "",
  isPreview: false,
  uploadedByArtist: true,
  profileId: song.profile_id || null,
});

export { FEATURED_ARTISTS, formatArtistSong, normalizeArtistName, slugifyArtist };
