export function createSaunaNodeId(): string {
  const cryptoAny = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
  if (cryptoAny?.randomUUID) return cryptoAny.randomUUID();
  return `n_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

