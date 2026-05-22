import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import {
  CLAUDE_CLI_DEFAULT_BIN,
  CLAUDE_CLI_TIMEOUT_MS,
  LLM_ENV,
} from '../constants';

export interface ClaudeCliResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// The terminal `result` event in stream-json carries the same shape
// as the old single-envelope `json` output. Other event types
// (`system`, `assistant`, `user`) are observed for log/heartbeat only.
interface ClaudeCliJsonEnvelope {
  type: string;
  is_error: boolean;
  result: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
    }
  >;
}

interface ClaudeCliStreamEvent {
  type?: string;
  subtype?: string;
  model?: string;
  session_id?: string;
}

@Injectable()
export class ClaudeCliClientService {
  private readonly logger = new Logger(ClaudeCliClientService.name);

  constructor(private readonly config: ConfigService) {}

  async run(
    prompt: string,
    model?: string,
    signal?: AbortSignal,
  ): Promise<ClaudeCliResult> {
    const bin =
      this.config.get<string>(LLM_ENV.CLAUDE_CLI_BIN) ?? CLAUDE_CLI_DEFAULT_BIN;
    // stream-json emits one NDJSON event per line — system init,
    // assistant deltas, and a terminal `result` event with the full
    // text + usage. `--verbose` is required by the CLI when
    // -p is paired with stream-json; without it the CLI rejects the
    // flag combo at startup. The win over plain json: we get
    // observability into a call that previously sat silent for
    // minutes, and the operator can see "stream alive, event 14"
    // instead of guessing whether the subprocess hung.
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      ...(model ? ['--model', model] : []),
    ];
    this.logger.log(
      `spawn ${bin} ${args.join(' ')} (prompt=${prompt.length} chars)`,
    );

    if (signal?.aborted) {
      throw new Error('claude CLI call aborted before spawn');
    }

    return new Promise((resolve, reject) => {
      // Strip ANTHROPIC_API_KEY before spawning. The `claude` binary
      // has its own logged-in auth state and prefers that when no
      // env key is set. If we inherit a stale or invalid
      // ANTHROPIC_API_KEY from the parent shell, the subprocess
      // attempts to use it and dies with 401 + exit code 1. The
      // backend's own .env tries to clear it but dotenv doesn't
      // override existing process env vars, so the defense has to
      // happen at the spawn site.
      const childEnv = { ...process.env };
      delete childEnv.ANTHROPIC_API_KEY;
      const child = spawn(bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
      });
      let stdoutBuffer = '';
      let stderr = '';
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let eventCount = 0;
      let finalEvent: ClaudeCliJsonEnvelope | null = null;
      const malformedLines: string[] = [];

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, CLAUDE_CLI_TIMEOUT_MS);

