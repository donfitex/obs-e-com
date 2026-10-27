import type { ApiHandler } from '../http/types.js';
import type { UserService } from './user.service.js';
import { validateUserId, validateUserInput } from './user.validation.js';

export class UserController {
  constructor(private readonly users: UserService) {}

  readonly list: ApiHandler = (_request, response) => {
    response.json(this.users.list());
  };
  readonly get: ApiHandler = (request, response) => {
    response.json(this.users.get(validateUserId(request.params['id'])));
  };
  readonly create: ApiHandler = (request, response) => {
    const user = this.users.create(validateUserInput(request.body));
    response.location(`/api/users/${user.id}`).status(201).json(user);
  };
  readonly replace: ApiHandler = (request, response) => {
    const id = validateUserId(request.params['id']);
    response.json(this.users.replace(id, validateUserInput(request.body)));
  };
  readonly remove: ApiHandler = (request, response) => {
    this.users.remove(validateUserId(request.params['id']));
    response.status(204).end();
  };
}
