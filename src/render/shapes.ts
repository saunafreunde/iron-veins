/**
 * Isometric drawing primitives for the generated artwork.
 *
 * Section 16.2 forbids binary art, so every building in the game is drawn with
 * these at startup. They exist because one generic box was not enough: a town
 * of identical grey blocks and seventeen industries that differ only in tint
 * are not readable, which is the whole point of drawing them.
 *
 * Everything works in TILE SPACE and projects at the end. A shape says "two
 * tiles along u, one along v, twenty pixels tall" and does not care where the
 * cell is on the atlas or how the camera is set up - which is what makes a
 * chimney reusable between a power station and a steel mill.
 */

/** Tile-space to cell-space, relative to the tile centre. */
export interface IsoView {
  /** Cell x of the tile centre. */
  readonly cx: number;
  /** Cell y of the tile centre. */
  readonly cy: number;
  /** Half the width of one tile diamond, in cell pixels. */
  readonly halfW: number;
  /** Half the height of one tile diamond, in cell pixels. */
  readonly halfH: number;
}

/** Project a tile-space offset, lifted by `up` pixels. */
export function project(
  view: IsoView,
  u: number,
  v: number,
  up = 0,
): readonly [number, number] {
  return [view.cx + (u - v) * view.halfW, view.cy + (u + v) * view.halfH - up];
}

/** Multiply a hex colour by a factor, clamped to 8 bits. */
export function shade(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((value >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((value >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((value & 0xff) * factor));
  return `rgb(${r},${g},${b})`;
}

/**
 * How the three visible faces of a solid are lit.
 *
 * One light, from the north-west, and never changed: the whole point of fixed
 * lighting in an isometric game is that a roof is always the brightest thing
 * on a building, so the eye reads height without being told.
 */
export const FACE_TOP = 1.06;
export const FACE_LEFT = 0.74;
export const FACE_RIGHT = 0.52;

function fill(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  colour: string,
): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath();
  ctx.fill();
}

/**
 * A rectangular solid standing on the ground, `u` by `v` tiles and `height`
 * pixels tall, centred on `(offsetU, offsetV)`.
 *
 * Only three faces are ever drawn. The other three cannot be seen from a fixed
 * isometric camera, and drawing them would be work that changes no pixel.
 */
export function box(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly u: number;
    readonly v: number;
    readonly height: number;
    readonly colour: string;
    readonly offsetU?: number;
    readonly offsetV?: number;
    readonly base?: number;
  },
): void {
  const ou = spec.offsetU ?? 0;
  const ov = spec.offsetV ?? 0;
  const bottom = spec.base ?? 0;
  const top = bottom + spec.height;
  const hu = spec.u / 2;
  const hv = spec.v / 2;

  const p = (u: number, v: number, up: number): readonly [number, number] =>
    project(view, ou + u, ov + v, up);

  // Right face: the one looking east, at +u.
  fill(
    ctx,
    [p(hu, -hv, bottom), p(hu, hv, bottom), p(hu, hv, top), p(hu, -hv, top)],
    shade(spec.colour, FACE_RIGHT),
  );
  // Left face: the one looking south, at +v.
  fill(
    ctx,
    [p(-hu, hv, bottom), p(hu, hv, bottom), p(hu, hv, top), p(-hu, hv, top)],
    shade(spec.colour, FACE_LEFT),
  );
  // Roof.
  fill(
    ctx,
    [p(-hu, -hv, top), p(hu, -hv, top), p(hu, hv, top), p(-hu, hv, top)],
    shade(spec.colour, FACE_TOP),
  );
}

/**
 * A pitched roof over a footprint, ridged along the u axis.
 *
 * This is what separates a house from an office block at a glance, and it is
 * two triangles and two quads.
 */
export function gableRoof(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly u: number;
    readonly v: number;
    readonly base: number;
    readonly rise: number;
    readonly colour: string;
    readonly offsetU?: number;
    readonly offsetV?: number;
    readonly overhang?: number;
  },
): void {
  const ou = spec.offsetU ?? 0;
  const ov = spec.offsetV ?? 0;
  const over = spec.overhang ?? 0.06;
  const hu = spec.u / 2 + over;
  const hv = spec.v / 2 + over;
  const ridge = spec.base + spec.rise;

  const p = (u: number, v: number, up: number): readonly [number, number] =>
    project(view, ou + u, ov + v, up);

  // Two slopes meeting over the middle of the v axis.
  fill(
    ctx,
    [p(-hu, -hv, spec.base), p(hu, -hv, spec.base), p(hu, 0, ridge), p(-hu, 0, ridge)],
    shade(spec.colour, FACE_TOP),
  );
  fill(
    ctx,
    [p(-hu, 0, ridge), p(hu, 0, ridge), p(hu, hv, spec.base), p(-hu, hv, spec.base)],
    shade(spec.colour, FACE_LEFT),
  );
  // The gable end that faces the camera.
  fill(
    ctx,
    [p(hu, -hv, spec.base), p(hu, 0, ridge), p(hu, hv, spec.base)],
    shade(spec.colour, FACE_RIGHT * 0.92),
  );
}

