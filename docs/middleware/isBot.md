# Bot Detection Middleware

The `isBot` middleware provides a security layer for **Hono** applications running on Cloudflare Workers. It leverages [Cloudflare Bot Management](https://developers.cloudflare.com/bots/concepts/bot-score/) scores to identify, tag, and optionally block automated traffic before it reaches your expensive API endpoints or database logic.

---

## Features

- **Score-Based Filtering:** Uses Cloudflare’s 1–100 bot score to determine request legitimacy.
- **Verified Bot Pass:** Optionally allows known "good bots" (like Googlebot or Bingbot) to bypass blocks regardless of score.
- **Contextual Tagging:** Sets an `isBot` boolean in the Hono context for downstream logging or logic.
- **Automatic Blocking:** Immediately throws an `HTTPException (401)` if a request fails the security criteria.

---

## Usage

### 1. Application Setup

Add the `HonoIsBotVariables` to your Hono instance to ensure `c.get('isBot')` is typed correctly.

```typescript
import { Hono } from 'hono';
import { isBot, type HonoIsBotVariables } from './middleware/isBot';

const app = new Hono<{ Variables: HonoIsBotVariables }>();
```

### 2. Implementation Examples

**Strict Security (High Threshold)**
Block anything that Cloudflare isn't highly confident is a human.

```typescript
app.use(
  '/api/secure/*',
  isBot({
    threshold: 80,
  })
);
```

**Permissive Tagging**
Don't block, but identify bots for analytics (Set threshold to 0).

```typescript
app.use('*', isBot({ threshold: 0 }));

app.get('/data', (c) => {
  const isBot = c.get('isBot');
  return c.json({ info: 'Data', detectedAsBot: isBot });
});
```

---

## Configuration

| Option             | Type      | Default     | Description                                                                                                               |
| ------------------ | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `threshold`        | `number`  | `49`        | Scores **below** this value are flagged as bots. (1 = definitely bot, 100 = definitely human).                            |
| `allowVerifiedBot` | `boolean` | `undefined` | If `true`, bots recognized by Cloudflare's verified list (search engines, etc.) are permitted even if their score is low. |

---

## How It Works

Cloudflare provides a `botManagement` object within the request's `cf` properties. This middleware evaluates that metadata based on the following logic:

1. **Score Retrieval:** It looks for `cf.botManagement.score`. If unavailable (e.g., in local development without a proxy), it defaults to a safe score of `54`.
2. **Verification Check:** It checks if the bot is a known, "good" bot (e.g., a search engine crawler).
3. **Enforcement:**

- If the score is below your `threshold` **AND** it is not a `verifiedBot` (when verified bots are allowed), the middleware throws a `401 Unauthorized` error.
- Otherwise, the request is allowed to proceed, and the `isBot` variable is updated in the context.

---

> [!TIP]
> **Environment Context:** When running locally (e.g., using `wrangler dev`), the `cf` object is simulated. Ensure you are testing in an environment where bot scores are actively generated to see the middleware in action.
