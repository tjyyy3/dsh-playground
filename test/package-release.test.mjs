import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReleaseTag, checkPackageFiles } from '../scripts/package-release.mjs';

test('release tag must match the packaged version and distinguishes prereleases', () => {
  assert.equal(checkReleaseTag('0.5.0', 'v0.5.0'), false);
  assert.equal(checkReleaseTag('0.6.0-beta.1', 'v0.6.0-beta.1'), true);
  assert.throws(() => checkReleaseTag('0.6.0-beta.1', 'v0.6.0'), /exact/);
  assert.throws(() => checkReleaseTag('bad', 'vbad'), /exact/);
  assert.throws(() => checkReleaseTag('0.5.0-beta.01', 'v0.5.0-beta.01'), /exact/);
  assert.throws(() => checkReleaseTag('0.5.0+build', 'v0.5.0+build'), /exact/);
});

test('release package includes runtime, locales and README destinations and excludes residue', () => {
  const files = ['package.json', 'index.js', 'client.js', 'lib/releases.js', 'cordis.patch.yml',
    'locale/en.json', 'locale/zh.json', 'README.md', 'guide/reference.md', 'guide/releases.md', 'assets/playground-controller.png']
    .map((path) => ({ path }));
  checkPackageFiles(files);
  assert.throws(() => checkPackageFiles(files.filter(({ path }) => path !== 'locale/en.json')), /missing locale/);
  assert.throws(() => checkPackageFiles([...files, { path: '_scratch/credentials.env' }]), /Unexpected/);
});
