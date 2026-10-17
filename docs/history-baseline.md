# Ponto inicial do histórico público

Em 17 de outubro de 2026, a `main` foi reiniciada com um único commit raiz que contém o código completo do WebRad **0.1.11**. A versão do aplicativo foi preservada: reiniciar o histórico Git não reduz a numeração usada pelos instaladores e pelo atualizador.

As branches e tags anteriores foram removidas da origem para que clones novos comecem nesse ponto. O backup anterior é privado e fica fora do repositório; não envie bundles, espelhos ou referências de recuperação para o GitHub.

## Trabalhar depois do reinício

Quem possui um clone anterior deve fazer um clone novo e criar branches a partir da nova `main`:

```sh
git clone https://github.com/Atentor/WebRad.git
cd WebRad
git switch -c minha-alteracao
```

Para reaproveitar alterações locais anteriores, transfira somente as alterações necessárias para esse clone novo e revise o diff antes do commit. Fazer merge do histórico anterior ou executar `git push --mirror` a partir de um clone antigo pode reintroduzir os commits removidos.

## Criar releases

As tags estáveis devem apontar para commits da nova `main`. Por exemplo, para publicar a próxima versão:

```sh
git switch main
git pull --ff-only
git tag -a v0.1.12 -m "WebRad 0.1.12"
git push origin v0.1.12
```

A tag define a versão compilada no GitHub Actions. Não execute `npm run release` para preparar o workflow: esse comando gera um instalador local e incrementa a versão local. A publicação por tags, os quatro destinos e o modo de verificação sem publicação estão documentados em [releases.md](releases.md).

## Limites do reinício

Reescrever a `main` e remover branches e tags não equivale a apagar todas as cópias anteriores. O GitHub mantém referências internas de pull requests que são somente leitura para usuários do repositório; fechar esses PRs não remove suas referências. Commits também podem continuar acessíveis por SHA em caches e em clones existentes. O GitHub informa que seu suporte não remove dados que não sejam sensíveis. Veja os [limites oficiais da reescrita de histórico](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

Assim, o novo histórico público da `main` começa nesse commit raiz; a indisponibilidade absoluta de todos os commits antigos no GitHub não pode ser garantida por um force push.
