<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

/**
 * Made-up secrets, one for each place a run can carry one.
 */
final class Secrets
{
    public const PROMPT = 'sk-ant-api03-PromptSecret0123456789abcdefghij';

    public const PATTERN = 'sk-ant-api03-ToolArgSecret0123456789abcdefghij';

    public const KEYED = 'plain-value-under-a-secret-key';

    public const RESULT = 'sk-ant-api03-ResultSecret0123456789abcdefghij';

    public const SYSTEM = 'sk-ant-api03-SystemSecret0123456789abcdefghij';

    public const OUTPUT = 'sk-ant-api03-OutputSecret0123456789abcdefghij';

    public const ERROR = 'sk-ant-api03-ErrorSecret0123456789abcdefghij';

    public const APPROVAL = 'sk-ant-api03-ApprovalSecret0123456789abcdefghij';

    public const REASON = 'sk-ant-api03-ReasonSecret0123456789abcdefghij';
}
