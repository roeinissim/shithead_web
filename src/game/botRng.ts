// Crypto-random 32-bit seed for the bot's injected mulberry32. The bot never calls Math.random;
// only this seed is random. crypto (not Date.now) avoids identical seeds when the AI turn-loop
// fires multiple decideMove calls inside the same millisecond (8/10/joker chains).
export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}
