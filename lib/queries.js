import { z } from 'zod';

const inputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('auth') }),
  z.strictObject({ action: z.literal('catalog'), search: z.string().max(500).optional(),
    season: z.string().max(200).optional(), per_page: z.number().int().min(1).max(100).optional() }),
]);
// The password never crosses this call: the Client stores it in the DSH credential channel first.
const loginSchema = z.strictObject({ email: z.string().trim().min(1).max(320) });

// API normalizers use undefined for absent optional fields; the wire is JSON-only.
const wire = (value) => JSON.parse(JSON.stringify(value));

function invocation(method, typeSymbol, schema, description) {
  return {
    id: `@playground/dsh-playground#playgroundQueries/${method}`, service: 'playgroundQueries',
    namespace: 'playgroundQueries', method, invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json',
      codec: { mode: 'strict', typeSymbol: `@playground/dsh-playground#${typeSymbol}`, create: () => schema } }],
    cancellation: { parameter: 'signal' },
    result: { mode: 'strict', typeSymbol: `@playground/dsh-playground#${typeSymbol}Result`, create: () => z.json() },
    description,
  };
}

/** Session-free workbench calls for this plain JavaScript plugin; none of them records a session command. */
export function registerWorkbenchQueries(ctx, workflow) {
  const service = {
    async query(input, signal) {
      return wire(await (input.action === 'auth' ? workflow.auth({ signal }) : workflow.catalog(input, { signal })));
    },
    async login(input, signal) {
      return wire(await workflow.login(input.email, { signal }));
    },
  };
  service.typertRemote = Object.freeze({ service, serviceKey: 'playgroundQueries', namespace: 'playgroundQueries' });
  ctx.provide('playgroundQueries', service);
  ctx.typert.register({
    package: '@playground/dsh-playground', face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: [
      invocation('query', 'QueryInput', inputSchema, 'Read Playground authentication or the challenge catalog.'),
      invocation('login', 'LoginInput', loginSchema, 'Log in through the installed Playground CLI with the password from the DSH credential store.'),
    ],
  });
}
