import {
  createAccountUser,
  getAccount as getAccountService,
  listAccountUsers,
  renameAccount,
  updateAccountUser,
} from '../services/accountService.js';

export const getAccount = async (req, res) => {
  const account = await getAccountService(req.auth);
  res.status(200).json({ account });
};

export const updateAccount = async (req, res) => {
  const account = await renameAccount(req.auth, req.body?.name);
  res.status(200).json({ account });
};

export const listUsers = async (req, res) => {
  const users = await listAccountUsers(req.auth);
  res.status(200).json({ users });
};

export const createUser = async (req, res) => {
  const { username, email, password, role } = req.body ?? {};
  const user = await createAccountUser(req.auth, { username, email, password, role });
  res.status(201).json({ user });
};

export const updateUser = async (req, res) => {
  const { role, status } = req.body ?? {};
  const user = await updateAccountUser(req.auth, req.params.userId, { role, status });
  res.status(200).json({ user });
};
