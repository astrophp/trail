<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\ConversationResource;
use Astro\Trail\Http\Resources\ResolvedUsers;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Http\Resources\TurnResource;
use Astro\Trail\Queries\ConversationId;
use Astro\Trail\Queries\Conversations;
use Astro\Trail\Queries\ConversationTurns;
use Astro\Trail\Queries\TraceDetail;
use Astro\Trail\Queries\TurnWindow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\HeaderUtils;

class ConversationTranscriptController
{
    public function __invoke(Request $request, Conversations $conversations, ConversationTurns $turns, TraceDetail $detail): JsonResponse
    {
        // An id the column could not hold is no conversation, and is not sent to the database.
        $id = self::requestedId($request);
        abort_unless($id !== null && ConversationId::isPossible($id), 404);

        $window = TurnWindow::fromRequest($request);

        $summary = $conversations->summaries([$id])[0] ?? null;
        abort_if($summary === null, 404);

        $total = $summary->turns['all'];

        // An anchor that is not a turn of this conversation (pruned, or another's) leaves the newest turns.
        $anchored = $window->anchorId === null ? null : $turns->anchor($id, $window->anchorId);
        $traces = $turns->window($id, $window->limit, $anchored === null ? null : $window->anchor, $anchored);

        $first = $traces->first();
        $last = $traces->last();

        $outside = match (true) {
            $first !== null && $last !== null => $turns->beyond($id, $first->id, $last->id),
            $window->anchor === 'before' && $anchored !== null => ['older' => 0, 'newer' => $total],
            $window->anchor === 'after' && $anchored !== null => ['older' => $total, 'newer' => 0],
            default => ['older' => 0, 'newer' => 0],
        };

        $pages = $detail->spansOf($traces);

        // The header and the turns share their users, so a user is looked up once.
        $pairs = [];

        foreach ($traces as $trace) {
            $pairs[] = [$trace->user_type, $trace->user_id];
        }

        foreach ($summary->users as $user) {
            $pairs[] = [$user['type'], $user['id']];
        }

        $users = ResolvedUsers::of($pairs);
        $resource = new TurnResource(TraceResource::of($traces, $users));

        $items = [];

        foreach ($traces as $trace) {
            $page = $pages[$trace->id];
            $items[] = $resource->toArray($trace, $page['spans'], $page['total'], $page['truncated']);
        }

        return response()->json([
            'data' => [
                'conversation' => (new ConversationResource($users))->toArray($summary),
                'turns' => $items,
            ],
            'turn_limit' => ['limit' => $window->limit, 'total' => $total, 'truncated' => $outside['older'] + $outside['newer'] > 0],
            'window' => [
                'older' => $outside['older'],
                'newer' => $outside['newer'],
                'anchor' => $window->anchor === null ? null : ['param' => $window->anchor, 'id' => $anchored ?? $window->anchorId, 'found' => $anchored !== null],
            ],
        ]);
    }

    /**
     * The id from the raw query string. The request's own query has been through the framework's
     * middleware, which trims a value, and a conversation id may start or end with a space.
     */
    private static function requestedId(Request $request): ?string
    {
        $query = $request->server->get('QUERY_STRING');
        $id = HeaderUtils::parseQuery(is_string($query) ? $query : '')['id'] ?? null;

        return is_string($id) ? $id : null;
    }
}
