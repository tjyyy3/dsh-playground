export const fail = (message, code = 'invalid_argument', reason) => ({ ok: false, error: { code, message, ...(reason ? { reason } : {}) } });
export const compact = (value) => JSON.parse(JSON.stringify(value));
export const controllerTaskError = () => fail('此对话是工作区主控。请在独立的赛题任务对话中管理赛题、记录材料引用或请求提交。', 'controller_conversation');
export const withToken = (options, token) => (typeof token === 'string' ? { ...options, token } : options);
export const rethrowCancel = (error, exec) => { if (exec.signal?.aborted || error?.code === 'cancelled') throw error; };
