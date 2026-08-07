import {
  Children,
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import {
  placeTooltip,
  TOOLTIP_DELAY_MS,
  TOOLTIP_MARGIN_PX,
  type TooltipPlacement,
} from './tooltipLayout';

/**
 * The tooltip module of SPEC2 M14.
 *
 * One component wraps ONE trigger element and injects its handlers with
 * `cloneElement`, so wrapping a button changes no layout - the bubble
 * renders through a portal at the document body, positioned fixed by the
 * pure `placeTooltip`. Hover shows after TOOLTIP_DELAY_MS; keyboard focus
 * shows immediately (a focus is deliberate) and Escape dismisses without
 * eating the key - the tool-disarm of section 17.2 still sees it. The
 * bubble is `aria-describedby`-linked and `pointer-events: none`, so it can
 * never trap the cursor it is explaining to.
 *
 * The TEXTS are the point: every key explains what the element DOES and
 * what it costs or affects, never the label again - the M14 order. Exact
 * prices stay in the toolbar's price line, which already runs them through
 * the inflation of section 14.2; the tooltip carries the mechanism.
 */

/** The handler props the tooltip injects into its single child. */
interface TriggerProps {
  readonly onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  readonly onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
  readonly onFocus?: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur?: (event: FocusEvent<HTMLElement>) => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  readonly 'aria-describedby'?: string;
}

export function Tooltip({
  textKey,
  params,
  children,
}: {
  readonly textKey: string;
  readonly params?: Readonly<Record<string, string | number>>;
  /** Exactly one element; non-interactive triggers pass their own tabIndex. */
  readonly children: ReactElement<TriggerProps>;
}): ReactElement {
  const bubbleId = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [placed, setPlaced] = useState<TooltipPlacement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const cancelTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback((): void => {
    cancelTimer();
    setAnchor(null);
    setPlaced(null);
  }, [cancelTimer]);

  // A component unmounted with a pending hover timer must not fire it.
  useEffect(() => cancelTimer, [cancelTimer]);

  // Position once the bubble exists and can be measured; hidden until then.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (anchor === null || bubble === null) return;
    setPlaced(
      placeTooltip(
        anchor,
        bubble.offsetWidth,
        bubble.offsetHeight,
        window.innerWidth,
        window.innerHeight,
        TOOLTIP_MARGIN_PX,
      ),
    );
  }, [anchor]);

  const child = Children.only(children);
  const childProps = child.props;

  const trigger = cloneElement(child, {
    onMouseEnter: (event: MouseEvent<HTMLElement>): void => {
      childProps.onMouseEnter?.(event);
      const rect = event.currentTarget.getBoundingClientRect();
      cancelTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setAnchor(rect);
      }, TOOLTIP_DELAY_MS);
    },
    onMouseLeave: (event: MouseEvent<HTMLElement>): void => {
      childProps.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event: FocusEvent<HTMLElement>): void => {
      childProps.onFocus?.(event);
      setAnchor(event.currentTarget.getBoundingClientRect());
    },
    onBlur: (event: FocusEvent<HTMLElement>): void => {
      childProps.onBlur?.(event);
      hide();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>): void => {
      childProps.onKeyDown?.(event);
      if (event.key === 'Escape') hide();
    },
    'aria-describedby': anchor !== null ? bubbleId : childProps['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {anchor !== null &&
        createPortal(
          <div
            ref={bubbleRef}
            id={bubbleId}
            role="tooltip"
            className="tooltip"
            style={
              placed === null
                ? { left: 0, top: 0, visibility: 'hidden' }
                : { left: placed.left, top: placed.top }
            }
          >
            {t(textKey, params)}
          </div>,
          document.body,
        )}
    </>
  );
}
