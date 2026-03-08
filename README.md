# Groovify

Minimal Vite + React setup for the Groovify music browser/player UI.

## Run

1. Install Node.js LTS from `https://nodejs.org/`.
2. From this folder, install dependencies:

```bash
npm install
```

3. Start the dev server:

```bash
npm run dev
```

4. Open the local URL printed by Vite, usually `http://localhost:5173`.

## Notes

- This app fetches music data from the iTunes Search API and Audius through a local `/api/music-search` route.
- In development, Vite serves that route with middleware so provider requests stay server-side.
- If audio autoplay is blocked by the browser, click play manually once.

## Support Setup

To enable the `Support` modal in production, add these environment variables in Vercel:

```bash
VITE_RAZORPAY_KEY_ID=your_public_key
RAZORPAY_KEY_ID=your_server_key
RAZORPAY_KEY_SECRET=your_server_secret
VITE_PATREON_URL=https://www.patreon.com/your_creator_page
```

- `VITE_RAZORPAY_KEY_ID` is used by the frontend checkout button.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are used by `/api/razorpay-order`.
- `VITE_PATREON_URL` controls the Patreon support button target.

## Deploy

- Vercel uses [vercel.json](/Users/abhishekpanda/Documents/Code/groovify/vercel.json) so all non-API URLs rewrite to the SPA entry and direct loads keep working.
- If a static fallback is ever hit, Groovify serves [404.html](/Users/abhishekpanda/Documents/Code/groovify/public/404.html).
- Supabase deploy is only needed when you change files inside `supabase/`. If you already ran `db push` and deployed `publish-song` and `song-stream`, there is nothing else pending there.
