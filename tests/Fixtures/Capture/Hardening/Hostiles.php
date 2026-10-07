<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Generator;
use Illuminate\Contracts\Support\Arrayable;
use JsonSerializable;
use RuntimeException;
use Stringable;

/**
 * Values a tool might hand back that are hard on a serializer.
 */
final class Hostiles
{
    /** A list of n short strings. */
    public static function wideList(int $n): array
    {
        return array_fill(0, $n, 'item');
    }

    /** A map of n distinct string keys. */
    public static function wideMap(int $n): array
    {
        $map = [];

        for ($i = 0; $i < $n; $i++) {
            $map["key-$i"] = "value $i";
        }

        return $map;
    }

    /** An array nested n levels deep, built iteratively so that building it cannot overflow. */
    public static function deep(int $levels): array
    {
        $value = ['leaf' => 'bottom'];

        for ($i = 0; $i < $levels; $i++) {
            $value = ['next' => $value];
        }

        return $value;
    }

    /** An array that contains a reference to itself. */
    public static function selfReferencing(): array
    {
        $array = ['name' => 'loop'];
        $array['self'] = &$array;

        return $array;
    }

    /** An array with two references to itself at every level, so the tree is exponentially large. */
    public static function exponential(): array
    {
        $array = ['name' => 'fan'];
        $array['left'] = &$array;
        $array['right'] = &$array;

        return $array;
    }

    /** How many times any hostile object was serialized. */
    public static int $serialized = 0;

    public static function object(string $behaviour): object
    {
        return new class($behaviour) implements JsonSerializable, Stringable
        {
            public function __construct(private readonly string $behaviour) {}

            public function jsonSerialize(): mixed
            {
                Hostiles::$serialized++;

                return match ($this->behaviour) {
                    'throws' => throw new RuntimeException('jsonSerialize failed'),
                    'throws error' => throw new \Error('jsonSerialize crashed'),
                    'itself' => $this,
                    'generator' => (function (): Generator {
                        yield 1;
                    })(),
                    'array of itself' => [$this, $this],
                    'fresh each time' => [new self($this->behaviour), new self($this->behaviour)],
                    'slow' => (function () {
                        usleep(300_000);

                        return 'slow';
                    })(),
                    default => 'fine',
                };
            }

            public function __toString(): string
            {
                return $this->behaviour === 'string throws' ? throw new RuntimeException('__toString failed') : 'as text';
            }
        };
    }

    public static function arrayable(string $behaviour): Arrayable
    {
        return new class($behaviour) implements Arrayable, Stringable
        {
            public function __construct(private readonly string $behaviour) {}

            public function toArray(): array
            {
                return match ($this->behaviour) {
                    'throws' => throw new RuntimeException('toArray failed'),
                    'itself' => ['again' => $this],
                    default => ['ok'],
                };
            }

            public function __toString(): string
            {
                return 'as text';
            }
        };
    }
}
