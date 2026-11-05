// Errors thrown by routes; the error middleware turns them into JSON responses.
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Postgres unique_violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
