#!/usr/bin/env node
// Static release checks for Hearth & Home 3D.
// Dependency-free: only Node built-ins. Run from anywhere:
//   node scripts/check.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const failures = [];

function check(condition, label) {
  checks++;
  if (!condition) failures.push(label);
}

function rel(path) {
  return relative(ROOT, path) || '.';
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function isExternal(target) {
  return (
    /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target) ||
    /^(?:data|mailto|tel|javascript):/i.test(target) ||
    target.startsWith('#') ||
    target.trim() === ''
  );
}

function resolveLocal(baseDir, rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  target = target.split('#')[0].split('?')[0];
  if (!target) return null;
  try {
    target = decodeURIComponent(target);
  } catch {
    // Keep the raw string; the existence check will report it.
  }
  return resolve(baseDir, target);
}

/* ------------------------------------------------------------------ */
/* 1. Required release files                                          */
/* ------------------------------------------------------------------ */

const skill = 'skills/hearth-and-home-3d';
const required = [
  'index.html',
  'style.css',
  'script.js',
  'README.md',
  'AGENTS.md',
  'LICENSE',
  '.nojekyll',
  'scripts/check.mjs',
  'docs/ARCHITECTURE.md',
  'docs/REPRODUCTION.md',
  'docs/DEPLOYMENT.md',
  'docs/TESTING.md',
  `${skill}/SKILL.md`,
  `${skill}/ATTRIBUTION.md`,
  `${skill}/references/method.md`,
  `${skill}/references/lessons.md`,
  `${skill}/references/verification.md`,
  `${skill}/assets/template/index.html`,
  `${skill}/assets/template/style.css`,
  `${skill}/assets/template/script.js`
];

required.forEach((file) => check(existsSync(join(ROOT, file)), `missing required file: ${file}`));

/* ------------------------------------------------------------------ */
/* 2. Local src/href targets in index.html                            */
/* ------------------------------------------------------------------ */

const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const attrPattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
let match;
while ((match = attrPattern.exec(indexHtml)) !== null) {
  const raw = match[1].trim();
  if (isExternal(raw)) continue;
  const target = resolveLocal(ROOT, raw);
  if (!target) continue;
  check(existsSync(target), `index.html references missing local file: ${raw} (${rel(target)})`);
}

/* ------------------------------------------------------------------ */
/* 3. Relative Markdown links                                         */
/* ------------------------------------------------------------------ */

const markdownFiles = walk(ROOT).filter((file) => extname(file).toLowerCase() === '.md');
const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

markdownFiles.forEach((file) => {
  const body = readFileSync(file, 'utf8');
  let link;
  while ((link = linkPattern.exec(body)) !== null) {
    const raw = link[1].trim();
    if (isExternal(raw)) continue;
    const target = resolveLocal(dirname(file), raw);
    if (!target) continue;
    check(
      existsSync(target),
      `${rel(file)} links to missing local target: ${raw} (${rel(target)})`
    );
  }
});

/* ------------------------------------------------------------------ */
/* 4. JavaScript syntax                                               */
/* ------------------------------------------------------------------ */

const scriptFiles = walk(ROOT).filter((file) => ['.js', '.mjs'].includes(extname(file).toLowerCase()));
scriptFiles.forEach((file) => {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    check(true, '');
  } catch (error) {
    const detail = (error.stderr || error.stdout || '').toString().trim().split('\n').slice(0, 3).join(' | ');
    check(false, `node --check failed for ${rel(file)}${detail ? `: ${detail}` : ''}`);
  }
});

/* ------------------------------------------------------------------ */
/* 5. JSON parses                                                     */
/* ------------------------------------------------------------------ */

const jsonFiles = walk(ROOT).filter((file) => extname(file).toLowerCase() === '.json');
jsonFiles.forEach((file) => {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
    check(true, '');
  } catch (error) {
    check(false, `invalid JSON: ${rel(file)} (${error.message})`);
  }
});

/* ------------------------------------------------------------------ */
/* 6. Skill template is byte-identical to the release sources         */
/* ------------------------------------------------------------------ */

['index.html', 'style.css', 'script.js'].forEach((name) => {
  const release = join(ROOT, name);
  const template = join(ROOT, skill, 'assets', 'template', name);
  if (!existsSync(release) || !existsSync(template)) {
    check(false, `cannot compare missing template/source: ${name}`);
    return;
  }
  check(
    readFileSync(release).equals(readFileSync(template)),
    `skill template differs from release source: ${name}`
  );
});

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

if (failures.length) {
  console.error(`FAIL ${failures.length} of ${checks} checks`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log(`OK ${checks} checks`);
