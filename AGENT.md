# Testing

[Vitest]: https://vitest.dev/

Testing is important.
In actuality, it is easy to test Hono's applications.
The way to create a test environment differs from each runtime, but the basic steps are the same.
In this section, let's test with Cloudflare Workers and [Vitest].

## Request and Response

All you do is create a Request and pass it to the Hono application to validate the Response.
And, you can use `app.request` the useful method.

::: tip
For a typed test client see the [testing helper](#testing-helper).
:::

For example, consider an application that provides the following REST API.

```ts
app.get('/posts', (c) => {
  return c.text('Many posts');
});

app.post('/posts', (c) => {
  return c.json(
    {
      message: 'Created',
    },
    201,
    {
      'X-Custom': 'Thank you',
    }
  );
});
```

Make a request to `GET /posts` and test the response.

```ts
describe('Example', () => {
  test('GET /posts', async () => {
    const res = await app.request('/posts');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Many posts');
  });
});
```

To make a request to `POST /posts`, do the following.

```ts
test('POST /posts', async () => {
  const res = await app.request('/posts', {
    method: 'POST',
  });
  expect(res.status).toBe(201);
  expect(res.headers.get('X-Custom')).toBe('Thank you');
  expect(await res.json()).toEqual({
    message: 'Created',
  });
});
```

To make a request to `POST /posts` with `JSON` data, do the following.

```ts
test('POST /posts', async () => {
  const res = await app.request('/posts', {
    method: 'POST',
    body: JSON.stringify({ message: 'hello hono' }),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
  expect(res.status).toBe(201);
  expect(res.headers.get('X-Custom')).toBe('Thank you');
  expect(await res.json()).toEqual({
    message: 'Created',
  });
});
```

To make a request to `POST /posts` with `multipart/form-data` data, do the following.

```ts
test('POST /posts', async () => {
  const formData = new FormData();
  formData.append('message', 'hello');
  const res = await app.request('/posts', {
    method: 'POST',
    body: formData,
  });
  expect(res.status).toBe(201);
  expect(res.headers.get('X-Custom')).toBe('Thank you');
  expect(await res.json()).toEqual({
    message: 'Created',
  });
});
```

You can also pass an instance of the Request class.

```ts
test('POST /posts', async () => {
  const req = new Request('http://localhost/posts', {
    method: 'POST',
  });
  const res = await app.request(req);
  expect(res.status).toBe(201);
  expect(res.headers.get('X-Custom')).toBe('Thank you');
  expect(await res.json()).toEqual({
    message: 'Created',
  });
});
```

In this way, you can test it as like an End-to-End.

## Env

To set `c.env` for testing, you can pass it as the 3rd parameter to `app.request`. This is useful for mocking values like [Cloudflare Workers Bindings]

```ts
const MOCK_ENV = {
  API_HOST: 'example.com',
  DB: {
    prepare: () => {
      /* mocked D1 */
    },
  },
};

test('GET /posts', async () => {
  const res = await app.request('/posts', {}, MOCK_ENV);
});
```

# Testing Helper

The Testing Helper provides functions to make testing of Hono applications easier.

## Import

```ts
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
```

## `testClient()`

The `testClient()` function takes an instance of Hono as its first argument and returns an object typed according to your Hono application's routes, similar to the [Hono Client]. This allows you to call your defined routes in a type-safe manner with editor autocompletion within your tests.

**Important Note on Type Inference:**

For the `testClient` to correctly infer the types of your routes and provide autocompletion, **you must define your routes using chained methods directly on the `Hono` instance**.

The type inference relies on the type flowing through the chained `.get()`, `.post()`, etc., calls. If you define routes separately after creating the Hono instance (like the common pattern shown in the "Hello World" example: `const app = new Hono(); app.get(...)`), the `testClient` will not have the necessary type information for specific routes, and you won't get the type-safe client features.

**Example:**

This example works because the `.get()` method is chained directly onto the `new Hono()` call:

```ts
// index.ts
const app = new Hono().get('/search', (c) => {
  const query = c.req.query('q');
  return c.json({ query: query, results: ['result1', 'result2'] });
});

export default app;
```

```ts
// index.test.ts
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { describe, it, expect } from 'vitest'; // Or your preferred test runner
import app from './app';

describe('Search Endpoint', () => {
  // Create the test client from the app instance
  const client = testClient(app);

  it('should return search results', async () => {
    // Call the endpoint using the typed client
    // Notice the type safety for query parameters (if defined in the route)
    // and the direct access via .$get()
    const res = await client.search.$get({
      query: { q: 'hono' },
    });

    // Assertions
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      query: 'hono',
      results: ['result1', 'result2'],
    });
  });
});
```

To include headers in your test, pass them as the second parameter in the call. The second parameter can also take an `init` property as a `RequestInit` object, allowing you to set headers, method, body, etc.

```ts
// index.test.ts
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { describe, it, expect } from 'vitest'; // Or your preferred test runner
import app from './app';

describe('Search Endpoint', () => {
  // Create the test client from the app instance
  const client = testClient(app);

  it('should return search results', async () => {
    // Include the token in the headers and set the content type
    const token = 'this-is-a-very-clean-token';
    const res = await client.search.$get(
      {
        query: { q: 'hono' },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `application/json`,
        },
      }
    );

    // Assertions
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      query: 'hono',
      results: ['result1', 'result2'],
    });
  });
});
```
