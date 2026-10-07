<?php

use Astro\Trail\Facades\Trail;

$html = ['Accept' => 'text/html'];

it('answers an unknown api path with a JSON 404 even when HTML is asked for', function () use ($html) {
    $this->app['env'] = 'local';

    $this->get('/trail/api/nothing/here', $html)->assertNotFound()->assertJsonStructure(['message']);
});

it('answers a denied api request with a JSON 403 even when HTML is asked for', function () use ($html) {
    $this->app['env'] = 'production';

    $this->get('/trail/api/meta', $html)->assertForbidden()->assertJsonStructure(['message']);
    $this->get('/trail/api/nothing/here', $html)->assertForbidden()->assertJsonStructure(['message']);
});

it('answers an invalid parameter with a JSON 422 even when HTML is asked for', function () use ($html) {
    $this->app['env'] = 'local';

    $this->get('/trail/api/meta?range=bad', $html)->assertUnprocessable()->assertJsonValidationErrors(['range'])->assertJsonStructure(['message', 'errors']);
    $this->get('/trail/api/meta?range[]=x', $html)->assertUnprocessable()->assertJsonValidationErrors(['range']);
});

it('answers a JSON 404 for api/meta when the dashboard is switched off', function () use ($html) {
    $this->app['env'] = 'local';
    config(['trail.dashboard.enabled' => false]);

    $this->get('/trail/api/meta', $html)->assertNotFound()->assertJsonStructure(['message']);
});

it('keeps the api behind the access check', function () use ($html) {
    $this->app['env'] = 'production';
    Trail::auth(fn () => true);

    $this->get('/trail/api/meta', $html)->assertOk();

    Trail::auth(fn () => false);

    $this->get('/trail/api/meta', $html)->assertForbidden();
});

it('does not turn the dashboard page into JSON', function () use ($html) {
    $this->app['env'] = 'local';

    $this->get('/trail', $html)->assertOk()->assertHeader('Content-Type', 'text/html; charset=utf-8');
});
