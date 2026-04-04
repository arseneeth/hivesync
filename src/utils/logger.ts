import winston from 'winston';
import chalk from 'chalk';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  const color = logColors[level as keyof typeof logColors] || 'white';
  const levelText = level.toUpperCase().padEnd(5);
  return `${chalk.gray(timestamp)} ${chalk[color](levelText)} ${message}`;
});

export const logger = winston.createLogger({
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    consoleFormat
  ),
  transports: [
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
    }),
    new winston.transports.File({
      filename: 'logs/hivesync.log',
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// Helper methods for common log types
export const log = {
  info: (message: string, ...meta: any[]) => logger.info(message, ...meta),
  error: (message: string, ...meta: any[]) => logger.error(message, ...meta),
  warn: (message: string, ...meta: any[]) => logger.warn(message, ...meta),
  debug: (message: string, ...meta: any[]) => logger.debug(message, ...meta),
  success: (message: string, ...meta: any[]) => {
    console.log(chalk.green(`✓ ${message}`));
  },
};
