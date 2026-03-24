import { describe, expect, test } from 'vitest';
import { createSlice, configureStore } from '@reduxjs/toolkit';
import type { CoworkMessage, CoworkSession } from '../src/renderer/types/cowork';

// Import the slice actions and reducer
// We import the whole slice module to access the reducer and actions
import coworkReducer, { deleteMessages } from '../src/renderer/store/slices/coworkSlice';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(id: string, type: CoworkMessage['type'] = 'user'): CoworkMessage {
    return {
        id,
        type,
        role: type === 'user' ? 'user' : 'assistant',
        content: `content-${id}`,
        sessionId: 'session-1',
        timestamp: Date.now(),
        metadata: {},
    };
}

function makeSession(id: string, messages: CoworkMessage[]): CoworkSession {
    return {
        id,
        title: 'Test Session',
        status: 'idle',
        messages,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('coworkSlice — deleteMessages reducer', () => {

    // ── 1. 基础删除 ─────────────────────────────────────────────────────────
    test('删除指定 ID 的消息', () => {
        const messages = [makeMessage('a'), makeMessage('b'), makeMessage('c')];
        const state = { currentSession: makeSession('session-1', messages) } as any;

        const next = coworkReducer(state, deleteMessages({ sessionId: 'session-1', messageIds: ['a', 'c'] }));

        expect(next.currentSession?.messages.map((m: CoworkMessage) => m.id)).toEqual(['b']);
    });

    // ── 2. 删除全部消息 ──────────────────────────────────────────────────────
    test('删除所有消息后 messages 为空数组', () => {
        const messages = [makeMessage('a'), makeMessage('b')];
        const state = { currentSession: makeSession('session-1', messages) } as any;

        const next = coworkReducer(state, deleteMessages({ sessionId: 'session-1', messageIds: ['a', 'b'] }));

        expect(next.currentSession?.messages).toEqual([]);
    });

    // ── 3. 不存在的 ID 不影响结果 ───────────────────────────────────────────
    test('messageIds 中包含不存在的 ID → 现有消息不受影响', () => {
        const messages = [makeMessage('a'), makeMessage('b')];
        const state = { currentSession: makeSession('session-1', messages) } as any;

        const next = coworkReducer(state, deleteMessages({ sessionId: 'session-1', messageIds: ['x', 'y'] }));

        expect(next.currentSession?.messages.map((m: CoworkMessage) => m.id)).toEqual(['a', 'b']);
    });

    // ── 4. sessionId 不匹配时不删除 ─────────────────────────────────────────
    test('sessionId 与 currentSession 不匹配 → 消息不被删除', () => {
        const messages = [makeMessage('a'), makeMessage('b')];
        const state = { currentSession: makeSession('session-1', messages) } as any;

        const next = coworkReducer(state, deleteMessages({ sessionId: 'session-OTHER', messageIds: ['a'] }));

        expect(next.currentSession?.messages.map((m: CoworkMessage) => m.id)).toEqual(['a', 'b']);
    });

    // ── 5. messageIds 为空数组 ───────────────────────────────────────────────
    test('messageIds 为空数组 → 消息不变', () => {
        const messages = [makeMessage('a'), makeMessage('b')];
        const state = { currentSession: makeSession('session-1', messages) } as any;

        const next = coworkReducer(state, deleteMessages({ sessionId: 'session-1', messageIds: [] }));

        expect(next.currentSession?.messages.map((m: CoworkMessage) => m.id)).toEqual(['a', 'b']);
    });

    // ── 6. currentSession 为 null 时不崩溃 ──────────────────────────────────
    test('currentSession 为 null → 不崩溃', () => {
        const state = { currentSession: null } as any;

        expect(() => {
            coworkReducer(state, deleteMessages({ sessionId: 'session-1', messageIds: ['a'] }));
        }).not.toThrow();
    });

    // ── 7. 保持消息顺序 ──────────────────────────────────────────────────────
    test('删除后剩余消息保持原始顺序', () => {
        const messages = ['a', 'b', 'c', 'd', 'e'].map(id => makeMessage(id));
        const state = { currentSession: makeSession('session-1', messages) } as any;

        const next = coworkReducer(state, deleteMessages({ sessionId: 'session-1', messageIds: ['b', 'd'] }));

        expect(next.currentSession?.messages.map((m: CoworkMessage) => m.id)).toEqual(['a', 'c', 'e']);
    });

});
