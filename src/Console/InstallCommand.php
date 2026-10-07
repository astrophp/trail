<?php

namespace Astro\Trail\Console;

use Illuminate\Console\Command;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'trail:install')]
class InstallCommand extends Command
{
    protected $signature = 'trail:install {--force : Overwrite the published config and provider}';

    protected $description = 'Install Trail\'s config and service provider';

    public function handle(): int
    {
        $force = (bool) $this->option('force');

        $this->components->info('Publishing Trail\'s config and service provider.');

        $this->callSilent('vendor:publish', ['--tag' => 'trail-config', '--force' => $force]);
        $this->callSilent('vendor:publish', ['--tag' => 'trail-provider', '--force' => $force]);

        $this->useApplicationNamespace();

        if (! $this->registerProvider()) {
            $this->components->warn('Could not register the provider. Add '.$this->providerClass().'::class to your bootstrap/providers.php.');
        }

        $this->components->info('Trail is installed. Run `php artisan migrate` to create its tables.');

        return self::SUCCESS;
    }

    private function providerClass(): string
    {
        return $this->laravel->getNamespace().'Providers\\TrailServiceProvider';
    }

    private function useApplicationNamespace(): void
    {
        $path = app_path('Providers/TrailServiceProvider.php');

        if (! is_file($path)) {
            return;
        }

        $contents = (string) file_get_contents($path);
        $replaced = str_replace('namespace App\Providers;', 'namespace '.$this->laravel->getNamespace().'Providers;', $contents);

        if ($replaced !== $contents) {
            file_put_contents($path, $replaced);
        }
    }

    private function registerProvider(): bool
    {
        return ServiceProvider::addProviderToBootstrapFile($this->providerClass(), $this->laravel->getBootstrapProvidersPath());
    }
}
