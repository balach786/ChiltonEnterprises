import * as React from 'react';
import { Controller, useFormContext, type FieldPath, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: string;
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Field({ label, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function TextField<T extends FieldValues>({
  name,
  label,
  type = 'text',
  placeholder,
  hint,
  required,
  className,
  disabled,
  inputMode,
  maxLength,
  step,
}: {
  name: FieldPath<T>;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel';
  maxLength?: number;
  step?: string;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<T>();
  const error = (errors[name]?.message as string | undefined) ?? undefined;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <Input
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        step={step}
        {...register(name)}
      />
    </Field>
  );
}

export function TextAreaField<T extends FieldValues>({
  name,
  label,
  placeholder,
  hint,
  required,
  className,
  rows = 3,
}: {
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  rows?: number;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<T>();
  const error = (errors[name]?.message as string | undefined) ?? undefined;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <Textarea rows={rows} placeholder={placeholder} {...register(name)} />
    </Field>
  );
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  options,
  placeholder,
  hint,
  required,
  className,
  disabled,
  emptyLabel,
}: {
  name: FieldPath<T>;
  label: string;
  options: Option[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const {
    control,
    formState: { errors },
  } = useFormContext<T>();
  const error = (errors[name]?.message as string | undefined) ?? undefined;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={String(field.value ?? '')} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder={placeholder ?? 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {emptyLabel && <SelectItem value="">{emptyLabel}</SelectItem>}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  );
}

export function CheckboxField<T extends FieldValues>({
  name,
  label,
  hint,
  className,
}: {
  name: FieldPath<T>;
  label: string;
  hint?: string;
  className?: string;
}) {
  const { control } = useFormContext<T>();
  return (
    <div className={cn('space-y-1', className)}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium leading-tight">{label}</span>
              {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
            </span>
          </label>
        )}
      />
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}
