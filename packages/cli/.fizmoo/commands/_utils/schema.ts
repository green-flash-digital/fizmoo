import { z } from "zod";

const baseOptionsSchema = z.object({
  /**
   * The level of detail the logs should be displayed at
   * @default info
   */
  logLevel: z.union([z.literal("info"), z.literal("debug")]),
  /**
   * If the required folder structures don't exist, display
   * prompts to create them / re-align them instead of
   * throwing errors
   * @default true
   */
  prompt: z.boolean().default(true),
  /**
   * If a file in a directory in the commands structure doesn't exist
   * or if a file is malformed, setting this value to true will attempt
   * to automatically fix it by creating it or adjusting the values.
   */
  autoFix: z.boolean().default(false),
});
export type FizmooBaseOptions = z.infer<typeof baseOptionsSchema>;

// dev
export const devOptionsSchema = baseOptionsSchema;
export type FizmooDevOptions = z.infer<typeof devOptionsSchema>;

// build
export const buildOptionsSchema = baseOptionsSchema;
export type FizmooBuildOptions = z.infer<typeof buildOptionsSchema>;
