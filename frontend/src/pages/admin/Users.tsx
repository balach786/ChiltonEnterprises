import * as React from 'react';
import { toast } from '@/lib/notify';
import { Plus, ShieldCheck, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Column, DataTable } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/components/layout/PermissionGate';
import { InlineAlert } from '@/components/shared/ErrorState';
import { Field, FormError } from '@/components/shared/Form';
import { Textarea } from '@/components/ui/textarea';
import { useCreateUser, useResetPassword, useUpdateUser, useUsers } from '@/hooks/useApi';
import { PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/lib/permissions';
import type { UserRow } from '@/lib/types';
import { formatDateTime, titleCase } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner / Administrator' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'customer_service', label: 'Customer-Service Staff' },
  { value: 'draw_manager', label: 'Draw Manager' },
  { value: 'viewer', label: 'Read-Only Viewer' },
];

const ROLE_HINTS: Record<string, string> = {
  owner: 'Full access to every module, including users and settings.',
  accountant: 'Payments, income, expenses, partners, cash & bank, reports and exports.',
  customer_service: 'Customers, tokens, installments and payments.',
  draw_manager: 'Draws, eligibility and confirmations.',
  viewer: 'Read-only across the system; cannot export financial data.',
};

export function UsersPage() {
  const users = useUsers();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [resetting, setResetting] = React.useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = React.useState('');
  const resetPassword = useResetPassword();

  const rows: UserRow[] = users.data ?? [];

  const columns: Column<UserRow>[] = [
    {
      header: 'User',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    { header: 'Role', headerClassName: 'w-44', cell: (row) => <Badge variant="info">{titleCase(row.role.replace(/_/g, ' '))}</Badge> },
    { header: 'Permissions', headerClassName: 'w-28', cell: (row) => `${row.permissions.length}` },
    { header: 'Status', headerClassName: 'w-28', cell: (row) => (row.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Disabled</Badge>) },
    { header: 'Last login', headerClassName: 'w-44', cell: (row) => formatDateTime(row.lastLoginAt) },
    {
      header: '',
      headerClassName: 'w-56',
      cell: (row) => (
        <PermissionGate requires={PERMISSIONS.USER_MANAGE}>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
              <UserCog className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setResetting(row); setNewPassword(''); }}>
              Reset password
            </Button>
          </div>
        </PermissionGate>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users &amp; roles"
        description="Roles decide the default permission set. Individual grants and denials are applied on top, server side."
        actions={
          <PermissionGate requires={PERMISSIONS.USER_MANAGE}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New user
            </Button>
          </PermissionGate>
        }
      />

      <InlineAlert tone="info" title="Permissions are enforced by the API">
        Hiding a button in the browser is cosmetic only. Every request is re-checked against the user's effective
        permissions and returns 403 when not allowed.
      </InlineAlert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
          <CardDescription>{rows.length} user(s).</CardDescription>
        </CardHeader>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={users.isLoading}
          error={users.error}
          onRetry={() => void users.refetch()}
          emptyMessage="No users found."
        />
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(ROLE_HINTS).map(([role, hint]) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> {titleCase(role.replace(/_/g, ' '))}
              </CardTitle>
              <CardDescription>{hint}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <UserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        roles={ROLE_OPTIONS}
        allPermissions={Object.values(PERMISSIONS) as Permission[]}
      />

      {editing && (
        <UserDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          mode="edit"
          user={editing}
          roles={ROLE_OPTIONS}
          allPermissions={Object.values(PERMISSIONS) as Permission[]}
        />
      )}

      <Dialog open={Boolean(resetting)} onOpenChange={(open) => !open && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {resetting?.name}</DialogTitle>
            <DialogDescription>The user will be asked to change it at their next sign-in.</DialogDescription>
          </DialogHeader>
          <Field label="New password" required hint="At least 8 characters.">
            <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetting(null)}>Cancel</Button>
            <Button
              disabled={resetPassword.isPending || newPassword.length < 8}
              onClick={async () => {
                if (!resetting) return;
                try {
                  await resetPassword.mutateAsync({ id: resetting._id, newPassword, reason: 'Administrator reset' });
                  toast.success('Password reset');
                  setResetting(null);
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              {resetPassword.isPending ? 'Saving…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserDialog({
  open,
  onOpenChange,
  mode,
  user,
  roles,
  allPermissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  user?: UserRow | null;
  roles: Array<{ value: string; label: string }>;
  allPermissions: Permission[];
}) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser(user?._id ?? '');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState('accountant');
  const [isActive, setIsActive] = React.useState(true);
  const [extra, setExtra] = React.useState<Permission[]>([]);
  const [denied, setDenied] = React.useState<Permission[]>([]);
  const [reason, setReason] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setRole(user?.role ?? 'accountant');
    setIsActive(user?.isActive ?? true);
    setExtra((user?.extraPermissions ?? []) as Permission[]);
    setDenied((user?.deniedPermissions ?? []) as Permission[]);
    setReason('');
    setFailure(null);
  }, [open, user]);

  const toggle = (list: Permission[], setter: (value: Permission[]) => void, permission: Permission) =>
    setter(list.includes(permission) ? list.filter((p) => p !== permission) : [...list, permission]);

  const submit = async () => {
    setFailure(null);
    try {
      if (mode === 'create') {
        await createUser.mutateAsync({
          name,
          email,
          password,
          role,
          extraPermissions: extra,
          deniedPermissions: denied,
          mustChangePassword: true,
        });
        toast.success('User created');
      } else {
        await updateUser.mutateAsync({
          name,
          role,
          isActive,
          extraPermissions: extra,
          deniedPermissions: denied,
          reason: reason || undefined,
        });
        toast.success('User updated');
      }
      onOpenChange(false);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  const pending = createUser.isPending || updateUser.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New user' : `Edit ${user?.name}`}</DialogTitle>
          <DialogDescription>
            The role sets the defaults; extra grants and denials refine them for this account only.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email" required>
            <Input type="email" value={email} disabled={mode === 'edit'} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode === 'create' && (
            <Field label="Password" required hint="At least 8 characters; stored as a bcrypt hash.">
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          <Field label="Role" required hint={ROLE_HINTS[role]}>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {mode === 'edit' && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm font-medium">Account active</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PermissionPicker title="Extra permissions" hint="Granted on top of the role." selected={extra} all={allPermissions} onToggle={(p) => toggle(extra, setExtra, p)} />
          <PermissionPicker title="Denied permissions" hint="Removed even if the role grants them." selected={denied} all={allPermissions} onToggle={(p) => toggle(denied, setDenied, p)} />
        </div>

        {mode === 'edit' && (
          <Field label="Reason for change">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}

        <FormError message={failure ?? undefined} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !name || (mode === 'create' && (!email || password.length < 8))}>
            {pending ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionPicker({
  title,
  hint,
  selected,
  all,
  onToggle,
}: {
  title: string;
  hint: string;
  selected: Permission[];
  all: Permission[];
  onToggle: (permission: Permission) => void;
}) {
  return (
    <div className="rounded-md border">
      <div className="border-b px-3 py-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="max-h-52 space-y-1 overflow-y-auto p-2 scrollbar-thin">
        {all.map((permission) => (
          <label key={permission} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60">
            <Checkbox checked={selected.includes(permission)} onCheckedChange={() => onToggle(permission)} className="mt-0.5" />
            <span>{PERMISSION_LABELS[permission] ?? permission}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
