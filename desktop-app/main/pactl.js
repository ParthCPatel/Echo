const { execSync } = require("child_process");

function run(cmd) {
  try {
    // stdio: 'pipe' allows us to capture output if needed, but here we just want to ensure it runs
    // We will catch errors below.
    execSync(cmd, { stdio: "pipe" });
  } catch (e) {
    console.error(`Command failed: ${cmd}`);
    console.error(e.stderr?.toString());
  }
}

function output(cmd) {
  try {
    return execSync(cmd).toString();
  } catch {
    return "";
  }
}

module.exports = { run, output };