/**
 * A saw-tooth roof: the north-light roof every real factory hall has, and the
 * fastest way to make a building read as "industrial" rather than "big".
 */
export function sawtoothRoof(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly u: number;
    readonly v: number;
    readonly base: number;
    readonly rise: number;
    readonly teeth: number;
    readonly colour: string;
    readonly glass: string;
    readonly offsetU?: number;
    readonly offsetV?: number;
  },
): void {
  const ou = spec.offsetU ?? 0;
  const ov = spec.offsetV ?? 0;
  const hu = spec.u / 2;
  const step = spec.v / spec.teeth;

  for (let i = 0; i < spec.teeth; i++) {
    const v0 = -spec.v / 2 + i * step;
    const v1 = v0 + step;
    const p = (u: number, v: number, up: number): readonly [number, number] =>
      project(view, ou + u, ov + v, up);

    // The sloping half.
    fill(
      ctx,
      [p(-hu, v0, spec.base), p(hu, v0, spec.base), p(hu, v1, spec.base + spec.rise), p(-hu, v1, spec.base + spec.rise)],
      shade(spec.colour, FACE_TOP),
    );
    // The glazed face looking north, which is why the roof has this shape.
    fill(
      ctx,
      [
        p(-hu, v1, spec.base + spec.rise),
        p(hu, v1, spec.base + spec.rise),
        p(hu, v1, spec.base),
        p(-hu, v1, spec.base),
      ],
      spec.glass,
    );
  }
}

/**
 * An upright cylinder: silo, tank, chimney, cooling tower.
 *
 * Drawn as an ellipse for the top and a body whose two halves are lit
 * differently, which is enough curvature at this size - a real shaded gradient
 * costs a canvas gradient per shape and is invisible at sixteen pixels.
 */
