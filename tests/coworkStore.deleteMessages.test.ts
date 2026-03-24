import { describe, expect, test, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { CoworkStore } from '../src/main/coworkStore';

// ---------------------------------------------------------------------------
// Setup — shared in-memory SQLite DB
// ---------------------------------------------------------------------------

let db: Database;
let store: CoworkStore;

async function createInMemoryDb(): Promise<Database> {
    const SQL = await initSqlJs();
    const database = new SQL.Database();

    database.run(`
    CREATE TABLE IF NOT EXISTS cowork_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      claude_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      pinned INTEGER NOT NULL DEFAULT 0,
      cwd TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      execution_mode TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

    database.run(`
    CREATE TABLE IF NOT EXISTS cowork_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      sequence INTEGER,
      FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE
    );
  `);

    return database;
}

function insertSession(db: Database, sessionId: string): void {
    db.run(
        `INSERT INTO cowork_sessions (id, title, status, pinned, cwd, system_prompt, created_at, updated_at)
     VALUES (?, 'Test', 'idle', 0, '/', '', ?, ?)`,
        [sessionId, Date.now(), Date.now()],
    );
}

function insertMessage(db: Database, id: string, sessionId: string): void {
    db.run(
        `INSERT INTO cowork_messages (id, session_id, type, content, created_at)
     VALUES (?, ?, 'user', 'content', ?)`,
        [id, sessionId, Date.now()],
    );
}

function queryMessageIds(db: Database, sessionId: string): string[] {
    const result = db.exec(
        'SELECT id FROM cowork_messages WHERE session_id = ? ORDER BY created_at',
        [sessionId],
    );
    return result[0]?.values.map((row) => row[0] as string) ?? [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoworkStore — deleteMessages', () => {
    beforeEach(async () => {
        db = await createInMemoryDb();
        store = new CoworkStore(db, () => { });
        insertSession(db, 'session-1');
        insertSession(db, 'session-2');
    });

    // ── 1. 基础删除 ─────────────────────────────────────────────────────────
    test('删除指定 ID 的消息', () => {
        insertMessage(db, 'a', 'session-1');
        insertMessage(db, 'b', 'session-1');
        insertMessage(db, 'c', 'session-1');

        store.deleteMessages('session-1', ['a', 'c']);

        expect(queryMessageIds(db, 'session-1')).toEqual(['b']);
    });

    // ── 2. 删除全部消息 ──────────────────────────────────────────────────────
    test('删除所有消息后表中无记录', () => {
        insertMessage(db, 'a', 'session-1');
        insertMessage(db, 'b', 'session-1');

        store.deleteMessages('session-1', ['a', 'b']);

        expect(queryMessageIds(db, 'session-1')).toEqual([]);
    });

    // ── 3. 不删除其他 session 的消息 ────────────────────────────────────────
    test('只删除指定 sessionId 下的消息，其他 session 不受影响', () => {
        insertMessage(db, 'a', 'session-1');
        insertMessage(db, 'b', 'session-2');

        store.deleteMessages('session-1', ['a']);

        expect(queryMessageIds(db, 'session-1')).toEqual([]);
        expect(queryMessageIds(db, 'session-2')).toEqual(['b']);
    });

    // ── 4. 多条消息批量删除 ──────────────────────────────────────────────────
    test('一次删除多条消息，其余消息保持不变', () => {
        ['m1', 'm2', 'm3', 'm4', 'm5'].forEach(id => insertMessage(db, id, 'session-1'));

        store.deleteMessages('session-1', ['m1', 'm3', 'm5']);

        expect(queryMessageIds(db, 'session-1')).toEqual(['m2', 'm4']);
    });

    // ── 5. messageIds 为空数组时不执行删除 ─────────────────────────────────
    test('messageIds 为空数组 → 提前返回，消息不变', () => {
        insertMessage(db, 'a', 'session-1');
        insertMessage(db, 'b', 'session-1');

        store.deleteMessages('session-1', []);

        expect(queryMessageIds(db, 'session-1')).toEqual(['a', 'b']);
    });

    // ── 6. 包含不存在的 ID 不报错 ───────────────────────────────────────────
    test('messageIds 中含不存在的 ID → 不报错，现有消息正常删除', () => {
        insertMessage(db, 'a', 'session-1');

        expect(() => store.deleteMessages('session-1', ['a', 'ghost-id'])).not.toThrow();
        expect(queryMessageIds(db, 'session-1')).toEqual([]);
    });

});
