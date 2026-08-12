import { EDITOR_BRUSH_MAX_RADIUS, TerraformDirection } from '../../sim/constants';
import { CommandKind, type Command } from '../../sim/commands/types';

/**
 * The scenario workshop's palette (SPEC2 M22, bundle 2).
 *
 * The whole of bundle 1's argument comes to rest here: an editor that speaks
 * only commands needs an interface that speaks only commands, so this file
 * holds the ONE mapping from "which tool is armed and where did the author
 * click" to a `Command` - and nothing else in `src/ui/editor` builds one. That
 * makes the mapping a pure function over its inputs, which is what lets a
 * headless test drive every tool of the palette and read the queue entry it
 * would have produced.
 *
 * It is also what deletes the five `NO_UI_ISSUER` lines D-240 left behind with
 * a deadline: `tests/unit/commandCoupling.spec.ts` walks the interface sources
 * for `kind: CommandKind.X`, finds all five here, and now fails if any of them
 * is still on the allowlist.
 */

/** What a left click on the map does while the workshop is open. */
export type EditorTool =
  'none' | 'raiseRegion' | 'lowerRegion' | 'townSeed' | 'industry' | 'forest' | 'river';

export interface EditorToolEntry {
  readonly id: EditorTool;
  /**
   * What the button says.
   *
   * Four of the seven reuse the COMMAND's own name from bundle 1
   * (`editor.tool.place*`, `editor.tool.paint*`), so the button and the
   * refusal toast that follows a click on it use one word for one thing. The
   * terrain brush is the exception and has to be: one command kind, two
   * directions, two buttons.
   */
  readonly labelKey: string;
  /** What the tool does and costs - never the label again (the M14 rule). */
  readonly tooltipKey: string;
  /** Whether the brush-size row applies to this tool. */
  readonly sized: boolean;
}

export const EDITOR_TOOL_REGISTRY = [
  {
    id: 'none',
    labelKey: 'ui.editor.tool.select',
    tooltipKey: 'ui.editor.tip.select',
    sized: false,
  },
  {
    id: 'raiseRegion',
    labelKey: 'ui.editor.tool.raiseRegion',
    tooltipKey: 'ui.editor.tip.raiseRegion',
    sized: true,
  },
  {
    id: 'lowerRegion',
    labelKey: 'ui.editor.tool.lowerRegion',
    tooltipKey: 'ui.editor.tip.lowerRegion',
    sized: true,
  },
  {
    id: 'townSeed',
    labelKey: 'editor.tool.placeTownSeed',
    tooltipKey: 'ui.editor.tip.townSeed',
    sized: false,
  },
  {
    id: 'industry',
    labelKey: 'editor.tool.placeIndustryAt',
    tooltipKey: 'ui.editor.tip.industry',
    sized: false,
  },
  {
    id: 'forest',
    labelKey: 'editor.tool.paintForest',
    tooltipKey: 'ui.editor.tip.forest',
    sized: true,
  },
  {
    id: 'river',
    labelKey: 'editor.tool.paintRiver',
    tooltipKey: 'ui.editor.tip.river',
    sized: true,
  },
] as const satisfies readonly EditorToolEntry[];

type RegisteredEditorTool = (typeof EDITOR_TOOL_REGISTRY)[number]['id'];

/**
 * Compile-time coupling, the `tools.ts` pattern: an `EditorTool` the registry
 * has no row for turns this constant's type into the missing id.
 */
export const EDITOR_REGISTRY_COVERS_EVERY_TOOL: Exclude<
  EditorTool,
  RegisteredEditorTool
> extends never
  ? true
  : Exclude<EditorTool, RegisteredEditorTool> = true;

/** Every tool that writes something - the select pseudo-tool left out. */
export const EDITOR_BRUSH_TOOLS: readonly EditorToolEntry[] = EDITOR_TOOL_REGISTRY.filter(
  (entry) => entry.id !== 'none',
);

/**
 * The brush sizes the palette offers, in tiles of radius.
 *
 * **Generated from the command's own cap rather than typed out** (D-240): the
 * region cap binds on `TerraformBrushRegion`, `PaintForest` and `PaintRiver`
 * themselves, because a recorded log has to replay on a build whose palette
 * offers other sizes - so the palette derives its ladder from
 * `EDITOR_BRUSH_MAX_RADIUS` and can never offer a brush the queue would refuse.
 * A doubling ladder rather than every integer: 0, 1, 2, 4, 8 is one dab, a
 * hillock, a hill, a ridge and the largest region one command may name, and
 * seventeen buttons would be a scrollbar.
 */
export const EDITOR_BRUSH_RADII: readonly number[] = (() => {
  const radii: number[] = [0];
  for (let radius = 1; radius <= EDITOR_BRUSH_MAX_RADIUS; radius *= 2) radii.push(radius);
  return radii;
})();

/** The size a freshly opened workshop starts on - the smallest real brush. */
export const EDITOR_DEFAULT_BRUSH_RADIUS = 1;

/** Everything the palette holds besides the tool and the tile. */
export interface EditorToolOptions {
  /** Brush radius in tiles; ignored by the tools that place ONE thing. */
  readonly radius: number;
  /** `TownSize` value the town tool seeds. */
  readonly townSize: number;
  /** `IndustryType` value the industry tool sites. */
  readonly industryType: number;
}

/**
 * Turn an armed tool and a clicked tile into the command it issues, or null
 * for the select pseudo-tool.
 *
 * Every one of the five workshop kinds is built exactly here, once. The
 * radius is passed straight through and NOT clamped: a palette that quietly
 * shrank an oversized brush would hide the refusal the author is entitled to
 * see, and the cap is the command's to enforce (D-240).
 */
export function commandForEditorTool(
  tool: EditorTool,
  x: number,
  y: number,
  options: EditorToolOptions,
): Command | null {
  switch (tool) {
    case 'raiseRegion':
      return {
        kind: CommandKind.TerraformBrushRegion,
        x,
        y,
        radius: options.radius,
        direction: TerraformDirection.Raise,
      };
    case 'lowerRegion':
      return {
        kind: CommandKind.TerraformBrushRegion,
        x,
        y,
        radius: options.radius,
        direction: TerraformDirection.Lower,
      };
    case 'townSeed':
      return { kind: CommandKind.PlaceTownSeed, x, y, sizeClass: options.townSize };
    case 'industry':
      return { kind: CommandKind.PlaceIndustryAt, x, y, industryType: options.industryType };
    case 'forest':
      return { kind: CommandKind.PaintForest, x, y, radius: options.radius };
    case 'river':
      return { kind: CommandKind.PaintRiver, x, y, radius: options.radius };
    case 'none':
      return null;
  }
}
