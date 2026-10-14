# Default price sources

The v0.3.1 catalogue contains 173 model IDs across ten provider drivers, including 14 reranking
entries. Official sources were checked on **2026-10-14**. This is a static list of estimates,
not a provider billing feed. A price entry does not promise that a model is available to your
account or that every operation it supports is supported by the SDK.

All token rates below are **USD per one million reported tokens**. `—` means no rate is configured,
not zero. A reranking rate is either USD per million input tokens or USD per reported search unit;
the basis is explicit. Ordinary token rates never price reranking. For override precedence,
frozen recorded costs and upgrading a published config, see [Cost](cost.md).

## Scope and assumptions

- Use standard, non-batch base rates. Long-context surcharges, premium processing tiers, regional
  uplifts, cache storage, tool charges, taxes, negotiated discounts and free allowances are excluded.
- Anthropic cache writes use the five-minute rate. Haiku 5.5 uses the rate for prompts up to
  100,000 tokens; its higher long-context rates are excluded. Mythos models have limited availability.
- OpenAI uses the short-context Standard column. GPT-5.6 Sol's promotional rate is guaranteed at
  least through **2026-11-21**. Cyber and Rosalind models require additional access approval.
- Gemini uses non-audio input rates, including text-only Embedding 2 usage. Argon introductory
  prices end **2026-11-30**; Flash 3.6/3.8 and Robotics ER 2 introductory prices end **2026-12-31**.
  The package never changes those rates automatically. Google routes deprecated 3.5 Flash to 3.6
  Flash and 3.7 Flash to 3.8 Flash, so those IDs use the destination's current rates.
- Mistral Large 4 uses the currently advertised sale prices. An end date is not published on the
  checked pricing page. Mistral Embed's model card supplies its rate separately from the main table.
- xAI uses the default US-east cluster's prices in its public model-page data. Other clusters can
  differ. Only explicitly published aliases are included; `grok-build-latest` currently points to
  Grok 4.5, while `grok-code-fast` and `grok-code-fast-1` point to Grok Build 0.1.
- Groq GPT-OSS cached input receives a 50% discount: 20B's $0.075 input becomes **$0.0375**,
  without rounding to $0.037. Cache rates for other Groq models are not inferred.
- Voyage reranking uses reported processed tokens, including the provider's repeated query-token
  accounting. The advertised example price per request is not a billing unit. Legacy models with
  published rates are retained; their prices do not imply current availability.
- Cohere reranking prices of $2.00/$2.50 per **1,000 searches** become **$0.002/$0.0025 per reported
  search unit**. Trail does not derive search units from document count or split long documents.
  Current Command R pricing applies to its August 2024 version; deprecated `command-r` is the
  March 2024 alias and retains its distinct rate. Command A uses its official launch publication's
  $2.50/$10 rate, rather than inferring a price from Command A+.
- Jina's public storefront currently selects a **USD $50 / 1,000,000,000-token package**, equivalent
  to **$0.05 per million**. This is the base package assumption, not a universal list rate. Its
  USD $500 / 11-billion-token package, older purchases, currency and taxes differ. Embedding and
  reranking calls use the SDK's reported total tokens; token allowances are not treated as free.
- DeepSeek uses **peak** rates. Off-peak prices are half those rates; the static table does not
  interpret UTC schedules or Chinese public holidays. Its retired V4 Flash IDs are documented
  aliases for the current Flash service, not independent historical price entries.
- Exact differently priced snapshots override family-prefix rates: notably GPT-4o May 2024,
  GPT-3.5 Turbo November 2023, and Command R/R+ August 2024. A dated suffix alone does not prove
  a distinct rate. Documented canonical IDs and aliases may share the same rate.

## Deliberate exclusions

Azure deployments, Bedrock regions, OpenRouter routes and arbitrary OpenAI-compatible servers need
their own verified rates; the package does not copy first-party prices onto those drivers. Local
Ollama and free trial accounts are not assigned an invented zero rate.

Cohere's current public pricing page no longer provides a per-token rate for `embed-v4.0`.
It remains Unpriced unless configured, including when the SDK selects it by default. The page's
Command A+ card prices an API key and model download at zero; that is not evidence of a zero
production inference rate, so `command-a-plus-05-2026` also remains Unpriced. Groq models listed
as Contact Sales are excluded. Older Cohere rerankers are excluded where no current public unit
rate could be verified. Image generation, audio, transcription, multimodal Voyage pixel pricing
and other billing bases need separate capture/pricing support and are outside this patch.

