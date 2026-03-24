import type { AssistantTurnItem, ConversationTurn } from '../components/cowork/CoworkSessionDetail';

/**
 * Expands a set of explicitly selected message IDs to include all related
 * messages that must be deleted together for data consistency:
 *
 * - If any assistant item in a turn is selected, all other assistant items
 *   in the same turn are also included (tool_use/tool_result must stay paired).
 * - User messages are NEVER force-added — they are only deleted if explicitly selected.
 *
 * @param selectedIds  The IDs explicitly chosen by the user in the UI.
 * @param turns        The full conversation turn list (used for pairing context).
 * @returns            A deduplicated array of all message IDs to delete.
 */
export function expandMessageIdsForDeletion(
    selectedIds: string[],
    turns: ConversationTurn[],
): string[] {
    const allIdsToDelete = new Set<string>(selectedIds);

    for (const turn of turns) {
        const hasSelectedInTurn =
            (turn.userMessage != null && allIdsToDelete.has(turn.userMessage.id)) ||
            turn.assistantItems.some((item) => isAssistantItemSelected(item, allIdsToDelete));

        if (hasSelectedInTurn) {
            // Expand to all assistant items in this turn for data consistency.
            // Do NOT force-add turn.userMessage — only delete it if explicitly selected.
            for (const item of turn.assistantItems) {
                addAssistantItemIds(item, allIdsToDelete);
            }
        }
    }

    return Array.from(allIdsToDelete);
}

function isAssistantItemSelected(item: AssistantTurnItem, ids: Set<string>): boolean {
    if (item.type === 'assistant' || item.type === 'tool_result') {
        return ids.has(item.message.id);
    }
    if (item.type === 'tool_group') {
        return (
            ids.has(item.group.toolUse.id) ||
            (item.group.toolResult != null && ids.has(item.group.toolResult.id))
        );
    }
    return false;
}

function addAssistantItemIds(item: AssistantTurnItem, ids: Set<string>): void {
    if (item.type === 'assistant' || item.type === 'tool_result') {
        ids.add(item.message.id);
    } else if (item.type === 'tool_group') {
        ids.add(item.group.toolUse.id);
        if (item.group.toolResult) {
            ids.add(item.group.toolResult.id);
        }
    }
}
