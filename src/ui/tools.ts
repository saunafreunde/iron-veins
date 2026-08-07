import type { Tool } from './store';

/**
 * The ONE tool registry (SPEC2 M14).
 *
 * The toolbar renders it, the tooltip coupling test walks it, and the
 * compile-time check below proves it covers every member of the `Tool`
 * union - so "all 22 tools carry a tooltip" (the M14 Fertig-wenn) is
 * enumerated from here, never counted by hand. A new tool without a
 * registry row fails the build twice: the type check here, the key check
 * in `tests/unit/tooltips.spec.ts`.
 */

export interface ToolRegistryEntry {
  readonly id: Tool;
  /** What the button says. */
  readonly labelKey: string;
  /** What the tool does and costs - never the label again (M14). */
  readonly tooltipKey: string;
}

export const TOOL_REGISTRY = [
  { id: 'none', labelKey: 'ui.tool.select', tooltipKey: 'ui.tooltip.tool.none' },
  { id: 'road', labelKey: 'ui.tool.road', tooltipKey: 'ui.tooltip.tool.road' },
  { id: 'track', labelKey: 'ui.tool.track', tooltipKey: 'ui.tooltip.tool.track' },
  { id: 'connect', labelKey: 'ui.tool.connect', tooltipKey: 'ui.tooltip.tool.connect' },
  { id: 'stop', labelKey: 'ui.tool.stop', tooltipKey: 'ui.tooltip.tool.stop' },
  { id: 'depot', labelKey: 'ui.tool.depot', tooltipKey: 'ui.tooltip.tool.depot' },
  { id: 'platform', labelKey: 'ui.tool.platform', tooltipKey: 'ui.tooltip.tool.platform' },
  { id: 'raildepot', labelKey: 'ui.tool.railDepot', tooltipKey: 'ui.tooltip.tool.raildepot' },
  { id: 'quay', labelKey: 'ui.tool.quay', tooltipKey: 'ui.tooltip.tool.quay' },
  { id: 'airstrip', labelKey: 'ui.tool.airstrip', tooltipKey: 'ui.tooltip.tool.airstrip' },
  { id: 'airport', labelKey: 'ui.tool.airport', tooltipKey: 'ui.tooltip.tool.airport' },
  {
    id: 'intlairport',
    labelKey: 'ui.tool.intlAirport',
    tooltipKey: 'ui.tooltip.tool.intlairport',
  },
  { id: 'shipdepot', labelKey: 'ui.tool.shipDepot', tooltipKey: 'ui.tooltip.tool.shipdepot' },
  {
    id: 'freightterminal',
    labelKey: 'ui.tool.freightTerminal',
    tooltipKey: 'ui.tooltip.tool.freightterminal',
  },
  { id: 'canopy', labelKey: 'ui.tool.canopy', tooltipKey: 'ui.tooltip.tool.canopy' },
  { id: 'coldstore', labelKey: 'ui.tool.coldStore', tooltipKey: 'ui.tooltip.tool.coldstore' },
  { id: 'signal', labelKey: 'ui.tool.signal', tooltipKey: 'ui.tooltip.tool.signal' },
  { id: 'pathsignal', labelKey: 'ui.tool.pathSignal', tooltipKey: 'ui.tooltip.tool.pathsignal' },
  { id: 'waypoint', labelKey: 'ui.tool.waypoint', tooltipKey: 'ui.tooltip.tool.waypoint' },
  { id: 'demolish', labelKey: 'ui.tool.demolish', tooltipKey: 'ui.tooltip.tool.demolish' },
  { id: 'raise', labelKey: 'ui.tool.raise', tooltipKey: 'ui.tooltip.tool.raise' },
  { id: 'lower', labelKey: 'ui.tool.lower', tooltipKey: 'ui.tooltip.tool.lower' },
  { id: 'level', labelKey: 'ui.tool.level', tooltipKey: 'ui.tooltip.tool.level' },
] as const satisfies readonly ToolRegistryEntry[];

type RegisteredTool = (typeof TOOL_REGISTRY)[number]['id'];

/**
 * Compile-time coupling: a `Tool` union member missing from the registry
 * turns this constant's type into the missing id and the assignment fails.
 */
export const TOOL_REGISTRY_COVERS_EVERY_TOOL: Exclude<Tool, RegisteredTool> extends never
  ? true
  : Exclude<Tool, RegisteredTool> = true;

/**
 * The 22 build tools of the M14 Fertig-wenn - everything except the select
 * pseudo-tool, which builds nothing (it has a tooltip all the same).
 */
export const BUILD_TOOLS: readonly ToolRegistryEntry[] = TOOL_REGISTRY.filter(
  (entry) => entry.id !== 'none',
);
