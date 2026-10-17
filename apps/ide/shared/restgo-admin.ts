/** Design-time RestGo administration. These credentials never belong to a project or runtime. */
export type RestGoAdminHttpMethod =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface RestGoAdminTarget {
  readonly baseUrl: string;
}

export interface RestGoAdminStatus {
  readonly baseUrl: string;
  readonly connected: boolean;
  readonly storage: 'encrypted' | 'session' | 'none';
  readonly encryptionAvailable: boolean;
}

export interface RestGoAdminConnectRequest extends RestGoAdminTarget {
  readonly token: string;
  readonly remember: boolean;
}

export interface RestGoAdminEndpointInput {
  readonly slug: string;
  readonly script: string;
  readonly metodo: RestGoAdminHttpMethod;
  readonly versao: number;
  readonly tipo: 'normal' | 'operation';
  readonly idoperacao: number | null;
}

export interface RestGoAdminEndpoint extends RestGoAdminEndpointInput {
  readonly id: number;
  readonly ativo: boolean;
}

export interface RestGoAdminDatabase {
  readonly id: number;
  readonly ativo: boolean;
  readonly slug: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly descri: string;
  readonly sslMode: string;
}

export interface RestGoAdminPublicationInput {
  readonly idbanco: number;
  readonly idendpoint: number;
  readonly requiresAuthentication: boolean;
  readonly isPublic: boolean;
}

/** RestGo groups publication listings by database, endpoint slug and version. */
export interface RestGoAdminPublication {
  readonly id: number;
  readonly ativo: boolean;
  readonly idbanco: number;
  readonly idendpoint: number | null;
  readonly requiresAuthentication: boolean;
  readonly isPublic: boolean;
  readonly bancoSlug: string;
  readonly endpointSlug: string;
  readonly versao: number;
}

export type RestGoAdminJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly RestGoAdminJsonValue[]
  | { readonly [key: string]: RestGoAdminJsonValue };

export interface RestGoAdminOperationParameter {
  readonly nome: string;
  readonly tipo?: 'string' | 'numeric' | 'data' | 'boolean' | '';
  readonly valorTeste?: RestGoAdminJsonValue;
}

export interface RestGoAdminOperation {
  readonly id: number;
  readonly ativo: boolean;
  readonly nome: string;
  readonly parametrosEntrada: readonly RestGoAdminOperationParameter[];
}

export interface RestGoAdminCatalog {
  readonly endpoints: readonly RestGoAdminEndpoint[];
  readonly bancos: readonly RestGoAdminDatabase[];
  readonly publications: readonly RestGoAdminPublication[];
  readonly operations: readonly RestGoAdminOperation[];
}

export interface RestGoAdminRecordRequest extends RestGoAdminTarget {
  readonly id: number;
}

export interface RestGoAdminStateRequest extends RestGoAdminRecordRequest {
  readonly active: boolean;
}

export interface RestGoAdminSaveEndpointRequest extends RestGoAdminTarget {
  readonly id?: number;
  readonly endpoint: RestGoAdminEndpointInput;
}

export interface RestGoAdminSavePublicationRequest extends RestGoAdminTarget {
  readonly id?: number;
  readonly publication: RestGoAdminPublicationInput;
}

export interface RestGoAdminBridge {
  status(request: RestGoAdminTarget): Promise<RestGoAdminStatus>;
  /** Verifies administrative permission before retaining the token. */
  connect(request: RestGoAdminConnectRequest): Promise<RestGoAdminStatus>;
  /** Removes both the current session token and any remembered credential for this instance. */
  disconnect(request: RestGoAdminTarget): Promise<void>;
  catalog(request: RestGoAdminTarget): Promise<RestGoAdminCatalog>;
  getEndpoint(request: RestGoAdminRecordRequest): Promise<RestGoAdminEndpoint>;
  saveEndpoint(request: RestGoAdminSaveEndpointRequest): Promise<RestGoAdminEndpoint>;
  setEndpointActive(request: RestGoAdminStateRequest): Promise<void>;
  savePublication(request: RestGoAdminSavePublicationRequest): Promise<RestGoAdminPublication>;
  setPublicationActive(request: RestGoAdminStateRequest): Promise<void>;
}
