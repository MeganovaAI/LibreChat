import { renderHook, act } from '@testing-library/react';
import type { EventSubmission, TConversation, TMessage, TEndpointOption } from 'librechat-data-provider';
import useAgUiHandler, { AG_UI_EVENTS } from '~/hooks/SSE/useAgUiHandler';

type TSubmissionForTest = {
  userMessage: TMessage;
  isTemporary: boolean;
  messages: TMessage[];
  conversation: Partial<TConversation>;
  endpointOption: TEndpointOption;
  initialResponse: TMessage;
};

describe('useAgUiHandler', () => {
  const mockMessageHandler = jest.fn();
  const mockFinalHandler = jest.fn();
  const mockErrorHandler = jest.fn();

  const params = () => ({
    messageHandler: mockMessageHandler,
    finalHandler: mockFinalHandler,
    errorHandler: mockErrorHandler,
  });

  const userMessage: TMessage = {
    messageId: 'user-1',
    conversationId: 'conv-1',
    parentMessageId: '00000000-0000-0000-0000-000000000000',
    isCreatedByUser: true,
    text: 'Hello',
    sender: 'User',
  };

  const initialResponse: TMessage = {
    messageId: 'resp-1',
    conversationId: 'conv-1',
    parentMessageId: 'user-1',
    isCreatedByUser: false,
    text: '',
    sender: 'Assistant',
  };

  const submission = {
    userMessage,
    initialResponse,
    messages: [],
    isTemporary: false,
    conversation: { conversationId: 'conv-1' },
    endpointOption: {} as TEndpointOption,
  } as unknown as EventSubmission;

  beforeEach(() => {
    mockMessageHandler.mockClear();
    mockFinalHandler.mockClear();
    mockErrorHandler.mockClear();
  });

  it('exports the canonical AG-UI v1 event list', () => {
    expect(AG_UI_EVENTS).toContain('RUN_STARTED');
    expect(AG_UI_EVENTS).toContain('TEXT_MESSAGE_CONTENT');
    expect(AG_UI_EVENTS).toContain('TOOL_CALL_START');
    expect(AG_UI_EVENTS).toContain('TOOL_CALL_END');
    expect(AG_UI_EVENTS).toContain('THINKING_START');
    expect(AG_UI_EVENTS).toContain('RUN_FINISHED');
    expect(AG_UI_EVENTS).toContain('RUN_ERROR');
  });

  it('accumulates TEXT_MESSAGE_CONTENT deltas across calls and rebroadcasts via messageHandler', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    act(() => {
      result.current.dispatch('RUN_STARTED', { run_id: 'run-1', thread_id: 'thr-1' }, submission);
      result.current.dispatch('TEXT_MESSAGE_START', { message_id: 'msg-1' }, submission);
      result.current.dispatch('TEXT_MESSAGE_CONTENT', { message_id: 'msg-1', delta: 'Hello ' }, submission);
      result.current.dispatch('TEXT_MESSAGE_CONTENT', { message_id: 'msg-1', delta: 'world.' }, submission);
    });

    expect(mockMessageHandler).toHaveBeenCalledTimes(2);
    expect(mockMessageHandler).toHaveBeenLastCalledWith('Hello world.', submission);
  });

  it('renders TOOL_CALL_START/END as inline markers inside the accumulated text', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    act(() => {
      result.current.dispatch('RUN_STARTED', { run_id: 'run-1' }, submission);
      result.current.dispatch('TOOL_CALL_START', { tool_call_id: 'call-1', tool_name: 'web_search' }, submission);
      result.current.dispatch('TOOL_CALL_END', { tool_call_id: 'call-1', is_error: false }, submission);
      result.current.dispatch('TEXT_MESSAGE_CONTENT', { delta: 'Found 3 results.' }, submission);
    });

    const lastCallArgs = mockMessageHandler.mock.calls.at(-1) ?? [];
    const finalText = lastCallArgs[0] as string;
    expect(finalText).toContain('🔧 `web_search`');
    expect(finalText).toContain('✓');
    expect(finalText).toContain('Found 3 results.');
  });

  it('renders TOOL_CALL_END with ✗ marker when is_error=true', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    act(() => {
      result.current.dispatch('RUN_STARTED', {}, submission);
      result.current.dispatch('TOOL_CALL_START', { tool_call_id: 'call-1', tool_name: 'web_search' }, submission);
      result.current.dispatch('TOOL_CALL_END', { tool_call_id: 'call-1', is_error: true }, submission);
    });

    const finalText = (mockMessageHandler.mock.calls.at(-1)?.[0] ?? '') as string;
    expect(finalText).toContain('✗');
    expect(finalText).not.toContain('✓');
  });

  it('renders THINKING_START as an inline marker; THINKING_CONTENT deltas are silent', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    act(() => {
      result.current.dispatch('RUN_STARTED', {}, submission);
      result.current.dispatch('THINKING_START', {}, submission);
      result.current.dispatch('THINKING_CONTENT', { delta: 'planning…' }, submission);
      result.current.dispatch('THINKING_END', {}, submission);
      result.current.dispatch('TEXT_MESSAGE_CONTENT', { delta: 'Answer.' }, submission);
    });

    const finalText = (mockMessageHandler.mock.calls.at(-1)?.[0] ?? '') as string;
    expect(finalText).toContain('_thinking…_');
    expect(finalText).toContain('Answer.');
    // The actual thinking-content delta MUST NOT leak into the visible message.
    expect(finalText).not.toContain('planning…');
  });

  it('invokes finalHandler with accumulated text on RUN_FINISHED and resets state', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    act(() => {
      result.current.dispatch('RUN_STARTED', { run_id: 'run-final-1' }, submission);
      result.current.dispatch('TEXT_MESSAGE_CONTENT', { delta: 'Done.' }, submission);
      result.current.dispatch('RUN_FINISHED', { run_id: 'run-final-1' }, submission);
    });

    expect(mockFinalHandler).toHaveBeenCalledTimes(1);
    const [finalPayload, finalSubmission] = mockFinalHandler.mock.calls[0];
    expect(finalSubmission).toBe(submission);
    expect(finalPayload).toMatchObject({
      final: true,
      text: 'Done.',
      messageId: 'run-final-1',
    });

    // After RUN_FINISHED the internal accumulator must reset. A subsequent run
    // should NOT carry text forward from the previous one.
    act(() => {
      result.current.dispatch('RUN_STARTED', { run_id: 'run-2' }, submission);
      result.current.dispatch('TEXT_MESSAGE_CONTENT', { delta: 'fresh' }, submission);
    });
    const lastText = (mockMessageHandler.mock.calls.at(-1)?.[0] ?? '') as string;
    expect(lastText).toBe('fresh');
  });

  it('invokes errorHandler on RUN_ERROR', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    act(() => {
      result.current.dispatch('RUN_STARTED', {}, submission);
      result.current.dispatch(
        'RUN_ERROR',
        { message: 'upstream provider 500', code: 'PROVIDER_ERROR' },
        submission,
      );
    });

    expect(mockErrorHandler).toHaveBeenCalledTimes(1);
    const [{ data }] = mockErrorHandler.mock.calls[0];
    expect(data).toMatchObject({
      text: 'upstream provider 500',
      code: 'PROVIDER_ERROR',
      ag_ui: true,
    });
  });

  it('treats STATE_DELTA / STATE_SNAPSHOT / CUSTOM as silent no-ops (forward-compat)', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    act(() => {
      result.current.dispatch('RUN_STARTED', {}, submission);
      result.current.dispatch('STATE_DELTA', { foo: 'bar' }, submission);
      result.current.dispatch('STATE_SNAPSHOT', { snapshot: {} }, submission);
      result.current.dispatch('CUSTOM', { name: 'partner_custom', value: 42 }, submission);
    });

    // None of those events should have triggered a visible UI update.
    expect(mockMessageHandler).not.toHaveBeenCalled();
    expect(mockFinalHandler).not.toHaveBeenCalled();
    expect(mockErrorHandler).not.toHaveBeenCalled();
  });

  it('ignores unknown event names without throwing', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    expect(() => {
      act(() => {
        result.current.dispatch('TOTALLY_NEW_EVENT_V2', { whatever: true }, submission);
      });
    }).not.toThrow();
    expect(mockMessageHandler).not.toHaveBeenCalled();
  });

  it('tolerates malformed event payloads (null/undefined/non-object data)', () => {
    const { result } = renderHook(() => useAgUiHandler(params()));

    expect(() => {
      act(() => {
        result.current.dispatch('RUN_STARTED', null, submission);
        result.current.dispatch('TEXT_MESSAGE_CONTENT', undefined, submission);
        result.current.dispatch('TOOL_CALL_START', 'not-an-object', submission);
      });
    }).not.toThrow();
  });
});
