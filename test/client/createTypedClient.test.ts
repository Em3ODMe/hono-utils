import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DetailedError, hc, parseResponse } from 'hono/client';
import type { Hono } from 'hono';
import {
  createTypedClient,
  type CreateTypedClientOptions,
} from '@/client/createTypedClient';

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
    vi.fn<
      NonNullable<
        NonNullable<CreateTypedClientOptions['callbacks']>['errorHandler']
      >
    >();
  const mockFetch = vi.fn();

  const defaultOptions = {
    url: 'http://localhost:3000',
    fetch: mockFetch,
    callbacks: {
      onStart: onStartSpy,
      onSuccess: onSuccessSpy,
      onError: onErrorSpy,
      onEnd: onEndSpy,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize the Hono client (hc) with correct options', () => {
    createTypedClient<MockApp>(defaultOptions);

    expect(hc).toHaveBeenCalledWith('http://localhost:3000', {
      headers: undefined,
      fetch: mockFetch,
    });
  });

  it('should handle a successful request lifecycle', async () => {
    const rpc = createTypedClient<MockApp>(defaultOptions);

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
    const result = await rpc(requestFn);

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
    const rpc = createTypedClient<MockApp>({
      ...defaultOptions,
      callbacks: {
        ...defaultOptions.callbacks,
        errorHandler: errorHandlerSpy,
      },
    });

    const detailedError = new DetailedError('Forbidden');
    (parseResponse as Mock).mockRejectedValueOnce(detailedError);
    const requestFn = vi.fn().mockResolvedValue({ headers: new Headers() });

    // Execute
    await expect(rpc(requestFn)).rejects.toThrow('Fetch malformed');

    // Verify errorHandler call
    expect(errorHandlerSpy).toHaveBeenCalledWith(500, {
      message: 'Fetch malformed',
    });
  });

  it('should handle "Fetch malformed" when DetailedError has no detail', async () => {
    const rpc = createTypedClient<MockApp>(defaultOptions);

    // DetailedError with null/undefined detail
    const malformedError = new DetailedError('Bad', { statusCode: 500 });
    (parseResponse as Mock).mockRejectedValueOnce(malformedError);
    const requestFn = vi.fn().mockResolvedValue({ headers: new Headers() });

    await expect(rpc(requestFn)).rejects.toThrow('Fetch malformed');

    expect(onErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle generic (non-Hono) errors', async () => {
    const rpc = createTypedClient<MockApp>(defaultOptions);

    const networkError = new Error('Network Error');
    const requestFn = vi.fn().mockRejectedValueOnce(networkError);

    await expect(rpc(requestFn)).rejects.toThrow('Network Error');

    expect(onErrorSpy).toHaveBeenCalledWith(
      { message: 'Network Error' },
      expect.any(Headers) // Likely empty headers as request failed before return
    );
    expect(onEndSpy).toHaveBeenCalled();
  });
});
