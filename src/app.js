import express from "express";
import cors from "cors";
import helmet from "helmet";

import router from "./routes/index.js";
import authRouter from "./routes/auth.js";
import errorhandler from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiters.js";

const app = express();

// CORS runs first so that every response carries the Access-Control-Allow-Origin
// header, including ones that short-circuit the middleware below it. A 429 from
// the limiter without that header is blocked by the browser before the client
// can read its status, surfacing as an opaque network error instead of the
// rate-limit message. Handling preflights here also keeps them off the limiter,
// so a cross-origin PATCH costs one request against the budget rather than two.
app.use(cors());

app.use(helmet());

// Render (and any host behind a load balancer) puts the client's address in
// X-Forwarded-For. Without this, req.ip is the proxy's, and every user would
// share one rate-limit budget. TRUST_PROXY_HOPS is the number of proxies in
// front of the app.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// Signed-in users are limited per user; login and registration have their own
// stricter limiters in routes/auth.js.
app.use(apiLimiter);

// The largest legitimate body is a whole case at the limits in src/types.js
// (about 1.7 MB with typical labels); 4 MB leaves headroom. Anything bigger is
// refused with 413 before it reaches a service. The API takes no form posts,
// so urlencoded keeps its 100 KB default.
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

// Use router
app.use('/api', router);
// Backward-compatible auth routes for clients not yet using /api prefix.
app.use('/auth', authRouter);

// Error handling middleware
app.use(errorhandler);

export default app;