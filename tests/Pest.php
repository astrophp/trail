<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Sdk\DisablesTrail;
use Astro\Trail\Tests\Fixtures\Sdk\MigratesApplicationTables;
use Astro\Trail\Tests\Fixtures\Sdk\MigratesLaravelTables;
use Astro\Trail\Tests\Fixtures\Sdk\MigratesSdkTables;
use Astro\Trail\Tests\Fixtures\Sdk\ObservesSdk;
use Astro\Trail\Tests\Fixtures\Workbench\BootsWorkbench;
use Astro\Trail\Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(TestCase::class)->in('Feature');
// These tests run real agents without a refreshed database; Trail records into memory so it never writes to a persistent one.
uses(ObservesSdk::class)->beforeEach(fn () => Trail::fake())->in('Feature/Sdk');
uses(ObservesSdk::class, RefreshDatabase::class)->in('Feature/Capture');
uses(MigratesSdkTables::class)->in('Feature/Capture/ApprovalCaptureTest.php', 'Feature/Capture/ConversationCaptureTest.php', 'Feature/Capture/RecordingControlsTest.php');
uses(MigratesApplicationTables::class)->in('Feature/Capture/Hardening/HostilePayloadTest.php');
uses(DisablesTrail::class)->in('Feature/Capture/MasterSwitchTest.php');
uses(MigratesLaravelTables::class)->in('Feature/Users');
uses(RefreshDatabase::class)->in('Feature/Users');
uses(RefreshDatabase::class)->in('Feature/Http/Api', 'Feature/Queries');
uses(MigratesLaravelTables::class, RefreshDatabase::class)->in('Feature/Http/Resources/ResolvedUsersTest.php');
uses(MigratesLaravelTables::class)->in('Feature/Http/Api/ContractTest.php', 'Feature/Http/Api/TraceBookmarkTest.php', 'Feature/Http/Api/TraceIndexTest.php', 'Feature/Http/Api/TraceResourceTest.php');
uses(BootsWorkbench::class, RefreshDatabase::class)->in('Feature/Workbench');

/** The window.Trail object of a page, decoded the way the browser decodes it. */
function bootObject(string $html): array
{
    expect(preg_match("/window\\.Trail = JSON\\.parse\\('(.*?)'\\);\n/s", $html, $match))->toBe(1);

    return json_decode(json_decode('"'.$match[1].'"', flags: JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
}
