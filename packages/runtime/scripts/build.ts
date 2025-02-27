import esbuild from "esbuild";
import { Isoscribe } from "isoscribe";
import { baseConfig } from "./_config.js";

export const LOG = new Isoscribe({
  name: "@fizmoo/runtime:build",
  logFormat: "string",
  logLevel: "debug",
});

/**
 * Build the runtime using esbuild. Normally, we would do this with the TypeScript CLI
 * but since we want to ensure that we make this as small as possible and be a standalone
 * executable package, we want to minify it and bundle all of the external dependencies which
 * there are none.
 */
async function build() {
  LOG.debug("Building the runtime...");
  try {
    await esbuild.build(baseConfig);
    LOG.debug("Building the runtime... done.");
    LOG.success("Successfully built the @fizmoo/runtime");
  } catch (error) {
    throw LOG.fatal(
      new Error(
        `There was an error when trying to build the @fizmoo/runtime: ${error}`
      )
    );
  }
}
build();
