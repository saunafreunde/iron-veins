import { useState, type ReactElement } from 'react';
import { t } from '../../i18n';
import {
  EDITOR_BRUSH_MAX_CELLS,
  EDITOR_BRUSH_MAX_RADIUS,
  SCENARIO_TEXT_MAX_CHARS,
} from '../../sim/constants';
import { INDUSTRY_SPECS } from '../../sim/industry/types';
import { TownSize } from '../../sim/town/types';
import { exportScenario } from '../../platform/Storage';
import type { SimClient } from '../SimClient';
import { Tooltip } from '../Tooltip';
import { useSimStore } from '../store';
import { EDITOR_OVERLAYS, type EditorOverlay } from './overlays';
import {
  EMPTY_SCENARIO_DRAFT,
  metaFromDraft,
  scenarioDraftRefusal,
  scenarioFileName,
  type ScenarioDraft,
} from './scenarioExport';
import { EDITOR_BRUSH_RADII, EDITOR_TOOL_REGISTRY } from './tools';

/**
 * The scenario workshop's palette (SPEC2 M22, bundle 2).
 *
 * Six tools, five brush sizes, four debug overlays and the export. Every
 * button on it does exactly one thing: put a value in the store. What a click
 * on the MAP then becomes is `commandForEditorTool`'s decision and nothing
 * else's, and what an overlay MEANS is `overlays.ts`'s - so this file holds no
 * rule at all, which is why the tests for this bundle are headless.
 *
 * Loaded lazily (the `GameEndScreen` pattern, D-192): a player who never opens
 * a workshop should not download one.
 */

/** The three size classes a town may be seeded at, with their captions. */
const TOWN_SIZES: readonly { readonly value: number; readonly key: string }[] = [
  { value: TownSize.City, key: 'ui.editor.townSize.city' },
  { value: TownSize.Town, key: 'ui.editor.townSize.town' },
  { value: TownSize.Village, key: 'ui.editor.townSize.village' },
];

const OVERLAY_LABEL_KEYS: Readonly<Record<EditorOverlay, string>> = {
  temperature: 'ui.editor.overlay.temperature',
  moisture: 'ui.editor.overlay.moisture',
  landmass: 'ui.editor.overlay.landmass',
  catchment: 'ui.editor.overlay.catchment',
};

