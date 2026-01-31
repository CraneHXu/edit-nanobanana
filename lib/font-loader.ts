/**
 * Font Loading and Management
 */

// Curated list of Google Fonts with CJK support
export const GOOGLE_FONTS = [
  // Sans-serif
  { name: 'Roboto', category: 'sans-serif' },
  { name: 'Open Sans', category: 'sans-serif' },
  { name: 'Lato', category: 'sans-serif' },
  { name: 'Montserrat', category: 'sans-serif' },
  { name: 'Poppins', category: 'sans-serif' },
  { name: 'Inter', category: 'sans-serif' },
  { name: 'Raleway', category: 'sans-serif' },
  { name: 'Ubuntu', category: 'sans-serif' },
  { name: 'Work Sans', category: 'sans-serif' },
  { name: 'Nunito', category: 'sans-serif' },

  // Serif
  { name: 'Playfair Display', category: 'serif' },
  { name: 'Merriweather', category: 'serif' },
  { name: 'Lora', category: 'serif' },
  { name: 'PT Serif', category: 'serif' },
  { name: 'Crimson Text', category: 'serif' },

  // Monospace
  { name: 'Roboto Mono', category: 'monospace' },
  { name: 'Source Code Pro', category: 'monospace' },
  { name: 'JetBrains Mono', category: 'monospace' },
  { name: 'Fira Code', category: 'monospace' },

  // Handwriting
  { name: 'Pacifico', category: 'handwriting' },
  { name: 'Dancing Script', category: 'handwriting' },
  { name: 'Satisfy', category: 'handwriting' },
  { name: 'Caveat', category: 'handwriting' },

  // CJK Support (Chinese, Japanese, Korean)
  { name: 'Noto Sans SC', category: 'sans-serif', cjk: true },
  { name: 'Noto Serif SC', category: 'serif', cjk: true },
  { name: 'Ma Shan Zheng', category: 'handwriting', cjk: true },
  { name: 'ZCOOL XiaoWei', category: 'serif', cjk: true },
  { name: 'ZCOOL QingKe HuangYou', category: 'display', cjk: true },
  { name: 'Liu Jian Mao Cao', category: 'handwriting', cjk: true },
];

export const DEFAULT_FONT = 'Roboto';

// Cache for loaded fonts
const loadedFonts = new Set<string>();

/**
 * Load a Google Font dynamically
 */
export async function loadGoogleFont(fontName: string): Promise<void> {
  // Skip if already loaded
  if (loadedFonts.has(fontName)) {
    return;
  }

  try {
    // Create font-face using Google Fonts API
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;700&display=swap`;

    // Check if font link already exists
    const existingLink = document.querySelector(`link[href="${fontUrl}"]`);
    if (existingLink) {
      loadedFonts.add(fontName);
      return;
    }

    // Create and append font link
    const link = document.createElement('link');
    link.href = fontUrl;
    link.rel = 'stylesheet';

    await new Promise<void>((resolve, reject) => {
      link.onload = () => {
        loadedFonts.add(fontName);
        resolve();
      };
      link.onerror = reject;
      document.head.appendChild(link);
    });

    // Wait for font to be ready
    if (document.fonts) {
      await document.fonts.ready;
    }
  } catch (error) {
    console.error(`Failed to load font ${fontName}:`, error);
  }
}

/**
 * Preload commonly used fonts
 */
export async function preloadCommonFonts(): Promise<void> {
  const commonFonts = ['Roboto', 'Open Sans', 'Noto Sans SC'];

  await Promise.all(commonFonts.map(loadGoogleFont));
}
