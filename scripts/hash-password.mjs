// Generate an APP_PASSWORD_HASH value.
//   node scripts/hash-password.mjs 'my-password'
import { hashPassword } from "../server/auth.js";

const pw = process.argv[2];
if (!pw) {
  console.error("usage: node scripts/hash-password.mjs '<password>'");
  process.exit(1);
}
console.log(hashPassword(pw));
