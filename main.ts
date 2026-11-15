// NEON RUSH — entry program for the best-game-01 bounty (Node 22, stdlib only).
//
// The game lives in game/ next to this file: plain static files (index.html plus its
// own modules) that a desktop browser opens offline, no network, no fetched assets.
// This program's only job is to hand that game in. It copies game/ and screenshots/
// into the output directory and writes dossier.json there, the summary the judge
// reads, using the vendored make.fun helper in vendor/makefun-game.ts.
//
// Run it outside the grader with an output override:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader the output directory is /output.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where the entry files sit, and where the hand-in goes.
const sourceDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, copied from the competition's reference/gate.json. Only
// text_max_bytes trims the dossier text; the rest reject an entry the scorer
// itself would reject: more than 4 screenshots, or one over 256 KiB; more than
// 993 files in game/, or 48 MiB of game files in total; or any path under
// game/ longer than 1000 bytes. game/ is counted alongside /output's own
// 1000-entry cap, its screenshots/ and dossier.json.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Fail fast before copying anything: a missing index.html means the game has no
// entry point, and the judge needs 3 or 4 screenshots with the first by name
// as the cover. Throwing here, with the missing piece named, beats a silent
// hand-in that the scorer would refuse.
function checkInputsReady(): void {
  const indexFile = join(sourceDir, 'game', 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`NEON RUSH hand-in is missing game/index.html (looked for ${indexFile})`);
  }

  const shotsDir = join(sourceDir, 'screenshots');
  if (!existsSync(shotsDir)) {
    throw new Error(`NEON RUSH hand-in is missing screenshots/ (looked for ${shotsDir})`);
  }
  const images = readdirSync(shotsDir).filter((name) =>
    statSync(join(shotsDir, name)).isFile(),
  );
  if (images.length < 3 || images.length > 4) {
    throw new Error(
      `NEON RUSH hand-in needs 3 or 4 screenshots in screenshots/, found ${images.length}`,
    );
  }
}

checkInputsReady();

mkdirSync(outputDir, { recursive: true });
cpSync(join(sourceDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
cpSync(join(sourceDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_LIMITS));
