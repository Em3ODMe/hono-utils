import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { hydrateVariable } from '@/middleware/hydrateVariable';

type Bindings = {
  DB_URL: string;
};

type Variables = {
  db: DatabaseClient;
  user_id: string;
};

type Env = {
  Bindings: Bindings;
  Variables: Variables;
};

class DatabaseClient {
  constructor(private dbUrl: string) {}

  query() {
    return this.dbUrl;
  }
}

describe(hydrateVariable.name, () => {
  it('should hydrate a variable based on environment bindings', async () => {
    const app = new Hono<Env>();
    app.use(
      '*',
      hydrateVariable<Env, DatabaseClient>({
        variableName: 'db',
        hydrate: (c) => new DatabaseClient(c.DB_URL),
      })
    );
    app.get('/api/profile', (c) => {
      const db = c.get('db');
      return c.json({ status: db.query() });
    });
    const response = await app.request('/api/profile');
    expect(response.status).toBe(200);
  });
});
