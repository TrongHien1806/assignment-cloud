'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(level) {
  const threshold = LEVELS[level];

  const write = (name) => (message, fields = {}) => {
    if (LEVELS[name] < threshold) {
      return;
    }
    const line = JSON.stringify({ time: new Date().toISOString(), level: name, message, ...fields });
    const stream = LEVELS[name] >= LEVELS.warn ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  };

  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

module.exports = { createLogger };
