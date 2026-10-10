import mongoose from "mongoose";

// A schema validator or cast rejected what the client sent (e.g. a question
// over the size limits in src/types.js): that is a bad request, not a crash.
const isClientDataError = (err) =>
  err instanceof mongoose.Error.ValidationError ||
  err instanceof mongoose.Error.CastError;

// One readable line per failing path instead of Mongoose's combined message.
const clientDataMessage = (err) =>
  err instanceof mongoose.Error.ValidationError
    ? Object.values(err.errors).map((error) => error.message).join("; ")
    : `Invalid value for ${err.path}`;

const errorHandler = (err, req, res, next) => {
  const statusCode =
    err.statusCode && Number.isInteger(err.statusCode)
      ? err.statusCode
      : isClientDataError(err)
        ? 400
        : 500;
  res.status(statusCode).json({
    status: "error",
    message: isClientDataError(err)
      ? clientDataMessage(err)
      : err.message || "Internal Server Error",
    // Only string codes set by createAppError. Driver errors carry numeric codes
    // (e.g. 11000) that describe the database, not the API.
    ...(typeof err.code === "string" ? { code: err.code } : {}),
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
};

export default errorHandler;
