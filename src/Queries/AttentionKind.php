<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;

/**
 * The kinds of run that need a look, in the order they are listed: the most pressing first. Each
 * kind is a condition on one row of `trail_traces` and the parameters of the runs list that keep
 * exactly the runs the condition keeps.
 */
enum AttentionKind: string
{
    case Failed = 'failed';
    case Incomplete = 'incomplete';
    case AwaitingApproval = 'awaiting_approval';
    case ChildFailed = 'child_failed';
    case Unpriced = 'unpriced';
    case Recovered = 'recovered';

    /**
     * The parameters of `GET /api/traces` that keep the runs of this kind, as the strings to send.
     *
     * @return array<string, string>
     */
    public function filters(): array
    {
        return match ($this) {
            self::Failed => ['status' => Status::Failed->value],
            self::Incomplete => ['status' => Status::Incomplete->value],
            self::AwaitingApproval => ['status' => Status::AwaitingApproval->value],
            self::ChildFailed => ['status' => Status::Completed->value, 'child_failed' => '1'],
            self::Unpriced => ['unpriced' => '1'],
            self::Recovered => ['recovered' => '1'],
        };
    }

    /**
     * The condition a row meets to be of this kind, with its bindings. The stale rule is the
     * list's: a running run created before the cutoff shows as incomplete.
     *
     * @return array{0: literal-string, 1: list<mixed>}
     */
    public function condition(string $cutoff): array
    {
        return match ($this) {
            self::Failed => ['status = ?', [Status::Failed->value]],
            self::Incomplete => ['(status = ? or (status = ? and created_at < ?))', [Status::Incomplete->value, Status::Running->value, $cutoff]],
            self::AwaitingApproval => ['status = ?', [Status::AwaitingApproval->value]],
            self::ChildFailed => ['(status = ? and child_failed = ?)', [Status::Completed->value, true]],
            self::Unpriced => ['unpriced_span_count > 0', []],
            self::Recovered => ['recovered = ?', [true]],
        };
    }
}
