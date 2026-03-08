create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  role text not null default 'listener' check (role in ('listener', 'artist')),
  bio text,
  country text,
  languages text[] not null default '{}',
  genres text[] not null default '{}',
  stage_name text,
  website text,
  wiki_url text,
  saved_song_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_songs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  artist_name text not null,
  album text,
  genre text,
  language text,
  cover_url text,
  cover_path text,
  audio_url text,
  audio_path text not null,
  duration integer,
  release_year integer,
  credit_name text,
  source text not null default 'Groovify Artists',
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.handle_updated_at();

drop trigger if exists artist_songs_set_updated_at on public.artist_songs;
create trigger artist_songs_set_updated_at
before update on public.artist_songs
for each row execute function public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'listener')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.artist_songs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "artist_songs_select_published" on public.artist_songs;
create policy "artist_songs_select_published"
on public.artist_songs
for select
to anon, authenticated
using (status = 'published');

drop policy if exists "artist_songs_insert_artist" on public.artist_songs;
create policy "artist_songs_insert_artist"
on public.artist_songs
for insert
to authenticated
with check (
  auth.uid() = profile_id
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'artist'
  )
);

drop policy if exists "artist_songs_update_artist" on public.artist_songs;
create policy "artist_songs_update_artist"
on public.artist_songs
for update
to authenticated
using (auth.uid() = profile_id)
with check (auth.uid() = profile_id);

insert into storage.buckets (id, name, public)
values ('artist-covers', 'artist-covers', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('artist-audio', 'artist-audio', false)
on conflict (id) do nothing;

drop policy if exists "artist_covers_public_read" on storage.objects;
create policy "artist_covers_public_read"
on storage.objects
for select
to public
using (bucket_id = 'artist-covers');

drop policy if exists "artist_covers_upload_own" on storage.objects;
create policy "artist_covers_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artist-covers'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'artist'
  )
);

drop policy if exists "artist_audio_upload_own" on storage.objects;
create policy "artist_audio_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artist-audio'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'artist'
  )
);
