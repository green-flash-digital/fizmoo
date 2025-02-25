import { tryHandle } from "ts-jolt/isomorphic";
import { build } from "../src/scripts/script.build.js";
import { LOG } from "../src/utils/index.js";

async function buildFizmooCLIWithFizmoo() {
  LOG.info("Building the Fizmoo CLI with Fizmoo...");
  const res = await tryHandle(build)({
    autoFix: true,
    logLevel: "info",
    prompt: true,
  });
  if (res.hasError) LOG.fatal(res.error);
  LOG.success("Building the Fizmoo CLI with Fizmoo... done.");
}

buildFizmooCLIWithFizmoo();
