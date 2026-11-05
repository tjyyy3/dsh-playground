// Content summary of an ARM ZIP, read from its central directory only: no entry is decompressed or
// extracted, so the summary costs one pass over the directory records already in memory.
//
// Whether a file is UTF-8 text is decided by its name alone. Reading content would mean inflating
// deflated entries, which the summary does not do. Names on the allowlist below count as text; every
// other file is listed as not known to be text. That errs towards listing: an unusual text extension
// is listed too, and the list is a hint for the agent to check against the challenge's limits, never a
// reason to refuse the materials.

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const UNIX_HOST = 3;
const SYMLINK_MODE = 0o120000;
const FILE_TYPE_MASK = 0o170000;

// How much of each list the summary keeps; the counts stay exact.
export const BUNDLE_SUMMARY_LIMITS = Object.freeze({ largest: 5, listed: 20, nameChars: 200 });

const TEXT_EXTENSIONS = new Set(`
  md markdown mdx txt text rst adoc asciidoc org qmd rmd tex bib sty cls bst cff
  py pyi pyx pxd ipynb r jl m ml mli hs lua pl pm rb php swift kt kts scala java groovy gradle go rs
  c h cc cpp cxx hpp hh hxx cu cuh f f90 f95 for ex exs erl clj cljs dart nim zig v sv vhd vhdl
  js mjs cjs jsx ts tsx mts cts vue svelte css scss sass less html htm xhtml xml xsl xsd svg
  json jsonl ndjson json5 geojson yaml yml toml ini cfg conf properties env csv tsv psv
  sh bash zsh fish ksh ps1 psm1 psd1 bat cmd sql graphql gql proto thrift
  dockerfile makefile mk cmake bzl bazel star tf hcl nix
  lock log diff patch gitignore gitattributes gitmodules dockerignore editorconfig npmrc nvmrc
  prettierrc eslintrc babelrc flake8 pylintrc coveragerc condarc
  tpl tmpl j2 jinja jinja2 mustache hbs ejs liquid
`.split(/\s+/).filter(Boolean));
const TEXT_NAMES = new Set(['readme', 'license', 'licence', 'copying', 'notice', 'authors', 'contributors', 'changelog',
  'changes', 'makefile', 'dockerfile', 'procfile', 'gemfile', 'rakefile', 'vagrantfile', 'jenkinsfile', 'pipfile', 'brewfile']);

const leafName = (name) => name.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

/** Whether a ZIP entry name is a known UTF-8 text file by its extension or its well-known name. */
export function isKnownTextName(name) {
  const leaf = leafName(name).toLowerCase();
  if (TEXT_NAMES.has(leaf)) return true;
  const ext = leaf.match(/\.([a-z0-9_+-]{1,16})$/)?.[1];
  return ext !== undefined && TEXT_EXTENSIONS.has(ext);
}

// Entry names are archive data: drop control characters and keep at most nameChars characters,
// keeping the end, where the file name is.
function displayName(name) {
  const text = name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '');
  const chars = Array.from(text);
  return chars.length > BUNDLE_SUMMARY_LIMITS.nameChars ? `…${chars.slice(-(BUNDLE_SUMMARY_LIMITS.nameChars - 1)).join('')}` : text;
}

function endOfCentralDirectory(bytes) {
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let at = bytes.length - 22; at >= lowest; at -= 1) {
    if (bytes.readUInt32LE(at) === EOCD) return at;
  }
  return -1;
}

// Where the central directory starts and how many records it has, from the (ZIP64) end record.
function directoryOf(bytes) {
  const end = endOfCentralDirectory(bytes);
  if (end < 0) return undefined;
  let count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff) {
    const locator = end - 20;
    if (locator < 0 || bytes.readUInt32LE(locator) !== ZIP64_LOCATOR) return undefined;
    const record = Number(bytes.readBigUInt64LE(locator + 8));
    if (!Number.isSafeInteger(record) || record + 56 > bytes.length || bytes.readUInt32LE(record) !== ZIP64_EOCD) return undefined;
    count = Number(bytes.readBigUInt64LE(record + 32));
    offset = Number(bytes.readBigUInt64LE(record + 48));
  }
  return Number.isSafeInteger(count) && Number.isSafeInteger(offset) ? { count, offset } : undefined;
}

// The uncompressed size from a ZIP64 extra field, when the 32-bit field says it is there.
function zip64Size(bytes, start, length) {
  for (let at = start; at + 4 <= start + length;) {
    const id = bytes.readUInt16LE(at);
    const size = bytes.readUInt16LE(at + 2);
    if (id === 0x0001 && size >= 8 && at + 12 <= start + length) {
      const value = Number(bytes.readBigUInt64LE(at + 4));
      return Number.isSafeInteger(value) ? value : undefined;
    }
    at += 4 + size;
  }
  return undefined;
}

/**
 * Summary of a ZIP's files from its central directory: the file count (directories excluded), the
 * total uncompressed size, the largest files, the files not known to be UTF-8 text, and the symbolic
 * links (recognisable only in entries written by a Unix tool, which records the file mode). Lists are
 * cut to BUNDLE_SUMMARY_LIMITS; `complete: false` marks a directory that could not be read to the end,
 * whose counts cover only the records read. Returns undefined when no central directory is found.
 */
export function summarizeZip(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22) return undefined;
  const directory = directoryOf(bytes);
  if (!directory) return undefined;
  const files = [];
  const symlinks = [];
  let complete = true;
  let at = directory.offset;
  for (let index = 0; index < directory.count; index += 1) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== CENTRAL) { complete = false; break; }
    const host = bytes.readUInt16LE(at + 4) >> 8;
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const mode = bytes.readUInt32LE(at + 38) >>> 16;
    if (at + 46 + nameLength + extraLength > bytes.length) { complete = false; break; }
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    let size = bytes.readUInt32LE(at + 24);
    if (size === 0xffffffff) size = zip64Size(bytes, at + 46 + nameLength, extraLength) ?? size;
    at += 46 + nameLength + extraLength + commentLength;
    if (host === UNIX_HOST && (mode & FILE_TYPE_MASK) === SYMLINK_MODE) { symlinks.push(displayName(name)); continue; }
    if (/[\\/]$/.test(name)) continue;
    files.push({ name: displayName(name), bytes: size, text: isKnownTextName(name) });
  }
  const bySize = [...files].sort((a, b) => b.bytes - a.bytes || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const nonText = bySize.filter((file) => !file.text);
  const { largest, listed } = BUNDLE_SUMMARY_LIMITS;
  return {
    files: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    largest: bySize.slice(0, largest).map(({ name, bytes: size }) => ({ name, bytes: size })),
    nonTextCount: nonText.length,
    nonText: nonText.slice(0, listed).map(({ name, bytes: size }) => ({ name, bytes: size })),
    symlinkCount: symlinks.length,
    symlinks: symlinks.slice(0, listed),
    ...(complete ? {} : { complete: false }),
  };
}
