import { describe, expect, it } from 'vitest';
import { createProject, parseProject } from '@webrad/project-model';
import { selectProjectAssets } from '../src/asset-selection.js';
import { selectComponentCss } from '../src/styles.js';

function project() {
  return parseProject({
    ...createProject('Assets'),
    assets: [
      { id: 'logo', fileName: 'logo.png', mediaType: 'image/png', base64: 'AA==' },
      { id: 'unused', fileName: 'unused.png', mediaType: 'image/png', base64: 'AQ==' },
    ],
  });
}

describe('reachable deployment resources', () => {
  it('keeps static and concatenated asset URLs and removes unused images', () => {
    const result = selectProjectAssets(project(), {
      'pages/PageMain.ts': "fetch('assets/imported/' + 'logo.png');",
    });
    expect(result.map((asset) => asset.id)).toEqual(['logo']);
    expect(
      selectProjectAssets(
        project(),
        {},
        'a { background-image: url(assets/imported/logo.png) }',
      ).map((asset) => asset.id),
    ).toEqual(['logo']);
  });

  it('preserves assets when runtime code computes a URL', () => {
    expect(
      selectProjectAssets(project(), { 'units/Image.ts': 'Image1.src = getPhotoUrl();' }),
    ).toHaveLength(2);
    expect(selectProjectAssets(project(), { 'units/File.ts': 'fetch(filePath);' })).toHaveLength(2);
  });

  it('keeps resources when an API row supplies image URLs', () => {
    const original = project();
    const page = original.pages[0]!;
    const bound = {
      ...original,
      pages: [
        {
          ...page,
          components: page.components.map((component) => ({
            ...component,
            props: {
              ...component.props,
              currentRowBindings: [{ property: 'src', fieldPath: '/photo' }],
            },
          })),
        },
      ],
    };
    expect(selectProjectAssets(bound, {})).toHaveLength(2);
  });

  it('selects component CSS while retaining shared defaults and used control states', () => {
    const label = selectComponentCss(new Set(['WebPage', 'WebLabel']));
    expect(label).toContain('.wr-component');
    expect(label).toContain('.wr-weblabel');
    expect(label).not.toMatch(
      /wr-webvideoplayer|wr-video-|wr-webdatagrid|wr-data-grid-|wr-webbutton/u,
    );
    const button = selectComponentCss(new Set(['WebPage', 'WebButton']));
    expect(button).toContain('.wr-webbutton:hover:not(:disabled)');
    expect(button).toContain('.wr-button-icon');
    expect(button).not.toContain('.wr-webedit');
    const edit = selectComponentCss(new Set(['WebEdit']));
    expect(edit).toContain('.wr-webedit:focus');
    expect(edit).not.toContain('.wr-webtextarea');
  });
});

it('keeps report image resources and conservatively retains external template resources', () => {
  const initial = project();
  const page = initial.pages[0]!;
  const withTemplate = {
    ...initial,
    pages: [
      {
        ...page,
        components: page.components.map((component) => ({
          ...component,
          props: {
            ...component.props,
            reportTemplate: {
              bands: [
                {
                  elements: [
                    { type: 'image', value: { kind: 'static', value: 'assets/imported/logo.png' } },
                  ],
                },
              ],
            },
          },
        })),
      },
    ],
  };
  expect(selectProjectAssets(withTemplate, {}).map((asset) => asset.id)).toEqual(['logo']);
  const withBoundImage = {
    ...initial,
    pages: [
      {
        ...page,
        components: page.components.map((component) => ({
          ...component,
          props: {
            ...component.props,
            reportTemplate: {
              bands: [
                { elements: [{ type: 'image', value: { kind: 'parameter', name: 'Image' } }] },
              ],
            },
          },
        })),
      },
    ],
  };
  expect(selectProjectAssets(withBoundImage, {})).toHaveLength(2);
  expect(
    selectProjectAssets(initial, {
      'pages/PageMain.ts': 'ReportBuilder1.LoadTemplate(templateUrl);',
    }),
  ).toHaveLength(2);
});

it('retains project image assets referenced only by an external template loaded from a literal URL', () => {
  expect(
    selectProjectAssets(project(), {
      'pages/PageMain.ts':
        "await ReportBuilder1.LoadTemplate('https://reports.example.test/template.json');",
    }),
  ).toHaveLength(2);
});
