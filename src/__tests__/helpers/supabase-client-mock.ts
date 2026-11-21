type MockRow = Record<string, unknown>;

export interface SupabaseClientMockOptions {
  tables?: Record<string, MockRow[]>;
  rpcData?: unknown;
  user?: { id: string; email?: string } | null;
}

/**
 * Crea un stub determinista del cliente Supabase (`@/lib/supabase/client`)
 * para evitar llamadas reales a red en tests unitarios y de integración local.
 */
export function createSupabaseClientMock(options: SupabaseClientMockOptions = {}) {
  const tables = options.tables ?? {};
  const rpcData = options.rpcData ?? { ok: true };
  const user =
    options.user === undefined
      ? { id: "00000000-0000-0000-0000-000000000004", email: "test@gozster.test" }
      : options.user;

  function makeBuilder(result: { data: unknown; error: null }) {
    const promise = Promise.resolve(result);
    const builder: Record<string, unknown> = {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    };
    const chain = () => builder;
    for (const method of [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "in",
      "is",
      "or",
      "not",
      "match",
      "ilike",
      "like",
      "contains",
      "containedBy",
      "filter",
      "order",
      "limit",
      "range",
      "single",
      "maybeSingle",
    ]) {
      builder[method] = chain;
    }
    return builder;
  }

  return {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signOut() {
        return { error: null };
      },
    },
    from(table: string) {
      const rows = tables[table] ?? [];
      const builder: Record<string, unknown> = makeBuilder({ data: rows, error: null });
      const writeChain = () => makeBuilder({ data: null, error: null });
      builder.single = () => makeBuilder({ data: rows[0] ?? null, error: null });
      builder.maybeSingle = () => makeBuilder({ data: rows[0] ?? null, error: null });
      for (const method of ["insert", "update", "upsert", "delete"]) {
        builder[method] = writeChain;
      }
      return builder;
    },
    async rpc() {
      return { data: rpcData, error: null };
    },
  };
}
