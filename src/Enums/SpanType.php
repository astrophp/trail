<?php

namespace Astro\Trail\Enums;

enum SpanType: string
{
    case Agent = 'agent';
    case Step = 'step';
    case Tool = 'tool';
    case Embedding = 'embedding';
}
