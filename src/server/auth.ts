import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';

export const COOKIE = 'prisme_session';
export interface Credentials { salt: string; hash: string; version: string; }
// Credentials are runtime state and must never be bundled by the deployment tracer.
export const credentialPath = () => path.resolve(/* turbopackIgnore: true */ process.env.AUTH_FILE || '.local/auth.json');
export async function readCredentials(): Promise<Credentials | null> {
  try { return JSON.parse(await readFile(/* turbopackIgnore: true */ credentialPath(), 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
export async function setPassword(password: string) {
  if (password.length < 12 || password.length > 256) throw new Error('Utilisez entre 12 et 256 caractères.');
  const salt = randomBytes(32).toString('hex');
  const record: Credentials = { salt, hash: scryptSync(password, salt, 64).toString('hex'), version: randomBytes(16).toString('hex') };
  await mkdir(path.dirname(credentialPath()), {recursive:true, mode:0o700});
  await writeFile(credentialPath(), JSON.stringify(record), {mode:0o600});
  return record;
}
export function verifyPassword(password: string, c: Credentials) {
  if (!password || password.length > 256) return false;
  const actual = scryptSync(password, c.salt, 64), expected = Buffer.from(c.hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function signingKey() {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 40) throw new Error('Exécutez npm run setup pour initialiser la session.');
  return key;
}
export function createSession(version: string) {
  const payload = Buffer.from(JSON.stringify({exp:Date.now()+12*3600_000, version, nonce:randomBytes(16).toString('hex')})).toString('base64url');
  return `${payload}.${createHmac('sha256', signingKey()).update(payload).digest('base64url')}`;
}
export async function validSession(token: string | undefined) {
  if (!token || token.length > 2048) return false;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return false;
    const expected = createHmac('sha256', signingKey()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const credentials = await readCredentials();
    return !!credentials && parsed.version === credentials.version && Number.isFinite(parsed.exp) && parsed.exp > Date.now();
  } catch { return false; }
}
export async function authenticated() { return validSession((await cookies()).get(COOKIE)?.value); }
export function cookieOptions() { return { httpOnly:true, secure:(process.env.APP_ORIGIN || '').startsWith('https://'), sameSite:'strict' as const, path:'/', maxAge:12*3600 }; }
export function sameOrigin(request: Request) { return request.headers.get('origin') === (process.env.APP_ORIGIN || 'http://127.0.0.1:3000'); }

const loginAttempts = new Map<string,{count:number,until:number}>();
export function allowLogin() {
  // Single-user local server: a global limiter cannot be evaded with an untrusted IP header.
  const key = 'single-user';
  const now = Date.now(), previous = loginAttempts.get(key);
  if (!previous || previous.until < now) { loginAttempts.set(key,{count:1,until:now+60_000}); return true; }
  previous.count++;
  return previous.count <= 8;
}
