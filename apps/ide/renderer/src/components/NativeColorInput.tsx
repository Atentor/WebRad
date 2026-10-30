import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactElement } from 'react';

interface NativeColorInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'onInput'
> {
  readonly value: string;
  readonly onChange: (color: string) => void;
}

const COLOR_IDLE_DELAY_MS = 120;

/** Keep native palette dragging independent of expensive editor/model updates. */
export function NativeColorInput({
  value,
  onChange,
  disabled,
  ...props
}: NativeColorInputProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<string | null>(null);
  const publishedRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    // Do not write acknowledged values back into an open native picker.
    if (input.value !== value || disabled) {
      clearTimeout(timerRef.current);
      pendingRef.current = null;
      publishedRef.current = null;
      if (input.value !== value) input.value = value;
    }
  }, [value, disabled]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    const publish = (): void => {
      clearTimeout(timerRef.current);
      const color = pendingRef.current;
      pendingRef.current = null;
      if (color === null || input.matches(':disabled') || publishedRef.current === color) return;
      publishedRef.current = color;
      onChangeRef.current(color);
    };
    const handleInput = (): void => {
      pendingRef.current = input.value;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(publish, COLOR_IDLE_DELAY_MS);
    };
    const handleChange = (): void => {
      pendingRef.current = input.value;
      publish();
    };
    // React normalizes native input/change into onChange. Listen separately so
    // continuous input is deferred and the native final change commits at once.
    input.addEventListener('input', handleInput);
    input.addEventListener('change', handleChange);
    input.addEventListener('blur', publish);
    return () => {
      clearTimeout(timerRef.current);
      pendingRef.current = null;
      input.removeEventListener('input', handleInput);
      input.removeEventListener('change', handleChange);
      input.removeEventListener('blur', publish);
    };
  }, []);

  return <input {...props} ref={inputRef} type="color" defaultValue={value} disabled={disabled} />;
}
