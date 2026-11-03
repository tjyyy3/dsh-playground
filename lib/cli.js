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

// Callers classify these streams; they must not show or record them. Non-enumerable, so
// serializing or logging the error does not copy the CLI output.
function withStreams(error, stdout, stderr) {
  return Object.defineProperties(error, {
    stdout: { value: stdout, writable: true, configurable: true },
    stderr: { value: stderr, writable: true, configurable: true },
  });
}

const isRunning = (child) => child.pid !== undefined && child.exitCode === null && child.signalCode === null;

// POSIX CLIs lead their own process group, so a host that exits no longer takes them along with
// its terminal. Live groups are tracked and sent SIGTERM from a single exit hook, which can only
// run synchronous code. Children leave the registry when they close.
const liveChildren = new Set();
let exitHookInstalled = false;
function trackGroup(child) {
  if (process.platform === 'win32' || child.pid === undefined) return;
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', () => {
      for (const live of liveChildren) {
        try { process.kill(-live.pid, 'SIGTERM'); } catch { /* already gone */ }
      }
    });
  }
  liveChildren.add(child);
  child.once('close', () => liveChildren.delete(child));
}

// The group exists while any member is alive; ESRCH means it is gone and its id may be reused.
function groupExists(pid) {
  try { process.kill(-pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

// Ends the child and everything it started. `terminated` is false when the child had already
// exited, so a recycled PID is never signalled as a child. Windows kills the whole tree with
// taskkill and falls back to child.kill() if taskkill fails; `expire()` is the last resort once the
// grace period is over, and only acts after taskkill has finished. POSIX children lead their own process group: SIGTERM goes to the group,
// and SIGKILL follows after `graceMs` for processes that ignore it, only while the group still
// exists. A child that exited while its children still hold the output pipes gets the same
// signals but is not counted as terminated, so its own exit code is kept.
function terminate(child, graceMs) {
  const terminated = isRunning(child);
  if (process.platform === 'win32') {
    if (!terminated) return { terminated, expire() {} };
    const taskkill = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    const killer = spawn(taskkill, ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    // taskkill finds the descendants through their parent id, so the root must not be killed while
    // it may still be walking the tree: that would orphan everything below the root. Every
    // child.kill() here therefore runs only after taskkill has exited or failed to start.
    // run() can return at the end of the grace period before a slow taskkill has finished. The
    // exit handler still fires afterwards and falls back to child.kill() if taskkill failed.
    let killerDone = false;
    killer.on('error', () => {
      killerDone = true;
      if (isRunning(child)) child.kill();
    });
    killer.once('exit', (code) => {
      killerDone = true;
      if (code !== 0 && isRunning(child)) child.kill();
    });
    return { terminated, expire() { if (killerDone && isRunning(child)) child.kill(); } };
  }
  if (child.pid === undefined || (!terminated && !groupExists(child.pid))) return { terminated, expire() {} };
  const signalGroup = (name) => {
    try { process.kill(-child.pid, name); } catch { child.kill(name); }
  };
  signalGroup('SIGTERM');
  const killTimer = setTimeout(() => {
    if (groupExists(child.pid)) signalGroup('SIGKILL');
  }, graceMs);
  killTimer.unref();
  return { terminated, expire() {} };
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
  killGraceMs = 5000,
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
    if (signal?.aborted) {
      throw markStarted(withStreams(cliError('cli_terminated', 'Playground CLI was cancelled before it started.'), '', ''), false);
    }
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
        // Its own process group lets terminate() reach the CLI's children. Not on Windows, where
        // it opens a console window.
        detached: process.platform !== 'win32',
        windowsVerbatimArguments: Boolean(launch.windowsVerbatimArguments),
      });
    } catch (error) {
      throw markStarted(error, false);
    }
    trackGroup(child);
    let started = false;
    child.once('spawn', () => { started = true; });
    let stdout = '';
    let stderr = '';
    let terminated = false;
    const result = await new Promise((resolve, reject) => {
      let graceTimer;
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(graceTimer);
        if (signal) signal.removeEventListener('abort', stop);
      };
      const settle = (code, closeSignal) => {
        cleanup();
        // After a kill, taskkill and SIGKILL report a non-zero exit code or a signal. That code is
        // replaced by null so the run counts as cut short; an exit code of 0 is kept.
        resolve({ code: terminated && code !== 0 ? null : code, signal: closeSignal, stdout, stderr });
      };
      // `close` waits for every holder of the output pipes, including the CLI's own children, so
      // give up on it after the grace period.
      function stop() {
        if (graceTimer) return;
        const ending = terminate(child, killGraceMs);
        terminated = ending.terminated;
        graceTimer = setTimeout(() => {
          ending.expire();
          child.stdout.destroy();
          child.stderr.destroy();
          settle(child.exitCode, child.signalCode);
        }, killGraceMs);
      }
      const timer = setTimeout(stop, timeout);
      if (signal) signal.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      // `on`, not `once`: a later error (for example child.kill() failing) must not go unhandled.
      child.on('error', (error) => {
        // A process that never started emits no close event, so stop the timer here.
        if (!started) cleanup();
        reject(markStarted(error, started));
      });
      child.once('close', settle);
    });
    if (result.code !== 0) {
      const message = result.stderr.trim() || result.stdout.trim() || `playground exited with code ${result.code ?? 'unknown'}`;
      const error = new Error(message);
      error.code = result.code === null ? 'cli_terminated' : 'cli_error';
      throw markStarted(withStreams(error, result.stdout, result.stderr), true);
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
