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

    /**
     * Keys whose whole value is replaced, compared without case, dashes, underscores and spaces.
     * An entry that starts with "*" matches any key that ends in the rest, so "*password" covers
     * "db_password" and "DB-PASSWORD" as well as "password". Entries without it match exactly:
     * "token" does not match "input_tokens". A "*" is only allowed as the first character.
     */
    public const DEFAULT_KEYS = [
        '*password', '*passwd', '*pwd', '*passphrase', '*password_confirmation',
        '*secret', '*secret_key', '*secret_access_key', '*access_key', '*api_key', '*private_key',
        '*token', '*authorization', '*cookie', 'credentials',
    ];

    /** Patterns whose matches are replaced inside any string. Every one of them runs in linear time. */
    public const DEFAULT_PATTERNS = [
        // An HTTP bearer token: the word Bearer, then a long run that looks random (a digit, a dot or an underscore in its first 64 characters).
        '/\b(?:Bearer|bearer|BEARER)\s{1,8}+(?=[A-Za-z0-9\-._~+\/]{0,63}?[0-9._])[A-Za-z0-9\-._~+\/]{16,}+=*+/',
        // An HTTP Basic credential after its Authorization label; the label stays.
        '/\b(?:[Aa]uthorization|AUTHORIZATION)\\\\?["\']?\s{0,8}+[:=]\s{0,8}+\\\\?["\']?(?:[Bb]asic|BASIC)\s{1,8}+\K[A-Za-z0-9+\/]{8,}+=*+/',
        // The password in a URL's userinfo (scheme://user:password@host); the rest of the URL stays.
        '/\b[A-Za-z][A-Za-z0-9+.\-]{1,15}:\/\/[^\s:\/@"\'\\\\]{1,128}+:\K[^\s@\/"\'\\\\]{1,128}+(?=@)/',
        // Provider API keys: OpenAI and Anthropic (sk-, sk-ant-, sk-proj-), and the like. Short hyphenated words are left alone: the key must hold an unbroken run of 24 characters or more.
        '/\b(?:sk|pk|rk)-(?:[A-Za-z0-9_]{1,32}-){0,5}[A-Za-z0-9_]{24,}+[A-Za-z0-9_\-]*+/',
        // Stripe keys.
        '/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}+/',
        // GitHub and GitLab tokens.
        '/\bgh[pousr]_[A-Za-z0-9]{36,255}+\b/',
        '/\bgithub_pat_[A-Za-z0-9_]{22,255}+/',
        '/\bglpat-[A-Za-z0-9_\-]{20,}+/',
        // Slack tokens and incoming-webhook URLs.
        '/\bxox[abposr]-[A-Za-z0-9\-]{10,}+/',
        '/\bxapp-\d-[A-Za-z0-9\-]{10,}+/',
        '/\bhttps:\/\/hooks\.slack\.com\/(?:services|triggers)\/[A-Za-z0-9]{8,}+\/[A-Za-z0-9]{8,}+\/[A-Za-z0-9]{20,}+/',
        // SendGrid, npm, Hugging Face and Twilio API key SIDs.
        '/\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}(?![A-Za-z0-9_\-])/',
        '/\bnpm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/',
        '/\bhf_[A-Za-z0-9]{30,}+/',
        '/\bSK[0-9a-f]{32}(?![0-9A-Za-z])/',
        // Google API keys.
        '/\bAIza[0-9A-Za-z_\-]{35}\b/',
        // AWS access key ids, and secret access keys when they are introduced by their label.
        '/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/',
        '/\b(?:aws|AWS|Aws)[_\- ]?(?:secret|SECRET|Secret)[_\- ]?(?:(?:access|ACCESS|Access)[_\- ]?)?(?:key|KEY|Key)\b\\\\?["\']?\s{0,8}+[:=]\s{0,8}+\\\\?["\']?[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9\/+=])/',
        // An Azure storage account key in a connection string.
        '/\bAccountKey=[A-Za-z0-9+\/]{40,}+={0,2}/',
        // JSON web tokens. They may only start where a token's characters do not continue from the left.
        '/(?<![A-Za-z0-9_\-])eyJ[A-Za-z0-9_\-]{10,}+\.eyJ[A-Za-z0-9_\-]{10,}+\.[A-Za-z0-9_\-]{10,}+/',
        // Private key blocks, complete or cut short, also with their line breaks escaped as \n. The body of a
        // block ends at the first "--", so a scan never reaches past the next block. The patterns that
        // ignore case are spelled out, since the caseless flag makes a scan far slower on hostile text.
        '/-----BEGIN (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----(?:[^-]++|-(?!-)){0,64}+-----END (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----/',
        '/-----BEGIN (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----[A-Za-z0-9+\/=\s\\\\]*+/',
    ];

    /**
     * How many characters past the length limit a string is scanned. Only the first max_length
     * characters of a string can ever be stored, so a secret that starts inside them is found as
     * long as it ends within this many characters of the cut. It is larger than any default secret
     * shape; a private key block is longer, and the cut-short pattern for it redacts through to
     * the end of the window.
     */
    private const WINDOW = 4096;

    /** The longest an array key is kept, in characters. */
    private const KEY_LENGTH = 256;

    /** How many times max_length the string content of one captured field may add up to. */
    private const FIELD_BUDGET = 100;

    private const MAX_DEPTH = 32;

    /** The most values one capture will visit before cutting the rest to null. */
    private const MAX_NODES = 10_000;

    /** @var array<string, true> */
    private array $keys = [];

    /** @var array<string, true> */
    private array $suffixes = [];

    /** @var list<int> */
    private array $suffixLengths = [];

    /** @var list<string> */
    private array $patterns = [];

    /** @var array<string, true> patterns that have failed on a string, which is reported once each */
    private array $failing = [];

    /** Matches a configured key and its value inside a string, such as {"password":"hunter2"}. */
    private ?string $keyPattern = null;

    /** The most characters of string content one captured field keeps, or null for no limit. */
    private readonly ?int $budget;

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
        $this->budget = $maxLength === null ? null : $maxLength * self::FIELD_BUDGET;

        $this->addKeys($keys);

        // Each pattern is checked once, here. A bad one is reported once and skipped.
        foreach ($patterns as $pattern) {
            $problem = self::problem($pattern);

            if ($problem !== null) {
                self::report("Trail skipped the redaction pattern [{$pattern}]: {$problem}.");

                continue;
            }

            // A pattern that matches nothing at all would rewrite every string.
            if (preg_match($pattern, '') === 1) {
                self::report("Trail skipped the redaction pattern [{$pattern}]: it matches the empty string.");

                continue;
            }

            $this->patterns[] = $pattern;
        }
    }

    public static function fromConfig(Repository $config): self
    {
        $capture = $config->get('trail.capture', []);
        $limit = self::DEFAULT_MAX_LENGTH;
        $on = true;
        $systemPrompt = true;

        if (is_array($capture)) {
            $on = (bool) ($capture['enabled'] ?? true);
            $systemPrompt = (bool) ($capture['system_prompt'] ?? true);
            $limit = array_key_exists('max_length', $capture) ? $capture['max_length'] : self::DEFAULT_MAX_LENGTH;
        } elseif ($capture === false || $capture === 0 || $capture === null) {
            // Switching capture off the short way is taken at its word.
            $on = false;
        } else {
            self::report('Trail ignored trail.capture: it must be an array. Payloads are captured with the defaults.');
        }

        // A limit read from an environment variable arrives as text.
        if (is_string($limit) && filter_var($limit, FILTER_VALIDATE_INT) !== false) {
            $limit = (int) $limit;
        }

        if ($limit !== null && (! is_int($limit) || $limit < 1)) {
            // A limit of zero would store nothing and a negative one means nothing, so the safe default applies.
            self::report('Trail ignored trail.capture.max_length: it must be a positive integer or null.');

            $limit = self::DEFAULT_MAX_LENGTH;
        }

        $redaction = $config->get('trail.redaction', []);

        // Redaction protects secrets, so a setting that is not a list of settings never turns it off.
        if (! is_array($redaction)) {
            self::report('Trail ignored trail.redaction: it must be an array. The default redaction applies; turn it off with trail.redaction.enabled.');

            $redaction = [];
        }

        return new self(
            capture: $on,
            systemPrompt: $systemPrompt,
            maxLength: $limit,
            redaction: (bool) ($redaction['enabled'] ?? true),
            keys: self::list($redaction, 'keys', self::DEFAULT_KEYS),
            patterns: self::list($redaction, 'patterns', self::DEFAULT_PATTERNS),
        );
    }

    /**
     * A list of strings from the redaction settings. A setting that is not a list, or that holds
     * nothing usable although it was not empty, gives the defaults; an empty list means none.
     *
     * @param  array<array-key, mixed>  $section
     * @param  list<string>  $defaults
     * @return list<string>
     */
    private static function list(array $section, string $name, array $defaults): array
    {
        if (! array_key_exists($name, $section)) {
            return $defaults;
        }

        $configured = $section[$name];

        if (! is_array($configured)) {
            self::report("Trail ignored trail.redaction.{$name}: it must be a list of strings. The defaults apply.");

            return $defaults;
        }

        $strings = array_values(array_filter($configured, is_string(...)));

        if (count($strings) === count($configured)) {
            return $strings;
        }

        self::report("Trail skipped entries of trail.redaction.{$name} that are not strings.");

        return $strings === [] ? $defaults : $strings;
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
            $context = new PayloadContext(self::MAX_NODES);
            $clean = $this->scrub(self::safe($value, 0, $context), $path, $state);

            return new Captured($clean, $state->redacted, $state->truncated, $state->dropped || $context->dropped);
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
        $suffixes = [];

        foreach ($value as $key => $item) {
            // A key can hold a secret as well as a value can: a map from token to user, say.
            $name = is_string($key) ? self::unique($this->scrubKey($key, $state), $clean, $suffixes) : $key;
            $child = $path === '' ? (string) $name : $path.'.'.$name;

            if ($item !== null && is_string($key) && $this->redaction && $this->sensitive($key)) {
                $state->redacted = true;
                $clean[$name] = self::REDACTED;

                continue;
            }

            $clean[$name] = $this->scrub($item, $child, $state);
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

        // Once a field has kept more than its budget, what is left of it is dropped.
        if ($this->budget !== null && $state->kept > $this->budget) {
            $state->truncate($path, mb_strlen($text, 'UTF-8'));

            return '';
        }

        // Bytes that are not text are described, never stored.
        if (! mb_check_encoding($text, 'UTF-8')) {
            return ['binary' => true, 'bytes' => strlen($text)];
        }

        [$text, $length] = $this->shape($text, $this->maxLength, true, $state);

        if ($length !== null) {
            $state->truncate($path, $length);
        }

        $state->kept += mb_strlen($text, 'UTF-8');

        return $text;
    }

    /**
     * An array key as it will be stored: scrubbed with the patterns like any string, and cut if it
     * is very long. The list of sensitive keys does not apply, since a key is not a value.
     */
    private function scrubKey(string $key, CaptureState $state): string
    {
        if ($key === '') {
            return $key;
        }

        if (! mb_check_encoding($key, 'UTF-8')) {
            $state->redacted = true;

            return self::REDACTED;
        }

        [$key, $length] = $this->shape($key, self::KEY_LENGTH, false, $state);

        if ($length !== null) {
            $state->dropped = true;
        }

        return $key;
    }

    /**
     * A key that two keys did not already become: when scrubbing makes keys equal, the later ones
     * get a "#2", "#3" and so on, so none of them is lost.
     *
     * @param  array<array-key, mixed>  $taken
     * @param  array<string, int>  $suffixes
     */
    private static function unique(string $name, array $taken, array &$suffixes): string
    {
        if (! array_key_exists($name, $taken)) {
            return $name;
        }

        $number = $suffixes[$name] ?? 1;

        do {
            $candidate = $name.'#'.++$number;
        } while (array_key_exists($candidate, $taken));

        $suffixes[$name] = $number;

        return $candidate;
    }

    /**
     * A valid UTF-8 text as it will be stored, with the length it was cut from, or null when it was
     * not cut. It is redacted first and cut afterwards, so a secret cut in half cannot slip past a
     * pattern. Only the first limit + WINDOW characters are scanned: the rest could never be
     * stored, and scanning it would let one huge string cost far more than its share. The length
     * reported is the whole string's, as it would be after redaction.
     *
     * @return array{0: string, 1: ?int}
     */
    private function shape(string $text, ?int $limit, bool $scanKeys, CaptureState $state): array
    {
        $unread = 0;

        if ($limit !== null && strlen($text) > $limit + self::WINDOW) {
            $total = mb_strlen($text, 'UTF-8');

            if ($total > $limit + self::WINDOW) {
                $text = mb_substr($text, 0, $limit + self::WINDOW, 'UTF-8');
                $unread = $total - ($limit + self::WINDOW);
            }
        }

        if ($this->redaction) {
            $text = $this->redact($text, $scanKeys, $state);
        }

        // Bytes are never fewer than characters, so a short enough text needs no counting.
        if ($limit === null || ($unread === 0 && strlen($text) <= $limit)) {
            return [$text, null];
        }

        $length = mb_strlen($text, 'UTF-8') + $unread;

        if ($length <= $limit) {
            return [$text, null];
        }

        return [mb_substr($text, 0, $limit, 'UTF-8'), $length];
    }

    private function redact(string $text, bool $scanKeys, CaptureState $state): string
    {
        $patterns = $scanKeys && $this->keyPattern !== null ? [...$this->patterns, $this->keyPattern] : $this->patterns;

        foreach ($patterns as $pattern) {
            $count = 0;
            $redacted = preg_replace($pattern, self::REDACTED, $text, -1, $count);

            if ($redacted === null) {
                // The scan failed part way, so nothing about this string can be vouched for.
                $state->redacted = true;

                if (! isset($this->failing[$pattern])) {
                    $this->failing[$pattern] = true;
                    self::report("Trail's redaction pattern [{$pattern}] failed on a string (".preg_last_error_msg().'), so that string was replaced as a whole. This is reported once.');
                }

                return self::REDACTED;
            }

            if ($count > 0) {
                $state->redacted = true;
                $text = $redacted;
            }
        }

        return $text;
    }

    private function sensitive(string $key): bool
    {
        $key = self::normalise($key);

        if (isset($this->keys[$key])) {
            return true;
        }

        foreach ($this->suffixLengths as $length) {
            if ($length <= strlen($key) && isset($this->suffixes[substr($key, -$length)])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<string>  $keys
     */
    private function addKeys(array $keys): void
    {
        $exact = [];
        $suffixes = [];

        foreach ($keys as $key) {
            $wildcard = str_starts_with($key, '*');
            $name = self::normalise($wildcard ? substr($key, 1) : $key);

            // A "*" anywhere but the start, or nothing after it, would match everything or nothing useful.
            if ($name === '' || str_contains($name, '*')) {
                self::report("Trail skipped the redaction key [{$key}]: a * is only allowed as the first character, in front of a name.");

                continue;
            }

            if ($wildcard) {
                $suffixes[$name] = true;
            } else {
                $exact[$name] = true;
            }
        }

        $this->keys = $exact;
        $this->suffixes = $suffixes;
        $this->suffixLengths = array_values(array_unique(array_map(strlen(...), array_map(strval(...), array_keys($suffixes)))));

        $this->keyPattern = $this->keyPattern(array_map(strval(...), array_keys($exact)), array_map(strval(...), array_keys($suffixes)));
    }

    /**
     * One expression for every key, built once: the quoted forms "key":"value", 'key':'value' and
     * \"key\":\"value\", which JSON text and array dumps are made of. Only the value is replaced.
     * A key matches under the same normalisation as everywhere else, so separators may sit between
     * any two of its characters. A secret in free text with no recognisable shape is not found.
     *
     * @param  list<string>  $exact
     * @param  list<string>  $suffixes
     */
    private function keyPattern(array $exact, array $suffixes): ?string
    {
        if ($exact === [] && $suffixes === []) {
            return null;
        }

        $spell = fn (string $name): string => implode('[-_ ]*+', array_map(fn (string $character): string => preg_quote($character, '/'), str_split($name)));

        $names = [];

        if ($exact !== []) {
            $names[] = '[-_ ]*+(?:'.implode('|', array_map($spell, $exact)).')';
        }

        if ($suffixes !== []) {
            // The text in front of a suffix is bounded, so no quote can start a long scan.
            $names[] = '[^"\'\\\\]{0,64}?(?:'.implode('|', array_map($spell, $suffixes)).')';
        }

        $name = '(?(DEFINE)(?<name>(?:'.implode('|', $names).')[-_ ]*+))';
        $plain = '(?<q>["\'])(?&name)\k<q>\s{0,8}+:\s{0,8}+\k<q>\K(?:(?:(?!\k<q>)[^\\\\])++|\\\\.)++(?=\k<q>|\z)';
        $escaped = '\\\\"(?&name)\\\\"\s{0,8}+:\s{0,8}+\\\\"\K(?:[^"\\\\]++|\\\\{3}"|\\\\(?!"))++(?=\\\\"|\z)';

        $pattern = '/'.$name.'(?:'.$plain.'|'.$escaped.')/i';
        $problem = self::problem($pattern);

        if ($problem !== null) {
            self::report("Trail cannot redact sensitive keys inside text: {$problem}.");

            return null;
        }

        return $pattern;
    }

    /**
     * Why a pattern does not compile, or null when it does.
     */
    private static function problem(string $pattern): ?string
    {
        $message = null;

        // A handler of our own sees the warning whatever the host app does with warnings.
        set_error_handler(function (int $level, string $text) use (&$message): bool {
            $message = $text;

            return true;
        });

        try {
            $compiled = preg_match($pattern, '');
        } finally {
            restore_error_handler();
        }

        if ($compiled !== false) {
            return null;
        }

        return trim((string) preg_replace('/^preg_match\(\): /', '', $message ?? preg_last_error_msg()));
    }

    private static function report(string $message): void
    {
        Guard::run(function () use ($message): void {
            throw new InvalidArgumentException($message);
        });
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
            // Cutting a null loses nothing; anything else is lost without a length to report.
            $context->dropped = $context->dropped || $value !== null;

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
            // Past the budget nothing is kept, so nothing past it is converted or scanned.
            if ($context->budget <= 0) {
                $context->dropped = true;

                break;
            }

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
