import { IndustryType, INDUSTRY_TYPE_COUNT } from '../sim/industry/types';
import {
  box,
  conifer,
  cylinder,
  gableRoof,
  heap,
  lattice,
  sawtoothRoof,
  windows,
  type IsoView,
} from './shapes';

/**
 * A silhouette per industry, so seventeen different works do not all look like
 * the same grey crate.
 *
 * They are drawn in their own colours rather than tinted. A tint multiplies,
 * so a coal heap and a chimney under one tint come out the same shade of
 * whatever the tint is - which is exactly the problem this file exists to fix.
 *
 * Every one is built from the primitives in `shapes.ts` and stays inside one
 * atlas cell. What matters is the OUTLINE: at the zoom people actually play
 * at, a headframe, a cooling tower and a saw-tooth roof are recognisable when
 * a coloured box is not.
 */

/** Height of one atlas pixel unit; the caller passes its own scale in. */
export interface ArtScale {
  /** Multiplier from "design pixels" to atlas pixels. */
  readonly px: number;
}

type Draw = (ctx: CanvasRenderingContext2D, view: IsoView, s: ArtScale) => void;

const BRICK = '#8d5b46';
const CONCRETE = '#b9b4aa';
const STEEL = '#8f9aa4';
const RUST = '#8a5a3c';
const DARK_ROOF = '#4b5058';
const GLASS = '#7fb2c8';

/**
 * The window layouts of the three glazed industries, extracted so the FULL
 * drawing and the M13 emissive pass read one spec: "windows() knows the
 * positions" (SPEC2 M13) only stays true while there is exactly one place
 * that says where they are. Keyed by IndustryType; the emissive pass
 * replaces only the colour.
 */
const WINDOW_SPECS: Partial<
  Record<
    number,
    {
      u: number;
      v: number;
      height: number;
      rows: number;
      columns: number;
      colour: string;
      offsetU?: number;
      offsetV?: number;
    }
  >
> = {
  [IndustryType.FurnitureFactory]: { u: 0.7, v: 0.5, height: 11, rows: 2, columns: 3, colour: GLASS },
  [IndustryType.ElectronicsFactory]: {
    u: 0.8,
    v: 0.56,
    height: 16,
    rows: 3,
    columns: 4,
    colour: '#4f7f96',
  },
  [IndustryType.FoodFactory]: {
    u: 0.62,
    v: 0.5,
    height: 13,
    rows: 2,
    columns: 3,
    colour: '#6f95a6',
    offsetU: -0.1,
    offsetV: 0.08,
  },
};

/** Draw one industry's windows; `colour` overrides the daytime glass. */
function industryWindows(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  s: ArtScale,
  type: number,
  colour?: string,
): void {
  const spec = WINDOW_SPECS[type];
  if (spec === undefined) return;
  windows(ctx, view, {
    u: spec.u,
    v: spec.v,
    height: spec.height * s.px,
    rows: spec.rows,
    columns: spec.columns,
    colour: colour ?? spec.colour,
    offsetU: spec.offsetU,
    offsetV: spec.offsetV,
  });
}

/** A low works building with a saw-tooth roof; the generic factory hall. */
function hall(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  s: ArtScale,
  colour: string,
  spec: { u: number; v: number; height: number; offsetU?: number; offsetV?: number },
): void {
  box(ctx, view, {
    u: spec.u,
    v: spec.v,
    height: spec.height * s.px,
    colour,
    offsetU: spec.offsetU,
    offsetV: spec.offsetV,
  });
  sawtoothRoof(ctx, view, {
    u: spec.u,
    v: spec.v,
    base: spec.height * s.px,
    rise: 3 * s.px,
    teeth: 3,
    colour: DARK_ROOF,
    glass: GLASS,
    offsetU: spec.offsetU,
    offsetV: spec.offsetV,
  });
}

/** A chimney with the red band every tall stack has. */
function chimney(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  s: ArtScale,
  spec: { u: number; v: number; height: number; radius: number },
): void {
  cylinder(ctx, view, {
    radius: spec.radius,
    height: spec.height * s.px,
    colour: CONCRETE,
    offsetU: spec.u,
    offsetV: spec.v,
    topRadius: spec.radius * 0.8,
  });
  cylinder(ctx, view, {
    radius: spec.radius * 0.84,
    height: 2 * s.px,
    colour: '#a63b2c',
    offsetU: spec.u,
    offsetV: spec.v,
    base: spec.height * s.px * 0.72,
    topRadius: spec.radius * 0.82,
  });
}

