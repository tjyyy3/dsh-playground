import { msg } from '../shared/language.js';
import * as React from 'react';
import { openableWebUrl } from '../shared/display.js';
import { h } from '../shared/react.js';



const releaseCss = `
  .pg-release{margin-top:12px;overflow-wrap:anywhere}.pg-release-version strong{color:var(--dsw-alias-label-primary)}.pg-release .pg-error{color:var(--pg-error)}
  .pg-release-controls{align-items:flex-end;justify-content:flex-start;margin-top:10px}
  .pg-release-link{box-sizing:border-box;display:inline-flex;align-items:center;text-decoration:none}.pg-release-spec{display:block;user-select:all;margin:8px 0}
`;

function ReleaseStatusPanel({ query }) {
  const [info, setInfo] = React.useState(null);
  const [release, setRelease] = React.useState({ status: 'loading' });
  const [copyStatus, setCopyStatus] = React.useState('');
  const [latest] = React.useState(() => ({ controller: null }));
  const cancel = () => { latest.controller?.abort(); latest.controller = null; };
  const load = async (check) => {
    setCopyStatus('');
    cancel();
    const controller = new AbortController();
    latest.controller = controller;
    setRelease({ ...release, status: check ? 'checking' : 'loading' });
    const timer = setTimeout(() => controller.abort(new Error('release_rpc_timeout')), check ? 150000 : 10000);
    try {
      const next = await Promise.race([
        query({ action: 'releases', check }, controller.signal),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
      ]);
      if (latest.controller !== controller) return;
      if (!['ready', 'unchecked', 'unavailable'].includes(next?.status)) {
        setRelease({ ...release, status: 'unavailable', error: 'failed' });
        return;
      }
      if (next.channel) setInfo(next);
      setRelease(next.status === 'ready' || !release.target ? next : { ...release, ...next,
        target: next.target ?? release.target, comparison: next.comparison ?? release.comparison,
        warnings: next.warnings ?? release.warnings, registry: next.registry });
    } catch (error) {
      if (latest.controller === controller) setRelease({ ...release, registry: undefined, status: 'unavailable',
        error: error?.message === 'release_rpc_timeout' ? check ? 'timeout' : 'info_timeout' : 'failed' });
    } finally {
      clearTimeout(timer);
    }
  };
  React.useEffect(() => { load(false); return cancel; }, [query]);
  React.useEffect(() => {
    if (release.error !== 'rate_limited' || !release.resetAt) return;
    const timer = setTimeout(() => setRelease({ ...release, status: release.target ? 'ready' : 'unchecked',
      error: undefined, resetAt: undefined }), Math.max(0, Date.parse(release.resetAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [release.error, release.resetAt]);
  const channelLabels = { stable: msg('正式版', 'Stable'), beta: 'Beta' };
  const { status, comparison } = release;
  const target = release.target;
  const runningChannel = channelLabels[info?.currentChannel];
  const targetChannel = target?.prerelease ? channelLabels.beta : channelLabels.stable;
  const targetLabel = target ? msg(`${target.version}（${targetChannel}）`, `${target.version} (${targetChannel})`) : '';
  const notesUrl = openableWebUrl(target?.notesUrl);
  const canReadNotes = notesUrl?.startsWith('https://');
  const gitSource = ['git_pinned', 'git_unpinned'].includes(info?.source);
  const gitSpec = /^github:tjyyy3\/dsh-playground#[0-9a-f]{40}$/.test(target?.gitSpec) ? target.gitSpec : null;
  const registrySource = info?.source === 'registry';
  const registryReady = status === 'ready' && release.registry?.status === 'ready';
  const installSpec = gitSource ? gitSpec : registrySource && registryReady && target ? `dsh-playground@${target.version}` : null;
  const specLabel = gitSource ? 'Git spec' : 'npm spec';
  const rateLimited = release.error === 'rate_limited';
  const errorText = {
    info_timeout: msg('读取本地版本信息超时。请稍后重试。', 'Reading local version information timed out. Try again later.'),
    timeout: msg('检查发布版本超时。请稍后检查。', 'The release check timed out. Try again later.'),
    rate_limited: msg(`GitHub 请求额度已用完。额度恢复时间为 ${release.resetAt || '未知'}，恢复前不会再次请求。`, `GitHub rate limit reached. Requests resume after ${release.resetAt || "an unknown reset time"}.`),
    failed: msg('无法读取发布版本。请检查网络后稍后检查。', 'Could not read releases. Check the network and try again.'),
    incomplete: msg('发布列表超过读取上限，未找到此渠道的版本。请查看 GitHub Releases。', 'The release list exceeded the lookup limit. Check GitHub Releases for this channel.'),
    version_unavailable: msg('无法读取本地插件版本，请在 DSH 插件管理器核对安装。', 'Could not read the local plugin version. Check the installation in the DSH plugin manager.'),
    user_action_required: msg('无法核实浏览器检查操作。请重新打开 DSH 工作台。', 'Could not verify the browser request. Reopen the DSH workbench.'),
  }[release.error] || msg('无法读取发布版本。', 'Could not read releases.');
  const statusText = {
    unchecked: msg('尚未检查更新。', 'Updates have not been checked yet.'),
    checking: msg('正在检查发布版本…', 'Checking releases…'),
    unavailable: errorText,
    ready: target && registrySource && !registryReady
      ? release.registry?.status === 'pending'
        ? msg(`GitHub 已发布 ${targetLabel}，npm ${release.registry.stage === 'tarball' ? '安装包' : '版本'}尚未就绪（404）。请稍后再次检查更新。`, `GitHub released ${targetLabel}. The npm ${release.registry.stage === "tarball" ? "package" : "version"} is unavailable (404). Check again later.`)
        : msg(`GitHub 已发布 ${targetLabel}，无法确认 npm 版本及安装包是否就绪${release.registry?.error === 'timeout' ? '（检查超时）' : ''}。请检查网络后重试。`, `GitHub released ${targetLabel}. Could not verify npm version and package availability${release.registry?.error === "timeout" ? " (check timed out)" : ""}. Check the network and try again.`)
      : target ? {
      current: msg(`当前已运行此版本（${targetChannel}）。`, `You are running this version (${targetChannel}).`),
      upgrade: msg(`可升级至 ${targetLabel}。`, `Update available: ${targetLabel}.`),
      downgrade: msg(`此渠道最新版本 ${targetLabel} 早于运行版本。降级前请核对兼容性；DSH 更新操作不接受旧版本。`, `The newest release on this channel (${targetLabel}) is older than your running version. Check compatibility before downgrading. DSH updates require a newer version.`),
    }[comparison] || msg(`已发布 ${targetLabel}。`, `${targetLabel} has been released.`) : info?.channel === 'beta' ? 'Beta 渠道暂无发布。' : '暂无稳定版发布。',
  }[status];

  return h('section', { className: 'pg-guide pg-release', 'aria-label': msg('Playground 版本与更新', 'Playground version and updates') },
    h('style', null, releaseCss),
    h('h2', { className: 'pg-brand' }, msg('Playground 版本与更新', 'Playground version and updates')),
    h('p', { className: 'pg-note pg-release-version' }, info?.currentVersion
      ? h(React.Fragment, null, msg('当前运行版本 ', 'Running version '), h('strong', null, info.currentVersion), runningChannel ? ` · ${runningChannel}` : '')
      : status === 'loading' ? msg('正在读取运行版本…', 'Reading running version…') : msg('无法读取运行版本。', 'Could not read the running version.')),
    info?.installedVersion ? h('p', { className: 'pg-note' }, msg(`磁盘版本 ${info.installedVersion}。${info.restartRequired ? '磁盘版本较新，需要重启 DSH。' : ''}`, `Installed version: ${info.installedVersion}.${info.restartRequired ? " Restart DSH to use the newer version." : ""}`)) : null,
    info?.sourceHint ? h('p', { className: 'pg-note' }, msg(info.sourceHint, {
      registry: 'Installed from npm. Checking for updates verifies the version and its public package on npm.',
      git_pinned: 'Installed from a pinned Git commit. Update in the DSH plugin manager with the release Git spec from the same repository and directory.',
      git_unpinned: 'The current Git spec lacks a full commit SHA. Check releases, then paste a pinned Git spec into the DSH third-party installation field to replace this copy. DSH may request a restart. Remove and reinstall only if DSH returns already-installed.',
      link: 'Local development link. Update the code in the linked directory, then reload or restart as prompted by DSH.',
      file: 'Installed from a local file or archive. Copy a pinned Git spec from GitHub Releases and paste it into the DSH third-party installation field. A restart may be required. Remove and reinstall only if DSH returns already-installed.',
      unknown: 'Installation source unknown. Check the source in the DSH plugin manager before installing or updating.',
    }[info.source] || info.sourceHint)) : null,
    h('div', { className: 'pg-head pg-release-controls' },
      h('span', { className: 'pg-note' }, msg(`更新渠道 ${channelLabels[info?.channel] || '读取中'}。在插件配置 releaseChannel 中修改。`, `Update channel: ${channelLabels[info?.channel] || "Loading"}. Change releaseChannel in the plugin configuration.`)),
      h('button', { type: 'button', className: 'pg-button', disabled: status === 'loading' || status === 'checking' || rateLimited, onClick: () => load(true) },
        status === 'checking' ? msg('正在检查…', 'Checking…') : rateLimited ? msg('等待额度恢复', 'Waiting for rate limit reset') : msg('检查更新', 'Check for updates'))),
    info?.channel === 'beta' ? h('p', { className: 'pg-note' }, msg('Beta 提供抢先功能，可能不稳定。', 'Beta includes early features and may be unstable.')) : null,
    h('p', { className: status === 'unavailable' ? 'pg-note pg-error' : 'pg-note', role: 'status' }, statusText),
    release.warnings?.includes('prerelease_mismatch') ? h('p', { className: 'pg-note' }, msg('部分 Release 的预发布标志与 tag 不一致，已跳过。请在 GitHub Releases 核对。', 'Some releases were skipped because their prerelease flag and tag disagree. Check GitHub Releases.')) : null,
    target ? h(React.Fragment, null,
      release.incomplete ? h('p', { className: 'pg-note' }, msg('发布列表超过读取上限，以上为已读取发布中的最高版本。请在 GitHub Releases 核对完整列表。', 'The release list exceeded the lookup limit. This is the newest version found. Check GitHub Releases for the full list.')) : null,
      canReadNotes ? h('a', { className: 'pg-button pg-release-link', href: notesUrl, target: '_blank', rel: 'noopener noreferrer' }, msg('发布说明', 'Release notes')) : null,
      installSpec ? h(React.Fragment, null,
        h('code', { className: 'pg-release-spec' }, installSpec),
        h('button', { type: 'button', className: 'pg-button', onClick: async () => {
          try { await navigator.clipboard.writeText(installSpec); setCopyStatus('copied'); }
          catch { setCopyStatus('failed'); }
        } }, msg(`复制 ${specLabel}`, `Copy ${specLabel}`)), h('span', { role: 'status', className: 'pg-note'  }, copyStatus === 'copied' ? msg(`已复制 ${specLabel}`, `Copied ${specLabel}`) : copyStatus === 'failed' ? msg(`无法复制，请选择上方 ${specLabel} 后复制。`, `Could not copy. Select the ${specLabel} above and copy it manually.`) : '')) : null,
      registrySource && registryReady ? h('p', { className: 'pg-note' }, msg('npm 版本及公开安装包已就绪。DSH 不会更新第三方 npm 插件，再次安装同名插件会返回 already-installed。先在 DSH 插件管理器卸载本插件，再把上方 npm spec 填入第三方插件安装框重新安装，可能提示重启。插件配置会保留。', 'The npm version and public package are ready. DSH cannot update third-party npm plugins in place. Reinstalling an existing package returns already-installed. Remove this plugin in the DSH plugin manager, then paste the npm spec above into the third-party installation field. You may need to restart DSH. Your plugin settings are retained.')) : null,
      gitSource && !gitSpec ? h('p', { className: 'pg-note' }, msg('此 Release 未提供完整 commit SHA，无法生成固定 Git spec。', 'This release lacks a full commit SHA, so a pinned Git spec is unavailable.')) : null) : null);
}

export { ReleaseStatusPanel };

