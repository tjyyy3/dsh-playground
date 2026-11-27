export const fail = (message, code = 'invalid_argument', reason) => ({ ok: false, error: { code, message, ...(reason ? { reason } : {}) } });
export function attemptScopeError(scope, baseUrl) {
  if (scope.conflict === 'platform_changed' || (scope.baseUrl && scope.baseUrl !== baseUrl)) {
    return fail('任务或回执的平台地址与当前平台不一致，请核对原任务的平台设置。', 'platform_changed');
  }
  if (scope.conflict === 'challenge_mismatch') return fail('任务与回执的赛题不一致，请核对原回执。', 'challenge_mismatch');
}
export const compact = (value) => JSON.parse(JSON.stringify(value));
export const controllerTaskError = () => fail('此对话是工作区主控。请在独立的赛题任务对话中管理赛题、记录材料引用或请求提交。', 'controller_conversation');
export const withToken = (options, token) => (typeof token === 'string' ? { ...options, token } : options);
export const rethrowCancel = (error, exec) => { if (exec.signal?.aborted || error?.code === 'cancelled') throw error; };
