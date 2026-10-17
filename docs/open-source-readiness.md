# Preparação para código aberto

Revisão de 17 de outubro de 2026. Preparação do código e das contribuições
públicas, sem alterar funcionalidades, versões ou releases.

## Limpeza realizada

- Licença MIT aprovada pelo mantenedor, aplicada à raiz, aos oito pacotes npm e
  aos metadados RPM. `private: true` foi preservado: impede publicação acidental
  no npm e não determina a visibilidade ou licença do código.
- O desktop inclui a licença WebRAD, o índice de avisos e os textos disponíveis
  das licenças das dependências de produção instaladas e do Electron.
  Aplicações exportadas incluem `assets/licenses/WebRAD-MIT.txt` e os avisos de
  PDF/vídeo quando usados. Não há mudança na licença do código do usuário.
- Oito capturas de `.tmp/` removidas do índice Git, preservando as cópias locais.
  São 654.680 bytes a menos na próxima árvore versionada; os arquivos continuam
  nos commits antigos. Não foi identificada necessidade de reescrever o histórico.
- `.gitignore` ampliado para temporários, artefatos, configurações, credenciais,
  certificados e bancos locais. Exemplos `.env.example` continuam permitidos com
  valores fictícios. Ignorar um arquivo não o remove do histórico.
- Guias de contribuição, segurança e atribuições de terceiros adicionados.
  README corrigido para instalação pelo lockfile e limite real de dois workers.
- GitHub Actions fixadas por SHA, checkout sem persistência de credenciais e
  permissões de leitura por padrão. Publicação conserva sua permissão específica
  de escrita. Não foi introduzido `pull_request_target`.
- Workflow de segurança com Gitleaks 8.30.1 validado por SHA-256, histórico
  completo e saída redigida, mais auditoria npm de produção. Dependabot semanal
  para npm e Actions, sem merge automático.

## Credenciais e histórico

Gitleaks 8.30.1 não encontrou segredos no histórico alcançável pelas referências
Git locais (`--all --full-history`) nem nos arquivos de fontes destinados ao
Git, incluindo as novas alterações e respeitando os arquivos ignorados. Há 196
commits alcançáveis; Gitleaks contabilizou 167 commits com alterações analisadas,
aproximadamente 33 MB. A inspeção dos nomes históricos não encontrou `.env`,
chaves privadas, certificados ou bancos locais versionados. As oito capturas
retiradas do índice foram revisadas visualmente, sem credenciais visíveis.

A leitura indiscriminada da pasta local gerou 24 candidatos pela regra genérica
de API key em bundles e perfis de navegador de `.vite/` e `out/`, ambos ignorados.
Eles não fazem parte da árvore de fontes revisada; o resultado dessa leitura não
é apresentado como uma varredura local inteira sem detecções.

O resultado limita-se aos padrões reconhecidos e às referências disponíveis no
checkout. Não audita Secrets do GitHub, releases antigas ou referências remotas
ausentes. Credenciais sem formato reconhecível e dados pessoais dependem de
revisão humana. Autores e e-mails continuam fazendo parte do histórico Git.

## Dependências

Atualizações aplicadas sem trocar linhas principais:

| Dependência                   | Antes  | Depois |
| ----------------------------- | ------ | ------ |
| Electron                      | 43.3.0 | 43.8.0 |
| Sharp e binários nativos      | 0.35.3 | 0.35.5 |
| DOMPurify, override existente | 3.4.13 | 3.4.17 |
| source-map-js, transitiva     | 1.2.1  | 1.2.2  |

`npm audit --omit=dev` passou de quatro entradas vulneráveis para **zero**.
Essa consulta não cobre a totalidade do desktop: Electron é uma dependência de
desenvolvimento para o npm, mas acompanha a IDE e foi atualizado separadamente.

A auditoria completa permanece com **47 entradas**: três críticas, 34 altas,
sete moderadas e três baixas. São pacotes afetados, incluindo propagação pelos
dependentes, não 47 vulnerabilidades independentes comprovadamente exploráveis.
As entradas críticas são `tar`, `tinypool` e `vitest`.

