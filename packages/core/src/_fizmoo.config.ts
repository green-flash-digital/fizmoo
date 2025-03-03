import { z } from "zod";

export const fizmooConfigSchema = z.object({
  $schema: z
    .string()
    .optional()
    .default("https://schemas.greenflash.digital/fizmoo.json"),
  /**
   * The name of the CLI. This is also the name of
   * the execution string that will instantiate the
   * binary
   */
  name: z.string(),
  /**
   * The description of the CLI
   */
  description: z.string(),
  /**
   * The version of the CLI
   */
  version: z.string().optional().default("0.0.1"),
  /**
   * The location of the commands directory. By default
   * it will be inside of the commands folder, however if it's outside
   * of the Fizmoo dotdir, then this option should be relative
   * to the ./fizmoo directory.
   * @default ./commands
   * @example <root>/.fizmoo/commands
   */
  commandsDir: z.preprocess(
    (value) => value || "/commands",
    z.string().optional()
  ),
});

export type FizmooConfig = z.infer<typeof fizmooConfigSchema>;
