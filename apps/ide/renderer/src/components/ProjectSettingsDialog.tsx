import type { ProjectSettings } from '@webrad/project-model';
import type { WebRadIconName } from '@webrad/runtime/icons';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from './Icon';

interface ProjectSettingsDialogProps {
  readonly projectName: string;
  readonly settings: ProjectSettings;
  readonly onClose: () => void;
  readonly onSave: (settings: ProjectSettings) => void;
}

type ProjectSettingsSectionId =
  | 'general'
  | 'environment'
  | 'icons'
  | 'domain'
  | 'build'
  | 'pwa'
  | 'authentication'
  | 'cors'
  | 'headers'
  | 'integrations'
  | 'observability';

interface ProjectSettingsSection {
  readonly id: ProjectSettingsSectionId;
  readonly group: 'Projeto' | 'Segurança' | 'Plataforma';
  readonly label: string;
  readonly icon: WebRadIconName;
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
}

const SETTINGS_SECTIONS = [
  {
    id: 'general',
    group: 'Projeto',
    label: 'Geral',
    icon: 'settings',
    title: 'Configurações gerais',
    description: 'Identidade, comportamento padrão e preferências do projeto web.',
    items: [
      'Nome e descrição da aplicação',
      'Idioma, fuso horário e região',
      'Configurações do Designer',
    ],
  },
  {
    id: 'environment',
    group: 'Projeto',
    label: 'Variáveis de ambiente',
    icon: 'terminal',
    title: 'Variáveis de ambiente',
    description: 'Valores separados por ambiente para desenvolvimento, homologação e produção.',
    items: [
      'Chaves públicas e URLs de serviços',
      'Ambientes de desenvolvimento e produção',
      'Referências a segredos sem expô-los no cliente',
    ],
  },
  {
    id: 'icons',
    group: 'Projeto',
    label: 'Ícones',
    icon: 'image',
    title: 'Ícones da aplicação',
    description: 'Recursos visuais usados pelo navegador, atalhos e instalação da aplicação.',
    items: [
      'Favicon e ícones de aba',
      'Ícones para atalhos e dispositivos',
      'Variações clara, escura e adaptável',
    ],
  },
  {
    id: 'domain',
    group: 'Projeto',
    label: 'Domínio e URLs',
    icon: 'globe',
    title: 'Domínio e URLs',
    description: 'Endereços públicos, URL base e rotas usadas fora da navegação interna.',
    items: [
      'Domínio principal e domínios alternativos',
      'URL base da aplicação',
      'Redirecionamentos e URLs canônicas',
    ],
  },
  {
    id: 'authentication',
    group: 'Segurança',
    label: 'Autenticação e JWT',
    icon: 'key-round',
    title: 'Autenticação e JWT',
    description: 'Políticas de sessão e integração com provedores de identidade.',
    items: [
      'Provedor de autenticação',
      'Expiração, renovação e armazenamento de sessão',
      'Emissor, audiência e permissões de JWT',
    ],
  },
  {
    id: 'cors',
    group: 'Segurança',
    label: 'CORS e origens',
    icon: 'shield-check',
    title: 'CORS e origens confiáveis',
    description: 'Origens permitidas para chamadas entre a aplicação e serviços web.',
    items: [
      'Origens por ambiente',
      'Métodos e cabeçalhos permitidos',
      'Cookies e credenciais entre origens',
    ],
  },
  {
    id: 'headers',
    group: 'Segurança',
    label: 'Headers e CSP',
    icon: 'shield',
    title: 'Headers e Content Security Policy',
    description: 'Diretrizes para reduzir superfícies de ataque no navegador.',
    items: [
      'Content Security Policy',
      'Headers de segurança e HTTPS',
      'Permissões de recursos do navegador',
    ],
  },
  {
    id: 'build',
    group: 'Plataforma',
    label: 'Build e publicação',
    icon: 'upload-cloud',
    title: 'Build e publicação',
    description: 'Opções para a saída do navegador e a entrega da aplicação.',
    items: [
      'Diretório de saída e perfil de build',
      'Ambiente de publicação',
      'Cache de arquivos estáticos',
    ],
  },
  {
    id: 'pwa',
    group: 'Plataforma',
    label: 'PWA e metadados',
    icon: 'smartphone',
    title: 'PWA e metadados',
    description: 'Informações de instalação, compartilhamento e apresentação no navegador.',
    items: [
      'Manifesto e tela inicial',
      'Tema, cores e ícones instaláveis',
      'Título, descrição e metadados sociais',
    ],
  },
  {
    id: 'integrations',
    group: 'Plataforma',
    label: 'APIs e integrações',
    icon: 'link',
    title: 'APIs e integrações',
    description: 'Configurações compartilhadas para serviços externos e webhooks.',
    items: [
      'Endpoints e gateways',
      'Webhooks e chaves de integração',
      'Políticas de timeout e repetições',
    ],
  },
  {
    id: 'observability',
    group: 'Plataforma',
    label: 'Logs e monitoramento',
    icon: 'chart-line',
    title: 'Logs e monitoramento',
    description: 'Observabilidade para identificar erros e acompanhar o uso da aplicação.',
    items: [
      'Nível e destino dos logs',
      'Monitoramento de erros',
      'Métricas de desempenho e disponibilidade',
    ],
  },
] as const satisfies readonly ProjectSettingsSection[];

