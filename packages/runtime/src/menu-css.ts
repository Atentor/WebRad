/** Shared by Designer, compiled Preview and ordinary browser exports. */
export const WEB_MENU_CSS = `
.wr-webmenu { min-width: 0; min-height: 0; border: 0; font-family: inherit; }
.wr-webmenu, .wr-menu-dialog { color: var(--wr-menu-foreground); font-size: var(--wr-menu-font-size); }
.wr-menu-panel { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box; padding: var(--wr-menu-padding); gap: 16px; background: var(--wr-menu-background); color: var(--wr-menu-foreground); border: 1px solid var(--wr-menu-border); border-radius: inherit; }
.wr-menu-panel *, .wr-menu-panel *::before, .wr-menu-panel *::after { box-sizing: border-box; }
.wr-menu-panel button, .wr-menu-panel input, .wr-menu-mobile-trigger { font: inherit; }
.wr-menu-panel button, .wr-menu-panel a { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.wr-menu-panel .wr-icon-graphic, .wr-menu-mobile-trigger .wr-icon-graphic { flex: 0 0 auto; display: block; width: var(--wr-menu-icon-size); height: var(--wr-menu-icon-size); pointer-events: none; }
.wr-menu-header { display: flex; align-items: center; flex: 0 0 auto; gap: 8px; min-width: 0; min-height: 44px; }
.wr-menu-brand { flex: 1 1 auto; display: flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none; }
.wr-menu-brand-mark, .wr-menu-logo { flex: 0 0 auto; width: var(--wr-menu-logo-size); height: var(--wr-menu-logo-size); border-radius: 10px; object-fit: contain; }
.wr-menu-brand-mark { display: grid; place-items: center; background: var(--wr-menu-active-background); color: var(--wr-menu-accent); }
.wr-menu-copy, .wr-menu-item-copy { display: flex; flex: 1 1 auto; flex-direction: column; gap: 3px; min-width: 0; text-align: start; }
.wr-menu-brand-caption { font-size: 1.05em; letter-spacing: -.025em; line-height: 1.4; }
.wr-menu-muted, .wr-menu-description { font-size: .82em; color: var(--wr-menu-muted); font-weight: 400; line-height: 1.4; }
.wr-menu-copy > *, .wr-menu-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-menu-icon-button { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 40px; height: 40px; padding: 8px; border: 0; border-radius: var(--wr-menu-item-radius); background: transparent; color: var(--wr-menu-muted); cursor: pointer; }
.wr-menu-icon-button:hover, .wr-menu-item:hover, .wr-menu-user:hover { background: var(--wr-menu-hover-background); }
.wr-menu-panel :is(button, a, input):focus-visible, .wr-menu-mobile-trigger:focus-visible { outline: 2px solid var(--wr-menu-accent); outline-offset: 2px; }
.wr-menu-search { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 10px; min-height: 40px; color: var(--wr-menu-muted); background: var(--wr-menu-hover-background); border: 1px solid var(--wr-menu-border); border-radius: var(--wr-menu-item-radius); }
.wr-menu-search-input { width: 100%; min-width: 0; border: 0; background: transparent; color: var(--wr-menu-foreground); padding: 0; }
.wr-menu-search-input::placeholder { color: var(--wr-menu-muted); opacity: 1; }
.wr-menu-navigation { flex: 1 1 auto; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; overscroll-behavior: contain; padding: 3px; margin: -3px; }
.wr-menu-list, .wr-menu-submenu { display: flex; flex-direction: column; gap: var(--wr-menu-item-gap); padding: 0; margin: 0; list-style: none; }
.wr-menu-row { position: relative; min-width: 0; }
.wr-menu-line { display: flex; align-items: center; gap: 2px; min-width: 0; }
.wr-menu-item { display: flex; flex: 1 1 auto; align-items: center; min-width: 0; min-height: var(--wr-menu-item-height); padding: 9px 10px; gap: 10px; border: 0; border-radius: var(--wr-menu-item-radius); color: inherit; background: transparent; text-decoration: none; text-align: start; cursor: pointer; font-weight: 500; line-height: 1.4; }
.wr-menu-item > .wr-icon-graphic:last-child:not(:first-child) { margin-inline-start: auto; width: 16px; height: 16px; transition: transform 160ms ease; }
.wr-menu-item[aria-expanded='true'] > .wr-icon-graphic:last-child, .wr-menu-icon-button[aria-expanded='true'] > .wr-icon-graphic { transform: rotate(180deg); }
.wr-menu-item[aria-current='page'] { background: var(--wr-menu-active-background); color: var(--wr-menu-active-foreground); box-shadow: inset 3px 0 0 var(--wr-menu-accent); }
.wr-menu-item[aria-disabled='true'], .wr-menu-panel button:disabled { opacity: .5; cursor: not-allowed; }
.wr-menu-badge { flex: 0 0 auto; max-width: 72px; padding: 2px 7px; border-radius: 6px; background: var(--wr-menu-badge-background); color: var(--wr-menu-badge-foreground); font-size: .78em; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.wr-menu-submenu { margin-block-start: var(--wr-menu-item-gap); margin-inline-start: var(--wr-menu-indent); padding-inline-start: 7px; border-inline-start: 1px solid var(--wr-menu-border); }
.wr-menu-submenu[hidden] { display: none !important; }
.wr-menu-heading { padding: 16px 10px 6px; font-size: .75em; text-transform: uppercase; letter-spacing: .08em; color: var(--wr-menu-muted); font-weight: 600; }
.wr-menu-separator { margin: 10px 4px; border-block-start: 1px solid var(--wr-menu-border); }
.wr-menu-empty { padding: 16px 10px; color: var(--wr-menu-muted); font-size: .9em; }
.wr-menu-user { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; padding: 12px 6px 4px; width: 100%; min-width: 0; border: 0; border-block-start: 1px solid var(--wr-menu-border); background: transparent; color: inherit; border-radius: 0 0 var(--wr-menu-item-radius) var(--wr-menu-item-radius); cursor: pointer; }
.wr-menu-avatar { position: relative; display: grid; flex: 0 0 auto; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--wr-menu-active-foreground); background: var(--wr-menu-active-background); font-size: 12px; font-weight: 600; }
.wr-menu-avatar-image { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.wr-menu-status { position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border: 2px solid var(--wr-menu-background); border-radius: 50%; background: #22c55e; }
.wr-menu-status[data-status='away'] { background: #f59e0b; }
.wr-menu-status[data-status='busy'] { background: #ef4444; }
.wr-menu-footer { display: block; flex: 0 0 auto; padding: 2px 10px; color: var(--wr-menu-muted); font-size: .78em; text-align: center; }
.wr-webmenu[data-menu-collapsed='true'] > .wr-menu-panel { padding: 10px 8px; }
.wr-webmenu[data-menu-collapsed='true'] :is(.wr-menu-copy, .wr-menu-item-copy, .wr-menu-badge, .wr-menu-heading, .wr-menu-search, .wr-menu-footer, .wr-menu-submenu, .wr-menu-brand) { display: none; }
.wr-webmenu[data-menu-collapsed='true'] .wr-menu-header, .wr-webmenu[data-menu-collapsed='true'] .wr-menu-item, .wr-webmenu[data-menu-collapsed='true'] .wr-menu-user { justify-content: center; }
.wr-webmenu[data-menu-collapsed='true'] .wr-menu-item > .wr-icon-graphic:not(:first-child), .wr-webmenu[data-menu-collapsed='true'] .wr-menu-line > .wr-menu-icon-button, .wr-webmenu[data-menu-collapsed='true'] .wr-menu-user > .wr-icon-graphic { display: none; }
.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] > .wr-menu-panel { flex-direction: row; align-items: center; gap: 20px; }
.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] .wr-menu-navigation { overflow-x: auto; overflow-y: hidden; }
.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] .wr-menu-list { flex-direction: row; align-items: center; flex-wrap: nowrap; }
.wr-menu-submenu.wr-menu-flyout { position: fixed; inset: auto; display: flex; flex-direction: column; min-width: min(220px, calc(100vw - 16px)); width: max-content; max-width: min(340px, calc(100vw - 16px)); max-height: calc(100dvh - 16px); overflow: auto; padding: 8px; margin: 0; border: 1px solid var(--wr-menu-border); border-radius: var(--wr-menu-item-radius); background: var(--wr-menu-background); color: var(--wr-menu-foreground); box-shadow: 0 12px 36px #0f172a24; box-sizing: border-box; }
.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] .wr-menu-user { border: 0; padding: 4px; width: auto; max-width: 240px; }
.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] .wr-menu-search { max-width: 220px; }
.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] .wr-menu-heading { padding: 8px; }
.wr-menu-mobile-trigger { box-sizing: border-box; height: 100%; overflow: hidden; display: flex; align-items: center; gap: 12px; min-height: 48px; width: 100%; padding: 12px 16px; border: 1px solid var(--wr-menu-border); border-radius: inherit; background: var(--wr-menu-background); color: var(--wr-menu-foreground); text-align: start; cursor: pointer; }
.wr-menu-dialog { position: fixed; inset: 0 auto 0 0; width: min(var(--wr-menu-drawer-width), 92vw); max-width: 92vw; height: 100dvh; max-height: 100dvh; padding: 0; margin: 0; border: 0; background: var(--wr-menu-background); overflow: hidden; box-shadow: 8px 0 40px #0003; }
.wr-menu-dialog[data-side='right'] { inset: 0 0 0 auto; }
.wr-menu-dialog::backdrop { background: #0f172a70; backdrop-filter: blur(3px); }
.wr-menu-dialog[open] { display: flex; animation: wr-menu-appear 160ms ease-out; }
.wr-menu-dialog .wr-menu-panel { border-radius: 0; padding-block-start: max(var(--wr-menu-padding), env(safe-area-inset-top)); padding-block-end: max(var(--wr-menu-padding), env(safe-area-inset-bottom)); }
.wr-webmenu[data-menu-static='true'] > .wr-menu-panel { pointer-events: none; }
.wr-webmenu[aria-disabled='true'] { opacity: .55; }
@keyframes wr-menu-appear { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) { .wr-menu-dialog[open] { animation: none; } .wr-menu-item > .wr-icon-graphic { transition: none; } }

.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] > .wr-menu-panel { overflow: visible; }
.wr-menu-submenu.wr-menu-flyout .wr-menu-item { white-space: normal; }

.wr-webmenu[data-menu-orientation='horizontal'][data-menu-mobile='false'] .wr-menu-header { max-width: 40%; }

.wr-menu-dialog[data-side='center'] { inset: 0 auto 0 50%; translate: -50% 0; }
`;
