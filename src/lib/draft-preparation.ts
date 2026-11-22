import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

const preparation = new AsyncLocalStorage<boolean>();
class Prepared extends Error {
  constructor(readonly ticket: string) {
    super("Draft reserved before send");
  }
}

export function draftReserved(ticket: string) {
  if (preparation.getStore()) throw new Prepared(ticket);
}

export const isDraftPreparation = () => preparation.getStore() === true;

// Execute the exact action validator, scope check and draft normalization,
// stopping at reservation before any business mutation can run.
export function prepareDraft(action: () => Promise<unknown>) {
  return preparation.run(true, async () => {
    try {
      return { state: await action() };
    } catch (error) {
      if (error instanceof Prepared) return { prepared: error.ticket };
      throw error;
    }
  });
}
