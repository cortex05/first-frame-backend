import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import router from "./routes/index.js";
import authRouter from "./routes/auth.js";
import errorhandler from "./middleware/errorHandler.js";

const app = express();

// CORS runs first so that every response carries the Access-Control-Allow-Origin
// header, including ones that short-circuit the middleware below it. A 429 from
// the limiter without that header is blocked by the browser before the client
// can read its status, surfacing as an opaque network error instead of the
// rate-limit message. Handling preflights here also keeps them off the limiter,
// so a cross-origin PATCH costs one request against the budget rather than two.
app.use(cors());

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Development runs through the same budget as real traffic, and a single
  // screen can spend several requests loading and saving.
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  // JSON so the client reads the reason off `data.message`, like every other
  // error this API returns.
  message: { message: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(limiter);

// Middleware
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