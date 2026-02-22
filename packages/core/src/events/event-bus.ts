export type EventMap = {
  'tool-start': { toolName: string; args: Record<string, unknown> };
  'tool-finish': { toolName: string; result: string; durationMs: number };
  'step-finish': { stepNumber: number; text: string; finishReason: string };
  'message': { role: string; content: string; contextId: string };
  'error': { message: string; stack?: string };
  'subagent-start': { taskId: string; label: string; task: string };
  'subagent-finish': { taskId: string; label: string; result: string };
};

type Listener<T> = (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      listener(data);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
