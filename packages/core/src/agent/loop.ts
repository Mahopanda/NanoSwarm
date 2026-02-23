import { generateText, stepCountIs } from 'ai';
import type { ToolContext } from '../tools/base.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { ContextBuilder } from '../context/context-builder.ts';
import type { EventBus } from '../events/event-bus.ts';
import type { AgentLoopConfig, AgentLoopResult } from './types.ts';

export class AgentLoop {
  constructor(
    private config: AgentLoopConfig,
    private contextBuilder: ContextBuilder,
    private registry: ToolRegistry,
    private eventBus: EventBus,
  ) {}

  async run(
    contextId: string,
    userMessage: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
    opts?: { channel?: string; chatId?: string; abortSignal?: AbortSignal },
  ): Promise<AgentLoopResult> {
    // 1. Build system prompt + messages
    const { system, messages } = await this.contextBuilder.buildMessages(
      contextId,
      userMessage,
      history,
    );

    // 2. Build ToolContext
    const toolContext: ToolContext = {
      workspace: this.contextBuilder.workspacePath,
      contextId,
      channel: opts?.channel,
      chatId: opts?.chatId,
    };

    // 3. Get AI SDK tools
    const tools = this.registry.getAITools(toolContext);

    try {
      // 4. Run generateText (AI SDK handles the tool loop)
      const result = await generateText({
        model: this.config.model,
        system,
        messages,
        tools,
        stopWhen: stepCountIs(this.config.maxIterations ?? 15),
        temperature: this.config.temperature ?? 0.7,
        maxOutputTokens: this.config.maxTokens ?? 4096,
        abortSignal: opts?.abortSignal,
        onStepFinish: (step) => {
          this.eventBus.emit('step-finish', {
            stepNumber: step.stepNumber,
            text: step.text,
            finishReason: step.finishReason,
          });
        },
        experimental_onToolCallStart: ({ toolCall }) => {
          this.eventBus.emit('tool-start', {
            toolName: toolCall.toolName,
            args: toolCall.input as Record<string, unknown>,
          });
        },
        experimental_onToolCallFinish: ({ toolCall, durationMs, success, output }) => {
          this.eventBus.emit('tool-finish', {
            toolName: toolCall.toolName,
            result: success ? String(output) : 'error',
            durationMs,
          });
        },
      });

      // 5. Assemble result
      return {
        text: result.text,
        toolCalls: result.steps.flatMap((s) =>
          s.toolCalls.map((tc) => ({
            toolName: tc.toolName,
            args: tc.input as Record<string, unknown>,
          })),
        ),
        steps: result.steps.length,
        usage: {
          promptTokens: result.totalUsage.inputTokens ?? 0,
          completionTokens: result.totalUsage.outputTokens ?? 0,
          totalTokens: (result.totalUsage.inputTokens ?? 0) + (result.totalUsage.outputTokens ?? 0),
        },
        finishReason: result.finishReason,
      };
    } catch (err) {
      console.error('[AgentLoop] Error during generation:', err);
      return {
        text: 'An error occurred while processing your request. Please try again.',
        toolCalls: [],
        steps: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'error',
      };
    }
  }
}
