# Supabase Setup

Apply the migration in `supabase/migrations/20260308195000_groovify_schema.sql`.

Deploy these edge functions:

- `publish-song`
- `song-stream`

Set these function secrets in Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_` variable.
It must stay server-side only and be set as an Edge Function secret, not bundled into the client.

Optional storage endpoint reference:

- `https://trhacefubuncdrabfede.storage.supabase.co/storage/v1/s3`

Recommended auth settings:

- Enable email confirmation.
- Use email/password auth.
- Keep `artist-audio` private.
- Keep `artist-covers` public.
