import { config } from "dotenv";

config();

console.error(
  "Commercial simulation worker entrypoint requires a queue adapter configuration. Run after wiring BullMQSimulationQueue.",
);
process.exitCode = 1;
