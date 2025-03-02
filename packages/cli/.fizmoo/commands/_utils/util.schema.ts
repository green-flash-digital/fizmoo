import { z } from "zod";

const baseOptionsSchema = z.object({
  /**
   * The level of detail the logs should be displayed at
   * @default info
   */
  logLevel: z.union([z.literal("info"), z.literal("debug")]),
});
export type FizmooBaseOptions = z.infer<typeof baseOptionsSchema>;

// dev
export const devOptionsSchema = baseOptionsSchema;
export type FizmooDevOptions = z.infer<typeof devOptionsSchema>;

// build
export const buildOptionsSchema = baseOptionsSchema;
export type FizmooBuildOptions = z.infer<typeof buildOptionsSchema>;
