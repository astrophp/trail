<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Sdk\ObservesSdk;
use Astro\Trail\Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(TestCase::class)->in('Feature');
// These tests run real agents without a refreshed database; Trail records into memory so it never writes to a persistent one.
uses(ObservesSdk::class)->beforeEach(fn () => Trail::fake())->in('Feature/Sdk');
uses(ObservesSdk::class, RefreshDatabase::class)->in('Feature/Capture');
