export type SqlStatement = {
  bind(...values: unknown[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type SqlDatabase = {
  prepare(sql: string): SqlStatement;
};

export function sqlFromD1(db: D1Database): SqlDatabase {
  const wrap = (bound: D1PreparedStatement): SqlStatement => ({
    bind(...values: unknown[]) {
      return wrap(bound.bind(...values));
    },
    first<T>() {
      return bound.first<T>();
    },
    all<T>() {
      return bound.all<T>();
    },
    run() {
      return bound.run();
    },
  });
  return {
    prepare(sql: string) {
      return wrap(db.prepare(sql));
    },
  };
}

export async function all<T>(db: SqlDatabase, sql: string, ...binds: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...binds).all<T>();
  return result.results ?? [];
}

export async function get<T>(db: SqlDatabase, sql: string, ...binds: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...binds).first<T>()) ?? null;
}

export async function run(db: SqlDatabase, sql: string, ...binds: unknown[]): Promise<number> {
  const result = await db.prepare(sql).bind(...binds).run();
  return result.meta?.changes ?? 0;
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
