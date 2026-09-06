export interface OrganizationSettings {
  timezone: string;
  digestEnabled: boolean;
  healthCheckEnabled: boolean;
}

export interface TrackerConnectionConfig {
  organizationId?: string;
  cloudOrganizationId?: string;
  enabledQueues: string[];
  enabledProjects: string[];
}

export interface Organization {
  id: string;
  name: string;
  settings: OrganizationSettings;
  trackerConnection?: TrackerConnectionConfig;
}
