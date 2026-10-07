<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Sdk\DisablesTrail;
use Astro\Trail\Tests\Fixtures\Sdk\MigratesLaravelTables;
use Astro\Trail\Tests\Fixtures\Sdk\MigratesSdkTables;
use Astro\Trail\Tests\Fixtures\Sdk\ObservesSdk;
use Astro\Trail\Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(TestCase::class)->in('Feature');
// These tests run real agents without a refreshed database; Trail records into memory so it never writes to a persistent one.
uses(ObservesSdk::class)->beforeEach(fn () => Trail::fake())->in('Feature/Sdk');
uses(ObservesSdk::class, RefreshDatabase::class)->in('Feature/Capture');
uses(MigratesSdkTables::class)->in('Feature/Capture/ApprovalCaptureTest.php', 'Feature/Capture/ConversationCaptureTest.php', 'Feature/Capture/RecordingControlsTest.php');
uses(DisablesTrail::class)->in('Feature/Capture/MasterSwitchTest.php');
uses(MigratesLaravelTables::class)->in('Feature/Users');
uses(RefreshDatabase::class)->in('Feature/Users');
