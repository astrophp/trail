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
    case Image = 'image';
    case Audio = 'audio';
    case Transcription = 'transcription';

    /**
     * What a trace can be: every type but a step and a tool, which only ever run inside an agent.
     *
     * @return list<self>
     */
    public static function operations(): array
    {
        return [self::Agent, self::Embedding, self::Classification, self::Reranking, self::Image, self::Audio, self::Transcription];
    }

    /** @return list<string> */
    public static function operationValues(): array
    {
        return array_map(fn (self $type): string => $type->value, self::operations());
    }

    /** @return list<self> */
    public static function billable(): array
    {
        return [self::Step, self::Embedding, self::Classification, self::Reranking, self::Image, self::Audio, self::Transcription];
    }
}
