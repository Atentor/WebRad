import {
  useEffect,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { editMenuItem, flattenMenuItems, insertMenuItem, moveMenuItem } from '@webrad/designer';
import {
  LucideGraphic,
  SharedComponentStyles,
  resolveProjectImageSource,
} from '@webrad/components';
import './MenuConfigurationDialog.css';
import './settings-dialog-ux.css';
import {
  projectAssetPath,
  type ComponentNode,
  type PageModel,
  type ProjectAsset,
  type ResolvedThemeMode,
} from '@webrad/project-model';
import { WebMenu } from '@webrad/runtime/menu';
import {
  createDefaultWebMenuConfiguration,
  createProjectWebMenuAppearance,
  parseWebMenuConfiguration,
  WEB_MENU_THEMES,
  type WebMenuConfiguration,
  type WebMenuItem,
} from '@webrad/runtime/menu-model';
import { LUCIDE_ICON_NAMES } from '@webrad/runtime/icon';
import { Icon } from './Icon';
import { IconPickerDialog } from './IconPickerDialog';
import { ColorInput } from './ColorInput';
import { ProjectThemeContext } from '../project-theme';

type Section = 'Items' | 'Brand & user' | 'Appearance' | 'Behavior & layout';

interface RemovedMenuItem {
  readonly item: WebMenuItem;
  readonly parentId: string | null;
  readonly index: number;
  readonly activeItemId: string;
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <label className="wr-menu-editor-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MenuPreview({
  configuration,
  mobile,
  assets,
  mode,
}: {
  readonly configuration: WebMenuConfiguration;
  readonly mobile: boolean;
  readonly assets: readonly ProjectAsset[];
  readonly mode: ResolvedThemeMode;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  const [previewMode, setPreviewMode] = useState(mode);

  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;
    const menu = new WebMenu(element, {
      viewportWidth: mobile ? 390 : 1440,
      onThemeToggle: () => setPreviewMode((current) => (current === 'dark' ? 'light' : 'dark')),
    });
    const cancelNavigation = (event: Event): void => {
      event.preventDefault();
    };
    element.addEventListener('webrad:menu-navigate', cancelNavigation);
    menu.configuration = {
      ...configuration,
      brand: {
        ...configuration.brand,
        logo: resolveProjectImageSource(configuration.brand.logo, assets),
      },
      user: {
        ...configuration.user,
        avatar: resolveProjectImageSource(configuration.user.avatar, assets),
      },
    };
    return () => {
      element.removeEventListener('webrad:menu-navigate', cancelNavigation);
      menu.dispose();
    };
  }, [configuration, mobile, assets]);
  return (
    <div
      className="wr-menu-editor-preview-surface"
      data-webrad-theme={previewMode}
      data-orientation={configuration.orientation}
      data-mobile={mobile}
    >
      <div className="wr-webmenu" ref={ref} />
    </div>
  );
}

