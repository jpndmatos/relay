// Follow static imports, including any future vendor chunks. Lazy chunks are
// intentionally separate from the initial download budget.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const directory = resolve(process.argv[2] ?? '../src/Relay.Api/wwwroot');
const manifest = JSON.parse(readFileSync(resolve(directory, 'asset-manifest.json'), 'utf8'));
const visited = new Set(); const scripts = new Set(); const styles = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) throw new Error(`Missing manifest entry: ${key}`);
  if (entry.file.endsWith('.js')) scripts.add(entry.file);
  for (const file of entry.css ?? []) styles.add(file);
  for (const dependency of entry.imports ?? []) visit(dependency);
}
for (const [key, entry] of Object.entries(manifest)) if (entry.isEntry) visit(key);
// Classic bootstrap files run before CSS/React and belong to the initial cost.
const html = readFileSync(resolve(directory, 'index.html'), 'utf8');
for (const match of html.matchAll(/<script\b([^>]*?)src="([^"]+)"[^>]*>/g)) {
  if (!/type="module"/.test(match[0]) && !/^https?:/.test(match[2])) scripts.add(match[2].replace(/^\.\//, ''));
}
if (!scripts.size) throw new Error('No entry script found; build before checking budgets.');
const size = files => [...files].reduce((sum, file) => sum + gzipSync(readFileSync(resolve(directory, file)), { level: 9 }).length, 0);
for (const [name, bytes, limit] of [['Initial JS', size(scripts), 90 * 1024], ['Initial CSS', size(styles), 10 * 1024]]) {
  console.log(`${name}: ${(bytes / 1024).toFixed(1)} KiB gzip (budget ${limit / 1024} KiB)`);
  if (bytes > limit) throw new Error(`${name} exceeded its download budget.`);
}
