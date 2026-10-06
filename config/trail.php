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

];
