import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';

export const DEFAULT_CLI_CREDENTIALS_PATH = join(homedir(), '.config', 'playground', 'credentials.env');

function decodeEnvValue(value) {
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/'\"'\"'/g, "'");
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

export async function readCliCredential(name, credentialsPath = DEFAULT_CLI_CREDENTIALS_PATH) {
  const text = await readFile(credentialsPath, 'utf8').catch(() => '');
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1] ? decodeEnvValue(match[1].trim()) : '';
}

function cliBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/api\/?$/, '');
}

function cliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// `started` tells callers whether a CLI process ever existed. When it is false, nothing can have
// reached the platform.
function markStarted(error, started) {
  if (error !== null && typeof error === 'object') error.started = started;
  return error;
}

const isFile = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};

// PATH entries are separated by ';', but an entry may be quoted and contain ';' itself.
function splitWindowsPath(value) {
  const entries = [];
  let entry = '';
  let quoted = false;
  for (const character of String(value || '')) {
    if (character === '"') quoted = !quoted;
    else if (character === ';' && !quoted) {
      entries.push(entry);
      entry = '';
    } else entry += character;
  }
  entries.push(entry);
  return entries.map((item) => item.trim()).filter(Boolean);
}

const windowsExtensions = () => String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
  .split(';').map((item) => item.trim()).filter(Boolean);

const hasSlash = (command) => /[\\/]/.test(command);

// Look the command up with PATH and PATHEXT, never in the current directory. A command with a
// slash is resolved against `base`, the directory the CLI will run in, as POSIX does. `where` is
// not used: it prints paths in the console code page, which garbles non-ASCII directory names.
function findWindowsCommand(command, base) {
  const names = [...(extname(command) ? [command] : []), ...windowsExtensions().map((extension) => command + extension)];
  const directories = hasSlash(command) ? [base ?? ''] : splitWindowsPath(process.env.PATH);
  for (const directory of directories) {
    for (const name of names) {
      const path = resolve(directory, name);
      if (isFile(path)) return path;
    }
  }
  return undefined;
}

// npm and pnpm shims run node on a quoted script path relative to the shim, followed by `%*`.
// Any other wrapper may set variables or add arguments, so it is left to the cmd fallback.
function shimEntry(shimPath) {
  let text;
  try { text = readFileSync(shimPath, 'utf8'); } catch { return undefined; }
  const quoted = text.match(/"([^"\r\n]*\.[cm]?js)"[ \t]+%\*/i)?.[1];
  if (!quoted) return undefined;
  const path = quoted.replace(/%~dp0|%dp0%/gi, `${dirname(shimPath)}\\`);
  return !path.includes('%') && isAbsolute(path) && isFile(path) ? resolve(path) : undefined;
}

