import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Architecture law #3 forbids engine-dependent Math functions inside the
 * simulation. Only + - * / and Math.sqrt are bit-exact per IEEE-754/ECMA-262;
 * everything below is implementation defined and would silently desync saves,
 * replays and (later) multiplayer. Trigonometry goes through src/sim/math.ts.
 */
const ENGINE_DEPENDENT_MATH = [
  'random',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'pow',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'cbrt',
  'hypot',
  'fround',
];

/** Globals that leak wall-clock time, host state or non-determinism into the sim. */
const NON_DETERMINISTIC_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'performance',
  'Date',
  'navigator',
  'fetch',
  'crypto',
  'indexedDB',
  'location',
  'alert',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'console',
];

/**
 * Syntax restrictions shared by every file of the simulation core. Kept in
 * one list because flat config replaces a rule wholesale: the RNG stream
 * discipline block below has to restate these to add its own selector on top.
 */
const SIM_CORE_SYNTAX = [
  {
    selector: 'ForInStatement',
    message:
      'Architecture law #3: for...in enumeration order is not part of the deterministic contract.',
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message: 'Architecture law #3: wall-clock time must not enter the simulation.',
  },
  {
    selector: "CallExpression[callee.property.name='sort'][arguments.length=0]",
    message:
      'sort() without a total comparator is engine dependent. Always compare by a unique tie breaker (id) last.',
  },
];

/**
 * Z3 (SPEC2): every stochastic system draws from `world.streamFor(salt)`. A
 * new draw on the shared gameplay stream moves every later roll in the game -
 * adding tenders that way turned balancing scenario 3 red (DECISIONS.md
 * D-106). Like the law #1 import ban this is a tripwire, not a proof: an
 * alias would slip past it, and review catches that.
 */
const RAW_GAMEPLAY_RNG = {
  selector: "MemberExpression[object.name='world'][property.name='rng']",
  message:
    'Z3 / D-106: draw from world.streamFor(salt), never from the shared gameplay stream - a new draw here moves every later roll in the game. The pre-existing draw sites are allowlisted in eslint.config.js.',
};

/**
 * The draw sites that predate `streamFor` and must keep the shared stream:
 * moving them onto a derived stream would itself send every existing seed
 * down a different future (the exact accident Z3 exists to prevent).
 */
const RAW_GAMEPLAY_RNG_ALLOWLIST = [
  // Save, load and hashWorld capture and restore the stream's state.
  'src/sim/World.ts',
  // Breakdown rolls - gameplay draws since M6; modulation only ever happens
  // by threshold shift at an identical draw count (Z3).
  'src/sim/vehicles/lifecycle.ts',
  // Industry spawn rolls - gameplay draws since M5.
  'src/sim/industry/lifecycle.ts',
];

/** Modules the simulation must never reach for (architecture law #1). */
const RENDER_SIDE_MODULES = [
  'pixi.js',
  'pixi.js/*',
  'react',
  'react-dom',
  'react/*',
  'react-dom/*',
  'react/jsx-runtime',
  'zustand',
  'zustand/*',
  '@tauri-apps/*',
  '**/render/**',
  '**/ui/**',
  '**/platform/**',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src-tauri/**',
      'coverage/**',
      'src/assets/**',
      '*.tsbuildinfo',
      // Tool-managed session worktrees: full checkouts that would otherwise
      // be linted twice (and with the wrong project root).
      '.claude/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------- baseline
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Section 24 of the master prompt: no leftovers of any kind in the repo.
      'no-warning-comments': [
        'error',
        { terms: ['todo', 'fixme', 'xxx', 'hack', 'not implemented'], location: 'anywhere' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='sort'][arguments.length=0]",
          message:
            'sort() without a total comparator is engine dependent. Always compare by a unique tie breaker (id) last.',
        },
      ],
    },
  },

  // ------------------------------------------------------------ browser code
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // ---------------------------------------------------- node-side tooling
  {
    files: ['tests/**/*.ts', 'tools/**/*.{ts,mjs}', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // ------------------------------------------- platform isolation (section 2)
  // Must come before the src/sim blocks: flat config lets later blocks replace
  // a rule entirely, so the stricter sim restriction has to win.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message:
                'Shell access goes through src/platform/Platform.ts so the desktop shell stays swappable.',
            },
          ],
        },
      ],
    },
  },

  // ------------------------------------------- law #1: sim never sees render
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: RENDER_SIDE_MODULES,
              message:
                'Architecture law #1: src/sim must not import rendering, UI or platform code.',
            },
          ],
        },
      ],
    },
  },

  // ------------------------------- laws #3/#4: deterministic simulation core
  // SimWorker.ts is the scheduler shell around the core. It is the only file
  // under src/sim that may touch wall-clock time and worker globals; it holds
  // no simulation state itself.
  {
    files: ['src/sim/**/*.ts'],
    ignores: ['src/sim/SimWorker.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...NON_DETERMINISTIC_GLOBALS.map((name) => ({
          name,
          message: `Architecture law #3: "${name}" is not available inside the deterministic simulation core.`,
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...ENGINE_DEPENDENT_MATH.map((property) => ({
          object: 'Math',
          property,
          message: `Architecture law #4: Math.${property} is not bit-exact across engines. Use src/sim/math.ts.`,
        })),
      ],
      'no-restricted-syntax': ['error', ...SIM_CORE_SYNTAX],
    },
  },

  // -------------------------- Z3: RNG stream discipline (SPEC2 M10, D-106)
  // Replaces the block above's no-restricted-syntax for every sim file NOT on
  // the allowlist, adding the raw-draw tripwire on top of the core selectors;
  // the allowlisted files keep the core selectors from the block above.
  {
    files: ['src/sim/**/*.ts'],
    ignores: ['src/sim/SimWorker.ts', ...RAW_GAMEPLAY_RNG_ALLOWLIST],
    rules: {
      'no-restricted-syntax': ['error', ...SIM_CORE_SYNTAX, RAW_GAMEPLAY_RNG],
    },
  },

  // ------------------------------------------- the service-worker shim (E-13)
  // `public/` is served verbatim, so the COOP/COEP shim of SPEC2 M25 is plain
  // JavaScript running in a service worker rather than a module vite builds.
  // It is linted like everything else; it just lives in a different global
  // scope, where `self`, `fetch`, `Headers` and `Response` are the vocabulary.
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },

  prettier,
);
