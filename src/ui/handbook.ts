/**
 * The in-game handbook of section 17.5.
 *
 * Every entry is a pair of translation keys and, where it helps, a small
 * diagram drawn as text. The diagrams are deliberately monospaced ASCII rather
 * than images: a signal scheme has to be readable at any UI scale, has to
 * survive being translated, and has to live in the repository without a binary
 * asset - and a track plan is exactly the kind of picture that ASCII draws
 * well.
 */

export interface HandbookEntry {
  readonly id: string;
  readonly titleKey: string;
  readonly bodyKey: string;
  /** Monospaced figure, or ''. Not translated: it is a diagram, not prose. */
  readonly diagram: string;
}

export const HANDBOOK_CHAPTERS: readonly string[] = [
  'ui.handbook.chapter.basics',
  'ui.handbook.chapter.building',
  'ui.handbook.chapter.signals',
  'ui.handbook.chapter.cargo',
  'ui.handbook.chapter.money',
];

export const HANDBOOK: readonly HandbookEntry[] = [
  // ------------------------------------------------------------------ basics
  {
    id: 'time',
    titleKey: 'ui.handbook.time.title',
    bodyKey: 'ui.handbook.time.body',
    diagram: '',
  },
  {
    id: 'camera',
    titleKey: 'ui.handbook.camera.title',
    bodyKey: 'ui.handbook.camera.body',
    diagram: '',
  },
  {
    id: 'firstLine',
    titleKey: 'ui.handbook.firstLine.title',
    bodyKey: 'ui.handbook.firstLine.body',
    diagram: '',
  },

  // ---------------------------------------------------------------- building
  {
    id: 'assistant',
    titleKey: 'ui.handbook.assistant.title',
    bodyKey: 'ui.handbook.assistant.body',
    diagram: '',
  },
  {
    id: 'gradients',
    titleKey: 'ui.handbook.gradients.title',
    bodyKey: 'ui.handbook.gradients.body',
    diagram: [
      '  height +1 ______',
      '        /        \\        one level over one tile is 160 per mille -',
      '  ____/            \\____  far past what any rail type will climb.',
      '',
      '  height +1        ______',
      '        /--------/        spread over eight tiles it is 20 per mille,',
      '  ____/                   which plain track takes at full speed.',
    ].join('\n'),
  },
  {
    id: 'stations',
    titleKey: 'ui.handbook.stations.title',
    bodyKey: 'ui.handbook.stations.body',
    diagram: [
      '   [ ]  bus stop        4 tiles apart or less and they are',
      '   [=]  platform        ONE station with one cargo pool -',
      '   [~]  quay            which is how a lorry feeds a train.',
      '   [+]  crane',
    ].join('\n'),
  },

  // ----------------------------------------------------------------- signals
  {
    id: 'blockSignal',
    titleKey: 'ui.handbook.blockSignal.title',
    bodyKey: 'ui.handbook.blockSignal.body',
    diagram: [
      '  ===|=========|=========|===',
      '     S1        S2        S3',
      '',
      '  A train claims the whole section ahead of it, or waits.',
      '  Two signals, two sections, two trains on one line.',
    ].join('\n'),
  },
  {
    id: 'passingLoop',
    titleKey: 'ui.handbook.passingLoop.title',
    bodyKey: 'ui.handbook.passingLoop.body',
    diagram: [
      '            /---|---\\',
      '  ===|=====<         >=====|===',
      '            \\---|---/',
      '',
      '  A signal immediately past each merge. Without them the loop',
      '  is one section and only one train can be in it.',
    ].join('\n'),
  },
  {
    id: 'pathSignal',
    titleKey: 'ui.handbook.pathSignal.title',
    bodyKey: 'ui.handbook.pathSignal.body',
    diagram: [
      '                  /=== [=====] platform 1',
      '  ======|P======<',
      '                  \\=== [=====] platform 2',
      '',
      '  A path signal lets a train in as soon as ITS route through',
      '  the throat is clear, rather than the whole throat.',
    ].join('\n'),
  },
  {
    id: 'deadlock',
    titleKey: 'ui.handbook.deadlock.title',
    bodyKey: 'ui.handbook.deadlock.body',
    diagram: [
      '  ==>|=================|<==',
      '      A               B',
      '',
      '  Two trains nose to nose on single track. Neither can give',
      '  its section back. Build a loop, or make the line one way.',
    ].join('\n'),
  },

  // ------------------------------------------------------------------- cargo
  {
    id: 'chains',
    titleKey: 'ui.handbook.chains.title',
    bodyKey: 'ui.handbook.chains.body',
    diagram: [
      '  forest --wood--> sawmill --planks--> furniture works --goods--> town',
      '  coal mine --coal--> power plant',
      '  farm --grain--> food factory --food--> town',
    ].join('\n'),
  },
  {
    id: 'collection',
    titleKey: 'ui.handbook.collection.title',
    bodyKey: 'ui.handbook.collection.body',
    diagram: '',
  },
  {
    id: 'decay',
    titleKey: 'ui.handbook.decay.title',
    bodyKey: 'ui.handbook.decay.body',
    diagram: '',
  },
  {
    id: 'transfer',
    titleKey: 'ui.handbook.transfer.title',
    bodyKey: 'ui.handbook.transfer.body',
    diagram: '',
  },

  // ------------------------------------------------------------------- money
  {
    id: 'revenue',
    titleKey: 'ui.handbook.revenue.title',
    bodyKey: 'ui.handbook.revenue.body',
    diagram: '',
  },
  {
    id: 'upkeep',
    titleKey: 'ui.handbook.upkeep.title',
    bodyKey: 'ui.handbook.upkeep.body',
    diagram: '',
  },
  {
    id: 'council',
    titleKey: 'ui.handbook.council.title',
    bodyKey: 'ui.handbook.council.body',
    diagram: '',
  },
  {
    id: 'carbon',
    titleKey: 'ui.handbook.carbon.title',
    bodyKey: 'ui.handbook.carbon.body',
    diagram: '',
  },
];

/** Which chapter each entry belongs to, by index into HANDBOOK_CHAPTERS. */
export const HANDBOOK_CHAPTER_OF: readonly number[] = [
  0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4,
];
