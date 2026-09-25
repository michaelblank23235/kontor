const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Startup stages only: never log IPC arguments, passphrases or database contents.
function createStartupLog(file = path.join(os.tmpdir(), "Kontor-Start.log")) {
  function record(stage, details = {}) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > 256 * 1024) {
        fs.renameSync(file, file + ".previous");
      }
      fs.appendFileSync(
        file,
        JSON.stringify({ time: new Date().toISOString(), stage, ...details }) +
          "\n",
        { mode: 0o600 },
      );
    } catch {
      // Failure to create diagnostics must not prevent the application from opening.
    }
  }
  return { file, record };
}

function optionalStartup(name, work, log) {
  try {
    work();
    log.record(name + ".ready");
    return true;
  } catch (error) {
    log.record(name + ".failed", { message: error.message });
    return false;
  }
}

module.exports = { createStartupLog, optionalStartup };
