import { config } from "dotenv";

import { createCommercialServicesFromEnv } from "./src/server/commercial/commercial-services.js";

config();

const commercialServices = createCommercialServicesFromEnv(process.env);

if (!commercialServices.enabled) {
  console.error(
    "Commercial simulation worker requires COMMERCIAL_MODE_ENABLED=true and commercial backing services.",
  );
  process.exitCode = 1;
  process.exit();
}

console.error(
  "Commercial simulation worker entrypoint requires a BullMQ worker processor. Service factory wiring is available; processor wiring is still pending.",
);
process.exitCode = 1;
