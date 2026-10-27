import { HttpError } from '../http/errors.js';

export interface UserInput {
  name: string;
  email: string;
}
function invalidInput(): never {
  throw new HttpError(400, 'VALIDATION_ERROR',
    'Provide only name (1–100 characters) and a valid email (up to 254 characters)');
}
export function validateUserInput(value: unknown): UserInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidInput();
  }
  if (Object.keys(value).some((key) => key !== 'name' && key !== 'email')) {
    return invalidInput();
  }
  const fields = value as Record<string, unknown>;
  const rawName = fields['name'];
  const rawEmail = fields['email'];
  if (typeof rawName !== 'string' || typeof rawEmail !== 'string') {
    return invalidInput();
  }
  const name = rawName.trim();
  const email = rawEmail.trim().toLowerCase();
  if (name.length < 1 || name.length > 100 || email.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return invalidInput();
  }
  return { name, email };
}
export function validateUserId(value: string | undefined): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'User ID must be a positive safe integer');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'User ID must be a positive safe integer');
  }
  return id;
}
