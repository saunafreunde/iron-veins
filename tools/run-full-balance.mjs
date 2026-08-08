import { spawnSync } from 'node:child_process';

/**
 * `npm run test:balance:full` - the balance suite with EVERY desync twin.
 *
 * The twin of the two quarter-century AI scenarios is skipped by default
 * (tests/balance/determinism.ts explains the measured reason), and switching it
 * on is an environment variable. `VAR=value npm run ...` is a POSIX shell
 * idiom that neither cmd.exe nor PowerShell understands, and the project has no
 * cross-env dependency to paper over it, so the runner sets the variable itself
 * and hands the exit code straight back.
 */
const result = spawnSync('npx', ['vitest', 'run', 'tests/balance'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, IRON_VEINS_BALANCE_HASH: 'all' },
});

process.exit(result.status ?? 1);
