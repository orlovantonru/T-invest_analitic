// Печатает значение для APP_PASSWORD_HASH из пароля.
//   node scripts/hash-password.mjs 'мой-пароль' 2>/dev/null
// (2>/dev/null глушит предупреждения auth.js о ненастроенном окружении)
import { hashPassword } from "../server/auth.js";

const pw = process.argv[2];
if (!pw) {
  console.error("usage: node scripts/hash-password.mjs '<password>'");
  process.exit(1);
}
console.log(hashPassword(pw));
