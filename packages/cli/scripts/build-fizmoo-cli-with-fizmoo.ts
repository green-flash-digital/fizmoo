import { LOG } from "../.fizmoo/commands/_utils/index.js";
import { createFizmoo } from "@fizmoo/core";

async function buildFizmooCLIWithFizmoo() {
  try {
    LOG.info("Building the Fizmoo CLI with Fizmoo...");
    const fizmoo = await createFizmoo({ logLevel: "trace" });
    await fizmoo.build();
    LOG.success("Building the Fizmoo CLI with Fizmoo... done.");
  } catch (error) {
    LOG.fatal(new Error(String(error)));
  }
}

buildFizmooCLIWithFizmoo();
