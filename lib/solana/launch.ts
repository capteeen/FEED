// Launch economics shown in the launch modal. Phase 1 mocks the launch; Phase 2
// calls PumpPortal's create endpoint (see README) and funds the agent vault.
export const LAUNCH_COST_SOL = 0.02;

export function launchBreakdown(startingSol: number, devBuySol: number) {
  const launchCost = LAUNCH_COST_SOL;
  const vault = Math.max(0, startingSol);
  const devBuy = Math.max(0, devBuySol);
  return { launchCost, vault, devBuy, total: Math.round((launchCost + vault + devBuy) * 1e4) / 1e4 };
}
