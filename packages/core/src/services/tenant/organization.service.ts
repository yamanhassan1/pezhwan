/**
 * PEZHWAN — Organization service.
 *
 * Groups users/teams into organizations within a tenant.
 */

import { OrganizationModel, type OrganizationDoc } from '../../models/organization.model.ts';
import { ValidationError } from '@pezhwan/shared';

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  tenantId?: string;
  ownerUserId: string;
  settings?: Record<string, unknown>;
}

export class OrganizationService {
  async create(input: CreateOrganizationInput): Promise<OrganizationDoc> {
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new ValidationError('A valid organization name is required', 'INVALID_ORG');
    return OrganizationModel.create({
      name: input.name,
      slug,
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      settings: input.settings ?? {},
    });
  }

  async get(organizationId: string): Promise<OrganizationDoc | null> {
    return OrganizationModel.findById(organizationId);
  }

  async listByTenant(tenantId: string): Promise<OrganizationDoc[]> {
    return OrganizationModel.find({ tenantId });
  }

  async update(
    organizationId: string,
    patch: Partial<Pick<OrganizationDoc, 'name' | 'settings'>>,
  ): Promise<OrganizationDoc | null> {
    return OrganizationModel.findByIdAndUpdate(organizationId, { $set: patch }, { new: true });
  }

  async remove(organizationId: string): Promise<void> {
    await OrganizationModel.deleteOne({ _id: organizationId });
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}