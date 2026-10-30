import { RestGoError } from '@webrad/restgo-sdk';

/** English literals are the typed source keys; Portuguese covers the complete editor. */
const portuguese = {
  'Your account': 'Sua conta',
  'Close user settings': 'Fechar configurações da conta',
  'Account settings': 'Configurações da conta',
  'Loading your account…': 'Carregando sua conta…',
  'Saving…': 'Salvando…',
  'Your session is active, but this account action is not available on the server. Please contact support.':
    'Sua sessão está ativa, mas esta ação da conta não está disponível no servidor. Entre em contato com o suporte.',
  'The request failed. Please try again.':
    'Não foi possível concluir a solicitação. Tente novamente.',
  Profile: 'Perfil',
  Security: 'Segurança',
  'Profile photo': 'Foto do perfil',
  'Upload profile photo': 'Enviar foto do perfil',
  'Choose photo': 'Escolher foto',
  'Remove photo': 'Remover foto',
  'Profile photo removed.': 'Foto do perfil removida.',
  'Save photo': 'Salvar foto',
  'Profile photo updated.': 'Foto do perfil atualizada.',
  'Cancel photo': 'Cancelar foto',
  'Photo selection discarded.': 'Seleção de foto descartada.',
  'Full name': 'Nome completo',
  'Email address': 'Endereço de e-mail',
  'Current password to change email': 'Senha atual para alterar o e-mail',
  'Resend confirmation email': 'Reenviar e-mail de confirmação',
  'Confirmation email requested. Check your inbox.':
    'E-mail de confirmação solicitado. Confira sua caixa de entrada.',
  'Save profile': 'Salvar perfil',
  'Current password': 'Senha atual',
  'New password': 'Nova senha',
  'Confirm new password': 'Confirmar nova senha',
  'Update password': 'Atualizar senha',
  'Password reset requested. Check your inbox.':
    'Recuperação de senha solicitada. Confira sua caixa de entrada.',
  'Sign out': 'Sair da conta',
  'You have been signed out.': 'Sua sessão foi encerrada.',
  Verified: 'Verificado',
  Account: 'Conta',
  Active: 'Ativa',
  Inactive: 'Inativa',
  'User ID': 'ID do usuário',
  'Choose a JPEG, PNG or WebP image up to 10 MB.':
    'Escolha uma imagem JPEG, PNG ou WebP de até 10 MB.',
  'Full name is too long. Shorten it and try again.':
    'O nome completo é muito longo. Reduza-o e tente novamente.',
  'Account updated. Sign in again with your updated email.':
    'Conta atualizada. Entre novamente com seu novo e-mail.',
  'Your profile has been saved.': 'Seu perfil foi salvo.',
  'Passwords do not match.': 'As senhas não coincidem.',
  'Password updated. Sign in again with your new password.':
    'Senha atualizada. Entre novamente com sua nova senha.',
  'Please fill out this field.': 'Preencha este campo.',
  'Please enter a valid email address.': 'Informe um endereço de e-mail válido.',
  'Use at least 6 characters.': 'Use pelo menos 6 caracteres.',
  'This value is too long.': 'Este valor é muito longo.',
  'Check this field and try again.': 'Confira este campo e tente novamente.',
  'Current password is incorrect.': 'A senha atual está incorreta.',
  'This email is already registered.': 'Este e-mail já está cadastrado.',
  'Your account changed. Close and reopen settings before saving.':
    'Sua conta foi alterada. Feche e reabra as configurações antes de salvar.',
  'Too many requests. Please wait and try again.':
    'Muitas solicitações. Aguarde e tente novamente.',
  'The account service is temporarily unavailable. Please try again later.':
    'O serviço de contas está temporariamente indisponível. Tente novamente mais tarde.',
  'Could not connect to the account service. Check your connection and try again.':
    'Não foi possível conectar ao serviço de contas. Confira sua conexão e tente novamente.',
  'Check your account details and try again.': 'Confira os dados da conta e tente novamente.',
  'Please sign in again.': 'Entre na sua conta novamente.',
  'The request was cancelled.': 'A solicitação foi cancelada.',
  'JPEG, PNG or WebP · 10 MB max.': 'JPEG, PNG ou WebP · até 10 MB.',
  'Changing your email signs you out on all devices.':
    'Alterar o e-mail encerra suas sessões em todos os dispositivos.',
  'Changing your password signs you out on all devices.':
    'Alterar a senha encerra suas sessões em todos os dispositivos.',
  'Account details': 'Detalhes da conta',
  'Reset password by email': 'Recuperar senha por e-mail',
  Close: 'Fechar',
  Unverified: 'Não verificado',
  'Photo ready to save.': 'Foto pronta para salvar.',
} as const;

export type WebMenuUserSettingsText = keyof typeof portuguese;

export function webMenuUserSettingsText(language: 'en' | 'pt-BR' = 'en') {
  return (text: WebMenuUserSettingsText): string =>
    language === 'pt-BR' ? portuguese[text] : text;
}

export function webMenuUserSettingsError(error: unknown, language: 'en' | 'pt-BR' = 'en'): string {
  const t = webMenuUserSettingsText(language);
  if (error instanceof RestGoError) {
    if (
      error.status === 404 ||
      error.status === 405 ||
      (error.status === 403 &&
        error.message.toLowerCase().includes('administrator permission required'))
    )
      return t(
        'Your session is active, but this account action is not available on the server. Please contact support.',
      );
    if (error.message.toLowerCase().includes('current password is incorrect'))
      return t('Current password is incorrect.');
    if (error.message.toLowerCase().includes('email already registered'))
      return t('This email is already registered.');
    if (error.status === 409)
      return t('Your account changed. Close and reopen settings before saving.');
    if (error.status === 429) return t('Too many requests. Please wait and try again.');
    if (error.status >= 500)
      return t('The account service is temporarily unavailable. Please try again later.');
    if (error.code === 'NETWORK_ERROR')
      return t('Could not connect to the account service. Check your connection and try again.');
    if (error.code === 'ABORTED') return t('The request was cancelled.');
    if (error.status === 401 || error.code === 'AUTH_REQUIRED') return t('Please sign in again.');
    if (error.status === 400) return t('Check your account details and try again.');
  }
  return language === 'en' && error instanceof Error
    ? error.message
    : t('The request failed. Please try again.');
}
