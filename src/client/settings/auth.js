import * as React from 'react';
import { openableWebUrl, webRootOf } from '../shared/display.js';
import { h } from '../shared/react.js';

// Where the Host found the token it uses (`tokenSource` of the auth query); the value never reaches the Client.
// `dsh_other` is a value the DSH credential store answered from an origin the Host could not confirm, so
// unsetting it might not remove it; it gets no 清除令牌.
const TOKEN_SOURCES = { dsh: 'DSH 凭据', dsh_other: 'DSH 凭据（来源未确认）', cli_file: 'CLI 凭据文件', env: '环境变量', config: '插件配置' };

// The sources that win over the CLI credentials file an email login writes.
const ABOVE_CLI_FILE = { dsh: 'DSH 凭据中保存的令牌', dsh_other: 'DSH 凭据存储提供的令牌（来源未确认）', env: '环境变量 PLAYGROUND_TOKEN 中的令牌', config: '插件配置中的令牌' };

const TOKEN_PAGE = '网站“我的面板 → API 与 Agent”';

const isAgentUser = (user) => typeof user?.userType === 'string' && user.userType.trim().toLowerCase() === 'agent';

// The website's API token page (我的面板 → API 与 Agent), on the site the plugin talks to.
function tokenPageUrl(apiBase) {
  const root = typeof apiBase === 'string' && apiBase ? webRootOf(apiBase) : '';
  return root ? openableWebUrl(`${root}/#dashboard/api`) : undefined;
}

const authCss = '.pg-auth .pg-form{display:grid;gap:8px;margin-top:10px}.pg-auth .pg-field{display:grid;gap:4px;font-size:12px}.pg-auth .pg-input{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:7px}.pg-auth-other{margin-top:12px;font-size:12px;color:var(--dsw-alias-label-secondary)}.pg-auth-other summary{cursor:pointer}.pg-auth-other summary:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}';

// Why a saved or found token does not log in, with the next step for where it came from.
function tokenProblem(state) {
  const source = state.tokenSource;
  const fromFile = state.cliFilePath ? `CLI 凭据文件 ${state.cliFilePath}` : 'CLI 凭据文件';
  const next = source === 'dsh' ? `请到${TOKEN_PAGE}生成新令牌，粘贴到下方保存（会替换当前令牌），或点击“清除令牌”。`
    : source === 'cli_file' ? `当前令牌来自${fromFile}。请在下方保存新令牌（DSH 凭据优先于该文件），或在终端运行 playground auth login 重新登录。`
      : source === 'env' ? '当前令牌来自环境变量 PLAYGROUND_TOKEN。请在下方保存新令牌（DSH 凭据优先于环境变量），或更新该环境变量后重启 DSH。'
        : source === 'config' ? '当前令牌来自插件配置，它优先于其他来源，在这里保存的令牌不会生效。请修改或删除插件配置中的令牌。'
          : source === 'dsh_other' ? '当前令牌由 DSH 凭据存储提供，但插件无法确认它保存在 DSH 中还是来自 DSH 的环境变量。请在下方保存新令牌（会替换 DSH 中保存的令牌），或检查 DSH 环境中的 PLAYGROUND_TOKEN 变量。'
            : `请到${TOKEN_PAGE}生成新令牌并保存。`;
  if (state.reason === 'rejected') return ['令牌无效', `令牌无效、已过期或已撤销。${next}`];
  return ['无权访问', `Playground 拒绝了当前账号的访问（HTTP 403）。请确认账号状态，或换用其他账号的令牌。${next}`];
}

// What clearing the DSH copy leads to. DSH's credentials-local answers PLAYGROUND_TOKEN from its own
// environment when nothing is saved, before the plugin reads the CLI credentials file. A value DSH then
// takes from a `.env` file is not reported to the Client, so the note cannot mention it (see README).
function clearNote(state) {
  if (state.tokenSource !== 'dsh') return '';
  if (state.envToken) return `DSH 的环境中还有 PLAYGROUND_TOKEN 变量。清除 DSH 中保存的令牌后，插件会改用该变量中的令牌（它优先于 CLI 凭据文件）；插件不会修改环境变量${state.cliFileToken ? '或 CLI 凭据文件' : ''}。`;
  if (state.cliFileToken) return `CLI 凭据文件 ${state.cliFilePath || ''} 中也有令牌。清除 DSH 中的令牌后，插件仍会使用该文件中的令牌；插件不会修改这个文件。`;
  return '';
}

