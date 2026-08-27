# Video Breakdown Tool....

Short-form video breakdown and brief tool | Software Innovation Studio, Group 05

Turns saved short-form videos into AI-analyzed, brand-specific content briefs.

## Run it

```bash
git clone https://github.com/lexicookz/VideoBreakdownTool.git
cd VideoBreakdownTool
nvm use          # Node 22 (installs nvm/node if missing — see below)
npm install
npx expo start

```

Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

**Requirements:**

- Node 22 LTS — if you don't have `nvm`: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`, then `nvm install 22`
- [Expo Go](https://expo.dev/go) app on your phone, updated (this runs on **SDK 54**)
- Phone and laptop on the same WiFi — if it won't connect, try `npx expo start --tunnel`

## What's built so far

- **Library** — list of videos with thumbnails, status, tags
- **Video Detail** — AI breakdown (hook, transcript, shot beats, pacing, CTA, funnel stage)
- **Brief** — editable hook, script, shot list, caption, CTA

All screens currently run on mock data — no backend connection yet.

## Tech stack

Expo (React Native) + TypeScript · Supabase (Postgres) · Python/FastAPI pipeline · Gemini 2.5 Flash

---

Frontend questions → Vivian
