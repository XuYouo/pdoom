/**
 * `pnpm gallery:check` — validates every prompt and generation, the way CI
 * does on a pull request. Exit code 1 on any error; warnings are printed but
 * do not fail.
 */
import { inspectGallery } from './load.ts';

const root = process.argv[2];
const { gallery, problems } = inspectGallery(root);
const errors = problems.filter((problem) => problem.level === 'error');
const warnings = problems.filter((problem) => problem.level === 'warning');

for (const problem of [...errors, ...warnings]) {
  const mark = problem.level === 'error' ? '✗' : '!';
  console.log(`${mark} ${problem.where}\n    ${problem.message}`);
}

const ranked = gallery.benchmarks.reduce((sum, benchmark) => sum + benchmark.cells.length, 0);
console.log(
  `\n${gallery.prompts.length} prompt(s), ${gallery.generations.length} valid generation(s), ${gallery.packs.length} pack(s), ` +
    `${ranked} benchmark cell(s) — ${errors.length} error(s), ${warnings.length} warning(s)`,
);

process.exitCode = errors.length > 0 ? 1 : 0;