/** Every industry's drawing, indexed by IndustryType. */
const ART: readonly Draw[] = [
  // 0 CoalMine - a headframe over the shaft, a winding house and a black heap.
  (ctx, view, s) => {
    heap(ctx, view, { offsetU: 0.3, offsetV: 0.34, radius: 0.34, height: 9 * s.px, colour: '#2b2b30' });
    box(ctx, view, { u: 0.44, v: 0.34, height: 9 * s.px, colour: BRICK, offsetU: -0.28, offsetV: 0.2 });
    lattice(ctx, view, {
      width: 0.34,
      height: 26 * s.px,
      colour: '#5d6570',
      offsetU: -0.14,
      offsetV: -0.24,
      lineWidth: 1.6 * s.px,
    });
  },

  // 1 IronOreMine - the same shaft, a red heap and a loading bunker.
  (ctx, view, s) => {
    heap(ctx, view, { offsetU: 0.32, offsetV: 0.3, radius: 0.36, height: 10 * s.px, colour: '#7a3b28' });
    box(ctx, view, { u: 0.5, v: 0.3, height: 11 * s.px, colour: RUST, offsetU: -0.24, offsetV: 0.24 });
    lattice(ctx, view, {
      width: 0.32,
      height: 23 * s.px,
      colour: '#6b5449',
      offsetU: -0.18,
      offsetV: -0.22,
      lineWidth: 1.6 * s.px,
    });
  },

  // 2 OilWell - a derrick and a squat tank. Nothing else on the pad.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.72, v: 0.6, height: 1.5 * s.px, colour: '#6f6a60' });
    lattice(ctx, view, {
      width: 0.4,
      height: 32 * s.px,
      colour: '#7d8792',
      offsetU: -0.1,
      offsetV: -0.1,
      taper: 0.28,
      lineWidth: 1.5 * s.px,
    });
    cylinder(ctx, view, {
      radius: 0.2,
      height: 8 * s.px,
      colour: '#4d5a52',
      offsetU: 0.3,
      offsetV: 0.3,
    });
  },

  // 3 Forestry - trees and a stack of cut logs.
  (ctx, view, s) => {
    conifer(ctx, view, { offsetU: -0.26, offsetV: -0.22, height: 22 * s.px, radius: 0.2 });
    conifer(ctx, view, { offsetU: 0.18, offsetV: -0.3, height: 17 * s.px, radius: 0.17 });
    conifer(ctx, view, { offsetU: -0.06, offsetV: 0.12, height: 26 * s.px, radius: 0.22 });
    box(ctx, view, { u: 0.5, v: 0.16, height: 5 * s.px, colour: '#9a7448', offsetU: 0.16, offsetV: 0.34 });
  },

  // 4 Farm - a gabled barn and a grain silo.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.62, v: 0.42, height: 8 * s.px, colour: '#a8503c', offsetU: -0.12, offsetV: 0.08 });
    gableRoof(ctx, view, {
      u: 0.62,
      v: 0.42,
      base: 8 * s.px,
      rise: 7 * s.px,
      colour: '#5b3b30',
      offsetU: -0.12,
      offsetV: 0.08,
    });
    cylinder(ctx, view, {
      radius: 0.15,
      height: 20 * s.px,
      colour: '#cfc7b4',
      offsetU: 0.32,
      offsetV: -0.24,
    });
  },

  // 5 GravelPit - a bitten-out terrace, a conveyor and two heaps.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.86, v: 0.7, height: 1 * s.px, colour: '#8c8375' });
    heap(ctx, view, { offsetU: -0.2, offsetV: 0.22, radius: 0.3, height: 8 * s.px, colour: '#a49a88' });
    heap(ctx, view, { offsetU: 0.26, offsetV: -0.06, radius: 0.24, height: 6 * s.px, colour: '#8f8676' });
    box(ctx, view, { u: 0.5, v: 0.1, height: 9 * s.px, colour: STEEL, offsetU: 0.1, offsetV: 0.32 });
  },

  // 6 PowerPlant - two cooling towers and the stack. The most recognisable
  // silhouette in the whole game, and worth the three shapes it costs.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.7, v: 0.4, height: 9 * s.px, colour: CONCRETE, offsetU: 0, offsetV: 0.28 });
    cylinder(ctx, view, {
      radius: 0.24,
      height: 22 * s.px,
      colour: '#c3bfb6',
      offsetU: -0.26,
      offsetV: -0.22,
      topRadius: 0.19,
    });
    cylinder(ctx, view, {
      radius: 0.22,
      height: 19 * s.px,
      colour: '#b8b4ab',
      offsetU: 0.14,
      offsetV: -0.3,
      topRadius: 0.17,
    });
    chimney(ctx, view, s, { u: 0.34, v: 0.06, height: 34, radius: 0.09 });
  },

  // 7 SteelMill - a long hall and two stacks.
  (ctx, view, s) => {
    hall(ctx, view, s, '#6d6862', { u: 0.9, v: 0.46, height: 12, offsetV: 0.14 });
    chimney(ctx, view, s, { u: -0.3, v: -0.28, height: 28, radius: 0.08 });
    chimney(ctx, view, s, { u: 0.06, v: -0.32, height: 22, radius: 0.07 });
  },

  // 8 Sawmill - a saw-tooth hall and a log stack outside it.
  (ctx, view, s) => {
    hall(ctx, view, s, '#8a6a44', { u: 0.66, v: 0.44, height: 9, offsetU: -0.1, offsetV: -0.06 });
    box(ctx, view, { u: 0.44, v: 0.18, height: 6 * s.px, colour: '#a37f4e', offsetU: 0.22, offsetV: 0.34 });
    box(ctx, view, { u: 0.4, v: 0.14, height: 4 * s.px, colour: '#8d6b40', offsetU: -0.24, offsetV: 0.36 });
  },

  // 9 FurnitureFactory - a workshop with a pitched roof and a small stack.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.7, v: 0.5, height: 11 * s.px, colour: '#9d7a55' });
    gableRoof(ctx, view, { u: 0.7, v: 0.5, base: 11 * s.px, rise: 5 * s.px, colour: '#63483a' });
    industryWindows(ctx, view, s, IndustryType.FurnitureFactory);
    chimney(ctx, view, s, { u: 0.28, v: -0.3, height: 15, radius: 0.06 });
  },

  // 10 MachineFactory - a big shed with roof plant on top.
  (ctx, view, s) => {
    hall(ctx, view, s, STEEL, { u: 0.86, v: 0.56, height: 13 });
    box(ctx, view, { u: 0.2, v: 0.16, height: 5 * s.px, colour: '#6d7681', offsetU: 0.22, offsetV: -0.16, base: 16 * s.px });
  },

  // 11 ElectronicsFactory - the clean one: a flat glazed block.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.8, v: 0.56, height: 16 * s.px, colour: '#d3d7db' });
    industryWindows(ctx, view, s, IndustryType.ElectronicsFactory);
    box(ctx, view, { u: 0.3, v: 0.24, height: 3 * s.px, colour: '#9aa2aa', base: 16 * s.px });
  },

  // 12 FoodFactory - a block with a pair of silos beside it.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.62, v: 0.5, height: 13 * s.px, colour: '#e0dbcd', offsetU: -0.1, offsetV: 0.08 });
    industryWindows(ctx, view, s, IndustryType.FoodFactory);
    cylinder(ctx, view, { radius: 0.13, height: 18 * s.px, colour: '#cdc6b2', offsetU: 0.3, offsetV: -0.2 });
    cylinder(ctx, view, { radius: 0.13, height: 16 * s.px, colour: '#c4bda9', offsetU: 0.34, offsetV: 0.06 });
  },

  // 13 Refinery - distillation columns and a floating-roof tank.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.8, v: 0.6, height: 1.5 * s.px, colour: '#7c776d' });
    cylinder(ctx, view, { radius: 0.08, height: 34 * s.px, colour: '#c6ccd2', offsetU: -0.24, offsetV: -0.2 });
    cylinder(ctx, view, { radius: 0.07, height: 27 * s.px, colour: '#b6bcc2', offsetU: -0.06, offsetV: -0.3 });
    cylinder(ctx, view, { radius: 0.24, height: 9 * s.px, colour: '#9fa8ae', offsetU: 0.24, offsetV: 0.24 });
    chimney(ctx, view, s, { u: 0.3, v: -0.3, height: 24, radius: 0.06 });
  },

  // 14 PlasticsPlant - a row of pressure vessels and a low shed.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.56, v: 0.4, height: 9 * s.px, colour: '#a9adb2', offsetU: -0.18, offsetV: 0.22 });
    cylinder(ctx, view, { radius: 0.15, height: 16 * s.px, colour: '#7fa8b8', offsetU: 0.2, offsetV: -0.24 });
    cylinder(ctx, view, { radius: 0.15, height: 16 * s.px, colour: '#74a0b0', offsetU: 0.3, offsetV: 0.06 });
    cylinder(ctx, view, { radius: 0.12, height: 12 * s.px, colour: '#87b0bf', offsetU: -0.06, offsetV: -0.3 });
  },

  // 15 CementWorks - the long inclined kiln, which nothing else has.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.86, v: 0.26, height: 6 * s.px, colour: '#9c968a', offsetV: 0.06 });
    cylinder(ctx, view, { radius: 0.1, height: 5 * s.px, colour: '#8e887c', offsetU: -0.3, offsetV: 0.06, base: 6 * s.px });
    cylinder(ctx, view, { radius: 0.1, height: 5 * s.px, colour: '#8e887c', offsetU: 0.3, offsetV: 0.06, base: 6 * s.px });
    box(ctx, view, { u: 0.8, v: 0.14, height: 4 * s.px, colour: '#b0a99b', offsetV: 0.06, base: 8 * s.px });
    cylinder(ctx, view, { radius: 0.16, height: 21 * s.px, colour: '#cdc6b8', offsetU: -0.26, offsetV: -0.3 });
    chimney(ctx, view, s, { u: 0.26, v: -0.3, height: 20, radius: 0.06 });
  },

  // 16 BuildersMerchant - a yard: open shed, stacked pallets, no chimney.
  (ctx, view, s) => {
    box(ctx, view, { u: 0.8, v: 0.6, height: 1 * s.px, colour: '#8b8579' });
    box(ctx, view, { u: 0.5, v: 0.34, height: 8 * s.px, colour: '#c0b7a4', offsetU: -0.18, offsetV: -0.14 });
    gableRoof(ctx, view, {
      u: 0.5,
      v: 0.34,
      base: 8 * s.px,
      rise: 3 * s.px,
      colour: '#6d6a63',
      offsetU: -0.18,
      offsetV: -0.14,
    });
    box(ctx, view, { u: 0.22, v: 0.2, height: 6 * s.px, colour: '#b9793f', offsetU: 0.26, offsetV: 0.2 });
    box(ctx, view, { u: 0.2, v: 0.18, height: 4 * s.px, colour: '#a8703c', offsetU: 0.06, offsetV: 0.34 });
  },
];

