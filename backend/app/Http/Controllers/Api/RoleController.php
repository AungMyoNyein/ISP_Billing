<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    /** Permission keys understood by the API (used to render the role editor). */
    public const PERMISSIONS = [
        'customers.view', 'customers.manage',
        'plans.view', 'plans.manage',
        'billing.view', 'billing.manage',
        'network.view', 'network.manage',
        'reports.view',
        'admin.users', 'admin.roles', 'admin.settings', 'admin.audit', 'admin.backup',
    ];

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Role::withCount('users')->orderBy('name')->get(),
            'available_permissions' => self::PERMISSIONS,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateData($request);
        $role = Role::create($data);
        AuditLog::record('created', $role, ['name' => $role->name]);

        return response()->json($role, 201);
    }

    public function show(Role $role): JsonResponse
    {
        return response()->json($role->loadCount('users'));
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        abort_if($role->is_system && $request->input('name') !== $role->name, 422, 'System roles cannot be renamed.');
        $role->update($this->validateData($request, $role));
        AuditLog::record('updated', $role, $role->getChanges());

        return response()->json($role);
    }

    public function destroy(Role $role): JsonResponse
    {
        abort_if($role->is_system, 422, 'System roles cannot be deleted.');
        abort_if($role->users()->exists(), 422, 'Role has users assigned; reassign them first.');
        $role->delete();
        AuditLog::record('deleted', $role, ['name' => $role->name]);

        return response()->json(['message' => 'Role deleted.']);
    }

    private function validateData(Request $request, ?Role $role = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:50', Rule::unique('roles')->ignore($role)],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['required', 'array'],
            'permissions.*' => ['string', Rule::in([...self::PERMISSIONS, '*'])],
        ]);
    }
}
