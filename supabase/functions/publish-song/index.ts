import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userData.user.email_confirmed_at) {
      return new Response(JSON.stringify({ error: "Email verification required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role,stage_name,bio,country,genres")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile || profile.role !== "artist") {
      return new Response(JSON.stringify({ error: "Artist access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.stage_name || !profile.bio || !profile.country || !(profile.genres || []).length) {
      return new Response(JSON.stringify({ error: "Artist profile incomplete" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    if (!body.title || !body.audioPath) {
      return new Response(JSON.stringify({ error: "Missing song data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: song, error: songError } = await adminClient
      .from("artist_songs")
      .insert({
        profile_id: userData.user.id,
        title: body.title,
        artist_name: body.artistName || profile.stage_name,
        album: body.album || null,
        genre: body.genre || null,
        language: body.language || null,
        cover_url: body.coverUrl || null,
        cover_path: body.coverPath || null,
        audio_path: body.audioPath,
        release_year: body.releaseYear || null,
        credit_name: body.creditName || null,
        source: "Groovify Artists",
        status: "published",
      })
      .select("*")
      .single();

    if (songError) {
      return new Response(JSON.stringify({ error: "Unable to publish song" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ song }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Unable to publish song" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
