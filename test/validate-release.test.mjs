import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkReleaseTag, releaseNotes, requiredFiles } from '../scripts/validate-release.mjs';

test('release tags exactly match the package version and only allow stable or beta.N', () => {
  assert.equal(checkReleaseTag('1.0.0', 'v1.0.0'), false);
  assert.equal(checkReleaseTag('1.0.0-beta.1', 'v1.0.0-beta.1'), true);
  for (const version of ['1.0.0-preview.8', '1.0.0-beta', '1.0.0-beta.01', '1.0.0-beta.1.extra', '01.0.0', '1.0.0+build', '1.0.0-rc.1']) {
    assert.throws(() => checkReleaseTag(version, `v${version}`));
  }
  for (const tag of ['main', '1.0.0', 'v1.0.1', '-branch', 'v1.0.0\n', 'v1.0.0; echo bad']) {
    assert.throws(() => checkReleaseTag('1.0.0', tag));
  }
});

test('every previous release participates in monotonic SemVer admission', () => {
  assert.throws(() => checkReleaseTag('0.5.0-beta.99', 'v0.5.0-beta.99', ['v0.5.0-preview.7']));
  assert.equal(checkReleaseTag('0.5.1-beta.1', 'v0.5.1-beta.1', ['v0.5.0-preview.7']), true);
  for (const previous of ['v1.0.0-beta.10', '1.0.0', 'v2.0.0', 'not-semver']) {
    assert.throws(() => checkReleaseTag('1.0.0-beta.2', 'v1.0.0-beta.2', ['v0.1.0', previous]));
  }
  assert.equal(checkReleaseTag('1.0.0-beta.10', 'v1.0.0-beta.10', ['v1.0.0-beta.9']), true);
  assert.throws(() => checkReleaseTag('1.0.0', 'v1.0.0', ['v1.0.0']));
});

test('Release notes publish the exact commit and paste-ready Git spec', () => {
  const sha = 'a'.repeat(40);
  assert.equal(releaseNotes('# Changes\n', sha), `# Changes\n\nCommit: ${sha}\nGit spec: github:tjyyy3/dsh-playground#${sha}\n`);
  for (const invalid of ['main', 'a'.repeat(39), `${sha}\n`]) assert.throws(() => releaseNotes('Changes', invalid));
  assert.ok(requiredFiles.includes('icon.svg'));
  assert.ok(!requiredFiles.includes('guide/releases.md'));
});

test('workflow validates input before checkout and drafts only pinned commit metadata', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('Validate tag before checkout') < workflow.indexOf('uses: actions/checkout'));
  const bashPattern = workflow.match(/RELEASE_TAG" =~ (.+) \]\]/)[1];
  const pattern = new RegExp(bashPattern);
  for (const tag of ['v1.0.0', 'v1.0.0-beta.0', 'v0.5.1-beta.1']) assert.ok(pattern.test(tag));
  for (const tag of ['main', 'v1.0.0-preview.1', 'v1.0.0-beta.01', 'v01.0.0', 'v1.0.0+build']) assert.ok(!pattern.test(tag));
  assert.match(workflow, /gh api --paginate/);
  assert.match(workflow, /--tags-file.*--notes-file/);
  assert.match(workflow, /gh release create "\$RELEASE_TAG" compatibility\.json/);
  assert.match(workflow, /--verify-tag --draft --latest=false/);
  assert.doesNotMatch(workflow, /\.tgz|SHA256SUMS|release:pack/);
  const writeJob = workflow.slice(workflow.indexOf('\n  draft:'));
  for (const [, action] of writeJob.matchAll(/uses: ([^\s]+)/g)) assert.match(action, /@[0-9a-f]{40}$/);
  assert.ok([...workflow.matchAll(/run: npm ci(.*)/g)].every((match) => match[1].includes('--ignore-scripts')));
  const testWorkflow = readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(testWorkflow, /release:pack|package-release/);
});

test('manifest keeps the current version and ships compatibility metadata with the host floor', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const compatibility = JSON.parse(readFileSync(new URL('../compatibility.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '0.5.0-preview.7');
  assert.equal(manifest.engines.dsh, `>=${compatibility.recommendedHost}`);
  assert.equal(compatibility.schemaVersion, 1);
  assert.ok(manifest.files.includes('icon.svg'));
  assert.ok(manifest.files.includes('compatibility.json'));
  assert.ok(manifest.files.includes('release-notes/*.md'));
  for (const file of [...requiredFiles, `release-notes/${manifest.version}.md`]) {
    assert.ok(readFileSync(new URL(`../${file}`, import.meta.url)).length > 0, file);
  }
});
