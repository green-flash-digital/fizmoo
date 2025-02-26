import { tryHandle } from "ts-jolt/isomorphic";
import { LOG } from "../.fizmoo/commands/_utils/index.js";
import { createFizmoo } from "@fizmoo/core";

async function buildFizmooCLIWithFizmoo() {
  LOG.info("Building the Fizmoo CLI with Fizmoo...");
  const res = await tryHandle(createFizmoo)({
    test: "test param",
  });
  if (res.hasError) LOG.fatal(res.error);
  LOG.success("Building the Fizmoo CLI with Fizmoo... done.");
}

buildFizmooCLIWithFizmoo();
