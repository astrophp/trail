<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Scripts the Anthropic Messages API underneath the SDK's real Anthropic gateway.
 *
 * Each scripted turn answers one HTTP request, as JSON or as a server-sent event stream depending
 * on what the gateway asked for. Everything above the HTTP client is real SDK code: request
 * building, response and stream parsing, usage and error mapping, the step loop and its events.
 */
class FakeAnthropic
{
    public const MODEL = 'claude-test-requested';

    /** The hosts of the two Anthropic-driver providers the tests configure: "anthropic" and "backup". */
    public const HOSTS = ['api.anthropic.com/*', 'backup.anthropic.test/*'];

    protected static ?self $active = null;

    /** @var list<array<string, mixed>> */
    protected array $requests = [];

    /** @var list<string> */
    protected array $urls = [];

    /**
     * @param  list<array<string, mixed>>  $turns
     */
    protected function __construct(protected array $turns) {}

    /**
     * @param  list<array<string, mixed>>  $turns
     */
    public static function script(array $turns): self
    {
        // Http::fake() keeps earlier stubs, so one stub is registered per application and later scripts replace its turns...
        if (! app()->bound(self::class)) {
            app()->instance(self::class, true);

            Http::fake(array_fill_keys(self::HOSTS, fn (Request $request) => self::$active->respond($request)));
        }

        return self::$active = new self($turns);
    }

    /**
     * A turn that answers with text and ends the run.
     *
     * @param  array<string, int>  $usage
     */
    public static function text(string $text, array $usage = [], ?string $model = null, string $stopReason = 'end_turn'): array
    {
        return self::turn([['type' => 'text', 'text' => $text]], $stopReason, $usage, $model);
    }

    /**
     * A turn that asks for one or more tools: [['id' => 'toolu_1', 'name' => 'lookup', 'input' => [...]], ...].
     *
     * @param  list<array{id: string, name: string, input?: array<string, mixed>}>  $calls
     * @param  array<string, int>  $usage
     */
    public static function toolUse(array $calls, array $usage = [], ?string $model = null, string $text = ''): array
    {
        $content = $text === '' ? [] : [['type' => 'text', 'text' => $text]];

        foreach ($calls as $call) {
            $content[] = ['type' => 'tool_use', 'id' => $call['id'], 'name' => $call['name'], 'input' => $call['input'] ?? []];
        }

        return self::turn($content, 'tool_use', $usage, $model);
    }

    /**
     * A turn that fails with an HTTP error status.
     */
    public static function error(int $status, string $message = 'Request failed.', string $type = 'api_error'): array
    {
        return ['status' => $status, 'body' => ['type' => 'error', 'error' => ['type' => $type, 'message' => $message]]];
    }

    /**
     * A turn where the connection to the provider cannot be established.
     */
    public static function connectionFailure(): array
    {
        return ['connection' => false];
    }

    /**
     * A streamed turn that sends some text and then an error event instead of finishing.
     */
    public static function streamError(string $textBefore = '', string $message = 'Overloaded', string $type = 'overloaded_error'): array
    {
        return self::text($textBefore) + ['stream_error' => ['type' => $type, 'message' => $message]];
    }

    /**
     * The decoded JSON bodies the gateway sent, in order.
     *
     * @return list<array<string, mixed>>
     */
    public function requests(): array
    {
        return $this->requests;
    }

    /**
     * The URLs the gateway called, in order.
     *
     * @return list<string>
     */
    public function urls(): array
    {
        return $this->urls;
    }

    public function remaining(): int
    {
        return count($this->turns);
    }

    /**
     * @param  list<array<string, mixed>>  $content
     * @param  array<string, int>  $usage
     */
    protected static function turn(array $content, string $stopReason, array $usage, ?string $model): array
    {
        return [
            'content' => $content,
            'stop_reason' => $stopReason,
            'usage' => $usage + ['input_tokens' => 10, 'output_tokens' => 5],
            'model' => $model,
        ];
    }

    protected function respond(Request $request): mixed
    {
        $body = $request->data();

        $this->requests[] = $body;
        $this->urls[] = $request->url();

        $turn = array_shift($this->turns)
            ?? throw new RuntimeException('FakeAnthropic received a request with no scripted turn left.');

        if (array_key_exists('connection', $turn)) {
            throw new ConnectionException('Connection refused.');
        }

        if (isset($turn['status'])) {
            return Http::response($turn['body'], $turn['status']);
        }

        $turn['model'] ??= $body['model'];

        return ($body['stream'] ?? false)
            ? Http::response($this->serverSentEvents($turn), 200, ['Content-Type' => 'text/event-stream'])
            : Http::response([
                'id' => 'msg_test',
                'type' => 'message',
                'role' => 'assistant',
                'model' => $turn['model'],
                'content' => $turn['content'],
                'stop_reason' => $turn['stop_reason'],
                'usage' => $turn['usage'],
            ]);
    }

    /**
     * @param  array<string, mixed>  $turn
     */
    protected function serverSentEvents(array $turn): string
    {
        $usage = $turn['usage'];
        $outputTokens = $usage['output_tokens'];
        unset($usage['output_tokens']);

        $events = [[
            'type' => 'message_start',
            'message' => ['id' => 'msg_test', 'model' => $turn['model'], 'usage' => $usage + ['output_tokens' => 0]],
        ]];

        foreach ($turn['content'] as $index => $block) {
            if ($block['type'] === 'text') {
                $events[] = ['type' => 'content_block_start', 'index' => $index, 'content_block' => ['type' => 'text', 'text' => '']];

                foreach (explode(' ', $block['text']) as $position => $word) {
                    $events[] = ['type' => 'content_block_delta', 'index' => $index, 'delta' => [
                        'type' => 'text_delta', 'text' => $position > 0 ? ' '.$word : $word,
                    ]];
                }
            } else {
                $events[] = ['type' => 'content_block_start', 'index' => $index, 'content_block' => [
                    'type' => 'tool_use', 'id' => $block['id'], 'name' => $block['name'], 'input' => (object) [],
                ]];
                $events[] = ['type' => 'content_block_delta', 'index' => $index, 'delta' => [
                    'type' => 'input_json_delta', 'partial_json' => json_encode((object) $block['input']),
                ]];
            }

            $events[] = ['type' => 'content_block_stop', 'index' => $index];
        }

        if (isset($turn['stream_error'])) {
            $events[] = ['type' => 'error', 'error' => $turn['stream_error']];
        } else {
            $events[] = ['type' => 'message_delta', 'delta' => ['stop_reason' => $turn['stop_reason']], 'usage' => ['output_tokens' => $outputTokens]];
            $events[] = ['type' => 'message_stop'];
        }

        return implode('', array_map(
            fn (array $event): string => 'event: '.$event['type']."\ndata: ".json_encode($event)."\n\n",
            $events,
        ));
    }
}
