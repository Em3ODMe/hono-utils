import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DetailedError, hc, parseResponse } from 'hono/client';
import type { Hono } from 'hono';
import { createTypedClient } from '@/client/createTypedClient';

// Mock 'hono/client' to control parseResponse and spy on hc
vi.mock('hono/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hono/client')>();
  return {
    ...actual,
    hc: vi.fn(() => ({ dummyClient: true })),
    parseResponse: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockApp = Hono<any, any, any>;
type MockResponse = { id: number; name: string };

describe('createTypedClient', () => {
  // Common spies
  const onStartSpy = vi.fn();
  const onSuccessSpy = vi.fn();
  const onErrorSpy = vi.fn();
  const onEndSpy = vi.fn();
  const errorHandlerSpy =
    vi.fn<(status: number, body?: Record<string, unknown>) => never>();
  const mockFetch = vi.fn();

  const defaultOptions = {
    url: 'http://localhost:3000',
    fetch: mockFetch,
    errorHandler: errorHandlerSpy,
  };

  const defaultCallbacks = {
    onStart: onStartSpy,
    onSuccess: onSuccessSpy,
    onError: onErrorSpy,
    onEnd: onEndSpy,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize the Hono client (hc) with correct options', async () => {
    const rpc = createTypedClient<MockApp>()(defaultOptions);

    const mockData = { id: 1 };
    (parseResponse as Mock).mockResolvedValueOnce(mockData);
    const requestFn = vi
      .fn()
      .mockResolvedValue({ headers: new Headers(), ok: true } as Response);

    await rpc(requestFn, defaultCallbacks);

    expect(hc).toHaveBeenCalledWith('http://localhost:3000', {
      headers: undefined,
      fetch: mockFetch,
    });
  });

  it('should handle a successful request lifecycle', async () => {
    const rpc = createTypedClient<MockApp>()(defaultOptions);

    // Mock Data
    const mockData: MockResponse = { id: 1, name: 'Test' };
    const mockHeaders = new Headers({ 'x-custom': '123' });
    const mockResObject = { headers: mockHeaders, ok: true } as Response;

    // Setup Mocks
    (parseResponse as Mock).mockResolvedValueOnce(mockData);

    // Define the RPC call
    // We mock the function passed to rpcClient (fn)
    const requestFn = vi.fn().mockResolvedValue(mockResObject);

    // Execute
    const result = await rpc(requestFn, defaultCallbacks);

    // Assertions
    expect(onStartSpy).toHaveBeenCalledTimes(1);
    expect(requestFn).toHaveBeenCalled(); // fn(client) was called

    // Check parseResponse was called with the raw response
    expect(parseResponse).toHaveBeenCalledWith(mockResObject);

    // Check Success Callback
    expect(onSuccessSpy).toHaveBeenCalledWith(mockData, mockHeaders);
    expect(onErrorSpy).not.toHaveBeenCalled();

    // Check Return Value
    expect(result).toEqual(mockData);

    // Check Finally
    expect(onEndSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate to errorHandler if provided', async () => {
    const rpc = createTypedClient<MockApp>()({
      ...defaultOptions,
      errorHandler: errorHandlerSpy,
    });

    const detailedError = new DetailedError('Forbidden');
    (parseResponse as Mock).mockRejectedValueOnce(detailedError);
    const requestFn = vi.fn().mockResolvedValue({ headers: new Headers() });

    // Execute
    await expect(rpc(requestFn, defaultCallbacks)).rejects.toThrow(
      'Fetch malformed'
    );

    // Verify errorHandler call
    expect(errorHandlerSpy).toHaveBeenCalledWith(500, {
      message: 'Fetch malformed',
    });
  });

  it('should handle "Fetch malformed" when DetailedError has no detail', async () => {
    const rpc = createTypedClient<MockApp>()(defaultOptions);

    // The request function rejects with an error carrying detail + statusCode
    const requestFn = vi
      .fn()
      .mockRejectedValue({ detail: { message: 'Test' }, statusCode: 400 });

    await rpc(requestFn, defaultCallbacks).catch(() => {
      expect(onErrorSpy).toHaveBeenCalledWith(
        { message: 'Test' },
        expect.any(Headers)
      );
      expect(errorHandlerSpy).toHaveBeenCalledWith(400, {
        message: 'Test',
        status: 400,
      });
    });

    expect(onEndSpy).toHaveBeenCalled();
  });

  it('should handle generic (non-Hono) errors', async () => {
    const rpc = createTypedClient<MockApp>()(defaultOptions);

    const networkError = new Error('Network Error');
    const requestFn = vi.fn().mockRejectedValueOnce(networkError);

    await expect(rpc(requestFn, defaultCallbacks)).rejects.toThrow(
      'Fetch malformed'
    );
    expect(onErrorSpy).not.toHaveBeenCalled();

    expect(onEndSpy).toHaveBeenCalled();
  });

  it('should pass a headers function through to hc', async () => {
    const headersFn = () => ({ Authorization: 'Bearer token' });
    const rpc = createTypedClient<MockApp>()({
      ...defaultOptions,
      headers: headersFn,
    });

    (parseResponse as Mock).mockResolvedValueOnce({ id: 1 });
    const requestFn = vi
      .fn()
      .mockResolvedValue({ headers: new Headers(), ok: true } as Response);

    await rpc(requestFn);

    expect(hc).toHaveBeenCalledWith('http://localhost:3000', {
      headers: headersFn,
      fetch: mockFetch,
    });
  });

  it('should pass an async headers function through to hc', async () => {
    const headersFn = async () => ({ Authorization: 'Bearer token' });
    const rpc = createTypedClient<MockApp>()({
      ...defaultOptions,
      headers: headersFn,
    });

    (parseResponse as Mock).mockResolvedValueOnce({ id: 1 });
    const requestFn = vi
      .fn()
      .mockResolvedValue({ headers: new Headers(), ok: true } as Response);

    await rpc(requestFn);

    expect(hc).toHaveBeenCalledWith('http://localhost:3000', {
      headers: headersFn,
      fetch: mockFetch,
    });
  });

  it('should preserve the status code from a DetailedError', async () => {
    const rpc = createTypedClient<MockApp>()(defaultOptions);

    const detailedError = new DetailedError('404 Not Found', {
      statusCode: 404,
      detail: { message: 'Not found' },
    });
    (parseResponse as Mock).mockRejectedValueOnce(detailedError);
    const requestFn = vi
      .fn()
      .mockResolvedValue({ headers: new Headers(), ok: false } as Response);

    await expect(rpc(requestFn, defaultCallbacks)).rejects.toThrow('Not found');

    expect(errorHandlerSpy).toHaveBeenCalledWith(404, {
      message: 'Not found',
      status: 404,
    });
  });

  it('should pass the x-event-id header to onError and errorHandler', async () => {
    const rpc = createTypedClient<MockApp>()(defaultOptions);

    const headers = new Headers({ 'x-event-id': 'event-123' });
    const detailedError = new DetailedError('400 Bad Request', {
      statusCode: 400,
      detail: { message: 'Bad request' },
    });
    (parseResponse as Mock).mockRejectedValueOnce(detailedError);
    const requestFn = vi
      .fn()
      .mockResolvedValue({ headers, ok: false } as Response);

    await expect(rpc(requestFn, defaultCallbacks)).rejects.toThrow(
      'Bad request'
    );

    expect(onErrorSpy).toHaveBeenCalledWith(
      { message: 'Bad request' },
      headers
    );
    expect(errorHandlerSpy).toHaveBeenCalledWith(400, {
      message: 'Bad request',
      eventId: 'event-123',
      status: 400,
    });
  });
});
