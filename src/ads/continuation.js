export async function requestContinuation(game, ads) {
  if (!game.canContinue()) return { status: 'invalid', continued: false };
  const runId = game.runId;
  const result = await ads.request('rewarded', { runId });
  const continued = result.rewarded && game.continueAfterReward(runId);
  return { ...result, continued: Boolean(continued) };
}
