import {
  chartSchemaChoices,
  normalizeApiClientConfiguration,
  type ChartSeriesConfiguration,
  type ComponentNode,
} from '@webrad/project-model';

export const CHART_SERIES_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#10b981'] as const;

export function chartSeriesSource(
  series: ChartSeriesConfiguration,
  components: readonly ComponentNode[],
) {
  const client = components.find(
    (node) => node.type === 'WebApiClient' && node.id === series.apiClientId,
  );
  const configuration =
    client === undefined
      ? undefined
      : normalizeApiClientConfiguration(client.props.apiClientConfig);
  const operation = configuration?.operations.find((entry) => entry.id === series.operationId);
  const choices = chartSchemaChoices(operation?.responseSchema, series.listPath);
  return { client, configuration, operation, choices };
}

export function chartSeriesIssue(
  series: ChartSeriesConfiguration,
  components: readonly ComponentNode[],
): string | null {
  if (series.name.trim() === '') return 'Enter a name for this series.';
  const { client, operation, choices } = chartSeriesSource(series, components);
  if (client === undefined) return 'Choose an available API Client.';
  if (operation === undefined) return 'Choose an available endpoint.';
  if (choices.lists.length === 0)
    return 'Save an API Client response schema containing a list to select its fields.';
  if (!choices.lists.some((entry) => entry.path === series.listPath))
    return 'Choose an available response list.';
  if (!choices.labels.some((entry) => entry.path === series.labelField))
    return 'Choose a label field from the response list.';
  if (choices.values.length === 0)
    return 'The selected list needs a numeric field for chart values.';
  if (!choices.values.some((entry) => entry.path === series.valueField))
    return 'Choose a numeric value field from the response list.';
  return null;
}
