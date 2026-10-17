# Segurança

## Relatar uma vulnerabilidade

Não publique credenciais, dados pessoais, arquivos de clientes ou detalhes de
exploração em uma issue pública.

Use a opção **Report a vulnerability** na
[área de segurança do repositório](https://github.com/Atentor/WebRad/security/advisories/new)
quando o relato privado estiver habilitado. Se essa opção estiver indisponível,
abra uma issue pedindo um canal privado, sem incluir os detalhes da falha.

Inclua no relato privado a versão ou commit, o sistema operacional, uma
reprodução mínima com dados fictícios e o impacto observado. Credenciais que
tenham sido expostas devem ser revogadas ou rotacionadas no serviço de origem.

## Atualizações

As correções são desenvolvidas na branch `main`. Versões anteriores não têm
manutenção de segurança garantida; use a versão mais recente disponível.

O renderer do Electron deve manter `nodeIntegration: false`,
`contextIsolation: true` e `sandbox: true`. Acesso nativo passa por preload
tipado e validação de IPC no processo principal.

Valores salvos em projetos, variáveis `Env` e tokens de aplicação exportados
podem aparecer no JavaScript do navegador. Credenciais administrativas e
segredos de servidor não devem fazer parte de projetos ou aplicações geradas.
