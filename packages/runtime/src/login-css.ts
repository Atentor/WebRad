/** Layout is shared; project Style utility classes own paint and interaction states. */
export const WEB_LOGIN_CSS = `
.wr-weblogin { min-width: 0; min-height: 0; max-width: 100%; overflow: auto; font-family: inherit; }
.wr-weblogin, .wr-login-dialog { container: wr-login / inline-size; }
.wr-weblogin[data-login-presentation='popup'][data-login-design='false']:not([hidden]) { display: contents !important; }
.wr-login-panel, .wr-login-panel.wr-webpanel { box-sizing: border-box; position: relative; width: 100%; max-width: var(--wr-login-maxWidth); margin-inline: auto; padding: var(--wr-login-padding); font-size: 14px; line-height: 1.4; }
.wr-login-panel *, .wr-login-panel *::before, .wr-login-panel *::after { box-sizing: border-box; }
.wr-login-title { margin: 0 0 4px; font-size: 1.35em; line-height: 1.3; overflow-wrap: anywhere; }
.wr-login-subtitle { margin: 0 0 12px; font-size: .93em; line-height: 1.4; overflow-wrap: anywhere; }
.wr-login-fields { display: flex; flex-direction: column; gap: var(--wr-login-gap); border: 0; padding: 0; margin: 0; min-width: 0; }
.wr-login-panel > .wr-login-form { display: block; margin: 0; padding: 0; }
.wr-login-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.wr-login-label { font-size: .9em; font-weight: 500; }
.wr-login-input, .wr-login-input.wr-webedit { width: 100%; min-width: 0; min-height: var(--wr-login-fieldHeight); padding: 6px 10px; font: inherit; line-height: 1.4; }
.wr-login-submit, .wr-login-link, .wr-login-close { font: inherit; cursor: pointer; overflow-wrap: anywhere; white-space: normal; touch-action: manipulation; }
.wr-login-submit, .wr-login-submit.wr-webbutton { align-self: center; margin-inline: auto; width: fit-content; max-width: 100%; min-height: var(--wr-login-fieldHeight); padding: 6px 12px; }
.wr-login-link, .wr-login-close { min-height: 30px; padding: 4px 6px; font-size: .93em; }
.wr-login-link:not([data-login-styled='true']), .wr-login-close:not([data-login-styled='true']) { border: 0; background: transparent; color: var(--wr-theme-primary); }
.wr-login-options { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; }
.wr-login-options > .wr-login-link { margin-inline-start: auto; }
.wr-login-remember { display: flex; align-items: center; gap: 6px; min-height: 30px; cursor: pointer; font-size: .9em; }
.wr-login-remember input { width: 16px; height: 16px; flex-shrink: 0; margin: 0; accent-color: var(--wr-theme-primary); }
.wr-login-feedback { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
.wr-login-feedback[data-error='true']:not([data-login-styled='true']) { color: var(--wr-theme-danger); }
.wr-login-panel [hidden] { display: none !important; }
.wr-login-panel :is(input, button):not([data-login-styled='true']):focus-visible { outline: 2px solid var(--wr-theme-focus); outline-offset: 2px; }
.wr-login-fields:disabled { opacity: .65; }
.wr-login-fields:disabled button { cursor: default; }
.wr-login-dialog, .wr-login-dialog.wr-webpopup { max-width: min(var(--wr-login-maxWidth), calc(100vw - 24px)); width: 100%; max-height: calc(100dvh - 24px); padding: 0; overflow: auto; }
.wr-login-static-popup { margin-inline: auto; }
.wr-login-close { display: block; margin-inline-start: auto; }

/* Compatibility for saved configurations without internal Style bindings. */
.wr-weblogin[data-login-styling='legacy'] :is(.wr-login-panel, .wr-login-dialog) { color: var(--wr-login-foreground); background: var(--wr-login-background); font-family: var(--wr-login-fontFamily); font-size: var(--wr-login-fontSize); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-panel { border: 1px solid transparent; border-radius: var(--wr-login-borderRadius); background: linear-gradient(to bottom, var(--wr-login-background), var(--wr-login-backgroundEnd, var(--wr-login-background))) padding-box, linear-gradient(to bottom right, var(--wr-login-border), var(--wr-login-borderEnd, var(--wr-login-border))) border-box; box-shadow: 0 1px 2px rgb(0 0 0 / .05); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-title { color: var(--wr-login-heading, var(--wr-login-foreground)); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-subtitle { color: var(--wr-login-muted); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-input { color: inherit; border: 1px solid transparent; border-radius: calc(var(--wr-login-borderRadius) / 2); background: linear-gradient(to bottom, var(--wr-login-inputBackground), var(--wr-login-inputBackgroundEnd, var(--wr-login-inputBackground))) padding-box, linear-gradient(to bottom right, var(--wr-login-border), var(--wr-login-borderEnd, var(--wr-login-border))) border-box; box-shadow: 0 1px 2px rgb(0 0 0 / .05); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-submit { color: var(--wr-login-onPrimary); border: 1px solid transparent; border-radius: calc(var(--wr-login-borderRadius) / 2); background: linear-gradient(to bottom right, var(--wr-login-primary), var(--wr-login-primaryEnd, var(--wr-login-primary))) padding-box, linear-gradient(to bottom right, var(--wr-login-focus, var(--wr-login-primary)), var(--wr-login-primaryEnd, var(--wr-login-primary))) border-box; box-shadow: 0 1px 2px rgb(0 0 0 / .05); font-weight: 600; }
.wr-weblogin[data-login-styling='legacy'] :is(.wr-login-input, .wr-login-submit) { transition: box-shadow 200ms ease-out, background-color 200ms ease-out; }
.wr-weblogin[data-login-styling='legacy'] :is(.wr-login-input, .wr-login-submit):hover:not(:disabled) { box-shadow: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-submit:hover:not(:disabled) { background: linear-gradient(to bottom right, color-mix(in srgb, var(--wr-login-primary) 88%, white), color-mix(in srgb, var(--wr-login-primaryEnd, var(--wr-login-primary)) 88%, white)) padding-box, linear-gradient(to bottom right, var(--wr-login-focus, var(--wr-login-primary)), var(--wr-login-primaryEnd, var(--wr-login-primary))) border-box; }
.wr-weblogin[data-login-styling='legacy'] .wr-login-submit:active:not(:disabled) { background: linear-gradient(to bottom right, color-mix(in srgb, var(--wr-login-primary) 88%, black), color-mix(in srgb, var(--wr-login-primaryEnd, var(--wr-login-primary)) 88%, black)) padding-box, linear-gradient(to bottom right, var(--wr-login-focus, var(--wr-login-primary)), var(--wr-login-primaryEnd, var(--wr-login-primary))) border-box; }
.wr-weblogin[data-login-styling='legacy'] :is(.wr-login-link, .wr-login-close) { color: var(--wr-login-primary); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-remember input { accent-color: var(--wr-login-primary); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-feedback[data-error='true'] { color: var(--wr-login-error); }
.wr-weblogin[data-login-styling='legacy'] :is(input, button):focus-visible { outline: 2px solid var(--wr-login-focus, var(--wr-login-primary)); outline-offset: 2px; }
.wr-weblogin[data-login-styling='legacy'] .wr-login-dialog { border: 0; border-radius: var(--wr-login-borderRadius); }
.wr-weblogin[data-login-styling='legacy'] .wr-login-dialog::backdrop { background: rgb(0 0 0 / .5); }

@container wr-login (max-width: 400px) {
  .wr-login-input, .wr-login-input.wr-webedit { --wr-edit-min-font-size: 16px; min-height: max(var(--wr-login-fieldHeight), 44px); font-size: max(16px, 1em); }
  .wr-login-submit, .wr-login-submit.wr-webbutton { min-height: max(var(--wr-login-fieldHeight), 44px); }
  .wr-login-link, .wr-login-close, .wr-login-remember { min-height: 44px; }
}
@media (pointer: coarse) {
  .wr-login-input, .wr-login-input.wr-webedit { --wr-edit-min-font-size: 16px; min-height: max(var(--wr-login-fieldHeight), 44px); font-size: max(16px, 1em); }
  .wr-login-submit, .wr-login-submit.wr-webbutton { min-height: max(var(--wr-login-fieldHeight), 44px); }
  .wr-login-link, .wr-login-close, .wr-login-remember { min-height: 44px; }
}
`;
