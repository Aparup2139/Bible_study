import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AskResponse } from '@bibleway/shared-types';
import type { Env } from '../config/env';
import {
  BIBLE_SYSTEM_PROMPT,
  GUARDRAIL_RETRY_INSTRUCTION,
  extractReferences,
  stripThinking,
} from './prompt';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/**
 * Calls NVIDIA's OpenAI-compatible Qwen endpoint to answer questions strictly
 * through the teaching of the Bible.
 *
 * Guardrail: every answer must quote scripture. The system prompt enforces this;
 * if the model still returns no verse reference, we re-ask once with an explicit
 * correction before giving up. The endpoint degrades cleanly (503) when no key
 * is configured — same philosophy as the Supabase/Redis services.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async ask(question: string): Promise<AskResponse> {
    let answer = await this.complete([
      { role: 'system', content: BIBLE_SYSTEM_PROMPT },
      { role: 'user', content: question },
    ]);

    // Guardrail: enforce "quote a Bible verse" with a single corrective retry.
    if (extractReferences(answer).length === 0) {
      this.logger.warn('Answer had no scripture reference — retrying with correction.');
      answer = await this.complete([
        { role: 'system', content: BIBLE_SYSTEM_PROMPT },
        { role: 'user', content: question },
        { role: 'assistant', content: answer },
        { role: 'user', content: GUARDRAIL_RETRY_INSTRUCTION },
      ]);
    }

    return { answer, references: extractReferences(answer) };
  }

  private async complete(messages: ChatMessage[]): Promise<string> {
    const apiKey = this.config.get('NVIDIA_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'The AI assistant is not configured. Set NVIDIA_API_KEY in the backend .env.',
      );
    }
    const baseUrl = this.config.get('NVIDIA_BASE_URL', { infer: true });
    const model = this.config.get('NVIDIA_MODEL', { infer: true });

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.6,
          top_p: 0.95,
          // Cap on answer length; raise toward the model's 16384 max for longer replies.
          max_tokens: 2048,
          stream: false,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`NVIDIA API ${res.status}: ${detail.slice(0, 500)}`);
        throw new BadGatewayException('The AI provider returned an error.');
      }

      const json = (await res.json()) as ChatCompletion;
      const content = stripThinking(json.choices?.[0]?.message?.content ?? '');
      if (!content) {
        throw new BadGatewayException('The AI provider returned an empty response.');
      }
      return content;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`NVIDIA request failed: ${(err as Error).message}`);
      throw new BadGatewayException('Could not reach the AI provider.');
    }
  }
}
