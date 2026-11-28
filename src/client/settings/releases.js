import { msg } from '../shared/language.js';
import * as React from 'react';
import { openableWebUrl } from '../shared/display.js';
import { h } from '../shared/react.js';
import { useRequestScope } from '../shared/request-scope.js';



function icon(path, size = 16) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: path }));
}

function ReleaseIndicator({ checks, active, open }) {
  const { version } = React.useSyncExternalStore(checks.subscribe, checks.getSnapshot);
  React.useEffect(() => {
    if (!active) return;
    void checks.check();
    window.addEventListener?.('focus', checks.check);
    return () => window.removeEventListener?.('focus', checks.check);
  }, [checks, active]);
  return version ? h('button', { type: 'button', className: 'pg-release-indicator', onClick: open,
    title: msg(`查看版本 ${version}`, `View version ${version}`) }, icon('M12 20V4m0 0-6 6m6-6 6 6', 14), msg('有新版本', 'Update available')) : null;
}

function ReleaseStatusPanel({ query, checks, installRelease, visit, onAvailable }) {
  const { enabled } = React.useSyncExternalStore(checks.subscribe, checks.getSnapshot);
  const heading = React.useRef(null);
  const [installState, setInstallState] = React.useState('');
  const scope = useRequestScope([query]);
  const [info, setInfo] = React.useState(null);
  const [release, setRelease] = React.useState({ status: 'loading' });
  const [copyStatus, setCopyStatus] = React.useState('');
  const load = async (check) => {
    const request = scope.begin('release');
    if (!request) return;
    scope.abort('copy');
    setCopyStatus('');
    const timeout = new AbortController();
    const signal = AbortSignal.any([request.signal, timeout.signal]);
    setRelease({ ...release, status: check ? 'checking' : 'loading' });
    const timer = setTimeout(() => timeout.abort(new Error('release_rpc_timeout')), check ? 150000 : 10000);
    try {
      const next = await Promise.race([
        query({ action: 'releases', check, ...(check ? { verifyPackage: true } : {}) }, signal),
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
      ]);
      if (!request.isCurrent()) return;
      if (!['ready', 'unchecked', 'unavailable'].includes(next?.status)) {
        setRelease({ ...release, status: 'unavailable', error: 'failed' });
        return;
      }
      if (next.channel) setInfo(next);
      if (check) checks.checked(next);
      setRelease(next.status === 'ready' || !release.target ? next : { ...release, ...next,
        target: next.target ?? release.target, comparison: next.comparison ?? release.comparison,
        warnings: next.warnings ?? release.warnings, registry: next.registry });
    } catch (error) {
      if (request.isCurrent()) setRelease({ ...release, registry: undefined, status: 'unavailable',
        error: error?.message === 'release_rpc_timeout' ? check ? 'timeout' : 'info_timeout' : 'failed' });
    } finally {
      clearTimeout(timer);
      request.finish();
    }
  };
  React.useEffect(() => {
    if (visit) heading.current?.focus();
    load(Boolean(visit));
    return () => scope.abort('release');
  }, [scope, visit]);
  React.useEffect(() => {
    if (release.error !== 'rate_limited' || !release.resetAt) return;
    const timer = setTimeout(() => {
      if (scope.isCurrent()) setRelease({ ...release, status: release.target ? 'ready' : 'unchecked',
        error: undefined, resetAt: undefined });
    }, Math.max(0, Date.parse(release.resetAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [scope, release.error, release.resetAt]);
  const channelLabels = { stable: msg('正式版', 'Stable'), beta: 'Beta' };
  const { status, comparison } = release;
  const target = release.target;
  const targetChannel = target?.prerelease ? channelLabels.beta : channelLabels.stable;
  const targetLabel = target ? msg(`${target.version}（${targetChannel}）`, `${target.version} (${targetChannel})`) : '';
  const notesUrl = openableWebUrl(target?.notesUrl);
  const canReadNotes = notesUrl?.startsWith('https://');
  const gitSource = ['git_pinned', 'git_unpinned'].includes(info?.source);
  const gitSpec = /^github:tjyyy3\/dsh-playground#[0-9a-f]{40}$/.test(target?.gitSpec) ? target.gitSpec : null;
  const registrySource = info?.source === 'registry';
  const registryReady = status === 'ready' && release.registry?.status === 'ready';
  const registryUpgrade = registrySource && registryReady && target && comparison === 'upgrade'
    && release.compatible !== false && !release.restartRequired && !release.incomplete;
  const installSpec = gitSource ? gitSpec : registrySource && registryReady && target && release.compatible !== false ? `dsh-playground@${target.version}` : null;
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
    loading: msg('正在读取插件版本…', 'Reading plugin version…'),
    unchecked: msg('尚未检查更新。', 'Updates have not been checked yet.'),
    checking: msg('正在检查发布版本…', 'Checking releases…'),
    unavailable: errorText,
    ready: target && registrySource && !registryReady
      ? release.registry?.status === 'pending'
        ? msg(`GitHub 已发布 ${targetLabel}，npm ${release.registry.stage === 'tarball' ? '安装包' : '版本'}尚未就绪（404）。请稍后再次检查更新。`, `GitHub released ${targetLabel}. The npm ${release.registry.stage === "tarball" ? "package" : "version"} is unavailable (404). Check again later.`)
        : msg(`GitHub 已发布 ${targetLabel}，无法确认 npm 版本及安装包是否就绪${release.registry?.error === 'timeout' ? '（检查超时）' : ''}。请检查网络后重试。`, `GitHub released ${targetLabel}. Could not verify npm version and package availability${release.registry?.error === "timeout" ? " (check timed out)" : ""}. Check the network and try again.`)
      : target && release.compatible === false ? msg(`版本 ${targetLabel} 与当前 DSH 不兼容。`, `Version ${targetLabel} is incompatible with this DSH host.`)
      : target ? {
      current: msg(`当前已运行此版本（${targetChannel}）。`, `You are running this version (${targetChannel}).`),
      upgrade: msg(`可升级至 ${targetLabel}。`, `Update available: ${targetLabel}.`),
      downgrade: msg(`此渠道最新版本 ${targetLabel} 早于运行版本。降级前请核对兼容性；DSH 更新操作不接受旧版本。`, `The newest release on this channel (${targetLabel}) is older than your running version. Check compatibility before downgrading. DSH updates require a newer version.`),
    }[comparison] || msg(`已发布 ${targetLabel}。`, `${targetLabel} has been released.`) : info?.channel === 'beta'
      ? msg('Beta 渠道暂无发布。', 'No releases on the beta channel yet.') : msg('暂无稳定版发布。', 'No stable release yet.'),
  }[status];

  const showTarget = status === 'ready' && comparison === 'upgrade' && target && release.compatible !== false
    && !info?.restartRequired && (!registrySource || registryReady);
  const updateAvailable = status === 'ready' && comparison === 'upgrade' && Boolean(target) && !info?.restartRequired;
  React.useEffect(() => { onAvailable?.(updateAvailable); }, [updateAvailable, onAvailable]);

  return h('div', { className: 'pg-settings-release' },
    h('header', { className: 'pg-release-header' },
      h('h2', { ref: heading, tabIndex: -1 }, msg('版本与更新', 'Version and updates')),
      info?.channel ? h('span', { className: 'pg-settings-release-channel' }, channelLabels[info.channel]) : null),
    h('div', { className: 'pg-settings-release-card', 'data-status': status, 'data-tone': showTarget ? 'info' : undefined },
      h('div', { className: 'pg-release-summary' },
        h('div', { className: 'pg-release-versions', 'aria-live': 'polite' },
          h('div', { className: 'pg-release-version' }, h('small', null, msg('当前版本', 'Current version')),
            h('strong', null, info?.currentVersion || (status === 'loading' ? '…' : msg('未知', 'Unknown')))),
          showTarget || (target && status === 'unavailable') ? h(React.Fragment, null, h('span', { className: 'pg-release-arrow', 'aria-hidden': true }, '→'),
            h('div', { className: 'pg-release-version pg-release-target' }, h('small', null, showTarget ? msg('可更新至', 'Available version') : msg('上次检查', 'Last checked')), h('strong', null, target.version))) : null),
        h('div', { className: 'pg-release-actions' },
          canReadNotes ? h('a', { className: 'pg-button', href: notesUrl, target: '_blank', rel: 'noopener noreferrer' }, msg('发布说明', 'Release notes')) : null,
          registryUpgrade && release.canInstall
            ? h('button', { type: 'button', className: 'pg-button pg-primary', disabled: scope.pending('install') || ['restart-required', 'applied'].includes(installState),
              onClick: async () => {
                if (scope.pending('install')) return;
                const request = scope.begin('install');
                if (!request) return;
                setInstallState('installing');
                try {
                  const result = await installRelease(target.version);
                  if (!request.isCurrent()) return;
                  setInstallState(result.status);
                  if (['restart-required', 'applied'].includes(result.status)) { checks.installed(); await load(false); }
                } catch { if (request.isCurrent()) setInstallState('unverified'); }
                finally { request.finish(); }
              } }, msg('立即更新', 'Update now')) : null)),
    statusText && !showTarget ? h('p', { role: 'status', className: status === 'unavailable' ? 'pg-release-message pg-error' : 'pg-note pg-release-message' }, statusText) : null,
    info?.restartRequired && !installState ? h('p', { className: 'pg-note pg-release-message' }, msg('新版已安装，重启 DSH 后生效。', 'Update installed. Restart DSH when ready.')) : null,
    installState ? h('p', { role: 'status', className: 'pg-note pg-release-message' }, ({
      installing: msg('DSH 正在安装更新…', 'DSH is installing the update…'),
      'restart-required': msg('新版已安装，下次重启 DSH 时生效。', 'Update installed. Restart DSH when ready.'),
      applied: msg('新版已生效。', 'Update applied.'),
      busy: msg('已有更新正在进行。', 'An update is already in progress.'),
      restored: msg('升级失败，DSH 已恢复旧版本。', 'The update failed. DSH restored the previous version.'),
      failed: msg('DSH 未能完成升级。请在插件管理器核对已安装版本。', 'DSH could not finish the update. Check the installed version in the plugin manager.'),
    })[installState] || msg('请重新检查已安装版本及可用更新。', 'Check the installed version and available updates again.')) : null,
      target && release.incomplete ? h('p', { className: 'pg-note pg-release-message' }, msg('发布列表超过读取上限，以上为已读取发布中的最高版本。请在 GitHub Releases 核对完整列表。', 'The release list exceeded the lookup limit. This is the newest version found. Check GitHub Releases for the full list.')) : null,
    release.warnings?.includes('prerelease_mismatch') ? h('p', { className: 'pg-note pg-release-message' }, msg('部分 Release 的预发布标志与 tag 不一致，已跳过。请在 GitHub Releases 核对。', 'Some releases were skipped because their prerelease flag and tag disagree. Check GitHub Releases.')) : null,
    showTarget && registryReady ? h('div', { className: 'pg-release-verified' },
      h('span', null, msg('npm 版本及公开安装包已就绪', 'npm version and public package verified')),
      release.compatible === true ? h('span', null, msg('与当前 DSH 兼容', 'Compatible with this DSH host')) : null) : null),
    h('div', { className: 'pg-release-pref' },
      h('span', { className: 'pg-release-source' }, msg('安装来源', 'Installation source'), ' ',
        h('span', { className: 'pg-release-source-value' }, ({
          registry: 'npm · dsh-playground',
          git_pinned: 'Git',
          git_unpinned: 'Git',
          file: msg('本地文件', 'Local file'),
          link: msg('开发链接', 'Development link'),
        })[info?.source] ?? msg('未知', 'Unknown'))),
      h('label', null, msg('自动检查更新', 'Automatically check for updates'),
        h('input', { type: 'checkbox', role: 'switch', checked: enabled, onChange: event => checks.setEnabled(event.target.checked) })),
      h('button', { type: 'button', className: 'pg-button pg-release-check', disabled: status === 'loading' || status === 'checking' || rateLimited, onClick: () => load(true) },
        icon('M20 10a8 8 0 1 0 0 5m0-11v6h-6', 14), status === 'checking' ? msg('正在检查…', 'Checking…') : rateLimited ? msg('等待额度恢复', 'Waiting for rate limit reset') : msg('检查更新', 'Check for updates'))),
    h('details', { className: 'pg-release-details' }, h('summary', null, msg('安装详情', 'Installation details')),
      h('p', { className: 'pg-note' }, msg(`更新渠道 ${channelLabels[info?.channel] || '读取中'}。在插件配置 releaseChannel 中修改。`, `Update channel: ${channelLabels[info?.channel] || 'Loading'}. Change releaseChannel in the plugin configuration.`)),
      info?.channel === 'beta' ? h('p', { className: 'pg-note' }, msg('Beta 提供抢先功能，可能不稳定。', 'Beta includes early features and may be unstable.')) : null,
      info?.installedVersion ? h('p', { className: 'pg-note' }, msg(`磁盘版本 ${info.installedVersion}。${info.restartRequired ? '磁盘版本较新，需要重启 DSH。' : ''}`, `Installed version: ${info.installedVersion}.${info.restartRequired ? " Restart DSH to use the newer version." : ""}`)) : null,
      info?.sourceHint ? h('p', { className: 'pg-note' }, msg(info.sourceHint, {
        registry: 'Installed from npm. Checking for updates verifies the version and its public package on npm.',
        git_pinned: 'Installed from a pinned Git commit. Update in the DSH plugin manager with the release Git spec from the same repository and directory.',
        git_unpinned: 'The current Git spec lacks a full commit SHA. Check releases, then paste a pinned Git spec into the DSH third-party installation field to replace this copy. DSH may request a restart. Remove and reinstall only if DSH returns already-installed.',
        link: 'Local development link. Update the code in the linked directory, then reload or restart as prompted by DSH.',
        file: 'Installed from a local file or archive. Copy a pinned Git spec from GitHub Releases and paste it into the DSH third-party installation field. A restart may be required. Remove and reinstall only if DSH returns already-installed.',
        unknown: 'Installation source unknown. Check the source in the DSH plugin manager before installing or updating.',
      }[info.source] || info.sourceHint)) : null,
      installSpec ? h(React.Fragment, null,
        h('code', { className: 'pg-release-spec' }, installSpec),
        h('button', { type: 'button', className: 'pg-button', onClick: async () => {
          const request = scope.begin('copy');
          if (!request) return;
          try { await navigator.clipboard.writeText(installSpec); if (request.isCurrent()) setCopyStatus('copied'); }
          catch { if (request.isCurrent()) setCopyStatus('failed'); }
          finally { request.finish(); }
        } }, msg(`复制 ${specLabel}`, `Copy ${specLabel}`)), h('span', { role: 'status', className: 'pg-note'  }, copyStatus === 'copied' ? msg(`已复制 ${specLabel}`, `Copied ${specLabel}`) : copyStatus === 'failed' ? msg(`无法复制，请选择上方 ${specLabel} 后复制。`, `Could not copy. Select the ${specLabel} above and copy it manually.`) : '')) : null,
      registryUpgrade && !release.canInstall ? h('p', { className: 'pg-note' }, msg('npm 版本及公开安装包已就绪。手动更新时，先在 DSH 插件管理器卸载本插件，再使用上方 npm spec 重新安装，可能提示重启。插件配置会保留。', 'The npm version and public package are ready. To update manually, remove this plugin and reinstall with the npm spec above. Restart if prompted. Your plugin settings are retained.')) : null,
      target && gitSource && !gitSpec ? h('p', { className: 'pg-note' }, msg('此 Release 未提供完整 commit SHA，无法生成固定 Git spec。', 'This release lacks a full commit SHA, so a pinned Git spec is unavailable.')) : null));
}

export { ReleaseStatusPanel, ReleaseIndicator };
