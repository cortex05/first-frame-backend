import express from "express";
import { changePassword, login, register } from "../controllers/authController.js";
import authenticate from "../middleware/authHandler.js";

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
// Reachable while mustChangePassword is set -- every other route is not.
router.post("/change-password", authenticate.allowPendingPasswordChange, changePassword);

export default router;
