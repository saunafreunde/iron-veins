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

/**
 * The same eight hues, redrawn for the colour-blind mode of section 17.4.
 *
 * Okabe-Ito is already deficiency-safe as a set, so what this alternative
 * palette changes is not the hues but the LIGHTNESS spread: eight colours that
 * differ in brightness as well as in hue survive being printed in grey, being
 * seen by somebody with achromatopsia, and being drawn two pixels wide on a
 * minimap - which the original set does not.
 */
export const COMPANY_COLORS_CVD: readonly string[] = [
  '#ffffff',
  '#ffd21f',
  '#7fd4ff',
  '#00a878',
  '#c0c0c0',
  '#0057a8',
  '#ff6a13',
  '#8b2f6b',
];

/** Ground colour per terrain type, indexed by Terrain. Shared by atlas and minimap. */
export const TERRAIN_COLORS: readonly string[] = [
  '#4a86a8', // water
  '#cbb682', // coast
  '#6f9b58', // grass
  '#b09a4e', // field
  '#3f6b3a', // forest
  '#8a8578', // rock
  '#e8eef2', // snow
  '#d6bc86', // desert
  '#5a6b4a', // marsh
  '#b8b4ac', // town ground
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
