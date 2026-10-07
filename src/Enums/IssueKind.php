<?php

namespace Astro\Trail\Enums;

enum IssueKind: string
{
    case RateLimited = 'rate_limited';
    case ProviderOverloaded = 'provider_overloaded';
    case ProviderConnection = 'provider_connection';
    case InsufficientCredits = 'insufficient_credits';
    case ToolError = 'tool_error';
    case Exception = 'exception';
    case Abandoned = 'abandoned';
}
