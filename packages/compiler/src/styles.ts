import { WEBRAD_COMPONENT_CSS } from '@webrad/runtime/visual';

export const GENERATED_APP_CSS = `:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --wr-input-bg: #ffffff;
  --wr-muted-text: #657184;
  --wr-accent: #1479d3;
  --wr-control-border: #9da9b8;
  --wr-control-surface: #f5f7fa;
  --wr-button-bg: #edf1f6;
  --wr-button-hover: #dfe6ef;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  margin: 0;
}

body {
  display: grid;
  place-items: start center;
  padding: 24px;
  color: #1f2937;
  background: #e5e7eb;
}

.wr-webform {
  color: #111827;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  box-shadow: 0 16px 40px rgb(15 23 42 / 18%);
}

${WEBRAD_COMPONENT_CSS}
`;
