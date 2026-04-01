// Structured JSON logger for Lambda handlers.
//
// Emits one JSON object per call to stdout, which CloudWatch Logs captures.
// Using JSON (rather than plain strings) makes CloudWatch Logs Insights
// queries practical — e.g. `filter connectionId = "abc"` or
// `stats count() by level`.
//
// Usage:
//   const logger = createLogger({ connectionId });
//   logger.info('create-game', { code });
//   logger.warn('session not found', { code });
//   logger.error('DynamoDB write failed', err, { pk });

export function createLogger(context?: Record<string, unknown>) {
  const base = context ?? {};

  function emit(
    level: 'info' | 'warn' | 'error',
    message: string,
    extra?: Record<string, unknown>,
  ) {
    console.log(
      JSON.stringify({
        level,
        message,
        timestamp: new Date().toISOString(),
        ...base,
        ...extra,
      }),
    );
  }

  return {
    info: (msg: string, meta?: Record<string, unknown>) =>
      emit('info', msg, meta),

    warn: (msg: string, meta?: Record<string, unknown>) =>
      emit('warn', msg, meta),

    error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => {
      const errFields =
        err instanceof Error
          ? { errorMessage: err.message, errorName: err.name }
          : { errorRaw: String(err) };
      emit('error', msg, { ...errFields, ...meta });
    },
  };
}
