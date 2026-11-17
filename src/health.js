'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createHealth({ demoMode, flagDir = '/tmp' }) {
  const unreadyFlag = path.join(flagDir, 'shipquote-unready');
  const unhealthyFlag = path.join(flagDir, 'shipquote-unhealthy');
  let ready = false;

  const flagged = (file) => demoMode && fs.existsSync(file);

  return {
    clearFlags() {
      fs.rmSync(unreadyFlag, { force: true });
      fs.rmSync(unhealthyFlag, { force: true });
    },
    markReady() {
      ready = true;
    },
    markNotReady() {
      ready = false;
    },
    isLive() {
      return !flagged(unhealthyFlag);
    },
    isReady() {
      return ready && !flagged(unhealthyFlag) && !flagged(unreadyFlag);
    },
  };
}

module.exports = { createHealth };
