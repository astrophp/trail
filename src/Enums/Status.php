<?php

namespace Astro\Trail\Enums;

enum Status: string
{
    case Running = 'running';
    case Completed = 'completed';
    case Failed = 'failed';
    case Incomplete = 'incomplete';
    case AwaitingApproval = 'awaiting_approval';

    public function isFinal(): bool
    {
        return $this !== self::Running;
    }
}
