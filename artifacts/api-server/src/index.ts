import app from "./app";
import { logger } from "./lib/logger";
import { startAutopilotDaemon } from "./lib/autopilot";

const rawPort = process.env["PORT"] || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening on port " + port);
  startAutopilotDaemon();
});
