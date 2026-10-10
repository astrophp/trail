<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

use Closure;
use Illuminate\Support\Facades\DB;

/**
 * Runs a test body with no transaction open on the default connection. RefreshDatabase wraps every
 * test in one, which is what Trail's code sees as "inside the application's transaction".
 */
final class Transactions
{
    public static function outside(Closure $test): void
    {
        $db = DB::connection();
        $level = $db->transactionLevel();

        $db->rollBack(0);

        try {
            $test();
        } finally {
            // Nothing the body wrote was rolled back with the wrapper, so it is removed by hand.
            DB::table('trail_spans')->delete();
            DB::table('trail_traces')->delete();
            DB::table('trail_trace_models')->delete();
            DB::table('trail_trace_tools')->delete();

            while ($db->transactionLevel() < $level) {
                $db->beginTransaction();
            }
        }
    }
}
