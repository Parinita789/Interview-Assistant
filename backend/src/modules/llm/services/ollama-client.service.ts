import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_ENV, OLLAMA_REQUEST_TIMEOUT_MS } from '../constants';
import { OllamaChatMessage, OllamaChatResponse } from '../types/ollama.types';

@Injectable()
export class OllamaClientService {
  private readonly logger = new Logger(OllamaClientService.name);

  constructor(private readonly config: ConfigService) {}

  async chat(
    params: {
      model: string;
      messages: OllamaChatMessage[];
      options?: Record<string, unknown>;
    },
    requestOptions?: { signal?: AbortSignal },
  ): Promise<OllamaChatResponse> {
    const baseUrl = this.config.get<string>(LLM_ENV.OLLAMA_BASE_URL);
    if (!baseUrl) throw new Error(`${LLM_ENV.OLLAMA_BASE_URL} is not set`);

    const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
    this.logger.log(`POST ${url} (model=${params.model}, msgs=${params.messages.length})`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OLLAMA_REQUEST_TIMEOUT_MS);
    const outerSignal = requestOptions?.signal;
    // Fold the outer (LlmService) signal into the local controller so
    // both the internal Ollama-host timeout and the outer per-attempt
    // timeout can release the in-flight fetch. AbortSignal.any would
    // be cleaner but isn't available across all Node versions we run.
    const onOuterAbort = () => ctrl.abort();
    if (outerSignal) {
      if (outerSignal.aborted) ctrl.abort();
      else outerSignal.addEventListener('abort', onOuterAbort, { once: true });
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, stream: false }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama API error ${res.status}: ${errText.slice(0, 500)}`);
      }
      return (await res.json()) as OllamaChatResponse;
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        // Outer abort wins the message — it's the load-bearing cause
        // and the inner host-timeout label would be misleading.
        if (outerSignal?.aborted) {
          throw new Error(`Ollama request aborted by outer timeout (${url})`);
        }
        throw new Error(
          `Ollama request timed out after ${OLLAMA_REQUEST_TIMEOUT_MS}ms (${url})`,
        );
      }
      const msg = (err as Error).message ?? String(err);
      throw new Error(`Ollama request to ${url} failed: ${msg}`);
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
    }
  }
}
