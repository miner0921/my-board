import { Pool, PoolClient } from "pg";

// PostgreSQL 연결 풀 생성
// 풀(Pool)이란? 여러 개의 DB 연결을 미리 만들어놓고 재사용하는 방식.
// 매번 새 연결을 만드는 것보다 훨씬 빠르고 효율적입니다.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon 같은 클라우드 DB는 SSL이 필수
  // 로컬 PostgreSQL에서는 SSL 없이 동작
  ssl: process.env.DATABASE_URL?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined,
});

// 쿼리를 쉽게 실행할 수 있는 헬퍼 함수
// 예: query("SELECT * FROM posts WHERE id = $1", [1])
export async function query(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return result;
}

// 트랜잭션 헬퍼: fn 안에서 client.query(...) 호출.
// 정상 종료 → COMMIT, throw → ROLLBACK, 항상 release.
//
// 사용 예:
//   const result = await withTransaction(async (client) => {
//     const r1 = await client.query("INSERT ... RETURNING id", [...]);
//     await client.query("INSERT ...", [r1.rows[0].id, ...]);
//     return r1.rows[0].id;
//   });
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ROLLBACK 실패해도 원래 에러를 던지기 위해 무시 */
    }
    throw e;
  } finally {
    client.release();
  }
}

export default pool;
