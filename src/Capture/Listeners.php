<?php

namespace Astro\Trail\Capture;

use Closure;
use Illuminate\Contracts\Container\Container;
use Illuminate\Contracts\Events\Dispatcher;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentFailedOver;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\AgentStreamed;
use Laravel\Ai\Events\AudioGenerated;
use Laravel\Ai\Events\Classified;
use Laravel\Ai\Events\Classifying;
use Laravel\Ai\Events\EmbeddingsGenerated;
use Laravel\Ai\Events\GeneratingAudio;
use Laravel\Ai\Events\GeneratingEmbeddings;
use Laravel\Ai\Events\GeneratingImage;
use Laravel\Ai\Events\GeneratingTranscription;
use Laravel\Ai\Events\ImageGenerated;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\ProviderFailedOver;
use Laravel\Ai\Events\Reranked;
use Laravel\Ai\Events\Reranking;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\StreamingAgent;
use Laravel\Ai\Events\ToolApprovalResolved;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Events\TranscriptionGenerated;
use Throwable;

/**
 * The SDK events Trail listens to. Each event class is registered by its own name, because the
 * dispatcher never delivers a subclass event to a listener of its parent class.
 */
final class Listeners
{
    public static function register(Dispatcher $events, Container $container): void
    {
        $events->listen(PromptingAgent::class, static fn (PromptingAgent $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentStarting($event)));
        // The stream events extend the plain ones, but the dispatcher never delivers a subclass to a
        // parent's listener, so each is registered by its own class.
        $events->listen(StreamingAgent::class, static fn (StreamingAgent $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentStarting($event, streamed: true)));
        $events->listen(AgentStreamed::class, static fn (AgentStreamed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentCompleted($event)));
        $events->listen(StartingStep::class, static fn (StartingStep $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepStarting($event)));
        $events->listen(StepCompleted::class, static fn (StepCompleted $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepCompleted($event)));
        $events->listen(InvokingTool::class, static fn (InvokingTool $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolInvoking($event)));
        $events->listen(ToolInvoked::class, static fn (ToolInvoked $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolInvoked($event)));
        $events->listen(StepFailed::class, static fn (StepFailed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepFailed($event)));
        $events->listen(ToolFailed::class, static fn (ToolFailed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolFailed($event)));
        $events->listen(AgentFailedOver::class, static fn (AgentFailedOver $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentFailedOver($event)));
        $events->listen(AgentFailed::class, static fn (AgentFailed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentFailed($event)));
        $events->listen(Classifying::class, static fn (Classifying $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->capabilityStarting($event)));
        $events->listen(Reranking::class, static fn (Reranking $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->capabilityStarting($event)));
        $events->listen(Classified::class, static fn (Classified $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->capabilityCompleted($event)));
        $events->listen(Reranked::class, static fn (Reranked $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->capabilityCompleted($event)));
        $events->listen(GeneratingEmbeddings::class, static fn (GeneratingEmbeddings $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->embeddingsGenerating($event)));
        $events->listen(EmbeddingsGenerated::class, static fn (EmbeddingsGenerated $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->embeddingsGenerated($event)));
        $events->listen(GeneratingImage::class, static fn (GeneratingImage $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->mediaStarting($event)));
        $events->listen(GeneratingAudio::class, static fn (GeneratingAudio $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->mediaStarting($event)));
        $events->listen(GeneratingTranscription::class, static fn (GeneratingTranscription $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->mediaStarting($event)));
        $events->listen(ImageGenerated::class, static fn (ImageGenerated $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->mediaCompleted($event)));
        $events->listen(AudioGenerated::class, static fn (AudioGenerated $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->mediaCompleted($event)));
        $events->listen(TranscriptionGenerated::class, static fn (TranscriptionGenerated $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->mediaCompleted($event)));
        // AgentFailedOver extends this class and never reaches it: the dispatcher delivers an event to its own class's listeners only.
        $events->listen(ProviderFailedOver::class, static fn (ProviderFailedOver $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->providerFailedOver($event)));
        $events->listen(ToolApprovalResolved::class, static fn (ToolApprovalResolved $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->approvalsResolved($event)));
        $events->listen(AgentPrompted::class, static fn (AgentPrompted $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentCompleted($event)));
        // The SDK dispatches these from 1.2.2 on. Earlier versions have no such classes, so they are
        // named by string and read through the two properties every one of them carries.
        $events->listen(Recorder::EMBEDDINGS_FAILED, static fn (object $event) => self::failed($container, $event, static fn (Recorder $recorder, string $id, Throwable $exception) => $recorder->embeddingsFailed($id, $exception)));
        $events->listen(Recorder::CLASSIFICATION_FAILED, static fn (object $event) => self::failed($container, $event, static fn (Recorder $recorder, string $id, Throwable $exception) => $recorder->capabilityFailed($id, $exception)));
        $events->listen(Recorder::RERANKING_FAILED, static fn (object $event) => self::failed($container, $event, static fn (Recorder $recorder, string $id, Throwable $exception) => $recorder->capabilityFailed($id, $exception)));
        $events->listen(Recorder::IMAGE_FAILED, static fn (object $event) => self::failed($container, $event, static fn (Recorder $recorder, string $id, Throwable $exception) => $recorder->capabilityFailed($id, $exception)));
        $events->listen(Recorder::AUDIO_FAILED, static fn (object $event) => self::failed($container, $event, static fn (Recorder $recorder, string $id, Throwable $exception) => $recorder->capabilityFailed($id, $exception)));
        $events->listen(Recorder::TRANSCRIPTION_FAILED, static fn (object $event) => self::failed($container, $event, static fn (Recorder $recorder, string $id, Throwable $exception) => $recorder->capabilityFailed($id, $exception)));
    }

    /**
     * @param  Closure(Recorder, string, Throwable): void  $call
     */
    private static function failed(Container $container, object $event, Closure $call): void
    {
        self::handle($container, static function (Recorder $recorder) use ($event, $call): void {
            if (property_exists($event, 'invocationId') && is_string($event->invocationId) && property_exists($event, 'exception') && $event->exception instanceof Throwable) {
                $call($recorder, $event->invocationId, $event->exception);
            }
        });
    }

    /**
     * Resolving the recorder is inside the guard too, so a broken binding cannot fail the AI call.
     *
     * @param  Closure(Recorder): void  $call
     */
    private static function handle(Container $container, Closure $call): void
    {
        Guard::run(function () use ($container, $call): void {
            $call($container->make(Recorder::class));
        });
    }
}
