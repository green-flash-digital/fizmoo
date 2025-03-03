import { createFizmoo } from "@fizmoo/core";
import { LOG } from "./util.logger.js";

async function buildSandboxCLIWithFizmoo() {
  try {
    LOG.info("Building the Sandbox CLI with Fizmoo...");
    const fizmoo = await createFizmoo({
      logLevel: "trace",
      env: "development",
    });
    await fizmoo.build();
    LOG.success("Building the Sandbox CLI with Fizmoo... done.");
  } catch (error) {
    LOG.fatal(new Error(String(error)));
  }
}

buildSandboxCLIWithFizmoo();
