import * as React from 'react';
import { toast } from '@/lib/notify';
import { Save, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { InlineAlert } from '@/components/shared/ErrorState';
import { Field, FormError } from '@/components/shared/Form';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { useInitTokens, useSettings, useTokens, useUpdateSettings } from '@/hooks/useApi';
import { PERMISSIONS } from '@/lib/permissions';
import { errorMessage } from '@/lib/api';

export function SettingsPage() {
  const settings = useSettings();
  const tokens = useTokens({});
  const update = useUpdateSettings();
  const initTokens = useInitTokens();
  const [form, setForm] = React.useState({
    businessName: '',
    reportHeader: '',
    currentSchemeMonth: '1',
    allowPartialPayments: true,
    allowMultipleMonthPayments: false,
    duplicateCnicPolicy: 'block',
    autoCloseOnDraw: true,
    receiptPrefix: 'RCPT',
    receiptSeqPadding: '6',
    installmentDueDayOfMonth: '',
    cnicMaskingEnabled: true,
    timezone: 'Asia/Karachi',
    reason: '',
  });

  React.useEffect(() => {
    if (!settings.data) return;
    const data = settings.data;
    setForm({
      businessName: data.businessName ?? '',
      reportHeader: data.reportHeader ?? '',
      currentSchemeMonth: String(data.currentSchemeMonth ?? 1),
      allowPartialPayments: data.allowPartialPayments,
      allowMultipleMonthPayments: data.allowMultipleMonthPayments,
      duplicateCnicPolicy: data.duplicateCnicPolicy,
      autoCloseOnDraw: data.autoCloseOnDraw,
      receiptPrefix: data.receiptPrefix ?? 'RCPT',
      receiptSeqPadding: String(data.receiptSeqPadding ?? 6),
      installmentDueDayOfMonth: data.installmentDueDayOfMonth ? String(data.installmentDueDayOfMonth) : '',
      cnicMaskingEnabled: data.cnicMaskingEnabled,
      timezone: data.timezone ?? 'Asia/Karachi',
      reason: '',
    });
  }, [settings.data]);

  const save = async () => {
    try {
      await update.mutateAsync({
        businessName: form.businessName || undefined,
        reportHeader: form.reportHeader || undefined,
        currentSchemeMonth: Number(form.currentSchemeMonth),
        allowPartialPayments: form.allowPartialPayments,
        allowMultipleMonthPayments: form.allowMultipleMonthPayments,
        duplicateCnicPolicy: form.duplicateCnicPolicy,
        autoCloseOnDraw: form.autoCloseOnDraw,
        receiptPrefix: form.receiptPrefix || undefined,
        receiptSeqPadding: Number(form.receiptSeqPadding),
        installmentDueDayOfMonth: form.installmentDueDayOfMonth ? Number(form.installmentDueDayOfMonth) : null,
        cnicMaskingEnabled: form.cnicMaskingEnabled,
        timezone: form.timezone || undefined,
        reason: form.reason || undefined,
      });
      toast.success('Settings saved');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Scheme-wide configuration. Every change is written to the audit log."
        actions={
          <PermissionGate requires={PERMISSIONS.SETTINGS_UPDATE}>
            <Button size="sm" onClick={save} disabled={update.isPending}>
              <Save className="h-4 w-4" /> {update.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </PermissionGate>
        }
      />

      <InlineAlert tone="info" title="Fixed by the scheme">
        120 tokens and a 28-month installment schedule are hard-coded in the business rules and cannot be changed here.
      </InlineAlert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Business</CardTitle>
            <CardDescription>Shown on receipts and printed reports.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
            <Field label="Report header"><Input value={form.reportHeader} onChange={(e) => setForm({ ...form, reportHeader: e.target.value })} /></Field>
            <Field label="Timezone"><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
            <Field label="Receipt prefix"><Input value={form.receiptPrefix} maxLength={12} onChange={(e) => setForm({ ...form, receiptPrefix: e.target.value })} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scheme</CardTitle>
            <CardDescription>Drives draw eligibility and due dates.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Current scheme month" hint="1 – 28">
              <Input type="number" min={1} max={28} value={form.currentSchemeMonth} onChange={(e) => setForm({ ...form, currentSchemeMonth: e.target.value })} />
            </Field>
            <Field label="Installment due day" hint="1 – 28, or leave empty for joining-date based">
              <Input type="number" min={1} max={28} value={form.installmentDueDayOfMonth} onChange={(e) => setForm({ ...form, installmentDueDayOfMonth: e.target.value })} />
            </Field>
            <Field label="Receipt sequence padding" hint="6 gives RCPT-2026-000001">
              <Input type="number" min={3} max={10} value={form.receiptSeqPadding} onChange={(e) => setForm({ ...form, receiptSeqPadding: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1.5"><Ticket className="h-3.5 w-3.5" /> {tokens.data?.total ?? 0} / 120 tokens</Badge>
              <PermissionGate requires={PERMISSIONS.SETTINGS_UPDATE}>
                <Button variant="outline" size="sm" disabled={initTokens.isPending} onClick={async () => {
                  try {
                    const result = await initTokens.mutateAsync();
                    toast.success(`${result.total} token slots present`);
                  } catch (error) {
                    toast.error(errorMessage(error));
                  }
                }}>
                  Ensure 120
                </Button>
              </PermissionGate>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment &amp; data rules</CardTitle>
            <CardDescription>Guards that keep the ledger consistent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle
              label="Allow partial payments"
              hint="A month can be marked Partial when less than the installment is paid."
              checked={form.allowPartialPayments}
              onChange={(value) => setForm({ ...form, allowPartialPayments: value })}
            />
            <Toggle
              label="Allow multi-month payments"
              hint="Let one payment cover several months in a single receipt."
              checked={form.allowMultipleMonthPayments}
              onChange={(value) => setForm({ ...form, allowMultipleMonthPayments: value })}
            />
            <Toggle
              label="Automatically close a customer when their draw is confirmed"
              hint="Stops future instalments immediately on confirmation."
              checked={form.autoCloseOnDraw}
              onChange={(value) => setForm({ ...form, autoCloseOnDraw: value })}
            />
            <Toggle
              label="Mask CNIC for users without CNIC access"
              hint="Only roles with the cnic:view permission see full numbers."
              checked={form.cnicMaskingEnabled}
              onChange={(value) => setForm({ ...form, cnicMaskingEnabled: value })}
            />
            <Field label="Duplicate CNIC policy">
              <Select value={form.duplicateCnicPolicy} onValueChange={(value) => setForm({ ...form, duplicateCnicPolicy: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block — never allow duplicates</SelectItem>
                  <SelectItem value="warn">Warn — allow after confirmation</SelectItem>
                  <SelectItem value="allow">Allow — no check</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reason for this change" hint="Stored in the audit log.">
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            {update.isError && <FormError message={errorMessage(update.error)} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial classification</CardTitle>
            <CardDescription>Enforced in the backend, shown here so the rules are visible.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Rule label="Customer installment collections" value="Revenue and cash inflow" />
            <Rule label="Partner contributions" value="Cash inflow only — not revenue" />
            <Rule label="Partner withdrawals" value="Cash outflow — not an operating expense" />
            <Rule label="Customer advance cash" value="Cash outflow — not an operating expense" />
            <Rule label="Cash ↔ bank transfers" value="Neither income nor expense" />
            <Rule label="Advance bike" value="No cash movement at all" />
            <Rule label="Total cash outflow" value="Operating + advance cash + partner withdrawals" />
            <Rule label="Confirmed draw" value="Future instalments become Not applicable" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border p-3">
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[55%] text-right font-medium">{value}</span>
    </div>
  );
}
