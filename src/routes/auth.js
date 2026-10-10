import express from "express";
import { changePassword, login, register } from "../controllers/authController.js";
import authenticate from "../middleware/authHandler.js";
import { credentialLimiter, registerLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/login", credentialLimiter, login);
router.post("/register", registerLimiter, register);
// Reachable while mustChangePassword is set -- every other route is not.
router.post(
  "/change-password",
  credentialLimiter,
  authenticate.allowPendingPasswordChange,
  changePassword
);

export default router;
