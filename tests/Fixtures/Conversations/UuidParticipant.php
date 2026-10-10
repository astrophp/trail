<?php

namespace Astro\Trail\Tests\Fixtures\Conversations;

/**
 * A participant whose key is a string, as a model keyed by uuid has.
 */
class UuidParticipant
{
    public function __construct(public string $id = '0198c2a4-7b1e-7c3a-9d52-3f6a1e8b4c70') {}
}
