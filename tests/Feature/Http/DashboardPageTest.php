<?php

use Astro\Trail\Assets;
use Astro\Trail\Capture\Sampler;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Trail as TrailManager;
use Illuminate\Contracts\Cache\Factory as CacheFactory;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Vite;

/*
|--------------------------------------------------------------------------
| The dashboard page
|--------------------------------------------------------------------------
|
| Every dashboard URL gets one page: the built CSS and JavaScript inlined,
| and a window.Trail object to boot from. The package's own dist directory
| is used unless a test points Assets at a directory of its own.
|
*/

/** @param array<string, string> $files */
function distWith(array $files): string
{
    $directory = sys_get_temp_dir().'/trail-dist-'.bin2hex(random_bytes(4));
    File::makeDirectory($directory);
    $GLOBALS['trail_dist_directories'][] = $directory;

    foreach ($files as $name => $contents) {
        File::put($directory.'/'.$name, $contents);
    }

    app()->instance(Assets::class, new Assets($directory));

    return $directory;
}

afterEach(function () {
    foreach ($GLOBALS['trail_dist_directories'] ?? [] as $directory) {
        File::deleteDirectory($directory);
    }

    unset($GLOBALS['trail_dist_directories']);

    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

it('serves the page with the mount element, the theme script, the favicon and the title', function () {
    $this->app['env'] = 'local';
    config(['app.name' => 'Acme']);

    $response = $this->get('/trail')->assertOk();
    $html = $response->getContent();

    expect($response->headers->get('Content-Type'))->toStartWith('text/html')
        ->and($html)->toStartWith('<!DOCTYPE html>')
        ->and($html)->toContain('<div id="trail"></div>')
        ->and($html)->toContain('<title>Trail - Acme</title>')
        ->and($html)->toContain('<meta name="robots" content="noindex, nofollow">')
        ->and($html)->toContain('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg')
        ->and($html)->toContain("localStorage.getItem('trail-theme')")
        ->and($html)->toContain("document.documentElement.classList.toggle('dark', dark)")
        ->and($html)->toContain('<noscript>')
        ->and($html)->not->toContain(' nonce=');
});

it('falls back to a plain title without an app name', function () {
    $this->app['env'] = 'local';
    config(['app.name' => '']);

    $this->get('/trail')->assertOk()->assertSee('<title>Trail</title>', false);
});

it('inlines the built files as they are', function () {
    $this->app['env'] = 'local';
    $css = file_get_contents(__DIR__.'/../../../dist/app.css');
    $js = file_get_contents(__DIR__.'/../../../dist/app.js');

    $html = $this->get('/trail')->assertOk()->getContent();

    expect($html)->toContain('<style>'.$css.'</style>')
        ->and($html)->toContain('<script>')
        ->and($html)->toContain('<script type="module">window.Trail = ')
        ->and($html)->toContain("\n".$js.'</script>');
});

it('boots the dashboard from window.Trail', function () {
    $this->app['env'] = 'local';
    config(['app.name' => 'Acme', 'app.timezone' => 'Europe/Istanbul', 'trail.stale_after' => 120]);

    $html = $this->withSession(['_token' => 'session-token'])->get('/trail')->assertOk()->getContent();
    $boot = bootObject($html);

    expect($boot)->toHaveKeys(['path', 'apiPath', 'csrfToken', 'appName', 'environment', 'timezone', 'version', 'staleAfter', 'recording'])
        ->and($boot)->toHaveCount(9)
        ->and($boot['path'])->toBe('/trail')
        ->and($boot['apiPath'])->toBe('/trail/api')
        ->and($boot['csrfToken'])->toBe('session-token')
        ->and($boot['appName'])->toBe('Acme')
        ->and($boot['environment'])->toBe('local')
        ->and($boot['timezone'])->toBe('Europe/Istanbul')
        ->and($boot['staleAfter'])->toBe(120)
        ->and($boot['recording'])->toBe('enabled')
        ->and($boot['version'])->toBeString()->not->toBeEmpty();
});

it('gives every dashboard url the same page', function () {
    $this->app['env'] = 'local';

    $root = $this->withSession(['_token' => 'session-token'])->get('/trail')->assertOk()->getContent();

    foreach (['/trail/traces/abc', '/trail/a/b/c', '/trail/'] as $url) {
        expect($this->withSession(['_token' => 'session-token'])->get($url)->assertOk()->getContent())->toBe($root);
    }
});

it('writes the path the dashboard is served at into the boot object', function (string $path, string $expected) {
    $this->app['env'] = 'local';
    config(['trail.path' => $path]);

    expect(app(TrailManager::class)->scriptVariables())->toMatchArray(['path' => $expected, 'apiPath' => $expected.'/api']);
})->with([
    ['', '/trail'],
    ['/', '/trail'],
    ['trail', '/trail'],
    ['/ai/trail/', '/ai/trail'],
]);

it('is hostile-value safe: nothing from the configuration reaches the page unescaped', function () {
    $this->app['env'] = 'local';
    Trail::auth(fn (Request $request) => true);
    $this->app['env'] = 'x</script><script>alert(1)</script>"\'<';
    $name = '</script><script>alert(1)</script> "quoted" \'single\' & <b>';
    config(['app.name' => $name]);

    $html = $this->get('/trail')->assertOk()->getContent();

    expect($html)->not->toContain('<script>alert(1)</script>')
        ->and($html)->not->toContain('alert(1)</script>')
        ->and($html)->not->toContain('<b>')
        ->and($html)->toContain('<title>Trail - &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot; &#039;single&#039; &amp; &lt;b&gt;</title>');

    $boot = bootObject($html);

    expect($boot['appName'])->toBe($name)
        ->and($boot['environment'])->toBe('x</script><script>alert(1)</script>"\'<');
    // Only the theme script and the module script close: nothing injected closed one early.
    expect(substr_count(strtolower($html), '</script'))->toBe(2);
});

it('keeps a bundle from closing its own tags', function () {
    $this->app['env'] = 'local';
    distWith([
        'app.css' => ".a::after{content:'</STYLE><b>'}\n",
        'app.js' => "var x = '</script><script>alert(2)</script>';\nvar y = '</SCRIPT >';\n",
    ]);

    $html = $this->get('/trail')->assertOk()->getContent();

    expect($html)->toContain("content:'<\\/STYLE")
        ->and($html)->toContain("var x = '<\\/script><script>alert(2)<\\/script>';\nvar y = '<\\/SCRIPT >';\n")
        ->and(substr_count(strtolower($html), '</script'))->toBe(2)
        ->and(substr_count(strtolower($html), '</style'))->toBe(1);
});

it('keeps a bundle from swallowing the closing tag of its script', function (string $bundle) {
    $this->app['env'] = 'local';
    distWith(['app.css' => '/* built */', 'app.js' => $bundle]);

    $html = $this->get('/trail')->assertOk()->getContent();
    $start = strpos($html, '<script type="module">');
    $module = substr($html, $start);

    expect($start)->not->toBeFalse()
        ->and(substr_count(strtolower($module), '</script'))->toBe(1)
        ->and(strtolower($module))->toContain("</script>\n</body>")
        ->and($module)->not->toContain('<!--')
        // The module is the last script element: nothing opens a script after its closing tag.
        ->and(strtolower(substr($module, strpos(strtolower($module), '</script') + 1)))->not->toContain('<script');
})->with([
    'a comment opener before a script tag' => ["var a = '<!--<script>';\nvar b = 1;\n"],
    'an upper-case closing tag' => ["var a = '</SCRIPT>';\n"],
]);

it('applies the content security policy nonce to every inline tag', function () {
    $this->app['env'] = 'local';
    Vite::useCspNonce('abc123');

    $html = $this->get('/trail')->assertOk()->getContent();

    expect($html)->toContain('<style nonce="abc123">')
        ->and($html)->toContain('<script type="module" nonce="abc123">')
        ->and($html)->toContain('<script nonce="abc123">')
        ->and(substr_count($html, ' nonce="abc123"'))->toBe(3);
});

it('escapes a nonce', function () {
    $this->app['env'] = 'local';
    Vite::useCspNonce('a"b<c');

    $html = $this->get('/trail')->assertOk()->getContent();

    expect($html)->toContain('<style nonce="a&quot;b&lt;c">')
        ->and($html)->toContain('<script type="module" nonce="a&quot;b&lt;c">')
        ->and($html)->not->toContain('nonce="a"b');
});

it('names the missing file and how to fix it', function (string $present, string $missing) {
    $this->app['env'] = 'local';
    $this->withoutExceptionHandling();
    distWith([$present => '/* built */']);

    try {
        $this->get('/trail');
    } catch (Throwable $e) {
    }

    expect($e ?? null)->toBeInstanceOf(RuntimeException::class)
        ->and($e->getMessage())->toBe("Unable to load the Trail dashboard file dist/{$missing}: it is missing. Run \"npm run build\" in the package.");
})->with([
    'css' => ['app.js', 'app.css'],
    'js' => ['app.css', 'app.js'],
]);

it('reports whether recording is paused', function () {
    $this->app['env'] = 'local';

    expect(bootObject($this->get('/trail')->getContent())['recording'])->toBe('enabled');

    Cache::forever(Sampler::PAUSE_KEY, true);

    expect(bootObject($this->get('/trail')->getContent())['recording'])->toBe('paused');

    Cache::forget(Sampler::PAUSE_KEY);

    expect(bootObject($this->get('/trail')->getContent())['recording'])->toBe('enabled');
});

it('reports disabled recording when Trail is switched off', function () {
    config(['trail.enabled' => false]);

    expect(app(TrailManager::class)->scriptVariables()['recording'])->toBe('disabled');
});

it('does not guess when the pause flag cannot be read, and still serves the page', function () {
    $this->app['env'] = 'local';
    Exceptions::fake();
    $store = Mockery::mock(CacheRepository::class);
    $store->shouldReceive('get')->andThrow(new RuntimeException('cache is down'));
    $factory = Mockery::mock(CacheFactory::class);
    $factory->shouldReceive('store')->andReturn($store);
    $this->app->instance(CacheFactory::class, $factory);

    $response = $this->get('/trail')->assertOk();

    expect(bootObject($response->getContent())['recording'])->toBeNull();

    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'cache is down');
});

it('does not serve the page, or either asset, to a denied request', function (string $url) {
    $this->app['env'] = 'production';

    $content = $this->get($url)->assertForbidden()->getContent();

    expect($content)->not->toContain(file_get_contents(__DIR__.'/../../../dist/app.js'))
        ->and($content)->not->toContain(file_get_contents(__DIR__.'/../../../dist/app.css'))
        ->and($content)->not->toContain('window.Trail');
})->with(['/trail', '/trail/traces/abc/spans/def']);
