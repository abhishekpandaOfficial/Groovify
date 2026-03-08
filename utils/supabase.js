import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const getRedirectTo = () => {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/`;
};

const signInWithProvider = async (provider) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: getRedirectTo() },
  });
};

const signInWithEmail = async ({ email, password }) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase.auth.signInWithPassword({ email, password });
};

const signUpWithEmail = async ({ email, password, name, role = "listener" }) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        role,
      },
    },
  });
};

const signOutUser = async () => {
  if (!supabase) return;
  return supabase.auth.signOut();
};

const fetchProfile = async (userId) => {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const upsertProfile = async (profile) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const payload = {
    id: profile.id,
    email: profile.email ?? null,
    full_name: profile.full_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    role: profile.role ?? "listener",
    bio: profile.bio ?? null,
    country: profile.country ?? null,
    languages: profile.languages ?? [],
    genres: profile.genres ?? [],
    stage_name: profile.stage_name ?? null,
    website: profile.website ?? null,
    wiki_url: profile.wiki_url ?? null,
    saved_song_ids: profile.saved_song_ids ?? [],
  };
  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

const listPublishedSongs = async () => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("artist_songs")
    .select("id,title,artist_name,album,genre,language,cover_url,cover_path,audio_url,audio_path,duration,release_year,credit_name,source,created_at,profile_id")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

const uploadArtistAsset = async ({ userId, file, bucket, pathPrefix }) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const fileName = `${pathPrefix}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return {
    path: fileName,
    publicUrl: data.publicUrl,
  };
};

const publishArtistSong = async (payload) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("publish-song", {
    body: payload,
  });
  if (error) throw error;
  return data;
};

const fetchArtistWiki = async (artistName) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("artist-wiki", {
    body: { artistName },
  });
  if (error) throw error;
  return data;
};

export {
  fetchArtistWiki,
  fetchProfile,
  isSupabaseConfigured,
  listPublishedSongs,
  publishArtistSong,
  signInWithEmail,
  signInWithProvider,
  signOutUser,
  signUpWithEmail,
  supabase,
  upsertProfile,
  uploadArtistAsset,
};
