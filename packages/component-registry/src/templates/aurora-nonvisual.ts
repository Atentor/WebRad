import {
  createDefaultApiClientConfiguration,
  defaultIdFactory,
  type ApiClientResponseSchema,
  type ApiClientSchemaNode,
} from '@webrad/project-model';
import {
  createDefaultReportTemplate,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';
import { button, panel, paragraph, row, status, text, type DemoNode } from './demo-layout.js';

function field(
  name: string,
  path: string,
  fieldType: 'string' | 'integer',
  nullable = false,
): ApiClientSchemaNode {
  return { id: defaultIdFactory(), name, path, kind: 'field', fieldType, nullable, children: [] };
}

function response(children: readonly ApiClientSchemaNode[]): ApiClientResponseSchema {
  return {
    version: 1,
    root: {
      id: defaultIdFactory(),
      name: 'Response',
      path: '',
      kind: 'object',
      fieldType: 'object',
      nullable: false,
      children,
    },
  };
}

function edit(name: string, value: string, inputType = 'text'): DemoNode {
  return { type: 'WebEdit', name, height: 40, props: { value, inputType } };
}

function disabledAction(
  name: string,
  caption: string,
  handler: string,
  icon: 'arrow-left' | 'arrow-right',
): DemoNode {
  const action = button(name, caption, handler, icon);
  return { ...action, props: { ...action.props, enabled: false } };
}

export function pokemonControls(): readonly DemoNode[] {
  const configuration = createDefaultApiClientConfiguration();
  const operation = configuration.operations[0];
  if (!operation) throw new Error('Default API request is missing.');
  return [
    text('PokemonHeading', 'API CLIENT / POKEAPI', 32),
    paragraph(
      'PokemonIntro',
      'Load live Pokemon from pokeapi.co. Browse twelve results per page or search by name or ID. Internet access is required; successful responses are cached for this page session.',
    ),
    row('PokemonActions', [
      button('LoadPokemonButton', 'Load Pokemon', 'LoadPokemon', 'refresh'),
      disabledAction('PreviousPokemon', 'Previous page', 'PreviousPage', 'arrow-left'),
      disabledAction('NextPokemon', 'Next page', 'NextPage', 'arrow-right'),
    ]),
    status(
      'PokemonStatus',
      'Choose Load Pokemon to request the public API. No key or account is required.',
    ),
    panel('PokemonBrowser', [
      text('PokemonListHeading', 'SELECT A POKEMON', 28),
      {
        type: 'WebListBox',
        name: 'PokemonList',
        height: 240,
        props: { items: [], selectedIndex: -1 },
        events: { OnChange: 'SelectPokemon' },
      },
      text('PokemonSearchLabel', 'Name or ID', 26),
      edit('PokemonSearch', 'pikachu', 'search'),
      button('SearchPokemonButton', 'Find Pokemon', 'FindPokemon', 'search'),
      status('PokemonDetails', 'Select a Pokemon or search for one to see its details.', 120),
    ]),
    {
      type: 'WebApiClient',
      name: 'PokeApi',
      props: {
        baseUrl: 'https://pokeapi.co/api/v2/',
        apiClientConfig: {
          ...configuration,
          connection: 'custom',
          operations: [
            {
              ...operation,
              id: defaultIdFactory(),
              name: 'ListPokemon',
              path: 'pokemon/',
              query: [
                { id: defaultIdFactory(), name: 'limit', value: '12', enabled: true },
                { id: defaultIdFactory(), name: 'offset', value: '0', enabled: true },
              ],
              responseSchema: response([
                field('count', '/count', 'integer'),
                field('next', '/next', 'string', true),
                field('previous', '/previous', 'string', true),
                {
                  id: defaultIdFactory(),
                  name: 'results',
                  path: '/results',
                  kind: 'list',
                  fieldType: 'list',
                  nullable: false,
                  children: [
                    field('name', '/results/*/name', 'string'),
                    field('url', '/results/*/url', 'string'),
                  ],
                },
              ]),
            },
            {
              ...operation,
              id: defaultIdFactory(),
              name: 'GetPokemon',
              path: 'pokemon/pikachu/',
              responseSchema: response([
                field('id', '/id', 'integer'),
                field('name', '/name', 'string'),
                field('height', '/height', 'integer'),
                field('weight', '/weight', 'integer'),
                field('base_experience', '/base_experience', 'integer', true),
              ]),
            },
          ],
        },
      },
    },
  ];
}

export function timerControls(): readonly DemoNode[] {
  return [
    text('TimerHeading', 'TIMER / EVENTS AND LIFECYCLE', 32),
    paragraph(
      'TimerIntro',
      'A nonvisual Timer updates the counter and ring. Change the interval or disable Loop for a single tick. Leaving this page stops the timer.',
    ),
    panel('TimerSettings', [
      text('IntervalLabel', 'Interval in milliseconds', 26),
      edit('TimerInterval', '1000', 'number'),
      {
        type: 'WebCheckBox',
        name: 'TimerLoop',
        height: 36,
        props: { caption: 'Repeat automatically', checked: true },
      },
      row('TimerActions', [
        button('ApplyTimerButton', 'Apply settings', 'ApplyTimer', 'check'),
        button('StartTimerButton', 'Start', 'StartTimer', 'play'),
        button('StopTimerButton', 'Stop', 'StopTimer', 'stop'),
        button('RestartTimerButton', 'Restart', 'RestartTimer', 'refresh'),
      ]),
      {
        type: 'WebProgressBar',
        name: 'TimerProgress',
        width: 96,
        height: 96,
        item: { width: 'fixed', alignSelf: 'center' },
        props: { format: 'dunnet', value: 0 },
      },
      status('TimerStatus', 'Stopped. Choose Start to observe OnStart, OnTimer and OnStop.'),
    ]),
    {
      type: 'WebTimer',
      name: 'DemoTimer',
      props: { time: 1000, loop: true, enabled: false },
      events: { OnTimer: 'TimerTick', OnStart: 'TimerStarted', OnStop: 'TimerStopped' },
    },
  ];
}

export function fileControls(): readonly DemoNode[] {
  return [
    text('FilesHeading', 'FILE UPLOAD / VIDEO UPLOAD', 32),
    paragraph(
      'FilesIntro',
      'Selection runs locally. Sending is a separate action that uploads the selected file to your own RestGO server. Enable RestGO integration and configure its Connection before signing in below.',
    ),
    panel('UploadLogin', [
      text('UploadEmailLabel', 'RestGO account email', 26),
      edit('UploadEmail', '', 'email'),
      text('UploadPasswordLabel', 'Password', 26),
      edit('UploadPassword', '', 'password'),
      button('UploadLoginButton', 'Sign in to RestGO', 'SignInUploads', 'user'),
      status(
        'UploadAuthStatus',
        'No credentials are bundled with this example. Select files without signing in; sign in only to send them.',
      ),
    ]),
    panel('FileExample', [
      text('FileExampleHeading', 'FILE UPLOAD', 28),
      row('FileActions', [
        button('ChooseFileButton', 'Select file', 'ChooseFile', 'upload'),
        button('SendFileButton', 'Send file to RestGO', 'SendFile', 'upload'),
        button('ClearFileButton', 'Clear selection', 'ClearFile', 'close'),
      ]),
      { type: 'WebProgressBar', name: 'FileProgress', height: 28, props: { value: 0 } },
      status('FileStatus', 'No file selected. Files are private by default.', 100),
    ]),
    panel('VideoUploadExample', [
      text('VideoUploadHeading', 'VIDEO UPLOAD', 28),
      paragraph(
        'VideoUploadIntro',
        'Select a video up to 50 MB and 60 seconds. Uploads can be paused, resumed or cancelled. Upload completion confirms the original file; server conversion can continue afterwards.',
      ),
      row('VideoUploadActions', [
        button('ChooseUploadVideo', 'Select video', 'ChooseVideo', 'video'),
        button('SendUploadVideo', 'Send video to RestGO', 'SendVideo', 'upload'),
        button('PauseUploadVideo', 'Pause upload', 'PauseVideo', 'stop'),
        button('ResumeUploadVideo', 'Resume upload', 'ResumeVideo', 'play'),
        button('CancelUploadVideo', 'Cancel upload', 'CancelVideo', 'close'),
      ]),
      {
        type: 'WebProgressBar',
        name: 'VideoUploadProgress',
        width: 88,
        height: 88,
        item: { width: 'fixed', alignSelf: 'center' },
        props: { value: 0, format: 'circus' },
      },
      status('VideoUploadStatus', 'No video selected. Videos are private by default.', 100),
    ]),
    {
      type: 'WebFileUpload',
      name: 'FileService',
      props: { accept: '*/*', isPublic: false },
      events: { OnProgress: 'FileProgressChanged' },
    },
    {
      type: 'WebVideoUpload',
      name: 'VideoService',
      props: { maxFileSizeMB: 50, maxDurationSeconds: 60, isPublic: false },
      events: { OnProgress: 'VideoProgressChanged', OnStateChange: 'VideoStateChanged' },
    },
  ];
}

function reportTemplate(): WebReportTemplate {
  const template = createDefaultReportTemplate();
  const textElement = (name: string, y: number, parameter: string) => ({
    id: defaultIdFactory(),
    name,
    type: 'text' as const,
    x: 0,
    y,
    width: 180,
    height: 20,
    value: { kind: 'parameter' as const, name: parameter },
    fontSize: 12,
    color: '#334155',
    bold: false,
    align: 'left' as const,
  });
  return {
    ...template,
    name: 'Aurora example report',
    parameters: [
      { name: 'Title', type: 'string', defaultValue: 'Aurora Workspace report' },
      { name: 'PreparedFor', type: 'string', defaultValue: 'Demo user' },
      { name: 'Notes', type: 'string', defaultValue: 'A real PDF generated in your browser.' },
    ],
    bands: template.bands.map((band) =>
      band.kind === 'title'
        ? {
            ...band,
            elements: [{ ...textElement('ReportTitle', 0, 'Title'), fontSize: 22, bold: true }],
          }
        : band.kind === 'detail'
          ? {
              ...band,
              height: 80,
              elements: [
                textElement('PreparedFor', 0, 'PreparedFor'),
                { ...textElement('ReportNotes', 24, 'Notes'), height: 52 },
              ],
            }
          : band,
    ),
  };
}

export function reportControls(): readonly DemoNode[] {
  return [
    text('ReportsHeading', 'REPORT BUILDER / PDF GENERATION', 32),
    paragraph(
      'ReportsIntro',
      'Edit the report parameters, then preview or download a real PDF. Generation runs in the browser without a server. Open the Report Builder component in the Designer to edit the saved report layout.',
    ),
    panel('ReportParameters', [
      text('ReportTitleLabel', 'Report title', 26),
      edit('ReportTitle', 'Aurora Workspace report'),
      text('PreparedForLabel', 'Prepared for', 26),
      edit('PreparedFor', 'Demo user'),
      text('ReportNotesLabel', 'Notes', 26),
      {
        type: 'WebTextArea',
        name: 'ReportNotes',
        height: 112,
        props: { value: 'A real PDF generated in your browser.', rows: 4 },
      },
      row('ReportActions', [
        button('PreviewReportButton', 'Preview PDF', 'PreviewReport', 'file'),
        button('DownloadReportButton', 'Download PDF', 'DownloadReport', 'download'),
        button('CloseReportButton', 'Close preview', 'CloseReport', 'close'),
      ]),
      status('ReportStatus', 'Ready to generate a PDF with the values above.'),
    ]),
    {
      type: 'WebReportBuilder',
      name: 'DemoReport',
      props: {
        reportTemplate: reportTemplate(),
        previewMode: 'modal',
        fileName: 'aurora-report.pdf',
      },
    },
  ];
}
