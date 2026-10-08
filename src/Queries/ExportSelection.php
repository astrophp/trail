<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The runs an export is narrowed to by `ids`, a comma-separated list of run ids. Absent or empty
 * means every run in the view.
 */
final class ExportSelection
{
    public const MAXIMUM_IDS = 100;

    /**
     * @return list<string>|null null when no ids were sent
     *
     * @throws ValidationException when ids is not a list of at most 100 possible run ids
     */
    public static function fromRequest(Request $request): ?array
    {
        $value = $request->query('ids');

        if ($value === null || $value === '') {
            return null;
        }

        if (! is_string($value)) {
            throw ValidationException::withMessages(['ids' => 'The ids must be a comma-separated list of run ids.']);
        }

        $ids = explode(',', $value);

        if (count($ids) > self::MAXIMUM_IDS) {
            throw ValidationException::withMessages(['ids' => 'The ids can hold at most '.self::MAXIMUM_IDS.' run ids.']);
        }

        foreach ($ids as $id) {
            if ($id === '' || ! TraceId::isPossible($id)) {
                throw ValidationException::withMessages(['ids' => 'The ids must be run ids separated by commas.']);
            }
        }

        return array_values(array_unique($ids));
    }
}
