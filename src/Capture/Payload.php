<?php

namespace Astro\Trail\Capture;

use BackedEnum;
use Closure;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use InvalidArgumentException;
use JsonSerializable;
use Laravel\Ai\Files\File;
use Laravel\Ai\Gateway\TextGenerationOptions;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Messages\ToolResultMessage;
use Laravel\Ai\Messages\UserMessage;
use Laravel\Ai\Responses\Data\ToolCall;
use Stringable;
use Throwable;

/**
 * The one place SDK values become storable values. Every value goes through two stages: it is
 * made JSON-safe, and then it is redacted and truncated, in that order, so a secret cut in half by
 * the length limit cannot slip past a pattern. Nothing here throws into a listener, and a string
 * that could not be scanned is never stored.
 */
final class Payload
{
    public const REDACTED = '[redacted]';

    public const DEFAULT_MAX_LENGTH = 10_000;

    /** The longest an excerpt on a trace row can be, in characters. */
    public const EXCERPT_LENGTH = 1000;

    /** Keys whose whole value is replaced, compared without case, dashes, underscores and spaces. */
    public const DEFAULT_KEYS = [
        'password', 'passwd', 'password_confirmation', 'secret', 'secret_key', 'token', 'api_key', 'apikey',
        'x_api_key', 'authorization', 'proxy_authorization', 'access_token', 'refresh_token', 'id_token',
        'session_token', 'auth_token', 'x_auth_token', 'bearer_token', 'client_secret', 'private_key',
        'credentials', 'cookie', 'set_cookie',
    ];

    /** Patterns whose matches are replaced inside any string. */
    public const DEFAULT_PATTERNS = [
        // An HTTP bearer token.
        '/\bBearer\s+[A-Za-z0-9\-._~+\/]{16,}=*/i',
        // Provider API keys: OpenAI and Anthropic (sk-, sk-ant-, sk-proj-), and the like. A digit is required, so words such as "sk-learn-pipeline" are left alone.
        '/\b(?:sk|pk|rk)-(?=[A-Za-z0-9_\-]{20,})(?=[A-Za-z0-9_\-]*\d)[A-Za-z0-9_\-]+/',
        // Stripe keys.
        '/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/',
        // GitHub tokens.
        '/\bgh[pousr]_[A-Za-z0-9]{36,255}\b/',
        '/\bgithub_pat_[A-Za-z0-9_]{22,255}/',
        // Slack tokens.
        '/\bxox[abposr]-[A-Za-z0-9\-]{10,}/',
        '/\bxapp-\d-[A-Za-z0-9\-]{10,}/',
        // Google API keys.
        '/\bAIza[0-9A-Za-z_\-]{35}\b/',
        // AWS access key ids, and secret access keys when they are introduced by their label.
        '/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/',
        '/\baws[_\- ]?secret[_\- ]?(?:access[_\- ]?)?key\b["\']?\s*[:=]\s*["\']?[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9\/+=])/i',
        // JSON web tokens.
        '/\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/',
        // Private key blocks, complete or cut short.
        '/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----.*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/s',
        '/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[A-Za-z0-9+\/=\s]*/',
    ];

    private const MAX_DEPTH = 32;

    /** The most values one capture will visit before cutting the rest to null. */
    private const MAX_NODES = 10_000;

    /** @var array<string, true> */
    private array $keys = [];

    /** @var list<string> */
    private array $patterns = [];

    /**
     * @param  list<string>  $keys
     * @param  list<string>  $patterns
     */
    public function __construct(
        private readonly bool $capture = true,
        private readonly bool $systemPrompt = true,
        private readonly ?int $maxLength = self::DEFAULT_MAX_LENGTH,
        private readonly bool $redaction = true,
        array $keys = self::DEFAULT_KEYS,
        array $patterns = self::DEFAULT_PATTERNS,
    ) {
        foreach ($keys as $key) {
            $this->keys[self::normalise($key)] = true;
        }

        // Each pattern is checked once, here. A bad one is reported once and skipped.
        foreach ($patterns as $pattern) {
            if (@preg_match($pattern, '') === false) {
                $problem = preg_last_error_msg();

                Guard::run(function () use ($pattern, $problem): void {
                    throw new InvalidArgumentException("Trail skipped the redaction pattern [{$pattern}]: {$problem}.");
                });

                continue;
            }

            $this->patterns[] = $pattern;
        }
    }

    public static function fromConfig(Repository $config): self
    {
        $limit = $config->get('trail.capture.max_length', self::DEFAULT_MAX_LENGTH);

        if ($limit !== null && (! is_int($limit) || $limit < 1)) {
            // A limit of zero would store nothing and a negative one means nothing, so the safe default applies.
            Guard::run(function (): void {
                throw new InvalidArgumentException('Trail ignored trail.capture.max_length: it must be a positive integer or null.');
            });

            $limit = self::DEFAULT_MAX_LENGTH;
        }

        $keys = $config->get('trail.redaction.keys', self::DEFAULT_KEYS);
        $patterns = $config->get('trail.redaction.patterns', self::DEFAULT_PATTERNS);

        return new self(
            capture: (bool) $config->get('trail.capture.enabled', true),
            systemPrompt: (bool) $config->get('trail.capture.system_prompt', true),
            maxLength: $limit,
            redaction: (bool) $config->get('trail.redaction.enabled', true),
            keys: is_array($keys) ? array_values(array_filter($keys, is_string(...))) : self::DEFAULT_KEYS,
            patterns: is_array($patterns) ? array_values(array_filter($patterns, is_string(...))) : self::DEFAULT_PATTERNS,
        );
    }

