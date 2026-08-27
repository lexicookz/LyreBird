// types/index.ts
// Placeholder types — swap these for Supabase's auto-generated types once
// Alexia's schema is ready. Keep field names close to hers to make the swap painless.

export type FunnelStage = 'top' | 'middle' | 'bottom';
export type VideoFormat = 'talking_head' | 'voiceover' | 'text_overlay' | 'skit' | 'other';
export type VideoStatus = 'processing' | 'ready' | 'failed';

export interface Video {
  id: string;
  title: string;
  thumbnailUrl: string;
  tags: string[];
  status: VideoStatus;
  createdAt: string; // ISO date string

  // AI analysis fields (populated once status is 'ready')
  hook?: string;
  transcript?: string;
  onScreenText?: string;
  shotBeats?: string[];
  pacing?: string;
  cta?: string;
  format?: VideoFormat;
  funnelStage?: FunnelStage;
}

export interface Brief {
  id: string;
  videoId: string; // links back to Video.id
  hook: string;
  script: string;
  shotList: string[];
  caption: string;
  cta: string;
  scheduledDate?: string; // ISO date string, optional until scheduled
  createdAt: string;
}

export interface BrandProfile {
  id: string;
  product: string;
  audience: string;
  tone: string;
}