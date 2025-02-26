import { tryHandle } from "ts-jolt/isomorphic";
import { createFizmoo } from "@fizmoo/core";
import { LOG } from "./util.logger.js";

async function buildSandboxCLIWithFizmoo() {
  LOG.info("Building the Sandbox CLI with Fizmoo...");
  const res = await tryHandle(createFizmoo)({ test: "random" });
  if (res.hasError) LOG.fatal(res.error);
  LOG.success("Building the Sandbox CLI with Fizmoo... done.");
}

buildSandboxCLIWithFizmoo();
