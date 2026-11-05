/** Browser toast layout and motion; paint colors come from the component style. */
export const WEB_TOAST_CSS = `
.wr-toast-region { --wr-toast-motion-y: -10px; position: fixed !important; z-index: 2147483000; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; width: min(476px, calc(100vw + 64px)) !important; height: auto !important; max-height: calc(100vh + 64px); padding: 48px; overflow-x: hidden; overflow-y: auto; pointer-events: none; }
.wr-toast-region[data-toast-position^="top-"] { top: -32px; }
.wr-toast-region[data-toast-position^="middle-"] { --wr-toast-motion-y: 0px; top: 50%; transform: translateY(-50%); }
.wr-toast-region[data-toast-position^="bottom-"] { --wr-toast-motion-y: 10px; bottom: -32px; flex-direction: column-reverse; }
.wr-toast-region[data-toast-position$="-left"] { left: -32px; }
.wr-toast-region[data-toast-position$="-center"] { left: 50%; translate: -50% 0; }
.wr-toast-region[data-toast-position$="-right"] { right: -32px; }
.wr-toast-host { position: static !important; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; width: 100% !important; height: auto !important; overflow: visible !important; pointer-events: none; }
.wr-toast-host[data-toast-position^="bottom-"] { flex-direction: column-reverse; }
.wr-toast-preview { box-sizing: border-box; display: grid; gap: 10px; min-width: 0; max-width: 100%; padding: 32px; container-type: inline-size; }
.wr-toast-item { box-sizing: border-box; pointer-events: auto; display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 60px; padding: 12px 14px; border: 1px solid transparent; border-radius: 10px; box-shadow: 0 8px 24px rgb(15 23 42 / .12), 0 2px 6px rgb(15 23 42 / .06); font: 400 14px/1.4 sans-serif; animation: wr-toast-in .26s cubic-bezier(.2,.8,.2,1) both; }
.wr-toast-item[data-toast-state="sucess"] { background: var(--wr-toast-sucess-background, #ecfdf5); color: var(--wr-toast-sucess-text, #065f46); border-color: var(--wr-toast-sucess-border, #a7f3d0); }
.wr-toast-item[data-toast-state="alert"] { background: var(--wr-toast-alert-background, #fffbeb); color: var(--wr-toast-alert-text, #92400e); border-color: var(--wr-toast-alert-border, #fde68a); }
.wr-toast-item[data-toast-state="danger"] { background: var(--wr-toast-danger-background, #fef2f2); color: var(--wr-toast-danger-text, #991b1b); border-color: var(--wr-toast-danger-border, #fecaca); }
.wr-toast-item[data-toast-state="notifier"] { background: var(--wr-toast-notifier-background, #eff6ff); color: var(--wr-toast-notifier-text, #1e40af); border-color: var(--wr-toast-notifier-border, #bfdbfe); }
.wr-toast-icon { box-sizing: border-box; display: block; width: 22px; height: 22px; flex: none; }
.wr-toast-message { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.wr-toast-close { box-sizing: border-box; display: inline-flex; flex: none; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 7px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; opacity: .7; transition: background-color .16s ease, opacity .16s ease; }
.wr-toast-close:hover { background: color-mix(in srgb, currentColor 10%, transparent); opacity: 1; }
.wr-toast-close:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; opacity: 1; }
.wr-toast-close svg { display: block; width: 100%; height: 100%; }
.wr-toast-item[data-closing="true"] { animation: wr-toast-out .2s ease-in both; }
@keyframes wr-toast-in { from { opacity: 0; transform: translateY(var(--wr-toast-motion-y, -10px)) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes wr-toast-out { to { opacity: 0; transform: translateY(var(--wr-toast-motion-y, -10px)) scale(.98); } }
@container (max-width: 220px) { .wr-toast-preview .wr-toast-item { gap: 6px; padding: 10px 8px; } .wr-toast-preview .wr-toast-close { width: 24px; height: 24px; padding: 4px; } }
@media (prefers-reduced-motion: reduce) { .wr-toast-item, .wr-toast-item[data-closing="true"] { animation-duration: .001ms; } .wr-toast-close { transition: none; } }
`.trim();
