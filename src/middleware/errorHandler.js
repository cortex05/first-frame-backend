const errorHandler = (err, req, res, next) => {
  const statusCode = 
    err.statusCode && Number.isInteger(err.statusCode) 
      ? err.statusCode 
      : 500;
  res.status(statusCode).json({
    status: "error",
    message: err.message || "Internal Server Error",
    ...err(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
};

export default errorHandler;