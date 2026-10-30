import {
  Children,
  cloneElement,
  isValidElement,
  useContext,
  useId,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { SettingsValidationContext } from './settings-validation';
import { NativeColorInput } from './NativeColorInput';

function describeControls(children: ReactNode, errorId: string): ReactNode {
  return Children.map(children, (child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        'aria-describedby'?: string;
        'aria-invalid'?: boolean;
      }>(child)
    )
      return child;
    if (
      child.type === NativeColorInput ||
      (typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type))
    ) {
      return cloneElement(child, {
        'aria-invalid': true,
        'aria-describedby': [child.props['aria-describedby'], errorId].filter(Boolean).join(' '),
      });
    }
    return child.props.children === undefined
      ? child
      : cloneElement(child, { children: describeControls(child.props.children, errorId) });
  });
}

/** Keeps validation beside its field while the dialog owns the draft and navigation. */
export function SettingsField({
  path,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { readonly path: string }): ReactElement {
  const error = useContext(SettingsValidationContext);
  const errorId = useId();
  const invalid = error !== null && (error.path === path || error.path.startsWith(`${path}.`));
  return (
    <label {...props} data-settings-field={path} data-settings-invalid={invalid || undefined}>
      {invalid ? describeControls(children, errorId) : children}
      {invalid && (
        <small id={errorId} className="wr-settings-field-error">
          {error.message}
        </small>
      )}
    </label>
  );
}
