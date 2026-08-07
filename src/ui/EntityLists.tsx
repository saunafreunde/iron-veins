import type { ReactElement } from 'react';
import { formatMoney, t } from '../i18n';
import type { IndustryMarker, StationMarker, TownMarker } from '../shared/protocol';
import {
  COUNCIL_REFUSAL_RATING,
  INDUSTRY_CLOSURE_MONTHS,
  INDUSTRY_WARNING_MONTHS,
} from '../sim/constants';
import { INDUSTRY_SPECS } from '../sim/industry/types';
import { vehicleSpec } from '../sim/vehicles/catalog';
import { VehicleState, VEHICLE_STATE_KEYS } from '../sim/vehicles/VehicleStore';
import { ListPanel, type Column } from './ListPanel';
import { useSimStore } from './store';

/**
 * Four of the five entity lists of section 17.1, each one a `ListPanel` with
 * its own columns. The fifth - the LINE list of section 12.2, on the L key -
 * lives in LinePanel.tsx, because it carries a detail panel and an editor
 * beside the list.
 */

export function StationList(): ReactElement {
  useSimStore((s) => s.locale);
  const stations = useSimStore((s) => s.stations);
  const centre = useSimStore((s) => s.centreOnTile);

  const columns: ReadonlyArray<Column<StationMarker>> = [
    { key: 'name', labelKey: 'ui.list.name', render: (s) => s.name, sortBy: (s) => s.name },
    {
      key: 'rating',
      labelKey: 'ui.station.rating',
      render: (s) => `${s.rating}`,
      sortBy: (s) => s.rating,
      className: (s) => (s.rating < 40 ? 'row__meta value--warning' : 'row__meta'),
    },
    {
      key: 'waiting',
      labelKey: 'ui.station.waiting',
      render: (s) => `${s.waiting}`,
      sortBy: (s) => s.waiting,
    },
    {
      key: 'modules',
      labelKey: 'ui.station.modules',
      render: (s) => `${s.modules.length}`,
      sortBy: (s) => s.modules.length,
    },
  ];

  return (
    <ListPanel
      titleKey="ui.list.stations"
      rows={stations}
      columns={columns}
      idOf={(s) => s.id}
      searchText={(s) => s.name}
      onSelect={(s) => centre(s.x, s.y)}
      filters={[
        {
          key: 'poor',
          labelKey: 'ui.list.poorlyRated',
          matches: (s) => s.rating < 40,
        },
        { key: 'busy', labelKey: 'ui.list.hasWaiting', matches: (s) => s.waiting > 0 },
      ]}
    />
  );
}

export function TownList(): ReactElement {
  useSimStore((s) => s.locale);
  const towns = useSimStore((s) => s.towns);
  const centre = useSimStore((s) => s.centreOnTile);

  const columns: ReadonlyArray<Column<TownMarker>> = [
    { key: 'name', labelKey: 'ui.list.name', render: (town) => town.name, sortBy: (t) => t.name },
    {
      key: 'population',
      labelKey: 'ui.town.population',
      render: (town) => `${town.population}`,
      sortBy: (town) => town.population,
    },
    {
      key: 'council',
      labelKey: 'ui.council.rating',
      render: (town) => `${town.councilRating}`,
      sortBy: (town) => town.councilRating,
      className: (town) =>
        town.councilRating < COUNCIL_REFUSAL_RATING ? 'row__meta value--danger' : 'row__meta',
    },
    {
      key: 'where',
      labelKey: 'ui.tile.position',
      render: (town) => `${town.x}, ${town.y}`,
    },
  ];

  return (
    <ListPanel
      titleKey="ui.list.towns"
      filters={[
        {
          key: 'refusing',
          labelKey: 'ui.list.refusing',
          matches: (town) => town.councilRating < COUNCIL_REFUSAL_RATING,
        },
      ]}
      rows={towns}
      columns={columns}
      idOf={(town) => town.id}
      searchText={(town) => town.name}
      onSelect={(town) => centre(town.x, town.y)}
    />
  );
}

