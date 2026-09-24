const errorHandler = (err, req, res, next) => {
  const statusCode =
    err.statusCode && Number.isInteger(err.statusCode)
      ? err.statusCode
      : 500;
  res.status(statusCode).json({
    status: "error",
    message: err.message || "Internal Server Error",
    // Only string codes set by createAppError. Driver errors carry numeric codes
    // (e.g. 11000) that describe the database, not the API.
    ...(typeof err.code === "string" ? { code: err.code } : {}),
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
};

export default errorHandler;