    /**
     * Whether payloads are stored at all.
     */
    public function capturing(): bool
    {
        return $this->capture;
    }

    /**
     * Whether the agent's instructions are read and stored.
     */
    public function capturesSystemPrompt(): bool
    {
        return $this->capture && $this->systemPrompt;
    }

    /**
     * A value made JSON-safe, redacted and then truncated, with what happened to it. The path names
     * where the value sits in the span ("input", "output"), and prefixes the paths of what is truncated.
     * With capture turned off nothing is returned.
     */
    public function capture(mixed $value, string $path = ''): Captured
    {
        return $this->capture ? $this->clean($value, $path) : new Captured;
    }

    /**
     * Text that is diagnostic rather than content, such as an exception message. It is redacted and
     * truncated like any payload, and kept even when payload capture is off.
     */
    public function message(?string $text, string $path): Captured
    {
        return $text === null ? new Captured : $this->clean($text, $path);
    }

    private function clean(mixed $value, string $path): Captured
    {
        try {
            $state = new CaptureState;
            $clean = $this->scrub($this->value($value), $path, $state);

            return new Captured($clean, $state->redacted, $state->truncated);
        } catch (Throwable $e) {
            // Whatever failed, the value is not stored: it could not be shown to be clean.
            Guard::run(function () use ($e): void {
                throw $e;
            });

            return new Captured;
        }
    }

    private function scrub(mixed $value, string $path, CaptureState $state): mixed
    {
        if (is_string($value)) {
            return $this->scrubString($value, $path, $state);
        }

        if (! is_array($value)) {
            return $value;
        }

        $clean = [];

        foreach ($value as $key => $item) {
            $child = $path === '' ? (string) $key : $path.'.'.$key;

            if ($item !== null && is_string($key) && $this->redaction && isset($this->keys[self::normalise($key)])) {
                $state->redacted = true;
                $clean[$key] = self::REDACTED;

                continue;
            }

            $clean[$key] = $this->scrub($item, $child, $state);
        }

        return $clean;
    }

    /**
     * @return string|array{binary: true, bytes: int}
     */
    private function scrubString(string $text, string $path, CaptureState $state): string|array
    {
        if ($text === '') {
            return $text;
        }

        // Bytes that are not text are described, never stored.
        if (! mb_check_encoding($text, 'UTF-8')) {
            return ['binary' => true, 'bytes' => strlen($text)];
        }

        if ($this->redaction) {
            $text = $this->redact($text, $state);
        }

        if ($this->maxLength !== null) {
            $length = mb_strlen($text, 'UTF-8');

            if ($length > $this->maxLength) {
                $text = mb_substr($text, 0, $this->maxLength, 'UTF-8');
                $state->truncated[$path] = $length;
            }
        }

        return $text;
    }

    private function redact(string $text, CaptureState $state): string
    {
        foreach ($this->patterns as $pattern) {
            $count = 0;
            $redacted = preg_replace($pattern, self::REDACTED, $text, -1, $count);

            if ($redacted === null) {
                // The scan failed part way, so nothing about this string can be vouched for.
                $state->redacted = true;

                return self::REDACTED;
            }

            if ($count > 0) {
                $state->redacted = true;
                $text = $redacted;
            }
        }

        return $text;
    }

    private static function normalise(string $key): string
    {
        return str_replace(['-', '_', ' '], '', strtolower($key));
    }

    /**
     * What the files attached to a prompt are, without reading them or fetching them.
     *
     * @param  iterable<mixed>  $attachments
     * @return list<array{type: string, name: ?string, size: ?int}>
     */
    public function attachments(iterable $attachments): array
    {
        $described = [];

        foreach ($attachments as $attachment) {
            $described[] = $this->describe($attachment);
        }

        return $described;
    }

    /**
     * @return array{type: string, name: ?string, size: ?int}
     */
    private function describe(mixed $attachment): array
    {
        $type = is_object($attachment) ? Str::kebab(class_basename(self::className($attachment))) : 'unknown';
        $name = null;
        $size = null;

        try {
            if ($attachment instanceof File) {
                $name = $attachment->name();
                $size = $this->base64Size($attachment);
            } elseif ($attachment instanceof UploadedFile) {
                $type = 'upload';
                $name = $attachment->getClientOriginalName();
                $uploaded = $attachment->getSize();
                $size = $uploaded === false ? null : $uploaded;
            }
        } catch (Throwable) {
            // What cannot be described cheaply is left unknown.
        }

        return ['type' => $type, 'name' => $name, 'size' => $size];
    }

