type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  debug(...args: unknown[]) {
    if (this.isDevelopment) {
      console.debug("[DEBUG]", ...args);
    }
  }

  info(...args: unknown[]) {
    if (this.isDevelopment) {
      console.info("[INFO]", ...args);
    }
  }

  warn(...args: unknown[]) {
    console.warn("[WARN]", ...args);
  }

  error(...args: unknown[]) {
    console.error("[ERROR]", ...args);
  }
}

export const logger = new Logger();