## Official references

| Driver | Model IDs | Official pricing and identity references |
| --- | ---: | --- |
| `anthropic` | 20 | [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [model IDs and deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `openai` | 44 | [API pricing](https://developers.openai.com/api/docs/pricing), [GPT-5.6 alias](https://developers.openai.com/api/docs/models/gpt-5.6-sol) |
| `gemini` | 15 | [Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing), [3.5 routing](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash), [3.7 routing](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash) |
| `mistral` | 10 | [Pricing](https://docs.mistral.ai/inference/pricing), [Mistral Embed](https://docs.mistral.ai/models/mistral-embed-23-12), [Large 4](https://docs.mistral.ai/models/mistral-large-4-0) |
| `xai` | 15 | [Public models, cluster prices and aliases](https://docs.x.ai/developers/models) |
| `groq` | 6 | [Supported model prices](https://console.groq.com/docs/models), [cache discount](https://console.groq.com/docs/prompt-caching) |
| `voyageai` | 32 | [Current and legacy pricing](https://docs.voyageai.com/docs/pricing) |
| `cohere` | 14 | [Pricing tabs and legacy FAQ](https://cohere.com/pricing), [model IDs](https://docs.cohere.com/v2/docs/models), [Command A publication](https://cohere.com/blog/command-a) |
| `jina` | 13 | [Embedding pricing](https://jina.ai/embeddings/), [reranking billing](https://jina.ai/reranker/), [model IDs](https://jina.ai/models/), [public storefront product data](https://dash.jina.ai/api/v1/product) |
| `deepseek` | 4 | [Peak/off-peak rates and routed aliases](https://api-docs.deepseek.com/quick_start/pricing) |

The Cohere unit prices appear after choosing the Generative models or Advanced retrieval models
tab. The xAI page embeds cluster-specific public model data. Jina's pricing page selects current
packages from its public product catalogue; the endpoint also contains legacy packages, so merely
choosing the cheapest returned product would not reproduce the storefront's current offer.

## Full configured rates

The following tables list every configured model ID. No date variants are manufactured to expand
the count; unlisted supported version suffixes continue to resolve through the existing price book.

### anthropic

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `claude-fable-5-1` | 10 | 50 | 0.25 | 12.5 | — | — |
| `claude-fable-5` | 10 | 50 | 1 | 12.5 | — | — |
| `claude-opus-5-5` | 4 | 20 | 0.2 | 5 | — | — |
| `claude-opus-5` | 5 | 25 | 0.5 | 6.25 | — | — |
| `claude-opus-4-8` | 5 | 25 | 0.5 | 6.25 | — | — |
| `claude-opus-4-7` | 5 | 25 | 0.5 | 6.25 | — | — |
| `claude-opus-4-6` | 5 | 25 | 0.5 | 6.25 | — | — |
| `claude-opus-4-5` | 5 | 25 | 0.5 | 6.25 | — | — |
| `claude-sonnet-5-5` | 2 | 10 | 0.1 | 2.5 | — | — |
| `claude-sonnet-5` | 2 | 10 | 0.2 | 2.5 | — | — |
| `claude-sonnet-4-6` | 3 | 15 | 0.3 | 3.75 | — | — |
| `claude-sonnet-4-5` | 3 | 15 | 0.3 | 3.75 | — | — |
| `claude-haiku-4-5` | 1 | 5 | 0.1 | 1.25 | — | — |
| `claude-haiku-5-5` | 0.1 | 0.5 | 0.01 | 0.125 | — | — |
| `claude-mythos-5-1` | 10 | 50 | 0.25 | 12.5 | — | — |
| `claude-mythos-5` | 10 | 50 | 1 | 12.5 | — | — |
| `claude-opus-4-1` | 15 | 75 | 1.5 | 18.75 | — | — |
| `claude-opus-4` | 15 | 75 | 1.5 | 18.75 | — | — |
| `claude-sonnet-4` | 3 | 15 | 0.3 | 3.75 | — | — |
| `claude-3-5-haiku` | 0.8 | 4 | 0.08 | 1 | — | — |

### openai

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `gpt-6-astra` | 10 | 50 | 1 | 12.5 | — | — |
| `gpt-6.1-sol` | 2 | 10 | 0.1 | 2.5 | — | — |
| `gpt-6-sol` | 2 | 10 | 0.2 | 2.5 | — | — |
| `gpt-6-luna` | 0.1 | 0.5 | 0.01 | 0.125 | — | — |
| `gpt-5.6-terra` | 2 | 12 | 0.2 | 2.5 | — | — |
| `gpt-5.6-luna` | 0.2 | 1.2 | 0.02 | 0.25 | — | — |
| `gpt-5.5` | 5 | 30 | 0.5 | — | — | — |
| `gpt-5.5-pro` | 30 | 180 | — | — | — | — |
| `gpt-5.4` | 2.5 | 15 | 0.25 | — | — | — |
| `gpt-5.4-mini` | 0.75 | 4.5 | 0.075 | — | — | — |
| `gpt-5.4-nano` | 0.2 | 1.25 | 0.02 | — | — | — |
| `gpt-5.4-pro` | 30 | 180 | — | — | — | — |
| `gpt-5.2` | 1.75 | 14 | 0.175 | — | — | — |
| `gpt-5.2-pro` | 21 | 168 | — | — | — | — |
| `gpt-5.1` | 1.25 | 10 | 0.125 | — | — | — |
| `gpt-5` | 1.25 | 10 | 0.125 | — | — | — |
| `gpt-5-mini` | 0.25 | 2 | 0.025 | — | — | — |
| `gpt-5-nano` | 0.05 | 0.4 | 0.005 | — | — | — |
| `gpt-5-pro` | 15 | 120 | — | — | — | — |
| `gpt-4.1` | 2 | 8 | 0.5 | — | — | — |
| `gpt-4.1-mini` | 0.4 | 1.6 | 0.1 | — | — | — |
| `gpt-4.1-nano` | 0.1 | 0.4 | 0.025 | — | — | — |
| `gpt-4o` | 2.5 | 10 | 1.25 | — | — | — |
| `gpt-4o-mini` | 0.15 | 0.6 | 0.075 | — | — | — |
| `o3` | 2 | 8 | 0.5 | — | — | — |
| `o3-pro` | 20 | 80 | — | — | — | — |
| `o3-mini` | 1.1 | 4.4 | 0.55 | — | — | — |
| `o4-mini` | 1.1 | 4.4 | 0.275 | — | — | — |
| `o1` | 15 | 60 | 7.5 | — | — | — |
| `text-embedding-3-small` | 0.02 | — | — | — | — | — |
| `text-embedding-3-large` | 0.13 | — | — | — | — | — |
| `text-embedding-ada-002` | 0.1 | — | — | — | — | — |
| `gpt-5.6-sol` | 4 | 20 | 0.4 | 5 | — | — |
| `gpt-4o-2024-05-13` | 5 | 15 | — | — | — | — |
| `o1-pro` | 150 | 600 | — | — | — | — |
| `gpt-4-turbo-2024-04-09` | 10 | 30 | — | — | — | — |
| `gpt-4-0613` | 30 | 60 | — | — | — | — |
| `gpt-3.5-turbo` | 0.5 | 1.5 | — | — | — | — |
| `gpt-3.5-turbo-1106` | 1 | 2 | — | — | — | — |
| `gpt-5.6` | 4 | 20 | 0.4 | 5 | — | — |
| `gpt-5.6-cyber` | 12.5 | 75 | 1.25 | 15.625 | — | — |
| `gpt-5.5-cyber` | 12.5 | 75 | 1.25 | — | — | — |
| `gpt-rosalind-research` | 5 | 25 | 0.5 | — | — | — |
| `gpt-rosalind-discovery` | 5 | 25 | 0.5 | — | — | — |

### gemini

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `gemini-3.8-flash` | 0.75 | 3.75 | 0.075 | — | — | — |
| `gemini-3.7-flash` | 0.75 | 3.75 | 0.075 | — | — | — |
| `gemini-3.6-flash` | 0.75 | 3.75 | 0.075 | — | — | — |
| `gemini-3.5-flash` | 0.75 | 3.75 | 0.075 | — | — | — |
| `gemini-3.5-flash-lite` | 0.3 | 2.5 | 0.03 | — | — | — |
| `gemini-3.1-flash-lite` | 0.25 | 1.5 | 0.025 | — | — | — |
| `gemini-3.1-pro-preview` | 2 | 12 | 0.2 | — | — | — |
| `gemini-3-flash-preview` | 0.5 | 3 | 0.05 | — | — | — |
| `gemini-2.5-pro` | 1.25 | 10 | 0.125 | — | — | — |
| `gemini-2.5-flash` | 0.3 | 2.5 | 0.03 | — | — | — |
| `gemini-2.5-flash-lite` | 0.1 | 0.4 | 0.01 | — | — | — |
| `gemini-embedding-2` | 0.2 | — | — | — | — | — |
| `gemini-4-argon` | 2 | 10 | 0.1 | — | — | — |
| `gemini-3.1-pro-preview-customtools` | 2 | 12 | 0.2 | — | — | — |
| `gemini-robotics-er-2-preview` | 1 | 5 | 0.1 | — | — | — |

### mistral

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `mistral-large-2512` | 0.5 | 1.5 | 0.05 | — | — | — |
| `mistral-medium-3-5` | 1.5 | 7.5 | 0.15 | — | — | — |
| `mistral-small-2603` | 0.15 | 0.6 | 0.015 | — | — | — |
| `ministral-14b-2512` | 0.2 | 0.2 | 0.02 | — | — | — |
| `ministral-8b-2512` | 0.15 | 0.15 | 0.015 | — | — | — |
| `ministral-3b-2512` | 0.1 | 0.1 | 0.01 | — | — | — |
| `codestral-2508` | 0.3 | 0.9 | 0.03 | — | — | — |
| `codestral-embed-2505` | 0.15 | — | 0.015 | — | — | — |
| `mistral-embed-2312` | 0.1 | — | — | — | — | — |
| `mistral-large-4` | 0.68 | 2.09 | 0.07 | — | — | — |

### xai

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `grok-4.7` | 2 | 6 | 0.5 | — | — | — |
| `grok-4.6` | 2 | 6 | 0.5 | — | — | — |
| `grok-4.5` | 2 | 6 | 0.3 | — | — | — |
| `grok-4.3` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-4.20-0309-reasoning` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-4.20-0309-non-reasoning` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-4.20-multi-agent-0309` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-build-0.1` | 1 | 2 | 0.2 | — | — | — |
| `grok-4.20-non-reasoning` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-4.20-multi-agent` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-4.20` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-4.20-reasoning` | 1.25 | 2.5 | 0.2 | — | — | — |
| `grok-build-latest` | 2 | 6 | 0.3 | — | — | — |
| `grok-code-fast-1` | 1 | 2 | 0.2 | — | — | — |
| `grok-code-fast` | 1 | 2 | 0.2 | — | — | — |

### groq

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `openai/gpt-oss-120b` | 0.15 | 0.6 | 0.075 | — | — | — |
| `openai/gpt-oss-20b` | 0.075 | 0.3 | 0.0375 | — | — | — |
| `openai/gpt-oss-safeguard-20b` | 0.075 | 0.3 | — | — | — | — |
| `qwen/qwen3.8-27b` | 0.8 | 4 | — | — | — | — |
| `meta-llama/llama-prompt-guard-2-22m` | 0.03 | 0.03 | — | — | — | — |
| `meta-llama/llama-prompt-guard-2-86m` | 0.04 | 0.04 | — | — | — | — |

### voyageai

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `voyage-4-large` | 0.12 | — | — | — | — | — |
| `voyage-4` | 0.06 | — | — | — | — | — |
| `voyage-4-lite` | 0.02 | — | — | — | — | — |
| `voyage-code-4` | 0.12 | — | — | — | — | — |
| `voyage-context-4` | 0.12 | — | — | — | — | — |
| `voyage-finance-2` | 0.12 | — | — | — | — | — |
| `voyage-law-2` | 0.12 | — | — | — | — | — |
| `voyage-code-2` | 0.12 | — | — | — | — | — |
| `voyage-multilingual-2` | 0.12 | — | — | — | — | — |
| `voyage-context-3` | 0.18 | — | — | — | — | — |
| `voyage-code-3` | 0.18 | — | — | — | — | — |
| `voyage-3-large` | 0.18 | — | — | — | — | — |
| `voyage-3.5` | 0.06 | — | — | — | — | — |
| `voyage-3` | 0.06 | — | — | — | — | — |
| `voyage-3.5-lite` | 0.02 | — | — | — | — | — |
| `voyage-3-lite` | 0.02 | — | — | — | — | — |
| `voyage-large-2-instruct` | 0.12 | — | — | — | — | — |
| `voyage-large-2` | 0.12 | — | — | — | — | — |
| `voyage-01` | 0.1 | — | — | — | — | — |
| `voyage-lite-01` | 0.1 | — | — | — | — | — |
| `voyage-lite-01-instruct` | 0.1 | — | — | — | — | — |
| `voyage-02` | 0.1 | — | — | — | — | — |
| `voyage-lite-02-instruct` | 0.1 | — | — | — | — | — |
| `voyage-2` | 0.1 | — | — | — | — | — |
| `rerank-3` | — | — | — | — | input_tokens | 0.05 |
| `rerank-2.5` | — | — | — | — | input_tokens | 0.05 |
| `rerank-2` | — | — | — | — | input_tokens | 0.05 |
| `rerank-1` | — | — | — | — | input_tokens | 0.05 |
| `rerank-3-lite` | — | — | — | — | input_tokens | 0.02 |
| `rerank-2.5-lite` | — | — | — | — | input_tokens | 0.02 |
| `rerank-2-lite` | — | — | — | — | input_tokens | 0.02 |
| `rerank-lite-1` | — | — | — | — | input_tokens | 0.02 |

### cohere

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `command-a-03-2025` | 2.5 | 10 | — | — | — | — |
| `command-r7b-12-2024` | 0.0375 | 0.15 | — | — | — | — |
| `command-r-08-2024` | 0.15 | 0.6 | — | — | — | — |
| `command-r-plus-08-2024` | 2.5 | 10 | — | — | — | — |
| `command-r` | 0.5 | 1.5 | — | — | — | — |
| `command-r-plus` | 3 | 15 | — | — | — | — |
| `command` | 1 | 2 | — | — | — | — |
| `command-light` | 0.3 | 0.6 | — | — | — | — |
| `c4ai-aya-expanse-8b` | 0.5 | 1.5 | — | — | — | — |
| `c4ai-aya-expanse-32b` | 0.5 | 1.5 | — | — | — | — |
| `embed-v5.0-pro` | 0.12 | — | — | — | — | — |
| `embed-v5.0-fast` | 0.08 | — | — | — | — | — |
| `rerank-v4.0-pro` | — | — | — | — | search_units | 0.0025 |
| `rerank-v4.0-fast` | — | — | — | — | search_units | 0.002 |

### jina

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `jina-embeddings-v5-text-small` | 0.05 | — | — | — | — | — |
| `jina-embeddings-v5-text-nano` | 0.05 | — | — | — | — | — |
| `jina-embeddings-v5-omni-small` | 0.05 | — | — | — | — | — |
| `jina-embeddings-v5-omni-nano` | 0.05 | — | — | — | — | — |
| `jina-embeddings-v4` | 0.05 | — | — | — | — | — |
| `jina-embeddings-v3` | 0.05 | — | — | — | — | — |
| `jina-code-embeddings-0.5b` | 0.05 | — | — | — | — | — |
| `jina-code-embeddings-1.5b` | 0.05 | — | — | — | — | — |
| `jina-clip-v2` | 0.05 | — | — | — | — | — |
| `jina-reranker-v3.5` | — | — | — | — | input_tokens | 0.05 |
| `jina-reranker-v3` | — | — | — | — | input_tokens | 0.05 |
| `jina-reranker-m0` | — | — | — | — | input_tokens | 0.05 |
| `jina-reranker-v2-base-multilingual` | — | — | — | — | input_tokens | 0.05 |

### deepseek

| Model ID | Input | Output | Cache read | Cache write | Reranking basis | Reranking rate |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `deepseek-flash` | 0.3 | 1.2 | 0.006 | — | — | — |
| `deepseek-v4-flash` | 0.3 | 1.2 | 0.006 | — | — | — |
| `deepseek-v4-flash-vision-exp` | 0.3 | 1.2 | 0.006 | — | — | — |
| `deepseek-v4-pro` | 1.32 | 3.96 | 0.044 | — | — | — |
