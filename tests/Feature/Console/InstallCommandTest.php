<?php

use Astro\Trail\TrailApplicationServiceProvider;
use Illuminate\Foundation\Auth\User;
use Illuminate\Support\Facades\Gate;

const TRAIL_PROVIDER = 'App\Providers\TrailServiceProvider';

function trailInstalledPaths(): array
{
    return [config_path('trail.php'), app_path('Providers/TrailServiceProvider.php')];
}

beforeEach(function () {
    $this->providersFile = app()->getBootstrapProvidersPath();
    $this->providersBefore = file_get_contents($this->providersFile);

    foreach (trailInstalledPaths() as $path) {
        expect($path)->not->toBeFile();
    }
});

afterEach(function () {
    file_put_contents($this->providersFile, $this->providersBefore);

    foreach (trailInstalledPaths() as $path) {
        if (is_file($path)) {
            unlink($path);
        }
    }
});

it('publishes the config and the provider stub and registers the provider', function () {
    $this->artisan('trail:install')->assertSuccessful();

    expect(file_get_contents(config_path('trail.php')))->toBe(file_get_contents(dirname(__DIR__, 3).'/config/trail.php'));

    $provider = file_get_contents(app_path('Providers/TrailServiceProvider.php'));

    expect($provider)
        ->toContain('namespace App\Providers;')
        ->toContain('class TrailServiceProvider extends TrailApplicationServiceProvider')
        ->toContain('use Astro\Trail\TrailApplicationServiceProvider;')
        ->toContain('protected function gate(): void')
        ->toContain("Gate::define('viewTrail'")
        ->toContain('in_array($user->email, [');

    expect(file_get_contents($this->providersFile))
        ->toContain('    '.TRAIL_PROVIDER.'::class,')
        ->and(substr_count(file_get_contents($this->providersFile), 'TrailServiceProvider'))->toBe(1);
});

it('publishes a provider that extends the base class and denies everyone', function () {
    $this->artisan('trail:install')->assertSuccessful();

    require_once app_path('Providers/TrailServiceProvider.php');

    $provider = new (TRAIL_PROVIDER)(app());
    expect($provider)->toBeInstanceOf(TrailApplicationServiceProvider::class);

    $provider->boot();

    $user = new User;
    $user->email = 'someone@example.com';

    expect(Gate::has('viewTrail'))->toBeTrue()
        ->and(Gate::forUser($user)->allows('viewTrail'))->toBeFalse();
});

it('does not duplicate or overwrite anything when run twice', function () {
    $this->artisan('trail:install')->assertSuccessful();

    file_put_contents(config_path('trail.php'), "<?php\n\nreturn ['edited' => true];\n");
    $providersAfterFirst = file_get_contents($this->providersFile);
    $stubAfterFirst = file_get_contents(app_path('Providers/TrailServiceProvider.php'));

    $this->artisan('trail:install')->assertSuccessful();

    expect(file_get_contents(config_path('trail.php')))->toBe("<?php\n\nreturn ['edited' => true];\n")
        ->and(file_get_contents(app_path('Providers/TrailServiceProvider.php')))->toBe($stubAfterFirst)
        ->and(file_get_contents($this->providersFile))->toBe($providersAfterFirst)
        ->and(substr_count($providersAfterFirst, 'TrailServiceProvider'))->toBe(1);
});

it('overwrites the published files with --force and still registers once', function () {
    $this->artisan('trail:install')->assertSuccessful();

    file_put_contents(config_path('trail.php'), "<?php\n\nreturn [];\n");

    $this->artisan('trail:install', ['--force' => true])->assertSuccessful();

    expect(file_get_contents(config_path('trail.php')))->toBe(file_get_contents(dirname(__DIR__, 3).'/config/trail.php'))
        ->and(substr_count(file_get_contents($this->providersFile), 'TrailServiceProvider'))->toBe(1);
});

it('keeps the providers already registered', function () {
    file_put_contents($this->providersFile, "<?php\n\nreturn [\n    App\\Providers\\AppServiceProvider::class,\n];\n");

    $this->artisan('trail:install')->assertSuccessful();

    $contents = file_get_contents($this->providersFile);

    expect($contents)
        ->toContain('App\Providers\AppServiceProvider::class,')
        ->toContain(TRAIL_PROVIDER.'::class,');
});
