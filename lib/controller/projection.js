import { z } from 'zod';

export const controllerKey = 'playgroundController';
export const controllerNoticesKey = 'playgroundControllerNotices';
const markerSchema = z.strictObject({ workspaceId: z.string().min(1), sessionId: z.string().min(1) });
const stateSchema = markerSchema.nullable();
export const challengeIdSchema = z.string().trim().min(1).max(200);
const challengeSchema = z.strictObject({ baseUrl: z.string().trim().min(1).max(2000), id: challengeIdSchema, title: z.string().trim().max(500).optional() });
export const taskChallengesSchema = z.record(z.string(), challengeSchema);
const associationSchema = markerSchema.extend({ childId: z.string().min(1).max(200), challenge: challengeSchema, supersedes: challengeIdSchema.optional() });
export const controllerViewSchema = markerSchema.extend({ taskChallenges: taskChallengesSchema.optional() }).nullable();
const projectionStateSchema = z.object({ sessionId: z.string(), inheritedEventCount: z.number(), marker: stateSchema, taskChallenges: taskChallengesSchema.optional() });

export const controllerProjection = {
  key: controllerKey, stateVersion: 2, stateSchema: projectionStateSchema,
  init: (header, inheritedEventCount) => ({ sessionId: header.id, inheritedEventCount, marker: null }),
  apply(state, event) {
    if (event.seq < state.inheritedEventCount) return state;
    if (event.type === 'tool/result') {
      const association = associationSchema.safeParse(event.data.meta?.playgroundControllerAssociation);
      if (!association.success || !state.marker || association.data.sessionId !== state.sessionId || association.data.workspaceId !== state.marker.workspaceId) return state;
      const { childId, challenge, supersedes } = association.data;
      if (supersedes !== undefined ? state.taskChallenges?.[childId]?.id !== supersedes : Object.hasOwn(state.taskChallenges || {}, childId)) return state;
      return { ...state, taskChallenges: Object.fromEntries(Object.entries({ ...state.taskChallenges, [childId]: challenge }).slice(-100)) };
    }
    if (state.marker || event.type !== 'command/done' || event.data.kind !== 'success' || !event.data.text?.startsWith('{"playgroundController":')) return state;
    try {
      const marker = markerSchema.safeParse(JSON.parse(event.data.text).playgroundController);
      return marker.success && marker.data.sessionId === state.sessionId ? { ...state, marker: marker.data } : state;
    } catch { return state; }
  },
  wire: { viewSchema: controllerViewSchema, view: (state) => state.marker && state.taskChallenges
    ? { ...state.marker, taskChallenges: state.taskChallenges } : state.marker },
};

export const controllerNoticesSchema = z.array(z.object({ childId: z.string(), text: z.string(), stopReason: z.string().optional() }));
export const controllerNoticesProjection = {
  key: controllerNoticesKey, stateVersion: 2,
  stateSchema: z.object({ inheritedEventCount: z.number(), notices: controllerNoticesSchema }),
  init: (_header, inheritedEventCount) => ({ inheritedEventCount, notices: [] }),
  apply(state, event) {
    if (event.seq < state.inheritedEventCount || event.type !== 'agent/inbox/spliced') return state;
    const notices = event.data.inserted.flatMap((message) => {
      if (message.source?.kind !== 'subagent-settled' || typeof message.source.senderSessionId !== 'string') return [];
      const text = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').slice(0, 12000);
      return [{ childId: message.source.senderSessionId, text,
        ...(typeof message.source.stopReason === 'string' ? { stopReason: message.source.stopReason } : {}) }];
    });
    return notices.length ? { ...state, notices: [...state.notices, ...notices].slice(-100) } : state;
  },
  wire: { viewSchema: controllerNoticesSchema, view: (state) => state.notices },
};
