import { h } from './react.js';

function workspaceOptions(items) {
  return items.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title || '未命名工作区'));
}

export { workspaceOptions };

