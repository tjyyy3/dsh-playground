import { z } from 'zod';
import { CHALLENGE_ORIGINS, CHALLENGE_SORTS } from './api.js';
import { COMPETITION_IDS } from './competitions.js';

const inputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('auth') }),
  z.strictObject({ action: z.literal('catalog'), search: z.string().max(500).optional(),
    // `competition` is one id of the built-in table (lib/competitions.js) and wins over `season`, which stays
    // for the seasons the API lists but the table does not hold. Any other id is rejected.
    competition: z.enum(COMPETITION_IDS).optional(),
    season: z.string().max(200).optional(), per_page: z.number().int().min(1).max(100).optional(),
    // Catalog paging and filters, mapped to the list API's page, origin, disc and sort. `discipline` is one
    // exact discipline key. There is no status filter: the API ignores `status`, so 只看开放 filters loaded
    // cards in the Client.
    page: z.number().int().min(1).max(100000).optional(),
    origin: z.enum(CHALLENGE_ORIGINS).optional(),
    discipline: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(CHALLENGE_SORTS).optional() }),
  // Read one submission by id; the workbench refreshes unscored submissions with it.
  z.strictObject({ action: z.literal('attempt'), attemptId: z.number().int().positive() }),
  // The current account's submissions for one challenge; the task drawer's submission history reads it.
  z.strictObject({ action: z.literal('my_attempts'), challengeId: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(100).optional(), cursor: z.string().min(1).max(1000).optional() }),
  // One challenge's statement, resources and facts; the catalog's challenge detail drawer reads it.
  z.strictObject({ action: z.literal('challenge'), challengeId: z.string().trim().min(1).max(200) }),
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
      if (input.action === 'auth') return wire(await workflow.auth({ signal }));
      if (input.action === 'attempt') return wire(await workflow.attempt(input.attemptId, { signal }));
      if (input.action === 'my_attempts') return wire(await workflow.myAttempts(input, { signal }));
      if (input.action === 'challenge') return wire(await workflow.challenge(input.challengeId, { signal }));
      return wire(await workflow.catalog(input, { signal }));
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
      invocation('query', 'QueryInput', inputSchema, 'Read Playground authentication, the challenge catalog, one submission by id, one challenge\'s detail, or the current account\'s submissions for one challenge.'),
      invocation('login', 'LoginInput', loginSchema, 'Log in through the installed Playground CLI with the password from the DSH credential store.'),
    ],
  });
}
