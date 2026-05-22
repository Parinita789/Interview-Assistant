import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_ENV } from '../constants';
import { LlmProvider } from './llm-provider.interface';
import { AnthropicProvider } from './anthropic.provider';
import { OllamaProvider } from './ollama.provider';
import { ClaudeCliProvider } from './claude-cli.provider';

@Injectable()
export class LlmProviderFactory {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly ollama: OllamaProvider,
    private readonly claudeCli: ClaudeCliProvider,
    private readonly config: ConfigService,
  ) {}

  get(): LlmProvider {
    const name = this.resolveName();
    switch (name) {
      case 'claude_cli':
        return this.claudeCli;
      case 'ollama':
        return this.ollama;
      case 'anthropic':
        return this.anthropic;
    }
  }

  // LLM_PROVIDER is a first-class explicit selector. Accepted values:
  // claude_cli | anthropic | ollama. When set to a known value it
  // wins, and we validate prerequisites at boot rather than letting
  // the call site surface a confusing 401 / missing-env error later.
  // When unset, fall back to the legacy heuristic — API key implies
  // anthropic, otherwise ollama. Unknown values throw; silently
  // ignoring them was the prior footgun (`LLM_PROVIDER=anthropic`
  // was discarded and the env's other vars decided the outcome).
  private resolveName(): 'anthropic' | 'ollama' | 'claude_cli' {
    const explicit = this.config.get<string>(LLM_ENV.LLM_PROVIDER);
    if (explicit) {
      switch (explicit) {
        case 'claude_cli':
          return 'claude_cli';
        case 'anthropic':
          if (!this.config.get<string>(LLM_ENV.ANTHROPIC_API_KEY)) {
            throw new Error(
              'LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set',
            );
          }
          return 'anthropic';
        case 'ollama':
          if (!this.config.get<string>(LLM_ENV.OLLAMA_BASE_URL)) {
            throw new Error(
              'LLM_PROVIDER=ollama but OLLAMA_BASE_URL is not set',
            );
          }
          return 'ollama';
        default:
          throw new Error(
            `Unknown LLM_PROVIDER="${explicit}". Expected one of: claude_cli, anthropic, ollama.`,
          );
      }
    }
    if (this.config.get<string>(LLM_ENV.ANTHROPIC_API_KEY)) return 'anthropic';
    return 'ollama';
  }
}
