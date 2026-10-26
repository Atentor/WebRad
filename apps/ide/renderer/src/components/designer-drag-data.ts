export type DesignerDragPayload =
  | { readonly kind: 'component'; readonly type: string }
  | { readonly kind: 'reusable'; readonly id: string };

// Native dragover protects DataTransfer values. Keep only the current internal
// drag descriptor in memory; drop always reads the actual transfer again.
let payload: DesignerDragPayload | null = null;

export function setDesignerDragPayload(next: DesignerDragPayload | null): void {
  payload = next;
}

export function getDesignerDragPayload(): DesignerDragPayload | null {
  return payload;
}

/** The canvas already projects the component footprint; suppress the source-button snapshot. */
export function hideNativeDesignerDragImage(transfer: DataTransfer): void {
  if (typeof transfer.setDragImage !== 'function') return;
  const image = document.createElement('canvas');
  image.width = 1;
  image.height = 1;
  image.style.position = 'fixed';
  image.style.left = '0';
  image.style.top = '0';
  image.style.pointerEvents = 'none';
  image.setAttribute('aria-hidden', 'true');
  document.body.append(image);
  transfer.setDragImage(image, 0, 0);
  window.requestAnimationFrame(() => image.remove());
}
