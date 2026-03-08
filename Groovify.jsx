import { useCallback, useEffect, useRef, useState } from "react";
import { CATALOG, CONTENT_FILTERS, INDUSTRIES, YEARS } from "./config/constants";
import { DARK, LIGHT } from "./config/themes";
import Img from "./components/Img";
import Skel from "./components/Skel";
import Brand from "./components/Brand";
import SongCard from "./components/SongCard";
import SongRow from "./components/SongRow";
import { dedupe, fetchArtistInfo, fetchBoth, findPreviewFallback, refreshSongStream } from "./utils/api";
import { FEATURED_ARTISTS, formatArtistSong, normalizeArtistName } from "./utils/artistProfiles";
import {
  fetchProfile,
  isSupabaseConfigured,
  listPublishedSongs,
  publishArtistSong,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  supabase,
  upsertProfile,
  uploadArtistAsset,
} from "./utils/supabase";

const fmtTime = (s) => {
  if (!s || Number.isNaN(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const matchesToken = (song, token) => {
  const haystack = [
    song.title,
    song.artist,
    song.album,
    song.genre,
    song.source,
  ].filter(Boolean).join(" ").toLowerCase();

  return haystack.includes(token);
};

const applyYearFilter = (list, yearId) => {
  const yr = YEARS.find((y) => y.id === yearId);
  if (!yr) return list;
  return list.filter((song) => song.year && song.year >= yr.from && song.year <= yr.to);
};

const applyContentFilter = (list, contentFilter) => {
  if (contentFilter === "full") return list.filter((song) => !song.isPreview);
  if (contentFilter === "remix") return list.filter((song) => matchesToken(song, "remix"));
  if (contentFilter === "mashup") return list.filter((song) => matchesToken(song, "mashup"));
  if (contentFilter === "producer") {
    return list.filter((song) =>
      matchesToken(song, "producer") ||
      matchesToken(song, "produced") ||
      matchesToken(song, "beat") ||
      matchesToken(song, "dj")
    );
  }
  return list;
};

const buildDiscoveryTerm = (term, contentFilter) => {
  if (contentFilter === "remix") return `${term} remix`;
  if (contentFilter === "mashup") return `${term} mashup`;
  if (contentFilter === "producer") return `${term} produced by`;
  return term;
};

const SUPPORT_MINIMUMS = {
  INR: 50,
  USD: 2.5,
};

const STORAGE_KEYS = {
  users: "groovify_users",
  session: "groovify_session",
};

const buildAuthUser = (sessionUser, profile) => ({
  id: sessionUser.id,
  email: sessionUser.email || profile?.email || "",
  name: profile?.full_name || sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || "Groovify User",
  full_name: profile?.full_name || sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || "",
  avatar_url: profile?.avatar_url || sessionUser.user_metadata?.avatar_url || "",
  role: profile?.role || sessionUser.user_metadata?.role || "listener",
  bio: profile?.bio || "",
  country: profile?.country || "",
  languages: profile?.languages || [],
  genres: profile?.genres || [],
  stage_name: profile?.stage_name || "",
  website: profile?.website || "",
  wiki_url: profile?.wiki_url || "",
  savedSongIds: profile?.saved_song_ids || [],
  emailVerified: Boolean(sessionUser.email_confirmed_at),
});

// ═══════════════════════════════ MAIN ════════════════════════════
export default function Groovify() {
  const [dark, setDark]         = useState(() => {
    try { return localStorage.getItem("groovify_theme") !== "light"; } catch { return true; }
  });
  const t = dark ? DARK : LIGHT;

  const [view,        setView]        = useState("home");
  const [catalog,     setCatalog]     = useState({});
  const [searchRes,   setSearchRes]   = useState([]);
  const [browseList,  setBrowseList]  = useState([]);
  const [artistSongs, setArtistSongs] = useState([]);
  const [artistView,  setArtistView]  = useState(null);
  const [artistInfo,  setArtistInfo]  = useState(null);
  const [artistInfoTick, setArtistInfoTick] = useState(0);
  const [loadingHome, setLoadingHome] = useState(true);
  const [loadingKey,  setLoadingKey]  = useState(null);
  const [searchQ,     setSearchQ]     = useState("");
  const [industry,    setIndustry]    = useState("all");
  const [yearId,      setYearId]      = useState(null);
  const [contentFilter, setContentFilter] = useState("full");
  const [liked,       setLiked]       = useState(new Set());
  const [authMode,    setAuthMode]    = useState("login");
  const [authOpen,    setAuthOpen]    = useState(false);
  const [authForm,    setAuthForm]    = useState({ name:"", email:"", password:"", role:"listener" });
  const [authError,   setAuthError]   = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [artistUploads, setArtistUploads] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    role: "listener",
    stageName: "",
    bio: "",
    country: "",
    languages: "",
    genres: "",
    website: "",
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: "",
    album: "",
    genre: "",
    language: "",
    releaseYear: "",
    creditName: "",
    coverFile: null,
    audioFile: null,
  });
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportCurrency, setSupportCurrency] = useState("INR");
  const [supportAmountInput, setSupportAmountInput] = useState("");
  const [current,     setCurrent]     = useState(null);
  const [playing,     setPlaying]     = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [curTime,     setCurTime]     = useState(0);
  const [totalDur,    setTotalDur]    = useState(30);
  const [vol,         setVol]         = useState(0.85);
  const [muted,       setMuted]       = useState(false);
  const [shuffle,     setShuffle]     = useState(false);
  const [repeat,      setRepeat]      = useState(false);
  const [showPanel,   setShowPanel]   = useState(false);
  const [sideOpen,    setSideOpen]    = useState(true);
  const [mobile,      setMobile]      = useState(false);
  const [toast,       setToast]       = useState({ msg:"", type:"info" });
  const [lastFetch,   setLastFetch]   = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);

  const audioRef   = useRef(null);
  const currentRef = useRef(null);
  const queueRef   = useRef([]);
  const idxRef     = useRef(-1);
  const advanceQueueRef = useRef(null);
  const shuffleRef = useRef(false);
  const repeatRef  = useRef(false);
  const searchTmr  = useRef(null);
  const retryRef   = useRef(new Set());
  const pausedByUserRef = useRef(false);
  const sectionCacheRef = useRef(new Map());
  const browseCacheRef = useRef(new Map());
  const searchCacheRef = useRef(new Map());
  const artistCacheRef = useRef(new Map());
  const artistInfoCacheRef = useRef(new Map());
  const searchReqRef = useRef(0);
  const artistReqRef = useRef(0);
  const supportAmount = Number(supportAmountInput);
  const supportMinimum = SUPPORT_MINIMUMS[supportCurrency];
  const supportAmountValid = Number.isFinite(supportAmount) && supportAmount >= supportMinimum;
  const supportAmountLabel = supportCurrency === "INR" ? `Rs${supportMinimum}` : `$${supportMinimum}`;
  const artistProfileComplete = Boolean(
    currentUser?.role === "artist" &&
    currentUser?.stage_name &&
    currentUser?.bio &&
    currentUser?.country &&
    currentUser?.genres?.length
  );
  const canUploadSongs = Boolean(
    isSupabaseConfigured &&
    currentUser?.role === "artist" &&
    currentUser?.emailVerified &&
    artistProfileComplete
  );

  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current  = repeat;  }, [repeat]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => {
    try { localStorage.setItem("groovify_theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      let alive = true;

      const syncSupabaseUser = async (sessionUser) => {
        if (!alive) return;
        if (!sessionUser) {
          setCurrentUser(null);
          setLiked(new Set());
          return;
        }

        try {
          let profile = await fetchProfile(sessionUser.id);
          if (!profile) {
            profile = await upsertProfile({
              id: sessionUser.id,
              email: sessionUser.email,
              full_name: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || "",
              role: sessionUser.user_metadata?.role || "listener",
            });
          }
          const nextUser = buildAuthUser(sessionUser, profile);
          setCurrentUser(nextUser);
          setLiked(new Set(nextUser.savedSongIds || []));
        } catch {
          const nextUser = buildAuthUser(sessionUser, null);
          setCurrentUser(nextUser);
          setLiked(new Set(nextUser.savedSongIds || []));
        }
      };

      supabase.auth.getSession().then(({ data }) => {
        syncSupabaseUser(data.session?.user || null);
      });

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        syncSupabaseUser(session?.user || null);
      });

      return () => {
        alive = false;
        authListener.subscription.unsubscribe();
      };
    }

    try {
      const savedSession = localStorage.getItem(STORAGE_KEYS.session);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        setCurrentUser(parsed);
        setLiked(new Set(parsed.savedSongIds || []));
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!currentUser) {
      try { localStorage.removeItem(STORAGE_KEYS.session); } catch {}
      return;
    }

    const savedSongIds = Array.from(liked);
    setCurrentUser((prev) => prev ? { ...prev, savedSongIds } : prev);

    if (isSupabaseConfigured && currentUser.id) {
      upsertProfile({
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.full_name || currentUser.name,
        role: currentUser.role || "listener",
        bio: currentUser.bio || "",
        country: currentUser.country || "",
        languages: currentUser.languages || [],
        genres: currentUser.genres || [],
        stage_name: currentUser.stage_name || "",
        website: currentUser.website || "",
        wiki_url: currentUser.wiki_url || "",
        saved_song_ids: savedSongIds,
      }).catch(() => {});
      return;
    }

    try {
      const nextUser = { ...currentUser, savedSongIds };
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(nextUser));

      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
      const nextUsers = users.map((user) => user.email === nextUser.email ? nextUser : user);
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(nextUsers));
    } catch {}
  }, [liked]);

  useEffect(() => {
    if (!currentUser) return;
    setProfileForm({
      role: currentUser.role || "listener",
      stageName: currentUser.stage_name || "",
      bio: currentUser.bio || "",
      country: currentUser.country || "",
      languages: (currentUser.languages || []).join(", "),
      genres: (currentUser.genres || []).join(", "),
      website: currentUser.website || "",
    });
  }, [currentUser]);

  const loadArtistUploads = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setArtistUploads([]);
      return;
    }

    try {
      const songs = await listPublishedSongs();
      setArtistUploads(songs.map(formatArtistSong));
    } catch {}
  }, []);

  const hydrateArtistInfo = useCallback(async (name) => {
    const cacheKey = normalizeArtistName(name).toLowerCase();
    if (artistInfoCacheRef.current.has(cacheKey)) {
      const cached = artistInfoCacheRef.current.get(cacheKey);
      setArtistInfo(cached);
      return cached;
    }

    try {
      const info = await fetchArtistInfo(name);
      const nextInfo = info || {
        name: normalizeArtistName(name),
        description: "",
        extract: "",
        image: "",
        pageUrl: "",
      };
      artistInfoCacheRef.current.set(cacheKey, nextInfo);
      setArtistInfoTick((value) => value + 1);
      setArtistInfo(nextInfo);
      return nextInfo;
    } catch {
      const fallbackInfo = {
        name: normalizeArtistName(name),
        description: "",
        extract: "",
        image: "",
        pageUrl: "",
      };
      artistInfoCacheRef.current.set(cacheKey, fallbackInfo);
      setArtistInfoTick((value) => value + 1);
      setArtistInfo(fallbackInfo);
      return fallbackInfo;
    }
  }, []);

  useEffect(() => {
    loadArtistUploads();
  }, [loadArtistUploads]);

  /* ── Mobile ── */
  useEffect(() => {
    const chk = () => { const m = window.innerWidth < 768; setMobile(m); if (m) setSideOpen(false); };
    chk(); window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : vol;
  }, [vol, muted]);

  /* ── Toast ── */
  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:"", type:"info" }), 2600);
  };

  /* ── Queue navigation ── */
  const advanceQueue = (dir = 1) => {
    const q = queueRef.current; if (!q.length) return;
    const ni = shuffleRef.current
      ? Math.floor(Math.random() * q.length)
      : ((idxRef.current + dir + q.length) % q.length);
    loadAndPlay(q[ni], ni);
  };

  useEffect(() => {
    advanceQueueRef.current = advanceQueue;
  });

  const loadAndPlay = (song, qi) => {
    const a = audioRef.current; if (!a || !song?.audio) return;
    retryRef.current.delete(song.id);
    pausedByUserRef.current = false;
    a.src = song.audio; a.load();
    a.play()
      .then(() => {
        setCurrent(song);
        idxRef.current = qi;
        setRecentlyPlayed((prev) => {
          const next = [song, ...prev.filter((entry) => entry.id !== song.id)];
          return next.slice(0, 30);
        });
      })
      .catch(() => { setCurrent(song); idxRef.current = qi; showToast("Tap ▶ to resume", "info"); });
  };

  const playSong = useCallback((song, list) => {
    if (!song?.audio) { showToast("No audio for this track", "warn"); return; }
    const q = list && list.length ? list : queueRef.current;
    const qi = q.findIndex(s => s.id === song.id);
    queueRef.current = q;
    if (current?.id === song.id) {
      const a = audioRef.current;
      if (a.paused) {
        pausedByUserRef.current = false;
        a.play().catch(() => {});
      } else {
        pausedByUserRef.current = true;
        a.pause();
      }
    } else {
      loadAndPlay(song, qi >= 0 ? qi : 0);
    }
  }, [current]); // eslint-disable-line

  const togglePlayback = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      pausedByUserRef.current = false;
      a.play().catch(() => {});
    } else {
      pausedByUserRef.current = true;
      a.pause();
    }
  };

  const seek = e => {
    const a = audioRef.current; if (!a) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (a.duration || 30);
  };

  const openAuth = (mode = "login") => {
    setAuthMode(mode);
    setAuthError("");
    setAuthForm({ name:"", email:"", password:"", role:"listener" });
    setAuthOpen(true);
  };

  const handleAuthSubmit = async () => {
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();
    const name = authForm.name.trim();
    const role = authForm.role || "listener";

    if (!email || !password || (authMode === "signup" && !name)) {
      setAuthError("Fill in all required fields.");
      return;
    }

    if (isSupabaseConfigured) {
      setAuthLoading(true);
      try {
        if (authMode === "signup") {
          const { data, error } = await signUpWithEmail({ email, password, name, role });
          if (error) {
            setAuthError("Unable to create your account right now.");
            return;
          }

          setAuthOpen(false);
          setAuthForm({ name:"", email:"", password:"", role:"listener" });

          if (!data.session) {
            showToast("Check your email to verify your account.", "info");
            return;
          }

          showToast(`Welcome, ${name}!`, "info");
          return;
        }

        const { error } = await signInWithEmail({ email, password });
        if (error) {
          setAuthError("Invalid email or password.");
          return;
        }

        setAuthOpen(false);
        setAuthForm({ name:"", email:"", password:"", role:"listener" });
        showToast("Welcome back!", "info");
        return;
      } catch {
        setAuthError("Unable to complete authentication right now.");
        return;
      } finally {
        setAuthLoading(false);
      }
    }

    try {
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
      if (authMode === "signup") {
        if (users.some((user) => user.email === email)) {
          setAuthError("An account with this email already exists.");
          return;
        }
        const newUser = {
          name,
          email,
          password,
          role,
          savedSongIds: [],
        };
        localStorage.setItem(STORAGE_KEYS.users, JSON.stringify([...users, newUser]));
        localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(newUser));
        setCurrentUser(newUser);
        setLiked(new Set());
        setAuthOpen(false);
        setAuthForm({ name:"", email:"", password:"", role:"listener" });
        showToast(`Welcome, ${name}!`, "info");
        return;
      }

      const matchedUser = users.find((user) => user.email === email && user.password === password);
      if (!matchedUser) {
        setAuthError("Invalid email or password.");
        return;
      }
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(matchedUser));
      setCurrentUser(matchedUser);
      setLiked(new Set(matchedUser.savedSongIds || []));
      setAuthOpen(false);
      setAuthForm({ name:"", email:"", password:"", role:"listener" });
      showToast(`Welcome back, ${matchedUser.name}!`, "info");
    } catch {
      setAuthError("Unable to access local account storage.");
    }
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      try {
        await signOutUser();
      } catch {}
    }
    setCurrentUser(null);
    setLiked(new Set());
    setAuthOpen(false);
    setAuthError("");
    setAuthForm({ name:"", email:"", password:"", role:"listener" });
    try { localStorage.removeItem(STORAGE_KEYS.session); } catch {}
    showToast("Signed out.", "info");
  };

  const handleSaveProfile = async () => {
    if (!currentUser || !isSupabaseConfigured) {
      setProfileOpen(false);
      return;
    }

    setProfileSaving(true);
    try {
      const languages = profileForm.languages.split(",").map((entry) => entry.trim()).filter(Boolean);
      const genres = profileForm.genres.split(",").map((entry) => entry.trim()).filter(Boolean);
      const updatedProfile = await upsertProfile({
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.full_name || currentUser.name,
        role: profileForm.role,
        bio: profileForm.bio.trim(),
        country: profileForm.country.trim(),
        languages,
        genres,
        stage_name: profileForm.role === "artist" ? profileForm.stageName.trim() : "",
        website: profileForm.website.trim(),
        saved_song_ids: currentUser.savedSongIds || [],
      });
      setCurrentUser((prev) => prev ? {
        ...prev,
        role: updatedProfile.role,
        bio: updatedProfile.bio || "",
        country: updatedProfile.country || "",
        languages: updatedProfile.languages || [],
        genres: updatedProfile.genres || [],
        stage_name: updatedProfile.stage_name || "",
        website: updatedProfile.website || "",
      } : prev);
      setProfileOpen(false);
      showToast("Profile updated.", "info");
    } catch {
      showToast("Unable to save your profile right now.", "warn");
    } finally {
      setProfileSaving(false);
    }
  };

  const openUploadFlow = () => {
    if (!currentUser) {
      openAuth("signup");
      showToast("Create an account to upload songs.", "info");
      return;
    }
    if (!currentUser.emailVerified) {
      showToast("Verify your email before uploading songs.", "warn");
      return;
    }
    if (currentUser.role !== "artist" || !artistProfileComplete) {
      setProfileOpen(true);
      return;
    }
    setUploadOpen(true);
  };

  const handleUploadSong = async () => {
    if (!canUploadSongs || !currentUser) {
      openUploadFlow();
      return;
    }

    if (!uploadForm.title.trim() || !uploadForm.audioFile) {
      showToast("Add a song title and audio file.", "warn");
      return;
    }

    setUploadSaving(true);
    try {
      const coverUpload = uploadForm.coverFile
        ? await uploadArtistAsset({
            userId: currentUser.id,
            file: uploadForm.coverFile,
            bucket: "artist-covers",
            pathPrefix: "covers",
          })
        : null;
      const audioUpload = await uploadArtistAsset({
        userId: currentUser.id,
        file: uploadForm.audioFile,
        bucket: "artist-audio",
        pathPrefix: "audio",
      });

      const publishedSong = await publishArtistSong({
        title: uploadForm.title.trim(),
        artistName: currentUser.stage_name || currentUser.name,
        album: uploadForm.album.trim(),
        genre: uploadForm.genre.trim(),
        language: uploadForm.language.trim(),
        releaseYear: uploadForm.releaseYear ? Number(uploadForm.releaseYear) : null,
        creditName: uploadForm.creditName.trim() || currentUser.name,
        coverUrl: coverUpload?.publicUrl || "",
        coverPath: coverUpload?.path || "",
        audioPath: audioUpload.path,
        profileId: currentUser.id,
      });

      const nextSong = formatArtistSong(publishedSong.song || publishedSong);
      setArtistUploads((prev) => dedupe([nextSong, ...prev]));
      setUploadOpen(false);
      setUploadForm({
        title: "",
        album: "",
        genre: "",
        language: "",
        releaseYear: "",
        creditName: "",
        coverFile: null,
        audioFile: null,
      });
      showToast("Song uploaded.", "info");
    } catch {
      showToast("Unable to upload your song right now.", "warn");
    } finally {
      setUploadSaving(false);
    }
  };

  const loadRazorpayScript = () => new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector('script[data-groovify-razorpay="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.groovifyRazorpay = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const handleRazorpaySupport = async () => {
    const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
    if (!razorpayKey) {
      showToast("Payments are unavailable right now.", "warn");
      return;
    }
    if (!supportAmountValid) {
      showToast(`Enter at least ${supportAmountLabel}.`, "warn");
      return;
    }

    setSupportLoading(true);
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setSupportLoading(false);
      showToast("Razorpay checkout failed to load.", "warn");
      return;
    }

    try {
      const response = await fetch("/api/razorpay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(supportAmount * 100),
          currency: supportCurrency,
          note: "Support Groovify",
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to create Razorpay order.");

      const razorpay = new window.Razorpay({
        key: razorpayKey,
        amount: payload.amount,
        currency: payload.currency,
        name: "Groovify",
        description: "Keep Groovify open and free",
        order_id: payload.id,
        image: "/groovify-icon.svg",
        theme: { color: "#6366F1" },
        notes: {
          product: "Groovify Support",
          selected_amount: `${supportCurrency} ${supportAmount}`,
        },
        prefill: currentUser ? {
          name: currentUser.name,
          email: currentUser.email,
        } : {},
        handler: () => {
          setSupportOpen(false);
          showToast("Thank you for supporting Groovify.", "info");
        },
      });
      razorpay.open();
    } catch {
      showToast("Unable to start payment right now.", "warn");
    } finally {
      setSupportLoading(false);
    }
  };

  const handlePatreonSupport = () => {
    if (!supportAmountValid) {
      showToast(`Enter at least ${supportAmountLabel}.`, "warn");
      return;
    }
    const patreonUrl = import.meta.env.VITE_PATREON_URL;
    if (!patreonUrl) {
      showToast("Support link is unavailable right now.", "warn");
      return;
    }
    window.open(patreonUrl, "_blank", "noopener,noreferrer");
  };

  const toggleLike = (id) => {
    if (!currentUser) {
      openAuth("signup");
      showToast("Create an account to save songs.", "info");
      return;
    }
    setLiked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const runQuery = useCallback(async (term, {
    fallbackToMixed = false,
    fullOnly = false,
    iTunesLimit = 6,
    audiusLimit = 12,
  } = {}) => {
    const results = await fetchBoth(term, iTunesLimit, audiusLimit, { fullOnly });
    if (results.length || !fullOnly || !fallbackToMixed) return results;
    return fetchBoth(term, iTunesLimit, audiusLimit, { fullOnly: false });
  }, []);

  const replaceSongEverywhere = useCallback((nextSong) => {
    setCatalog((prev) => {
      const next = {};
      for (const [key, songs] of Object.entries(prev)) {
        next[key] = songs.map((song) => song.id === nextSong.id ? nextSong : song);
      }
      return next;
    });
    setSearchRes((prev) => prev.map((song) => song.id === nextSong.id ? nextSong : song));
    setBrowseList((prev) => prev.map((song) => song.id === nextSong.id ? nextSong : song));
    setArtistSongs((prev) => prev.map((song) => song.id === nextSong.id ? nextSong : song));
    queueRef.current = queueRef.current.map((song) => song.id === nextSong.id ? nextSong : song);
    setCurrent((prev) => prev?.id === nextSong.id ? nextSong : prev);
  }, []);

  /* ── Audio engine ── */
  useEffect(() => {
    const a = new Audio();
    a.volume = 0.85;
    a.addEventListener("timeupdate", () => {
      setCurTime(a.currentTime);
      if (a.duration) setProgress(a.currentTime / a.duration);
    });
    a.addEventListener("loadedmetadata", () => setTotalDur(a.duration || 30));
    a.addEventListener("play",  () => setPlaying(true));
    a.addEventListener("pause", () => setPlaying(false));
    a.addEventListener("ended", () => {
      if (repeatRef.current) { a.currentTime = 0; a.play().catch(() => {}); return; }
      advanceQueueRef.current?.(1);
    });
    a.addEventListener("error", async () => {
      const song = currentRef.current || queueRef.current[idxRef.current];
      if (song?.audiusTrackId && !retryRef.current.has(song.id)) {
        retryRef.current.add(song.id);
        try {
          if (pausedByUserRef.current) return;
          const refreshedSong = await refreshSongStream(song);
          replaceSongEverywhere(refreshedSong);
          a.src = refreshedSong.audio;
          a.load();
          if (pausedByUserRef.current) return;
          await a.play();
          setCurrent(refreshedSong);
          retryRef.current.delete(refreshedSong.id);
          return;
        } catch {}
      }
      if (song && !song.isPreview) {
        try {
          if (pausedByUserRef.current) return;
          const fallbackSong = await findPreviewFallback(song);
          if (fallbackSong?.audio) {
            replaceSongEverywhere(fallbackSong);
            a.src = fallbackSong.audio;
            a.load();
            if (pausedByUserRef.current) return;
            await a.play();
            setCurrent(fallbackSong);
            return;
          }
        } catch {}
      }
      showToast("Audio unavailable — skipping…", "warn");
      setTimeout(() => advanceQueueRef.current?.(1), 800);
    });
    audioRef.current = a;
    return () => { a.pause(); a.src = ""; };
  }, [replaceSongEverywhere]); // eslint-disable-line

  /* ── Core catalog loader ── */
  const loadSection = useCallback(async (sec, force = false) => {
    if (!force && sectionCacheRef.current.has(sec.key)) {
      return { key: sec.key, songs: sectionCacheRef.current.get(sec.key) };
    }
    const songs = [];
    for (const q of sec.queries) {
      const r = await runQuery(q, {
        fallbackToMixed: true,
        fullOnly: true,
        iTunesLimit: 2,
        audiusLimit: 10,
      });
      songs.push(...r);
    }
    const out = dedupe(songs);
    sectionCacheRef.current.set(sec.key, out);
    return { key: sec.key, songs: out };
  }, [runQuery]);

  const loadCatalog = useCallback(async (force = false) => {
    const now = todayStr();
    if (!force && lastFetch === now && Object.keys(catalog).length === CATALOG.length) return;

    setLoadingHome(true);
    setRefreshing(force);
    if (force) {
      sectionCacheRef.current.clear();
      browseCacheRef.current.clear();
      searchCacheRef.current.clear();
      artistCacheRef.current.clear();
    }
    setCatalog({});
    setLastFetch(now);

    const results = [];
    for (const sec of CATALOG) {
      results.push(await loadSection(sec, force));
    }
    const newCat = {};
    results.forEach((result) => { newCat[result.key] = result.songs; });
    setCatalog(newCat);
    const loadedSongs = results.flatMap((result) => result.songs);
    if (loadedSongs.length) queueRef.current = loadedSongs;
    setLoadingHome(false);
    setRefreshing(false);

    if (force) showToast("✅ Catalog refreshed!", "info");
  }, [lastFetch, loadSection]);

  useEffect(() => { loadCatalog(false); }, []); // eslint-disable-line

  /* ── Search ── */
  useEffect(() => {
    const trimmed = searchQ.trim();
    if (!trimmed) { if (view === "search") setView("home"); return; }
    clearTimeout(searchTmr.current);
    setView("search");
    searchTmr.current = setTimeout(async () => {
      const requestId = ++searchReqRef.current;
      const industryLabel = industry !== "all"
        ? INDUSTRIES.find((entry) => entry.id === industry)?.label || ""
        : "";
      const baseSearch = [trimmed, industryLabel, "songs"].filter(Boolean).join(" ");
      const query = buildDiscoveryTerm(baseSearch, contentFilter);
      const cacheKey = `${industry}::${contentFilter}::${trimmed.toLowerCase()}`;
      if (searchCacheRef.current.has(cacheKey)) {
        const cached = searchCacheRef.current.get(cacheKey);
        setSearchRes(cached);
        queueRef.current = cached;
        setLoadingKey(null);
        return;
      }
      setLoadingKey("search");
      const r = applyContentFilter(
        await runQuery(query, {
          fullOnly: contentFilter === "full",
          iTunesLimit: contentFilter === "full" ? 2 : 8,
          audiusLimit: contentFilter === "full" ? 12 : 14,
        }),
        contentFilter
      );
      if (requestId !== searchReqRef.current) return;
      searchCacheRef.current.set(cacheKey, r);
      setSearchRes(r);
      queueRef.current = r;
      setLoadingKey(null);
    }, 150);
    return () => clearTimeout(searchTmr.current);
  }, [searchQ, contentFilter, industry, runQuery, view]);

  /* ── Browse ── */
  const loadBrowse = useCallback(async (ind, yr, kind) => {
    const cacheKey = `${ind}::${yr || "all"}::${kind}`;
    if (browseCacheRef.current.has(cacheKey)) {
      const cached = browseCacheRef.current.get(cacheKey);
      setBrowseList(cached);
      queueRef.current = cached;
      setLoadingKey(null);
      return;
    }

    setLoadingKey("browse");
    const relevantSections = ind === "all" ? CATALOG : CATALOG.filter((sec) => sec.cat === ind);
    let baseSongs = dedupe(relevantSections.flatMap((sec) => catalog[sec.key] || []));

    if (!baseSongs.length) {
      const loaded = [];
      for (const sec of relevantSections) {
        loaded.push(await loadSection(sec));
      }
      baseSongs = dedupe(loaded.flatMap((result) => result.songs));
      if (loaded.length) {
        setCatalog((prev) => {
          const next = { ...prev };
          loaded.forEach((result) => { next[result.key] = result.songs; });
          return next;
        });
      }
    }

    let out = applyContentFilter(applyYearFilter(baseSongs, yr), kind);

    if (!out.length && (kind === "remix" || kind === "mashup" || kind === "producer")) {
      const songs = [];
      for (const sec of relevantSections.slice(0, 4)) {
        for (const q of sec.queries.slice(0, 2)) {
          const r = await runQuery(buildDiscoveryTerm(q, kind), {
            iTunesLimit: 6,
            audiusLimit: 12,
          });
          songs.push(...r);
        }
      }
      out = applyContentFilter(applyYearFilter(dedupe(songs), yr), kind);
    }

    browseCacheRef.current.set(cacheKey, out);
    setBrowseList(out);
    queueRef.current = out;
    setLoadingKey(null);
  }, [catalog, loadSection, runQuery]);

  useEffect(() => {
    if (view === "browse") loadBrowse(industry, yearId, contentFilter);
  }, [view, industry, yearId, contentFilter, loadBrowse]);

  const baseSongs = dedupe([
    ...Object.values(catalog).flat(),
    ...searchRes,
    ...browseList,
    ...artistUploads,
  ]);

  /* ── Artist ── */
  const loadArtist = useCallback(async (name) => {
    setArtistView(name);
    setView("artist");
    hydrateArtistInfo(name);
    const cacheKey = `${name.toLowerCase()}::${contentFilter}`;
    if (artistCacheRef.current.has(cacheKey)) {
      const cached = artistCacheRef.current.get(cacheKey);
      setArtistSongs(cached);
      queueRef.current = cached;
      setLoadingKey(null);
      return;
    }

    setLoadingKey("artist");
    const requestId = ++artistReqRef.current;
    const query = buildDiscoveryTerm(`${name} songs`, contentFilter);
    const cachedMatches = baseSongs.filter((song) => {
      const selectedArtist = normalizeArtistName(name).toLowerCase();
      const songArtist = normalizeArtistName(song.artist).toLowerCase();
      return songArtist === selectedArtist;
    });
    const uploadedMatches = artistUploads.filter((song) => {
      const selectedArtist = normalizeArtistName(name).toLowerCase();
      const songArtist = normalizeArtistName(song.artist).toLowerCase();
      return songArtist === selectedArtist;
    });
    const r = applyContentFilter(
      await runQuery(query, {
        fullOnly: contentFilter === "full",
        iTunesLimit: contentFilter === "full" ? 1 : 6,
        audiusLimit: 12,
      }),
      contentFilter
    );
    if (requestId !== artistReqRef.current) return;
    const merged = dedupe([...cachedMatches, ...uploadedMatches, ...r]);
    artistCacheRef.current.set(cacheKey, merged);
    setArtistSongs(merged);
    queueRef.current = merged;
    setLoadingKey(null);
  }, [artistUploads, baseSongs, contentFilter, hydrateArtistInfo, runQuery]);

  const withYear = (list) => applyYearFilter(applyContentFilter(list, contentFilter), yearId);

  const allSongs = dedupe([
    ...baseSongs,
    ...artistSongs,
  ]);
  const activeQueue = queueRef.current;
  const searchSongs = withYear(searchRes);
  const artistList = withYear(artistSongs);
  const librarySongs = withYear(allSongs);
  const savedSongs = librarySongs.filter((song) => liked.has(song.id));
  const queueSongs = withYear(activeQueue);
  const recentSongs = withYear(recentlyPlayed);
  const activeQueueIndex = idxRef.current;
  const upcomingQueue = activeQueue.length > 1
    ? Array.from({ length: Math.min(activeQueue.length - 1, 8) }, (_, offset) =>
        activeQueue[(activeQueueIndex + offset + 1 + activeQueue.length) % activeQueue.length]
      ).filter(Boolean)
    : [];
  const artistsIndex = Array.from(new Map(
    dedupe([
      ...allSongs,
      ...recentlyPlayed,
    ])
      .filter((song) => song.artist)
      .map((song) => {
        const normalizedName = normalizeArtistName(song.artist);
        return [normalizedName.toLowerCase(), {
          name: normalizedName,
          art: song.artBig || song.art || song.artSm || "",
          songs: dedupe(allSongs.filter((entry) =>
            normalizeArtistName(entry.artist).toLowerCase() === normalizedName.toLowerCase()
          )),
        }];
      })
  ).values()).sort((a, b) => a.name.localeCompare(b.name));
  void artistInfoTick;
  const allArtists = Array.from(new Map([
    ...FEATURED_ARTISTS.map((name) => {
      const normalizedName = normalizeArtistName(name);
      const existing = artistsIndex.find((artist) => artist.name.toLowerCase() === normalizedName.toLowerCase());
      const wikiInfo = artistInfoCacheRef.current.get(normalizedName.toLowerCase());
      return [normalizedName.toLowerCase(), existing || {
        name: normalizedName,
        art: wikiInfo?.image || "",
        songs: [],
      }];
    }),
    ...artistsIndex.map((artist) => {
      const wikiInfo = artistInfoCacheRef.current.get(artist.name.toLowerCase());
      return [artist.name.toLowerCase(), {
        ...artist,
        art: wikiInfo?.image || artist.art,
        description: wikiInfo?.description || "",
      }];
    }),
  ]).values());
  const currentArtistMeta = allArtists.find((artist) =>
    artistView && artist.name.toLowerCase() === normalizeArtistName(artistView).toLowerCase()
  );

  const ac = INDUSTRIES.find(i => i.id === industry)?.color || "#6366F1";

  useEffect(() => {
    if (view === "artist" && artistView) loadArtist(artistView);
  }, [contentFilter]); // eslint-disable-line

  useEffect(() => {
    if (view !== "artists") return;
    allArtists.slice(0, 24).forEach((artist) => {
      const cacheKey = artist.name.toLowerCase();
      if (!artistInfoCacheRef.current.has(cacheKey)) {
        fetchArtistInfo(artist.name)
          .then((info) => {
            if (info) {
              artistInfoCacheRef.current.set(cacheKey, info);
              setArtistInfoTick((value) => value + 1);
            }
          })
          .catch(() => {});
      }
    });
  }, [allArtists, view]);

  /* ─────────────────────── RENDER ─────────────────────────── */
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh",
      background:t.bg, color:t.text,
      fontFamily:"'Inter', sans-serif", overflow:"hidden", userSelect:"none" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; margin:0; padding:0 }
        ::-webkit-scrollbar { width:4px; height:4px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:${dark?"#1e1e38":"#D1D5DB"}; border-radius:4px }
        @keyframes wv  { 0%,100%{height:3px} 50%{height:100%} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,.45)} 60%{box-shadow:0 0 0 10px rgba(99,102,241,0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
        @keyframes toast { 0%{opacity:0;transform:translateX(-50%) translateY(8px)} 12%,85%{opacity:1;transform:translateX(-50%) translateY(0)} 100%{opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .slide { animation:slideUp .3s ease both }
        button { font-family:'Inter',sans-serif; cursor:pointer }
        input  { font-family:'Inter',sans-serif }
        input::placeholder { color:${t.textMuted} }
      `}</style>

      {/* Toast */}
      {toast.msg && (
        <div style={{ position:"fixed", bottom:100, left:"50%", zIndex:9999,
          transform:"translateX(-50%)", animation:"toast 2.6s ease forwards",
          background:toast.type === "warn"
            ? "rgba(239,68,68,0.96)"
            : dark ? "rgba(20,20,38,0.97)" : "rgba(255,255,255,0.97)",
          border:`1px solid ${dark?"rgba(255,255,255,.09)":"rgba(0,0,0,.08)"}`,
          backdropFilter:"blur(20px)", borderRadius:28, padding:"9px 20px",
          fontSize:13, fontWeight:600, color:t.text, boxShadow:"0 8px 32px rgba(0,0,0,.2)",
          whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}

      {authOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:9998, background:"rgba(0,0,0,.55)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ width:"100%", maxWidth:420, borderRadius:22, padding:24,
            background:dark ? "rgba(13,13,24,.98)" : "rgba(255,255,255,.98)",
            border:`1px solid ${t.sideB}`, boxShadow:"0 24px 80px rgba(0,0,0,.35)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
              <Brand t={t} size={30} compact />
              <button onClick={() => setAuthOpen(false)}
                style={{ background:"none", border:"none", color:t.textMuted, fontSize:18 }}>✕</button>
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:t.text, marginBottom:6 }}>
              {authMode === "signup" ? "Create your account" : "Welcome back"}
            </div>
            <div style={{ fontSize:13, color:t.textSub, lineHeight:1.6, marginBottom:16 }}>
              Save songs, keep your likes on this device, and build your own Groovify library.
            </div>
            {authMode === "signup" && (
              <>
                <input value={authForm.name} onChange={(e) => setAuthForm((prev) => ({ ...prev, name:e.target.value }))}
                  placeholder="Your name"
                  style={{ width:"100%", marginBottom:10, background:t.input, border:`1px solid ${t.inputB}`,
                    borderRadius:14, padding:"12px 14px", color:t.text, fontSize:13.5, outline:"none" }} />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                  {["listener", "artist"].map((role) => (
                    <button key={role} onClick={() => setAuthForm((prev) => ({ ...prev, role }))}
                      style={{ padding:"10px 12px", borderRadius:14,
                        border:`1px solid ${authForm.role === role ? "#6366F1" : t.inputB}`,
                        background:authForm.role === role ? "rgba(99,102,241,.12)" : t.input,
                        color:authForm.role === role ? "#6366F1" : t.textSub,
                        fontSize:12.5, fontWeight:700 }}>
                      {role === "artist" ? "Artist" : "Listener"}
                    </button>
                  ))}
                </div>
              </>
            )}
            <input value={authForm.email} onChange={(e) => setAuthForm((prev) => ({ ...prev, email:e.target.value }))}
              placeholder="Email"
              style={{ width:"100%", marginBottom:10, background:t.input, border:`1px solid ${t.inputB}`,
                borderRadius:14, padding:"12px 14px", color:t.text, fontSize:13.5, outline:"none" }} />
            <input type="password" value={authForm.password} onChange={(e) => setAuthForm((prev) => ({ ...prev, password:e.target.value }))}
              placeholder="Password"
              style={{ width:"100%", marginBottom:10, background:t.input, border:`1px solid ${t.inputB}`,
                borderRadius:14, padding:"12px 14px", color:t.text, fontSize:13.5, outline:"none" }} />
            {authError && (
              <div style={{ fontSize:12, color:"#F87171", marginBottom:12 }}>{authError}</div>
            )}
            <button onClick={handleAuthSubmit}
              disabled={authLoading}
              style={{ width:"100%", padding:"12px 16px", borderRadius:14, border:"none",
                background:"linear-gradient(135deg,#6366F1,#4F46E5)", color:"#fff",
                fontSize:13.5, fontWeight:800, marginBottom:12, opacity:authLoading ? 0.65 : 1,
                cursor:authLoading ? "not-allowed" : "pointer" }}>
              {authLoading ? "Please wait..." : authMode === "signup" ? "Sign Up" : "Login"}
            </button>
            {authMode === "signup" && isSupabaseConfigured && (
              <div style={{ fontSize:11.5, color:t.textMuted, lineHeight:1.6, marginBottom:12 }}>
                New accounts must verify their email before artist uploads are enabled.
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
              <button onClick={() => { setAuthMode(authMode === "signup" ? "login" : "signup"); setAuthError(""); }}
                style={{ background:"none", border:"none", color:"#6366F1", fontSize:12.5, fontWeight:700 }}>
                {authMode === "signup" ? "Already have an account?" : "Create a new account"}
              </button>
              {currentUser && (
                <button onClick={signOut}
                  style={{ background:"none", border:"none", color:t.textMuted, fontSize:12.5, fontWeight:700 }}>
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {profileOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:9997, background:"rgba(0,0,0,.6)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ width:"100%", maxWidth:520, borderRadius:24, padding:24,
            background:dark ? "rgba(10,10,20,.98)" : "rgba(255,255,255,.98)",
            border:`1px solid ${t.sideB}`, boxShadow:"0 28px 90px rgba(0,0,0,.35)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:t.text }}>Complete your creator profile</div>
                <div style={{ fontSize:12.5, color:t.textMuted, marginTop:4 }}>
                  Choose your account type and complete the required artist details before uploading.
                </div>
              </div>
              <button onClick={() => setProfileOpen(false)}
                style={{ background:"none", border:"none", color:t.textMuted, fontSize:18 }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              {["listener", "artist"].map((role) => (
                <button key={role} onClick={() => setProfileForm((prev) => ({ ...prev, role }))}
                  style={{ padding:"11px 14px", borderRadius:14,
                    border:`1px solid ${profileForm.role === role ? "#6366F1" : t.inputB}`,
                    background:profileForm.role === role ? "rgba(99,102,241,.12)" : t.input,
                    color:profileForm.role === role ? "#6366F1" : t.textSub, fontSize:12.5, fontWeight:800 }}>
                  {role === "artist" ? "Artist" : "Listener"}
                </button>
              ))}
            </div>
            {[
              { key:"bio", placeholder:"Short bio" },
              { key:"country", placeholder:"Country" },
              { key:"languages", placeholder:"Languages (comma separated)" },
              { key:"genres", placeholder:"Genres (comma separated)" },
              { key:"website", placeholder:"Website or social link" },
            ].map((field) => (
              <input key={field.key} value={profileForm[field.key]} onChange={(e) => setProfileForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                style={{ width:"100%", marginBottom:10, background:t.input, border:`1px solid ${t.inputB}`,
                  borderRadius:14, padding:"12px 14px", color:t.text, fontSize:13.5, outline:"none" }} />
            ))}
            {profileForm.role === "artist" && (
              <input value={profileForm.stageName} onChange={(e) => setProfileForm((prev) => ({ ...prev, stageName:e.target.value }))}
                placeholder="Stage name"
                style={{ width:"100%", marginBottom:10, background:t.input, border:`1px solid ${t.inputB}`,
                  borderRadius:14, padding:"12px 14px", color:t.text, fontSize:13.5, outline:"none" }} />
            )}
            {!currentUser?.emailVerified && (
              <div style={{ fontSize:11.5, color:"#F59E0B", marginBottom:12 }}>
                Verify your email before artist uploads are enabled.
              </div>
            )}
            <button onClick={handleSaveProfile} disabled={profileSaving}
              style={{ width:"100%", padding:"12px 16px", borderRadius:14, border:"none",
                background:"linear-gradient(135deg,#6366F1,#4F46E5)", color:"#fff",
                fontSize:13.5, fontWeight:800, opacity:profileSaving ? 0.65 : 1,
                cursor:profileSaving ? "not-allowed" : "pointer" }}>
              {profileSaving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:9996, background:"rgba(0,0,0,.6)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ width:"100%", maxWidth:560, borderRadius:24, padding:24,
            background:dark ? "rgba(10,10,20,.98)" : "rgba(255,255,255,.98)",
            border:`1px solid ${t.sideB}`, boxShadow:"0 28px 90px rgba(0,0,0,.35)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:t.text }}>Upload a song</div>
                <div style={{ fontSize:12.5, color:t.textMuted, marginTop:4 }}>
                  Published tracks appear in Groovify with your artist profile.
                </div>
              </div>
              <button onClick={() => setUploadOpen(false)}
                style={{ background:"none", border:"none", color:t.textMuted, fontSize:18 }}>✕</button>
            </div>
            {[
              ["title", "Song title"],
              ["album", "Album or release name"],
              ["genre", "Genre"],
              ["language", "Language"],
              ["releaseYear", "Release year"],
              ["creditName", "Credit name"],
            ].map(([key, placeholder]) => (
              <input key={key} value={uploadForm[key]} onChange={(e) => setUploadForm((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{ width:"100%", marginBottom:10, background:t.input, border:`1px solid ${t.inputB}`,
                  borderRadius:14, padding:"12px 14px", color:t.text, fontSize:13.5, outline:"none" }} />
            ))}
            <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap:10, marginBottom:14 }}>
              <label style={{ padding:"12px 14px", borderRadius:14, border:`1px solid ${t.inputB}`, background:t.input, color:t.textSub, fontSize:12.5 }}>
                Cover image
                <input type="file" accept="image/*" onChange={(e) => setUploadForm((prev) => ({ ...prev, coverFile: e.target.files?.[0] || null }))} style={{ display:"block", marginTop:8 }} />
              </label>
              <label style={{ padding:"12px 14px", borderRadius:14, border:`1px solid ${t.inputB}`, background:t.input, color:t.textSub, fontSize:12.5 }}>
                Audio file
                <input type="file" accept="audio/*" onChange={(e) => setUploadForm((prev) => ({ ...prev, audioFile: e.target.files?.[0] || null }))} style={{ display:"block", marginTop:8 }} />
              </label>
            </div>
            <button onClick={handleUploadSong} disabled={uploadSaving}
              style={{ width:"100%", padding:"12px 16px", borderRadius:14, border:"none",
                background:"linear-gradient(135deg,#10B981,#059669)", color:"#fff",
                fontSize:13.5, fontWeight:800, opacity:uploadSaving ? 0.65 : 1,
                cursor:uploadSaving ? "not-allowed" : "pointer" }}>
              {uploadSaving ? "Uploading..." : "Upload Song"}
            </button>
          </div>
        </div>
      )}

      {supportOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:9997, background:"rgba(0,0,0,.6)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ width:"100%", maxWidth:460, borderRadius:24, padding:24,
            background:dark ? "rgba(10,10,20,.98)" : "rgba(255,255,255,.98)",
            border:`1px solid ${t.sideB}`, boxShadow:"0 28px 90px rgba(0,0,0,.35)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <Brand t={t} size={30} compact />
              <button onClick={() => setSupportOpen(false)}
                style={{ background:"none", border:"none", color:t.textMuted, fontSize:18 }}>✕</button>
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:t.text, marginBottom:8 }}>
              Keep Groovify open and free
            </div>
            <div style={{ display:"flex", gap:10, marginBottom:14 }}>
              {["INR", "USD"].map((currency) => (
                <button key={currency} onClick={() => setSupportCurrency(currency)}
                  style={{ flex:1, padding:"11px 14px", borderRadius:16,
                    border:`1px solid ${supportCurrency === currency ? "#6366F1" : t.sideB}`,
                    background:supportCurrency === currency ? "rgba(99,102,241,.15)" : t.hover,
                    color:supportCurrency === currency ? "#6366F1" : t.textSub,
                    fontSize:13, fontWeight:800 }}>
                  {currency}
                </button>
              ))}
            </div>
            <div style={{ marginBottom:18 }}>
              <input
                type="number"
                min={supportMinimum}
                step={supportCurrency === "INR" ? "1" : "0.1"}
                value={supportAmountInput}
                onChange={(e) => setSupportAmountInput(e.target.value)}
                placeholder={`Minimum ${supportAmountLabel}`}
                style={{ width:"100%", padding:"14px 16px", borderRadius:16, outline:"none",
                  border:`1px solid ${t.sideB}`, background:t.hover, color:t.text, fontSize:14, fontWeight:700 }}
              />
            </div>
            <div style={{ display:"grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap:10, marginBottom:14 }}>
              <button onClick={handleRazorpaySupport} disabled={supportLoading || !supportAmountValid}
                style={{ padding:"13px 16px", borderRadius:16, border:"none",
                  background:"linear-gradient(135deg,#0F172A,#1D4ED8)", color:"#fff",
                  fontSize:13.5, fontWeight:800, opacity:(supportLoading || !supportAmountValid) ? 0.55 : 1,
                  cursor:(supportLoading || !supportAmountValid) ? "not-allowed" : "pointer" }}>
                {supportLoading ? "Opening Razorpay..." : "Pay with Razorpay"}
              </button>
              <button onClick={handlePatreonSupport} disabled={!supportAmountValid}
                style={{ padding:"13px 16px", borderRadius:16, border:`1px solid ${t.sideB}`,
                  background:t.hover, color:t.text, fontSize:13.5, fontWeight:800,
                  opacity:!supportAmountValid ? 0.55 : 1, cursor:!supportAmountValid ? "not-allowed" : "pointer" }}>
                Support on Patreon
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* ══════════════ SIDEBAR ══════════════ */}
        {(sideOpen || !mobile) && (
          <div style={{ width:228, background:t.sidebar,
            borderRight:`1px solid ${t.sideB}`, display:"flex",
            flexDirection:"column", flexShrink:0, overflowY:"auto",
            position:mobile ? "fixed" : "relative", zIndex:mobile ? 200 : 1,
            height:"100%", top:0, left:0,
            backdropFilter:mobile ? "blur(20px)" : "none" }}>

            {/* Logo */}
            <div style={{ padding:"20px 18px 16px", borderBottom:`1px solid ${t.sideB}` }}>
              <Brand t={t} size={38} />
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6 }}>
                <div style={{ width:6, height:6, borderRadius:"50%",
                  background: refreshing ? "#F59E0B" : "#22C55E",
                  animation: refreshing ? "spin 1s linear infinite" : "none",
                  boxShadow: refreshing ? "none" : "0 0 6px #22C55E" }} />
                <span style={{ fontSize:9, color:t.textMuted, letterSpacing:"1.5px",
                  textTransform:"uppercase", fontWeight:600 }}>
                  {refreshing ? "Refreshing…" : `Live · ${todayStr()}`}
                </span>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ padding:"10px 8px 0" }}>
              {[
                { id:"home",    icon:"⌂",  label:"Home" },
                { id:"search",  icon:"⌕",  label:"Search" },
                { id:"browse",  icon:"◈",  label:"Browse" },
                { id:"artists", icon:"◉",  label:"Artists" },
                { id:"saved",   icon:"♥",  label:"Saved", badge: currentUser ? savedSongs.length || null : null },
                { id:"queue",   icon:"≡",  label:"Queue", badge: upcomingQueue.length || null },
                { id:"recent",  icon:"⟳",  label:"Recent", badge: recentlyPlayed.length || null },
                { id:"library", icon:"♫",  label:"Library", badge: allSongs.length || null },
              ].map(n => (
                <div key={n.id} onClick={() => { setView(n.id); if (mobile) setSideOpen(false); }}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                    borderRadius:10, marginBottom:2, cursor:"pointer",
                    background:view === n.id ? (dark?"rgba(99,102,241,.15)":"rgba(99,102,241,.1)") : "transparent",
                    color:view === n.id ? "#6366F1" : t.textSub,
                    fontWeight:view === n.id ? 700 : 500,
                    fontSize:13.5, transition:"all .15s" }}>
                  <span style={{ fontSize:15, lineHeight:1 }}>{n.icon}</span>
                  <span style={{ flex:1 }}>{n.label}</span>
                  {n.badge && <span style={{ fontSize:10, background:"#EF4444", color:"#fff",
                    borderRadius:10, padding:"1px 7px", fontWeight:800 }}>{n.badge}</span>}
                </div>
              ))}
            </nav>

            {/* Industries */}
            <div style={{ padding:"14px 8px 0" }}>
              <div style={{ fontSize:9, color:t.textMuted, letterSpacing:"2px",
                textTransform:"uppercase", padding:"0 12px 8px", fontWeight:700 }}>
                Languages
              </div>
              {INDUSTRIES.map(i => (
                <div key={i.id}
                  onClick={() => { setIndustry(i.id); setView("browse"); if (mobile) setSideOpen(false); }}
                  style={{ padding:"8px 12px", borderRadius:8, marginBottom:1, fontSize:13,
                    color: industry === i.id && view === "browse" ? i.color : t.textSub,
                    background: industry === i.id && view === "browse" ? `${i.color}18` : "transparent",
                    fontWeight: industry === i.id && view === "browse" ? 700 : 500,
                    cursor:"pointer", transition:"all .12s" }}>
                  {i.emoji} {i.label}
                </div>
              ))}
            </div>

            {/* Refresh */}
            <div style={{ padding:"14px 16px 18px", marginTop:"auto",
              borderTop:`1px solid ${t.sideB}` }}>
              <div style={{ marginBottom:12, padding:"10px 12px", borderRadius:12,
                background:t.hover, border:`1px solid ${t.sideB}` }}>
                {currentUser ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:"#6366F1",
                      color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:13, fontWeight:800, flexShrink:0 }}>
                      {currentUser.name?.[0]?.toUpperCase() || "G"}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, color:t.text, fontWeight:700,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {currentUser.name}
                      </div>
                      <div style={{ fontSize:10.5, color:t.textMuted,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {currentUser.email}
                      </div>
                    </div>
                    <button onClick={signOut}
                      style={{ background:"none", border:"none", color:t.textMuted, fontSize:12, fontWeight:700 }}>
                      Exit
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:12.5, color:t.text, fontWeight:700, marginBottom:4 }}>
                      Save songs with a Groovify account
                    </div>
                    <button onClick={() => openAuth("signup")}
                      style={{ background:"none", border:"none", color:"#6366F1", fontSize:12.5, fontWeight:700, padding:0 }}>
                      Login / Sign Up
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setSupportOpen(true)}
                style={{ width:"100%", padding:"10px", borderRadius:10, border:"none",
                  background:"linear-gradient(135deg,#F97316,#EA580C)", color:"#fff",
                  fontSize:12.5, fontWeight:800, marginBottom:10 }}>
                Support Groovify
              </button>
              <button onClick={() => loadCatalog(true)} disabled={refreshing}
                style={{ width:"100%", padding:"9px", borderRadius:10,
                  border:`1px solid ${t.sideB}`, background:t.hover,
                  color:refreshing ? t.textMuted : t.textSub,
                  fontSize:12.5, fontWeight:600, opacity:refreshing ? .6 : 1,
                  display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                <span style={{ display:"inline-block",
                  animation:refreshing?"spin 1s linear infinite":"none" }}>🔄</span>
                {refreshing ? "Refreshing…" : "Refresh Catalog"}
              </button>
              <div style={{ fontSize:10, color:t.textMuted, textAlign:"center", marginTop:6 }}>
                Last: {lastFetch || "—"}
              </div>
            </div>
          </div>
        )}

        {mobile && sideOpen && (
          <div onClick={() => setSideOpen(false)}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:199 }} />
        )}

        {/* ══════════════ MAIN CONTENT ══════════════ */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{ background:t.topbar, backdropFilter:"blur(28px)",
            borderBottom:`1px solid ${t.sideB}`, flexShrink:0, zIndex:10 }}>

            {/* Header row */}
            <div style={{ display:"flex", alignItems:"center", gap:12,
              padding:"14px 20px 0" }}>
              {mobile && (
                <button onClick={() => setSideOpen(s => !s)}
                  style={{ background:"none", border:"none", color:t.textSub,
                    fontSize:21, padding:4, lineHeight:1 }}>☰</button>
              )}

              {/* Brand on header */}
              <div style={{ flexShrink:0, display:mobile?"none":"flex", alignItems:"center" }}>
                <Brand t={t} size={30} compact />
              </div>

              {/* Search */}
              <div style={{ flex:1, position:"relative", maxWidth:500, margin:"0 auto" }}>
                <span style={{ position:"absolute", left:14, top:"50%",
                  transform:"translateY(-50%)", color:t.textMuted, fontSize:15,
                  pointerEvents:"none" }}>⌕</span>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="Search songs, artists, movies, albums…"
                  style={{ width:"100%", background:t.input, border:`1px solid ${t.inputB}`,
                    borderRadius:28, padding:"10px 40px 10px 42px", color:t.text,
                    fontSize:13.5, outline:"none", transition:"border-color .2s" }} />
                {searchQ && (
                  <button onClick={() => setSearchQ("")}
                    style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                      background:"none", border:"none", color:t.textMuted, fontSize:16 }}>✕</button>
                )}
              </div>

              {/* Theme toggle + panel */}
              <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
                {currentUser ? (
                  <button onClick={() => setView("saved")}
                    style={{ padding:"8px 12px", borderRadius:20,
                      border:`1px solid ${t.sideB}`, background:t.hover,
                      color:t.textSub, fontSize:12, fontWeight:600,
                      display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ width:24, height:24, borderRadius:"50%", background:"#6366F1",
                      color:"#fff", display:"inline-flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:800, flexShrink:0 }}>
                      {currentUser.name?.[0]?.toUpperCase() || "G"}
                    </span>
                    {!mobile && <span>{currentUser.name}</span>}
                  </button>
                ) : (
                  <button onClick={() => openAuth("signup")}
                    style={{ padding:"8px 12px", borderRadius:20,
                      border:`1px solid ${t.sideB}`, background:t.hover,
                      color:t.textSub, fontSize:12, fontWeight:600 }}>
                    Login / Sign Up
                  </button>
                )}
                {isSupabaseConfigured && (
                  <button onClick={openUploadFlow}
                    style={{ padding:"8px 12px", borderRadius:20,
                      border:`1px solid ${t.sideB}`, background:t.hover,
                      color:t.textSub, fontSize:12, fontWeight:600 }}>
                    Upload Your Music
                  </button>
                )}
                <button onClick={() => setSupportOpen(true)}
                  style={{ padding:"8px 12px", borderRadius:20,
                    border:"none", background:"linear-gradient(135deg,#F97316,#EA580C)",
                    color:"#fff", fontSize:12, fontWeight:700 }}>
                  Support
                </button>
                <button onClick={() => setDark(d => !d)}
                  style={{ width:38, height:38, borderRadius:"50%",
                    border:`1px solid ${t.sideB}`, background:t.hover,
                    color:t.textSub, fontSize:16, display:"flex",
                    alignItems:"center", justifyContent:"center" }}
                  title={dark ? "Switch to Light" : "Switch to Dark"}>
                  {dark ? "☀" : "🌙"}
                </button>
              </div>
            </div>

            {/* Filters */}
            {(view === "browse" || view === "search" || view === "library" || view === "artist" || view === "saved" || view === "queue" || view === "recent") && (
              <div style={{ display:"flex", flexDirection:"column", gap:8, padding:"12px 20px" }}>
                <div style={{ display:"flex", gap:6, overflowX:"auto", flexWrap:"nowrap" }}>
                  {CONTENT_FILTERS.map((filter) => (
                    <div key={filter.id} onClick={() => setContentFilter(filter.id)}
                      style={{ padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:700,
                        cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
                        background:contentFilter === filter.id ? "#6366F1" : t.pill,
                        color:contentFilter === filter.id ? "#fff" : t.textSub, transition:"all .15s" }}>
                      {filter.label}
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:6, overflowX:"auto", flexWrap:"nowrap" }}>
                  <div onClick={() => setYearId(null)}
                    style={{ padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:700,
                      cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
                      background:!yearId ? "#6366F1" : t.pill,
                      color:!yearId ? "#fff" : t.textSub, transition:"all .15s" }}>
                    All Years
                  </div>
                  {YEARS.map(y => (
                    <div key={y.id} onClick={() => setYearId(y.id)}
                      style={{ padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:700,
                        cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
                        background:yearId === y.id ? ac : t.pill,
                        color:yearId === y.id ? "#fff" : t.textSub, transition:"all .15s" }}>
                      {y.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── SCROLL AREA ── */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 20px" }}>

            {/* ─ HOME ─ */}
            {view === "home" && (
              <div className="slide">
                {/* Hero */}
                <div style={{ borderRadius:20, marginBottom:36, padding:"30px 28px",
                  position:"relative", overflow:"hidden",
                  border:`1px solid ${t.divider}`,
                  background: dark
                    ? "linear-gradient(120deg,#1a0526 0%,#0c1630 50%,#1a0a1a 100%)"
                    : "linear-gradient(120deg,#EEF2FF 0%,#F0F9FF 50%,#FDF4FF 100%)" }}>
                  <div style={{ position:"absolute", top:-80, right:-60, width:320, height:320,
                    borderRadius:"50%", background:"radial-gradient(circle,rgba(99,102,241,.18),transparent 65%)" }} />
                  <div style={{ position:"absolute", bottom:-60, left:-60, width:240, height:240,
                    borderRadius:"50%", background:"radial-gradient(circle,rgba(139,92,246,.13),transparent 65%)" }} />
                  <div style={{ fontFamily:"Inter", fontSize:mobile?26:36, fontWeight:900,
                    letterSpacing:"-1px", lineHeight:1.1, marginBottom:10, position:"relative" }}>
                    <span style={{ display:"inline-flex", marginBottom:8 }}>
                      <Brand t={t} size={mobile ? 42 : 50} />
                    </span>
                    <br />
                    <span style={{ fontSize:mobile?15:20, fontWeight:600,
                      color:dark?"rgba(232,232,248,.5)":"rgba(20,20,42,.45)" }}>
                      Every song. Every language. Free forever.
                    </span>
                  </div>
                  <p style={{ fontSize:13, color:dark?"rgba(232,232,248,.38)":"rgba(20,20,42,.45)",
                    lineHeight:1.75, maxWidth:520, marginBottom:22, position:"relative" }}>
                    Bollywood · Telugu · English · Spanish · Afro · World Folk · Producer Cuts
                    <br />Auto-refreshes daily · Real album art · Background playback
                  </p>
                  <div style={{ fontSize:11.5, color:t.textMuted, marginBottom:18, position:"relative", maxWidth:560 }}>
                    Full playback is sourced from open providers like Audius. Spotify-style account syncing and licensed Spotify full-track streaming are not part of this build.
                  </div>
                  <div style={{ display:"flex", gap:9, flexWrap:"wrap", position:"relative" }}>
                    {INDUSTRIES.slice(1, 9).map(i => (
                      <button key={i.id}
                        onClick={() => { setIndustry(i.id); setView("browse"); }}
                        style={{ padding:"8px 16px", borderRadius:20,
                          border:`1px solid ${i.color}40`,
                          background:`${i.color}16`, color:i.color,
                          fontSize:12.5, fontWeight:600 }}>
                        {i.emoji} {i.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sections */}
                {loadingHome && Object.keys(catalog).length === 0 ? (
                  [1,2,3].map(k => (
                    <div key={k} style={{ marginBottom:36 }}>
                      <div style={{ width:200, height:20, borderRadius:8, marginBottom:16,
                        background:t.skelA }} />
                      <div style={{ display:"flex", gap:14 }}>
                        {[1,2,3,4,5].map(j => <Skel key={j} w={155} h={210} t={t} />)}
                      </div>
                    </div>
                  ))
                ) : (
                  CATALOG.filter(sec => catalog[sec.key]?.length > 0).map(sec => (
                    <div key={sec.key} style={{ marginBottom:38 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                        <h2 style={{ fontSize:18, fontWeight:700, color:t.text,
                          letterSpacing:"-0.2px" }}>{sec.label}</h2>
                        <span style={{ fontSize:11, color:t.textMuted, fontWeight:500 }}>
                          {catalog[sec.key].length} songs
                        </span>
                      </div>
                      <div style={{ display:"flex", gap:14, overflowX:"auto", paddingBottom:8 }}>
                        {catalog[sec.key].map(s => (
                          <SongCard key={s.id} song={s} size={155} t={t}
                            isCurrent={current?.id === s.id}
                            isPlaying={current?.id === s.id && playing}
                            liked={liked.has(s.id)}
                            onPlay={() => playSong(s, catalog[sec.key])}
                            onLike={() => toggleLike(s.id)} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
                {artistUploads.length > 0 && (
                  <div style={{ marginBottom:38 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                      <h2 style={{ fontSize:18, fontWeight:700, color:t.text, letterSpacing:"-0.2px" }}>
                        Independent Artists
                      </h2>
                      <span style={{ fontSize:11, color:t.textMuted, fontWeight:500 }}>
                        {artistUploads.length} songs
                      </span>
                    </div>
                    <div style={{ display:"flex", gap:14, overflowX:"auto", paddingBottom:8 }}>
                      {artistUploads.map((s) => (
                        <SongCard key={s.id} song={s} size={155} t={t}
                          isCurrent={current?.id === s.id}
                          isPlaying={current?.id === s.id && playing}
                          liked={liked.has(s.id)}
                          onPlay={() => playSong(s, artistUploads)}
                          onLike={() => toggleLike(s.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─ SEARCH ─ */}
            {view === "search" && (
              <div className="slide">
                <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:22 }}>
                  <h2 style={{ fontSize:22, fontWeight:700, color:t.text }}>"{searchQ}"</h2>
                  <span style={{ fontSize:12, color:t.textMuted }}>{searchSongs.length} results</span>
                </div>
                {loadingKey === "search" ? (
                  <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                    {[1,2,3,4,5,6].map(k => <Skel key={k} w={155} h={210} t={t} />)}
                  </div>
                ) : searchSongs.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:48, marginBottom:14 }}>🎵</div>
                    <div style={{ fontSize:20, fontWeight:700 }}>No results found</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Try a different search term</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {searchSongs.map((s, i) => (
                      <SongRow key={s.id} song={s} num={i+1} t={t}
                        isCurrent={current?.id === s.id}
                        isPlaying={current?.id === s.id && playing}
                        liked={liked.has(s.id)}
                        fmtTime={fmtTime}
                        onPlay={() => playSong(s, searchSongs)}
                        onLike={() => toggleLike(s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ BROWSE ─ */}
            {view === "browse" && (
              <div className="slide">
                <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:22, flexWrap:"wrap" }}>
                  <h2 style={{ fontSize:22, fontWeight:700, color:t.text }}>
                    {INDUSTRIES.find(i => i.id === industry)?.emoji}{" "}
                    {INDUSTRIES.find(i => i.id === industry)?.label || "All Music"}
                  </h2>
                  {yearId && (
                    <span style={{ fontSize:11, padding:"3px 11px", borderRadius:12,
                      background:`${ac}18`, color:ac, fontWeight:700 }}>
                      {YEARS.find(y => y.id === yearId)?.label}
                    </span>
                  )}
                  <span style={{ fontSize:12, color:t.textMuted, marginLeft:"auto" }}>
                    {browseList.length} songs
                  </span>
                </div>
                {loadingKey === "browse" ? (
                  <div style={{ display:"grid",
                    gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:16 }}>
                    {[1,2,3,4,5,6,7,8].map(k => <Skel key={k} w="100%" h={210} t={t} />)}
                  </div>
                ) : browseList.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:42, marginBottom:12 }}>🔍</div>
                    <div style={{ fontSize:18, fontWeight:700 }}>No songs match these filters</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Try another year, language, or content filter</div>
                  </div>
                ) : (
                  <div style={{ display:"grid",
                    gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:16 }}>
                    {browseList.map(s => (
                      <SongCard key={s.id} song={s} t={t}
                        isCurrent={current?.id === s.id}
                        isPlaying={current?.id === s.id && playing}
                        liked={liked.has(s.id)}
                        onPlay={() => playSong(s, browseList)}
                        onLike={() => toggleLike(s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ ARTISTS ─ */}
            {view === "artists" && (
              <div className="slide">
                <h2 style={{ fontSize:22, fontWeight:700, marginBottom:8, color:t.text }}>Artists</h2>
                <p style={{ fontSize:13, color:t.textMuted, marginBottom:22 }}>
                  Browse every artist discovered in Groovify and open their songs
                </p>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:16 }}>
                  {allArtists.map((artist) => (
                    <button key={artist.name} onClick={() => loadArtist(artist.name)}
                      style={{ textAlign:"left", padding:0, borderRadius:18, overflow:"hidden",
                        border:`1px solid ${t.sideB}`, background:t.card, cursor:"pointer" }}>
                      <div style={{ aspectRatio:"1", background:t.skelA }}>
                        {artist.art
                          ? <Img src={artist.art} style={{ width:"100%", height:"100%" }} />
                          : <div style={{ width:"100%", height:"100%",
                              background:"linear-gradient(135deg,#6366F1,#8B5CF6)",
                              display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:40, fontWeight:900, color:"#fff" }}>
                              {artist.name[0]}
                            </div>
                        }
                      </div>
                      <div style={{ padding:"12px 14px 14px" }}>
                        <div style={{ fontSize:14, fontWeight:700, color:t.text, marginBottom:4,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {artist.name}
                        </div>
                        {artist.description && (
                          <div style={{ fontSize:11.5, color:t.textSub, lineHeight:1.45, marginBottom:6,
                            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                            {artist.description}
                          </div>
                        )}
                        <div style={{ fontSize:11.5, color:t.textMuted }}>
                          {artist.songs.length} songs
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─ ARTIST SONGS ─ */}
            {view === "artist" && (
              <div className="slide">
                <button onClick={() => setView("artists")}
                  style={{ background:"none", border:"none", color:"#6366F1",
                    fontSize:13, fontWeight:600, marginBottom:20,
                    display:"flex", alignItems:"center", gap:6 }}>
                  ← Artists
                </button>
                <div style={{ display:"flex", alignItems:"center", gap:18, marginBottom:26 }}>
                  <div style={{ width:84, height:84, borderRadius:"50%", overflow:"hidden",
                    flexShrink:0, background:t.skelA }}>
                    {currentArtistMeta?.art || artistList[0]?.art
                      ? <Img src={currentArtistMeta?.art || artistList[0]?.art} style={{ width:84, height:84 }} />
                      : <div style={{ width:84, height:84,
                          background:"linear-gradient(135deg,#6366F1,#8B5CF6)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:32, fontWeight:900, color:"#fff" }}>
                          {artistView?.[0]}
                        </div>
                    }
                  </div>
                  <div>
                    <div style={{ fontSize:26, fontWeight:800, color:t.text }}>{artistView}</div>
                    <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>
                      {(artistList.length || currentArtistMeta?.songs.length || 0)} tracks
                    </div>
                    {(artistInfo?.description || artistInfo?.extract) && (
                      <div style={{ maxWidth:720, fontSize:12.5, color:t.textSub, lineHeight:1.7, marginTop:10 }}>
                        {artistInfo?.description && (
                          <div style={{ fontWeight:700, color:"#6366F1", marginBottom:4 }}>
                            {artistInfo.description}
                          </div>
                        )}
                        {artistInfo?.extract}
                      </div>
                    )}
                    {artistInfo?.pageUrl && (
                      <a href={artistInfo.pageUrl} target="_blank" rel="noreferrer"
                        style={{ display:"inline-block", marginTop:10, fontSize:12.5, color:"#6366F1",
                          textDecoration:"none", fontWeight:700 }}>
                        View artist details
                      </a>
                    )}
                  </div>
                </div>
                {loadingKey === "artist" ? (
                  <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                    {[1,2,3,4,5].map(k => <Skel key={k} w={155} h={210} t={t} />)}
                  </div>
                ) : artistList.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:42, marginBottom:12 }}>🎤</div>
                    <div style={{ fontSize:18, fontWeight:700 }}>No tracks match these filters</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Try a different year or content type</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {artistList.map((s, i) => (
                      <SongRow key={s.id} song={s} num={i+1} t={t}
                        isCurrent={current?.id === s.id}
                        isPlaying={current?.id === s.id && playing}
                        liked={liked.has(s.id)}
                        fmtTime={fmtTime}
                        onPlay={() => playSong(s, artistList)}
                        onLike={() => toggleLike(s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ LIBRARY ─ */}
            {view === "library" && (
              <div className="slide">
                <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:22, flexWrap:"wrap" }}>
                  <h2 style={{ fontSize:22, fontWeight:700, color:t.text }}>♫ All Songs Library</h2>
                  <span style={{ fontSize:12, color:t.textMuted }}>{librarySongs.length} songs loaded</span>
                </div>
                {librarySongs.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:48, marginBottom:14 }}>♫</div>
                    <div style={{ fontSize:20, fontWeight:700 }}>No songs match these filters yet</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Home, Search, Browse, and Artists add songs into the library cache</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {librarySongs.map((s, i) => (
                      <SongRow key={s.id} song={s} num={i+1} t={t}
                        isCurrent={current?.id === s.id}
                        isPlaying={current?.id === s.id && playing}
                        liked={liked.has(s.id)}
                        fmtTime={fmtTime}
                        onPlay={() => playSong(s, librarySongs)}
                        onLike={() => toggleLike(s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ SAVED ─ */}
            {view === "saved" && (
              <div className="slide">
                <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:22, flexWrap:"wrap" }}>
                  <h2 style={{ fontSize:22, fontWeight:700, color:t.text }}>♥ Saved Songs</h2>
                  <span style={{ fontSize:12, color:t.textMuted }}>
                    {currentUser ? `${savedSongs.length} saved` : "Sign in required"}
                  </span>
                </div>
                {!currentUser ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:48, marginBottom:14 }}>🔐</div>
                    <div style={{ fontSize:20, fontWeight:700 }}>Login to save songs</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Your saved songs stay tied to your Groovify account on this device</div>
                    <button onClick={() => openAuth("signup")}
                      style={{ marginTop:18, padding:"10px 18px", borderRadius:20, border:"none",
                        background:"#6366F1", color:"#fff", fontSize:13, fontWeight:700 }}>
                      Create Account
                    </button>
                  </div>
                ) : savedSongs.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:48, marginBottom:14 }}>♥</div>
                    <div style={{ fontSize:20, fontWeight:700 }}>No saved songs yet</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Tap the heart on any track to keep it in your account</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {savedSongs.map((s, i) => (
                      <SongRow key={s.id} song={s} num={i+1} t={t}
                        isCurrent={current?.id === s.id}
                        isPlaying={current?.id === s.id && playing}
                        liked={true}
                        fmtTime={fmtTime}
                        onPlay={() => playSong(s, savedSongs)}
                        onLike={() => toggleLike(s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ QUEUE ─ */}
            {view === "queue" && (
              <div className="slide">
                <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:22, flexWrap:"wrap" }}>
                  <h2 style={{ fontSize:22, fontWeight:700, color:t.text }}>≡ Queue</h2>
                  <span style={{ fontSize:12, color:t.textMuted }}>{queueSongs.length} songs</span>
                </div>
                {queueSongs.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:48, marginBottom:14 }}>≡</div>
                    <div style={{ fontSize:20, fontWeight:700 }}>Queue is empty</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Play any song from Home, Search, Browse, or Library</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {queueSongs.map((s, i) => (
                      <SongRow key={`${s.id}-${i}`} song={s} num={i+1} t={t}
                        isCurrent={current?.id === s.id}
                        isPlaying={current?.id === s.id && playing}
                        liked={liked.has(s.id)}
                        fmtTime={fmtTime}
                        onPlay={() => playSong(s, queueSongs)}
                        onLike={() => toggleLike(s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─ RECENT ─ */}
            {view === "recent" && (
              <div className="slide">
                <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:22, flexWrap:"wrap" }}>
                  <h2 style={{ fontSize:22, fontWeight:700, color:t.text }}>⟳ Recently Played</h2>
                  <span style={{ fontSize:12, color:t.textMuted }}>{recentSongs.length} songs</span>
                </div>
                {recentSongs.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"60px 0", color:t.textMuted }}>
                    <div style={{ fontSize:48, marginBottom:14 }}>⟳</div>
                    <div style={{ fontSize:20, fontWeight:700 }}>No recent songs yet</div>
                    <div style={{ fontSize:13, marginTop:8 }}>Your play history will appear here</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {recentSongs.map((s, i) => (
                      <SongRow key={`${s.id}-${i}`} song={s} num={i+1} t={t}
                        isCurrent={current?.id === s.id}
                        isPlaying={current?.id === s.id && playing}
                        liked={liked.has(s.id)}
                        fmtTime={fmtTime}
                        onPlay={() => playSong(s, recentSongs)}
                        onLike={() => toggleLike(s.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* ══════════════ NOW PLAYING PANEL ══════════════ */}
        {showPanel && current && (
          <div style={mobile
            ? { position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,.45)" }
            : { width:288, background:t.panelBg,
                borderLeft:`1px solid ${t.sideB}`, display:"flex",
                flexDirection:"column", overflow:"hidden", flexShrink:0,
                backdropFilter:"blur(20px)" }}>
            {mobile && (
              <div onClick={() => setShowPanel(false)}
                style={{ position:"absolute", inset:0 }} />
            )}
            <div style={mobile
              ? { position:"absolute", left:0, right:0, bottom:0, maxHeight:"74vh",
                  background:t.panelBg, borderTopLeftRadius:22, borderTopRightRadius:22,
                  border:`1px solid ${t.sideB}`, overflow:"hidden", backdropFilter:"blur(20px)" }
              : { display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0, height:"100%" }}>
            <div style={{ padding:"17px 17px 0", display:"flex",
              justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:9, fontWeight:800, letterSpacing:"2px",
                color:t.textMuted, textTransform:"uppercase" }}>Now Playing</span>
              <button onClick={() => setShowPanel(false)}
                style={{ background:"none", border:"none", color:t.textMuted, fontSize:16 }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"14px 17px 17px" }}>
              <div style={{ aspectRatio:"1", borderRadius:16, overflow:"hidden", marginBottom:18,
                background:t.skelA, boxShadow:`0 20px 60px rgba(0,0,0,${dark ? 0.4 : 0.15})` }}>
                <Img src={current.artBig} style={{ width:"100%", height:"100%" }} />
              </div>
              <div style={{ fontSize:18, fontWeight:700, marginBottom:3,
                color:t.text, lineHeight:1.2 }}>{current.title}</div>
              <div style={{ fontSize:13, color:"#6366F1", fontWeight:600, marginBottom:4,
                cursor:"pointer" }} onClick={() => loadArtist(current.artist)}>
                {current.artist}
              </div>
              <div style={{ fontSize:12, color:t.textMuted, marginBottom:16 }}>{current.album}</div>
              {[["Year",current.year],["Genre",current.genre],["Source",current.source]]
                .filter(([,v]) => v).map(([l,v]) => (
                  <div key={l} style={{ display:"flex", justifyContent:"space-between",
                    padding:"8px 0", borderBottom:`1px solid ${t.divider}` }}>
                    <span style={{ fontSize:10, color:t.textMuted, textTransform:"uppercase",
                      letterSpacing:".8px", fontWeight:700 }}>{l}</span>
                    <span style={{ fontSize:12, color:t.textSub, textAlign:"right" }}>{v}</span>
                  </div>
                ))}
              <div style={{ marginTop:12, padding:"9px 12px", borderRadius:10,
                background:current.isPreview ? t.badgePrev : t.badgeFull,
                border:`1px solid ${current.isPreview?"rgba(148,163,184,.15)":"rgba(16,185,129,.2)"}` }}>
                <span style={{ fontSize:11, fontWeight:700,
                  color:current.isPreview ? "#94A3B8" : "#10B981" }}>
                  {current.isPreview ? "⚡ 30-Second iTunes Preview" : "✅ Full Song via Audius"}
                </span>
              </div>
              {current.storeUrl && (
                <a href={current.storeUrl} target="_blank" rel="noreferrer"
                  style={{ display:"block", marginTop:12, padding:"9px", textAlign:"center",
                    borderRadius:10, border:`1px solid ${t.sideB}`, background:t.hover,
                    color:t.textSub, fontSize:12, textDecoration:"none", fontWeight:600 }}>
                  Open Full Song ↗
                </a>
              )}
              {upcomingQueue.length > 0 && (
                <div style={{ marginTop:18 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                    <span style={{ fontSize:10, color:t.textMuted, textTransform:"uppercase",
                      letterSpacing:"1.2px", fontWeight:800 }}>
                      Up Next
                    </span>
                    <span style={{ fontSize:11, color:t.textMuted }}>{activeQueue.length} in queue</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    {upcomingQueue.map((song, index) => (
                      <div key={`${song.id}-${index}`} onClick={() => playSong(song, activeQueue)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 9px",
                          borderRadius:10, cursor:"pointer", background:t.hover }}>
                        <div style={{ width:34, height:34, borderRadius:8, overflow:"hidden", flexShrink:0,
                          background:t.skelA }}>
                          <Img src={song.artSm} style={{ width:34, height:34 }} />
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12.5, color:t.text, fontWeight:600,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {song.title}
                          </div>
                          <div style={{ fontSize:11, color:t.textSub,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {song.artist}
                          </div>
                        </div>
                        <div style={{ fontSize:10, color:t.textMuted, flexShrink:0 }}>
                          {fmtTime(song.dur)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════ BOTTOM PLAYER ══════════════ */}
      {current ? (
        <div style={{ height:mobile?82:78, background:t.player,
          borderTop:`1px solid ${t.playerB}`,
          backdropFilter:"blur(32px)", display:"flex", alignItems:"center",
          gap:mobile?8:14, padding:mobile?"0 12px":"0 22px",
          flexShrink:0, zIndex:100,
          boxShadow:dark?"none":"0 -4px 24px rgba(0,0,0,.08)" }}>

          {/* Song info */}
          <div style={{ display:"flex", alignItems:"center", gap:10,
            minWidth:mobile?110:185, width:mobile?"34%":"22%", overflow:"hidden" }}>
            <img
              src="/groovify-icon.svg"
              alt="Groovify"
              style={{ width:mobile ? 18 : 20, height:mobile ? 18 : 20, flexShrink:0, opacity:0.95 }}
            />
            <div style={{ width:44, height:44, borderRadius:9, overflow:"hidden",
              flexShrink:0, background:t.skelA,
              boxShadow:playing?"0 0 18px rgba(99,102,241,.3)":"none",
              transition:"box-shadow .3s" }}>
              <Img src={current.artSm} style={{ width:44, height:44 }} />
            </div>
            <div style={{ overflow:"hidden", flex:1, minWidth:0 }}>
              <div style={{ fontSize:mobile?11.5:13, fontWeight:600, color:t.text,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {current.title}
              </div>
              <div style={{ fontSize:mobile?10.5:11.5, color:t.textSub, marginTop:1, cursor:"pointer",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
                onClick={() => loadArtist(current.artist)}>
                {current.artist}
              </div>
            </div>
            <button onClick={() => toggleLike(current.id)}
              style={{ background:"none", border:"none", fontSize:16, flexShrink:0,
                color:liked.has(current.id) ? "#EF4444" : t.textMuted }}>
              {liked.has(current.id) ? "♥" : "♡"}
            </button>
          </div>

          {/* Controls */}
          <div style={{ flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", gap:mobile?4:7 }}>
            <div style={{ display:"flex", alignItems:"center", gap:mobile?10:22 }}>
              <button onClick={() => setShuffle(s => !s)}
                style={{ background:"none", border:"none", fontSize:14,
                  color:shuffle ? "#6366F1" : t.textMuted }}>⇄</button>
              <button onClick={() => advanceQueue(-1)}
                style={{ background:"none", border:"none",
                  fontSize:mobile?22:24, color:t.textSub }}>⏮</button>
              <button
                onClick={togglePlayback}
                style={{ width:mobile?40:44, height:mobile?40:44, borderRadius:"50%",
                  background:"linear-gradient(135deg,#6366F1,#4F46E5)", border:"none",
                  color:"#fff", fontSize:mobile?18:20, flexShrink:0,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  boxShadow:"0 0 20px rgba(99,102,241,.45)",
                  animation:playing?"pulse 2.2s ease-in-out infinite":"none" }}>
                {playing ? "⏸" : "▶"}
              </button>
              <button onClick={() => advanceQueue(1)}
                style={{ background:"none", border:"none",
                  fontSize:mobile?22:24, color:t.textSub }}>⏭</button>
              <button onClick={() => setRepeat(s => !s)}
                style={{ background:"none", border:"none", fontSize:14,
                  color:repeat ? "#6366F1" : t.textMuted }}>↺</button>
            </div>

            {/* Progress bar */}
            <div style={{ width:"100%", maxWidth:mobile?250:480,
              display:"flex", alignItems:"center", gap:9 }}>
              <span style={{ fontSize:10, color:t.textMuted, minWidth:32,
                textAlign:"right", flexShrink:0 }}>{fmtTime(curTime)}</span>
              <div onClick={seek}
                style={{ flex:1, height:4, background:dark?"rgba(255,255,255,.08)":"rgba(0,0,0,.1)",
                  borderRadius:4, cursor:"pointer", position:"relative" }}>
                <div style={{ height:"100%", width:`${Math.min(progress*100,100)}%`,
                  background:"linear-gradient(90deg,#6366F1,#8B5CF6)",
                  borderRadius:4, transition:"width .1s linear", position:"relative" }}>
                  <div style={{ position:"absolute", right:-5, top:"50%",
                    transform:"translateY(-50%)", width:10, height:10,
                    borderRadius:"50%", background:"#6366F1",
                    boxShadow:"0 0 8px rgba(99,102,241,.8)" }} />
                </div>
              </div>
              <span style={{ fontSize:10, color:t.textMuted, minWidth:32, flexShrink:0 }}>
                {fmtTime(totalDur)}
              </span>
            </div>
          </div>

          {/* Volume */}
          {!mobile && (
            <div style={{ display:"flex", alignItems:"center", gap:10,
              minWidth:165, justifyContent:"flex-end" }}>
              <button onClick={() => setShowPanel(s => !s)}
                style={{ padding:"6px 11px", borderRadius:16,
                  border:`1px solid ${showPanel?"rgba(99,102,241,.4)":t.sideB}`,
                  background:showPanel ? "rgba(99,102,241,.1)" : t.hover,
                  color:showPanel ? "#6366F1" : t.textSub,
                  fontSize:11, fontWeight:600 }}>
                ≡ Info
              </button>
              <button onClick={() => setMuted(s => !s)}
                style={{ background:"none", border:"none", fontSize:15,
                  color:muted ? "#6366F1" : t.textMuted }}>
                {muted ? "🔇" : "🔊"}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : vol}
                onChange={e => { setVol(+e.target.value); setMuted(false); }}
                style={{ width:76, accentColor:"#6366F1", cursor:"pointer" }} />
            </div>
          )}
          {mobile && (
            <div style={{ width:"18%", display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => setShowPanel(s => !s)}
                style={{ background:"none", border:"none", fontSize:16, color:t.textMuted }}>
                ≡
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ height:52, background:t.player, borderTop:`1px solid ${t.playerB}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          flexShrink:0, gap:10 }}>
          <img src="/groovify-icon.svg" alt="Groovify" style={{ width:22, height:22, display:"block" }} />
          <span style={{ fontSize:12, color:t.textMuted, letterSpacing:"1.5px",
            textTransform:"uppercase", fontWeight:600 }}>
            Search or browse to start listening
          </span>
        </div>
      )}
    </div>
  );
}
