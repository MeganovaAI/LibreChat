import { useCallback, useRef } from 'react';
import type { EventSubmission, TMessage } from 'librechat-data-provider';

// AG-UI protocol named SSE events that this consumer recognizes.
// Spec: https://docs.ag-ui.com
// Nova OS emission surface: nova-os#370.
//
// Events not in this list are logged + ignored (forward-compat).
export const AG_UI_EVENTS = [
  'RUN_STARTED',
  'RUN_FINISHED',
  'RUN_ERROR',
  'TEXT_MESSAGE_START',
  'TEXT_MESSAGE_CONTENT',
  'TEXT_MESSAGE_END',
  'TOOL_CALL_START',
  'TOOL_CALL_ARGS',
  'TOOL_CALL_END',
  'THINKING_START',
  'THINKING_CONTENT',
  'THINKING_END',
  'STATE_DELTA',
  'STATE_SNAPSHOT',
  'CUSTOM',
] as const;

export type AgUiEventName = (typeof AG_UI_EVENTS)[number];

// Minimum shape we rely on. The full AG-UI spec has more fields per event;
// we only destructure what v0 renders. Unknown fields pass through unobserved.
export type AgUiEvent =
  | { kind: 'RUN_STARTED'; data: { run_id?: string; thread_id?: string } }
  | { kind: 'RUN_FINISHED'; data: { run_id?: string; thread_id?: string } }
  | { kind: 'RUN_ERROR'; data: { message?: string; code?: string } }
  | { kind: 'TEXT_MESSAGE_START'; data: { message_id?: string; role?: string } }
  | { kind: 'TEXT_MESSAGE_CONTENT'; data: { message_id?: string; delta?: string } }
  | { kind: 'TEXT_MESSAGE_END'; data: { message_id?: string } }
  | {
      kind: 'TOOL_CALL_START';
      data: { tool_call_id?: string; tool_name?: string; tool_call_args?: string };
    }
  | { kind: 'TOOL_CALL_ARGS'; data: { tool_call_id?: string; delta?: string } }
  | {
      kind: 'TOOL_CALL_END';
      data: { tool_call_id?: string; output?: string; is_error?: boolean };
    }
  | { kind: 'THINKING_START'; data: Record<string, unknown> }
  | { kind: 'THINKING_CONTENT'; data: { delta?: string } }
  | { kind: 'THINKING_END'; data: Record<string, unknown> }
  | { kind: 'STATE_DELTA'; data: unknown }
  | { kind: 'STATE_SNAPSHOT'; data: unknown }
  | { kind: 'CUSTOM'; data: { name?: string; value?: unknown } };

type TUseAgUiHandler = {
  messageHandler: (data: string | undefined, submission: EventSubmission) => void;
  finalHandler: (data: unknown, submission: EventSubmission) => void;
  errorHandler: (params: { data: unknown; submission: EventSubmission }) => void;
};

// Inline-marker formatters used by v0 MVP.
// The richer collapsible-chip UX is deferred to v0.2 — until then we render
// tool calls and thinking blocks as inline text inside the assistant message,
// matching what nova-os already emits when its stream_phase_markers agent flag
// is set. This means LibreChat shows the same end-user UX whether the server
// emits inline markers OR proper AG-UI events.
function inlineToolCallStart(name: string): string {
  return `\n\n🔧 \`${name}\``;
}
function inlineToolCallEnd(elapsedMs: number, isError: boolean): string {
  const secs = elapsedMs > 0 ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : '';
  const status = isError ? '✗' : '✓';
  return ` ${status}${secs}\n\n`;
}
function inlineThinkingStart(): string {
  return '\n\n_thinking…_\n\n';
}

