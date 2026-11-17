// Cliente simulado: cualquier consulta encadenada resuelve sin datos y sin error.
const vacio = { data: null, error: null, count: 0 };
const cadena: any = new Proxy(function () {}, {
  get: (_t, prop) => (prop === "then" ? (res: (v: unknown) => void) => res(vacio) : cadena),
  apply: () => cadena,
});
export const supabase = cadena;
export const createClient = () => cadena;
