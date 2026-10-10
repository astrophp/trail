<?php

namespace Astro\Trail\Users;

use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Throwable;

/**
 * Turns the users a trace belongs to, stored as a type and an id, into something a person can read.
 *
 * By default each type is mapped to an Eloquent model (through the morph map first, then as a
 * class name) and read with one query per model. An application whose users live elsewhere
 * replaces that with a callback.
 *
 * The callback receives the unresolved users grouped by type, as `array<string, list<string>>`
 * (type => ids), and returns `array<string, array<string, array{name?: ?string, email?: ?string}|null>>`
 * (type => id => user, or null for a user it cannot resolve). Whatever it returns is checked:
 * anything malformed resolves to null.
 *
 * Resolving never throws. A user that cannot be resolved is null, and the error behind it is reported.
 */
class UserResolver
{
    /**
     * @param  (Closure(array<string, list<string>>): mixed)|null  $callback
     */
    public function __construct(private readonly ?Closure $callback = null) {}

    /**
     * The key a pair is found under in the result of resolve(). Length-prefixed, so it is defined
     * for any bytes (an id need not be UTF-8) and two different pairs never share one.
     */
    public static function key(string $type, string $id): string
    {
        return strlen($type).':'.$type.strlen($id).':'.$id;
    }

    /**
     * @param  iterable<array{id: string|int, type: string}>  $pairs
     * @return array<string, array{name: ?string, email: ?string}|null> keyed by key()
     */
    public function resolve(iterable $pairs): array
    {
        $grouped = [];
        $resolved = [];

        foreach ($pairs as $pair) {
            $type = $pair['type'];
            $id = (string) $pair['id'];
            $key = self::key($type, $id);

            if (array_key_exists($key, $resolved)) {
                continue;
            }

            $resolved[$key] = null;
            $grouped[$type][] = $id;
        }

        if ($grouped === []) {
            return $resolved;
        }

        try {
            $found = $this->callback !== null ? $this->custom($grouped, $this->callback) : $this->models($grouped);
        } catch (Throwable $e) {
            report($e);

            return $resolved;
        }

        foreach ($found as $type => $users) {
            foreach ($users as $id => $user) {
                $key = self::key((string) $type, (string) $id);

                if (array_key_exists($key, $resolved)) {
                    $resolved[$key] = $user;
                }
            }
        }

        return $resolved;
    }

    /**
     * @param  array<string, list<string>>  $grouped
     * @param  Closure(array<string, list<string>>): mixed  $callback
     * @return array<string, array<string, array{name: ?string, email: ?string}|null>>
     */
    private function custom(array $grouped, Closure $callback): array
    {
        $returned = $callback($grouped);
        $checked = [];

        if (! is_array($returned)) {
            return $checked;
        }

        foreach ($returned as $type => $users) {
            if (! is_array($users)) {
                continue;
            }

            foreach ($users as $id => $user) {
                $checked[(string) $type][(string) $id] = $this->checked($user);
            }
        }

        return $checked;
    }

    /**
     * @return array{name: ?string, email: ?string}|null
     */
    private function checked(mixed $user): ?array
    {
        if (! is_array($user)) {
            return null;
        }

        $name = $user['name'] ?? null;
        $email = $user['email'] ?? null;

        if (($name !== null && ! is_string($name)) || ($email !== null && ! is_string($email))) {
            return null;
        }

        return ['name' => $name, 'email' => $email];
    }

    /**
     * @param  array<string, list<string>>  $grouped
     * @return array<string, array<string, array{name: ?string, email: ?string}|null>>
     */
    private function models(array $grouped): array
    {
        $found = [];

        foreach ($grouped as $type => $ids) {
            $model = $this->modelFor($type);

            if ($model === null) {
                continue;
            }

            try {
                foreach ($this->read($model, $ids) as $user) {
                    $key = $user->getKey();

                    if (! is_string($key) && ! is_int($key)) {
                        continue;
                    }

                    $found[$type][(string) $key] = [
                        'name' => $this->attribute($user, 'name'),
                        'email' => $this->attribute($user, 'email'),
                    ];
                }
            } catch (Throwable $e) {
                // An unreadable table loses these users, not the others.
                report($e);
            }
        }

        return $found;
    }

    /**
     * One query for the model's users, whatever the model would hide or load by default: a stored
     * id names its user even when they were soft-deleted or fall outside a global scope, and eager
     * loads or counts would add queries that can fail. Inside an application transaction it runs in a savepoint,
     * since on Postgres a failed statement would otherwise abort the application's transaction.
     *
     * @param  class-string<Model>  $model
     * @param  list<string>  $ids
     * @return iterable<Model>
     */
    private function read(string $model, array $ids): iterable
    {
        $query = (new $model)->newModelQuery();
        $connection = $query->getConnection();

        if ($connection->transactionLevel() === 0) {
            return $query->whereKey($ids)->get();
        }

        return $connection->transaction(fn () => $query->whereKey($ids)->get());
    }

    /**
     * @return class-string<Model>|null
     */
    private function modelFor(string $type): ?string
    {
        $mapped = Relation::getMorphedModel($type);

        if (is_string($mapped) && is_subclass_of($mapped, Model::class)) {
            return $mapped;
        }

        return class_exists($type) && is_subclass_of($type, Model::class) ? $type : null;
    }

    private function attribute(Model $user, string $name): ?string
    {
        $value = $user->getAttributes()[$name] ?? null;

        return is_string($value) || is_int($value) ? (string) $value : null;
    }
}
