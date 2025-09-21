export type LogLevel = "debug" | "info" | "warn" | "error";

type LogMethod = (message: string, ...args: unknown[]) => void;

function formatMessage(level: LogLevel, message: string) {
  const ts = new Date().toISOString();
  return `[worker] [${ts}] [${level.toUpperCase()}] ${message}`;
}

function createLogger() {
  const write = (level: LogLevel, message: string, args: unknown[]) => {
    const formatted = formatMessage(level, message);
    switch (level) {
      case "debug":
        console.debug(formatted, ...args);
        break;
      case "info":
        console.info(formatted, ...args);
        break;
      case "warn":
        console.warn(formatted, ...args);
        break;
      case "error":
      default:
        console.error(formatted, ...args);
        break;
    }
  };

  const debug: LogMethod = (message, ...args) => write("debug", message, args);
  const info: LogMethod = (message, ...args) => write("info", message, args);
  const warn: LogMethod = (message, ...args) => write("warn", message, args);
  const error: LogMethod = (message, ...args) => write("error", message, args);

  return Object.freeze({ debug, info, warn, error });
}

export const logger = createLogger();
