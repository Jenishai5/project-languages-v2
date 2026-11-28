export interface PendingSave {
  sentence: string;
  key:      string;
}

export function attemptFor(
  pending: PendingSave | undefined,
  sentence: string,
  newKey: () => string = () => crypto.randomUUID(),
): PendingSave {
  return pending && pending.sentence === sentence ? pending : { sentence, key: newKey() };
}
