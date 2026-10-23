# groovy-backend

Express/MongoDB backend for Groovy audiobooks. The frontend is maintained separately in https://github.com/hetjkh/spotify.

## Run locally

1. Install Node.js 20 or newer and run `npm ci`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`.
3. Generate a JWT secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and set `JWT_SECRET`.
4. Run `npm start` (or `npm run dev` for watch mode). The API defaults to http://localhost:4000; check `GET /health`.

Set `CLIENT_ORIGIN` to the frontend URL and configure the frontend's `NEXT_PUBLIC_API_URL` to point to this API. Production requires HTTPS, a JWT secret of at least 32 characters, and persistent storage for `server/uploads/`. Host the frontend and API on the same site for authentication cookies.

## API

Routes include `/auth`, `/books`, `/me`, `/users`, `/catalog/version`, and library endpoints. Socket.IO runs on the same HTTP server.

Optional email delivery requires `RESEND_API_KEY` and `MAIL_FROM`. Google sign-in requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the callback URL `API_ORIGIN/auth/google/callback` registered with Google.

## Optional demo data

Run `npm run demo:media` with FFmpeg and FFprobe on PATH to download and prepare the public-domain recording excerpts, then run `npm run seed`. Downloads require network access. The demo catalog and media preparation script are included because the API uses them; no frontend application code is included.

Demo profiles are fictional, use password `listening123`, and must not be used in production. Automatic seeding is disabled unless `SEED_DEMO=true` outside production.

`npm run demo:reset` deletes all app records and uploaded files before reseeding. It is restricted to the `groovy-audiobooks` database, requires prepared demo media, and is disabled in production. Use it only for an intentional demo reset.

Environment secrets, uploaded media, downloaded demo assets, and dependencies are excluded from Git.
