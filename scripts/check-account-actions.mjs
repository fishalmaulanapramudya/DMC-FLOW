import fs from 'node:fs';

const app = fs.readFileSync(new URL('../frontend/src/App.vue', import.meta.url), 'utf8');
const usersRoute = fs.readFileSync(new URL('../backend/src/interfaces/http/routes/users.ts', import.meta.url), 'utf8');
const walletRoute = fs.readFileSync(new URL('../backend/src/interfaces/http/routes/wallet.ts', import.meta.url), 'utf8');
const requiredHandlers = ['createUser', 'showQr', 'rotateQr', 'revokeQr', 'toggleUserStatus', 'changeUserRole', 'openTopup', 'submitTopup', 'downloadQr'];
const missing = requiredHandlers.filter(name => !new RegExp(`function\\s+${name}\\s*\\(`).test(app));
if (missing.length) {
  console.error(`Missing account action handlers: ${missing.join(', ')}`);
  process.exit(1);
}
const requiredRoutes = [
  [usersRoute, /usersRouter\.post\('\/:id\/qr\/rotate'/, 'QR rotate endpoint'],
  [usersRoute, /usersRouter\.post\('\/:id\/qr\/revoke'/, 'QR revoke endpoint'],
  [usersRoute, /usersRouter\.patch\('\/:id\/status'/, 'account status endpoint'],
  [usersRoute, /usersRouter\.patch\('\/:id\/role'/, 'role endpoint'],
  [walletRoute, /walletRouter\.post\('\/topups'/, 'wallet top-up endpoint'],
];
const absentRoutes = requiredRoutes.filter(([source, pattern]) => !pattern.test(source)).map(([, , label]) => label);
if (absentRoutes.length) {
  console.error(`Missing account API endpoints: ${absentRoutes.join(', ')}`);
  process.exit(1);
}
const requiredBindings = ['@click="openTopup(account)"', '@click="toggleUserStatus(account)"', '@click="changeUserRole(account)"', '@submit.prevent="submitTopup"'];
const absentBindings = requiredBindings.filter(binding => !app.includes(binding));
if (absentBindings.length) {
  console.error(`Missing account UI bindings: ${absentBindings.join(', ')}`);
  process.exit(1);
}
console.log('Account/QR/top-up action check passed: frontend handlers, UI bindings, and backend endpoints are present.');
