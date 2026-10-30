/** Account editor styles scoped to the Menu's native modal. */
export const WEB_MENU_USER_SETTINGS_CSS = `
.wr-account-dialog { --wr-account-max-height: min(720px, calc(100dvh - 32px)); box-sizing: border-box; width: min(520px, calc(100vw - 32px)); max-width: 100%; max-height: var(--wr-account-max-height); padding: 0; border: 1px solid var(--wr-menu-border); border-radius: 16px; background: var(--wr-menu-background); color: var(--wr-menu-foreground); font: inherit; box-shadow: 0 24px 80px #0005; overflow: hidden; }
.wr-account-dialog::backdrop { background: #0f172a70; backdrop-filter: blur(4px); }
.wr-account-shell { display: flex; flex-direction: column; max-height: calc(var(--wr-account-max-height) - 2px); min-height: 0; }
.wr-account-dialog *, .wr-account-dialog *::before { box-sizing: border-box; }
.wr-account-header { display: flex; align-items: center; flex: 0 0 auto; gap: 12px; padding: 14px 20px 6px; }
.wr-account-heading { flex: 1; min-width: 0; }
.wr-account-heading h2 { margin: 0; font-size: 20px; line-height: 1.3; letter-spacing: -.025em; color: inherit; }
.wr-account-close { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; padding: 8px; border: 0; border-radius: 10px; background: transparent; color: var(--wr-menu-muted); cursor: pointer; }
.wr-account-close:hover { background: var(--wr-menu-hover-background); }
.wr-account-close .wr-icon-graphic { width: 18px; height: 18px; }
.wr-account-tabs { display: flex; flex: 0 0 auto; gap: 4px; margin: 4px 20px 0; padding: 4px; border-radius: 10px; background: var(--wr-menu-hover-background); }
.wr-account-tabs button { flex: 1; min-height: 36px; padding: 6px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--wr-menu-muted); font-size: 13px; font-weight: 600; cursor: pointer; }
.wr-account-tabs button[aria-selected='true'] { background: var(--wr-menu-background); color: var(--wr-menu-active-foreground); box-shadow: 0 1px 3px #0001; }
.wr-account-body { padding: 18px 20px; overflow: auto; overscroll-behavior: contain; min-height: 0; scrollbar-width: thin; }
.wr-account-dialog [hidden] { display: none !important; }
.wr-account-dialog button, .wr-account-dialog input { font-family: inherit; }
.wr-account-dialog :is(button, input, summary):focus-visible { outline: 2px solid var(--wr-menu-accent); outline-offset: 2px; }
.wr-account-dialog button:disabled { opacity: .5; cursor: default; }
.wr-account-form, .wr-account-fields { display: grid; gap: 14px; border: 0; padding: 0; margin: 0; min-width: 0; }
.wr-account-field { display: grid; gap: 6px; font-size: 12px; font-weight: 600; }
.wr-account-field > span { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.wr-account-field input { width: 100%; min-width: 0; min-height: 42px; border: 1px solid var(--wr-menu-border); border-radius: 9px; padding: 9px 11px; background: var(--wr-menu-background); color: inherit; font-size: 14px; font-weight: 400; }
.wr-account-field input:disabled { background: var(--wr-menu-hover-background); color: var(--wr-menu-muted); }
.wr-account-hint { margin: 0; color: var(--wr-menu-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.wr-account-actions { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
.wr-account-button { min-height: 40px; border: 1px solid var(--wr-menu-border); border-radius: 9px; padding: 8px 13px; background: var(--wr-menu-background); color: inherit; cursor: pointer; font-size: 13px; font-weight: 600; }
.wr-account-button:hover:not(:disabled) { background: var(--wr-menu-hover-background); }
.wr-account-primary { background: var(--wr-menu-active-foreground); color: var(--wr-menu-background); border-color: transparent; }
.wr-account-primary:hover:not(:disabled) { background: var(--wr-menu-active-foreground); filter: brightness(.94); }
.wr-account-text-button { min-height: 36px; padding: 6px 8px; border-color: transparent; background: transparent; color: var(--wr-menu-muted); font-size: 12px; font-weight: 500; }
.wr-account-text-button:hover:not(:disabled) { color: var(--wr-menu-foreground); }
.wr-account-photo { display: flex; gap: 14px; align-items: center; padding: 0 0 16px; border-bottom: 1px solid var(--wr-menu-border); }
.wr-account-avatar { display: grid; place-items: center; width: 56px; height: 56px; flex: 0 0 auto; overflow: hidden; border-radius: 50%; background: var(--wr-menu-active-background); color: var(--wr-menu-active-foreground); font-size: 20px; font-weight: 600; }
.wr-account-avatar img { width: 100%; height: 100%; object-fit: cover; }
.wr-account-photo-copy { display: grid; gap: 5px; flex: 1; min-width: 0; }
.wr-account-photo-copy strong { font-size: 12px; overflow-wrap: anywhere; }
.wr-account-upload { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: var(--wr-menu-active-background); color: var(--wr-menu-active-foreground); border-color: transparent; }
.wr-account-upload .wr-icon-graphic { width: 16px; height: 16px; flex: 0 0 auto; }
.wr-account-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--wr-menu-muted); }
.wr-account-details { border-top: 1px solid var(--wr-menu-border); padding-top: 4px; }
.wr-account-details > summary { display: list-item; padding: 8px 0; color: var(--wr-menu-muted); font-size: 12px; cursor: pointer; }
.wr-account-summary { display: grid; gap: 10px; padding: 6px 0; }
.wr-account-detail { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; }
.wr-account-detail span { overflow-wrap: anywhere; min-width: 0; }
.wr-account-badge { padding: 3px 7px; border-radius: 99px; background: var(--wr-menu-active-background); color: var(--wr-menu-active-foreground); font-size: 11px; font-weight: 600; }
.wr-account-security-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; padding-top: 6px; border-top: 1px solid var(--wr-menu-border); }
.wr-account-footer { flex: 0 0 auto; display: grid; gap: 10px; padding: 12px 20px 16px; border-top: 1px solid var(--wr-menu-border); background: var(--wr-menu-background); }
.wr-account-footer-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.wr-account-feedback { margin: 0; color: var(--wr-menu-muted); line-height: 1.45; font-size: 12px; overflow-wrap: anywhere; }
.wr-account-feedback[data-kind='error'] { color: var(--wr-theme-danger, #dc2626); }
.wr-account-feedback[data-kind='success'] { color: var(--wr-theme-success, #15803d); }
@media (max-width: 520px) {
  .wr-account-dialog { --wr-account-max-height: 100dvh; width: 100%; max-width: 100%; max-height: 100dvh; height: 100dvh; margin: 0; border: 0; border-radius: 0; }
  .wr-account-shell { height: 100%; max-height: 100%; }
  .wr-account-header { padding: max(12px, env(safe-area-inset-top)) 16px 4px; }
  .wr-account-close { width: 44px; height: 44px; }
  .wr-account-tabs { margin-inline: 16px; }
  .wr-account-tabs button { min-height: 40px; }
  .wr-account-body { padding: 16px; flex: 1 1 auto; }
  .wr-account-field input { min-height: 44px; font-size: 16px; }
  .wr-account-button { min-height: 44px; }
  .wr-account-footer { padding: 12px 16px max(12px, env(safe-area-inset-bottom)); }
  .wr-account-footer-actions > .wr-account-primary { flex: 1; }
  .wr-account-photo { gap: 12px; }
}
`;
