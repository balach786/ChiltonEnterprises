import * as React from 'react';
import { useForm, useFormContext, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FormError, SelectField, TextAreaField, TextField } from '@/components/shared/Form';
import { useCreateCustomer, useUpdateCustomer, useTokens } from '@/hooks/useApi';
import { ApiError, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/utils';

const baseSchema = z.object({
  name: z.string().min(2, 'Name is required').max(120),
  cnic: z
    .string()
    .min(13, 'CNIC must be 13 digits')
    .refine((v) => /^\d{13}$/.test(v.replace(/\D/g, '')), 'CNIC must contain exactly 13 digits'),
  phone: z.string().min(10, 'Phone number is required').max(20),
  location: z.enum(['MACH', 'QUETTA']),
  fatherName: z.string().max(120).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

const createSchema = baseSchema.extend({
  joiningDate: z.string().min(1, 'Joining date is required'),
  monthlyInstallmentPkr: z.string().min(1, 'Monthly installment is required'),
  tokenNumber: z.string().min(1, 'Select a token'),
});

const editSchema = baseSchema.extend({
  status: z.enum(['active', 'drawn_closed', 'inactive']).optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

export function CustomerFormDialog({
  open,
  onOpenChange,
  mode,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  customer?: Record<string, unknown> | null;
}) {
  const isCreate = mode === 'create';
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer(String(customer?._id ?? ''));
  const tokens = useTokens({ status: 'unassigned' });
  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = React.useState(false);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string | null>(null);

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as never,
    defaultValues: {
      name: '',
      cnic: '',
      phone: '',
      location: 'MACH',
      joiningDate: todayIso(),
      monthlyInstallmentPkr: '',
      tokenNumber: '',
      fatherName: '',
      address: '',
      notes: '',
    },
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema) as never,
    values: {
      name: String(customer?.name ?? ''),
      cnic: String(customer?.cnic ?? ''),
      phone: String(customer?.phone ?? ''),
      location: (customer?.location as 'MACH' | 'QUETTA') ?? 'MACH',
      fatherName: String(customer?.fatherName ?? ''),
      address: String(customer?.address ?? ''),
      notes: String(customer?.notes ?? ''),
      status: (customer?.status as 'active' | 'drawn_closed' | 'inactive') ?? 'active',
    },
  });

  const monthly = Number(createForm.watch('monthlyInstallmentPkr') || 0);
  const schemeTotal = monthly * 28;

  const resetAll = () => {
    setDuplicateWarning(null);
    setAcknowledgeDuplicate(false);
    createForm.reset();
  };

  const submitCreate = async (values: CreateValues) => {
    setDuplicateWarning(null);
    try {
      const created = await createCustomer.mutateAsync({
        name: values.name.trim(),
        cnic: values.cnic.replace(/\D/g, ''),
        phone: values.phone.trim(),
        location: values.location,
        joiningDate: values.joiningDate,
        monthlyInstallmentPkr: Number(values.monthlyInstallmentPkr),
        tokenNumber: Number(values.tokenNumber),
        fatherName: values.fatherName || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
        acknowledgeDuplicateCnic: acknowledgeDuplicate || undefined,
      });
      toast.success(
        `Customer ${created.customer.name} enrolled on token ${created.customer.tokenNumber} · ${created.installmentCount} installments totalling ${created.schemeTotalFormatted}`,
      );
      onOpenChange(false);
      resetAll();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICATE_CNIC') {
        setDuplicateWarning(error.message);
        return;
      }
      toast.error(errorMessage(error));
    }
  };

  const submitEdit = async (values: EditValues) => {
    try {
      await updateCustomer.mutateAsync({
        name: values.name.trim(),
        phone: values.phone.trim(),
        location: values.location,
        fatherName: values.fatherName || undefined,
        address: values.address || undefined,
        notes: values.notes || undefined,
      });
      toast.success('Customer updated');
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const submitting = createCustomer.isPending || updateCustomer.isPending;
  const availableTokens = (tokens.data?.items ?? []).filter(
    (token) => String(token._id) !== String(customer?.currentEnrollment ?? '')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Enrol a new customer' : 'Edit customer'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'Assigns a token and generates the fixed 28-month installment schedule.'
              : 'CNIC, token and installment amount cannot be changed after enrolment.'}
          </DialogDescription>
        </DialogHeader>

        <FormProvider {...((isCreate ? createForm : editForm) as unknown as Parameters<typeof FormProvider>[0])}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (isCreate) void createForm.handleSubmit(submitCreate)(event);
              else void editForm.handleSubmit(submitEdit)(event);
            }}
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" label="Full name" required placeholder="Customer name" />
              <TextField name="fatherName" label="Father / husband name" placeholder="Optional" />
              <TextField
                name="cnic"
                label="CNIC"
                required
                placeholder="4210112345671"
                disabled={!isCreate}
                hint={isCreate ? '13 digits. Masked for roles without CNIC access.' : 'Cannot be changed after enrolment.'}
                maxLength={15}
              />
              <TextField name="phone" label="Phone" required placeholder="03xx xxxxxxx" inputMode="tel" />
              <SelectField
                name="location"
                label="Location"
                required
                options={[
                  { value: 'MACH', label: 'Mach' },
                  { value: 'QUETTA', label: 'Quetta' },
                ]}
              />
              {isCreate ? (
                <>
                  <TextField name="joiningDate" label="Joining date" type="date" required />
                  <TextField
                    name="monthlyInstallmentPkr"
                    label="Monthly installment (PKR)"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    required
                    placeholder="25000"
                  />
                  <Field label="Token number" required hint="Only unassigned tokens can be selected.">
                    <SelectTokenInput tokens={availableTokens.map((t) => ({ value: String(t.number), label: `${t.code} — ${t.status}` }))} />
                  </Field>
                </>
              ) : (
                <SelectField
                  name="status"
                  label="Status"
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'drawn_closed', label: 'Drawn & closed' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                  hint="Draw closure is normally applied by confirming a draw."
                />
              )}
              <TextAreaField name="address" label="Address" className="sm:col-span-2" rows={2} />
              <TextAreaField name="notes" label="Notes" className="sm:col-span-2" rows={2} />
            </div>

            {isCreate && monthly > 0 && (
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                <p>
                  Scheme total: <span className="font-semibold tabular-nums">PKR {schemeTotal.toLocaleString('en-PK')}</span>{' '}
                  <span className="text-muted-foreground">({monthly.toLocaleString('en-PK')} × 28 months, equal instalments)</span>
                </p>
              </div>
            )}

            {duplicateWarning && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">{duplicateWarning}</p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={acknowledgeDuplicate}
                    onChange={(event) => setAcknowledgeDuplicate(event.target.checked)}
                  />
                  I confirm this is a different person. Save anyway.
                </label>
              </div>
            )}

            {createCustomer.isError && !duplicateWarning && <FormError message={errorMessage(createCustomer.error)} />}
            {editForm.formState.errors.root?.message && <FormError message={editForm.formState.errors.root.message} />}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : isCreate ? 'Enrol customer' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function SelectTokenInput({ tokens }: { tokens: Array<{ value: string; label: string }> }) {
  const form = useFormContext();
  if (tokens.length === 0) {
    return <p className="text-sm text-muted-foreground">No unassigned tokens available.</p>;
  }
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={String(form.watch('tokenNumber') ?? '')}
      onChange={(event) => form.setValue('tokenNumber', event.target.value, { shouldValidate: true })}
    >
      <option value="">Select a token…</option>
      {tokens.map((token) => (
        <option key={token.value} value={token.value}>
          {token.value} — {token.label}
        </option>
      ))}
    </select>
  );
}
