import { build } from "@fizmoo/core";
import { tryHandle } from "ts-jolt/isomorphic";
import { LOG } from "../utils/util.log";

async function buildFizmooWithFizmoo() {
  LOG.info("Building the Fizmoo CLI...");
  const res = await tryHandle(build)();
  if (res.hasError) {
    return console.error(res.error);
  }

  LOG.success("Building the Fizmoo CLI... complete.");
}

buildFizmooWithFizmoo();
