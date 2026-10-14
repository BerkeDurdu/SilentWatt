// Prints one account entry for SILENTWATT_USERS_FILE. The password is read from stdin, never from argv,
// so it does not end up in shell history:  npm run hash-password -- <id> <role> <email> "<name>"
import { hashPassword } from '../server/password';
import { isRoleKey } from '../server/catalog';

const [id, role, email, name] = process.argv.slice(2);
if (!id || !role || !email || !name || !isRoleKey(role)) {
  console.error('Usage: npm run hash-password -- <id> <manager|operator|technician|admin> <email> "<full name>"  (password on stdin)');
  process.exit(1);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const password = input.replace(/\r?\n$/, '');
  if (password.length < 12) {
    console.error('Use a password of at least 12 characters.');
    process.exit(1);
  }
  console.log(JSON.stringify({ id, name, email, role, ...hashPassword(password) }, null, 2));
});
