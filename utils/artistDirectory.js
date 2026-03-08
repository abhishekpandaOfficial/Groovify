import { dedupe } from "./api";
import { FEATURED_ARTISTS, normalizeArtistName } from "./artistProfiles";

const buildArtistDirectory = (songs, recentSongs, artistInfoCache) => {
  const normalizedSongs = dedupe([
    ...songs,
    ...recentSongs,
  ]).filter((song) => song.artist);

  const indexedArtists = Array.from(new Map(
    normalizedSongs.map((song) => {
      const normalizedName = normalizeArtistName(song.artist);
      return [normalizedName.toLowerCase(), {
        name: normalizedName,
        art: song.artBig || song.art || song.artSm || "",
        songs: dedupe(songs.filter((entry) =>
          normalizeArtistName(entry.artist).toLowerCase() === normalizedName.toLowerCase()
        )),
      }];
    })
  ).values()).sort((a, b) => a.name.localeCompare(b.name));

  return Array.from(new Map([
    ...FEATURED_ARTISTS.map((name) => {
      const normalizedName = normalizeArtistName(name);
      const existing = indexedArtists.find((artist) => artist.name.toLowerCase() === normalizedName.toLowerCase());
      const wikiInfo = artistInfoCache.get(normalizedName.toLowerCase());
      return [normalizedName.toLowerCase(), existing || {
        name: normalizedName,
        art: wikiInfo?.image || "",
        description: wikiInfo?.description || "",
        songs: [],
      }];
    }),
    ...indexedArtists.map((artist) => {
      const wikiInfo = artistInfoCache.get(artist.name.toLowerCase());
      return [artist.name.toLowerCase(), {
        ...artist,
        art: wikiInfo?.image || artist.art,
        description: wikiInfo?.description || "",
      }];
    }),
  ]).values());
};

const filterAndSortArtists = (artists, query, sortMode) => {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? artists.filter((artist) => artist.name.toLowerCase().includes(normalizedQuery))
    : artists;

  const sorted = [...filtered];
  if (sortMode === "songs") {
    sorted.sort((a, b) => {
      if (b.songs.length !== a.songs.length) return b.songs.length - a.songs.length;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }

  sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
};

export { buildArtistDirectory, filterAndSortArtists };
