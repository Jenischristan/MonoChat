import bgMidnightPeaks from '../assets/images/bg_midnight_peaks_1790945268669.jpg';
import bgObsidianDunes from '../assets/images/bg_obsidian_dunes_1790945289097.jpg';
import bgNoirForest from '../assets/images/bg_noir_forest_1790945305557.jpg';
import bgEclipseHorizon from '../assets/images/bg_eclipse_horizon_1790945318644.jpg';

export type ChatBackgroundId =
  | 'solid-obsidian'
  | 'solid-dark'
  | 'midnight-peaks'
  | 'obsidian-dunes'
  | 'noir-forest'
  | 'eclipse-horizon';

export interface ChatBackgroundOption {
  id: ChatBackgroundId;
  name: string;
  category: 'solid' | 'image';
  description: string;
  imageUrl?: string;
  backgroundColor: string;
  overlayOpacity?: number;
}

export const CHAT_BACKGROUNDS: ChatBackgroundOption[] = [
  {
    id: 'solid-obsidian',
    name: 'Pure Black',
    category: 'solid',
    description: 'Pure pitch-black #000000 monochrome canvas',
    backgroundColor: '#000000',
  },
  {
    id: 'solid-dark',
    name: 'Dark Carbon',
    category: 'solid',
    description: 'Clean matte carbon #0A0A0A monochrome surface',
    backgroundColor: '#0A0A0A',
  },
  {
    id: 'midnight-peaks',
    name: 'Midnight Peaks',
    category: 'image',
    description: 'Monochrome mountain peaks in pure black & white',
    imageUrl: bgMidnightPeaks,
    backgroundColor: '#000000',
    overlayOpacity: 0.58,
  },
  {
    id: 'obsidian-dunes',
    name: 'Obsidian Dunes',
    category: 'image',
    description: 'Pure grayscale desert shadow ridges at night',
    imageUrl: bgObsidianDunes,
    backgroundColor: '#000000',
    overlayOpacity: 0.6,
  },
  {
    id: 'noir-forest',
    name: 'Noir Mist Ridge',
    category: 'image',
    description: 'Dark monochrome forest silhouette in fog',
    imageUrl: bgNoirForest,
    backgroundColor: '#000000',
    overlayOpacity: 0.6,
  },
  {
    id: 'eclipse-horizon',
    name: 'Eclipse Horizon',
    category: 'image',
    description: 'Deep monochrome lunar eclipse horizon',
    imageUrl: bgEclipseHorizon,
    backgroundColor: '#000000',
    overlayOpacity: 0.58,
  },
];

export const WALLPAPER_STORAGE_KEY = 'monochat_wallpaper_v2';

export function getStoredChatBackground(): ChatBackgroundId {
  try {
    const saved = localStorage.getItem(WALLPAPER_STORAGE_KEY) as ChatBackgroundId | null;
    if (saved && CHAT_BACKGROUNDS.some((b) => b.id === saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'solid-obsidian';
}

export function setStoredChatBackground(id: ChatBackgroundId) {
  try {
    localStorage.setItem(WALLPAPER_STORAGE_KEY, id);
  } catch {
    // ignore storage errors
  }
}

export function getChatBackgroundOption(id?: string | null): ChatBackgroundOption {
  return (
    CHAT_BACKGROUNDS.find((b) => b.id === id) ||
    CHAT_BACKGROUNDS[0]
  );
}

/**
 * Generates a 100% pure neutral black-and-white SVG avatar (R === G === B in every stop)
 */
export function getMonochromeArtAvatar(name: string): string {
  const clean = (name || 'User').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const variant = Math.abs(hash) % 5;

  let svg = '';
  if (clean.includes('zenith') || clean.includes('nova') || clean.includes('orion') || clean.includes('vega') || variant === 0) {
    // Pure black & white mountain peak SVG
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <radialGradient id="bg" cx="50%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#404040"/>
          <stop offset="60%" stop-color="#171717"/>
          <stop offset="100%" stop-color="#050505"/>
        </radialGradient>
        <linearGradient id="leftSlope" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E5E5E5"/>
          <stop offset="100%" stop-color="#525252"/>
        </linearGradient>
        <linearGradient id="rightSlope" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#262626"/>
          <stop offset="100%" stop-color="#050505"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#bg)"/>
      <polygon points="60,26 16,106 60,106" fill="url(#leftSlope)"/>
      <polygon points="60,26 104,106 60,106" fill="url(#rightSlope)"/>
      <polygon points="32,58 4,106 32,106" fill="#737373" opacity="0.55"/>
      <polygon points="32,58 58,106 32,106" fill="#171717" opacity="0.85"/>
      <polygon points="88,54 62,106 88,106" fill="#A3A3A3" opacity="0.4"/>
      <polygon points="88,54 116,106 88,106" fill="#050505" opacity="0.9"/>
    </svg>`;
  } else if (clean.includes('lumen') || clean.includes('echo') || variant === 1) {
    // Pure black & white lunar orb
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <radialGradient id="space" cx="45%" cy="45%" r="70%">
          <stop offset="0%" stop-color="#2E2E2E"/>
          <stop offset="100%" stop-color="#050505"/>
        </radialGradient>
        <radialGradient id="orb" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#F5F5F5"/>
          <stop offset="55%" stop-color="#525252"/>
          <stop offset="100%" stop-color="#121212"/>
        </radialGradient>
      </defs>
      <rect width="120" height="120" fill="url(#space)"/>
      <circle cx="60" cy="60" r="38" fill="none" stroke="#525252" stroke-width="0.75" opacity="0.45"/>
      <circle cx="60" cy="60" r="22" fill="url(#orb)"/>
      <circle cx="46" cy="48" r="3" fill="#FFFFFF" opacity="0.8"/>
    </svg>`;
  } else if (clean.includes('astra') || clean.includes('study') || variant === 2) {
    // Pure grayscale horizon & peak
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#525252"/>
          <stop offset="55%" stop-color="#262626"/>
          <stop offset="100%" stop-color="#050505"/>
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#sky)"/>
      <circle cx="60" cy="42" r="14" fill="#E5E5E5" opacity="0.75"/>
      <polygon points="60,44 10,110 110,110" fill="#171717"/>
      <polygon points="60,44 10,110 60,110" fill="#404040"/>
      <rect y="86" width="120" height="34" fill="#050505" opacity="0.6"/>
    </svg>`;
  } else if (clean.includes('gaming') || variant === 3) {
    // Pure black & white eclipse sphere
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" fill="#0A0A0A"/>
      <circle cx="64" cy="58" r="28" fill="#737373" opacity="0.35"/>
      <circle cx="56" cy="60" r="26" fill="#050505" stroke="#A3A3A3" stroke-width="1.2" opacity="0.85"/>
    </svg>`;
  } else {
    // Pure black & white monochat emblem
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" fill="#0A0A0A"/>
      <polygon points="60,22 92,60 60,98 28,60" fill="#262626" stroke="#737373" stroke-width="1"/>
      <polygon points="60,22 60,98 28,60" fill="#737373" opacity="0.55"/>
    </svg>`;
  }

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