export function EditorPanel({ client }: { readonly client: SimClient }): ReactElement {
  useSimStore((s) => s.locale);
  const tool = useSimStore((s) => s.editorTool);
  const setTool = useSimStore((s) => s.setEditorTool);
  const radius = useSimStore((s) => s.editorRadius);
  const setRadius = useSimStore((s) => s.setEditorRadius);
  const townSize = useSimStore((s) => s.editorTownSize);
  const setTownSize = useSimStore((s) => s.setEditorTownSize);
  const industryType = useSimStore((s) => s.editorIndustryType);
  const setIndustryType = useSimStore((s) => s.setEditorIndustryType);
  const overlay = useSimStore((s) => s.editorOverlay);
  const setOverlay = useSimStore((s) => s.setEditorOverlay);

  const [draft, setDraft] = useState<ScenarioDraft>(EMPTY_SCENARIO_DRAFT);
  const refusal = scenarioDraftRefusal(draft);
  const sized = EDITOR_TOOL_REGISTRY.find((entry) => entry.id === tool)?.sized === true;

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.editor.title')}</h2>

      <div className="button-row">
        {EDITOR_TOOL_REGISTRY.map((entry) => (
          <Tooltip key={entry.id} textKey={entry.tooltipKey}>
            <button
              type="button"
              className={entry.id === tool ? 'button button--active' : 'button'}
              onClick={() => setTool(entry.id)}
            >
              {t(entry.labelKey)}
            </button>
          </Tooltip>
        ))}
      </div>

      {sized && (
        <>
          <span className="field__label field__label--spaced">{t('ui.editor.brush')}</span>
          <div className="button-row">
            {EDITOR_BRUSH_RADII.map((option) => (
              <button
                key={option}
                type="button"
                className={option === radius ? 'button button--active' : 'button'}
                onClick={() => setRadius(option)}
              >
                {option * 2 + 1}
              </button>
            ))}
          </div>
          {/* The cap is the COMMAND's and the palette says so rather than
              hiding it: a log recorded here has to replay on a build whose
              palette offers other sizes (D-240). */}
          <p className="panel__hint">
            {t('ui.editor.brushHint', {
              radius: EDITOR_BRUSH_MAX_RADIUS,
              cells: EDITOR_BRUSH_MAX_CELLS,
            })}
          </p>
        </>
      )}

      {tool === 'townSeed' && (
        <>
          <span className="field__label field__label--spaced">{t('ui.editor.townSize')}</span>
          <div className="button-row">
            {TOWN_SIZES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={entry.value === townSize ? 'button button--active' : 'button'}
                onClick={() => setTownSize(entry.value)}
              >
                {t(entry.key)}
              </button>
            ))}
          </div>
        </>
      )}

      {tool === 'industry' && (
        <label className="field">
          <span className="field__label">{t('ui.editor.industryType')}</span>
          <select
            className="list__search"
            value={String(industryType)}
            onChange={(event) => setIndustryType(Number.parseInt(event.target.value, 10))}
          >
            {INDUSTRY_SPECS.map((spec) => (
              <option key={spec.type} value={String(spec.type)}>
                {t(spec.nameKey)}
              </option>
            ))}
          </select>
        </label>
      )}

      {tool === 'river' && <p className="panel__hint">{t('ui.editor.riverHint')}</p>}

      <span className="field__label field__label--spaced">{t('ui.editor.overlays')}</span>
      <div className="button-row">
        <button
          type="button"
          className={overlay === null ? 'button button--active' : 'button'}
          onClick={() => setOverlay(null)}
        >
          {t('ui.editor.overlay.off')}
        </button>
        {EDITOR_OVERLAYS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={kind === overlay ? 'button button--active' : 'button'}
            onClick={() => setOverlay(kind === overlay ? null : kind)}
          >
            {t(OVERLAY_LABEL_KEYS[kind])}
          </button>
        ))}
      </div>
      {overlay === 'landmass' && <p className="panel__hint">{t('ui.editor.landmassHint')}</p>}
      {overlay === 'moisture' && <p className="panel__hint">{t('ui.editor.moistureHint')}</p>}

      <span className="field__label field__label--spaced">{t('ui.editor.export')}</span>
      <label className="field">
        <span className="field__label">{t('ui.editor.exportTitle')}</span>
        <input
          className="list__search"
          value={draft.title}
          maxLength={60}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">{t('ui.editor.exportAuthor')}</span>
        <input
          className="list__search"
          value={draft.author}
          maxLength={60}
          onChange={(event) => setDraft({ ...draft, author: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">{t('ui.editor.exportBriefingDe')}</span>
        <textarea
          className="list__search"
          rows={3}
          maxLength={SCENARIO_TEXT_MAX_CHARS}
          value={draft.briefingDe}
          onChange={(event) => setDraft({ ...draft, briefingDe: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">{t('ui.editor.exportBriefingEn')}</span>
        <textarea
          className="list__search"
          rows={3}
          maxLength={SCENARIO_TEXT_MAX_CHARS}
          value={draft.briefingEn}
          onChange={(event) => setDraft({ ...draft, briefingEn: event.target.value })}
        />
      </label>
      {refusal !== null && (
        <p className="panel__hint value--danger">{t(refusal, { max: SCENARIO_TEXT_MAX_CHARS })}</p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button button--active"
          disabled={refusal !== null}
          onClick={() => {
            // The bytes are the WORKER's - one serializer, one parser, one
            // migration chain. This side only says where they go, and the
            // name is a function of the title the author typed.
            const name = scenarioFileName(draft.title);
            client.onScenarioWritten = (message) => {
              void exportScenario(name, message.bytes);
            };
            client.exportScenario(metaFromDraft(draft, useSimStore.getState().tick));
          }}
        >
          {t('ui.editor.exportButton')}
        </button>
      </div>
    </section>
  );
}
