import { ContractAgent } from './ContractAgent';
import { SearchCriteria, FilterOperator } from './types';

// Orchestrator Request Handler
export class OrchestratorRequestHandler {
  private contractAgent: ContractAgent;

  constructor() {
    this.contractAgent = ContractAgent.retrieveService();
  }

  // Return only the policies from recommendations
  async getPoliciesRecommendationFromProfile(profileId: string): Promise<any> {
    const criteria: SearchCriteria = {
      conditions: [
        {
          field: 'url',
          operator: FilterOperator.EQUALS,
          value: profileId,
        },
      ],
      threshold: 0,
    };

    const profiles = await this.contractAgent.findProfiles('Profile', criteria);
    if (profiles.length === 0) throw new Error('Profile not found');

    return profiles[0].recommendations.map((rec) => rec.policies);
  }

  // Return only the services from recommendations
  async getServicesRecommendationFromProfile(profileId: string): Promise<any> {
    const criteria: SearchCriteria = {
      conditions: [
        {
          field: 'url',
          operator: FilterOperator.EQUALS,
          value: profileId,
        },
      ],
      threshold: 0,
    };

    const profiles = await this.contractAgent.findProfiles('Profile', criteria);
    if (profiles.length === 0) throw new Error('Profile not found');

    return profiles[0].recommendations.map((rec) => rec.services);
  }

  // Return only the policies from matching
  async getPoliciesMatchingFromProfile(profileId: string): Promise<any> {
    const criteria: SearchCriteria = {
      conditions: [
        {
          field: 'url',
          operator: FilterOperator.EQUALS,
          value: profileId,
        },
      ],
      threshold: 0,
    };

    const profiles = await this.contractAgent.findProfiles('Profile', criteria);
    if (profiles.length === 0) throw new Error('Profile not found');

    return profiles[0].matching.map((match) => match.policies);
  }

  // Return only the services from matching
  async getServicesMatchingFromProfile(profileId: string): Promise<any> {
    const criteria: SearchCriteria = {
      conditions: [
        {
          field: 'url',
          operator: FilterOperator.EQUALS,
          value: profileId,
        },
      ],
      threshold: 0,
    };

    const profiles = await this.contractAgent.findProfiles('Profile', criteria);
    if (profiles.length === 0) throw new Error('Profile not found');

    return profiles[0].matching.map((match) => match.services);
  }
}

// Participant Request Handler
export class ParticipantRequestHandler {
  private contractAgent: ContractAgent;

  constructor() {
    this.contractAgent = ContractAgent.retrieveService();
  }

  // Return only the services from recommendations
  async getServiceRecommendationFromProfile(profileId: string): Promise<any> {
    const criteria: SearchCriteria = {
      conditions: [
        {
          field: 'url',
          operator: FilterOperator.EQUALS,
          value: profileId,
        },
      ],
      threshold: 0,
    };

    const profiles = await this.contractAgent.findProfiles('Profile', criteria);
    if (profiles.length === 0) throw new Error('Profile not found');

    return profiles[0].recommendations.map((rec) => rec.services);
  }

  // Return only the policies from matching
  async getPoliciesMatchingFromProfile(profileId: string): Promise<any> {
    const criteria: SearchCriteria = {
      conditions: [
        {
          field: 'url',
          operator: FilterOperator.EQUALS,
          value: profileId,
        },
      ],
      threshold: 0,
    };

    const profiles = await this.contractAgent.findProfiles('Profile', criteria);
    if (profiles.length === 0) throw new Error('Profile not found');

    return profiles[0].matching.map((match) => match.policies);
  }

  // Return only the ecosystemContracts from matching
  async getContractMatchingFromProfile(profileId: string): Promise<any> {
    const criteria: SearchCriteria = {
      conditions: [
        {
          field: 'url',
          operator: FilterOperator.EQUALS,
          value: profileId,
        },
      ],
      threshold: 0,
    };

    const profiles = await this.contractAgent.findProfiles('Profile', criteria);
    if (profiles.length === 0) throw new Error('Profile not found');

    return profiles[0].matching.map((match) => match.ecosystemContracts);
  }
}