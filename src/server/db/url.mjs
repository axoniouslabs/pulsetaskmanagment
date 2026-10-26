// Find the Postgres connection string whatever the hosting integration called it.
// Neon on Vercel adds e.g. DATABASE_URL, POSTGRES_URL, or with a custom prefix
// DATABASE_DATABASE_URL / STORAGE_POSTGRES_URL, plus "unpooled" variants for migrations.

const isPg = (v) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v);
const DIRECT_HINT = /(UNPOOLED|NON_POOLING|DIRECT)/;

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ direct?: boolean }} [opts] direct: prefer an unpooled URL (for migrations)
 * @returns {string | undefined}
 */
export function findDatabaseUrl(env, opts = {}) {
  const exact = opts.direct
    ? ["DIRECT_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"]
    : ["DATABASE_URL", "POSTGRES_URL"];
  for (const k of exact) if (isPg(env[k])) return env[k];

  const keys = Object.keys(env).filter((k) => isPg(env[k]) && /URL/.test(k)).sort();
  const pooled = keys.filter((k) => !DIRECT_HINT.test(k));
  const direct = keys.filter((k) => DIRECT_HINT.test(k));
  const rank = (k) => (/DATABASE_URL$/.test(k) ? 0 : /POSTGRES_URL$/.test(k) ? 1 : 2);
  const best = (list) => [...list].sort((a, b) => rank(a) - rank(b))[0];
  const pick = opts.direct ? best(direct) ?? best(pooled) : best(pooled) ?? best(direct);
  return pick ? env[pick] : undefined;
}
