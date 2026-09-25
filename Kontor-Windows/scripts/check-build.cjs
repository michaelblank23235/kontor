const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
assert.ok(refs.some(ref => ref.endsWith('.js')), 'JavaScript entry is missing');
for (const ref of refs) {
  assert.ok(ref.startsWith('./'), `Desktop assets must use relative paths: ${ref}`);
  assert.ok(fs.existsSync(path.resolve(root, ref)), `Missing built asset: ${ref}`);
}
console.log('Desktop asset paths and files verified.');
