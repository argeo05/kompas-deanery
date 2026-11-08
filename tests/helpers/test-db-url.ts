// Тесты работают только с отдельной базой TEST_DATABASE_URL (D-004).
// Рабочая база DATABASE_URL тестам недоступна: resetDb() делает TRUNCATE всех таблиц.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** host:port/db — чтобы `localhost` и `127.0.0.1` или разный пароль не выдавали одну базу за две. */
function dbIdentity(url: string): string {
  const u = new URL(url);
  const host = LOCAL_HOSTS.has(u.hostname) ? "localhost" : u.hostname.toLowerCase();
  return `${host}:${u.port || "5432"}/${decodeURIComponent(u.pathname.replace(/^\//, ""))}`;
}

/** Возвращает TEST_DATABASE_URL или бросает ошибку, если он не задан или указывает на рабочую базу. */
export function requireTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const test = env.TEST_DATABASE_URL;
  if (!test) {
    throw new Error(
      "TEST_DATABASE_URL не задан. Тесты с БД используют только его — см. .env.example (база kompas_test).",
    );
  }
  const dev = env.DATABASE_URL;
  if (dev && dbIdentity(dev) === dbIdentity(test)) {
    throw new Error(
      `TEST_DATABASE_URL совпадает с DATABASE_URL (${dbIdentity(test)}). Тесты очищают базу — укажите отдельную, например kompas_test.`,
    );
  }
  return test;
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}
