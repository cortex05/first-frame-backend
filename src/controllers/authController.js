import {
  register as registerUser,
  login as loginUser,
  changePassword as changeUserPassword,
} from "../services/userService.js";

export const register = async (req, res, next) => {
  // Only these fields are read: isAdmin, role and account in the body are
  // ignored -- see userService.register. termsVersion is the version of the
  // Terms of Service the registrant accepted.
  const { accountName, username, email, password, termsVersion } = req.body;
  const session = await registerUser({ accountName, username, email, password, termsVersion });

  res.status(201).json({
    success: true,
    message: "Account created successfully",
    data: session,
  })
}

export const login = async (req, res, next) => {
  const { email, password } = req.body;
  const session = await loginUser(email, password);

  res.status(200).json({
    success: true,
    message: "User logged in successfully",
    data: session,
  })
}

export const changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const session = await changeUserPassword(req.auth, { currentPassword, newPassword });

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
    data: session,
  })
}
