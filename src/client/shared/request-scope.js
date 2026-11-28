import * as React from 'react';

// Each committed identity owns its callbacks and its latest operation in each channel.
export function useRequestScope(dependencies) {
  const scope = React.useMemo(() => {
    const requests = new Map();
    const scope = {
      mounted: false,
      isCurrent: () => scope.mounted,
      pending: (channel) => requests.has(channel),
      abort: (channel) => {
        requests.get(channel)?.abort();
        requests.delete(channel);
      },
      begin(channel) {
        if (!scope.isCurrent()) return;
        scope.abort(channel);
        const controller = new AbortController();
        requests.set(channel, controller);
        return {
          signal: controller.signal,
          isCurrent: () => scope.isCurrent() && requests.get(channel) === controller,
          finish: () => {
            if (requests.get(channel) === controller) scope.abort(channel);
          },
        };
      },
      close() {
        scope.mounted = false;
        for (const channel of requests.keys()) scope.abort(channel);
      },
    };
    return scope;
  }, dependencies);

  // Invalidate at commit, including unmount, before a passive effect starts the next read.
  React.useLayoutEffect(() => {
    scope.mounted = true;
    return () => scope.close();
  }, [scope]);
  return scope;
}
