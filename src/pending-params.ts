const pending = new Map<string, unknown>();
const MAX_PENDING = 32;

export function rememberToolParams(toolCallId: string, params: unknown): void {
  if (!toolCallId) {
    return;
  }
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest) {
      pending.delete(oldest);
    }
  }
  pending.set(toolCallId, params);
}

export function takeToolParams(toolCallId: string): unknown {
  const params = pending.get(toolCallId);
  pending.delete(toolCallId);
  return params;
}
