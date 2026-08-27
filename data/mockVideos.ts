// data/mockVideos.ts
// Fake data matching types/index.ts — build screens against this until
// Alexia's real Supabase tables are ready, then swap this out for real queries.

import { Video, Brief, BrandProfile } from '../types';

export const mockVideos: Video[] = [
  {
    id: 'v1',
    title: 'Morning routine that changed everything',
    thumbnailUrl: 'https://picsum.photos/seed/v1/400/700',
    tags: ['morning', 'routine', 'productivity'],
    status: 'ready',
    createdAt: '2026-08-20T08:00:00Z',
    hook: "I used to hit snooze 5 times. Here's what fixed it.",
    transcript: 'So I used to be the person who hit snooze five times every morning...',
    onScreenText: '5 SNOOZES → 0',
    shotBeats: ['Close up: alarm clock', 'Cut to: making bed', 'Cut to: stretching by window'],
    pacing: 'Fast cuts, under 2s per shot for first 5 seconds',
    cta: 'Follow for more morning tips',
    format: 'talking_head',
    funnelStage: 'top',
  },
  {
    id: 'v2',
    title: 'Why your onboarding emails are getting ignored',
    thumbnailUrl: 'https://picsum.photos/seed/v2/400/700',
    tags: ['marketing', 'email', 'saas'],
    status: 'ready',
    createdAt: '2026-08-22T14:30:00Z',
    hook: 'Your welcome email has a 3-second window. Most brands waste it.',
    transcript: "Let's talk about the one email almost every SaaS company gets wrong...",
    onScreenText: '3 SECONDS. THAT\'S IT.',
    shotBeats: ['Screen recording: inbox', 'Text overlay: stat callout', 'Talking head: explanation'],
    pacing: 'Steady, one beat every 3-4s',
    cta: 'Comment "EMAIL" for my swipe file',
    format: 'voiceover',
    funnelStage: 'middle',
  },
  {
    id: 'v3',
    title: 'POV: your product finally sells itself',
    thumbnailUrl: 'https://picsum.photos/seed/v3/400/700',
    tags: ['product', 'demo', 'conversion'],
    status: 'processing',
    createdAt: '2026-08-25T09:15:00Z',
  },
  {
    id: 'v4',
    title: 'The pricing page mistake costing you customers',
    thumbnailUrl: 'https://picsum.photos/seed/v4/400/700',
    tags: ['pricing', 'cro', 'saas'],
    status: 'failed',
    createdAt: '2026-08-26T11:00:00Z',
  },
  {
    id: 'v5',
    title: 'How I script a 30-second ad in 10 minutes',
    thumbnailUrl: 'https://picsum.photos/seed/v5/400/700',
    tags: ['scriptwriting', 'ads', 'process'],
    status: 'ready',
    createdAt: '2026-08-24T16:45:00Z',
    hook: "10 minutes. That's all it takes if you use this structure.",
    transcript: 'Every ad script I write follows the same five-part structure...',
    onScreenText: 'HOOK → PROBLEM → AGITATE → SOLUTION → CTA',
    shotBeats: ['Talking head intro', 'Screen recording: notes app', 'Talking head: walkthrough'],
    pacing: 'Medium, 4-5s per beat',
    cta: 'Save this for your next shoot',
    format: 'talking_head',
    funnelStage: 'bottom',
  },
];

export const mockBriefs: Brief[] = [
  {
    id: 'b1',
    videoId: 'v1',
    hook: "I used to hit snooze 5 times. Here's what fixed it.",
    script: 'Open on alarm clock close-up. Cut to making the bed while narrating the one rule that changed my mornings...',
    shotList: ['Alarm clock close-up', 'Making bed', 'Stretching by window', 'Pouring coffee'],
    caption: 'The one rule that fixed my mornings 🌅 #morningroutine',
    cta: 'Follow for more morning tips',
    scheduledDate: '2026-09-02T09:00:00Z',
    createdAt: '2026-08-21T10:00:00Z',
  },
  {
    id: 'b2',
    videoId: 'v2',
    hook: 'Your welcome email has a 3-second window. Most brands waste it.',
    script: 'Screen recording of a cluttered inbox. Overlay text with the 3-second stat. Cut to camera for the fix...',
    shotList: ['Inbox screen recording', 'Stat text overlay', 'Talking head explanation'],
    caption: 'Fix your welcome email in one afternoon 📧',
    cta: 'Comment "EMAIL" for my swipe file',
    createdAt: '2026-08-23T09:30:00Z',
    // no scheduledDate yet — still a draft
  },
];

export const mockBrandProfile: BrandProfile = {
  id: 'bp1',
  product: 'A short-form content planning app for solo marketers',
  audience: 'Solo marketers, founders, and small agencies making organic TikTok/Reels content',
  tone: 'Direct, practical, a little irreverent — no corporate marketing-speak',
};