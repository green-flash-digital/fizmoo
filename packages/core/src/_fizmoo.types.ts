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
 * into consistency, this can be used in place of staticly typing
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
