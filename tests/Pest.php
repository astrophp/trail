<?php

use Astro\Trail\Tests\Fixtures\Sdk\ObservesSdk;
use Astro\Trail\Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(TestCase::class)->in('Feature');
uses(ObservesSdk::class)->in('Feature/Sdk');
uses(ObservesSdk::class, RefreshDatabase::class)->in('Feature/Capture');
