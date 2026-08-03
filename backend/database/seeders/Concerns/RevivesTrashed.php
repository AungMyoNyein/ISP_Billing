<?php

namespace Database\Seeders\Concerns;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * updateOrCreate() for models that soft-delete and carry a unique column.
 *
 * The plain call looks the row up through the soft-delete scope, so a trashed
 * row is invisible to it — but the unique index still holds that value, with
 * no `deleted_at IS NULL` predicate to exclude it. The INSERT that follows
 * therefore fails:
 *
 *     duplicate key value violates unique constraint "routers_name_unique"
 *     Key (name)=(Core-Yangon) already exists.
 *
 * which is what re-seeding a database where a seeded row had been deleted
 * from the UI produced. Looking through withTrashed() finds the row and
 * un-deletes it, which is what an operator re-running the seeder means.
 */
trait RevivesTrashed
{
    /**
     * @param  class-string<Model>  $model
     * @param  array<string, mixed>  $lookup
     * @param  array<string, mixed>  $values
     */
    protected function reviveOrCreate(string $model, array $lookup, array $values): Model
    {
        $query = in_array(SoftDeletes::class, class_uses_recursive($model), true)
            ? $model::withTrashed()
            : $model::query();

        $record = $query->firstOrNew($lookup);

        if (method_exists($record, 'trashed') && $record->trashed()) {
            $record->deleted_at = null;
        }

        $record->fill($values)->save();

        return $record;
    }
}
