import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
  toggleLabel?: string;
  withWrapper?: boolean;
}

export function SecretInput({
  value,
  onValueChange,
  className,
  wrapperClassName,
  toggleLabel = '切换可见性',
  withWrapper = true,
  ...inputProps
}: SecretInputProps) {
  const [visible, setVisible] = useState(false);

  const content = (
    <>
      <Input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={cn('pr-10 font-mono', className)}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        className={cn(
          'absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded',
        )}
        aria-label={toggleLabel}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </>
  );

  if (withWrapper) {
    return <div className={cn('relative', wrapperClassName)}>{content}</div>;
  }

  return content;
}
