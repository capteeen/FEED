// Launching an agent is free for the creator. FEED covers the pump.fun create
// fee, seeds the agent vault and makes the dev buy; after that, creator fees
// fund the agent's trading. Phase 1 mocks all of it.
export const FEED_SPONSORED = {
  launchCost: 0.02, // pump.fun create fee, paid by FEED
  vault: 1, // starter trading vault, funded by FEED
  devBuy: 0.1, // dev buy, made by FEED for the agent
};

export function launchBreakdown() {
  return { ...FEED_SPONSORED, total: 0 };
}
