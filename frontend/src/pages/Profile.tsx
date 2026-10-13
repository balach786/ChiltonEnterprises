import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth, useChangePassword } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { PERMISSION_LABELS } from '@/lib/permissions';
import { Field, FormError } from '@/components/shared/Form';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatDateTime } from '@/lib/utils';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type Values = z.infer<typeof schema>;

export function ProfilePage() {
  const { user } = useAuth();
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });

  if (!user) return null;

  const onSubmit = async (values: Values) => {
    try {
      await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      toast.success('Password updated');
      reset();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader title="My account" description="Your profile, role and the permissions the API grants this account." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Details come from the database record for this user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={<Badge variant="info">{user.role.replace(/_/g, ' ')}</Badge>} />
            <Row label="Last login" value={formatDateTime(user.lastLoginAt)} />
            <Row label="Must change password" value={user.mustChangePassword ? 'Yes' : 'No'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Passwords are stored as bcrypt hashes. Minimum 8 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Field label="Current password" error={errors.currentPassword?.message} required>
                <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
              </Field>
              <Field label="New password" error={errors.newPassword?.message} required>
                <Input type="password" autoComplete="new-password" {...register('newPassword')} />
              </Field>
              <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
                <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
              </Field>
              {changePassword.isError && <FormError message={errorMessage(changePassword.error)} />}
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Effective permissions ({user.permissions.length})</CardTitle>
            <CardDescription>
              Calculated by the server from your role plus any per-user grants and denials.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {user.permissions.map((permission) => (
              <Badge key={permission} variant="outline">
                {PERMISSION_LABELS[permission] ?? permission}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? '-'}</span>
    </div>
  );
}
