<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Trail Master Switch
    |--------------------------------------------------------------------------
    |
    | When disabled, Trail records nothing and registers no dashboard routes.
    | Only its artisan commands remain available.
    |
    */

    'enabled' => (bool) env('TRAIL_ENABLED', true),

    /*
    |--------------------------------------------------------------------------
    | Trail Storage
    |--------------------------------------------------------------------------
    |
    | The database connection Trail's tables live on. Null uses the
    | application's default connection.
    |
    */

    'storage' => [
        'connection' => env('TRAIL_DB_CONNECTION'),
    ],

];
