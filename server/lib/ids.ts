import { randomBytes } from 'node:crypto';

export function generateId(prefix = ''): string {
  const random = randomBytes(12).toString('hex');
  return prefix ? `${prefix}_${random}` : random;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}