// useAgUiHandler returns a single dispatch function. The caller wires it to
// SSE named-event listeners; one event per call. The hook keeps per-run state
// in refs so consecutive events in the same run accumulate correctly.
export default function useAgUiHandler({
  messageHandler,
  finalHandler,
  errorHandler,
}: TUseAgUiHandler) {
  // Per-run accumulated assistant message text. Reset when RUN_STARTED arrives
  // or when the SSE connection closes.
  const accumulatedText = useRef('');
  // Track open tool calls by id so TOOL_CALL_END can compute elapsed time.
  const toolCallStarts = useRef(new Map<string, { name: string; startedAt: number }>());
  // Per-run conversation/thread linkage from RUN_STARTED for downstream finalize.
  const runMeta = useRef<{ runId?: string; threadId?: string }>({});

  const reset = useCallback(() => {
    accumulatedText.current = '';
    toolCallStarts.current.clear();
    runMeta.current = {};
  }, []);

  const dispatch = useCallback(
    (eventName: string, raw: unknown, submission: EventSubmission) => {
      let data: Record<string, unknown> = {};
      if (raw && typeof raw === 'object') {
        data = raw as Record<string, unknown>;
      }

      switch (eventName) {
        case 'RUN_STARTED': {
          reset();
          runMeta.current = {
            runId: data.run_id as string | undefined,
            threadId: data.thread_id as string | undefined,
          };
          break;
        }

        case 'TEXT_MESSAGE_START': {
          // Nothing to render. The accumulator already has whatever pre-text
          // markers existed (e.g. tool-call lines from a prior step).
          break;
        }

        case 'TEXT_MESSAGE_CONTENT': {
          const delta = (data.delta as string | undefined) ?? '';
          if (delta) {
            accumulatedText.current += delta;
            messageHandler(accumulatedText.current, submission);
          }
          break;
        }

        case 'TEXT_MESSAGE_END': {
          // No-op for v0; the accumulator already reflects the full text.
          break;
        }

        case 'TOOL_CALL_START': {
          const id = (data.tool_call_id as string | undefined) ?? '';
          const name = (data.tool_name as string | undefined) ?? 'tool';
          if (id) {
            toolCallStarts.current.set(id, { name, startedAt: Date.now() });
          }
          accumulatedText.current += inlineToolCallStart(name);
          messageHandler(accumulatedText.current, submission);
          break;
        }

        case 'TOOL_CALL_ARGS': {
          // v0 does not stream args into the visible message — too noisy.
          // The full args payload is available in TOOL_CALL_START.tool_call_args
          // and in the eventual TOOL_CALL_END. Deferred to v0.2 collapsible UI.
          break;
        }

        case 'TOOL_CALL_END': {
          const id = (data.tool_call_id as string | undefined) ?? '';
          const isError = Boolean(data.is_error);
          const start = id ? toolCallStarts.current.get(id) : undefined;
          const elapsed = start ? Date.now() - start.startedAt : 0;
          if (id) {
            toolCallStarts.current.delete(id);
          }
          accumulatedText.current += inlineToolCallEnd(elapsed, isError);
          messageHandler(accumulatedText.current, submission);
          break;
        }

        case 'THINKING_START': {
          accumulatedText.current += inlineThinkingStart();
          messageHandler(accumulatedText.current, submission);
          break;
        }

        case 'THINKING_CONTENT': {
          // v0 does not show thinking deltas inline — they bloat the rendered
          // message. The marker from THINKING_START is enough signal.
          break;
        }

        case 'THINKING_END': {
          // No-op. The next TEXT_MESSAGE_CONTENT delta resumes visible output.
          break;
        }

        case 'RUN_FINISHED': {
          // Synthesize a chat-completions-shaped final payload for the existing
          // finalHandler. We don't have the server's real responseMessage shape
          // here; finalHandler will rebuild from the accumulator + submission's
          // initialResponse + the final text we provide.
          const finalPayload = {
            final: true,
            text: accumulatedText.current,
            messageId: (data.run_id as string | undefined) ?? runMeta.current.runId,
            conversation: (submission as EventSubmission & { conversation?: unknown }).conversation,
            requestMessage: submission.userMessage as TMessage | undefined,
            responseMessage: {
              ...(submission.initialResponse as TMessage),
              text: accumulatedText.current,
            } as TMessage,
          };
          try {
            finalHandler(finalPayload, submission);
          } catch (err) {
            // finalHandler isn't shaped for our payload? Surface as an error
            // rather than letting it propagate up the SSE listener.
            // eslint-disable-next-line no-console
            console.error('[ag-ui] finalHandler threw on RUN_FINISHED:', err);
          }
          reset();
          break;
        }

        case 'RUN_ERROR': {
          const message =
            (data.message as string | undefined) ?? 'agent run failed (AG-UI RUN_ERROR)';
          errorHandler({
            data: { text: message, code: data.code, ag_ui: true },
            submission,
          });
          reset();
          break;
        }

        case 'STATE_DELTA':
        case 'STATE_SNAPSHOT':
        case 'CUSTOM': {
          // Forward-compat: not consumed by v0. Future versions may persist
          // state-deltas for resumable runs or render CUSTOM events as
          // generic system-event chips.
          // eslint-disable-next-line no-console
          console.debug('[ag-ui] ignoring event (v0 no-op):', eventName, data);
          break;
        }

        default: {
          // Truly unknown event name. Likely a forward-compatible AG-UI v2
          // event we haven't taught this consumer about yet.
          // eslint-disable-next-line no-console
          console.debug('[ag-ui] unknown event name:', eventName, data);
          break;
        }
      }
    },
    [messageHandler, finalHandler, errorHandler, reset],
  );

  return { dispatch, reset };
}
