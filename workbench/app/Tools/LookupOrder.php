<?php

namespace Workbench\App\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Reads an order from a small built-in catalogue, so the workbench needs no shop database.
 */
class LookupOrder implements Tool
{
    /** @var array<string, array<string, mixed>> */
    private const ORDERS = [
        'NW-10482' => ['status' => 'shipped', 'items' => ['Alpine 40L backpack', 'Trail socks (2 pairs)'], 'total' => 142.50, 'tracking' => '1Z999AA10123456784'],
        'NW-10517' => ['status' => 'processing', 'items' => ['Ridgeline rain shell'], 'total' => 189.00, 'tracking' => null],
        'NW-10533' => ['status' => 'delivered', 'items' => ['Summit trekking poles'], 'total' => 96.00, 'tracking' => '1Z999AA10123456791'],
    ];

    public function name(): string
    {
        return 'lookup_order';
    }

    public function description(): Stringable|string
    {
        return 'Look up an order by its number and return its status, items and total.';
    }

    public function handle(Request $request): Stringable|string
    {
        $number = strtoupper((string) $request['order_number']);

        $order = self::ORDERS[$number] ?? null;

        return $order === null
            ? "No order found with number {$number}."
            : (string) json_encode(['order_number' => $number] + $order);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'order_number' => $schema->string()->description('The order number, for example NW-10482.')->required(),
        ];
    }
}