| Família                         | Linha atual | Correção indicada pelo npm |
| ------------------------------- | ----------- | -------------------------- |
| Electron Forge e makers/plugins | 7.11.2      | 8.0.1                      |
| Vite                            | 5.4.21      | 8.3.4                      |
| Vitest                          | 3.2.7       | 5.0.5                      |

Essas migrações exigem alterações próprias, com revisão de APIs, plugins, testes
e pipeline Electron. Não aplicar `npm audit fix --force` sem essa validação.
Servidores de desenvolvimento Vite/Vitest não devem ser expostos publicamente.
Os números são um retrato da consulta; novas auditorias podem mudar o resultado.

## Pendências para o mantenedor

1. Resolver os alertas restantes das ferramentas de desenvolvimento. Auditoria
   de produção sem alertas não significa que toda a árvore esteja corrigida.
2. Ativar o relato privado de vulnerabilidades e proteger a branch principal.
   Na consulta pública, a API de
   [relato privado](https://api.github.com/repos/Atentor/WebRad/private-vulnerability-reporting)
   retornou `enabled: false`, e a da
   [branch main](https://api.github.com/repos/Atentor/WebRad/branches/main)
   retornou `protected: false`. Exigir os checks escolhidos e revisão dos
   workflows. Conferir também alertas Dependabot e secret scanning/push
   protection, cujas configurações não foram confirmadas. Os arquivos locais
   não ativam essas opções no servidor.
3. Revisar os termos das bibliotecas nativas Sharp/libvips, incluindo LGPL,
   atribuições e disponibilização do código correspondente ao redistribuir
   binários. O gerador reúne os textos disponíveis nos pacotes instalados e não
   substitui essa revisão. Conferir também a origem dos ícones/imagens e os
   créditos das mídias de teste, descritos em `THIRD_PARTY_NOTICES.md`.
4. Enviar as alterações e acompanhar os workflows, incluindo Linux/macOS.
   A API pública já identifica `Atentor/WebRad` como público; na revisão ainda
   não identificava uma licença na branch remota. A licença local não é publicada
   automaticamente.

Não foram alteradas configurações remotas, criadas tags, publicados releases,
gerados instaladores ou reescrito o histórico Git.

## Validação

- `npm.cmd run validate`: aprovado, incluindo ícones/fontes, paridade das fontes
  geradas, typecheck estrito, lint, formatação e empacotamento Windows x64.
  A suíte completa executou **1.406 testes aprovados e 29 ignorados**; os testes
  rodaram também através dos caminhos temporários vinculados do runner portátil.
- `npm.cmd run smoke:development` e `npm.cmd run smoke:packaged`: aprovados no
  Electron real 43.8.0, incluindo inicialização, edição/Monaco, F9, isolamento do
  Preview, Data Grid e API Client. Os fluxos HTTP usam servidores locais de teste,
  não uma instância de produção do RestGo. Os testes opcionais ignorados da suíte
  não são apresentados como executados por esses smokes.
- Conteúdo do pacote inspecionado: MIT idêntica à raiz, índice de terceiros,
  `LICENSES.chromium.html` e 288.233 bytes de textos de licença no `app.asar`,
  incluindo os avisos adicionais de Monaco e TypeScript.
- Quatro testes novos cobrem o gerador de avisos, incluindo texto integral,
  pacotes opcionais por plataforma, licença compartilhada do esbuild, licença
  ausente e divergência do lockfile. As regressões de compilação/deploy verificam
  também o arquivo MIT exportado e o layout final.
- Gitleaks: histórico e árvore final dos 593 arquivos destinados ao Git sem
  detecções. Actionlint 1.7.12 aprovou os workflows; o bloco Bash do scanner
  passou na checagem de sintaxe. As regras de ignore e links locais dos novos
  documentos foram conferidos.

Execução nativa Linux/macOS e os novos jobs de segurança no GitHub permanecem
pendentes de CI após o envio. A limpeza local está validada; as pendências de
dependências, redistribuição e administração do repositório continuam acima.
