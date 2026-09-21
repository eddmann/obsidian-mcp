export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

interface LoggerConfig {
  stream: NodeJS.WriteStream;
  minLevel?: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Redact credentials in messages as well as nested Git command arguments. */
export function redactSensitiveText(value: string): string {
  let result = value.replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@');
  for (const key of ['GIT_TOKEN', 'OAUTH_CLIENT_SECRET', 'PERSONAL_AUTH_TOKEN']) {
    const secret = process.env[key];
    if (secret) {
      result = result.split(secret).join('[REDACTED]');
      result = result.split(encodeURIComponent(secret)).join('[REDACTED]');
    }
  }
  return result;
}

function redactLogValue(key: string, value: unknown): unknown {
  if (/token|secret|password|authorization|cookie/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactSensitiveText(value);
  if (value instanceof Error) {
    return { ...value, name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

class Logger {
  private minLevel: number;
  private stream: NodeJS.WriteStream;

  constructor(config: LoggerConfig) {
    this.minLevel = LOG_LEVELS[config.minLevel || 'info'];
    this.stream = config.stream;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    this.stream.write(JSON.stringify(entry, redactLogValue) + '\n');
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }
}

// Global logger instance
let loggerInstance: Logger | null = null;

export function configureLogger(config: LoggerConfig): void {
  loggerInstance = new Logger(config);
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    throw new Error('Logger not configured. Call configureLogger() during startup.');
  }
  return loggerInstance;
}

// Convenience export
export const logger = {
  get debug() {
    return getLogger().debug.bind(getLogger());
  },
  get info() {
    return getLogger().info.bind(getLogger());
  },
  get warn() {
    return getLogger().warn.bind(getLogger());
  },
  get error() {
    return getLogger().error.bind(getLogger());
  },
};
