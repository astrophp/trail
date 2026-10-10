<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

/**
 * Sends one GET request through the application's HTTP kernel, as an anonymous visitor would, and
 * prints its status and content type. The body goes to a file when asked for.
 */
class ProbeRequest extends Command
{
    protected $signature = 'probe:request {uri} {--body-to= : File that receives the response body}';

    protected $description = 'Send a GET request through the HTTP kernel';

    public function handle(Kernel $kernel): int
    {
        $response = $kernel->handle(Request::create((string) $this->argument('uri'), 'GET', server: ['HTTP_ACCEPT' => 'text/html,application/json']));

        $bodyTo = $this->option('body-to');
        if (is_string($bodyTo) && $bodyTo !== '') {
            file_put_contents($bodyTo, $response->getContent());
        }

        $this->line('status='.$response->getStatusCode());
        $this->line('type='.$response->headers->get('Content-Type'));

        return self::SUCCESS;
    }
}
