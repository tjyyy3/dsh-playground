
// Gateway codes come from the DSH API gateway; a business throw reaches the Client as gateway/internal.
function queryFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'transport') return '无法连接 DSH 服务，请检查连接后重试。';
  if (code === 'remote-access/denied') return '当前连接没有读取 Playground 数据的权限。';
  if (code === 'gateway/internal') {
    const detail = safeMessage(error.message);
    return `Playground 平台请求失败${detail ? `：${detail}` : ''}。请稍后重试。`;
  }
  if (/^gateway\/(invocation|definition|service|method)-unavailable$/.test(code)) {
    return 'Playground 查询服务未加载。请重启 DSH；若仍失败，当前 DSH 版本可能不支持插件查询通道。';
  }
  return `Playground 查询失败${code ? `（${code}）` : ''}，请重试。`;
}

// Error text may come from the platform, the CLI or an older plugin version. Show it only when it
// cannot carry credentials or local paths; callers fall back to a generic next step otherwise.
function safeMessage(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const text = value.trim().slice(0, 300);
  // A drive letter is one letter on its own, so a URL scheme such as `https://` is not one.
  return /bearer|authorization|token|password|secret|api[_-]?key|cookie|(?<![a-z])[a-z]:[\\/]|(?<![\w.-])\/(home|users|tmp)\//i.test(text) ? undefined : text;
}

// A failed confirmation's message that the Host marks `error.cleaned` is plugin text plus reasons the Host
// already cleaned (lib/workflow.js cleanDetail, the one definition of clean). It can be longer than
// safeMessage allows, name a field such as "token", hold a link or a bundle path such as
// `skills/users/data.csv`, so it is shown whole, up to 2000 characters. Every other message keeps the
// strict safeMessage check.
function diagnosedMessage(result) {
  if (result?.error?.cleaned !== true || typeof result.error.message !== 'string' || !result.error.message.trim()) return undefined;
  return result.error.message.trim().slice(0, 2000);
}

export { diagnosedMessage, queryFailure, safeMessage };

