// ------- Meta -------
export type Meta = {
  name: string;
  description: string;
};
/**
 * A helper function that let's you easily define the
 * meta parameters of your Buttery Command file.
 *
 * **Note**: At this point,
 * it's not necessary to use this since we're not going to
 * use this constant to infer any types anywhere, but if you're
 * into consistency, this can be used in place of staticky typing
 * your `meta` export with `Meta`
 */
export const defineMeta = (meta: Meta) => meta;

// ------- Options -------
type OptionShared = {
  description: string;
  alias?: string;
  required?: boolean;
};
type OptionBoolean = OptionShared & {
  type: "boolean";
  default?: boolean;
};
type OptionString = OptionShared & {
  type: "string";
  default?: string;
  // TODO: Add validate back in
  // validate?: (value: string) => boolean;
};
type OptionNumber = OptionShared & {
  type: "number";
  default?: number;
  // TODO: Add validate back in
  // validate?: (value: number) => boolean;
};
export type Option = OptionBoolean | OptionString | OptionNumber;
export type Options = { [key: string]: Option };

type InferOptionValues<T extends Options> = {
  [K in keyof T]: T[K] extends OptionBoolean
    ? boolean
    : T[K] extends OptionNumber
    ? number
    : T[K] extends OptionString
    ? string
    : never;
};

/**
 * A helper function that let's you easily define options that should be
 * supplied to the action function in your Buttery Command. You should use
 * this function to create your options so TypeScript can easily infer
 * the types of the option values supplied to the actions parameter.
 *
 * **Note** It's okay if you don't use this to build your command options, but your
 * action won't be able to correctly infer the keys of your options and it may
 * make it a little harder to work with in your action.
 */
export const defineOptions = <T extends Options>(options: T) => options;

// ------- Args -------
type ArgShared = {
  name: string;
  description: string;
  required?: boolean;
};
type ArgBoolean = ArgShared & {
  type: "boolean";
  default?: boolean;
};
type ArgString = ArgShared & {
  type: "string";
  default?: string;
  length?: { min?: number; max?: number };
  choices?: string[];
  validate?: (value: string) => boolean;
};
type ArgNumber = ArgShared & {
  type: "number";
  default?: number;
  range?: { min?: number; max?: number };
  choices?: number[];
  validate?: (value: number) => boolean;
};
export type Arg = ArgBoolean | ArgString | ArgNumber;
export type Args = { [key: string]: Arg };

type InferArgValues<T extends Args> = {
  [K in keyof T]: T[K] extends ArgBoolean
    ? boolean
    : T[K] extends ArgNumber
    ? number
    : T[K] extends ArgString
    ? string
    : never;
};

/**
 * A helper function that let's you easily define args that should be
 * supplied to the action function in your Buttery Command. You should use
 * this function to create your args so TypeScript can easily infer
 * the types of the option values supplied to the actions parameter.
 *
 * **Note** It's okay if you don't use this to build your command args, but your
 * action won't be able to correctly infer the keys of your args and it may
 * make it a little harder to work with in your action.
 */
export const defineArgs = <T extends Args>(args: T) => args;

// ------- Action -------
export type Action<
  A extends Args = Args,
  O extends Options = Options
> = (params: {
  args: InferArgValues<A>;
  options: InferOptionValues<O>;
}) => Promise<void> | void;

// ------- Command -------
export type Command<A extends Args = Args, O extends Options = Options> = {
  meta: Meta;
  options?: Options;
  args?: Args;
  action?: Action<A, O>;
};

export type FizmooManifest = {
  [key: string]: FizmooManifestEntry;
};

export type FizmooManifestEntryData = {
  /**
   * The name of the command that will call
   */
  name: string;
  /**
   * Describes what the command does
   */
  description: string;
  /**
   * Options that can be passed to the command action
   */
  options: Options | undefined;
  /**
   * Positional args that can be passed to the command action
   */
  args: Args | undefined;
  /**
   * Does the command have an action export
   */
  hasAction: boolean;
  /**
   * A string literal representation of the help menu
   */
  help: string;
};

// ---- Start Types ----
export type FizmooManifestEntry = {
  /**
   * The path of the command module relative to the manifest. This
   * is done via a relative path due to the fact that when the manifest
   * builds, the root file system will be different than at runtime. So
   * when we run it at runtime, we're looking up commands relative to
   * the directory that we're building everything into. This way, the parent
   * file system doesn't matter and all of our functionality can be contained
   * into one directory.
   */
  file: string;

  src: string;
  /**
   * The IDs of the command parents
   */
  parents: string[] | null;
  /**
   * The ids of the immediate sub-commands
   */
  subCommands: string[] | null;
  data: FizmooManifestEntryData;
};
