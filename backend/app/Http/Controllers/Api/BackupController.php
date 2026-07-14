<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * MySQL backup & restore using mysqldump / mysql.
 * Dumps are plain SQL, stored in storage/app/backups.
 *
 * The password is passed via MYSQL_PWD rather than -p so it never appears
 * in the process list.
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
        $files = collect(glob($this->backupDir().'/*.sql'))
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
        $config = config('database.connections.'.config('database.default'));
        $file = $this->backupDir().'/isp_billing_'.now()->format('Ymd_His').'.sql';

        $result = Process::env(['MYSQL_PWD' => $config['password']])
            ->timeout(300)
            ->run([
                'mysqldump',
                '-h', $config['host'],
                '-P', (string) $config['port'],
                '-u', $config['username'],
                '--single-transaction',  // consistent InnoDB dump without locking writers out
                '--add-drop-table',      // so a restore replaces existing tables
                '--routines',
                '--triggers',
                '--result-file='.$file,  // written directly: Process gives us no shell to redirect with
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
        $config = config('database.connections.'.config('database.default'));

        // The dump is fed on stdin as a stream, so a large backup is never
        // held in memory. The DROP TABLE statements in it do the "clean".
        $handle = @fopen($path, 'r');

        // Without this, a failed open would feed mysql an empty stdin: it
        // exits 0 and we would report a successful restore that did nothing.
        if ($handle === false) {
            return response()->json(['message' => 'Restore failed: cannot read '.$data['name']], 500);
        }

        $result = Process::env(['MYSQL_PWD' => $config['password']])
            ->timeout(600)
            ->input($handle)
            ->run([
                'mysql',
                '-h', $config['host'],
                '-P', (string) $config['port'],
                '-u', $config['username'],
                $config['database'],
            ]);

        if (is_resource($handle)) {
            fclose($handle);
        }

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
        abort_if(basename($name) !== $name || ! str_ends_with($name, '.sql'), 422, 'Invalid backup name.');
        $path = $this->backupDir().'/'.$name;
        abort_unless(is_file($path), 404, 'Backup not found.');

        return $path;
    }
}