      // Listen for an outer cancellation (LlmService per-attempt
      // timeout). SIGKILL the subprocess immediately so we stop
      // paying for tokens nobody is waiting for. The close handler
      // fires after the kill but `aborted` short-circuits it so the
      // promise rejects with the abort error, not a misleading
      // "exited with code 137".
      const onAbort = () => {
        if (settled) return;
        aborted = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      };

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event: ClaudeCliStreamEvent;
        try {
          event = JSON.parse(trimmed) as ClaudeCliStreamEvent;
        } catch {
          // A malformed line is non-fatal — the CLI sometimes
          // interleaves non-JSON status lines and the result event
          // may still arrive. Stash for diagnostics; only fatal if
          // we close without ever seeing a result event.
          if (malformedLines.length < 5) malformedLines.push(trimmed.slice(0, 200));
          return;
        }
        eventCount += 1;
        if (event.type === 'system' && event.subtype === 'init') {
          this.logger.log(
            `claude CLI stream: init (model=${event.model ?? '?'}, ` +
              `session=${event.session_id ?? '?'})`,
          );
        } else if (event.type === 'assistant') {
          this.logger.log(`claude CLI stream: assistant event #${eventCount}`);
        } else if (event.type === 'user') {
          this.logger.log(`claude CLI stream: user/tool event #${eventCount}`);
        } else if (event.type === 'result') {
          // The terminal event carries the same shape the old single
          // json envelope used to — stash and let the close handler
          // resolve from it.
          finalEvent = event as unknown as ClaudeCliJsonEnvelope;
          this.logger.log(
            `claude CLI stream: result received (events=${eventCount}, ` +
              `is_error=${finalEvent.is_error ?? false})`,
          );
        } else {
          // rate_limit_event, future event types, etc. — log the
          // type so operators can see what the CLI is up to without
          // dumping content.
          this.logger.log(
            `claude CLI stream: ${event.type ?? 'unknown'} event #${eventCount}`,
          );
        }
      };

      child.stdout.on('data', (d: Buffer) => {
        stdoutBuffer += d.toString();
        let newlineIdx: number;
        while ((newlineIdx = stdoutBuffer.indexOf('\n')) !== -1) {
          const line = stdoutBuffer.slice(0, newlineIdx);
          stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
          handleLine(line);
        }
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        if (settled) return;
        cleanup();
        reject(new Error(`claude CLI spawn failed (${bin}): ${err.message}`));
      });
      // If the child exits before consuming stdin (spawn race or
      // immediate-fail), Node emits an unhandled 'error' on the
      // stdin Writable, which would crash the process. Surface it
      // through the same reject path as the spawn error.
      child.stdin.on('error', (err: Error & { code?: string }) => {
        if (settled) return;
        // EPIPE is the common "child closed before we finished
        // writing" race — squash it because child.on('close') will
        // reject with the more informative non-zero-exit message.
        if (err.code === 'EPIPE') return;
        cleanup();
        reject(new Error(`claude CLI stdin error: ${err.message}`));
      });
      child.on('close', (code) => {
        if (settled) return;
        cleanup();
        if (aborted) {
          reject(
            new Error(
              `claude CLI call aborted by outer timeout (prompt=${prompt.length} chars)`,
            ),
          );
          return;
        }
        if (timedOut) {
          reject(
            new Error(
              `claude CLI timed out after ${CLAUDE_CLI_TIMEOUT_MS}ms (prompt=${prompt.length} chars)`,
            ),
          );
          return;
        }
        if (code !== 0) {
          reject(
            new Error(
              `claude CLI exited with code ${code}: ${stderr.slice(0, 500) || '(empty stderr)'}`,
            ),
          );
          return;
        }

        // Flush any trailing partial line that didn't end in \n.
        if (stdoutBuffer.length > 0) {
          handleLine(stdoutBuffer);
          stdoutBuffer = '';
        }

        if (!finalEvent) {
          reject(
            new Error(
              `claude CLI stream-json ended without a result event ` +
                `(events=${eventCount}, malformed=${malformedLines.length}). ` +
                (malformedLines.length > 0
                  ? `First bad line: ${malformedLines[0]}`
                  : '(no malformed lines)'),
            ),
          );
          return;
        }

        if (finalEvent.is_error) {
          reject(
            new Error(
              `claude CLI returned an error envelope: ${finalEvent.result || '(no message)'}`,
            ),
          );
          return;
        }

        const usage = finalEvent.usage ?? {};
        resolve({
          text: (finalEvent.result ?? '').trim(),
          model: pickActualModel(finalEvent.modelUsage, model),
          tokensIn: usage.input_tokens ?? 0,
          tokensOut: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}

function pickActualModel(
  modelUsage: ClaudeCliJsonEnvelope['modelUsage'],
  explicit?: string,
): string {
  if (explicit) return explicit;
  if (!modelUsage) return 'claude-cli';
  let bestKey: string | null = null;
  let bestOut = -1;
  for (const [key, info] of Object.entries(modelUsage)) {
    const out = info?.outputTokens ?? 0;
    if (out > bestOut) {
      bestOut = out;
      bestKey = key;
    }
  }
  if (!bestKey) return 'claude-cli';
  return bestKey.replace(/\[.*?\]$/, '').replace(/-\d{8}$/, '');
}
