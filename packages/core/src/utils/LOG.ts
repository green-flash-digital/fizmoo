import { Isoscribe } from "isoscribe";

export const LOG = new Isoscribe({
  name: "@fizmoo/core",
  logFormat: "string",
  logLevel: "debug",
});
