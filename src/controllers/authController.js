import {
  register as registerUser,
  login as loginUser,
} from "../services/userService.js";

export const register = async (req, res, next) => {
  // isAdmin is deliberately not read from the body -- see userService.register.
  const { username, email, password } = req.body;
  const user = await registerUser(username, email, password);

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: user,
  })
}

export const login = async (req, res, next) => {
  const { email, password } = req.body;
  const { token, userId, username, isAdmin } = await loginUser(email, password);

  res.status(200).json({
    success: true,
    message: "User logged in successfully",
    data: {
      token,
      userId,
      username,
      isAdmin
    }
  })
}