/** Draw one industry into the cell whose centre `view` describes. */
export function drawIndustry(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  type: number,
  scale: ArtScale,
): void {
  const draw = ART[type] ?? ART[IndustryType.MachineFactory]!;
  draw(ctx, view, scale);
}

/**
 * The industries whose procedural cell has an emissive twin (M13): exactly
 * the glazed ones - the types with a WINDOW_SPECS entry. Sorted ascending
 * so the atlas column of a type is stable whatever order the record's keys
 * enumerate in.
 */
export const INDUSTRY_EMISSIVE_TYPES: readonly number[] = Object.keys(WINDOW_SPECS)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * The emissive twin of a glazed industry cell (SPEC2 M13: window-only cells
 * regenerated from the known positions): only its windows, in the lit
 * colour, everything else transparent. Same view, same specs, same code
 * path as the full drawing - the positions cannot drift. Callers must gate
 * on {@link INDUSTRY_EMISSIVE_TYPES}; an unglazed type draws nothing.
 */
export function drawIndustryEmissive(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  type: number,
  scale: ArtScale,
  litColour: string,
): void {
  industryWindows(ctx, view, scale, type, litColour);
}

/** Sanity: the table has to cover every type the simulation can produce. */
export const INDUSTRY_ART_COUNT = ART.length;

if (INDUSTRY_ART_COUNT !== INDUSTRY_TYPE_COUNT) {
  throw new Error(
    `industryArt: ${INDUSTRY_ART_COUNT} drawings for ${INDUSTRY_TYPE_COUNT} industry types`,
  );
}
