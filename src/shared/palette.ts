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

/**
 * Made ground inside a town: trodden earth, gravel and yard. [CSS hex]
 *
 * **This is deliberately NOT 16.3's "Beton" `#b8b4ac`.** That hex sits on the
 * INFRA line of the binding palette beside Gleis, Schotter and Strasse, and
 * the party entitled to it is the road: `ROAD_INK.verge` paints a street's
 * kerb and graded verge with it. Town ground carried the SAME hex until
 * D-217, so a town street painted its edge in exactly the colour of the plot
 * beside it, the verge vanished, and what was left was a carriageway floating
 * on an unbounded pale field the houses stood on too - the literal mechanism
 * behind the owner's "Strassen durch Haeuser". 16.3's TERRAIN row assigns
 * town ground nothing at all, so the terrain is the party that had to move.
 *
 * Chosen by measurement rather than by eye, against every colour a town tile
 * can be seen next to (CIEDE2000, and again under simulated protanopia,
 * deuteranopia and tritanopia, for 17.4):
 *
 * - the verge `#b8b4ac`: dE 20.9, dL* 22.3, WCAG contrast 2.08 - and dE 20.5
 *   or better in all three dichromacies, 18.8 in flat greyscale. The street
 *   boundary is a VALUE step, so it survives every colour vision there is.
 * - the terrains it abuts: grass `#6f9b58` 23.0, field `#b09a4e` 16.9,
 *   forest `#3f6b3a` 24.0, desert `#d6bc86` 22.9, coast `#cbb682` 21.2.
 * - its closest neighbours are rock 8.5, marsh 18.7 and grass, which fall to
 *   7.3, 7.5 and 7.4 under the dichromacy that flatters each least. The
 *   shipped palette already lives with coast/desert at 2.4, grass/field at
 *   4.4 (protanopia) and forest/marsh at 3.8 (deuteranopia), so this is the
 *   WIDEST-separated of the ten terrains, not a new risk - and grass and town
 *   ground carry different grains besides (D-214: tufts against paving).
 *
 * L* 51.2, C* 16.8, hue 78 deg: darker and warmer than the concrete beside
 * it, drier and less green than grass, and still unmistakably ground.
 */
const TOWN_GROUND = '#8a775e';

/**
 * Ground colour per terrain type, indexed by Terrain. Shared by atlas and
 * minimap.
 *
 * Eight of the ten are 16.3's terrain row, literally. The other two - coast
 * and town ground - are terrains that row assigns no colour to at all, so
 * they are this file's own and are marked as such.
 */
export const TERRAIN_COLORS: readonly string[] = [
  '#4a86a8', // water (the SHALLOW tone of 16.3; the deep tone is WATER_DEEP)
  '#cbb682', // coast (16.3 fixes no beach tone; this file's own)
  '#6f9b58', // grass
  '#b09a4e', // field
  '#3f6b3a', // forest
  '#8a8578', // rock
  '#e8eef2', // snow
  '#d6bc86', // desert
  '#5a6b4a', // marsh
  TOWN_GROUND, // town ground (16.3 fixes none; see above - NOT its "Beton")
];

/**
 * The deep-water tone of section 16.3 ("Wasser tief #2c5a78").
 *
 * Not part of TERRAIN_COLORS because depth is not a terrain: which of the two
 * water tones a tile shows is derived render-side from `oceanMask` and the
 * corner heights (src/render/water.ts, D-164) - the simulation knows one
 * Terrain.Water and nothing else.
 */
export const WATER_DEEP = '#2c5a78';

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
