/**
 * `code` is an optional machine-readable string (e.g. 'PASSWORD_CHANGE_REQUIRED')
 * that the client can branch on without parsing the message.
 */
export function createAppError(message, statusCode = 500, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
}

// MongoDB duplicate-key error (unique index violation).
export const isDuplicateKeyError = (error) => error?.code === 11000;
