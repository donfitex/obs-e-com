import { HttpError } from '../http/errors.js';
import type { UserInput } from './user.validation.js';

export interface User extends UserInput {
  id: number;
}
export class UserService {
  private readonly users = new Map<number, User>([
    [1, { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' }],
  ]);
  private nextId = 2;

  list(): User[] {
    return Array.from(this.users.values(), (user) => ({ ...user }));
  }
  get(id: number): User {
    return { ...this.requireUser(id) };
  }
  create(input: UserInput): User {
    this.ensureUniqueEmail(input.email);
    const user: User = { id: this.nextId, ...input };
    this.nextId += 1;
    this.users.set(user.id, user);
    return { ...user };
  }
  replace(id: number, input: UserInput): User {
    this.requireUser(id);
    this.ensureUniqueEmail(input.email, id);
    const user: User = { id, ...input };
    this.users.set(id, user);
    return { ...user };
  }
  remove(id: number): void {
    this.requireUser(id);
    this.users.delete(id);
  }
  private requireUser(id: number): User {
    const user = this.users.get(id);
    if (user === undefined) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return user;
  }
  private ensureUniqueEmail(email: string, exceptId?: number): void {
    for (const user of this.users.values()) {
      if (user.email === email && user.id !== exceptId) {
        throw new HttpError(409, 'EMAIL_CONFLICT', 'A user with this email already exists');
      }
    }
  }
}