export function cylinder(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly radius: number;
    readonly height: number;
    readonly colour: string;
    readonly offsetU?: number;
    readonly offsetV?: number;
    readonly base?: number;
    /** Radius at the top, for a cooling tower's waist. Defaults to `radius`. */
    readonly topRadius?: number;
  },
): void {
  const ou = spec.offsetU ?? 0;
  const ov = spec.offsetV ?? 0;
  const bottom = spec.base ?? 0;
  const top = bottom + spec.height;
  const rTop = spec.topRadius ?? spec.radius;

  const centre = project(view, ou, ov, bottom);
  const topCentre = project(view, ou, ov, top);
  const rxBottom = spec.radius * view.halfW;
  const ryBottom = spec.radius * view.halfH;
  const rxTop = rTop * view.halfW;
  const ryTop = rTop * view.halfH;

  // Body: the silhouette between the two ellipses.
  ctx.fillStyle = shade(spec.colour, FACE_LEFT);
  ctx.beginPath();
  ctx.moveTo(centre[0] - rxBottom, centre[1]);
  ctx.lineTo(topCentre[0] - rxTop, topCentre[1]);
  ctx.lineTo(topCentre[0] + rxTop, topCentre[1]);
  ctx.lineTo(centre[0] + rxBottom, centre[1]);
  ctx.ellipse(centre[0], centre[1], rxBottom, ryBottom, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();

  // The lit half, a slice down the left side.
  ctx.fillStyle = shade(spec.colour, FACE_TOP * 0.92);
  ctx.beginPath();
  ctx.moveTo(centre[0] - rxBottom, centre[1]);
  ctx.lineTo(topCentre[0] - rxTop, topCentre[1]);
  ctx.lineTo(topCentre[0] - rxTop * 0.25, topCentre[1]);
  ctx.lineTo(centre[0] - rxBottom * 0.25, centre[1]);
  ctx.closePath();
  ctx.fill();

  // Lid.
  ctx.fillStyle = shade(spec.colour, FACE_TOP);
  ctx.beginPath();
  ctx.ellipse(topCentre[0], topCentre[1], rxTop, ryTop, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A lattice tower: the headframe over a mine shaft, an oil derrick, a pylon.
 *
 * Lines rather than solids, because a lattice that is drawn solid is just a
 * post - the gaps are the whole silhouette.
 */
export function lattice(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly width: number;
    readonly height: number;
    readonly colour: string;
    readonly offsetU?: number;
    readonly offsetV?: number;
    readonly taper?: number;
    readonly lineWidth: number;
  },
): void {
  const ou = spec.offsetU ?? 0;
  const ov = spec.offsetV ?? 0;
  const taper = spec.taper ?? 0.45;
  const half = spec.width / 2;
  const halfTop = half * taper;

  ctx.strokeStyle = spec.colour;
  ctx.lineWidth = spec.lineWidth;
  ctx.lineCap = 'round';

  const legs: ReadonlyArray<readonly [number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [su, sv] of legs) {
    const foot = project(view, ou + su * half, ov + sv * half, 0);
    const head = project(view, ou + su * halfTop, ov + sv * halfTop, spec.height);
    ctx.beginPath();
    ctx.moveTo(foot[0], foot[1]);
    ctx.lineTo(head[0], head[1]);
    ctx.stroke();
  }

  // Three bracing rings up the tower.
  for (let ring = 1; ring <= 3; ring++) {
    const t = ring / 4;
    const r = half + (halfTop - half) * t;
    const up = spec.height * t;
    ctx.beginPath();
    for (let i = 0; i < legs.length; i++) {
      const [su, sv] = legs[i]!;
      const point = project(view, ou + su * r, ov + sv * r, up);
      if (i === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

/** A conifer: a cone on a short trunk. Forestry, and nothing else. */
export function conifer(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly offsetU: number;
    readonly offsetV: number;
    readonly height: number;
    readonly radius: number;
  },
): void {
  const foot = project(view, spec.offsetU, spec.offsetV, 0);
  const tip = project(view, spec.offsetU, spec.offsetV, spec.height);
  const rx = spec.radius * view.halfW;

  ctx.fillStyle = '#5a4632';
  ctx.fillRect(foot[0] - rx * 0.14, foot[1] - spec.height * 0.22, rx * 0.28, spec.height * 0.22);

  for (let tier = 0; tier < 3; tier++) {
    const t = tier / 3;
    const y = foot[1] - spec.height * (0.2 + t * 0.62);
    const spread = rx * (1 - t * 0.45);
    ctx.fillStyle = shade('#2f6b3a', 1 + tier * 0.09);
    ctx.beginPath();
    ctx.moveTo(tip[0], y - spec.height * 0.3);
    ctx.lineTo(tip[0] + spread, y);
    ctx.lineTo(tip[0] - spread, y);
    ctx.closePath();
    ctx.fill();
  }
}

/** A loose heap of something: coal, ore, gravel, logs seen end-on. */
export function heap(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly offsetU: number;
    readonly offsetV: number;
    readonly radius: number;
    readonly height: number;
    readonly colour: string;
  },
): void {
  const foot = project(view, spec.offsetU, spec.offsetV, 0);
  const rx = spec.radius * view.halfW;
  const ry = spec.radius * view.halfH;

  ctx.fillStyle = shade(spec.colour, FACE_RIGHT);
  ctx.beginPath();
  ctx.ellipse(foot[0], foot[1], rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shade(spec.colour, FACE_TOP);
  ctx.beginPath();
  ctx.moveTo(foot[0] - rx, foot[1]);
  ctx.quadraticCurveTo(foot[0] - rx * 0.3, foot[1] - spec.height, foot[0], foot[1] - spec.height);
  ctx.quadraticCurveTo(foot[0] + rx * 0.3, foot[1] - spec.height, foot[0] + rx, foot[1]);
  ctx.closePath();
  ctx.fill();
}

/**
 * Rows of windows down the two visible faces of a block.
 *
 * The single cheapest thing that makes a box read as a building: without them
 * a town is a heap of crates, and they cost two nested loops.
 */
export function windows(
  ctx: CanvasRenderingContext2D,
  view: IsoView,
  spec: {
    readonly u: number;
    readonly v: number;
    readonly height: number;
    readonly rows: number;
    readonly columns: number;
    readonly colour: string;
    readonly offsetU?: number;
    readonly offsetV?: number;
  },
): void {
  const ou = spec.offsetU ?? 0;
  const ov = spec.offsetV ?? 0;
  const hu = spec.u / 2;
  const hv = spec.v / 2;
  ctx.fillStyle = spec.colour;

  for (let row = 0; row < spec.rows; row++) {
    const up = spec.height * ((row + 0.62) / (spec.rows + 0.3));
    for (let col = 0; col < spec.columns; col++) {
      const along = -0.5 + (col + 0.5) / spec.columns;

      // Right face, running along v.
      const a = project(view, ou + hu, ov + along * spec.v, up);
      ctx.fillRect(a[0] - view.halfW * 0.05, a[1] - view.halfH * 0.18, view.halfW * 0.1, view.halfH * 0.26);

      // Left face, running along u.
      const b = project(view, ou + along * spec.u, ov + hv, up);
      ctx.fillRect(b[0] - view.halfW * 0.05, b[1] - view.halfH * 0.18, view.halfW * 0.1, view.halfH * 0.26);
    }
  }
}
