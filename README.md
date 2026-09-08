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

## What's built so far

- **Library** — list of videos with thumbnails, status, tags
- **Video Detail** — AI breakdown (hook, transcript, shot beats, pacing, CTA, funnel stage)
- **Brief** — editable hook, script, shot list, caption, CTA
- **Brand Profile** — editable name, product, audience, tone
- **Calendar** — scheduled briefs grouped by date

Screens currently run on mock data shaped to match the real Supabase schema (BE-27) — swapping in live queries is a low-friction change since the shapes already match.

## Tech stack

Expo (React Native) + TypeScript · Supabase (Postgres) · Python/FastAPI pipeline · Gemini 2.5 Flash

---
Frontend questions → Vivian