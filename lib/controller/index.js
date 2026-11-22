import { createControllerHandoff } from './handoff.js';
import { createControllerLifecycle } from './lifecycle.js';
import { createControllerTasks } from './tasks.js';

export function createController(ctx, getService = (name) => ctx.get?.(name), client) {
  const {
    inspect, open, promote, initialize, owns, context, enqueue, markerOf,
  } = createControllerLifecycle({ ctx, getService });
  const { tasks, observeStart, observeEnd } = createControllerTasks({ ctx, getService, inspect });
  const { dispatch, linkTask } = createControllerHandoff({ ctx, client, enqueue, inspect, markerOf, tasks });

  return { inspect, open, promote, dispatch, linkTask, tasks, observeStart, observeEnd, initialize, owns, context };
}
