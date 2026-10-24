import { bindAuroraSidebar } from '../units/AuroraSidebar';
import { PokemonGenerated } from './Pokemon.generated';

type PokemonListResult = Awaited<ReturnType<PokemonGenerated['PokeApi']['ListPokemon']['execute']>>;
type PokemonDetail = Awaited<ReturnType<PokemonGenerated['PokeApi']['GetPokemon']['execute']>>;

export class Pokemon extends PokemonGenerated {
  private demoDisposed = false;

  private offset = 0;
  private total = 0;
  private request: AbortController | undefined;
  private readonly listCache = new Map<number, PokemonListResult>();
  private readonly detailCache = new Map<string, PokemonDetail>();

  private refreshActions(): void {
    const ready = this.request === undefined;
    this.LoadPokemonButton.enabled = ready;
    this.SearchPokemonButton.enabled = ready;
    this.PokemonList.enabled = ready;
    this.PreviousPokemon.enabled = ready && this.offset > 0;
    this.NextPokemon.enabled = ready && this.offset + 12 < this.total;
  }

  public async LoadPokemon(): Promise<void> {
    await this.loadList(this.offset);
  }
  public async PreviousPage(): Promise<void> {
    await this.loadList(Math.max(0, this.offset - 12));
  }
  public async NextPage(): Promise<void> {
    if (this.offset + 12 < this.total) await this.loadList(this.offset + 12);
  }

  private async loadList(offset: number): Promise<void> {
    if (this.request || this.demoDisposed) return;
    const controller = new AbortController();
    this.request = controller;
    this.refreshActions();
    this.PokemonStatus.value = 'Loading Pokemon from PokeAPI...';
    try {
      let result = this.listCache.get(offset);
      if (!result) {
        result = await this.PokeApi.ListPokemon.execute({
          query: { limit: 12, offset },
          signal: controller.signal,
        });
        if (controller.signal.aborted || this.demoDisposed) return;
        this.listCache.set(offset, result);
      }
      this.offset = offset;
      this.total = result.count;
      this.PokemonList.items = result.results.map((pokemon) => pokemon.name);
      this.PokemonList.selectedIndex = -1;
      this.PokemonStatus.value =
        'Showing ' +
        (offset + 1) +
        '-' +
        (offset + result.results.length) +
        ' of ' +
        result.count +
        ' Pokemon. Select a name for details.';
    } catch (error) {
      if (!controller.signal.aborted && !this.demoDisposed)
        this.PokemonStatus.value =
          'PokeAPI request failed. Check your connection and try again. ' +
          (error instanceof Error ? error.message : String(error));
    } finally {
      if (this.request === controller) this.request = undefined;
      if (!this.demoDisposed) this.refreshActions();
    }
  }

  public async SelectPokemon(): Promise<void> {
    const name = this.PokemonList.value;
    if (!name) return;
    this.PokemonSearch.value = name;
    await this.FindPokemon();
  }

  public async FindPokemon(): Promise<void> {
    if (this.request || this.demoDisposed) return;
    const query = this.PokemonSearch.value.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(query)) {
      this.PokemonDetails.value = 'Enter a Pokemon name (for example pikachu) or numeric ID.';
      return;
    }
    const controller = new AbortController();
    this.request = controller;
    this.refreshActions();
    this.PokemonDetails.value = 'Loading ' + query + '...';
    try {
      let pokemon = this.detailCache.get(query);
      if (!pokemon) {
        this.PokeApi.GetPokemon.Endpoint = 'pokemon/' + encodeURIComponent(query) + '/';
        pokemon = await this.PokeApi.GetPokemon.execute({ signal: controller.signal });
        if (controller.signal.aborted || this.demoDisposed) return;
        this.detailCache.set(pokemon.name, pokemon);
        this.detailCache.set(String(pokemon.id), pokemon);
      }
      this.PokemonDetails.value =
        '#' +
        pokemon.id +
        ' ' +
        pokemon.name +
        '\nHeight: ' +
        pokemon.height / 10 +
        ' m / Weight: ' +
        pokemon.weight / 10 +
        ' kg\nBase experience: ' +
        (pokemon.base_experience ?? 'not provided');
    } catch (error) {
      if (!controller.signal.aborted && !this.demoDisposed)
        this.PokemonDetails.value =
          'Could not find this Pokemon. Check its name or ID and your connection. ' +
          (error instanceof Error ? error.message : String(error));
    } finally {
      if (this.request === controller) this.request = undefined;
      if (!this.demoDisposed) this.refreshActions();
    }
  }

  private stopAuroraSidebar: (() => void) | undefined;
  public InitializeSidebar(): void {
    this.ReleaseSidebar();
    this.stopAuroraSidebar = bindAuroraSidebar(this.Navigation, this.PageContent);
  }
  public ReleaseSidebar(): void {
    this.request?.abort();
    this.stopAuroraSidebar?.();
    this.stopAuroraSidebar = undefined;
  }
  public override dispose(): void {
    this.demoDisposed = true;
    this.ReleaseSidebar();
    super.dispose();
  }

  public OpenRestGoAccount(): void {
    Navigate('RestGoAccount');
  }
}