export function IndustryList(): ReactElement {
  useSimStore((s) => s.locale);
  const industries = useSimStore((s) => s.industries);
  const centre = useSimStore((s) => s.centreOnTile);

  const nameOf = (industry: IndustryMarker): string =>
    t(INDUSTRY_SPECS[industry.type]?.nameKey ?? '');

  const columns: ReadonlyArray<Column<IndustryMarker>> = [
    { key: 'name', labelKey: 'ui.list.name', render: nameOf, sortBy: nameOf },
    {
      key: 'level',
      labelKey: 'ui.industry.level',
      render: (i) => `${i.level} %`,
      sortBy: (i) => i.level,
    },
    {
      key: 'stock',
      labelKey: 'ui.industry.stock',
      render: (i) => `${i.stock}`,
      sortBy: (i) => i.stock,
    },
    {
      key: 'service',
      labelKey: 'ui.industry.service',
      render: (i) => `${i.service} %`,
      sortBy: (i) => i.service,
      className: (i) => (i.service < 50 ? 'row__meta value--warning' : 'row__meta'),
    },
  ];

  return (
    <ListPanel
      titleKey="ui.list.industries"
      rows={industries}
      columns={columns}
      idOf={(i) => i.id}
      searchText={nameOf}
      onSelect={(i) => centre(i.x, i.y)}
      filters={[
        {
          key: 'atRisk',
          labelKey: 'ui.list.atRisk',
          matches: (i) => i.open && i.neglectedMonths >= INDUSTRY_WARNING_MONTHS[0]!,
        },
        { key: 'closed', labelKey: 'ui.industry.closed', matches: (i) => !i.open },
      ]}
    />
  );
}

export function VehicleList(): ReactElement {
  useSimStore((s) => s.locale);
  const fleet = useSimStore((s) => s.fleet);
  const selectedVehicleId = useSimStore((s) => s.selectedVehicleId);
  const setSelectedVehicle = useSimStore((s) => s.setSelectedVehicle);

  const nameOf = (id: number): string => t(vehicleSpec(id).nameKey);

  const columns = [
    {
      key: 'name',
      labelKey: 'ui.list.name',
      render: (v: { specId: number }) => nameOf(v.specId),
      sortBy: (v: { specId: number }) => nameOf(v.specId),
    },
    {
      key: 'state',
      labelKey: 'ui.list.state',
      render: (v: { state: number }) => t(VEHICLE_STATE_KEYS[v.state] ?? ''),
      sortBy: (v: { state: number }) => v.state,
    },
    {
      key: 'load',
      labelKey: 'ui.list.load',
      render: (v: { cargoUnits: number; capacity: number }) => `${v.cargoUnits}/${v.capacity}`,
      sortBy: (v: { cargoUnits: number; capacity: number }) =>
        v.capacity > 0 ? v.cargoUnits / v.capacity : 0,
    },
    {
      key: 'earned',
      labelKey: 'ui.list.earned',
      render: (v: { earnedCt: number }) => formatMoney(v.earnedCt),
      sortBy: (v: { earnedCt: number }) => v.earnedCt,
    },
  ];

  return (
    <ListPanel
      titleKey="ui.list.vehicles"
      rows={fleet}
      columns={columns}
      idOf={(v) => v.id}
      searchText={(v) => nameOf(v.specId)}
      onSelect={(v) => setSelectedVehicle(v.id)}
      selectedId={selectedVehicleId}
      filters={[
        {
          key: 'idle',
          labelKey: 'ui.list.idle',
          matches: (v) => v.state === VehicleState.Stopped || v.state === VehicleState.NoRoute,
        },
        { key: 'stuck', labelKey: 'ui.list.stuck', matches: (v) => v.waitingTicks > 0 },
      ]}
    />
  );
}

/** Months an industry has left, for the list's warning column. */
export function monthsLeft(industry: IndustryMarker): number {
  return INDUSTRY_CLOSURE_MONTHS - industry.neglectedMonths;
}
