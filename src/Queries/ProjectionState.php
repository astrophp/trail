<?php

namespace Astro\Trail\Queries;

/**
 * Whether a range has a projection, and if not, why.
 */
enum ProjectionState: string
{
    case Projected = 'projected';
    case NotEnoughHistory = 'not_enough_history';
    case RangeNotCurrent = 'range_not_current';
}
