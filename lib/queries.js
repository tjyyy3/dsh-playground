import { z } from 'zod';

const inputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('auth') }),
  z.strictObject({ action: z.literal('catalog'), search: z.string().max(500).optional(),
    season: z.string().max(200).optional(), per_page: z.number().int().min(1).max(100).optional() }),
]);

/** A session-free, read-only Remote contract for this plain JavaScript plugin. */
export function registerWorkbenchQueries(ctx, workflow) {
  const service = {
    async query(input, signal) {
      // API normalizers use undefined for absent optional fields; the wire is JSON-only.
      return JSON.parse(JSON.stringify(await (input.action === 'auth' ? workflow.auth({ signal }) : workflow.catalog(input, { signal }))));
    },
  };
  service.typertRemote = Object.freeze({ service, serviceKey: 'playgroundQueries', namespace: 'playgroundQueries' });
  ctx.provide('playgroundQueries', service);
  ctx.typert.register({
    package: '@playground/dsh-playground', face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: [{
      id: '@playground/dsh-playground#playgroundQueries/query', service: 'playgroundQueries',
      namespace: 'playgroundQueries', method: 'query', invocation: { kind: 'direct' },
      parameters: [{ name: 'input', wire: 'input', source: 'json',
        codec: { mode: 'strict', typeSymbol: '@playground/dsh-playground#QueryInput', create: () => inputSchema } }],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: '@playground/dsh-playground#QueryResult', create: () => z.json() },
      description: 'Read Playground authentication or the challenge catalog without recording a session command.',
    }],
  });
}
