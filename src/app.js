import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import router from "./routes/index.js";
import authRouter from "./routes/auth.js";
import errorhandler from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  legacyHeaders: false,
})

app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb'}));
app.use(express.urlencoded({ 
  limit: '10mb',
  extended: true 
}));

// Use router
app.use('/api', router);
// Backward-compatible auth routes for clients not yet using /api prefix.
app.use('/auth', authRouter);

// Error handling middleware
app.use(errorhandler);

export default app;