import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  bindComponentEvent,
  createProject,
  updatePage,
  updateProjectSettings,
} from '@webrad/project-model';

export function fileUploadProject() {
  let project = createProject('RestGoFileUpload');
  let page = project.pages[0];
  if (page === undefined) throw new Error('Missing upload fixture page.');
  for (const component of [
    defaultComponentRegistry.createComponent('WebFileUpload', {
      id: 'file-upload',
      name: 'FileUpload1',
      parentId: page.rootComponentId,
      props: {
        accept: '.txt,image/*',
        isPublic: false,
      },
    }),
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'select-file',
      name: 'SelectFile',
      parentId: page.rootComponentId,
      y: 100,
      props: { caption: 'Selecionar pelo código' },
    }),
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'send-file',
      name: 'SendFile',
      parentId: page.rootComponentId,
      y: 150,
      props: { caption: 'Enviar pelo código' },
    }),
  ]) {
    page = addComponent(page, component, page.rootComponentId);
  }
  page = bindComponentEvent(page, 'select-file', 'OnClick', 'chooseFile');
  page = bindComponentEvent(page, 'send-file', 'OnClick', 'sendFile');
  page = bindComponentEvent(page, 'file-upload', 'OnChange', 'fileChanged');
  page = bindComponentEvent(page, 'file-upload', 'OnSuccess', 'fileSent');
  page = bindComponentEvent(page, 'file-upload', 'OnError', 'fileFailed');
  page = bindComponentEvent(page, 'file-upload', 'OnComplete', 'uploadCompleted');
  page = bindComponentEvent(page, 'file-upload', 'OnProgress', 'uploadProgress');
  project = updatePage(project, page.id, { components: page.components });
  return updateProjectSettings(project, {
    restGo: {
      enabled: true,
      baseUrl: 'https://restgo.example.test',
      apiToken: 'rgo.upload-fixture-token',
      apiVersion: 2,
      defaultDatabase: 'clientes',
      persistSession: false,
      sessionStorage: 'memory',
      storageKey: 'file-upload-fixture',
    },
  });
}

export function fileUploadMethods(): string {
  return `
  public async chooseFile(): Promise<void> {
    const file = await FileUpload1.OpenFile();
    this.element.dataset.selectedName = file?.name ?? '';
    this.element.dataset.selection = JSON.stringify(file);
  }
  public async sendFile(): Promise<void> {
    try {
      if (RestGO.CurrentUser === null) {
        const login = await RestGO.login('upload@example.test', 'upload-fixture-password');
        if (!login.sucess) throw login.error;
      }
      const result = await this.FileUpload1.SendToRestGO({ isPublic: this.FileUpload1.isPublic });
      this.element.dataset.uploadResult = JSON.stringify(result);
      this.element.dataset.uploadId = result.id;
      this.element.dataset.uploadUrl = result.url;
      this.element.dataset.uploadPublic = String(result.isPublic);
    } catch (error) {
      this.element.dataset.uploadRejected = error instanceof Error ? error.message : String(error);
    }
  }
  public fileChanged(): void {
    this.element.dataset.changeName = FileUpload1.fileName;
    this.element.dataset.changeCount = String(Number(this.element.dataset.changeCount ?? '0') + 1);
  }
  public fileSent(): void {
    this.element.dataset.successId = this.FileUpload1.result?.id ?? '';
  }
  public fileFailed(): void {
    this.element.dataset.errorMessage = FileUpload1.lastError?.message ?? '';
  }
  public uploadCompleted(): void {
    this.element.dataset.completed = String(!this.FileUpload1.uploading);
  }
  public uploadProgress(_sender: WebFileUpload, event: CustomEvent<WebFileUploadProgressEventDetail>): void {
    this.element.dataset.progress = String(event.detail.percentage);
    this.element.dataset.progressEvents = JSON.stringify([
      ...JSON.parse(this.element.dataset.progressEvents ?? '[]'), event.detail
    ]);
  }
`;
}

export function fileUploadUserSources(pageName: string): Readonly<Record<string, string>> {
  return {
    [`pages/${pageName}.ts`]: `import type { WebFileUpload, WebFileUploadProgressEventDetail } from '@webrad/runtime';
import { ${pageName}Generated } from './${pageName}.generated';
export class ${pageName} extends ${pageName}Generated {${fileUploadMethods()}}
`,
  };
}
