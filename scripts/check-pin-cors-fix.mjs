import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, `file://${process.cwd()}/`), 'utf8');
const pos = read('backend/src/interfaces/http/routes/pos.ts');
const app = read('backend/src/app.ts');
const errorHandler = read('backend/src/interfaces/http/middleware/errors.ts');
const frontend = read('frontend/src/App.vue');
const api = read('frontend/src/services/api.ts');

assert.match(pos, /status\(locked\s*\?\s*429\s*:\s*422\)/, 'wrong PIN must be a validation error, not HTTP 401');
assert.match(pos, /Mohon maaf, PIN salah\./, 'wrong PIN text should match the requested validation');
assert.match(frontend, /error\.status === 422 && \/pin salah\/i\.test\(error\.message\)/, 'frontend must intercept wrong PIN without logout');
assert.match(frontend, /paymentPinError\.value = 'Mohon maaf, PIN salah\.'/);
assert.match(frontend, /v-if="paymentPinError" class="pin-error" role="alert"/);
assert.match(app, /process\.env\.NODE_ENV !== 'development'/, 'LAN origins must only be relaxed in development');
assert.match(app, /isPrivateIpv4\(hostname\)/, 'CORS should allow private IPv4 LAN origins in development');
assert.match(app, /CorsOriginError/, 'CORS rejections should be identified in server logs');
assert.match(errorHandler, /CORS rejected origin:/);
assert.match(api, /return '\/api'/, 'phone browsers must avoid calling their own localhost API');
assert.match(api, /Tidak dapat menghubungi API DMC FLOW/);
console.log('PIN session and LAN CORS fix static checks passed.');
