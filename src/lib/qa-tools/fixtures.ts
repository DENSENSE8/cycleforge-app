import * as provisionerModule from '../../../scripts/provision-qa-org';

type FixtureProvisioner = {
  reseedQaFixtures: typeof import('../../../scripts/provision-qa-org').reseedQaFixtures;
};

const provisioner = ('default' in provisionerModule
  ? provisionerModule.default
  : provisionerModule) as unknown as FixtureProvisioner;

/** Server-only adapter for the idempotent QA fixture graph. */
export const reseedQaFixtures = provisioner.reseedQaFixtures;
