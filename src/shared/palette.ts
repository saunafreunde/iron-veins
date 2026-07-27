/**
 * Colours from section 16.3. Kept in one place so map, minimap, HUD and the
 * generated sprite atlases cannot drift apart.
 */

/**
 * Company colours: the Okabe-Ito qualitative palette, which stays
 * distinguishable for all common forms of colour vision deficiency. The
 * original set starts with black, which disappears on the dark map background,
 * so slot 0 uses a light neutral grey instead.
 */
export const COMPANY_COLORS: readonly string[] = [
  '#b6bcc4',
  '#e69f00',
  '#56b4e9',
  '#009e73',
  '#f0e442',
  '#0072b2',
  '#d55e00',
  '#cc79a7',
];

/** Interface chrome. */
export const UI_COLORS = {
  surface: '#1c2128',
  card: '#262c34',
  border: '#39414c',
  text: '#e6e9ee',
  textMuted: '#9aa3ae',
  accent: '#f08020',
  success: '#4caf7d',
  warning: '#e0b040',
  danger: '#d9534f',
} as const;
