import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  resolveRequesterProfile,
  type RequesterProfileDeps,
} from './requester-profile';

const ORG = 'org-1' as unknown as OrgId;

function fakes(over: Partial<RequesterProfileDeps> = {}) {
  const calls = {
    findCustomerByEmail: [] as string[],
    countOrdersForCustomer: [] as number[],
    countTicketsForRequester: [] as string[],
  };
  const deps: RequesterProfileDeps = {
    async findCustomerByEmail(_org, email) {
      calls.findCustomerByEmail.push(email);
      return { id: 7, displayName: 'Dana Reed', email };
    },
    async countOrdersForCustomer(_org, id) {
      calls.countOrdersForCustomer.push(id);
      return 3;
    },
    async countTicketsForRequester(_org, email) {
      calls.countTicketsForRequester.push(email);
      return 12;
    },
    ...over,
  };
  return { deps, calls };
}

test('resolves the customer row and both counts', async () => {
  const { deps, calls } = fakes();
  const profile = await resolveRequesterProfile(
    ORG,
    { name: 'Dana Reed', email: '  Dana@example.com ' },
    deps,
  );

  assert.equal(profile.name, 'Dana Reed');
  assert.equal(profile.email, 'Dana@example.com');
  assert.equal(profile.customer?.id, 7);
  assert.equal(profile.orderCount, 3);
  assert.equal(profile.ticketCount, 12);
  // The trimmed email is what reaches both collaborators.
  assert.deepEqual(calls.findCustomerByEmail, ['Dana@example.com']);
  assert.deepEqual(calls.countTicketsForRequester, ['Dana@example.com']);
  assert.deepEqual(calls.countOrdersForCustomer, [7]);
});

test('no email: keeps the name, queries nothing, invents no counts', async () => {
  const { deps, calls } = fakes();
  const profile = await resolveRequesterProfile(ORG, { name: 'Web form', email: null }, deps);

  assert.equal(profile.name, 'Web form');
  assert.equal(profile.email, null);
  assert.equal(profile.customer, null);
  // null, NEVER 0 — an unlinked requester has an UNKNOWN order count, not none.
  assert.equal(profile.orderCount, null);
  assert.equal(profile.ticketCount, null);
  assert.equal(calls.findCustomerByEmail.length, 0);
  assert.equal(calls.countTicketsForRequester.length, 0);
});

test('unmatched customer leaves orderCount null and never counts orders', async () => {
  const { deps, calls } = fakes({ async findCustomerByEmail() { return null; } });
  const profile = await resolveRequesterProfile(ORG, { name: null, email: 'x@y.z' }, deps);

  assert.equal(profile.customer, null);
  assert.equal(profile.orderCount, null);
  // Still knows how many tickets they have opened — the facts are independent.
  assert.equal(profile.ticketCount, 12);
  assert.equal(calls.countOrdersForCustomer.length, 0);
});

test('a helpdesk failure degrades that ONE fact, not the whole profile', async () => {
  const { deps } = fakes({
    async countTicketsForRequester() { throw new Error('helpdesk 503'); },
  });
  const profile = await resolveRequesterProfile(ORG, { name: 'Dana', email: 'd@e.f' }, deps);

  assert.equal(profile.ticketCount, null);
  assert.equal(profile.customer?.id, 7);
  assert.equal(profile.orderCount, 3);
  assert.equal(profile.name, 'Dana');
});

test('a customer-lookup failure does not take down the ticket count', async () => {
  const { deps } = fakes({
    async findCustomerByEmail() { throw new Error('db down'); },
  });
  const profile = await resolveRequesterProfile(ORG, { name: null, email: 'd@e.f' }, deps);

  assert.equal(profile.customer, null);
  assert.equal(profile.orderCount, null);
  assert.equal(profile.ticketCount, 12);
});

test('an order-count failure leaves the resolved customer in place', async () => {
  const { deps } = fakes({
    async countOrdersForCustomer() { throw new Error('timeout'); },
  });
  const profile = await resolveRequesterProfile(ORG, { name: null, email: 'd@e.f' }, deps);

  assert.equal(profile.customer?.id, 7);
  assert.equal(profile.orderCount, null);
});
