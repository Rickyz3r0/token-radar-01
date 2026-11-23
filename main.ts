// Entrypoint for token-radar-01 (Node 22, standard library only).
// Reads the sealed DefiLlama protocol snapshot from /input/snapshot.json (or --input <path>),
// executes the deterministic pre-token valuation model and 6-step farming planner in lib/model.ts,
// writes /output/board.json and /output/data.js, copies dashboard/ and screenshots/ to /output,
// and generates /output/dossier.json via vendor/makefun-board.ts.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const VALID_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function resolveArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1]!;
  }
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  return inline === undefined ? fallback : inline.slice(flag.length + 1);
}

const inputArg = resolveArg('input', '/input');
const inputPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputPath)) {
  process.stderr.write(`token-radar-01: snapshot not found at ${inputPath}\n`);
  process.exit(2);
}

const outputDir = resolveArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const validationError = boardIssue(board, snapshot);
if (validationError !== null) {
  process.stderr.write(`token-radar-01: board validation failed: ${validationError}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  join(outputDir, 'board.json'),
  `${JSON.stringify({
    as_of: snapshot.as_of,
    model_version: radar.model_version,
    watchlist_covered: radar.watchlist_size,
    total_rows: radar.board_size,
    rows: board,
  })}\n`,
);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

function copyPlainDirectory(srcDir: string, dstDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  mkdirSync(dstDir, { recursive: true });
  const names = readdirSync(srcDir).sort();
  const copied: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const srcPath = join(srcDir, name);
    if (!statSync(srcPath).isFile()) continue;
    copyFileSync(srcPath, join(dstDir, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyPlainDirectory(join(rootDir, 'dashboard'), join(outputDir, 'dashboard'));
for (const name of dashFiles) {
  if (!VALID_NAME.test(name)) {
    process.stderr.write(`token-radar-01: invalid dashboard filename ${name}\n`);
    process.exit(1);
  }
  const content = readFileSync(join(outputDir, 'dashboard', name), 'utf8');
  if (/https?:\/\//i.test(content)) {
    process.stderr.write(`token-radar-01: dashboard/${name} contains an external http(s) URL\n`);
    process.exit(1);
  }
}

const shotFiles = copyPlainDirectory(join(rootDir, 'screenshots'), join(outputDir, 'screenshots'));

if (shotFiles.length < 3 || shotFiles.length > 4) {
  process.stderr.write(`token-radar-01: expected 3..4 screenshots, found ${shotFiles.length}\n`);
  process.exit(1);
}
for (const name of shotFiles) {
  if (!VALID_NAME.test(name)) {
    process.stderr.write(`token-radar-01: invalid screenshot filename ${name}\n`);
    process.exit(1);
  }
}

const dossierBytes = buildDossier(outputDir, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: DASHBOARD_CAPS,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);

process.stdout.write(
  `token-radar-01: scored ${board.length} pre-token protocols (${radar.watchlist_size} watchlist + ${radar.early_size} early radar; ${radar.live_size} live benchmarks)\n` +
    `token-radar-01: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shotFiles.length} images), dossier.json (${dossierBytes.length} bytes)\n`,
);
