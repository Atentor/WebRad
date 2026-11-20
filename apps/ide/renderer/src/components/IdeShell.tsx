import {
  useCallback,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
} from 'react';
import { WORKBENCH_RESIZE_END } from './workbench-resize';

interface IdeShellProps {
  activity: ReactNode;
  explorer: ReactNode;
  palette: ReactNode;
  editor: ReactNode;
  inspector: ReactNode;
  bottom: ReactNode;
  bottomMinimumHeight?: number;
}

type ResizeTarget = 'left' | 'right' | 'bottom';

interface ResizeSession {
  target: ResizeTarget;
  pointerId: number;
  startX: number;
  startY: number;
  startValue: number;
  pendingValue: number;
  minimum: number;
  maximum: number;
  capture: HTMLDivElement;
}

function pointerResizeValue(
  session: ResizeSession,
  event: { clientX: number; clientY: number },
): number {
  const delta =
    session.target === 'left'
      ? event.clientX - session.startX
      : session.target === 'right'
        ? session.startX - event.clientX
        : session.startY - event.clientY;
  return Math.min(session.maximum, Math.max(session.minimum, session.startValue + delta));
}

export function IdeShell({
  activity,
  explorer,
  palette,
  editor,
  inspector,
  bottom,
  bottomMinimumHeight = 96,
}: IdeShellProps): ReactElement {
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(360);
  const [bottomHeight, setBottomHeight] = useState(188);
  const visibleBottomHeight = Math.max(bottomHeight, bottomMinimumHeight);
  const resize = useRef<ResizeSession | null>(null);
  const resizeFrame = useRef<number | undefined>(undefined);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const [workbenchWidth, setWorkbenchWidth] = useState(() => window.innerWidth);
  const availableSidebarWidth = Math.max(
    inspector ? 400 : 180,
    workbenchWidth - 40 - 240 - (inspector ? 2 : 1),
  );
  const visibleRightWidth = inspector ? Math.min(rightWidth, availableSidebarWidth - 180) : 0;
  const visibleLeftWidth = Math.min(leftWidth, availableSidebarWidth - visibleRightWidth);
  const leftResizeMaximum = Math.min(420, availableSidebarWidth - visibleRightWidth);
  const rightResizeMaximum = Math.min(440, availableSidebarWidth - visibleLeftWidth);
  const hasInspector = Boolean(inspector);
  const hasBottom = Boolean(bottom);

  const applyResize = useCallback((target: ResizeTarget, value: number): void => {
    if (target === 'left') setLeftWidth(value);
    else if (target === 'right') setRightWidth(value);
    else setBottomHeight(value);
  }, []);

  const endResize = useCallback(
    (commit = true): void => {
      const session = resize.current;
      if (session === null) return;
      resize.current = null;
      if (resizeFrame.current !== undefined) {
        window.cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = undefined;
      }
      if (commit) applyResize(session.target, session.pendingValue);
      const workbench = workbenchRef.current;
      if (workbench !== null) {
        delete workbench.dataset.resizing;
        // Consumers schedule their final measurements after React commits the grid.
        workbench.dispatchEvent(new Event(WORKBENCH_RESIZE_END));
      }
      if (session.capture.hasPointerCapture(session.pointerId)) {
        session.capture.releasePointerCapture(session.pointerId);
      }
      if (session.capture.ownerDocument.activeElement === session.capture) {
        session.capture.blur();
      }
    },
    [applyResize],
  );

  const finishResize = useCallback(
    (event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'type'>): void => {
      const session = resize.current;
      if (session?.pointerId !== event.pointerId) return;
      // Pointer-up can arrive before the last queued animation frame.
      if (event.type === 'pointerup') session.pendingValue = pointerResizeValue(session, event);
      endResize();
    },
    [endResize],
  );

  useEffect(() => {
    const finish = (): void => endResize();
    const onVisibilityChange = (): void => {
      if (document.hidden) endResize();
    };
    window.addEventListener('blur', finish);
    window.addEventListener('pointerup', finishResize, true);
    window.addEventListener('pointercancel', finishResize, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', finish);
      window.removeEventListener('pointerup', finishResize, true);
      window.removeEventListener('pointercancel', finishResize, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      endResize(false);
    };
  }, [endResize, finishResize, hasInspector, hasBottom]);

  useEffect(() => {
    const workbench = workbenchRef.current;
    if (workbench === null) return;
    const measure = (): void => {
      const width = workbench.getBoundingClientRect().width;
      setWorkbenchWidth(width > 0 ? width : window.innerWidth);
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width !== undefined && width > 0) setWorkbenchWidth(width);
          });
    observer?.observe(workbench);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const beginResize = useCallback(
    (target: ResizeTarget, event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || resize.current !== null) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const startValue =
        target === 'left'
          ? visibleLeftWidth
          : target === 'right'
            ? visibleRightWidth
            : visibleBottomHeight;
      resize.current = {
        target,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startValue,
        pendingValue: startValue,
        minimum: target === 'left' ? 180 : target === 'right' ? 220 : bottomMinimumHeight,
        maximum:
          target === 'left' ? leftResizeMaximum : target === 'right' ? rightResizeMaximum : 360,
        capture: event.currentTarget,
      };
      if (workbenchRef.current !== null) workbenchRef.current.dataset.resizing = target;
    },
    [
      visibleBottomHeight,
      visibleLeftWidth,
      visibleRightWidth,
      bottomMinimumHeight,
      leftResizeMaximum,
      rightResizeMaximum,
    ],
  );

  const continueResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const session = resize.current;
      if (!session || session.pointerId !== event.pointerId) return;
      // Recover if the host missed a release outside the window.
      if (event.buttons === 0) {
        endResize();
        return;
      }
      const value = pointerResizeValue(session, event);
      if (value === session.pendingValue) return;
      session.pendingValue = value;
      if (resizeFrame.current !== undefined) return;
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = undefined;
        if (resize.current === session) applyResize(session.target, session.pendingValue);
      });
    },
    [applyResize, endResize],
  );

  const resizeWithKeyboard = (target: ResizeTarget, event: KeyboardEvent<HTMLDivElement>): void => {
    const horizontal = target !== 'bottom';
    const decrease = horizontal ? 'ArrowLeft' : 'ArrowDown';
    const increase = horizontal ? 'ArrowRight' : 'ArrowUp';
    if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const minimum = target === 'left' ? 180 : target === 'right' ? 220 : bottomMinimumHeight;
    const maximum =
      target === 'left' ? leftResizeMaximum : target === 'right' ? rightResizeMaximum : 360;
    const current =
      target === 'left'
        ? visibleLeftWidth
        : target === 'right'
          ? visibleRightWidth
          : visibleBottomHeight;
    const direction = (event.key === increase ? 1 : -1) * (target === 'right' ? -1 : 1);
    const next =
      event.key === 'Home'
        ? minimum
        : event.key === 'End'
          ? maximum
          : current + direction * (event.shiftKey ? 40 : 10);
    const value = Math.min(maximum, Math.max(minimum, next));
    if (target === 'left') setLeftWidth(value);
    else if (target === 'right') setRightWidth(value);
    else setBottomHeight(value);
  };

  const splitterProps = (target: ResizeTarget) => ({
    tabIndex: 0,
    'aria-valuemin': target === 'left' ? 180 : target === 'right' ? 220 : bottomMinimumHeight,
    'aria-valuemax':
      target === 'left' ? leftResizeMaximum : target === 'right' ? rightResizeMaximum : 360,
    'aria-valuenow': Math.round(
      target === 'left'
        ? visibleLeftWidth
        : target === 'right'
          ? visibleRightWidth
          : visibleBottomHeight,
    ),
    'aria-valuetext': `${Math.round(target === 'left' ? visibleLeftWidth : target === 'right' ? visibleRightWidth : visibleBottomHeight)} pixels`,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => resizeWithKeyboard(target, event),
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => beginResize(target, event),
    onPointerMove: continueResize,
    onPointerUp: finishResize,
    onPointerCancel: finishResize,
    onLostPointerCapture: finishResize,
  });

  return (
    <div className="wr-ide-shell">
      <div
        className="wr-workbench"
        ref={workbenchRef}
        style={{
          gridTemplateColumns: [
            '40px',
            String(visibleLeftWidth) + 'px',
            '1px',
            'minmax(240px, 1fr)',
            inspector ? '1px ' + String(visibleRightWidth) + 'px' : '0px 0px',
          ].join(' '),
          gridTemplateRows: bottom
            ? 'minmax(0, 1fr) 1px ' + String(visibleBottomHeight) + 'px'
            : 'minmax(0, 1fr) 0px 0px',
        }}
      >
        {activity}
        <aside className={palette ? 'wr-left-rail' : 'wr-left-rail wr-left-rail-single'}>
          <div className="wr-left-section wr-explorer-slot">{explorer}</div>
          {palette && (
            <>
              <div className="wr-horizontal-divider" />
              <div className="wr-left-section wr-palette-slot">{palette}</div>
            </>
          )}
        </aside>
        <div
          className="wr-splitter wr-splitter-vertical wr-splitter-left"
          role="separator"
          aria-label="Resize elements sidebar"
          aria-orientation="vertical"
          {...splitterProps('left')}
        />
        <main className="wr-editor-slot">{editor}</main>
        {inspector && (
          <>
            <div
              className="wr-splitter wr-splitter-vertical wr-splitter-right"
              role="separator"
              aria-label="Resize inspector"
              aria-orientation="vertical"
              {...splitterProps('right')}
            />
            <aside className="wr-inspector-slot">
              <div className="wr-right-section wr-object-inspector-slot">{inspector}</div>
            </aside>
          </>
        )}
        {bottom && (
          <>
            <div
              className="wr-splitter wr-splitter-horizontal"
              role="separator"
              aria-label="Resize output"
              aria-orientation="horizontal"
              {...splitterProps('bottom')}
            />
            <section className="wr-bottom-slot">{bottom}</section>
          </>
        )}
      </div>
    </div>
  );
}
