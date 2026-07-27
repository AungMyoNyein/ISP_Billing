<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AuthLogController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\RouterController;
use App\Http\Controllers\Api\ServicePlanController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\StatusController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    // Dashboard & status
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/status', [StatusController::class, 'index'])->middleware('permission:network.view');

    // CRM — customers
    Route::middleware('permission:customers.view')->group(function () {
        Route::get('/customers', [CustomerController::class, 'index']);
        Route::get('/customers/filter-options', [CustomerController::class, 'filterOptions']);
        Route::get('/customers/{customer}', [CustomerController::class, 'show']);
        Route::get('/customers/{customer}/usage', [CustomerController::class, 'usage']);
        Route::get('/customers/{customer}/onu', [CustomerController::class, 'onuStatus']);
    });
    Route::middleware('permission:customers.manage')->group(function () {
        Route::post('/customers', [CustomerController::class, 'store']);
        Route::put('/customers/{customer}', [CustomerController::class, 'update']);
        Route::delete('/customers/{customer}', [CustomerController::class, 'destroy']);
        Route::post('/customers/{customer}/suspend', [CustomerController::class, 'suspend']);
        Route::post('/customers/{customer}/reconnect', [CustomerController::class, 'reconnect']);
    });

    // Service plans
    Route::get('/plans', [ServicePlanController::class, 'index'])->middleware('permission:plans.view');
    Route::get('/plans/{servicePlan}', [ServicePlanController::class, 'show'])->middleware('permission:plans.view');
    Route::middleware('permission:plans.manage')->group(function () {
        Route::post('/plans', [ServicePlanController::class, 'store']);
        Route::put('/plans/{servicePlan}', [ServicePlanController::class, 'update']);
        Route::delete('/plans/{servicePlan}', [ServicePlanController::class, 'destroy']);
    });

    // Billing — invoices, payments, renewals, expiring, suspended
    Route::middleware('permission:billing.view')->group(function () {
        Route::get('/invoices', [InvoiceController::class, 'index']);
        Route::get('/invoices/{invoice}', [InvoiceController::class, 'show']);
        Route::get('/payments', [PaymentController::class, 'index']);
        Route::get('/payments/{payment}', [PaymentController::class, 'show']);
        Route::get('/billing/renewals', [BillingController::class, 'renewals']);
        Route::get('/billing/expiring', [BillingController::class, 'expiring']);
        Route::get('/billing/suspended', [BillingController::class, 'suspended']);
    });
    Route::middleware('permission:billing.manage')->group(function () {
        Route::post('/invoices', [InvoiceController::class, 'store']);
        Route::put('/invoices/{invoice}', [InvoiceController::class, 'update']);
        Route::delete('/invoices/{invoice}', [InvoiceController::class, 'destroy']);
        Route::post('/invoices/{invoice}/pay', [InvoiceController::class, 'markPaid']);
        Route::delete('/payments/{payment}', [PaymentController::class, 'destroy']);
        Route::post('/billing/renew/{customer}', [BillingController::class, 'renew']);
        Route::post('/billing/enforce', [BillingController::class, 'runEnforcement']);
    });

    // Network — routers & online sessions
    Route::middleware('permission:network.view')->group(function () {
        Route::get('/routers', [RouterController::class, 'index']);
        Route::get('/routers/{router}', [RouterController::class, 'show']);
        Route::get('/routers/{router}/check', [RouterController::class, 'check']);
        Route::get('/sessions/online', [SessionController::class, 'index']);
        Route::get('/sessions/auth-log', [AuthLogController::class, 'index']);
    });
    Route::middleware('permission:network.manage')->group(function () {
        Route::post('/routers', [RouterController::class, 'store']);
        Route::put('/routers/{router}', [RouterController::class, 'update']);
        Route::delete('/routers/{router}', [RouterController::class, 'destroy']);
        Route::post('/routers/{router}/disconnect-user', [RouterController::class, 'disconnectUser']);
    });

    // Reports
    Route::middleware('permission:reports.view')->prefix('reports')->group(function () {
        Route::get('/revenue', [ReportController::class, 'revenue']);
        Route::get('/customer-growth', [ReportController::class, 'customerGrowth']);
        Route::get('/plan-distribution', [ReportController::class, 'planDistribution']);
        Route::get('/receivables', [ReportController::class, 'receivables']);
    });

    // Administration
    Route::middleware('permission:admin.users')->group(function () {
        Route::apiResource('users', UserController::class);
    });
    Route::middleware('permission:admin.roles')->group(function () {
        Route::apiResource('roles', RoleController::class);
    });
    Route::middleware('permission:admin.settings')->group(function () {
        Route::get('/settings', [SettingController::class, 'index']);
        Route::put('/settings', [SettingController::class, 'update']);
    });
    Route::get('/audit-logs', [AuditLogController::class, 'index'])->middleware('permission:admin.audit');
    Route::middleware('permission:admin.backup')->group(function () {
        Route::get('/backups', [BackupController::class, 'index']);
        Route::post('/backups', [BackupController::class, 'store']);
        Route::get('/backups/{name}/download', [BackupController::class, 'download']);
        Route::post('/backups/restore', [BackupController::class, 'restore']);
        Route::delete('/backups/{name}', [BackupController::class, 'destroy']);
    });
});
