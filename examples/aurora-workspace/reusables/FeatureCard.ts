import { FeatureCardGenerated } from './FeatureCard.generated';

export class FeatureCard extends FeatureCardGenerated {
  public AdvanceProgress(): void {
    this.CardProgress.value = this.CardProgress.value >= 100 ? 0 : this.CardProgress.value + 10;
    this.CardStatus.caption = 'This instance: ' + this.CardProgress.value + '%';
  }
}
