# What is recorded

Trail listens to the events the Laravel AI SDK fires and writes what they report into your
database. It adds no middleware, trait or wrapper to your agents, and it changes nothing about how
they run. Anything the SDK does not report through an event, Trail does not know.

Every listener is guarded: an error inside Trail is reported through Laravel's exception handler
and is never thrown into your AI call. When Trail cannot write, the run is lost to Trail and
unaffected for your application.

## What a trace holds

A **trace** is one top-level run. Its **spans** are the parts of it, in a tree:

| Span | What it is |
| -- | -- |
| Agent | The run of an agent. A sub-agent is an agent span under the tool call that delegated to it. |
| Step | One model call, with the provider and model it used and the usage it reported: input, output, cache read, cache write and reasoning tokens. |
| Tool | One tool call, with its arguments and result. |
| Embedding | One embeddings call, with the model, the token count the provider reported, and the dimensions asked for. |

A trace also carries the agent class, the final status, the provider and model, the conversation
and user it belongs to (when the agent remembers conversations), the totals of its steps, an
estimated cost ([Cost](cost.md)), its duration, and short excerpts of the prompt and the response.
Prompts, messages, arguments and results are redacted and cut to a length before they are stored
([Payloads and sampling](payloads.md)).

## What is covered

- **Agent runs**, plain and structured output.
- **Steps**, with real timing, usage and, on failure, the exception class, message and HTTP status
  when the SDK gave one. A failure is classified as rate limited, provider overloaded, provider
  connection, insufficient credits, tool error or exception.
- **Tools**, including those that fail.
- **Sub-agents.** An agent used as a tool, or one prompted by hand inside a tool, is recorded under
  the run that started it, not as a trace of its own, at any depth. When it fails and the parent
  carries on, the trace is marked as having a failed child.
- **Embeddings.** A call made inside a tool is an embedding span under that tool. A call made on
  its own is a trace of its own.
- **Failover.** A run that moves to the next provider is one trace. A step records the failed
  attempt, and a trace that a later provider answered is marked recovered. The usage and cost of
  the failed attempt are counted, and a tool that ran in it is kept as its own span.
- **Streaming.** A streamed run is recorded when the SDK reports it. A streamed step carries no
  responding model, so it is priced at the model you asked for. A stream that is never iterated
  records nothing, and a stream that is abandoned part-way stays running until it is marked
  Incomplete ([below](#reading-the-dashboard)).
- **Queued prompts.** `->queue()` only dispatches a job; the SDK fires its events when the worker
  runs it, so the worker records the run, as a trace of its own. Nothing is recorded at dispatch.
- **Tool approvals.** A run that stops to wait for approval is recorded with the status Awaiting
  approval and the tool calls it waits for. The run that resumes it is a separate trace; see
  [Known limits](limits.md).
- **Conversations.** When an agent remembers conversations with the SDK's own trait, its runs are
  grouped by conversation id, and the dashboard shows the conversation as a transcript.
- **Users.** Only the user's id and type are stored ([Known limits](limits.md)).

## What is not recorded

- **Runs the SDK reports no event for.** Trail records agent runs and embeddings. Classification,
  images, audio, transcription and reranking are not recorded.
- **The title call.** When an agent remembers conversations and generates a title for a new one,
  the SDK makes an extra model call that no event reports. It is neither recorded nor priced.
- **Embeddings served from the SDK's embeddings cache,** which fire no events.
- **A stream nobody iterates.**
- **Runs you leave out:** sampled out, skipped by a filter, started inside `withoutRecording()`,
  started while recording is paused, or started with Trail disabled
  ([Payloads and sampling](payloads.md), [Operations](operations.md)).
- **Payloads, when `capture.enabled` is `false`.** Runs, steps, timings, usage, cost and error
  classes are still recorded.
- **Anything after the root run finished.** A sub-agent that is still working after its parent
  ended is not followed.

## When it is written

Trail inserts one row when a top-level run starts, so a running run can be seen. It buffers
everything else in memory and writes it in one batch at a **flush point**:

- the end of a web request or an artisan command,
- the end of a queued job, and between jobs in a worker,
- the end of an Octane request, task or tick,
- a call to `Trail::flush()`.

A run's steps and tools therefore appear in the dashboard when its process reaches a flush point,
not while it runs. A job that takes ten minutes shows as Running, with no steps, for ten minutes.
A sync-queue job runs inside a request or another job, so only that request or job flushes. If a
process dies before it flushes, only the first row exists, and the sweep later marks it Incomplete
([Operations](operations.md)).

`Trail::flush()` writes every trace Trail is still holding, finished or not, and forgets it. Call
it between runs in your own long-lived script. A run still going when it is called is written as
running, and Trail does not follow it afterwards. It never throws.

## Reading the dashboard

Trail stores `null` for anything it does not have and never a zero in its place. The dashboard
says why a value is missing:

| Shown as | Means |
| -- | -- |
| **Not captured** | Trail has no value. The SDK or the provider did not report it, or it was not stored. For a cost, no step reported usage, so there was nothing to price. For a duration, none was captured on a finished run. |
| **Not reported** | A token count (or all of them) that the provider did not report. A run that finished without any count shows its usage this way. |
| **Pending** | The run is still running, so its usage and cost are not final. Where an amount is shown with it, it is what has been recorded so far and can still grow. |
| **Unpriced** | Tokens were reported but the cost cannot be estimated, because the model has no price, or the price lacks a rate for a kind of token the run used. Unpriced is never free. |
| **Partial** | Some steps of a run could be priced and some could not. The amount covers only the priced ones. |
| **Incomplete** | The run never reported an end. A run still marked running after `stale_after` seconds (`3600` by default) is shown as Incomplete, with the issue kind abandoned. |
| **Awaiting approval** | The run stopped for a tool call that needs a person to approve it. |

Incomplete has a few common causes: the process died (a killed worker, a timeout, a deploy), a
stream was abandoned by its consumer, or an embeddings call failed with an error the SDK reports
no event for. The dashboard shows a stale run as Incomplete before any command has run;
`trail:sweep` writes that status to the database ([Operations](operations.md)).

A cost is an estimate from list prices, frozen when the run was recorded ([Cost](cost.md)).
