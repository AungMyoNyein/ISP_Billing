<?php

namespace App\Services\RouterOs;

/**
 * Minimal MikroTik RouterOS API client (binary protocol over TCP 8728/8729).
 *
 * Implements the word/sentence framing and the post-6.43 plain login.
 * No external dependencies so the system stays deployable anywhere.
 */
class RouterOsClient
{
    /** @var resource|null */
    private $socket = null;

    public function __construct(
        private readonly string $host,
        private readonly string $username,
        private readonly string $password,
        private readonly int $port = 8728,
        private readonly bool $ssl = false,
        private readonly int $timeout = 5,
    ) {
    }

    public function connect(): void
    {
        $scheme = $this->ssl ? 'ssl://' : 'tcp://';
        $context = stream_context_create($this->ssl ? [
            'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
        ] : []);

        $socket = @stream_socket_client(
            $scheme.$this->host.':'.$this->port,
            $errno,
            $errstr,
            $this->timeout,
            STREAM_CLIENT_CONNECT,
            $context,
        );

        if ($socket === false) {
            throw new RouterOsException("Cannot connect to {$this->host}:{$this->port} — {$errstr} ({$errno})");
        }

        stream_set_timeout($socket, $this->timeout);
        $this->socket = $socket;
        $this->login();
    }

    private function login(): void
    {
        $response = $this->command('/login', [
            'name' => $this->username,
            'password' => $this->password,
        ]);

        if (($response[0]['type'] ?? '') !== '!done') {
            throw new RouterOsException('RouterOS login failed: '.json_encode($response));
        }
    }

    /**
     * Run a command and return parsed reply sentences.
     *
     * @param  array<string, string>  $attributes  =key=value attributes
     * @param  array<string, string>  $queries  ?key=value query words
     * @return array<int, array{type: string, attributes: array<string, string>}>
     */
    public function command(string $command, array $attributes = [], array $queries = []): array
    {
        if ($this->socket === null) {
            $this->connect();
        }

        $words = [$command];
        foreach ($attributes as $key => $value) {
            $words[] = '='.$key.'='.$value;
        }
        foreach ($queries as $key => $value) {
            $words[] = '?'.$key.'='.$value;
        }
        $this->writeSentence($words);

        $sentences = [];
        while (true) {
            $sentence = $this->readSentence();
            if ($sentence === []) {
                continue;
            }

            $type = $sentence[0];
            $parsed = ['type' => $type, 'attributes' => []];
            foreach (array_slice($sentence, 1) as $word) {
                if (str_starts_with($word, '=')) {
                    [$key, $value] = array_pad(explode('=', substr($word, 1), 2), 2, '');
                    $parsed['attributes'][$key] = $value;
                }
            }
            $sentences[] = $parsed;

            if ($type === '!done') {
                break;
            }
            if ($type === '!fatal') {
                $this->disconnect();
                throw new RouterOsException('RouterOS fatal: '.implode(' ', array_slice($sentence, 1)));
            }
        }

        foreach ($sentences as $sentence) {
            if ($sentence['type'] === '!trap') {
                throw new RouterOsException('RouterOS error: '.($sentence['attributes']['message'] ?? 'unknown'));
            }
        }

        return $sentences;
    }

    /**
     * Convenience: run a print command and return only the !re rows.
     *
     * @return array<int, array<string, string>>
     */
    public function query(string $command, array $queries = []): array
    {
        $rows = [];
        foreach ($this->command($command, [], $queries) as $sentence) {
            if ($sentence['type'] === '!re') {
                $rows[] = $sentence['attributes'];
            }
        }

        return $rows;
    }

    private function writeSentence(array $words): void
    {
        $data = '';
        foreach ($words as $word) {
            $data .= $this->encodeLength(strlen($word)).$word;
        }
        $data .= $this->encodeLength(0);

        if (@fwrite($this->socket, $data) === false) {
            throw new RouterOsException('Failed writing to RouterOS socket');
        }
    }

    /** @return list<string> */
    private function readSentence(): array
    {
        $words = [];
        while (true) {
            $length = $this->readLength();
            if ($length === 0) {
                break;
            }
            $words[] = $this->readBytes($length);
        }

        return $words;
    }

    private function encodeLength(int $length): string
    {
        return match (true) {
            $length < 0x80 => chr($length),
            $length < 0x4000 => pack('n', $length | 0x8000),
            $length < 0x200000 => substr(pack('N', $length | 0xC00000), 1),
            $length < 0x10000000 => pack('N', $length | 0xE0000000),
            default => chr(0xF0).pack('N', $length),
        };
    }

    private function readLength(): int
    {
        $byte = ord($this->readBytes(1));

        if (($byte & 0x80) === 0) {
            return $byte;
        }
        if (($byte & 0xC0) === 0x80) {
            return (($byte & ~0xC0) << 8) + ord($this->readBytes(1));
        }
        if (($byte & 0xE0) === 0xC0) {
            $rest = unpack('n', $this->readBytes(2))[1];

            return (($byte & ~0xE0) << 16) + $rest;
        }
        if (($byte & 0xF0) === 0xE0) {
            $rest = unpack('N', "\0".$this->readBytes(3))[1];

            return (($byte & ~0xF0) << 24) + $rest;
        }

        return unpack('N', $this->readBytes(4))[1];
    }

    private function readBytes(int $length): string
    {
        $data = '';
        while (strlen($data) < $length) {
            $chunk = @fread($this->socket, $length - strlen($data));
            if ($chunk === false || $chunk === '') {
                throw new RouterOsException('RouterOS connection closed unexpectedly');
            }
            $data .= $chunk;
        }

        return $data;
    }

    public function disconnect(): void
    {
        if ($this->socket !== null) {
            @fclose($this->socket);
            $this->socket = null;
        }
    }

    public function __destruct()
    {
        $this->disconnect();
    }
}
