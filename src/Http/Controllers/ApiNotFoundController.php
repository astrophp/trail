<?php

namespace Astro\Trail\Http\Controllers;

use Illuminate\Http\JsonResponse;

class ApiNotFoundController
{
    public function __invoke(): JsonResponse
    {
        return new JsonResponse(['message' => 'Not Found.'], 404);
    }
}
