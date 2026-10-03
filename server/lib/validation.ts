import { ZodError } from 'zod';

/** Converts a ZodError into a short human-friendly message. */
export function zodErrorToMessage(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid request payload.';
  const field = first.path.join('.');
  return field ? `Invalid value for "${field}".` : first.message;
}
