import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseVersion, compareVersions } from '../lib/releases.js';

export function checkReleaseTag(version, tag, existingTags = []) {
  if (typeof tag !== 'string' || !/^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-beta\.(?:0|[1-9][0-9]*))?$/.test(tag) || tag !== `v${version}`) {
    throw new Error('Release tag must equal v plus package.json version, with only beta.N allowed for prereleases.');
  }
  const target = parseVersion(version);
  for (const previousTag of existingTags) {
    const previous = parseVersion(previousTag.startsWith('v') ? previousTag.slice(1) : previousTag);
    if (!previous) throw new Error(`Existing release tag ${previousTag} is not a valid SemVer version.`);
    if (compareVersions(target, previous) <= 0) {
      throw new Error(`Release must rank above existing release ${previousTag}.`);
    }
  }
  return target.prerelease.length > 0;
}

export function releaseNotes(notes, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Release requires a full commit SHA.');
  return `${notes.trim()}\n\nCommit: ${sha}\nGit spec: github:tjyyy3/dsh-playground#${sha}\n`;
}

export const requiredFiles = ['package.json', 'index.js', 'client.js', 'lib/releases.js',
  'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.svg', 'compatibility.json', 'README.md', 'README.en.md'];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'tags-file': { type: 'string' }, 'notes-file': { type: 'string' } } });
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const tags = values['tags-file'] ? readFileSync(values['tags-file'], 'utf8').split(/\r?\n/).filter(Boolean) : [];
  checkReleaseTag(version, process.env.RELEASE_TAG, tags);
  for (const file of [...requiredFiles, `release-notes/${version}.md`]) {
    if (!existsSync(file)) throw new Error(`Release is missing ${file}.`);
  }
  if (values['notes-file']) {
    writeFileSync(values['notes-file'], releaseNotes(readFileSync(`release-notes/${version}.md`, 'utf8'), process.env.RELEASE_SHA));
  }
}
