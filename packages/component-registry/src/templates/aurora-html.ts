import { panel, paragraph, text, type DemoNode } from './demo-layout.js';

/** Local HTML/CSS content that stays editable through the ordinary HTML property. */
export function htmlControls(): readonly DemoNode[] {
  return [
    panel('HtmlPanel', [
      text('HtmlHeading', 'HTML / YOUR OWN MARKUP AND CSS', 30),
      paragraph(
        'HtmlDescription',
        'Select EmbeddedHtml in the Designer and edit its HTML property. The card below uses local markup and CSS, with no external services.',
      ),
      {
        type: 'WebHtml',
        name: 'EmbeddedHtml',
        height: 210,
        props: {
          title: 'Editable HTML and CSS example',
          html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font: 15px/1.5 system-ui, sans-serif; color: #24334d; background: #f5f7fc; }
    article { max-width: 640px; margin: auto; padding: 20px; border: 1px solid #dbe3f3; border-radius: 8px; background: white; }
    small { color: #5b48b5; font-weight: 700; letter-spacing: .08em; }
    h1 { margin: 8px 0; font-size: clamp(20px, 4vw, 28px); line-height: 1.2; }
    p { margin: 0; color: #52627a; }
  </style>
</head>
<body>
  <article>
    <small>HTML + CSS</small>
    <h1>Make this space your own.</h1>
    <p>Edit the markup, change the styles and run Preview to see your changes.</p>
  </article>
</body>
</html>`,
        },
      },
    ]),
  ];
}
