<?php

namespace Astro\Trail\Enums;

enum ErrorSource: string
{
    case Step = 'step';
    case Tool = 'tool';
    case Run = 'run';
}
