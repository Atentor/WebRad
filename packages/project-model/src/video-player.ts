import { z } from 'zod';
const manifestUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/(^|\.)(youtube\.com|youtu\.be)$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}, 'Use an HTTP(S) HLS/DASH manifest URL, without credentials or a YouTube link.');
export const VideoPlayerSourceSchema = z
  .union([
    z.object({ kind: z.literal('restgo'), videoId: z.string().regex(/^[A-Za-z0-9_-]+$/) }).strict(),
    z
      .object({ kind: z.literal('url'), url: manifestUrl, format: z.enum(['hls', 'dash']) })
      .strict(),
  ])
  .nullable();
export const VideoPlayerPropertiesSchema = z
  .object({
    source: VideoPlayerSourceSchema.optional(),
    controls: z.boolean().optional(),
    autoplay: z.boolean().optional(),
    muted: z.boolean().optional(),
    loop: z.boolean().optional(),
    playsInline: z.boolean().optional(),
    volume: z.number().finite().min(0).max(1).optional(),
    playbackRate: z.number().finite().positive().optional(),
    objectFit: z.enum(['contain', 'cover', 'fill', 'none', 'scale-down']).optional(),
    quality: z.union([z.literal('auto'), z.number().finite().positive()]).optional(),
    poster: z.string().optional(),
    visible: z.boolean().optional(),
    collapseWhenHidden: z.boolean().optional(),
    enabled: z.boolean().optional(),
    margin: z.number().finite().optional(),
    marginTop: z.number().finite().optional(),
    marginRight: z.number().finite().optional(),
    marginBottom: z.number().finite().optional(),
    marginLeft: z.number().finite().optional(),
    tabIndex: z.number().int().optional(),
  })
  .strict();
