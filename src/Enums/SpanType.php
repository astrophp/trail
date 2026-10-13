<?php

namespace Astro\Trail\Enums;

enum SpanType: string
{
    case Agent = 'agent';
    case Step = 'step';
    case Tool = 'tool';
    case Embedding = 'embedding';
    case Classification = 'classification';
    case Reranking = 'reranking';

    /** @return list<self> */
    public static function billable(): array
    {
        return [self::Step, self::Embedding, self::Classification, self::Reranking];
    }
}
