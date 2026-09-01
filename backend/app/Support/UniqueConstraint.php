<?php

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Validation\ValidationException;

final class UniqueConstraint
{
    /** @var array<string, array{0: string, 1: string}> */
    private const MAP = [
        'customers_username_unique' => ['username', 'This PPPoE username is already in use.'],
        'customers_customer_code_unique' => ['customer_code', 'This customer ID is already in use.'],
        'customers_smartolt_onu_sn_unique' => ['smartolt_onu_sn', 'This ONU serial is already assigned to another customer.'],
    ];

    public static function toValidationException(QueryException $e): ?ValidationException
    {
        if (($e->errorInfo[0] ?? null) !== '23505') {
            return null;
        }

        foreach (self::MAP as $constraint => [$field, $message]) {
            if (str_contains($e->getMessage(), $constraint)) {
                return ValidationException::withMessages([$field => [$message]]);
            }
        }

        return null;
    }
}
