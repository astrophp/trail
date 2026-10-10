<?php

use Astro\Trail\Http\Resources\Timestamp;
use Illuminate\Support\Carbon;

it('writes a moment in UTC with milliseconds', function () {
    $moment = Carbon::parse('2026-01-01 15:00:00.123456', 'Europe/Istanbul');

    expect(Timestamp::format($moment))->toBe('2026-01-01T12:00:00.123Z')
        ->and(Timestamp::format($moment->toImmutable()))->toBe('2026-01-01T12:00:00.123Z');
});

it('keeps null as null', function () {
    expect(Timestamp::format(null))->toBeNull();
});
