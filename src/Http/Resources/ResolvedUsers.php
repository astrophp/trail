<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Facades\Trail;
use Astro\Trail\Users\UserResolver;

/**
 * The users of a page of results, resolved together so the page costs one lookup however many
 * runs it holds.
 */
final readonly class ResolvedUsers
{
    /**
     * @param  array<string, array{name: ?string, email: ?string}|null>  $resolved  keyed by UserResolver::key()
     */
    private function __construct(private array $resolved) {}

    /**
     * @param  iterable<array{0: ?string, 1: ?string}>  $pairs  (type, id) of each run; a run without a user has nulls
     */
    public static function of(iterable $pairs): self
    {
        $users = [];

        foreach ($pairs as [$type, $id]) {
            if ($type !== null && $id !== null) {
                $users[] = ['type' => $type, 'id' => $id];
            }
        }

        return new self(Trail::users()->resolve($users));
    }

    /**
     * @return array{id: string, type: string, name: ?string, email: ?string}|null
     */
    public function get(?string $type, ?string $id): ?array
    {
        if ($type === null || $id === null) {
            return null;
        }

        $user = $this->resolved[UserResolver::key($type, $id)] ?? null;

        return ['id' => $id, 'type' => $type, 'name' => $user['name'] ?? null, 'email' => $user['email'] ?? null];
    }
}
