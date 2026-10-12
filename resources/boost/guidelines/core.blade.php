## Trail

Trail records Laravel AI SDK agent runs in the application's database. Use the
`trail-list-traces`, `trail-show-trace`, and `trail-show-conversation` Boost MCP tools when
diagnosing recorded runs. Use `trail-usage-summary` for token and cost trends by model, provider,
or agent. They read existing traces and do not execute agents. Trace costs are estimates, and
missing usage or cost is not zero. Run `php artisan migrate` after installing or upgrading Trail.
