<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Queries\TraceId;
use Astro\Trail\Storage\Models\Bookmark;
use Astro\Trail\Storage\Models\Trace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Ai\Models\Conversation;
use Throwable;

/**
 * Bookmarks are shared: one per run, kept by whoever added it first, removable by anyone who can
 * open the dashboard. Both endpoints are idempotent and answer with the run's bookmark state.
 */
class TraceBookmarkController
{
    public function store(Request $request, string $id): JsonResponse
    {
        $this->ensureExists($id);

        [$userId, $userType] = $this->user($request);

        // createOrFirst() resolves the race between two requests on the unique index, in a savepoint
        // when a transaction is open, so the second one reads the first one's row instead of failing.
        Bookmark::query()->firstOrCreate(['trace_id' => $id], ['user_id' => $userId, 'user_type' => $userType]);

        return $this->state($id, true);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->ensureExists($id);

        Bookmark::query()->where('trace_id', $id)->delete();

        return $this->state($id, false);
    }

    /**
     * Without a column read, so a run's large columns stay in the database. An id the column could
     * not hold is no run and is not sent to the database.
     */
    private function ensureExists(string $id): void
    {
        abort_unless(TraceId::isPossible($id), 404);
        abort_unless(Trace::query()->whereKey($id)->exists(), 404);
    }

    /**
     * The user of the dashboard's guard, recorded the way capture records a run's user: the SDK's
     * own type (the morph class of a model, else the class name) and key. Nulls without a user, or when the user cannot be read.
     *
     * @return array{0: ?string, 1: ?string}
     */
    private function user(Request $request): array
    {
        try {
            $guard = config('trail.guard');
            $user = $request->user(is_string($guard) && $guard !== '' ? $guard : null);

            if ($user === null) {
                return [null, null];
            }

            return [(string) Conversation::participantKey($user), Conversation::participantType($user)];
        } catch (Throwable) {
            // An unknown guard throws; the access check does not read the guard in the local environment.
            return [null, null];
        }
    }

    private function state(string $id, bool $bookmarked): JsonResponse
    {
        return response()->json(['data' => ['trace_id' => $id, 'bookmarked' => $bookmarked]]);
    }
}
