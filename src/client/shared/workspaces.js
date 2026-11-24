import { msg } from './language.js';
import { h } from './react.js';

function workspaceOptions(items) {
  return items.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, item.title || msg('未命名工作区', 'Untitled workspace')));
}

export { workspaceOptions };

