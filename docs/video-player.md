# Video Player

O estilo **Default Video Player** segue Aurora: fundo em degradê Graphite/Ink, borda Sky/Lavender de 1 px, cantos de 6 px, texto branco e sombra suave. Hover aumenta a sombra; foco nos controles mostra um anel azul; desabilitado reduz a opacidade. As cores ficam vinculadas à paleta do projeto. O estilo usa `contain` e posição central para preservar o enquadramento do vídeo.

Projetos antigos que ainda não possuem esse estilo recebem a definição ao abrir, disponível para seleção em **Style** e aplicada automaticamente aos novos Video Players. Estilos e vínculos já salvos são preservados.

`Video Player` é um componente visual da paleta **Standard**. A classe `WebVideoPlayer` usa [Shaka Player 5.2.13](https://github.com/shaka-project/shaka-player/releases/tag/v5.2.13), o último release estável verificado em 12/10/2026. A aplicação exportada inclui o JavaScript, o CSS dos controles e `licenses/Shaka-Player-Apache-2.0.txt`; não depende de CDN, Electron ou Node.js.

Em **Properties → Video → Aspect ratio**, escolha `none` (padrão), `16:9` (horizontal) ou `9:16` (vertical). Uma proporção fixa calcula a altura a partir da largura responsiva do componente, tanto no Designer quanto no Preview e na aplicação exportada. Configure a largura como **Stretch** para acompanhar o espaço do container. A proporção fixa tem precedência sobre altura, limites verticais, stretch vertical e crescimento vertical; `none` restaura essas regras salvas. O ajuste do conteúdo continua sendo controlado por **Object fit**.

A mesma propriedade é tipada no código: `VideoPlayer1.aspectRatio = '16:9'` ou `this.VideoPlayer1.aspectRatio = '9:16'`. Para voltar ao dimensionamento livre, atribua `'none'`.

Adicione `VideoPlayer1` à página. Para um vídeo RestGo já convertido:

```ts
try {
  await VideoPlayer1.LoadRestGo('ID-DO-VIDEO');
  await VideoPlayer1.Play();
} catch (erro) {
  Message(erro instanceof Error ? erro.message : String(erro));
}
```

O RestGo deve estar configurado na conexão do projeto. O carregamento consulta primeiro o descritor público; quando o vídeo exige autenticação, utiliza a sessão Authentication compartilhada. Também é possível selecionar explicitamente `LoadRestGo(id, { public: true })` ou `{ public: false }`. Vídeos privados exigem login do dono; o componente não substitui a sessão por token administrativo ou token de API.

Para conectar upload e reprodução:

```ts
const arquivo = await VideoUpload1.OpenFile();
if (!arquivo) return;
const video = await VideoUpload1.SendToRestGO({ isPublic: false });
// Faça login antes do envio. Se o processamento automático estiver desabilitado,
// execute RestGO.videos.process(video.id) explicitamente.
await VideoUpload1.WaitUntilReady({ timeoutMs: 600_000 });
await this.VideoPlayer1.LoadRestGo(video.id);
await this.VideoPlayer1.Play();
```

Upload não carrega nem reproduz automaticamente. Reprodução após uma operação longa pode exigir outra interação do usuário; `Play()` retorna a rejeição de autoplay para tratamento. `autoplay` é `false` por padrão. Uma rejeição de autoplay mantém a fonte carregada, permitindo nova tentativa.

No Inspector, **Video source** permite **None (load by code)**, **RestGo video** com ID, ou **HLS / DASH URL** com manifesto HTTP(S). Edite o rascunho e clique **Apply source**; alterações são persistidas no Project Model e participam de undo/redo. Fonte persistida carrega no runtime; no Designer o componente só mostra a representação, sem solicitar playlist, segmento ou iniciar playback. URLs YouTube são rejeitadas: a proposta não inclui iframe, extração de streams ou outro provedor.

```ts
await VideoPlayer1.LoadUrl('https://cdn.exemplo.com/master.m3u8', { format: 'hls' });
await VideoPlayer1.LoadUrl('https://cdn.exemplo.com/manifest.mpd', { format: 'dash' });
```

URLs externas recebem transporte sem cookies ou credenciais RestGo. Configure URLs finais: redirecionamentos são rejeitados. Uma página HTTPS precisa de mídia HTTPS e CORS compatível.

| Propriedade                                        | Uso                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `source`                                           | `null`, `{ kind: 'restgo', videoId }` ou `{ kind: 'url', url, format }`, com formato `hls` ou `dash`. |
| `controls`                                         | Exibe os controles acessíveis e localizados do Shaka.                                                 |
| `autoplay`, `muted`, `loop`, `playsInline`         | Comportamento de reprodução; autoplay depende da política do navegador.                               |
| `volume`                                           | Valor entre 0 e 1.                                                                                    |
| `playbackRate`                                     | Número positivo.                                                                                      |
| `objectFit`, `poster`                              | Ajuste da imagem e poster opcional. Estilos do projeto também controlam object-fit/posição.           |
| `quality`                                          | `'auto'` ou qualidade numérica presente no vídeo carregado.                                           |
| `state`, `error`                                   | Estado e último erro, somente leitura.                                                                |
| `duration`, `currentTime`, `buffered`, `isPlaying` | Projeções da mídia real, somente leitura.                                                             |
| `availableQualities`, `currentQuality`             | Variantes reproduzíveis e qualidade efetiva, somente leitura.                                         |

```ts
VideoPlayer1.Pause();
VideoPlayer1.Seek(20); // Segundos dentro da duração do vídeo
VideoPlayer1.Stop(); // Pausa e volta ao início, preservando a fonte

const qualidade = VideoPlayer1.availableQualities[0];
if (qualidade) VideoPlayer1.SetQuality(qualidade.quality);
VideoPlayer1.SetQuality('auto');

await VideoPlayer1.Unload();
```

Qualidades manuais vêm das tracks reais do Shaka. No RestGo, dimensões são relacionadas à qualidade nominal do descritor, inclusive para vídeos verticais. Não são inventadas opções 1080p/1440p. O Inspector inicia com Auto; a seleção manual fica disponível no menu do player ou por `SetQuality()`. O evento informa qualidade solicitada e efetiva; o buffer e a rede podem atrasar a mudança visual. Legendas/idiomas aparecem conforme trilhas existentes; o módulo RestGo não fornece upload de legendas. Fullscreen e PiP dependem das capacidades/permissões do navegador.

Eventos tipados: `OnLoaded`, `OnPlay`, `OnPause`, `OnEnded`, `OnTimeUpdate`, `OnBuffering`, `OnQualityChange` e `OnError`. Métodos e detalhes recebem completion, hover, assinaturas e diagnósticos por `VideoPlayer1` e `this.VideoPlayer1`. Cada posicionamento reutilizável possui seu próprio elemento, player, observadores e estado.

O SDK `videos.getMedia()` valida origem e prefixo `/videos/{id}/hls/...` antes do transporte efetivo. O plugin de rede do Shaka usa essa ponte para todas as playlists e segmentos privados, incluindo Range, com JWT atual, renovação coordenada em 401, `credentials: 'omit'` e `redirect: 'error'`. URLs externas ou de outro vídeo são rejeitadas sem encaminhar credenciais; 403 encerra playback com erro. Não há cache offline persistente. Logout/troca de usuário interrompe requisições e limpa mídia/thumbnail sob controle do componente. Thumbnail privada é baixada pelo SDK como Blob, e a URL de objeto é revogada. Ausência de thumbnail (404) não impede reprodução.

A reprodução privada exige MSE/MMS. O componente rejeita ambientes sem essa capacidade e também rejeita um carregamento que termine no modo nativo `src=`; o elemento nativo não permite inserir Authorization em cada requisição. Vídeos públicos podem usar o caminho nativo compatível. Safari/iOS não foram validados neste checkout; suporte privado depende de MSE/MMS e dos codecs disponíveis. Não há fallback que publique um vídeo privado.

Troca de fonte e `Unload()` abortam a operação anterior e aguardam destruição antes de anexar outro player. `dispose()` interrompe I/O, remove eventos/filtros/observadores, revoga poster Blob e destrói overlay/player uma única vez. O overlay da versão 5.2.13 é o dono da destruição do Shaka Player. O bundle usa transmuxing local, sem depender de um worker hospedado externamente.

Validação real disponível em `tests/video-player.browser.test.ts`, ativada por `WEBRAD_BROWSER_PATH`: aplicação compilada em iframe Preview, HLS/MPEG-TS, DASH com áudio/vídeo, avanço de tempo, play/pausa/seek/fim, Auto/manual, JWT em playlists/segmentos privados, refresh, cookies omitidos, bloqueio de URI externa/redirecionamento, logout e revogação, descarte e isolamento de dois reutilizáveis. O servidor do teste reproduz o contrato RestGo e usa pequenos assets oficiais de teste do Shaka. Essa evidência não inclui conversão FFmpeg em uma instância RestGo real nem execução em Safari/Linux.
