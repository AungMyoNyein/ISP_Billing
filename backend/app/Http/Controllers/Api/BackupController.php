<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * MySQL/MariaDB backup & restore using mysqldump / mysql.
 * Dumps are SQL files stored in storage/app/backups (kept with a .dump
 * extension so existing backups and download links keep working).
 */
class BackupController extends Controller
{
    private function backupDir(): string
    {
        $dir = storage_path('app/backups');
        if (! is_dir($dir)) {
            mkdir($dir, 0750, true);
        }

        return $dir;
    }

    public function index(): JsonResponse
    {
        $files = collect(glob($this->backupDir().'/*.dump'))
            ->map(fn (string $path) => [
                'name' => basename($path),
                'size_bytes' => filesize($path),
                'created_at' => date('c', filemtime($path)),
            ])
            ->sortByDesc('created_at')
            ->values();

        return response()->json(['data' => $files]);
    }

    public function store(): JsonResponse
    {
        $config = config('database.connections.mysql');
        $file = $this->backupDir().'/isp_billing_'.now()->format('Ymd_His').'.dump';

        $result = Process::env(['MYSQL_PWD' => $config['password']])
            ->timeout(300)
            ->run([
                'mysqldump',
                '-h', $config['host'],
                '-P', (string) $config['port'],
                '-u', $config['username'],
                '--single-transaction', // consistent dump without locking
                '--routines', '--triggers', '--events',
                '--result-file='.$file,
                $config['database'],
            ]);

        if (! $result->successful()) {
            @unlink($file);

            return response()->json(['message' => 'Backup failed: '.$result->errorOutput()], 500);
        }

        AuditLog::record('backup_created', null, ['file' => basename($file)]);

        return response()->json([
            'name' => basename($file),
            'size_bytes' => filesize($file),
        ], 201);
    }

    public function download(string $name): BinaryFileResponse
    {
        $path = $this->safePath($name);

        return response()->download($path);
    }

    public function restore(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string']]);
        $path = $this->safePath($data['name']);
        $config = config('database.connections.mysql');

        // mysqldump output is a SQL script; feed it back through the mysql
        // client on stdin. --result-file dumps are plain SQL, so this both
        // drops/recreates and repopulates the schema.
        $result = Process::env(['MYSQL_PWD' => $config['password']])
            ->timeout(600)
            ->input(file_get_contents($path))
            ->run([
                'mysql',
                '-h', $config['host'],
                '-P', (string) $config['port'],
                '-u', $config['username'],
                $config['database'],
            ]);

        if (! $result->successful()) {
            return response()->json(['message' => 'Restore failed: '.$result->errorOutput()], 500);
        }

        AuditLog::record('backup_restored', null, ['file' => $data['name']]);

        return response()->json(['message' => 'Database restored from '.$data['name']]);
    }

    public function destroy(string $name): JsonResponse
    {
        unlink($this->safePath($name));
        AuditLog::record('backup_deleted', null, ['file' => $name]);

        return response()->json(['message' => 'Backup deleted.']);
    }

    private function safePath(string $name): string
    {
        abort_if(basename($name) !== $name || ! str_ends_with($name, '.dump'), 422, 'Invalid backup name.');
        $path = $this->backupDir().'/'.$name;
        abort_unless(is_file($path), 404, 'Backup not found.');

        return $path;
    }
}
