import { build } from "@fizmoo/core";
import { tryHandle } from "ts-jolt/isomorphic";

async function buildFizmooWithFizmoo() {
  console.log("Building the Fizmoo CLI...");
  const res = await tryHandle(build)();
  if (res.hasError) {
    return console.error(res.error);
  }

  console.log("Building the Fizmoo CLI... complete.");
}

buildFizmooWithFizmoo();
