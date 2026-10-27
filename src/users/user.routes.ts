import { Router } from 'express';
import { UserController } from './user.controller.js';
import type { UserService } from './user.service.js';

export function createUserRouter(users: UserService): Router {
  const router = Router();
  const controller = new UserController(users);
  router.route('/').get(controller.list).post(controller.create);
  router.route('/:id').get(controller.get).put(controller.replace).delete(controller.remove);
  return router;
}