    /**
     * The size of a file whose content is inline, worked out from the length of its base64. A local
     * file, a stored one, a remote one and one held by the provider are not measured.
     */
    private function base64Size(File $file): ?int
    {
        if (! property_exists($file, 'base64') || ! is_string($file->base64)) {
            return null;
        }

        $length = strlen($file->base64);
        $padding = strlen($file->base64) - strlen(rtrim($file->base64, '='));

        return max(0, intdiv($length * 3, 4) - $padding);
    }

    /**
     * @param  array<array-key, mixed>  $messages
     * @return list<array<string, mixed>>
     */
    public function messages(array $messages): array
    {
        $captured = [];

        foreach ($messages as $message) {
            if (! $message instanceof Message) {
                $captured[] = ['role' => null, 'content' => $message];

                continue;
            }

            $entry = ['role' => $message->role->value, 'content' => $message->content];

            if ($message instanceof AssistantMessage && $message->toolCalls->isNotEmpty()) {
                $entry['tool_calls'] = $this->toolCalls($message->toolCalls->all());
            }

            if ($message instanceof ToolResultMessage && $message->toolResults->isNotEmpty()) {
                $entry['tool_results'] = $message->toolResults->map(fn ($result): array => [
                    'id' => $result->id,
                    'name' => $result->name,
                    'result' => $result->result,
                ])->values()->all();
            }

            if ($message instanceof UserMessage && $message->attachments->isNotEmpty()) {
                $entry['attachments'] = $this->attachments($message->attachments);
            }

            $captured[] = $entry;
        }

        return $captured;
    }

    /**
     * Only public properties are read: the options' own providerOptions() method calls user code.
     *
     * @return array<string, mixed>|null
     */
    public function options(?TextGenerationOptions $options): ?array
    {
        if ($options === null) {
            return null;
        }

        return [
            'max_steps' => $options->maxSteps,
            'max_tokens' => $options->maxTokens,
            'temperature' => $options->temperature,
            'top_p' => $options->topP,
            'tool_choice' => $options->toolChoice === null ? null : [
                'mode' => $options->toolChoice->mode,
                'tool' => $options->toolChoice->toolName,
            ],
            'provider_options' => $options->providerOptions,
        ];
    }

    /**
     * @param  array<array-key, mixed>  $toolCalls
     * @return list<array<string, mixed>>
     */
    public function toolCalls(array $toolCalls): array
    {
        $captured = [];

        foreach ($toolCalls as $call) {
            if (! $call instanceof ToolCall) {
                continue;
            }

            $captured[] = [
                'id' => $call->id,
                'name' => $call->name,
                'arguments' => $call->arguments,
            ];
        }

        return $captured;
    }

    /**
     * A JSON-safe copy of any value. It never throws: user code that fails is stored as its class
     * name, cycles are cut where they close, and a value that is too deep or too wide is cut to null.
     */
    public function value(mixed $value): mixed
    {
        return self::safe($value, 0, new PayloadContext(self::MAX_NODES));
    }

    private static function safe(mixed $value, int $depth, PayloadContext $context): mixed
    {
        if ($depth >= self::MAX_DEPTH || $context->budget-- <= 0) {
            return null;
        }

        return match (true) {
            $value === null, is_string($value), is_int($value), is_bool($value) => $value,
            is_float($value) => is_finite($value) ? $value : null,
            is_array($value) => self::items($value, $depth, $context),
            $value instanceof BackedEnum => $value->value,
            $value instanceof Closure => null,
            $value instanceof JsonSerializable => self::expand($value, fn (): mixed => $value->jsonSerialize(), $depth, $context),
            $value instanceof Arrayable => self::expand($value, fn (): mixed => $value->toArray(), $depth, $context),
            $value instanceof Stringable => self::stringify($value),
            is_object($value) => ['class' => self::className($value)],
            default => null,
        };
    }

    /**
     * @param  array<array-key, mixed>  $items
     * @return array<array-key, mixed>
     */
    private static function items(array $items, int $depth, PayloadContext $context): array
    {
        $captured = [];

        foreach ($items as $key => $item) {
            $captured[$key] = self::safe($item, $depth + 1, $context);
        }

        return $captured;
    }

    /**
     * Expand an object through its own method, unless it is already being expanded further up.
     *
     * @param  Closure(): mixed  $expand
     */
    private static function expand(object $object, Closure $expand, int $depth, PayloadContext $context): mixed
    {
        $id = spl_object_id($object);

        if (isset($context->expanding[$id])) {
            return ['class' => self::className($object)];
        }

        $context->expanding[$id] = true;

        try {
            return self::safe($expand(), $depth + 1, $context);
        } catch (Throwable) {
            return ['class' => self::className($object)];
        } finally {
            unset($context->expanding[$id]);
        }
    }

    private static function stringify(Stringable $value): mixed
    {
        try {
            return (string) $value;
        } catch (Throwable) {
            return ['class' => self::className($value)];
        }
    }

    /**
     * The class name, without the file path an anonymous class carries after a NUL byte.
     */
    private static function className(object $object): string
    {
        return explode("\0", $object::class)[0];
    }
}
