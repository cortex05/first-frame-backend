import {
  register as registerUser,
  login as loginUser,
} from "../services/userService.js";

export const register = async (req, res, next) => {
  const { name, email, password, isAdmin } = req.body;
  const user = await registerUser(name, email, password, isAdmin);

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: user,
  })
}

export const login = async (req, res, next) => {
  const { email, password } = req.body;
  const { token, userId, name } = await loginUser(email, password);

  res.status(200).json({
    success: true,
    message: "User logged in successfully",
    data: {
      token,
      userId,
      name
    }
  })
}