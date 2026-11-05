export const DEAL_START = 1100;
export const DEAL_STEP = 65;
export const dealDuration = (count: number) => DEAL_START + count * DEAL_STEP + 400;

// Initial allocation follows public deck/dealer rules, never opponent hand data.
export function initialDealCounts(players: { penaltyCards: unknown[] }[], dealerIndex = 0): number[] {
  const available = Math.max(0, 52 - players.reduce((sum, player) => sum + player.penaltyCards.length, 0));
  const counts = players.map(() => 0);
  for (let i = 0; i < available && players.length; i++) counts[(dealerIndex + i) % players.length]++;
  return counts;
}

// Animate one card per seat while respecting the server's playable hand sizes.
export function dealSequence(counts: number[], dealerIndex = 0): number[] {
  const result: number[] = [];
  for (let card = 0; card < Math.max(0, ...counts); card++) {
    counts.forEach((_, offset) => {
      const seat = (dealerIndex + offset) % counts.length;
      if (card < counts[seat]) result.push(seat);
    });
  }
  return result;
}
