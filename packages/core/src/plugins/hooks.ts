/**
 * PEZHWAN — Plugin hooks.
 *
 * Typed hook registry used by the plugin manager. Plugins register under a
 * named hook; the runtime invokes them in registration order (async-capable).
 */

export interface HookContext {
  event: string;
  payload: Record<string, unknown>;
}

export type HookHandler = (context: HookContext) => void | Promise<void>;

export class Hooks {
  private readonly handlers = new Map<string, HookHandler[]>();

  register(name: string, handler: HookHandler): () => void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
    return () => {
      const current = this.handlers.get(name) ?? [];
      this.handlers.set(
        name,
        current.filter((entry) => entry !== handler),
      );
    };
  }

  has(name: string): boolean {
    return (this.handlers.get(name)?.length ?? 0) > 0;
  }

  /** Returns true when every handler completed without throwing. */
  async run(name: string, context: HookContext): Promise<boolean> {
    const list = this.handlers.get(name) ?? [];
    for (const handler of list) {
      try {
        await handler(context);
      } catch {
        return false;
      }
    }
    return true;
  }
}