// Default credentials for new login accounts. Both stay editable and visible
// so they can be handed to the account owner.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const random = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length));

// 20 characters from an unambiguous alphabet: easy to read out, hard to guess.
export function randomPassword(length = 20) {
  return Array.from(random(length), (n) => alphabet[n % alphabet.length]).join(
    "",
  );
}

// "sp" plus 6 digits, within the 3–32 letters/digits/._- account rule.
export function randomAccount() {
  return "sp" + Array.from(random(6), (n) => n % 10).join("");
}
