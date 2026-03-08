import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const songId = new URL(req.url).searchParams.get("id");
    if (!songId) {
      return new Response(JSON.stringify({ error: "Missing song id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: song, error: songError } = await adminClient
      .from("artist_songs")
      .select("audio_path,status")
      .eq("id", songId)
      .eq("status", "published")
      .single();

    if (songError || !song?.audio_path) {
      return new Response(JSON.stringify({ error: "Song not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed, error: signedError } = await adminClient.storage
      .from("artist-audio")
      .createSignedUrl(song.audio_path, 60);

    if (signedError || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: "Stream unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return Response.redirect(signed.signedUrl, 302);
  } catch {
    return new Response(JSON.stringify({ error: "Stream unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
