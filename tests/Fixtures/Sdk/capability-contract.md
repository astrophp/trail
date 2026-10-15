# Classification and reranking event contract

These observations are executable in `tests/Feature/Sdk/ClassificationTest.php`,
`RerankingTest.php`, `CapabilityLifecycleTest.php` and `ClassificationAttachmentsTest.php`.
They use real pending responses, provider concerns and gateways with HTTP scripted below them.
`Http::preventStrayRequests()` applies to every test. SDK fakes are separate coverage;
scripted gateway implementations exercise reentrancy and arbitrary exceptions without changing
provider dispatch or the pending response failover loop.

The contract is checked against Laravel AI SDK **1.1.0** and **1.2.0**, and against the latest
release. CI resolves each exact version against Laravel 12/Testbench 10 and Laravel 13/Testbench 11,
preserving the package's `^1.1` requirement. Differences from 1.2.2 on are described under
[SDK 1.2.2 failure events](#sdk-122-failure-events). On 1.1, the attachment-only cases skip with an explicit version reason,
while the actual provider prompt's absent property and guarded access are tested. The 1.2 CI
attachment gate fails if any case skips.

## Sequences and identity

Write `C+`/`C-` for `Classifying`/`Classified` and `R+`/`R-` for `Reranking`/`Reranked`.
The same rules apply to either pair:

| Operation | Dispatch order |
| --- | --- |
| Success | `+ A`, `- A` |
| Failover then success | `+ A`, `ProviderFailedOver`, `+ B`, `- B` |
| Two exhausted providers | `+ A`, `ProviderFailedOver`, `+ B`, `ProviderFailedOver` |
| HTTP 500 or arbitrary exception | `+ A` only |
| Reentrant success from a scripted gateway | `+ A`, `+ B`, `- B`, `- A` |

Each provider attempt generates a distinct UUID7. A matching terminal carries the same ID and
prompt object as its start, and the returned response object. Event model is the requested
model; response metadata may report another model. `ProviderFailedOver` has exactly provider,
model and exception, with no invocation ID or capability. Even the last exhausted attempt emits
it. Neither a logical-call relationship, recovered flag nor shared sampling decision is
available. There is no dedicated classification/reranking failure event in these versions.
An ordinary HTTP 500 is not failoverable here; HTTP 429 is. Arbitrary gateway exceptions also
bypass the failover loop. Catching an exception in application code does not create a terminal.

Sources: SDK [Classifies](https://github.com/laravel/ai/blob/v1.1.0/src/Providers/Concerns/Classifies.php),
[Reranks](https://github.com/laravel/ai/blob/v1.1.0/src/Providers/Concerns/Reranks.php),
[PendingClassification](https://github.com/laravel/ai/blob/v1.1.0/src/PendingResponses/PendingClassification.php),
[PendingReranking](https://github.com/laravel/ai/blob/v1.1.0/src/PendingResponses/PendingReranking.php),
[ProviderFailedOver](https://github.com/laravel/ai/blob/v1.1.0/src/Events/ProviderFailedOver.php).

## SDK 1.2.2 failure events

From 1.2.2 the SDK dispatches `ClassificationFailed`, `RerankingFailed` and `EmbeddingsFailed` once
per failed attempt, after the start and before any `ProviderFailedOver`. Each carries the attempt's
invocation ID, provider, model, prompt and exception, so the failed call is named rather than
inferred. Written `C!`/`R!`, the sequences above become:

| Operation | Dispatch order |
| --- | --- |
| Failover then success | `+ A`, `! A`, `ProviderFailedOver`, `+ B`, `- B` |
| Two exhausted providers | `+ A`, `! A`, `ProviderFailedOver`, `+ B`, `! B`, `ProviderFailedOver` |
| HTTP 500 or arbitrary exception | `+ A`, `! A` |

A provider that rejects an attachment after the start also fires the failure event. The tests
expect these events only when the installed SDK defines them.

Sources: SDK [ClassificationFailed](https://github.com/laravel/ai/blob/v1.2.2/src/Events/ClassificationFailed.php),
[RerankingFailed](https://github.com/laravel/ai/blob/v1.2.2/src/Events/RerankingFailed.php),
[EmbeddingsFailed](https://github.com/laravel/ai/blob/v1.2.2/src/Events/EmbeddingsFailed.php).

## Parent context and incomplete evidence

Standalone starts and terminals observe `[null, null]`. Ordinary and streamed tool calls
observe `[agent invocation ID, tool invocation ID]`. Capability prompts carry no parent ID
properties: consumers must snapshot ambient context during dispatch.

For two delegation levels, callbacks during the researcher's step observe the outer tool;
callbacks during the summarizer's step observe the researcher's delegation tool. Only calls
inside the deepest actual tool observe the summarizer's own invocation and tool ID. The
five-call context sequence is outer, middle, inner, middle, outer. Context restores on both
success and exceptions. In automatic delegation, AgentTool catches the deepest agent failure
and returns `Agent failed: ...`; only that agent and its ordinary tool emit failure events,
while the two outer agents complete. Ordinary tools do propagate uncaught exceptions. It cannot
always identify the currently running delegated agent from events alone.

Trail suppression, a rejecting filter and a flush inside the provider callback do not change
SDK ambient context. Explicit synthetic unknown or already closed parent IDs are also carried
without SDK validation. These tests establish SDK observations, not acceptance requirements
for a capture adapter. Sampling, parent existence, closure and flush state require separate
recorder decisions.

A real OpenRouter embedding HTTP callback leaves an embedding open while a classification or
reranking gateway fails with the same driver/model. Observed sequence is `GeneratingEmbeddings`,
capability start, `ProviderFailedOver`, `EmbeddingsGenerated`; reentrancy adds another start
and another generic failover before the embedding terminal. The embedding successfully returns
its vectors. Driver/model matching alone cannot assign the capability exception to it.
The existing recorder's `providerFailedOver()` matcher nevertheless closes the newest matching
open embedding; this is an unsafe attribution boundary, not proof of an embedding failure.
No recorder behavior is changed by these tests.

Duplicate terminals after flush and unknown-ID terminals are explicitly dispatched synthetic
observer inputs. They are not claimed as natural output from the synchronous SDK. Reentrancy
is scripted adapter stress, rather than evidence of background concurrency.

Sources: SDK [ParentInvocation](https://github.com/laravel/ai/blob/v1.1.0/src/Gateway/ParentInvocation.php),
[AgentTool](https://github.com/laravel/ai/blob/v1.1.0/src/Tools/AgentTool.php).

## Answers and usage normalization

TypeSafe/OpenRouter decisions use Boolean wire type `noul`. They return Boolean probability,
Choice value/probabilities/nullable confidence, and fractional ordinal Score with
probabilities/legend/nullable confidence. Unknown types are skipped. Score probability and
legend keys are cast to integers and sorted; an absent legend falls back to question levels.
TypeSafe metadata prefers `routing.model`, then `model`, then the requested model. OpenRouter
uses `model`, then the requested model. Preserve provider probability values and original
choice order; do not manufacture Boolean decisions or treat ordinal scores as quality metrics.

The HTTP parser reads only input/output token totals. Supplied HTTP cache/reasoning fields
are ignored, leaving nullable subsets null. A scripted `TextUsage` with positive totals proves
that explicitly supplied zero cache-read, cache-write and reasoning subsets survive in the
public DTO. Missing and explicit-zero totals both become the same all-zero DTO: there is no
presence bit. An adapter must treat all-zero totals conservatively as unreported, preserve
known subset zeros with reported totals, and never infer HTTP subset counts.

Cohere preserves returned ranking order and original document indexes, resolving result text
from the original input array. Its metadata uses the requested model. HTTP
`meta.billed_units.search_units` reaches `RerankingUsage::searchUnits`: omitted/null stays null,
explicit `0.0` remains `0.0`, and positive search units survive with no tokens. Input defaults
to zero; output zero is structural because reranking generates no output tokens. Search-unit
presence can establish measured usage independently of tokens; structural output zero cannot.
SDK classification and reranking fakes also supply default-zero token usage.

Sources: SDK [AnswersQuestions](https://github.com/laravel/ai/blob/v1.1.0/src/Gateway/Concerns/AnswersQuestions.php),
[CohereGateway](https://github.com/laravel/ai/blob/v1.1.0/src/Gateway/CohereGateway.php),
[TextUsage](https://github.com/laravel/ai/blob/v1.1.0/src/Responses/Data/TextUsage.php),
[RerankingUsage](https://github.com/laravel/ai/blob/v1.1.0/src/Responses/Data/RerankingUsage.php).

## SDK 1.2 provider differences

Actual SDK 1.2 prompts add a public readonly **array** of attachments, preserving the supplied
objects at start and completion. SDK 1.1 has no property; guarded access returns unavailable
rather than an invented empty attachment list.

Before 1.2.3, TypeSafe and OpenRouter reject nonempty attachments **before** dispatching
`Classifying`; from 1.2.3 they accept them.
OpenAI supports Base64Image, RemoteImage, LocalImage, StoredImage and UploadedFile using inline
JPEG/PNG/GIF/WebP content; ProviderImage IDs and unsupported MIME types are rejected **after**
the start, without terminal or HTTP decisions request. Remote content goes through the SDK's
URL validation, including rejection of private addresses. The successful remote fixture uses
a public literal IP with faked HTTP, so no DNS or live request is needed.

The SDK gateway itself reads/fetches content and sends inline data URLs. An event consumer
must still restrict itself to metadata and avoid reading content or serializing the SDK object.
This characterization does not add capture or claim all providers support images.

OpenAI uses `predicate` rather than `noul`, a named question/answer list rather than keyed
wire objects, and a probability-entry list. Refusals, unnamed answers and unknown types are
skipped. Score probabilities preserve provider entry order rather than being sorted; question
levels supply the legend. These provider differences are tested explicitly, without adapting
or wrapping SDK calls to make the representations agree.

Sources: SDK [ClassificationPrompt](https://github.com/laravel/ai/blob/v1.2.0/src/Prompts/ClassificationPrompt.php),
[Classifies](https://github.com/laravel/ai/blob/v1.2.0/src/Providers/Concerns/Classifies.php),
[OpenAiClassificationGateway](https://github.com/laravel/ai/blob/v1.2.0/src/Gateway/OpenAi/OpenAiClassificationGateway.php),
[UntrustedUrl](https://github.com/laravel/ai/blob/v1.2.0/src/Files/UntrustedUrl.php).
