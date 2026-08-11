import {
  useCallback,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

interface IdeShellProps {
  toolbar: ReactNode;
  explorer: ReactNode;
  palette: ReactNode;
  editor: ReactNode;
  inspector: ReactNode;
  bottom: ReactNode;
  status: ReactNode;
}

type ResizeTarget = 'left' | 'right' | 'bottom';

interface ResizeSession {
  target: ResizeTarget;
  pointerId: number;
  startX: number;
  startY: number;
  startValue: number;
}

export function IdeShell({
  toolbar,
  explorer,
  palette,
  editor,
  inspector,
  bottom,
  status,
}: IdeShellProps): ReactElement {
  const [leftWidth, setLeftWidth] = useState(248);
  const [rightWidth, setRightWidth] = useState(286);
  const [bottomHeight, setBottomHeight] = useState(188);
  const resize = useRef<ResizeSession | null>(null);

  const beginResize = useCallback(
    (target: ResizeTarget, event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      resize.current = {
        target,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startValue: target === 'left' ? leftWidth : target === 'right' ? rightWidth : bottomHeight,
      };
    },
    [bottomHeight, leftWidth, rightWidth],
  );

  const continueResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const session = resize.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.target === 'left') {
      setLeftWidth(
        Math.min(420, Math.max(180, session.startValue + event.clientX - session.startX)),
      );
    } else if (session.target === 'right') {
      setRightWidth(
        Math.min(440, Math.max(220, session.startValue - event.clientX + session.startX)),
      );
    } else {
      setBottomHeight(
        Math.min(360, Math.max(96, session.startValue - event.clientY + session.startY)),
      );
    }
  }, []);

  const finishResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (resize.current?.pointerId === event.pointerId) resize.current = null;
  }, []);

  const splitterProps = (target: ResizeTarget) => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => beginResize(target, event),
    onPointerMove: continueResize,
    onPointerUp: finishResize,
    onPointerCancel: finishResize,
  });

  return (
    <div className="wr-ide-shell">
      {toolbar}
      <div
        className="wr-workbench"
        style={{
          gridTemplateColumns: `${leftWidth}px 5px minmax(360px, 1fr) 5px ${rightWidth}px`,
          gridTemplateRows: `minmax(300px, 1fr) 5px ${bottomHeight}px`,
        }}
      >
        <aside className="wr-left-rail">
          <div className="wr-left-section wr-explorer-slot">{explorer}</div>
          <div className="wr-horizontal-divider" />
          <div className="wr-left-section wr-palette-slot">{palette}</div>
        </aside>
        <div
          className="wr-splitter wr-splitter-vertical"
          role="separator"
          {...splitterProps('left')}
        />
        <main className="wr-editor-slot">{editor}</main>
        <div
          className="wr-splitter wr-splitter-vertical"
          role="separator"
          {...splitterProps('right')}
        />
        <aside className="wr-inspector-slot">{inspector}</aside>
        <div
          className="wr-splitter wr-splitter-horizontal"
          role="separator"
          {...splitterProps('bottom')}
        />
        <section className="wr-bottom-slot">{bottom}</section>
      </div>
      {status}
    </div>
  );
}
