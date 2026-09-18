declare module "openclaw/plugin-sdk/plugin-entry" {
  export type PluginHookHandler = (
    event: Record<string, unknown>,
    ctx: Record<string, unknown>,
  ) => unknown | Promise<unknown>;

  export type OpenClawPluginApi = {
    pluginConfig?: Record<string, unknown>;
    registerTool: (tool: unknown, opts?: unknown) => void;
    on: (
      hook: string,
      handler: PluginHookHandler,
      opts?: Record<string, unknown>,
    ) => void;
    session?: {
      workflow?: {
        enqueueNextTurnInjection?: (input: Record<string, unknown>) => unknown;
      };
      state?: {
        registerSessionExtension?: (input: Record<string, unknown>) => unknown;
      };
    };
    enqueueNextTurnInjection?: (input: Record<string, unknown>) => unknown;
  };

  export function definePluginEntry(options: {
    id: string;
    name: string;
    description: string;
    configSchema?: unknown;
    register: (api: OpenClawPluginApi) => void;
  }): unknown;
}
