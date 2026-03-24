import { describe, expect, test } from 'vitest';
import type { ConversationTurn } from '../src/renderer/components/cowork/CoworkSessionDetail';
import { expandMessageIdsForDeletion } from '../src/renderer/utils/coworkDeleteUtils';

// ---------------------------------------------------------------------------
// Helpers — build lightweight fake messages and turns
// ---------------------------------------------------------------------------

let _idSeq = 0;
function msg(id: string) {
    return { id, type: 'user' as const, role: 'user' as const, content: '', sessionId: 'session1', createdAt: ++_idSeq };
}

function turn(
    userMsgId: string | null,
    assistantItems: ConversationTurn['assistantItems'],
): ConversationTurn {
    return {
        id: `turn-${++_idSeq}`,
        userMessage: userMsgId ? msg(userMsgId) : null,
        assistantItems,
    };
}

function assistantItem(id: string): ConversationTurn['assistantItems'][number] {
    return { type: 'assistant', message: msg(id) };
}

function toolGroupItem(
    toolUseId: string,
    toolResultId?: string,
): ConversationTurn['assistantItems'][number] {
    return {
        type: 'tool_group',
        group: {
            type: 'tool_group',
            toolUse: msg(toolUseId),
            toolResult: toolResultId ? msg(toolResultId) : null,
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expandMessageIdsForDeletion', () => {

    // ── 1. 基础：空输入 ────────────────────────────────────────────────────────
    test('空选择 → 返回空数组', () => {
        const turns = [turn('u1', [assistantItem('a1')])];
        expect(expandMessageIdsForDeletion([], turns)).toEqual([]);
    });

    // ── 2. 只选 user 消息 ───────────────────────────────────────────────────────
    test('只选 user 消息 → user + 同轮所有 assistant 消息一并删除', () => {
        const turns_ = [turn('u1', [assistantItem('a1'), assistantItem('a2')])];
        const result = expandMessageIdsForDeletion(['u1'], turns_);
        expect(result.sort()).toEqual(['a1', 'a2', 'u1'].sort());
    });

    // ── 3. 只选 assistant 消息 → 不扩展 user 消息 ─────────────────────────────
    test('只选 assistant 消息 → user 消息不被强制加入', () => {
        const turns_ = [turn('u1', [assistantItem('a1'), assistantItem('a2')])];
        const result = expandMessageIdsForDeletion(['a1'], turns_);
        expect(result).not.toContain('u1');
    });

    // ── 4. 只选 assistant 消息 → 同轮其他 assistant 一起扩展 ──────────────────
    test('选中 assistant 消息 → 同轮所有 assistant 消息都被扩展', () => {
        const turns_ = [turn('u1', [assistantItem('a1'), assistantItem('a2'), assistantItem('a3')])];
        const result = expandMessageIdsForDeletion(['a1'], turns_);
        expect(result.sort()).toEqual(['a1', 'a2', 'a3'].sort());
        expect(result).not.toContain('u1');
    });

    // ── 5. tool_group：选中 tool_use → tool_result 一起被扩展 ─────────────────
    test('选中 tool_use → 配对的 tool_result 一起扩展', () => {
        const turns_ = [turn('u1', [toolGroupItem('tu1', 'tr1')])];
        const result = expandMessageIdsForDeletion(['tu1'], turns_);
        expect(result.sort()).toEqual(['tr1', 'tu1'].sort());
        expect(result).not.toContain('u1');
    });

    // ── 6. tool_group：选中 tool_result → tool_use 一起被扩展 ─────────────────
    test('选中 tool_result → 配对的 tool_use 一起扩展', () => {
        const turns_ = [turn('u1', [toolGroupItem('tu1', 'tr1')])];
        const result = expandMessageIdsForDeletion(['tr1'], turns_);
        expect(result.sort()).toEqual(['tr1', 'tu1'].sort());
        expect(result).not.toContain('u1');
    });

    // ── 7. tool_group 无 tool_result ───────────────────────────────────────────
    test('tool_group 没有 tool_result 时，只删 tool_use', () => {
        const turns_ = [turn('u1', [toolGroupItem('tu1')])];
        const result = expandMessageIdsForDeletion(['tu1'], turns_);
        expect(result).toEqual(['tu1']);
    });

    // ── 8. 混合：assistant + tool_group 在同一轮 ──────────────────────────────
    test('选中 assistant 消息 → 同轮 tool_group 也被扩展（含 tool_use/tool_result）', () => {
        const turns_ = [
            turn('u1', [
                assistantItem('a1'),
                toolGroupItem('tu1', 'tr1'),
                assistantItem('a2'),
            ]),
        ];
        const result = expandMessageIdsForDeletion(['a1'], turns_);
        expect(result.sort()).toEqual(['a1', 'a2', 'tr1', 'tu1'].sort());
        expect(result).not.toContain('u1');
    });

    // ── 9. 跨轮：只扩展被选中的那一轮 ────────────────────────────────────────
    test('只扩展被选中消息所在的轮次，其他轮次不受影响', () => {
        const turns_ = [
            turn('u1', [assistantItem('a1'), assistantItem('a2')]),
            turn('u2', [assistantItem('b1'), assistantItem('b2')]),
        ];
        const result = expandMessageIdsForDeletion(['a1'], turns_);
        expect(result.sort()).toEqual(['a1', 'a2'].sort());
        expect(result).not.toContain('u1');
        expect(result).not.toContain('b1');
        expect(result).not.toContain('b2');
    });

    // ── 10. 同时选中两轮的消息 ─────────────────────────────────────────────────
    test('同时选中两轮的消息 → 各自扩展各自轮次', () => {
        const turns_ = [
            turn('u1', [assistantItem('a1'), assistantItem('a2')]),
            turn('u2', [assistantItem('b1'), toolGroupItem('tu1', 'tr1')]),
        ];
        const result = expandMessageIdsForDeletion(['a1', 'b1'], turns_);
        expect(result.sort()).toEqual(['a1', 'a2', 'b1', 'tr1', 'tu1'].sort());
        expect(result).not.toContain('u1');
        expect(result).not.toContain('u2');
    });

    // ── 11. 同时选中 user 和 assistant ────────────────────────────────────────
    test('同时选中 user 和 assistant 消息 → 两者都删，同轮其他 assistant 也扩展', () => {
        const turns_ = [turn('u1', [assistantItem('a1'), assistantItem('a2')])];
        const result = expandMessageIdsForDeletion(['u1', 'a1'], turns_);
        expect(result.sort()).toEqual(['a1', 'a2', 'u1'].sort());
    });

    // ── 12. 无 userMessage 的轮次（孤立 assistant） ────────────────────────────
    test('没有 userMessage 的轮次中选中 assistant → 正常扩展，不崩溃', () => {
        const turns_ = [turn(null, [assistantItem('a1'), assistantItem('a2')])];
        const result = expandMessageIdsForDeletion(['a1'], turns_);
        expect(result.sort()).toEqual(['a1', 'a2'].sort());
    });

    // ── 13. 去重：同一 ID 被多次传入 ──────────────────────────────────────────
    test('selectedIds 中有重复 ID → 结果不重复', () => {
        const turns_ = [turn('u1', [assistantItem('a1')])];
        const result = expandMessageIdsForDeletion(['a1', 'a1', 'a1'], turns_);
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
    });

});
