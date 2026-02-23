import type { AgentCard, AgentSkill } from '@a2a-js/sdk';
import type { ExternalCardConfig } from '../types.ts';

export function filterToExternalCard(
  internalCard: AgentCard,
  config: ExternalCardConfig,
): AgentCard {
  const url = `${config.baseUrl}/a2a/jsonrpc`;

  let skills = internalCard.skills;
  if (config.skillFilter) {
    skills = skills.filter(config.skillFilter);
  }

  return {
    ...internalCard,
    url,
    skills,
  };
}