const SETTINGS_GROUPS = ['Projeto', 'Segurança', 'Plataforma'] as const;

const LOCALE_OPTIONS = [
  ['pt-BR', 'Português (Brasil)'],
  ['en-US', 'English (United States)'],
  ['es-ES', 'Español (España)'],
] as const;

const TIME_ZONE_OPTIONS = [
  ['America/Sao_Paulo', 'São Paulo (GMT-03:00)'],
  ['America/New_York', 'New York (GMT-05:00)'],
  ['Europe/Lisbon', 'Lisbon (GMT±00:00)'],
  ['Europe/London', 'London (GMT±00:00)'],
  ['Europe/Madrid', 'Madrid (GMT+01:00)'],
  ['UTC', 'UTC (GMT±00:00)'],
] as const;

const GRID_SIZE_OPTIONS = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

function includesOption(options: readonly (readonly [string, string])[], value: string): boolean {
  return options.some(([optionValue]) => optionValue === value);
}

function settingsChanged(left: ProjectSettings, right: ProjectSettings): boolean {
  return (
    left.applicationName !== right.applicationName ||
    left.applicationDescription !== right.applicationDescription ||
    left.locale !== right.locale ||
    left.timeZone !== right.timeZone ||
    left.gridSize !== right.gridSize ||
    left.snapToGrid !== right.snapToGrid ||
    left.showGrid !== right.showGrid
  );
}

