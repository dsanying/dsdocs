export class DomainError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
export function requireValue<T>(value: T | undefined | null, status = 404, code = 'NOT_FOUND'): T {
  if (value === undefined || value === null) throw new DomainError(status, code, code);
  return value;
}
