export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
}

export class Logger {
  private component: string;
  private static isStructured = process.env.STRUCTURED_LOGGING === 'true';

  constructor(component: string) {
    this.component = component;
  }

  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  public error(message: string, error?: any, data?: any): void {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, ...data }
      : { error, ...data };
    this.log(LogLevel.ERROR, message, errorData);
  }

  private log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      data: Object.keys(data || {}).length > 0 ? data : undefined
    };

    if (Logger.isStructured) {
      const logString = JSON.stringify(entry);
      if (level === LogLevel.ERROR) {
        console.error(logString);
      } else if (level === LogLevel.WARN) {
        console.warn(logString);
      } else {
        console.log(logString);
      }
    } else {
      const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
      const formatted = `[${entry.timestamp}] [${entry.level}] [${entry.component}] ${entry.message}${dataStr}`;
      
      if (level === LogLevel.ERROR) {
        console.error(formatted);
      } else if (level === LogLevel.WARN) {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }
}
