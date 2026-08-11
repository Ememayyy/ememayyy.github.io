# Codeforces Daily Momentum ⚡

A small, polished competitive-programming dashboard that estimates a user's **recent competitive momentum** from the last 30 days.

## What it measures

- Accepted unique problems
- Average rating of accepted problems
- Active days
- Submission volume
- Rated contests in the last 30 days
- Recent contest rating level
- Contest peak
- Codeforces contribution

The result is mapped to a momentum tier such as:

`Newbie → Pupil → Specialist → Expert → Candidate Master → Master → IM → GM → IGM → LGM`

> This is an experimental metric, not an official Codeforces rating.

## Run locally

No build step is required.

Open `index.html` in a browser, or use VS Code Live Server.

## Deploy to GitHub Pages

1. Create a new public GitHub repository, for example:
   `codeforces-daily-momentum`
2. Upload:
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save.

GitHub Pages will publish the static files.

## Important architecture note

This first version does **not need a database**. It reads public Codeforces data directly from the Codeforces API.

For a production version with:
- cached profiles,
- historical momentum,
- leaderboards,
- daily snapshots,
- authentication,
- many concurrent users,

use:

**GitHub Pages → API/Worker → Database**

A good small stack is:

- Frontend: GitHub Pages
- API/cache: Cloudflare Worker
- Database: Supabase Postgres

Do not put private API tokens or database service keys inside `app.js`.


## Momentum Rating

The **Momentum Rating** is an experimental, CF-style recent-performance estimate.
It intentionally gives strong recent form generous upside and can be substantially
higher than a user's official rating.

It is **not an official Codeforces rating**. Reproducing official Codeforces rating
changes exactly requires contest standings and opponent ratings; this frontend uses
the public user profile, submission history and contest rating history available to it.
