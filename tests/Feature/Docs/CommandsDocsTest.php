<?php

use Astro\Trail\Tests\Fixtures\Docs\Pages;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;

uses(RefreshDatabase::class);

/*
|--------------------------------------------------------------------------
| The shell commands in the documentation are real
|--------------------------------------------------------------------------
|
| Every `php artisan trail:...` line in a bash block of the README or a guide is a command that
| exists, with options it defines, and is run here against an empty database (`trail:install` is
| only looked up, because it writes into the application). Every `artisan` command named in the
| prose is looked up too. `composer require` names this package.
|
*/

/** The commands of the bash blocks, as typed. @return list<string> */
function documentedCommands(): array
{
    $lines = [];

    foreach (Pages::guides() as $page) {
        foreach (Pages::blocks($page) as $block) {
            if ($block['language'] !== 'bash') {
                continue;
            }

            foreach (explode("\n", $block['code']) as $line) {
                if (str_starts_with($line, 'php artisan trail:')) {
                    $lines[] = $line;
                }
            }
        }
    }

    return $lines;
}

it('documents every command Trail ships, with an example', function () {
    $documented = array_map(fn (string $line) => explode(' ', substr($line, strlen('php artisan ')))[0], documentedCommands());
    $shipped = array_values(array_filter(array_keys(Artisan::all()), fn (string $name) => str_starts_with($name, 'trail:')));

    expect(array_values(array_unique($documented)))->toEqualCanonicalizing($shipped);
});

it('runs every documented trail command, with options the command defines', function () {
    foreach (documentedCommands() as $line) {
        $arguments = substr($line, strlen('php artisan '));
        $name = explode(' ', $arguments)[0];
        $command = Artisan::all()[$name];

        preg_match_all('/--([a-z-]+)/', $arguments, $options);

        foreach ($options[1] as $option) {
            expect($command->getDefinition()->hasOption($option))->toBeTrue("{$name} has no --{$option} option.");
        }

        // trail:install writes into the application, and trail:clear without --force asks before it
        // deletes everything; ClearCommandTest and InstallCommandTest run those.
        if ($name === 'trail:install' || ($name === 'trail:clear' && ! str_contains($arguments, '--force'))) {
            continue;
        }

        $parameters = [];

        foreach ($options[1] as $option) {
            preg_match('/--'.preg_quote($option, '/').'(?:=(\S+))?/', $arguments, $value);
            $parameters["--{$option}"] = $value[1] ?? true;
        }

        expect(Artisan::call($name, $parameters))->toBe(0, "{$line} failed.");
    }
});

it('names only artisan commands that exist', function () {
    // Commands of Laravel and of packages the documentation assumes the application has.
    $outside = ['tinker', 'make:agent'];
    $named = [];

    foreach (Pages::guides() as $page) {
        preg_match_all('/php artisan ([a-z]+(?::[a-z-]+)?)/', Pages::read($page), $matches);
        array_push($named, ...$matches[1]);
    }

    $missing = array_values(array_filter(array_unique($named), fn (string $name) => ! in_array($name, $outside, true) && ! array_key_exists($name, Artisan::all())));

    expect($named)->not->toBeEmpty()->and($missing)->toBe([]);
});

it('tells people to require this package', function () {
    $composer = json_decode(Pages::read(Pages::root().'/composer.json'), true, 512, JSON_THROW_ON_ERROR);
    $readme = Pages::read(Pages::root().'/README.md');

    expect($readme)->toContain('composer require '.$composer['name']);
});
