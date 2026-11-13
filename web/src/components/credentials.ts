// Application login passwords: eight alphanumeric characters with both cases.
const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const lower = "abcdefghijkmnpqrstuvwxyz";
const alphabet = upper + lower + "23456789";
function index(size: number) {
  const limit = 256 - (256 % size);
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (value >= limit);
  return value % size;
}
export function randomPassword() {
  const chars = [upper[index(upper.length)], lower[index(lower.length)]];
  while (chars.length < 8) chars.push(alphabet[index(alphabet.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = index(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
// Account identifiers are separate from the password policy.
export function randomAccount() {
  return "sp" + Array.from({ length: 6 }, () => index(10)).join("");
}