// After a successful email login: the CLI wrote its credentials file, but a higher source still wins.
function loginOverridden(state) {
  const what = ABOVE_CLI_FILE[state.tokenSource];
  if (!what) return '';
  const next = state.tokenSource === 'dsh'
    ? (state.envToken
      ? '清除令牌后，插件会改用 DSH 环境变量 PLAYGROUND_TOKEN 中的令牌，它可能不是刚登录的账号；如需改用该账号，还需移除这个环境变量并重启 DSH。'
      : '点击“清除令牌”后，插件改用刚登录的账号。')
    : state.tokenSource === 'config' ? '如需改用刚登录的账号，请删除插件配置中的令牌。'
      : state.tokenSource === 'env' ? '如需改用刚登录的账号，请移除 DSH 环境中的 PLAYGROUND_TOKEN 变量后重启 DSH。'
        : '如需改用刚登录的账号，请移除 DSH 凭据中的 PLAYGROUND_TOKEN，以及 DSH 环境中的同名变量，然后重启 DSH。';
  return `CLI 登录成功，但插件仍在使用${what}，它优先于 CLI 凭据文件。${next}`;
}

function AuthStatusPanel({ query, login, saveToken, clearToken, onStatusChange }) {
  // `state` is the last auth answer (null until the first one). It stays rendered while a re-check runs,
  // so the controls keep their place; `checking` only marks the re-check.
  const [state, setState] = React.useState(null);
  const [checking, setChecking] = React.useState(true);
  // `seq` numbers the checks so only the latest answer is shown; `status` is the status line, which takes
  // focus after a save, clear or login (`refocus`) because the control that was used may be gone.
  const [latest] = React.useState(() => ({ seq: 0, status: null, refocus: false }));
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [loginError, setLoginError] = React.useState('');
  const [loginDone, setLoginDone] = React.useState(false);
  const [token, setToken] = React.useState('');
  const [tokenBusy, setTokenBusy] = React.useState(false);
  const [tokenError, setTokenError] = React.useState('');
  const check = async () => {
    const seq = ++latest.seq;
    setChecking(true);
    let next;
    try { next = await query({ action: 'auth' }); } catch (failure) { next = { error: failure.message }; }
    // A check started later is still running or has answered; its answer is the current one.
    if (seq !== latest.seq) return;
    setState(next && typeof next === 'object' ? next : {});
    setChecking(false);
    if (latest.refocus) { latest.refocus = false; latest.status?.focus?.(); }
  };
  React.useEffect(() => { check(); }, [query]);
  React.useEffect(() => {
    onStatusChange?.(!state || checking ? 'checking' : state.authenticated ? 'authenticated'
      : state.error || ['network', 'unavailable'].includes(state.reason) ? 'unavailable' : 'unauthenticated');
  }, [state, checking, onStatusChange]);
  const submitLogin = async () => {
    setLoginBusy(true); setLoginError(''); setLoginDone(false);
    try {
      await login(email, password);
      setPassword('');
      setLoginDone(true);
      latest.refocus = true;
      await check();
    } catch (failure) { setLoginError(failure.message); }
    finally { setLoginBusy(false); }
  };
  // The token goes only to the DSH credential store; the auth check that follows carries no token.
  const submitToken = async () => {
    if (!token.trim()) { setTokenError('请先粘贴 API 令牌。'); return; }
    setTokenBusy(true); setTokenError(''); setLoginDone(false);
    try {
      await saveToken(token);
      setToken('');
      latest.refocus = true;
      await check();
    } catch (failure) { setTokenError(failure.message); }
    finally { setTokenBusy(false); }
  };
  const removeToken = async () => {
    setTokenBusy(true); setTokenError(''); setLoginDone(false);
    try {
      await clearToken();
      latest.refocus = true;
      await check();
    } catch (failure) { setTokenError(failure.message); }
    finally { setTokenBusy(false); }
  };
  const loading = !state;
  const current = state || {};
  const user = current.user || {};
  const agent = isAgentUser(user);
  const operator = user.operatorName || (user.operatorId !== undefined && user.operatorId !== null && user.operatorId !== '' ? `#${user.operatorId}` : '');
  const operatorState = user.operatorConfirmed === true ? '（已确认）' : user.operatorConfirmed === false ? '（未确认）' : '';
  const sourceLabel = TOKEN_SOURCES[current.tokenSource];
  const stored = current.tokenSource === 'dsh';
  // A plugin-config token wins over everything, so a token saved here would never be used.
  const fromConfig = current.tokenSource === 'config';
  const pageUrl = tokenPageUrl(current.baseUrl);
  const refused = current.reason === 'rejected' || current.reason === 'forbidden';
  const [refusedBadge, refusedText] = refused ? tokenProblem(current) : [];
  const failedCheck = current.reason === 'network' || current.reason === 'unavailable';
  const note = clearNote(current);
  const overridden = loginDone && !loading ? loginOverridden(current) : '';
  const badge = (tone, label) => h('span', { className: 'pg-badge', 'data-tone': tone }, label);
  const sourceTail = sourceLabel ? ` 令牌来源：${sourceLabel}` : '';
  const summary = loading ? '正在检查当前 DSH 是否已配置 Playground 凭据…'
    : current.authenticated ? h(React.Fragment, null, badge('success', '已登录'), ' ', user.name || user.email || 'Playground 用户')
      : refused ? h(React.Fragment, null, badge('error', refusedBadge), sourceTail)
        : failedCheck ? h(React.Fragment, null, badge('error', '检测失败'), sourceTail)
          : h(React.Fragment, null, badge(current.error ? 'error' : 'warning', current.error ? '检测失败' : '未登录'), ' 公开赛题仍可浏览；查询个人提交和上传评测包需要登录。');
  const clearButton = stored ? h('button', { type: 'button', className: 'pg-button', disabled: tokenBusy, onClick: removeToken }, '清除令牌') : null;
  const tokenForm = h('form', { className: 'pg-form pg-auth-token', 'aria-label': 'API 令牌登录', onSubmit: (event) => { event.preventDefault(); if (!tokenBusy) submitToken(); } },
    h('p', { className: 'pg-note' }, `在${TOKEN_PAGE}登录后生成个人令牌或 Agent 账号令牌，粘贴到这里保存。令牌只保存在 DSH 凭据存储中，不会写入对话、命令或日志；保存后自动检测登录状态。`),
    pageUrl ? h('div', { className: 'pg-actions' }, h('button', { type: 'button', className: 'pg-button', onClick: () => { window.open(pageUrl, '_blank', 'noopener,noreferrer'); } }, '去网站生成令牌')) : null,
    h('label', { className: 'pg-field' }, 'API 令牌', h('input', { className: 'pg-input', type: 'password', value: token, autoComplete: 'off', spellCheck: false, onChange: (event) => setToken(event.target.value) })),
    // Enabled while the field is empty, so a click explains what is missing instead of doing nothing.
    h('div', { className: 'pg-actions' }, h('button', { type: 'submit', className: 'pg-button pg-primary', disabled: tokenBusy }, tokenBusy ? '正在保存…' : '保存令牌')),
    tokenError ? h('p', { className: 'pg-error', role: 'alert' }, tokenError) : null);
  const configNote = fromConfig ? h('p', { className: 'pg-note pg-auth-config' }, '令牌来自插件配置，它优先于在工作台保存的令牌，所以这里不提供保存或更换令牌。如需更换，请修改或删除插件配置中的令牌。') : null;
  // Only the status line is a live region; the forms and longer notes are not re-announced on every check.
  return h('section', { className: 'pg-guide pg-auth', 'aria-label': 'Playground 登录状态', 'aria-busy': checking || loginBusy || tokenBusy },
    h('style', null, authCss),
    h('div', { className: 'pg-head' }, h('h2', { className: 'pg-brand' }, 'Playground 连接状态'),
      h('button', { className: 'pg-button', disabled: checking, onClick: check }, checking ? '正在检测…' : '重新检测')),
    h('div', { className: 'pg-auth-status', role: 'status', 'aria-live': 'polite', tabIndex: -1, ref: (node) => { latest.status = node; } },
      h('p', { className: 'pg-note' }, summary),
      !loading && checking ? h('p', { className: 'pg-note' }, '正在重新检测登录状态…') : null,
      overridden ? h('p', { className: 'pg-note pg-auth-login-note' }, badge('warning', '仍在使用原令牌'), ' ', overridden) : null),
    !loading && current.cliUpdate?.warning ? h('p', { className: 'pg-note pg-cli-update' }, badge('warning', 'CLI 需更新'), ' ', current.cliUpdate.warning) : null,
    loading ? null : current.authenticated ? h(React.Fragment, null,
      h('p', { className: 'pg-note pg-auth-identity' }, `身份：${agent ? 'Agent 账号' : '本人'}。提交会记在这个身份名下。`),
      agent && operator ? h('p', { className: 'pg-note' }, `操作人：${operator}${operatorState}`) : null,
      agent && user.agentFramework ? h('p', { className: 'pg-note' }, `Agent 框架：${user.agentFramework}`) : null,
      user.email ? h('p', { className: 'pg-note' }, user.email) : null,
      sourceLabel ? h('p', { className: 'pg-note' }, `令牌来源：${sourceLabel}`) : null,
      note ? h('p', { className: 'pg-note pg-auth-file' }, note) : null,
      current.baseUrl ? h('p', { className: 'pg-note pg-path' }, `API：${current.baseUrl}`) : null,
      clearButton ? h('div', { className: 'pg-actions' }, clearButton) : null,
      fromConfig ? configNote : h('details', { className: 'pg-auth-other' }, h('summary', null, '更换令牌'), tokenForm))
      : h(React.Fragment, null,
        refused ? h('p', { className: 'pg-error', role: 'alert' }, refusedText)
          : failedCheck ? h('p', { className: 'pg-error', role: 'alert' }, current.reason === 'network'
            ? '无法连接 Playground 平台，暂时无法确认登录状态。请检查网络后点击“重新检测”。'
            : 'Playground 平台暂时无法确认登录状态，请稍后点击“重新检测”。')
            : current.error ? h('p', { className: 'pg-error', role: 'alert' }, current.error) : null,
        note ? h('p', { className: 'pg-note pg-auth-file' }, note) : null,
        clearButton ? h('div', { className: 'pg-actions' }, clearButton) : null,
        fromConfig ? configNote : tokenForm,
        h('details', { className: 'pg-auth-other' }, h('summary', null, '其他登录方式'),
          h('p', { className: 'pg-note' }, '用 Playground CLI 注册、设有密码的账号可以用邮箱和密码登录。插件会调用已安装的 Playground CLI；密码只通过 DSH 凭据通道传给 CLI，不会写入对话，登录结束后即从 DSH 凭据中删除。登录写入 CLI 凭据文件，而 DSH 凭据、DSH 环境变量或插件配置中的令牌都优先于这个文件。也可以在 DSH 启动前完成 playground auth login，再点击“重新检测”。'),
          h('form', { className: 'pg-form', onSubmit: (event) => { event.preventDefault(); if (!loginBusy && email.trim() && password) submitLogin(); } },
            h('label', { className: 'pg-field' }, 'Playground 邮箱', h('input', { className: 'pg-input', type: 'email', value: email, autoComplete: 'username', onChange: (event) => setEmail(event.target.value) })),
            h('label', { className: 'pg-field' }, 'Playground 密码', h('input', { className: 'pg-input', type: 'password', value: password, autoComplete: 'current-password', onChange: (event) => setPassword(event.target.value) })),
            h('button', { type: 'submit', className: 'pg-button pg-primary', disabled: loginBusy || !email.trim() || !password }, loginBusy ? '正在登录…' : '登录 Playground'),
            loginError ? h('p', { className: 'pg-error', role: 'alert' }, loginError) : null))));
}

export { AuthStatusPanel };

