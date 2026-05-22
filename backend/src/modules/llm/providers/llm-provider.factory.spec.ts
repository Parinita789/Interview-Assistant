import { LlmProviderFactory } from './llm-provider.factory';

describe('LlmProviderFactory', () => {
  const anthropic = { name: 'anthropic', call: jest.fn() };
  const ollama = { name: 'ollama', call: jest.fn() };
  const claudeCli = { name: 'claude_cli', call: jest.fn() };

  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };

  let factory: LlmProviderFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    factory = new LlmProviderFactory(
      anthropic as never,
      ollama as never,
      claudeCli as never,
      config as never,
    );
  });

  describe('legacy heuristic (LLM_PROVIDER unset)', () => {
    it('returns Anthropic when ANTHROPIC_API_KEY is set', () => {
      env.ANTHROPIC_API_KEY = 'sk-test';
      expect(factory.get()).toBe(anthropic);
    });

    it('falls back to Ollama when no API key and no LLM_PROVIDER override', () => {
      expect(factory.get()).toBe(ollama);
    });
  });

  describe('explicit LLM_PROVIDER selector', () => {
    it('returns Claude CLI when LLM_PROVIDER=claude_cli, even if ANTHROPIC_API_KEY is set', () => {
      env.LLM_PROVIDER = 'claude_cli';
      env.ANTHROPIC_API_KEY = 'sk-test';
      expect(factory.get()).toBe(claudeCli);
    });

    it('returns Anthropic when LLM_PROVIDER=anthropic and key is set', () => {
      env.LLM_PROVIDER = 'anthropic';
      env.ANTHROPIC_API_KEY = 'sk-test';
      expect(factory.get()).toBe(anthropic);
    });

    it('throws when LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing', () => {
      env.LLM_PROVIDER = 'anthropic';
      expect(() => factory.get()).toThrow(/ANTHROPIC_API_KEY is not set/);
    });

    it('returns Ollama when LLM_PROVIDER=ollama and OLLAMA_BASE_URL is set', () => {
      env.LLM_PROVIDER = 'ollama';
      env.OLLAMA_BASE_URL = 'http://localhost:11434';
      expect(factory.get()).toBe(ollama);
    });

    it('throws when LLM_PROVIDER=ollama but OLLAMA_BASE_URL is missing', () => {
      env.LLM_PROVIDER = 'ollama';
      expect(() => factory.get()).toThrow(/OLLAMA_BASE_URL is not set/);
    });

    it('throws on an unknown LLM_PROVIDER value (no silent fallback)', () => {
      env.LLM_PROVIDER = 'something_else';
      env.ANTHROPIC_API_KEY = 'sk-test';
      expect(() => factory.get()).toThrow(/Unknown LLM_PROVIDER/);
    });
  });
});
