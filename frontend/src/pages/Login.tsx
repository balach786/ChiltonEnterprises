import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { Lock, LogIn, Mail, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { homePathFor } from '@/components/layout/nav';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  React.useEffect(() => {
    if (isAuthenticated && user) {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : homePathFor(user.permissions), { replace: true });
    }
  }, [isAuthenticated, user, navigate, location.state]);

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await login(values.email.trim(), values.password);
      toast.success(`Welcome back, ${signedIn.name}`);
      navigate(homePathFor(signedIn.permissions), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="text-center py-2">
            <span className="font-cursive text-4xl sm:text-5xl text-[#26444c] tracking-wide drop-shadow-sm inline-block">
              Chilton Enterprises
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Showroom Management System</h1>
            <p className="text-xs font-medium text-slate-500">Inventory · Sales &amp; Statistics · Customers · Ledger</p>
          </div>
        </div>

        <Card className="rounded-2xl border-slate-100 shadow-md overflow-hidden">
          <CardHeader className="bg-[#26444c] text-white p-5">
            <CardTitle className="text-white text-base">Sign in</CardTitle>
            <CardDescription className="text-teal-100/80 text-xs">Use the account created by your administrator.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">
                  <Mail className="mr-1 inline h-3.5 w-3.5" /> Email
                </Label>
                <Input id="email" type="email" autoComplete="username" placeholder="name@showroom.pk" {...register('email')} />
                {errors.email && <p className="text-xs font-medium text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">
                  <Lock className="mr-1 inline h-3.5 w-3.5" /> Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                />
                {errors.password && <p className="text-xs font-medium text-destructive">{errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : (
                  <>
                    <LogIn className="h-4 w-4" /> Sign in
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Permissions are verified by the server on every request.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
