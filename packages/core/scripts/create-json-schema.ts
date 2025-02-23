import path from "node:path";

import { zodToJsonSchema } from "zod-to-json-schema";
import { fizmooConfigSchema } from "../src/schema/schema.js";
import { tryHandle } from "ts-jolt/isomorphic";
import { writeFileRecursive } from "ts-jolt/node";

// const LOG = new ButteryLogger({
//   id: "buttery-tokens-utils",
//   prefix: "buttery:tokens-utils",
//   prefixBgColor: "#ccc",
// });

async function createJsonSchema() {
  // LOG.debug("Converting the Config schema into a JSON schema");
  const jsonSchema = zodToJsonSchema(fizmooConfigSchema, {
    name: "buttery-tokens",
    nameStrategy: "ref",
    target: "jsonSchema7",
  });
  // LOG.debug("Converting the Config schema into a JSON schema... done.");

  // LOG.debug("Writing to file");
  const res = await tryHandle(writeFileRecursive)(
    path.resolve(import.meta.dirname, "../dist/schema.json"),
    JSON.stringify(jsonSchema, null, 2)
  );
  if (res.hasError) {
    throw res.error;
  }
  // LOG.success(
  //   "Successfully created the JSON schema from the buttery Zod schemas"
  // );
}

createJsonSchema();
