<?php

namespace Workbench\App\Scenarios;

enum Outcome: string
{
    case Ok = 'ok';
    case FailedAsExpected = 'failed as expected';
    case Error = 'error';

    public function isGood(): bool
    {
        return $this !== self::Error;
    }
}
