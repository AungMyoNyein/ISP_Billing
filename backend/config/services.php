<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'smartolt' => [
        'base_url' => env('SMARTOLT_BASE_URL'),
        'api_key' => env('SMARTOLT_API_KEY'),
    ],

    'radius' => [
        // Command run after the nas table changes so FreeRADIUS re-reads its
        // SQL clients. It only loads clients at startup, so a full restart is
        // required (a reload/HUP does not re-read the nas table). Set empty to
        // disable; the web user needs permission to run it (e.g. a sudoers rule).
        'reload_command' => env('RADIUS_RELOAD_COMMAND', 'sudo -n systemctl restart freeradius'),

        // How long a session may go without an accounting update before it
        // stops counting as online. A radacct row is only closed by an
        // Accounting-Stop, so a NAS that reboots or loses its uplink leaves
        // sessions open forever and every "online" figure freezes.
        //
        // This relies on interim accounting: plans set Acct-Interim-Interval,
        // and the NAS must be configured to send updates. Raise it if your
        // interval is longer than a few minutes; set 0 to disable the check
        // and go back to trusting acctstoptime alone.
        'session_stale_minutes' => (int) env('RADIUS_SESSION_STALE_MINUTES', 30),
    ],

];
