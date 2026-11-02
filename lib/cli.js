import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';

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

const isFile = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};

// Look the command up the way cmd does, using PATH and PATHEXT. `where` is not used: it prints
// paths in the console code page, which garbles non-ASCII directory names.
function findWindowsCommand(command) {
  const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const names = [...(extname(command) ? [command] : []), ...extensions.map((extension) => command + extension)];
  const directories = /[\\/]/.test(command)
    ? ['']
    : String(process.env.PATH || '').split(delimiter).map((directory) => directory.replace(/"/g, '').trim()).filter(Boolean);
  for (const directory of directories) {
    for (const name of names) {
      const path = resolve(directory, name);
      if (isFile(path)) return path;
    }
  }
  return undefined;
}

// npm, pnpm and similar shims end by running node on a quoted script path relative to the shim.
function shimEntry(shimPath) {
  let text;
  try { text = readFileSync(shimPath, 'utf8'); } catch { return undefined; }
  const quoted = [...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1]).find((value) => /\.[cm]?js$/i.test(value));
  if (!quoted) return undefined;
  const path = quoted.replace(/%~dp0|%dp0%/gi, `${dirname(shimPath)}\\`);
  return !path.includes('%') && isAbsolute(path) && isFile(path) ? resolve(path) : undefined;
}

// cmd.exe parses its command line again, so the fallback accepts only arguments that a quoted
// cmd token passes through literally. Trailing backslashes are doubled so they do not escape the
// closing quote.
const CMD_UNSAFE = /["%!^&|<>\r\n]/;
const cmdQuote = (value) => `"${value.replace(/\\+$/, '$&$&')}"`;

// Node refuses to start .cmd/.bat files without a shell, and a shell would split and interpret
// the arguments. Start the CLI's JS entry with node instead, and use cmd only as a last resort.
function windowsLaunch(command, args) {
  const path = findWindowsCommand(command);
  if (!path) throw cliError('cli_not_found', `Playground CLI not found: ${command}`);
  const extension = extname(path).toLowerCase();
  if (extension === '.exe') return { file: path, args };
  const pathNode = () => {
    const node = findWindowsCommand('node.exe');
    return node && extname(node).toLowerCase() === '.exe' ? node : undefined;
  };
  if (/^\.[cm]?js$/.test(extension)) {
    const node = pathNode();
    if (!node) throw cliError('cli_not_found', `Node.js was not found on PATH; it is needed to run ${path}`);
    return { file: node, args: [path, ...args] };
  }
  const entry = /^\.(cmd|bat)$/.test(extension) ? shimEntry(path) : undefined;
  if (entry) {
    const local = join(dirname(path), 'node.exe');
    const node = isFile(local) ? local : pathNode();
    if (node) return { file: node, args: [entry, ...args] };
  }
  const line = [path, ...args].map(String);
  if (line.some((value) => CMD_UNSAFE.test(value))) {
    throw cliError('cli_unsafe_argument', 'Playground CLI arguments contain characters that cmd.exe would interpret. '
      + "Set cliPath to the CLI's JavaScript entry file (for example ...\\dist\\index.js) so it can run without cmd.exe.");
  }
  return {
    file: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line.map(cmdQuote).join(' ')}"`],
    windowsVerbatimArguments: true,
  };
}

export function createPlaygroundCli({
  command = 'playground',
  credentialsPath = process.env.PLAYGROUND_CREDENTIALS_PATH || DEFAULT_CLI_CREDENTIALS_PATH,
  baseUrl,
  timeoutMs = 120000,
} = {}) {
  const apiBase = cliBaseUrl(baseUrl);
  const argsWithBase = (args) => apiBase ? [...args, '--api-base', apiBase] : args;

  async function run(args, { env = {}, cwd, signal, timeout = timeoutMs } = {}) {
    // Windows resolves the command before starting it, so a missing command is cli_not_found
    // rather than ENOENT. POSIX spawns without a shell, so a missing command fails with ENOENT.
    const launch = process.platform === 'win32' ? windowsLaunch(command, args) : { file: command, args };
    const child = spawn(launch.file, launch.args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      windowsVerbatimArguments: Boolean(launch.windowsVerbatimArguments),
    });
    let stdout = '';
    let stderr = '';
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => child.kill(), timeout);
      const abort = () => child.kill();
      if (signal) {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      }
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code, closeSignal) => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abort);
        resolve({ code, signal: closeSignal, stdout, stderr });
      });
    });
    if (result.code !== 0) {
      const message = result.stderr.trim() || result.stdout.trim() || `playground exited with code ${result.code ?? 'unknown'}`;
      const error = new Error(message);
      error.code = result.code === null ? 'cli_terminated' : 'cli_error';
      throw error;
    }
    return result.stdout.trim();
  }

  async function json(args, options) {
    const text = await run(argsWithBase(args), options);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Playground CLI returned invalid JSON: ${text.slice(0, 500)}`);
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
      return json(args, { cwd, signal, env: { PLAYGROUND_CREDENTIALS_PATH: credentialsPath } });
    },
  };
}
