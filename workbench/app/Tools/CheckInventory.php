<?php

namespace Workbench\App\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Reports how many of a product are in stock.
 */
class CheckInventory implements Tool
{
    /** @var array<string, int> */
    private const STOCK = ['ridgeline rain shell' => 14, 'alpine 40l backpack' => 3, 'summit trekking poles' => 0];

    public function name(): string
    {
        return 'check_inventory';
    }

    public function description(): Stringable|string
    {
        return 'Check how many units of a product are in stock.';
    }

    public function handle(Request $request): Stringable|string
    {
        $product = strtolower(trim((string) $request['product']));

        return array_key_exists($product, self::STOCK)
            ? "{$request['product']}: ".self::STOCK[$product].' in stock.'
            : "{$request['product']}: not in the catalogue.";
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'product' => $schema->string()->description('The product name.')->required(),
        ];
    }
}
