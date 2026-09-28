export const DEFAULT_TIME_ZONE = 'UTC';

/**
 * The timezone is reported by the browser and kept for record keeping only, so
 * a bad value must never fail the request: anything that isn't a zone Intl
 * recognizes becomes 'UTC'.
 */
export const normalizeTimeZone = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_TIME_ZONE;
  }

  const timeZone = value.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};
