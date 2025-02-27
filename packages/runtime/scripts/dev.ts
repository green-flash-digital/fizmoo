import esbuild, { Plugin } from "esbuild";
import { Isoscribe } from "isoscribe";
import { baseConfig } from "./_config.js";

export const LOG = new Isoscribe({
  name: "@fizmoo/runtime:dev",
  logFormat: "string",
  logLevel: "debug",
});

function WatchLoggerPlugin(message: string = "Rebuilding..."): Plugin {
  let isWatching = false; // Track if watch mode is active

  return {
    name: "watch-logger",
    setup(build) {
      build.onEnd((result) => {
        if (!isWatching && result.errors.length === 0) {
          isWatching = true; // Set to true after first successful build
          LOG.watch("Listening for changes");
          return;
        }

        if (isWatching) {
          LOG.debug(`${message}`);
        }
      });
    },
  };
}

async function dev() {
  LOG.debug("Starting the development server...");
  try {
    const context = await esbuild.context({
      ...baseConfig,
      plugins: [WatchLoggerPlugin()],
    });
    await context.watch();
  } catch (error) {
    throw LOG.fatal(
      new Error(
        `There was an error when trying to build the @fizmoo/runtime: ${error}`
      )
    );
  }
}
dev();