export function ProjectSettingsDialog({
  projectName,
  settings,
  onClose,
  onSave,
}: ProjectSettingsDialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [activeSectionId, setActiveSectionId] = useState<ProjectSettingsSectionId>('general');
  const [draft, setDraft] = useState<ProjectSettings>(settings);
  const [saveError, setSaveError] = useState<string | null>(null);
  const activeSection =
    SETTINGS_SECTIONS.find((section) => section.id === activeSectionId) ?? SETTINGS_SECTIONS[0];
  const isGeneralSection = activeSection.id === 'general';
  const hasChanges = settingsChanged(settings, draft);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"]')?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const updateDraft = (patch: Partial<ProjectSettings>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaveError(null);
  };

  const save = (): void => {
    const applicationName = draft.applicationName.trim();
    if (applicationName.length === 0) {
      setSaveError('Informe o nome da aplicação.');
      return;
    }
    onSave({
      ...draft,
      applicationName,
      applicationDescription: draft.applicationDescription.trim(),
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-project-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Projeto / Configurações</span>
            <h2 id={titleId}>Configurações de {projectName}</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Fechar configurações do projeto"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="wr-project-settings-content">
          <p id={descriptionId} className="wr-modal-description">
            As opções em Geral são salvas no projeto e aplicadas à saída gerada. As demais áreas
            continuam disponíveis para planejamento.
          </p>
          <div className="wr-project-settings-layout">
            <nav
              className="wr-project-settings-nav"
              role="tablist"
              aria-label="Seções de configurações do projeto"
            >
              {SETTINGS_GROUPS.map((group) => (
                <div className="wr-project-settings-nav-group" key={group}>
                  <span>{group}</span>
                  {SETTINGS_SECTIONS.filter((section) => section.group === group).map((section) => (
                    <button
                      key={section.id}
                      id={`project-settings-tab-${section.id}`}
                      type="button"
                      role="tab"
                      aria-selected={activeSection.id === section.id}
                      aria-controls={`project-settings-panel-${section.id}`}
                      className={activeSection.id === section.id ? 'active' : ''}
                      onClick={() => setActiveSectionId(section.id)}
                    >
                      <Icon name={section.icon} />
                      <span>{section.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <section
              id={`project-settings-panel-${activeSection.id}`}
              className="wr-project-settings-panel"
              role="tabpanel"
              aria-labelledby={`project-settings-tab-${activeSection.id}`}
            >
              <div className="wr-project-settings-panel-heading">
                <Icon name={activeSection.icon} />
                <div>
                  <span>
                    {isGeneralSection ? 'Aplicado ao projeto' : 'Planejamento de configuração'}
                  </span>
                  <h3>{activeSection.title}</h3>
                </div>
              </div>
              {isGeneralSection ? (
                <>
                  <p>{activeSection.description}</p>
                  <div className="wr-project-settings-fields">
                    <label className="wr-project-settings-field full-width">
                      <span>Nome da aplicação</span>
                      <input
                        type="text"
                        value={draft.applicationName}
                        maxLength={120}
                        aria-invalid={saveError !== null}
                        aria-describedby={saveError === null ? undefined : `${descriptionId}-error`}
                        onChange={(event) =>
                          updateDraft({ applicationName: event.currentTarget.value })
                        }
                      />
                      <small>Usado no título da aba e nos metadados da aplicação gerada.</small>
                    </label>
                    <label className="wr-project-settings-field full-width">
                      <span>Descrição</span>
                      <textarea
                        value={draft.applicationDescription}
                        rows={3}
                        maxLength={500}
                        onChange={(event) =>
                          updateDraft({ applicationDescription: event.currentTarget.value })
                        }
                      />
                      <small>Opcional. Publicada como a descrição da página.</small>
                    </label>
                    <label className="wr-project-settings-field">
                      <span>Idioma e região</span>
                      <select
                        value={draft.locale}
                        onChange={(event) => updateDraft({ locale: event.currentTarget.value })}
                      >
                        {!includesOption(LOCALE_OPTIONS, draft.locale) && (
                          <option value={draft.locale}>{draft.locale}</option>
                        )}
                        {LOCALE_OPTIONS.map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <small>Define o atributo de idioma do documento HTML.</small>
                    </label>
                    <label className="wr-project-settings-field">
                      <span>Fuso horário padrão</span>
                      <select
                        value={draft.timeZone}
                        onChange={(event) => updateDraft({ timeZone: event.currentTarget.value })}
                      >
                        {!includesOption(TIME_ZONE_OPTIONS, draft.timeZone) && (
                          <option value={draft.timeZone}>{draft.timeZone}</option>
                        )}
                        {TIME_ZONE_OPTIONS.map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <small>
                        Disponibilizado na aplicação gerada como preferência do projeto.
                      </small>
                    </label>
                  </div>
                  <fieldset className="wr-project-settings-designer-options">
                    <legend>Designer</legend>
                    <p>Preferências usadas ao posicionar e editar componentes neste projeto.</p>
                    <div className="wr-project-settings-toggles">
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.showGrid}
                          onChange={(event) =>
                            updateDraft({ showGrid: event.currentTarget.checked })
                          }
                        />
                        <span>Mostrar grade no Designer</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.snapToGrid}
                          onChange={(event) =>
                            updateDraft({ snapToGrid: event.currentTarget.checked })
                          }
                        />
                        <span>Ajustar componentes à grade</span>
                      </label>
                    </div>
                    <label className="wr-project-settings-field grid-size">
                      <span>Tamanho da grade</span>
                      <select
                        value={String(draft.gridSize)}
                        onChange={(event) =>
                          updateDraft({ gridSize: Number(event.currentTarget.value) })
                        }
                      >
                        {!GRID_SIZE_OPTIONS.includes(
                          draft.gridSize as (typeof GRID_SIZE_OPTIONS)[number],
                        ) && <option value={draft.gridSize}>{draft.gridSize} px</option>}
                        {GRID_SIZE_OPTIONS.map((size) => (
                          <option value={size} key={size}>
                            {size} px
                          </option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                  {saveError !== null && (
                    <div
                      className="wr-project-settings-error"
                      id={`${descriptionId}-error`}
                      role="alert"
                    >
                      {saveError}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>{activeSection.description}</p>
                  <h4>Opções previstas</h4>
                  <ul>
                    {activeSection.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="wr-project-settings-note" role="note">
                    A estrutura de dados e os controles de edição serão adicionados quando essas
                    configurações forem implementadas.
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
        <footer className="wr-modal-actions wr-project-settings-actions">
          {isGeneralSection ? (
            <>
              <button type="button" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="primary" disabled={!hasChanges} onClick={save}>
                Salvar alterações
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={onClose}>
              Fechar
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
