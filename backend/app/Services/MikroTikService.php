<?php

namespace App\Services;

use App\Models\Router;
use App\Services\RouterOs\RouterOsClient;
use App\Services\RouterOs\RouterOsException;
use Illuminate\Support\Facades\Log;

class MikroTikService
{
    /** @var array<int, RouterOsClient> */
    private array $clients = [];

    private function client(Router $router): RouterOsClient
    {
        return $this->clients[$router->id] ??= new RouterOsClient(
            host: $router->host,
            username: $router->username,
            password: $router->password,
            port: $router->api_port,
            ssl: $router->use_ssl,
        );
    }

    /**
     * Probe the router; update cached status/resource columns.
     *
     * @return array{online: bool, resource: array<string, string>|null, error: string|null}
     */
    public function checkStatus(Router $router): array
    {
        try {
            $rows = $this->client($router)->query('/system/resource/print');
            $resource = $rows[0] ?? [];

            $router->forceFill([
                'status' => 'online',
                'last_seen_at' => now(),
                'last_resource' => $resource,
            ])->save();

            return ['online' => true, 'resource' => $resource, 'error' => null];
        } catch (RouterOsException $e) {
            $router->forceFill(['status' => 'offline'])->save();
            Log::warning("MikroTik [{$router->name}] unreachable: {$e->getMessage()}");

            return ['online' => false, 'resource' => null, 'error' => $e->getMessage()];
        }
    }

    /**
     * Active PPP (PPPoE) sessions on the router.
     *
     * @return array<int, array<string, string>>
     */
    public function activePppSessions(Router $router): array
    {
        return $this->client($router)->query('/ppp/active/print');
    }

    /** Kick a PPPoE user so it re-authenticates against RADIUS. */
    public function disconnectPppUser(Router $router, string $username): bool
    {
        $client = $this->client($router);
        $sessions = $client->query('/ppp/active/print', ['name' => $username]);

        foreach ($sessions as $session) {
            if (isset($session['.id'])) {
                $client->command('/ppp/active/remove', ['.id' => $session['.id']]);
            }
        }

        return $sessions !== [];
    }

    /**
     * Apply a rate limit to a live session via simple queue
     * (used when changing plan without waiting for re-auth).
     */
    public function setQueueRateLimit(Router $router, string $queueName, string $target, string $rateLimit): void
    {
        $client = $this->client($router);
        $existing = $client->query('/queue/simple/print', ['name' => $queueName]);

        if ($existing === []) {
            $client->command('/queue/simple/add', [
                'name' => $queueName,
                'target' => $target,
                'max-limit' => $rateLimit,
            ]);
        } else {
            $client->command('/queue/simple/set', [
                '.id' => $existing[0]['.id'],
                'max-limit' => $rateLimit,
            ]);
        }
    }

    public function disconnect(Router $router): void
    {
        if (isset($this->clients[$router->id])) {
            $this->clients[$router->id]->disconnect();
            unset($this->clients[$router->id]);
        }
    }
}
