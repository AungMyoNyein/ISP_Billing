{{--
  Table-based layout with inline styles on purpose: mail clients strip <style>
  blocks and have no flexbox or grid worth relying on.
--}}
@php
    $money = fn ($v) => number_format((float) $v).' '.$currency;
    $num = fn ($v) => number_format((int) $v);
    $cell = 'padding:8px 12px;border-bottom:1px solid #e5e8ec;font-size:14px;color:#0f172a;';
    $label = 'padding:8px 12px;border-bottom:1px solid #e5e8ec;font-size:14px;color:#64748b;';
    $head = 'margin:24px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;';
@endphp
<div style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e8ec;border-radius:8px;padding:24px;">

    <h1 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">{{ $company }}</h1>
    <p style="margin:4px 0 0;font-size:14px;color:#64748b;">
      {{ ucfirst($digest['frequency']) }} report — {{ $digest['period_label'] }}
    </p>

    <h2 style="{{ $head }}">In this period</h2>
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;">
      <tr><td style="{{ $label }}">New customers</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['period']['new_customers']) }}</td></tr>
      <tr><td style="{{ $label }}">Invoices raised</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['period']['invoices_raised']) }}</td></tr>
      <tr><td style="{{ $label }}">Invoiced</td><td style="{{ $cell }}text-align:right;">{{ $money($digest['period']['invoiced_amount']) }}</td></tr>
      <tr><td style="{{ $label }}">Payments received</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['period']['payments_received']) }}</td></tr>
      <tr><td style="{{ $label }}">Revenue collected</td><td style="{{ $cell }}text-align:right;font-weight:700;">{{ $money($digest['period']['revenue_collected']) }}</td></tr>
    </table>

    <h2 style="{{ $head }}">Where things stand</h2>
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;">
      <tr><td style="{{ $label }}">Total customers</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['standing']['total_customers']) }}</td></tr>
      <tr><td style="{{ $label }}">Active</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['standing']['active_customers']) }}</td></tr>
      <tr><td style="{{ $label }}">Suspended</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['standing']['suspended_customers']) }}</td></tr>
      <tr><td style="{{ $label }}">Expired</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['standing']['expired_customers']) }}</td></tr>
      <tr><td style="{{ $label }}">Expiring within 7 days</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['standing']['expiring_in_7_days']) }}</td></tr>
      <tr><td style="{{ $label }}">Online now</td><td style="{{ $cell }}text-align:right;">
        {{ $digest['standing']['online_users'] === null ? 'RADIUS unreachable' : $num($digest['standing']['online_users']) }}
      </td></tr>
      <tr><td style="{{ $label }}">Unpaid invoices</td><td style="{{ $cell }}text-align:right;">{{ $num($digest['standing']['unpaid_invoices']) }}</td></tr>
      <tr><td style="{{ $label }}">Outstanding</td><td style="{{ $cell }}text-align:right;font-weight:700;">{{ $money($digest['standing']['outstanding_amount']) }}</td></tr>
    </table>

    @if (count($digest['top_plans']) > 0)
      <h2 style="{{ $head }}">Customers per plan</h2>
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;">
        @foreach ($digest['top_plans'] as $plan)
          <tr><td style="{{ $label }}">{{ $plan['name'] }}</td><td style="{{ $cell }}text-align:right;">{{ $num($plan['customers']) }}</td></tr>
        @endforeach
      </table>
    @endif

    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
      Covers {{ $digest['from'] }} to {{ $digest['to'] }}. Sent automatically by ISP Billing —
      change the schedule under Administration → System Settings.
    </p>
  </div>
</div>
