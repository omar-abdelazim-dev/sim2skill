// Build or refresh the course-material index for the physics labs.
//   npm run rag:course -- <folder with PDFs> [--no-embed] [--remove "Source name"] [--stats]
// Each PDF becomes one source. Optional <folder>/labels.json maps a file name to the name shown to students:
//   { "file-c2782821.pdf": "PHY212 Lab Manual" }
// Resumable: unchanged chunks keep their vectors, and an interrupted embedding run continues where it stopped.
// The PDFs and the index stay on this machine (the database is git-ignored); only your Gemini key leaves it, to Google.
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { join, basename, extname, resolve } from 'node:path';
import { loadEnvFile } from '../server/platform.mjs';
import { openDb } from '../server/db.mjs';
import { extractPdfPages, indexSource, embedCourse, removeSource, courseStats } from '../server/llm/course.mjs';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const folder = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--remove');
await loadEnvFile();
const dir = process.env.DATA_DIR || '.data';
await mkdir(dir, { recursive: true });
const db = openDb(dir);
try {
  if (flag('--remove')) { const name = args[args.indexOf('--remove') + 1]; console.log(`removed ${removeSource(db, name)} chunks of "${name}"`); }
  if (folder) {
    const files = (await readdir(folder)).filter(f => extname(f).toLowerCase() === '.pdf').sort();
    if (!files.length) throw new Error(`No PDF files in ${resolve(folder)}`);
    const labels = await readFile(join(folder, 'labels.json'), 'utf8').then(JSON.parse, () => ({}));
    for (const f of files) {
      const source = labels[f] || basename(f, '.pdf');
      const pages = await extractPdfPages(join(folder, f));
      const r = await indexSource(db, source, pages);
      console.log(`${source}: ${pages.length} pages, ${r.chunks} chunks (${r.added} new, ${r.removed} removed)`);
    }
    if (!flag('--no-embed')) {
      if (!process.env.GEMINI_API_KEY) console.log('No GEMINI_API_KEY: skipping vectors. Nour will use keyword search only until you run this again with the key.');
      else {
        const r = await embedCourse(db, { onProgress: p => console.log(p.waiting ? `rate limit, waiting ${p.waiting / 1000}s...` : `embedded ${p.embedded}, ${p.remaining} left`) });
        if (r.reason === 'daily-quota') console.log(`Daily free-tier embedding quota used up (${r.remaining} chunks left). Run this again tomorrow; it resumes.`);
        else console.log(`vectors done (${r.embedded} new)`);
      }
    }
  }
  if (!folder || flag('--stats')) for (const s of courseStats(db)) console.log(`${s.source}: ${s.chunks} chunks, ${s.embedded} with vectors, ${s.pages} pages`);
} finally { db.close(); }