export function MenuConfigurationDialog({
  component,
  pages,
  assets,
  onSave,
  onClose,
  sharedUsage,
}: {
  readonly component: ComponentNode;
  readonly pages: readonly PageModel[];
  readonly assets: readonly ProjectAsset[];
  readonly onSave: (configuration: WebMenuConfiguration) => void;
  readonly onClose: () => void;
  readonly sharedUsage?: number;
}): ReactElement {
  const { mode } = useContext(ProjectThemeContext);
  const titleId = useId();
  const assetsId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [draft, setDraft] = useState(() =>
    component.props.configuration === undefined
      ? createDefaultWebMenuConfiguration()
      : parseWebMenuConfiguration(component.props.configuration),
  );
  const [section, setSection] = useState<Section>('Items');
  const [selected, setSelected] = useState(draft.items[0]?.id ?? '');
  const [pickIcon, setPickIcon] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [removedItems, setRemovedItems] = useState<readonly RemovedMenuItem[]>([]);
  const [restoredItemId, setRestoredItemId] = useState<string | null>(null);
  const flat = flattenMenuItems(draft.items);
  const location = flat.find((entry) => entry.item.id === selected);
  const item = location?.item;
  let error: string | null = null;
  try {
    parseWebMenuConfiguration(draft);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : 'Invalid menu configuration.';
  }
  const missingPage = flat.find(
    (entry) => entry.item.page && !pages.some((page) => page.id === entry.item.page),
  );
  if (missingPage) error = `Choose an existing page for ${missingPage.item.label}.`;
  if (draft.brand.page && !pages.some((page) => page.id === draft.brand.page))
    error = 'Choose an existing page for the brand.';
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const previous = returnFocus.current;
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (restoredItemId === null) return;
    Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>('[data-menu-editor-item]') ?? [],
    )
      .find((button) => button.dataset.menuEditorItem === restoredItemId)
      ?.focus();
  }, [restoredItemId]);
  const set = <K extends keyof WebMenuConfiguration>(
    key: K,
    value: WebMenuConfiguration[K],
  ): void => setDraft((current) => ({ ...current, [key]: value }));
  const changeItem = (changes: Partial<Omit<WebMenuItem, 'id'>>): void => {
    setDraft((current) => ({
      ...current,
      selectedItemId:
        changes.kind && changes.kind !== 'item' && current.selectedItemId === selected
          ? ''
          : current.selectedItemId,
      items: editMenuItem(current.items, selected, (entry) => ({
        ...entry,
        ...changes,
        id: entry.id,
      })),
    }));
  };
  const add = (nested: boolean): void => {
    const entry: WebMenuItem = {
      id: globalThis.crypto.randomUUID(),
      label: 'New item',
      icon: 'circle',
    };
    setDraft((current) => ({
      ...current,
      items: insertMenuItem(current.items, nested ? selected : null, entry),
    }));
    setSelected(entry.id);
  };
  const remove = (): void => {
    if (location === undefined) return;
    setRemovedItems((current) => [
      ...current,
      {
        item: location.item,
        parentId: location.parentId,
        index: location.index,
        activeItemId: draft.selectedItemId,
      },
    ]);
    setRestoredItemId(null);
    const items = editMenuItem(draft.items, selected, () => null);
    const ids = new Set(flattenMenuItems(items).map((entry) => entry.item.id));
    setDraft({
      ...draft,
      items,
      selectedItemId: ids.has(draft.selectedItemId) ? draft.selectedItemId : '',
    });
    setSelected(items[0]?.id ?? '');
  };
  const undoRemoval = (): void => {
    const removed = removedItems.at(-1);
    if (removed === undefined) return;
    setDraft((current) => {
      const insert = (siblings: readonly WebMenuItem[]): readonly WebMenuItem[] => {
        const index = Math.min(removed.index, siblings.length);
        return [...siblings.slice(0, index), removed.item, ...siblings.slice(index)];
      };
      const parentExists =
        removed.parentId !== null &&
        flattenMenuItems(current.items).some((entry) => entry.item.id === removed.parentId);
      const items =
        parentExists && removed.parentId !== null
          ? editMenuItem(current.items, removed.parentId, (parent) => ({
              ...parent,
              children: insert(parent.children ?? []),
            }))
          : insert(current.items);
      const restoredIds = new Set(flattenMenuItems([removed.item]).map((entry) => entry.item.id));
      return {
        ...current,
        items,
        selectedItemId:
          current.selectedItemId === '' && restoredIds.has(removed.activeItemId)
            ? removed.activeItemId
            : current.selectedItemId,
      };
    });
    setRemovedItems((current) => current.slice(0, -1));
    setSection('Items');
    setSelected(removed.item.id);
    setRestoredItemId(removed.item.id);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    if (pickIcon) return;
    const target = event.target;
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z' &&
      target instanceof HTMLElement &&
      !target.closest('input, textarea, select, [contenteditable="true"]') &&
      removedItems.length > 0
    ) {
      event.preventDefault();
      undoRemoval();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input,select,textarea,a[href]',
      ) ?? []),
    ].filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  const textField = <K extends keyof WebMenuConfiguration>(key: K, label: string): ReactElement => (
    <Field label={label}>
      <input
        value={String(draft[key])}
        onChange={(event) => set(key, event.currentTarget.value as WebMenuConfiguration[K])}
      />
    </Field>
  );
  const pageOptions = pages.map((page) => (
    <option key={page.id} value={page.id}>
      {page.name}
    </option>
  ));
  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={keyDown}>
      <SharedComponentStyles />
      <section
        className="wr-modal wr-menu-configuration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Menu / {component.name}</span>
            <h2 id={titleId}>Configure Menu</h2>
            {sharedUsage !== undefined && (
              <p>
                Shared definition · {sharedUsage} placement{sharedUsage === 1 ? '' : 's'}. Saved
                changes apply to every placement.
              </p>
            )}
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close Menu configuration"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form
          className="wr-menu-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!error) onSave(parseWebMenuConfiguration(draft));
          }}
        >
          <div className="wr-menu-editor-body">
            <div className="wr-menu-editor-main">
              <nav className="wr-menu-editor-tabs" aria-label="Menu configuration sections">
                {(['Items', 'Brand & user', 'Appearance', 'Behavior & layout'] as const).map(
                  (tab) => (
                    <button
                      type="button"
                      key={tab}
                      aria-pressed={section === tab}
                      onClick={() => setSection(tab)}
                    >
                      {tab}
                    </button>
                  ),
                )}
              </nav>
              <div className="wr-menu-editor-content">
                {section === 'Items' && (
                  <div className="wr-menu-editor-items">
                    <div className="wr-menu-editor-tree-panel">
                      <div className="wr-menu-editor-actions">
                        <button type="button" onClick={() => add(false)}>
                          <Icon name="plus" />
                          Add item
                        </button>
                        <button
                          type="button"
                          disabled={
                            !item ||
                            (item.kind !== undefined && item.kind !== 'item') ||
                            (location?.depth ?? 0) >= 11
                          }
                          onClick={() => add(true)}
                        >
                          Add child
                        </button>
                      </div>
                      <div className="wr-menu-editor-tree" role="list" aria-label="Menu items">
                        {flat.map(({ item: entry, depth }) => (
                          <button
                            type="button"
                            role="listitem"
                            key={entry.id}
                            data-menu-editor-item={entry.id}
                            className={selected === entry.id ? 'is-selected' : ''}
                            style={{ paddingInlineStart: 10 + depth * 16 }}
                            onClick={() => setSelected(entry.id)}
                          >
                            {entry.icon ? (
                              <LucideGraphic icon={entry.icon} />
                            ) : (
                              <Icon name={entry.kind === 'separator' ? 'minus' : 'circle'} />
                            )}
                            <span>{entry.kind === 'separator' ? 'Separator' : entry.label}</span>
                            {entry.visible === false && <Icon name="eye-off" />}
                          </button>
                        ))}
                      </div>
                      <div className="wr-menu-editor-actions">
                        {(['up', 'down', 'indent', 'outdent'] as const).map((direction) => (
                          <button
                            type="button"
                            key={direction}
                            aria-label={`Move item ${direction}`}
                            title={`Move item ${direction}`}
                            disabled={!item}
                            onClick={() =>
                              set('items', moveMenuItem(draft.items, selected, direction))
                            }
                          >
                            <Icon
                              name={
                                {
                                  up: 'arrow-up',
                                  down: 'arrow-down',
                                  indent: 'list-indent-increase',
                                  outdent: 'list-indent-decrease',
                                }[direction] as
                                  | 'arrow-up'
                                  | 'arrow-down'
                                  | 'list-indent-increase'
                                  | 'list-indent-decrease'
                              }
                            />
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={!item}
                          aria-label="Remove menu item"
                          onClick={remove}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </div>
                    {item ? (
                      <div className="wr-menu-editor-fields">
                        <Field label="Label">
                          <input
                            value={item.label}
                            onChange={(event) => changeItem({ label: event.currentTarget.value })}
                          />
                        </Field>
                        <Field label="Kind">
                          <select
                            value={item.kind ?? 'item'}
                            onChange={(event) =>
                              changeItem({ kind: event.currentTarget.value as WebMenuItem['kind'] })
                            }
                          >
                            <option value="item">Item</option>
                            <option value="heading" disabled={Boolean(item.children?.length)}>
                              Section heading
                            </option>
                            <option value="separator" disabled={Boolean(item.children?.length)}>
                              Separator
                            </option>
                          </select>
                        </Field>
                        <Field label="Icon">
                          <button
                            type="button"
                            className="wr-menu-editor-icon-picker"
                            disabled={item.kind !== undefined && item.kind !== 'item'}
                            onClick={() => setPickIcon(true)}
                          >
                            {item.icon && <LucideGraphic icon={item.icon} />}
                            {item.icon || 'Choose icon…'}
                          </button>
                        </Field>
                        <Field label="Badge">
                          <input
                            value={item.badge ?? ''}
                            disabled={item.kind !== undefined && item.kind !== 'item'}
                            onChange={(event) => changeItem({ badge: event.currentTarget.value })}
                          />
                        </Field>
                        <Field label="Description">
                          <input
                            value={item.description ?? ''}
                            disabled={item.kind !== undefined && item.kind !== 'item'}
                            onChange={(event) =>
                              changeItem({ description: event.currentTarget.value })
                            }
                          />
                        </Field>
                        <Field label="Application page">
                          <select
                            value={item.page ?? ''}
                            disabled={item.kind !== undefined && item.kind !== 'item'}
                            onChange={(event) =>
                              changeItem({ page: event.currentTarget.value, href: '' })
                            }
                          >
                            <option value="">None / custom action</option>
                            {pageOptions}
                          </select>
                        </Field>
                        <Field label="Link">
                          <input
                            value={item.href ?? ''}
                            disabled={item.kind !== undefined && item.kind !== 'item'}
                            placeholder="https://… or relative path"
                            onChange={(event) =>
                              changeItem({ href: event.currentTarget.value, page: '' })
                            }
                          />
                        </Field>
                        <Field label="Link target">
                          <select
                            value={item.target ?? '_self'}
                            disabled={item.kind !== undefined && item.kind !== 'item'}
                            onChange={(event) =>
                              changeItem({
                                target: event.currentTarget.value as '_self' | '_blank',
                              })
                            }
                          >
                            <option value="_self">Same window</option>
                            <option value="_blank">New window</option>
                          </select>
                        </Field>
                        <Field label="Stable item ID">
                          <input value={item.id} readOnly />
                        </Field>
                        <div className="wr-menu-editor-toggles">
                          {(['visible', 'disabled', 'expanded'] as const).map((key) => (
                            <label key={key}>
                              <input
                                type="checkbox"
                                disabled={
                                  key !== 'visible' &&
                                  item.kind !== undefined &&
                                  item.kind !== 'item'
                                }
                                checked={
                                  key === 'visible' ? item.visible !== false : item[key] === true
                                }
                                onChange={(event) =>
                                  changeItem({ [key]: event.currentTarget.checked })
                                }
                              />
                              {key === 'visible'
                                ? 'Visible'
                                : key === 'disabled'
                                  ? 'Disabled'
                                  : 'Initially expanded'}
                            </label>
                          ))}
                        </div>
                        <p className="wr-modal-description">
                          Items without a page or link run OnItemClick. Submenus support up to 12
                          levels. IDs remain stable when you rename or move an item.
                        </p>
                      </div>
                    ) : (
                      <p className="wr-modal-description">Add an item to start your menu.</p>
                    )}
                  </div>
                )}
                {section === 'Brand & user' && (
                  <div className="wr-menu-editor-fields">
                    <h3>Brand</h3>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.brand.visible}
                        onChange={(event) =>
                          set('brand', { ...draft.brand, visible: event.currentTarget.checked })
                        }
                      />{' '}
                      Show brand
                    </label>
                    {(['caption', 'subtitle', 'logo', 'href'] as const).map((key) => (
                      <Field
                        label={
                          {
                            caption: 'Brand caption',
                            subtitle: 'Brand subtitle',
                            logo: 'Logo image',
                            href: 'Brand link',
                          }[key]
                        }
                        key={key}
                      >
                        <input
                          value={draft.brand[key]}
                          list={key === 'logo' ? assetsId : undefined}
                          placeholder={
                            key === 'logo' ? 'assets/images/logo.png or HTTPS image' : undefined
                          }
                          onChange={(event) =>
                            set('brand', {
                              ...draft.brand,
                              [key]: event.currentTarget.value,
                              ...(key === 'href' ? { page: '' } : {}),
                            })
                          }
                        />
                      </Field>
                    ))}
                    <Field label="Logo size">
                      <input
                        type="number"
                        min={16}
                        max={128}
                        value={draft.brand.logoSize}
                        onChange={(event) =>
                          set('brand', {
                            ...draft.brand,
                            logoSize: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Brand page">
                      <select
                        value={draft.brand.page}
                        onChange={(event) =>
                          set('brand', {
                            ...draft.brand,
                            page: event.currentTarget.value,
                            href: '',
                          })
                        }
                      >
                        <option value="">None</option>
                        {pageOptions}
                      </select>
                    </Field>
                    <h3>User profile</h3>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.user.visible}
                        onChange={(event) =>
                          set('user', { ...draft.user, visible: event.currentTarget.checked })
                        }
                      />{' '}
                      Show user profile
                    </label>
                    {(['name', 'description', 'avatar'] as const).map((key) => (
                      <Field
                        label={
                          {
                            name: 'User name',
                            description: 'User description',
                            avatar: 'User photo',
                          }[key]
                        }
                        key={key}
                      >
                        <input
                          value={draft.user[key]}
                          list={key === 'avatar' ? assetsId : undefined}
                          onChange={(event) =>
                            set('user', { ...draft.user, [key]: event.currentTarget.value })
                          }
                        />
                      </Field>
                    ))}
                    <Field label="Status">
                      <select
                        value={draft.user.status}
                        onChange={(event) =>
                          set('user', {
                            ...draft.user,
                            status: event.currentTarget
                              .value as WebMenuConfiguration['user']['status'],
                          })
                        }
                      >
                        {['none', 'online', 'away', 'busy'].map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </Field>
                    <p className="wr-modal-description">
                      Import images through Project Assets and select their paths here. A profile
                      without a photo uses the user's initials. OnUserClick handles profile actions.
                    </p>
                  </div>
                )}
                {section === 'Appearance' && (
                  <div className="wr-menu-editor-fields">
                    <div className="wr-menu-editor-actions">
                      <button
                        type="button"
                        onClick={() =>
                          set('appearance', createProjectWebMenuAppearance(draft.appearance))
                        }
                      >
                        Follow application theme
                      </button>
                      <button
                        type="button"
                        onClick={() => set('appearance', { ...WEB_MENU_THEMES.light })}
                      >
                        Light preset
                      </button>
                      <button
                        type="button"
                        onClick={() => set('appearance', { ...WEB_MENU_THEMES.dark })}
                      >
                        Dark preset
                      </button>
                    </div>
                    {Object.entries(draft.appearance).map(([key, value]) => (
                      <Field
                        key={key}
                        label={key
                          .replace(/[A-Z]/gu, (letter) => ` ${letter.toLowerCase()}`)
                          .replace(/^./u, (letter) => letter.toUpperCase())}
                      >
                        {typeof value === 'string' ? (
                          <ColorInput
                            label={`Menu ${key}`}
                            value={value}
                            onChange={(next) =>
                              set('appearance', { ...draft.appearance, [key]: next })
                            }
                          />
                        ) : null}
                        <input
                          type={typeof value === 'number' ? 'number' : 'text'}
                          value={value}
                          min={0}
                          max={256}
                          onChange={(event) =>
                            set('appearance', {
                              ...draft.appearance,
                              [key]:
                                typeof value === 'number'
                                  ? Number(event.currentTarget.value)
                                  : event.currentTarget.value,
                            })
                          }
                        />
                      </Field>
                    ))}
                    <p className="wr-modal-description">
                      Colors accept hexadecimal values, color names and theme colors. All dimensions
                      are CSS pixels. The component Style controls its outer corners, shadow and
                      opacity.
                    </p>
                  </div>
                )}
                {section === 'Behavior & layout' && (
                  <div className="wr-menu-editor-fields">
                    <Field label="Desktop orientation">
                      <select
                        value={draft.orientation}
                        onChange={(event) =>
                          set(
                            'orientation',
                            event.currentTarget.value as WebMenuConfiguration['orientation'],
                          )
                        }
                      >
                        <option value="vertical">Vertical sidebar</option>
                        <option value="horizontal">Horizontal bar</option>
                      </select>
                    </Field>
                    <Field label="Mobile icon position">
                      <select
                        value={draft.mobileIconPosition}
                        onChange={(event) =>
                          set(
                            'mobileIconPosition',
                            event.currentTarget.value as WebMenuConfiguration['mobileIconPosition'],
                          )
                        }
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </Field>
                    {(
                      [
                        'collapsible',
                        'collapsed',
                        'accordion',
                        'searchable',
                        'themeToggle',
                        'closeOnSelect',
                      ] as const
                    ).map((key) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={draft[key]}
                          onChange={(event) => set(key, event.currentTarget.checked)}
                        />
                        {
                          {
                            collapsible: 'Show collapse control',
                            collapsed: 'Initially collapsed',
                            accordion: 'One expanded submenu per level',
                            searchable: 'Show menu search',
                            themeToggle: 'Show theme switch',
                            closeOnSelect: 'Close navigation after selection',
                          }[key]
                        }
                      </label>
                    ))}
                    {textField('accessibleLabel', 'Accessible navigation label')}
                    <Field label="Search behavior">
                      <select
                        value={draft.searchMode}
                        disabled={!draft.searchable}
                        onChange={(event) =>
                          set(
                            'searchMode',
                            event.currentTarget.value as WebMenuConfiguration['searchMode'],
                          )
                        }
                      >
                        <option value="filter">Filter menu items</option>
                        <option value="event">Only trigger OnSearch</option>
                      </select>
                    </Field>
                    <p className="wr-modal-description">
                      Filter menu items while typing, or keep navigation unchanged and press Enter
                      in the search field to trigger Interaction &gt; OnSearch.
                    </p>
                    {textField('searchPlaceholder', 'Search placeholder')}
                    {textField('emptyText', 'Empty search text')}
                    {textField('footerText', 'Footer text')}
                    <Field label="Initially selected item">
                      <select
                        value={draft.selectedItemId}
                        onChange={(event) => set('selectedItemId', event.currentTarget.value)}
                      >
                        <option value="">None</option>
                        {flat
                          .filter((entry) => !entry.item.kind || entry.item.kind === 'item')
                          .map((entry) => (
                            <option key={entry.item.id} value={entry.item.id}>
                              {entry.item.label}
                            </option>
                          ))}
                      </select>
                    </Field>

                    <p className="wr-modal-description">
                      WebRAD manages floating placement and mobile adaptation automatically. Choose
                      the menu sides and size limits in the Inspector.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <aside className="wr-menu-editor-preview">
              <header>
                <strong>Preview</strong>
                <div>
                  <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>
                    Desktop
                  </button>
                  <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>
                    Mobile
                  </button>
                </div>
              </header>
              {error ? (
                <p role="status">Correct the configuration to update the preview.</p>
              ) : (
                <MenuPreview
                  key={mode}
                  mode={mode}
                  configuration={draft}
                  mobile={mobile}
                  assets={assets}
                />
              )}
            </aside>
          </div>
          <datalist id={assetsId}>
            {assets
              .filter((asset) => asset.mediaType.startsWith('image/'))
              .map((asset) => (
                <option key={asset.id} value={projectAssetPath(asset)} />
              ))}
          </datalist>
          {error && (
            <p className="wr-menu-editor-error" role="alert">
              {error}
            </p>
          )}
          {removedItems.length > 0 && (
            <div className="wr-menu-removal-notice">
              <span role="status">
                Removed {removedItems.at(-1)?.item.label || 'menu item'}
                {flattenMenuItems(removedItems.at(-1)?.item.children ?? []).length > 0
                  ? ' and its child items.'
                  : '.'}
              </span>
              <button type="button" onClick={undoRemoval} aria-label="Undo menu item removal">
                <Icon name="undo" /> Undo removal
              </button>
            </div>
          )}
          <footer className="wr-modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={error !== null}>
              Save Menu
            </button>
          </footer>
        </form>
      </section>
      {pickIcon && item && (
        <IconPickerDialog
          icons={LUCIDE_ICON_NAMES}
          selected={item.icon || undefined}
          libraryLabel="Menu / Icon"
          renderIcon={(icon) => <LucideGraphic icon={icon} />}
          onClose={() => setPickIcon(false)}
          onClear={() => {
            changeItem({ icon: '' });
            setPickIcon(false);
          }}
          onSelect={(icon) => {
            changeItem({ icon });
            setPickIcon(false);
          }}
        />
      )}
    </div>,
    document.body,
  );
}
