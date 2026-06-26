import { Pool, PoolClient, types } from "pg";

// TIMESTAMP WITHOUT TIME ZONE (OID 1114) 파서 고정.
// DB에는 UTC 벽시계값으로 저장되는데, node-postgres 기본 동작은 이 값을
// "실행 프로세스의 로컬 TZ"로 해석한다. 그래서 배포(UTC)와 로컬 dev(KST)에서
// 같은 데이터가 다른 순간으로 읽히는 문제가 있었다.
// → 항상 UTC로 해석하도록 강제해 환경과 무관하게 올바른 순간으로 읽고,
//   표시 단계(Intl, timeZone: "Asia/Seoul")에서 한국시간으로 변환한다.
types.setTypeParser(1114, (val: string) =>
  val === null ? null : new Date(val.replace(" ", "T") + "Z")
);

// PostgreSQL 연결 풀 생성
// 풀(Pool)이란? 여러 개의 DB 연결을 미리 만들어놓고 재사용하는 방식.
// 매번 새 연결을 만드는 것보다 훨씬 빠르고 효율적입니다.
// SSL 적용 여부 판단
// - 로컬 PostgreSQL(localhost/127.0.0.1): SSL 끔
// - Cloud Run의 유닉스 소켓(/cloudsql/...): 소켓 연결이라 SSL 불필요
// - 그 외 원격(Neon, GCP Cloud SQL 공개 IP 등): SSL 켜되 인증서 검증은 생략
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDb = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");
const isUnixSocket = dbUrl.includes("/cloudsql/") || dbUrl.includes("host=/");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: !isLocalDb && !isUnixSocket ? { rejectUnauthorized: false } : undefined,
  // 커넥션 풀 상한: Cloud Run maxScale(8) × max(4) = 32 연결.
  // Cloud SQL max_connections=50 안에서 관리/마이그레이션용 여유(18) 확보.
  max: 4,
  // 유휴 연결 30초 후 반환 — 인스턴스 스케일 다운 시 연결 누수 방지.
  idleTimeoutMillis: 30000,
  // 5초 내 연결 못 얻으면 에러 — 풀 포화 시 무한 대기 방지.
  connectionTimeoutMillis: 5000,
});

// 쿼리를 쉽게 실행할 수 있는 헬퍼 함수
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
