import express from "express";
import { accept, getCurrent } from "../controllers/agreementController.js";
import authenticate from "../middleware/authHandler.js";

const router = express.Router();

router.get("/current", getCurrent);
// Reachable while the account's terms are pending -- every other route is not.
router.post("/accept", authenticate.allowPendingTerms, accept);

export default router;
