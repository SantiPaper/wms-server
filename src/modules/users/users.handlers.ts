import { Request, Response } from 'express';
import * as usersService from '@/modules/users/users.service';
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from '@/modules/users/users.schemas';
import { IdParam } from '@/lib/common.schemas';

export async function createUserHandler(req: Request, res: Response) {
  const user = await usersService.createUser(req.body as CreateUserInput);
  res.status(201).json(user);
}

export async function listUsersHandler(req: Request, res: Response) {
  const result = await usersService.listUsers(req.query as unknown as ListUsersQuery);
  res.json(result);
}

export async function getUserHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const user = await usersService.getUserById(id);
  res.json(user);
}

export async function updateUserHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as IdParam;
  const user = await usersService.updateUser(id, req.body as UpdateUserInput, req.user!.id);
  res.json(user);
}
