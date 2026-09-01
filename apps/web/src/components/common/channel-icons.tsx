import * as React from "react";
import type { ChannelId } from "@nv/domain";

/**
 * Monochrome brand glyphs (fill: currentColor) for the channel chips. Simple,
 * recognizable single-path logos so a WhatsApp chip shows the WhatsApp mark and
 * a Telegram chip the paper plane — not just a letter. Channels without a custom
 * glyph fall back to their monogram in ChannelChip.
 */
type IconProps = { className?: string };

const Svg = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    // Explicit 1em size is a fallback so the glyph never collapses to 0 or blows
    // up to its intrinsic size if a utility class is missing; className still wins.
    width="1em"
    height="1em"
    aria-hidden="true"
    className={className ? `shrink-0 ${className}` : "shrink-0"}
  >
    {children}
  </svg>
);

const WhatsApp = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.02zM12.05 20.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42-.14-.01-.31-.01-.48-.01s-.43.06-.66.31c-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
  </Svg>
);

const Telegram = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M21.94 4.66 18.9 19.1c-.23 1.01-.83 1.26-1.68.79l-4.64-3.42-2.24 2.15c-.25.25-.45.45-.93.45l.33-4.72 8.58-7.75c.37-.33-.08-.52-.58-.19l-10.6 6.68-4.57-1.43c-.99-.31-1.01-.99.21-1.47l17.86-6.88c.83-.31 1.55.19 1.28 1.47z" />
  </Svg>
);

const Instagram = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.22.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.05.41 2.22.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.22-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.05.36-2.22.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.22-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.05-.41-2.22-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.22.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.05-.36 2.22-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.62c-3.14 0-3.51.01-4.75.07-.9.04-1.39.19-1.71.32-.43.17-.74.37-1.06.69-.32.32-.52.63-.69 1.06-.13.32-.28.81-.32 1.71-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.04.9.19 1.39.32 1.71.17.43.37.74.69 1.06.32.32.63.52 1.06.69.32.13.81.28 1.71.32 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c.9-.04 1.39-.19 1.71-.32.43-.17.74-.37 1.06-.69.32-.32.52-.63.69-1.06.13-.32.28-.81.32-1.71.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.04-.9-.19-1.39-.32-1.71a2.85 2.85 0 0 0-.69-1.06 2.85 2.85 0 0 0-1.06-.69c-.32-.13-.81-.28-1.71-.32-1.24-.06-1.61-.07-4.75-.07zm0 2.76a5.46 5.46 0 1 1 0 10.92 5.46 5.46 0 0 1 0-10.92zm0 1.62a3.84 3.84 0 1 0 0 7.68 3.84 3.84 0 0 0 0-7.68zm5.65-2.9a1.28 1.28 0 1 1 0 2.56 1.28 1.28 0 0 1 0-2.56z" />
  </Svg>
);

const Facebook = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.87h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" />
  </Svg>
);

const TikTok = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M16.6 5.82a4.28 4.28 0 0 1-1.07-2.82h-3.1v12.6a2.1 2.1 0 1 1-2.1-2.1c.2 0 .4.03.58.09v-3.2a5.3 5.3 0 0 0-.58-.03 5.28 5.28 0 1 0 5.28 5.28V9.9a7.34 7.34 0 0 0 4.3 1.38V8.15a4.3 4.3 0 0 1-3.31-2.33z" />
  </Svg>
);

const X = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M18.9 2.5h3.3l-7.2 8.23L23.5 21.5h-6.63l-5.2-6.8-5.94 6.8H2.43l7.7-8.8L2 2.5h6.8l4.7 6.2L18.9 2.5zm-1.16 17h1.83L7.34 4.4H5.38l12.36 15.1z" />
  </Svg>
);

const Email = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.5 5h17A1.5 1.5 0 0 1 22 6.5v11A1.5 1.5 0 0 1 20.5 19h-17A1.5 1.5 0 0 1 2 17.5v-11A1.5 1.5 0 0 1 3.5 5zm.9 2 7.1 5.03L19.6 7H4.4zm15.6 1.3-7.4 5.25a1 1 0 0 1-1.2 0L4 8.3v9.2h16z" />
  </Svg>
);

/** Custom brand glyphs; channels not listed fall back to their monogram. */
export const CHANNEL_ICON: Partial<Record<ChannelId, (p: IconProps) => React.ReactElement>> = {
  wa: WhatsApp,
  tg: Telegram,
  ig: Instagram,
  fb: Facebook,
  tk: TikTok,
  x: X,
  email: Email,
};
