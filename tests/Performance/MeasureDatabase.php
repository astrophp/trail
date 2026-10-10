<?php

namespace Astro\Trail\Tests\Performance;

use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;

/**
 * The throwaway databases a measurement runs on: how to reach them, build the package's tables in
 * them, analyse them, size their indexes and read a query's plan. Nothing here is for real data.
 */
final class MeasureDatabase
{
    /** The seconds a read may run before the database gives up on it. */
    public const TIMEOUT_SECONDS = 300;

    /**
     * Configure the connection for a driver and return its name; it is also made the default.
     */
    public static function connect(string $driver): string
    {
        $name = "measure_{$driver}";
        $env = fn (string $key, string $default): string => is_string($value = getenv($key)) && $value !== '' ? $value : $default;

        $connection = match ($driver) {
            'sqlite' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
            'mysql' => [
                'driver' => 'mysql', 'host' => $env('TRAIL_MEASURE_HOST', '127.0.0.1'), 'port' => $env('TRAIL_MEASURE_MYSQL_PORT', '33306'),
                'database' => 'trail', 'username' => 'root', 'password' => $env('TRAIL_MEASURE_PASSWORD', 'password'),
                'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'prefix' => '', 'strict' => true,
            ],
            'pgsql' => [
                'driver' => 'pgsql', 'host' => $env('TRAIL_MEASURE_HOST', '127.0.0.1'), 'port' => $env('TRAIL_MEASURE_PGSQL_PORT', '35432'),
                'database' => 'trail', 'username' => 'postgres', 'password' => $env('TRAIL_MEASURE_PASSWORD', 'password'),
                'charset' => 'utf8', 'prefix' => '', 'search_path' => 'public', 'sslmode' => 'prefer',
            ],
            default => throw new \InvalidArgumentException("Unknown database {$driver}."),
        };

        config(["database.connections.{$name}" => $connection, 'trail.storage.connection' => $name, 'database.default' => $name]);
        DB::purge($name);

        return $name;
    }

    /**
     * The package's own migrations, dropped first so that a rerun starts clean.
     */
    public static function migrate(string $name): void
    {
        $files = glob(dirname(__DIR__, 2).'/database/migrations/*.php') ?: [];
        sort($files);

        foreach (array_reverse($files) as $file) {
            (require $file)->down();
        }

        foreach ($files as $file) {
            (require $file)->up();
        }
    }

    /**
     * Stop a read that runs for longer than the timeout.
     */
    public static function limit(Connection $db, string $driver): void
    {
        match ($driver) {
            'mysql' => $db->statement('set session max_execution_time = '.(self::TIMEOUT_SECONDS * 1000)),
            'pgsql' => $db->statement('set statement_timeout = '.(self::TIMEOUT_SECONDS * 1000)),
            default => null,
        };
    }

    /**
     * @param  list<string>  $tables
     */
    public static function analyse(Connection $db, string $driver, array $tables = ['trail_traces', 'trail_spans']): void
    {
        foreach ($tables as $table) {
            match ($driver) {
                'mysql' => $db->select("analyze table {$table}"),
                'pgsql' => $db->statement("analyze {$table}"),
                default => null,
            };
        }
    }

    /**
     * The size on disk of each index of the two tables, the primary key included, and of the
     * table's rows without its secondary indexes under "(rows)".
     *
     * @param  list<string>  $tables
     * @return array<string, int> "table.index" => bytes
     */
    public static function sizes(Connection $db, string $driver, array $tables = ['trail_traces', 'trail_spans']): array
    {
        $sizes = [];
        $list = "'".implode("', '", $tables)."'";

        if ($driver === 'mysql') {
            self::analyse($db, $driver, $tables);

            foreach ($db->select("select table_name as t, index_name as i, stat_value * @@innodb_page_size as bytes from mysql.innodb_index_stats where database_name = database() and table_name in ({$list}) and stat_name = 'size'") as $row) {
                $sizes["{$row->t}.".(in_array($row->i, ['PRIMARY', 'GEN_CLUST_INDEX'], true) ? '(rows)' : $row->i)] = (int) $row->bytes;
            }
        }

        if ($driver === 'pgsql') {
            foreach ($db->select("select c.relname as t, 'rows' as i, pg_relation_size(c.oid) as bytes from pg_class c where c.relname in ({$list}) union all select t.relname, i.relname, pg_relation_size(i.oid) from pg_index x join pg_class t on t.oid = x.indrelid join pg_class i on i.oid = x.indexrelid where t.relname in ({$list})") as $row) {
                $sizes["{$row->t}.".($row->i === 'rows' ? '(rows)' : $row->i)] = (int) $row->bytes;
            }
        }

        ksort($sizes);

        return $sizes;
    }

    /**
     * The plan of a query as the database runs it, cut short, with the indexes it names.
     *
     * @param  list<mixed>  $bindings
     */
    public static function plan(Connection $db, string $driver, string $sql, array $bindings): string
    {
        try {
            $statement = $db->getQueryGrammar()->substituteBindingsIntoRawSql($sql, $bindings);
            $lines = [];

            foreach ($db->select(($driver === 'pgsql' ? 'explain (analyze, buffers) ' : 'explain analyze ').$statement) as $row) {
                foreach (explode("\n", (string) array_values((array) $row)[0]) as $line) {
                    $lines[] = mb_strlen($line) > 200 ? mb_substr($line, 0, 200).' ...' : $line;
                }
            }
        } catch (\Throwable $exception) {
            return 'The plan could not be read: '.mb_substr($exception->getMessage(), 0, 200);
        }

        preg_match_all('/\b(trail_\w+_(?:index|pkey)|hyp_\w+|PRIMARY)\b/', implode("\n", $lines), $matches);
        $indexes = array_values(array_unique($matches[1]));

        return implode("\n", array_slice($lines, 0, 30))."\n-- index used: ".($indexes === [] ? 'none (full scan)' : implode(', ', $indexes));
    }
}