// cmd.exe parses its command line again, so the fallback accepts only arguments that a quoted
// cmd token passes through literally. Trailing backslashes are doubled so they do not escape the
// closing quote.
const CMD_UNSAFE = /["%!^&|<>\r\n]/;
const cmdQuote = (value) => `"${value.replace(/\\+$/, '$&$&')}"`;

const nodeMissing = () => cliError('cli_node_missing', 'Node.js was not found on PATH; the Playground CLI needs it to run.');

function pathNode() {
  const node = findWindowsCommand('node.exe');
  return node && extname(node).toLowerCase() === '.exe' ? node : undefined;
}

// Node refuses to start .cmd/.bat files without a shell, and a shell would split and interpret
// the arguments. Run the CLI's JS entry with node instead, and use cmd only as a last resort.
// The plan depends only on the command and the environment, so it can be reused across calls;
// `files` lists what must still exist for a reused plan to be valid.
function windowsPlan(command, cwd) {
  const path = findWindowsCommand(command, cwd);
  if (!path) throw cliError('cli_not_found', 'Playground CLI was not found. Install it or check the cliPath setting.');
  const extension = extname(path).toLowerCase();
  if (extension === '.exe') return { file: path, prefix: [], files: [path] };
  if (/^\.[cm]?js$/.test(extension)) {
    const node = pathNode();
    if (!node) throw nodeMissing();
    return { file: node, prefix: [path], files: [node, path] };
  }
  const entry = /^\.(cmd|bat)$/.test(extension) ? shimEntry(path) : undefined;
  if (entry) {
    const local = join(dirname(path), 'node.exe');
    const node = isFile(local) ? local : pathNode();
    if (!node) throw nodeMissing();
    return { file: node, prefix: [entry], files: [node, entry, path] };
  }
  return { shell: path, files: [path] };
}

function windowsLaunch(plan, args) {
  if (!plan.shell) return { file: plan.file, args: [...plan.prefix, ...args] };
  const line = [plan.shell, ...args].map(String);
  if (line.some((value) => CMD_UNSAFE.test(value))) {
    throw cliError('cli_unsafe_argument', 'Playground CLI arguments contain characters that cmd.exe would interpret. '
      + "Set cliPath to the CLI's JavaScript entry file (for example ...\\dist\\index.js) so it can run without cmd.exe.");
  }
  return {
    file: process.env.ComSpec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
    args: ['/d', '/s', '/c', `"${line.map(cmdQuote).join(' ')}"`],
    windowsVerbatimArguments: true,
    // cmd searches the current directory (the workspace) before PATH unless this is set, so a
    // node.cmd in the workspace would replace node inside the shim.
    env: { NoDefaultCurrentDirectoryInExePath: '1' },
  };
}

export function createPlaygroundCli({
  command = 'playground',
  credentialsPath = process.env.PLAYGROUND_CREDENTIALS_PATH || DEFAULT_CLI_CREDENTIALS_PATH,
  baseUrl,
  timeoutMs = 120000,
  submitTimeoutMs = 600000,
} = {}) {
  const apiBase = cliBaseUrl(baseUrl);
  const argsWithBase = (args) => apiBase ? [...args, '--api-base', apiBase] : args;

  // Resolving the command scans PATH synchronously, so reuse the plan while the inputs match.
  // A path with a slash is keyed on the working directory too: even a root-relative path such as
  // \tools\cli.js takes its drive from it. The cache only notices files that disappeared; a better
  // candidate installed while DSH runs (an earlier PATH entry, a node.exe next to the shim) is
  // picked up after restarting DSH.
  let cachedPlan;
  function cachedWindowsPlan(cwd) {
    const key = JSON.stringify([command, process.env.PATH ?? '', process.env.PATHEXT ?? '', hasSlash(command) ? resolve(cwd ?? '') : '']);
    if (cachedPlan?.key === key && cachedPlan.plan.files.every(isFile)) return cachedPlan.plan;
    cachedPlan = undefined;
    const plan = windowsPlan(command, cwd);
    cachedPlan = { key, plan };
    return plan;
  }

  async function run(args, { env = {}, cwd, signal, timeout = timeoutMs } = {}) {
    // Windows resolves the command before starting it, so a missing command is cli_not_found
    // rather than ENOENT. POSIX spawns without a shell, so a missing command fails with ENOENT.
    let launch;
    let child;
    try {
      launch = process.platform === 'win32' ? windowsLaunch(cachedWindowsPlan(cwd), args) : { file: command, args };
      child = spawn(launch.file, launch.args, {
        cwd,
        env: { ...process.env, ...env, ...launch.env },
        windowsHide: true,
        windowsVerbatimArguments: Boolean(launch.windowsVerbatimArguments),
      });
    } catch (error) {
      throw markStarted(error, false);
    }
    let started = false;
    child.once('spawn', () => { started = true; });
    let stdout = '';
    let stderr = '';
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => child.kill(), timeout);
      const abort = () => child.kill();
      const cleanup = () => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abort);
      };
      if (signal) {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      }
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', (error) => {
        // A process that never started emits no close event, so stop the timer here.
        if (!started) cleanup();
        reject(markStarted(error, started));
      });
      child.once('close', (code, closeSignal) => {
        cleanup();
        resolve({ code, signal: closeSignal, stdout, stderr });
      });
    });
    if (result.code !== 0) {
      const message = result.stderr.trim() || result.stdout.trim() || `playground exited with code ${result.code ?? 'unknown'}`;
      const error = new Error(message);
      error.code = result.code === null ? 'cli_terminated' : 'cli_error';
      throw markStarted(error, true);
    }
    return result.stdout.trim();
  }

  async function json(args, options) {
    const text = await run(argsWithBase(args), options);
    try {
      return JSON.parse(text);
    } catch {
      throw markStarted(new Error(`Playground CLI returned invalid JSON: ${text.slice(0, 500)}`), true);
    }
  }

  return {
    command,
    credentialsPath,
    async authLogin(email, password, options = {}) {
      return json(['auth', 'login', '--email', email], {
        ...options,
        env: { PLAYGROUND_PASSWORD: password, PLAYGROUND_CREDENTIALS_PATH: credentialsPath, ...options.env },
      });
    },
    async submit({ challengeId, bundlePath, tracePath, attemptId, model, harness, method, cwd, signal }) {
      const args = ['submit', '--challenge-id', challengeId, '--bundle', bundlePath];
      if (tracePath && !attemptId) args.push('--trace', tracePath);
      if (attemptId) args.push('--attempt-id', String(attemptId));
      if (model) args.push('--model', model);
      if (harness) args.push('--harness', harness);
      if (method) args.push('--method', method);
      // An upload of up to 200 MiB with the CLI's own retries can outlast the login timeout.
      return json(args, { cwd, signal, timeout: submitTimeoutMs, env: { PLAYGROUND_CREDENTIALS_PATH: credentialsPath } });
    },
  };
}
