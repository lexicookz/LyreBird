# LYREBIRD

Short-form video breakdown and brief tool | Software Innovation Studio, Group 05

Turns saved short-form videos into AI-analyzed, brand-specific content briefs.

## Run it

```bash
git clone https://github.com/lexicookz/LyreBird.git
cd LyreBird
nvm use          # Node 22 (installs nvm/node if missing — see below)
npm install
npx expo start
```

Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

**Requirements:**
- Node 22 LTS — if you don't have `nvm`: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`, then `nvm install 22`
- [Expo Go](https://expo.dev/go) app on your phone, updated (this runs on **SDK 57**)
- Phone and laptop on the same WiFi — if it won't connect, try `npx expo start --tunnel`
- If Expo Go prompts you to sign in, run `npx expo login` in the terminal first

### Running video analysis (backend)

Importing a clip uploads it to the Python analysis service (`/analyze-video`). To test analysis from Expo Go:

1. Start the backend in `pipeline/` (TODO: add exact start command).
2. In `data/library.ts`, replace the IP address in `uploadToAnalyze()` with your laptop's local IP. Do not commit this change.
3. Keep phone and laptop on the same WiFi.

Without the backend running, imported clips will show "Couldn't analyse" with a Try again button.

### Tests

```bash
npx tsc --noEmit   # type check
npm test           # Jest + React Native Testing Library
```

## What's built so far

- **Onboarding and auth** — sign in, brand setup, Sign out from Settings
- **Bottom tab navigation** — Library / Search / Briefs / Calendar, persistent across the app
- **Library** — masonry clip cards with thumbnails, status, tags, funnel-stage filtering, sort and delete
- **Import** — add videos from the camera roll; analysis starts automatically, with retry on failure
- **Search** — search hooks, captions and tags
- **Video Detail** — AI breakdown (hook, transcript, shot beats, pacing, CTA, funnel stage)
- **Briefs** — list of all briefs across videos
- **Brief** — editable hook, script, shot list, caption, CTA
- **Brand Profile** — editable name, product, audience, tone
- **Calendar** — scheduled briefs grouped by date
- **Settings** — Appearance (light/dark/follows phone) and Sign out

## Current status / known issues

- Analysis runs against the real backend, but mapping the API response to the screens is still in progress. Some fields (`whyItWorks`, `audioStyle`, `description`) are not displayed on Video Detail yet.
- Library, briefs, calendar, brand setup and account data are stored locally (AsyncStorage). Supabase (schema BE-27) and real auth are not connected yet — the data shapes already match, so swapping in live queries is a low-friction change.

## Tech stack

Expo (React Native) + TypeScript · Supabase (Postgres) · Python/FastAPI pipeline · Gemini 2.5 Flash

---
Frontend questions → Vivian