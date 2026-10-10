<?php

namespace Astro\Trail\Capture;

use Illuminate\Contracts\Container\Container;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\Looping;
use Illuminate\Queue\Jobs\SyncJob;

/**
 * The moments Trail writes what it has buffered: when a request or command ends, when a queued
 * job ends, between jobs in a worker, and when an Octane request, task or tick ends.
 */
final class FlushPoints
{
    /** Octane is not a dependency, so its event is listened to by name only. */
    private const OCTANE_OPERATION_TERMINATED = 'Laravel\\Octane\\Contracts\\OperationTerminated';

    public static function register(Application $app, Dispatcher $events): void
    {
        $app->terminating(static function () use ($app): void {
            self::flush($app);

            // Terminating callbacks run in the order they were added, and a job dispatched after the
            // response adds its own while the request is still running. This one is added during
            // termination, so it runs after all of them. It adds nothing further.
            Guard::run(function () use ($app): void {
                $app->terminating(static function () use ($app): void {
                    self::flush($app);
                });
            });
        });

        $events->listen(JobProcessed::class, static function (JobProcessed $event) use ($app): void {
            self::flushAfterJob($app, $event->job);
        });

        $events->listen(JobFailed::class, static function (JobFailed $event) use ($app): void {
            self::flushAfterJob($app, $event->job);
        });

        $events->listen(JobExceptionOccurred::class, static function (JobExceptionOccurred $event) use ($app): void {
            self::flushAfterJob($app, $event->job);
        });

        // The worker stops when a Looping listener returns false, so this one returns nothing.
        $events->listen(Looping::class, static function () use ($app): void {
            self::flush($app);
        });

        $events->listen(self::OCTANE_OPERATION_TERMINATED, static function () use ($app): void {
            self::flush($app);
        });
    }

    /**
     * A sync job runs inside a request, another job or a tool call, possibly in the middle of a
     * run, so only the enclosing request or job may flush. Whether a job is sync is a property
     * of the job, not of the name of its connection.
     */
    private static function flushAfterJob(Container $container, Job $job): void
    {
        if ($job instanceof SyncJob) {
            return;
        }

        self::flush($container);
    }

    private static function flush(Container $container): void
    {
        Guard::run(function () use ($container): void {
            $container->make(Recorder::class)->flush();
        });
    }
}
